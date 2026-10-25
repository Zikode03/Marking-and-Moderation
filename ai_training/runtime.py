"""First-party mark_files adapter. Unknown layouts abstain; all scores need review."""
import hashlib
import json
import math
from pathlib import Path

import torch

from .documents import crop_region, render_pages
from .networks import HandwritingReader, RubricScorer, decode_ctc, encode_example, line_tensor, pad_tokens
from .templates import validate_template


def verify_artifacts(directory, manifest):
    directory = Path(directory).resolve()
    artifacts = manifest.get('artifacts')
    if not isinstance(artifacts, dict) or not artifacts:
        raise ValueError('Model package has no artifact inventory')
    for relative, expected in artifacts.items():
        path = (directory / relative).resolve()
        if not path.is_relative_to(directory) or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('Model artifact checksum mismatch or path escape')


def configuration_digest(manifest):
    """Bind evaluation to inference thresholds as well as model/template bytes."""
    excluded = {'validation_approved', 'validated_languages', 'approval', 'approved_configuration_sha256'}
    payload = {key: value for key, value in manifest.items() if key not in excluded}
    payload['artifacts'] = {key: value for key, value in payload['artifacts'].items() if key not in ('release-evaluation.json', 'acceptance-policy.json')}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


class Runner:
    def __init__(self, directory, require_approval=True):
        self.directory = Path(directory)
        self.manifest = json.loads((self.directory / 'manifest.json').read_text(encoding='utf-8'))
        if self.manifest.get('kind') != 'prospera-document-pipeline-v1' or self.manifest.get('training_origin') != 'from_scratch':
            raise ValueError('Unsupported model package')
        if require_approval and self.manifest.get('validation_approved') is not True:
            raise ValueError('Model package has not been academically approved')
        verify_artifacts(self.directory, self.manifest)
        if require_approval and (self.manifest.get('approved_configuration_sha256') != configuration_digest(self.manifest)
                                 or self.manifest.get('validated_languages') != self.manifest.get('scope_languages')
                                 or not self.manifest.get('approval', {}).get('confirmed_academic_review')):
            raise ValueError('Inference configuration differs from the academically approved evaluation')
        self.templates = [validate_template(t) for t in json.loads((self.directory / 'templates.json').read_text(encoding='utf-8'))]
        self.alphabet = json.loads((self.directory / 'ocr/alphabet.json').read_text(encoding='utf-8'))
        config = self.manifest['ocr_config']
        self.reader = HandwritingReader(len(self.alphabet) + 1, config['channels'], config['hidden'])
        self.reader.load_state_dict(torch.load(self.directory / 'ocr/best.pt', map_location='cpu', weights_only=True)['model'])
        self.reader.eval()
        config = self.manifest['scorer_config']
        self.scorers = []
        for member in range(config['members']):
            model = RubricScorer(config['width'], config['heads'], config['layers'], config['max_tokens'])
            model.load_state_dict(torch.load(self.directory / f'scorer/best-{member}.pt', map_location='cpu', weights_only=True)['model'])
            self.scorers.append(model.eval())

    @torch.inference_mode()
    def read_line(self, image):
        config = self.manifest['ocr_config']
        tensor = line_tensor(image, config['height'], config['max_width'])
        return decode_ctc(self.reader(tensor.unsqueeze(0)), self.alphabet)[0]

    @torch.inference_mode()
    def score(self, question, answer):
        tokens = pad_tokens([encode_example({'question': question['question'], 'rubric': question['rubric'], 'answer': answer}, self.manifest['scorer_config']['max_tokens'])])
        outputs = [model(tokens, return_review=True) for model in self.scorers]
        values = [output[0].item() for output in outputs]
        review = max(output[1].item() for output in outputs)
        average = sum(values) / len(values)
        spread = math.sqrt(sum((v - average) ** 2 for v in values) / len(values))
        return average, spread, review

    def find_template(self, paper, memo, academic_context):
        paper_hash = hashlib.sha256(paper['content']).hexdigest()
        memo_hash = hashlib.sha256(memo['content']).hexdigest()
        matches = [t for t in self.templates if t['paperSha256'] == paper_hash and t['memoSha256'] == memo_hash
                   and all(academic_context.get(k) == v for k, v in t['academicContext'].items())]
        if len(matches) != 1:
            raise ValueError('Register exactly one reviewed layout for this paper, memorandum and academic context')
        return matches[0]

    def mark_files(self, paper, memo, script, request_id, script_language='auto', memo_language='auto', academic_context=None, marking_policy=None):
        template = self.find_template(paper, memo, academic_context or {})
        language = template['language']
        if any(code not in ('auto', language) for code in (script_language, memo_language)):
            raise ValueError('Selected language does not match the reviewed template')
        if language not in self.manifest['scope_languages']:
            raise ValueError('Language is outside this package scope')
        pages = list(render_pages(script['content'], script['content_type']))
        layout_ok = len(pages) == template['expectedPages'] and all(abs(page.width/page.height - ratio) / ratio <= .03 for page, ratio in zip(pages, template['pageAspectRatios']))
        output = []
        for question in template['questions']:
            text, confidence, annotations, reason = [], 0.0, [], ''
            score = None
            if not layout_ok:
                reason = 'Page count or page proportions differ from the reviewed answer-booklet layout. Align and review the script manually.'
            else:
                scores = []
                try:
                    for region in question['regions']:
                        transcription, certainty = self.read_line(crop_region(pages, region))
                        text.append(transcription)
                        scores.append(certainty)
                    confidence = min(scores)
                    if not all(value.strip() for value in text) or confidence < self.manifest['reading_threshold']:
                        reason = 'Blank or uncertain handwriting transcription. Verify the original; no zero mark has been assumed.'
                        annotations = [{**question['regions'][0], 'kind': 'uncertain_handwriting', 'note': 'Verify the handwritten answer and transcription before assigning marks.'}]
                    else:
                        fraction, spread, review = self.score(question, '\n'.join(text))
                        if review >= self.manifest['review_threshold']:
                            reason = 'The learned review classifier flags this answer as unsuitable for automatic scoring. Apply the approved memo manually.'
                        elif spread > self.manifest['max_ensemble_spread'] or self.manifest['validation_error_p90_fraction'] > self.manifest['max_score_error_fraction']:
                            reason = 'Scoring uncertainty exceeds the configured review limit. Apply the approved memo manually.'
                        else:
                            step = question.get('markIncrement', .5)
                            score = min(question['maxMarks'], max(0.0, round(fraction * question['maxMarks'] / step) * step))
                            reason = 'Provisional learned score from the supplied question and approved rubric. Check partial credit, equivalent wording and alternative methods against the memo.'
                except ValueError as exc:
                    reason = f'Manual review required: {exc}'
            output.append({'number': question['number'], 'maxMarks': question['maxMarks'], 'marks': score,
                           'evidence': '\n'.join(text), 'memoEvidence': question['memoEvidence'],
                           'feedback': reason, 'needsReview': True, 'detectedLanguage': language,
                           'readingConfidence': confidence, 'annotations': annotations})
        return {'needsAttention': True, 'summary': 'Provisional model output. Every question requires academic moderation. Language comes from the reviewed template; reading confidence is an uncalibrated model estimate.', 'questions': output}


def load(directory):
    """Called by PROSPERA_MODEL_MODULE=ai_training.runtime in the local service."""
    return Runner(directory, require_approval=True)
