"""Fictional fixtures verify mechanics and failure paths, never model accuracy."""
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import torch
from PIL import Image, ImageDraw

from ai_training.bundle import approve, bundle, evaluate_bundle
from ai_training.documents import crop_region, render_pages, validate_region
from ai_training.networks import HandwritingReader, RubricScorer, collate_lines, decode_ctc, encode_example, line_tensor
from ai_training.ocr_data import prepare_ocr, load_ocr_splits, recognition_metrics
from ai_training.runtime import Runner, load, verify_artifacts
from ai_training.templates import register_template, validate_template
from ai_training.training import train_ocr, train_scorer, save_json
from ai_training.data import prepare

torch.set_num_threads(1)


def image_bytes(index=0):
    image = Image.new('RGB', (128, 32), 'white')
    draw = ImageDraw.Draw(image)
    draw.text((10, 8), 'a', fill='black')
    draw.point((100 + index % 20, 20), fill=(index % 255, 0, 0))
    output = io.BytesIO()
    image.save(output, format='PNG')
    return output.getvalue()


REGION = dict(page=1, x=0, y=0, width=1, height=1)


def specification():
    return dict(id='fictional-test-template', reviewedBy='fixture-reviewer', language='en', academicContext={'school': {'grade': 10}},
                expectedPages=1, pageAspectRatios=[4], questions=[dict(number='1', question='Q', rubric='Credit a', memoEvidence='Credit a', maxMarks=10, regions=[REGION])])


def document(content):
    return dict(content=content, content_type='image/png')


class NetworkTests(unittest.TestCase):
    def test_reader_ctc_gradient_and_decode(self):
        reader = HandwritingReader(3, channels=4, hidden=8)
        images, targets, lengths, target_lengths = collate_lines([(line_tensor(Image.open(io.BytesIO(image_bytes())), height=16), torch.tensor([1]))])
        output = reader(images, lengths)
        loss = torch.nn.CTCLoss()(output, targets, lengths, target_lengths)
        self.assertTrue(torch.isfinite(loss))
        loss.backward()
        self.assertTrue(any(p.grad is not None and p.grad.abs().sum() > 0 for p in reader.parameters()))
        logits = torch.full((5, 1, 3), -20.0)
        for i, token in enumerate([1, 1, 0, 1, 2]):
            logits[i, 0, token] = 0
        self.assertEqual(decode_ctc(logits.log_softmax(2), 'ab')[0][0], 'aab')
        with self.assertRaisesRegex(ValueError, 'cannot align'):
            collate_lines([(torch.zeros(1, 16, 16), torch.tensor([1, 1, 1]))])

    def test_scorer_uses_unicode_bytes_and_refuses_truncation(self):
        row = dict(question='Umbuzo?', answer='é ∑ isiZulu', rubric='Give method credit')
        tokens = encode_example(row, 128)
        model = RubricScorer(width=8, heads=2, layers=1, max_tokens=128)
        prediction = model(tokens.unsqueeze(0))
        self.assertTrue(0 < prediction.item() < 1)
        prediction.sum().backward()
        self.assertIsNotNone(model.embedding.weight.grad)
        _, review = model(tokens.unsqueeze(0), return_review=True)
        torch.nn.functional.binary_cross_entropy(review, torch.ones_like(review)).backward()
        self.assertGreater(model.review_output[1].weight.grad.abs().sum().item(), 0)
        with self.assertRaisesRegex(ValueError, 'never silently truncate'):
            encode_example(row, 5)

    def test_document_orientation_crop_bounds_and_metrics(self):
        pages = list(render_pages(image_bytes(), 'image/png'))
        self.assertEqual(crop_region(pages, REGION).size, (128, 32))
        with self.assertRaises(ValueError):
            validate_region(dict(REGION, width=2))
        with self.assertRaises(ValueError):
            crop_region(pages, dict(REGION, page=2))
        with self.assertRaises(ValueError):
            list(render_pages(image_bytes(), 'application/pdf'))
        measured = recognition_metrics([('cat dog', 'cat dig')])
        self.assertAlmostEqual(measured['character_error_rate'], 1/7)
        self.assertEqual(measured['word_error_rate'], .5)


