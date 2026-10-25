"""Package trained components, evaluate unseen scans and record academic approval."""
import hashlib
import json
import math
import shutil
from pathlib import Path

from .documents import content_type
from .ocr_data import recognition_metrics
from .runtime import Runner, verify_artifacts, configuration_digest
from .templates import validate_template
from .training import group_fingerprints, save_json


def artifact_digest(artifacts):
    return hashlib.sha256(json.dumps(artifacts, sort_keys=True).encode()).hexdigest()


def bundle(ocr, scorer, templates, output, reading_threshold=.85, max_ensemble_spread=.1, max_score_error_fraction=.1, review_threshold=.5):
    if not .85 <= reading_threshold <= 1 or not 0 <= max_ensemble_spread <= 1 or not 0 <= max_score_error_fraction <= 1 or not 0 < review_threshold < 1:
        raise ValueError('Invalid inference review thresholds; reading threshold must be at least 0.85')
    ocr, scorer, output = Path(ocr), Path(scorer), Path(output)
    reader_info = json.loads((ocr / 'manifest.json').read_text(encoding='utf-8'))
    scorer_info = json.loads((scorer / 'manifest.json').read_text(encoding='utf-8'))
    for info, kind in ((reader_info, 'handwriting-crnn-ctc-v1'), (scorer_info, 'rubric-transformer-v1')):
        if info.get('kind') != kind or info.get('training_origin') != 'from_scratch' or not info.get('training_complete'):
            raise ValueError('Both components must be completed from-scratch runs of the expected architecture')
    if not scorer_info.get('review_training_examples') or not scorer_info.get('scorable_training_examples'):
        raise ValueError('Scorer training must include independently reviewed needsReview:true examples and ordinary scorable examples before packaging')
    reviewed = [validate_template(json.loads(Path(path).read_text(encoding='utf-8'))) for path in templates]
    if not reviewed or len({t['id'] for t in reviewed}) != len(reviewed):
        raise ValueError('Supply uniquely named reviewed templates')
    keys = [(t['paperSha256'], t['memoSha256'], json.dumps(t['academicContext'], sort_keys=True)) for t in reviewed]
    if len(set(keys)) != len(keys):
        raise ValueError('Ambiguous templates for the same paper/memo/context')
    languages = sorted({t['language'] for t in reviewed})
    if not set(languages) <= set(reader_info['trained_languages']) & set(scorer_info['trained_languages']):
        raise ValueError('Both models need training examples for every template language')
    # Verify question + rubric size before copying anything; answers still require runtime checks.
    from .networks import encode_example
    for template in reviewed:
        for question in template['questions']:
            encode_example({**question, 'answer': 'x'}, scorer_info['config']['max_tokens'])
    output.mkdir(parents=True, exist_ok=False)
    (output / 'ocr').mkdir()
    (output / 'scorer').mkdir()
    for name in ('alphabet.json', 'best.pt', 'manifest.json', 'evaluation.json'):
        shutil.copyfile(ocr / name, output / 'ocr' / name)
    for name in ['manifest.json', 'evaluation.json'] + [f'best-{i}.pt' for i in range(scorer_info['config']['members'])]:
        shutil.copyfile(scorer / name, output / 'scorer' / name)
    save_json(output / 'templates.json', reviewed)
    artifacts = {path.relative_to(output).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(output.rglob('*')) if path.is_file()}
    manifest = {'version': output.name, 'kind': 'prospera-document-pipeline-v1', 'training_origin': 'from_scratch',
                'validation_approved': False, 'validated_languages': [], 'scope_languages': languages,
                'ocr_config': reader_info['config'], 'scorer_config': scorer_info['config'],
                'reading_threshold': reading_threshold, 'max_ensemble_spread': max_ensemble_spread,
                'review_threshold': review_threshold,
                'max_score_error_fraction': max_score_error_fraction,
                'validation_error_p90_fraction': scorer_info['validation_error_p90_fraction'],
                'fitting_groups': sorted(set(reader_info['fitting_groups']) | set(scorer_info['fitting_groups'])),
                'fitting_documents': reader_info['fitting_documents'], 'artifacts': artifacts}
    save_json(output / 'manifest.json', manifest)
    return {'package': str(output), 'validation_approved': False, 'languages': languages}


