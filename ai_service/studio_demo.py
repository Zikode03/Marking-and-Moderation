"""Clearly fictional samples for demonstrating the actual local training controls."""
import hashlib
import io
import json
from uuid import uuid4

from PIL import Image, ImageDraw


def make_demo(studio, kind):
    from .studio import now
    row = {'id': str(uuid4()), 'name': 'Fictional walkthrough data', 'kind': kind, 'createdAt': now(),
           'status': 'preparing', 'examples': 0, 'groups': 0, 'reviewExamples': 0, 'splits': None,
           'synthetic': True, 'message': 'Fictional samples for checking training controls, not academic accuracy.'}
    directory = studio.path('datasets', row['id']) / 'source'
    directory.mkdir(parents=True)
    records = []
    for index in range(16):
        group = {'assessmentGroup': f'fictional-paper-{index}', 'scriptGroup': f'fictional-script-{index}'}
        if kind == 'scorer':
            records.append({**group, 'questionNumber': '1', 'question': f'Fictional practice question {index}: identify the method.',
                            'answer': 'A valid method' if index % 2 else 'An incomplete method', 'rubric': 'Credit a correct method, then the result.',
                            'maxMarks': 10, 'marks': 8 if index % 2 else 3, 'scriptLanguage': 'en', 'needsReview': index % 4 == 0})
        else:
            image = Image.new('RGB', (128, 32), 'white')
            drawing = ImageDraw.Draw(image)
            drawing.text((10, 8), 'a', fill='black')
            drawing.point((100 + index, 20), fill=(index, 0, 0))
            stream = io.BytesIO()
            image.save(stream, format='PNG')
            content = stream.getvalue()
            filename = f'fictional-page-{index}.png'
            (directory / filename).write_bytes(content)
            records.append({**group, 'document': filename, 'documentSha256': hashlib.sha256(content).hexdigest(),
                            'region': {'page': 1, 'x': 0, 'y': 0, 'width': 1, 'height': 1}, 'text': 'a', 'language': 'en',
                            'labelledBy': 'fictional-author', 'verifiedBy': 'fictional-reviewer'})
    (directory / 'labels.jsonl').write_text(''.join(json.dumps(record) + '\n' for record in records), encoding='utf-8')
    studio.write('datasets', row)
    studio.prepare(row)
    return studio.read('datasets', row['id'])