class RuntimeTests(unittest.TestCase):
    def runner(self):
        runner = Runner.__new__(Runner)
        template = specification()
        template.update(paperSha256=hashlib.sha256(b'paper').hexdigest(), memoSha256=hashlib.sha256(b'memo').hexdigest())
        runner.templates = [validate_template(template)]
        runner.manifest = dict(scope_languages=['en'], reading_threshold=.85, max_ensemble_spread=.1,
                               validation_error_p90_fraction=.05, max_score_error_fraction=.1, review_threshold=.5)
        runner.read_line = lambda image: ('a', .99)
        runner.score = lambda question, answer: (.7, .01, .1)
        return runner

    def mark(self, runner, **changes):
        args = dict(paper=document(b'paper'), memo=document(b'memo'), script=document(image_bytes()),
                    request_id='test', academic_context={'school': {'grade': 10}})
        args.update(changes)
        return runner.mark_files(**args)

    def test_provisional_marks_and_memo_evidence(self):
        result = self.mark(self.runner())
        from ai_service.main import Result
        Result.model_validate(result)
        self.assertTrue(result['needsAttention'])
        self.assertTrue(result['questions'][0]['needsReview'])
        self.assertEqual(result['questions'][0]['marks'], 7)
        self.assertEqual(result['questions'][0]['memoEvidence'], 'Credit a')

    def test_blank_low_confidence_disagreement_and_layout_abstain(self):
        for text, confidence in [('', 1), ('a', .2)]:
            runner = self.runner()
            runner.read_line = lambda image: (text, confidence)
            q = self.mark(runner)['questions'][0]
            self.assertIsNone(q['marks'])
            self.assertEqual(q['annotations'][0]['kind'], 'uncertain_handwriting')
        runner = self.runner()
        runner.score = lambda q, a: (.7, .4, .1)
        self.assertIsNone(self.mark(runner)['questions'][0]['marks'])
        runner.score = lambda q, a: (.7, .01, .9)
        self.assertIsNone(self.mark(runner)['questions'][0]['marks'])
        runner = self.runner()
        runner.templates[0]['expectedPages'] = 2
        self.assertIsNone(self.mark(runner)['questions'][0]['marks'])

    def test_changed_memo_context_or_language_cannot_select_template(self):
        for kwargs in (dict(memo=document(b'changed')), dict(academic_context={'school': {'grade': 9}}), dict(script_language='zu')):
            with self.assertRaises(ValueError):
                self.mark(self.runner(), **kwargs)