def evaluate_bundle(directory, dataset, output):
    runner = Runner(directory, require_approval=False)
    dataset = Path(dataset).resolve()
    records = [json.loads(line) for line in dataset.read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    if not records:
        raise ValueError('No held-out evaluation scripts')
    fitting = set(runner.manifest['fitting_groups'])
    used, outcomes = set(), []
    for row in records:
        if fitting & set(group_fingerprints([row])):
            raise ValueError('Evaluation contains a fitting paper/script group')
        if not isinstance(row.get('verifiedBy'), str) or not row['verifiedBy'].strip():
            raise ValueError('Evaluation requires independently adjudicated expected answers')
        files = {}
        for field in ('paper', 'memo', 'script'):
            path = (dataset.parent / row[field]).resolve()
            if not path.is_relative_to(dataset.parent):
                raise ValueError('Evaluation paths must stay inside the dataset directory')
            files[field] = {'content': path.read_bytes(), 'content_type': content_type(path)}
        digest = hashlib.sha256(files['script']['content']).hexdigest()
        if digest in runner.manifest['fitting_documents'] or digest in used:
            raise ValueError('Evaluation reuses a fitting or duplicate scan')
        used.add(digest)
        template = runner.find_template(files['paper'], files['memo'], row['academicContext'])
        language = template['language']
        result = runner.mark_files(**files, request_id='held-out-evaluation', script_language=language,
                                   memo_language=language, academic_context=row['academicContext'])
        expected_rows = row['questions']
        if len({q['number'] for q in expected_rows}) != len(expected_rows):
            raise ValueError('Duplicate expected question')
        expected = {q['number']: q for q in expected_rows}
        if set(expected) != {q['number'] for q in result['questions']}:
            raise ValueError('Evaluation must adjudicate every template question')
        pairs, errors, readable, unreadable, false_scores, attacks, scored_attacks = [], [], 0, 0, 0, 0, 0
        for question in result['questions']:
            label = expected[question['number']]
            attack = label.get('adversarial', False)
            if type(attack) is not bool or type(label.get('unreadable', False)) is not bool:
                raise ValueError('Unreadable and adversarial labels must be booleans')
            if attack:
                attacks += 1
                scored_attacks += question['marks'] is not None
            if label.get('unreadable', False):
                unreadable += 1
                false_scores += question['marks'] is not None
                continue
            text, marks = label.get('text'), label.get('marks')
            if not isinstance(text, str) or not text.strip() or type(marks) not in (int, float) or not math.isfinite(marks) or not 0 <= marks <= question['maxMarks']:
                raise ValueError('Readable answers need an adjudicated transcription and valid expert mark')
            readable += 1
            pairs.append((text, question['evidence']))
            if question['marks'] is not None:
                errors.append(abs(question['marks'] - marks) / question['maxMarks'])
        outcomes.append({'language': language, 'pairs': pairs, 'errors': errors, 'readable': readable,
                         'unreadable': unreadable, 'false_scores': false_scores, 'attacks': attacks, 'scored_attacks': scored_attacks})
    languages = {}
    for language in sorted({row['language'] for row in outcomes}):
        selected = [row for row in outcomes if row['language'] == language]
        pairs = [pair for row in selected for pair in row['pairs']]
        errors = [error for row in selected for error in row['errors']]
        readable = sum(r['readable'] for r in selected)
        languages[language] = {'scripts': len(selected), 'readable_questions': readable,
                               'scored_questions': len(errors), 'scored_coverage': len(errors)/max(1, readable),
                               'mae_fraction': sum(errors)/len(errors) if errors else None,
                               'ocr': recognition_metrics(pairs),
                               'unreadable_questions': sum(r['unreadable'] for r in selected),
                               'unreadable_scored': sum(r['false_scores'] for r in selected),
                               'adversarial_questions': sum(r['attacks'] for r in selected),
                               'adversarial_scored': sum(r['scored_attacks'] for r in selected)}
    report = {'package_artifact_digest': artifact_digest(runner.manifest['artifacts']),
              'configuration_sha256': configuration_digest(runner.manifest),
              'dataset_sha256': hashlib.sha256(dataset.read_bytes()).hexdigest(),
              'script_sha256': sorted(used), 'languages': languages, 'validation_approved': False}
    if Path(output).exists():
        raise ValueError('Choose a new evaluation output file')
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    save_json(output, report)
    return report


def approve(directory, evaluation, policy, reviewer, confirm=False):
    if not confirm or not reviewer.strip():
        raise ValueError('Academic reviewer must explicitly confirm review with --confirm-academic-review')
    directory = Path(directory)
    manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
    verify_artifacts(directory, manifest)
    report = json.loads(Path(evaluation).read_text(encoding='utf-8'))
    policy = json.loads(Path(policy).read_text(encoding='utf-8'))
    if report['package_artifact_digest'] != artifact_digest(manifest['artifacts']):
        raise ValueError('Evaluation belongs to different model artifacts')
    if report.get('configuration_sha256') != configuration_digest(manifest):
        raise ValueError('Inference configuration changed since evaluation')
    for field in ('max_cer', 'max_mae_fraction', 'min_scored_coverage'):
        if type(policy.get(field)) not in (int, float) or not math.isfinite(policy[field]) or not 0 <= policy[field] <= 1:
            raise ValueError('Academic policy must specify error and coverage thresholds between 0 and 1')
    if policy['min_scored_coverage'] <= 0:
        raise ValueError('Policy must require nonzero scoring coverage')
    for field in ('min_scripts_per_language', 'min_unreadable_questions', 'min_adversarial_questions'):
        if type(policy.get(field)) is not int or policy[field] < 1:
            raise ValueError('Academic policy must require scripts, unreadable examples and adversarial examples')
    if set(report['languages']) != set(manifest['scope_languages']):
        raise ValueError('Evaluate every language in the package scope')
    for language, scores in report['languages'].items():
        if (scores['scripts'] < policy['min_scripts_per_language'] or scores['unreadable_questions'] < policy['min_unreadable_questions']
            or scores['adversarial_questions'] < policy['min_adversarial_questions'] or scores['unreadable_scored'] or scores['adversarial_scored']
            or scores['mae_fraction'] is None or scores['mae_fraction'] > policy['max_mae_fraction']
            or scores['ocr']['character_error_rate'] > policy['max_cer'] or scores['scored_coverage'] < policy['min_scored_coverage']):
            raise ValueError(f'Academic acceptance policy is not met for {language}')
    save_json(directory / 'release-evaluation.json', report)
    save_json(directory / 'acceptance-policy.json', policy)
    for name in ('release-evaluation.json', 'acceptance-policy.json'):
        manifest['artifacts'][name] = hashlib.sha256((directory / name).read_bytes()).hexdigest()
    manifest.update(validation_approved=True, validated_languages=manifest['scope_languages'],
                    approved_configuration_sha256=report['configuration_sha256'],
                    approval={'reviewer': reviewer.strip(), 'confirmed_academic_review': True})
    save_json(directory / 'manifest.json', manifest)
    return {'package': str(directory), 'validation_approved': True, 'languages': manifest['validated_languages']}
