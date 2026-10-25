"""Staff-reviewed assessment inventory, tied to exact paper/memo file hashes."""
import hashlib
import json
import math
from pathlib import Path

from .documents import validate_region
from .ocr_data import LANGUAGES


def validate_template(template):
    for field in ('id', 'paperSha256', 'memoSha256', 'reviewedBy'):
        if not isinstance(template.get(field), str) or not template[field].strip():
            raise ValueError(f'Template requires {field}')
    for field in ('paperSha256', 'memoSha256'):
        if len(template[field]) != 64 or any(c not in '0123456789abcdef' for c in template[field]):
            raise ValueError('Invalid document SHA-256')
    if template.get('language') not in LANGUAGES:
        raise ValueError('Template needs one explicit written language')
    if not isinstance(template.get('academicContext'), dict) or not template['academicContext']:
        raise ValueError('Template needs the matching academic context fields')
    if type(template.get('expectedPages')) is not int or not 1 <= template['expectedPages'] <= 100:
        raise ValueError('Template requires expectedPages from the script answer booklet')
    ratios = template.get('pageAspectRatios')
    if not isinstance(ratios, list) or len(ratios) != template['expectedPages'] or any(type(r) not in (float, int) or not math.isfinite(r) or not .1 <= r <= 10 for r in ratios):
        raise ValueError('Declare an aspect ratio (width/height) for each expected script page')
    questions = template.get('questions')
    if not isinstance(questions, list) or not 1 <= len(questions) <= 300:
        raise ValueError('Template requires the complete question inventory')
    seen = set()
    for question in questions:
        for field in ('number', 'question', 'rubric', 'memoEvidence'):
            if not isinstance(question.get(field), str) or not question[field].strip():
                raise ValueError(f'Question requires {field}')
        key = question['number'].strip().casefold()
        if key in seen:
            raise ValueError('Duplicate question number')
        seen.add(key)
        maximum = question.get('maxMarks')
        if type(maximum) not in (int, float) or not math.isfinite(maximum) or not 0 < maximum <= 1000:
            raise ValueError('Invalid maximum mark')
        increment = question.get('markIncrement', .5)
        if type(increment) not in (int, float) or not math.isfinite(increment) or increment <= 0 or increment > maximum:
            raise ValueError('Invalid mark increment')
        regions = question.get('regions')
        if not isinstance(regions, list) or not 1 <= len(regions) <= 200:
            raise ValueError('Label each answer line in reading order')
        for region in regions:
            validate_region(region)
            if region['page'] > template['expectedPages']:
                raise ValueError('Template region refers to a nonexistent page')
    return template


def register_template(specification, paper, memo, output):
    template = json.loads(Path(specification).read_text(encoding='utf-8'))
    template['paperSha256'] = hashlib.sha256(Path(paper).read_bytes()).hexdigest()
    template['memoSha256'] = hashlib.sha256(Path(memo).read_bytes()).hexdigest()
    validate_template(template)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x', encoding='utf-8') as stream:
        json.dump(template, stream, ensure_ascii=False, indent=2)
    return {'template': str(output), 'questions': len(template['questions'])}