class FullPipelineTests(unittest.TestCase):
    def test_training_packaging_and_unapproved_service_gate(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            handwriting, text = [], []
            for index in range(12):
                pixels = image_bytes(index)
                (root / f'line-{index}.png').write_bytes(pixels)
                handwriting.append(dict(assessmentGroup=f'paper-{index}', scriptGroup=f'script-{index}',
                    document=f'line-{index}.png', documentSha256=hashlib.sha256(pixels).hexdigest(), region=REGION,
                    text='a', language='en', labelledBy='author', verifiedBy='reviewer'))
                text.append(dict(assessmentGroup=f'paper-{index}', scriptGroup=f'script-{index}', questionNumber='1',
                    question=f'Q {index}', answer='a', rubric='Credit a', maxMarks=10, marks=7, scriptLanguage='en', needsReview=index % 3 == 0))
            (root / 'ocr.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in handwriting))
            prepare_ocr([root / 'ocr.jsonl'], root / 'ocr-data')
            self.assertEqual(sum(map(len, load_ocr_splits(root / 'ocr-data').values())), 12)
            (root / 'text.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in text))
            prepare([root / 'text.jsonl'], root / 'text-data')
            train_ocr(root / 'ocr-data', root / 'ocr', epochs=1, height=16, channels=4, hidden=8, batch_size=4, device='cpu')
            train_scorer(root / 'text-data', root / 'scorer', epochs=1, width=8, heads=2, layers=1, max_tokens=128, members=2, batch_size=4, device='cpu')
            with self.assertRaisesRegex(ValueError, 'complete'):
                train_ocr(root / 'ocr-data', root / 'ocr', epochs=1, height=16, channels=4, hidden=8, batch_size=4, device='cpu', resume=True)
            # Simulate an interruption after checkpoint/evaluation and before completion was recorded.
            manifest = json.loads((root / 'ocr/manifest.json').read_text())
            manifest['training_complete'] = False
            save_json(root / 'ocr/manifest.json', manifest)
            train_ocr(root / 'ocr-data', root / 'ocr', epochs=1, height=16, channels=4, hidden=8, batch_size=4, device='cpu', resume=True)
            save_json(root / 'specification.json', specification())
            (root / 'paper.png').write_bytes(image_bytes(30))
            (root / 'memo.png').write_bytes(image_bytes(31))
            register_template(root / 'specification.json', root / 'paper.png', root / 'memo.png', root / 'template.json')
            bundle(root / 'ocr', root / 'scorer', [root / 'template.json'], root / 'package')
            with self.assertRaisesRegex(ValueError, 'approved'):
                load(root / 'package')
            runner = Runner(root / 'package', require_approval=False)
            result = runner.mark_files(paper=document(image_bytes(30)), memo=document(image_bytes(31)),
                        script=document(image_bytes(32)), request_id='smoke', academic_context={'school': {'grade': 10}})
            self.assertTrue(result['questions'][0]['needsReview'])
            (root / 'heldout.png').write_bytes(image_bytes(32))
            evaluation = dict(assessmentGroup='unseen-paper', scriptGroup='unseen-script', paper='paper.png', memo='memo.png',
                script='heldout.png', academicContext={'school': {'grade': 10}}, verifiedBy='adjudicator', questions=[dict(number='1', text='a', marks=7)])
            (root / 'heldout.jsonl').write_text(json.dumps(evaluation)+'\n')
            report = evaluate_bundle(root / 'package', root / 'heldout.jsonl', root / 'report.json')
            self.assertEqual(report['languages']['en']['scripts'], 1)
            save_json(root / 'policy.json', dict(max_cer=.1, max_mae_fraction=.1, min_scored_coverage=.5,
                       min_scripts_per_language=10, min_unreadable_questions=1, min_adversarial_questions=1))
            with self.assertRaisesRegex(ValueError, 'explicitly confirm'):
                approve(root / 'package', root / 'report.json', root / 'policy.json', 'reviewer')
            with self.assertRaisesRegex(ValueError, 'not met'):
                approve(root / 'package', root / 'report.json', root / 'policy.json', 'reviewer', confirm=True)
            package_manifest = json.loads((root / 'package/manifest.json').read_text())
            package_manifest['max_ensemble_spread'] = .2
            save_json(root / 'package/manifest.json', package_manifest)
            with self.assertRaisesRegex(ValueError, 'configuration changed'):
                approve(root / 'package', root / 'report.json', root / 'policy.json', 'reviewer', confirm=True)
            # Editing files invalidates package integrity checks.
            (root / 'package/templates.json').write_text('[]')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                verify_artifacts(root / 'package', runner.manifest)

    def test_label_verification_paths_and_image_integrity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            pixels = image_bytes()
            (root / 'line.png').write_bytes(pixels)
            row = dict(assessmentGroup='a', scriptGroup='s', document='line.png', documentSha256=hashlib.sha256(pixels).hexdigest(), region=REGION,
                       text='a', language='en', labelledBy='same', verifiedBy='same')
            source = root / 'labels.jsonl'
            source.write_text(json.dumps(row))
            with self.assertRaisesRegex(ValueError, 'different reviewer'):
                prepare_ocr([source], root / 'output')
            row.update(verifiedBy='other', document='../escape.png')
            source.write_text(json.dumps(row))
            with self.assertRaisesRegex(ValueError, 'within'):
                prepare_ocr([source], root / 'output')
            row.update(document='line.png', documentSha256='wrong')
            source.write_text(json.dumps(row))
            with self.assertRaisesRegex(ValueError, 'checksum'):
                prepare_ocr([source], root / 'output')


if __name__ == '__main__':
    unittest.main()
