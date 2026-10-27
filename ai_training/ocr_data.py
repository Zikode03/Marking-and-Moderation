"""Verified line-region dataset preparation with image/script/paper grouping."""
import hashlib
import io
import json
import random
import unicodedata
from pathlib import Path

from .documents import content_type, crop_region, render_pages

LANGUAGES = {'af', 'en', 'nr', 'nso', 'st', 'ss', 'tn', 'ts', 've', 'xh', 'zu'}


def prepare_ocr(paths, output, seed=42):
    records, images, parents, labels = [], {}, {}, {}

    def find(key):
        parents.setdefault(key, key)
        root = key
        while parents[root] != root:
            root = parents[root]
        while parents[key] != key:
            previous, key = key, parents[key]
            parents[previous] = root
        return root

    for source in paths:
        source = Path(source).resolve()
        for index, line in enumerate(source.read_text(encoding='utf-8-sig').splitlines(), 1):
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get('sourceMarked') and row.get('learnerWritingOnly') is not True:
                raise ValueError('Marked-script crops must exclude teacher annotations')
            for field in ('assessmentGroup', 'scriptGroup', 'document', 'text', 'language', 'labelledBy', 'verifiedBy'):
                if not isinstance(row.get(field), str) or not row[field].strip():
                    raise ValueError(f'{source.name}:{index}: missing {field}')
            if row['verifiedBy'].strip().casefold() == row['labelledBy'].strip().casefold():
                raise ValueError('A different reviewer must verify every handwriting transcription')
            if row['language'] not in LANGUAGES or '\n' in row['text'] or '\r' in row['text']:
                raise ValueError('Use a declared language and a single handwritten line per region')
            document = (source.parent / row['document']).resolve()
            if not document.is_relative_to(source.parent):
                raise ValueError('Document paths must stay within the label-file directory')
            content = document.read_bytes()
            if row.get('documentSha256') != hashlib.sha256(content).hexdigest():
                raise ValueError('Original page checksum differs from the verified label; re-review the exact file')
            image = crop_region(list(render_pages(content, content_type(document))), row['region'])
            stream = io.BytesIO()
            image.save(stream, format='PNG')
            pixels = stream.getvalue()
            digest = hashlib.sha256(pixels).hexdigest()
            text = unicodedata.normalize('NFC', row['text'])
            if digest in labels and labels[digest] != (text, row['language']):
                raise ValueError('Conflicting transcription/language for the same image region')
            labels[digest] = text, row['language']
            images[digest] = pixels
            record = {'assessmentGroup': row['assessmentGroup'], 'scriptGroup': row['scriptGroup'],
                      'sourceHash': hashlib.sha256(content).hexdigest(), 'imageHash': digest,
                      'image': 'images/' + digest + '.png', 'text': text, 'language': row['language']}
            keys = ['a:' + record['assessmentGroup'], 's:' + record['scriptGroup'], 'd:' + record['sourceHash'], 'i:' + digest]
            for key in keys[1:]:
                parents[find(key)] = find(keys[0])
            records.append(record)
    groups = {}
    for record in records:
        groups.setdefault(find('a:' + record['assessmentGroup']), {})[record['imageHash']] = record
    if len(groups) < 10:
        raise ValueError('Need at least 10 independent paper/script/image groups; this is a tooling minimum only')
    keys = sorted(groups)
    random.Random(seed).shuffle(keys)
    a, b = int(.7 * len(keys)), int(.85 * len(keys))
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    (output / 'images').mkdir()
    for digest, pixels in images.items():
        (output / 'images' / f'{digest}.png').write_bytes(pixels)
    counts = {}
    for name, chosen in zip(('train', 'validation', 'test'), (keys[:a], keys[a:b], keys[b:])):
        rows = [r for key in chosen for r in groups[key].values()]
        (output / f'{name}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows), encoding='utf-8')
        counts[name] = len(rows)
    (output / 'split-manifest.json').write_text(json.dumps({'seed': seed, 'examples': counts, 'groups': len(groups)}, indent=2), encoding='utf-8')
    return counts


def load_ocr_splits(directory):
    root, seen, splits = Path(directory).resolve(), set(), {}
    for name in ('train', 'validation', 'test'):
        rows = [json.loads(line) for line in (root / f'{name}.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
        if not rows:
            raise ValueError('Every OCR split must contain examples')
        keys = set()
        for row in rows:
            image = (root / row['image']).resolve()
            if not image.is_relative_to(root) or hashlib.sha256(image.read_bytes()).hexdigest() != row['imageHash']:
                raise ValueError('Image path escapes dataset or image checksum changed')
            if not isinstance(row['text'], str) or not row['text'].strip() or row['language'] not in LANGUAGES:
                raise ValueError('Invalid OCR label')
            keys.update(prefix + row[field] for prefix, field in (('a:', 'assessmentGroup'), ('s:', 'scriptGroup'), ('d:', 'sourceHash'), ('i:', 'imageHash')))
        if seen & keys:
            raise ValueError('OCR split leakage detected')
        seen.update(keys)
        splits[name] = rows
    return splits


def edit_distance(left, right):
    previous = list(range(len(right) + 1))
    for i, a in enumerate(left, 1):
        current = [i]
        for j, b in enumerate(right, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j-1] + (a != b)))
        previous = current
    return previous[-1]


def recognition_metrics(predictions):
    characters = words = char_errors = word_errors = exact = 0
    for expected, predicted in predictions:
        characters += len(expected)
        words += len(expected.split())
        char_errors += edit_distance(expected, predicted)
        word_errors += edit_distance(expected.split(), predicted.split())
        exact += expected == predicted
    return {'examples': len(predictions), 'character_error_rate': char_errors / max(1, characters),
            'word_error_rate': word_errors / max(1, words), 'exact_line_accuracy': exact / max(1, len(predictions))}
