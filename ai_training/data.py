"""Validate exported labels and keep connected papers/scripts in one split."""
import hashlib
import json
import math
import random
from pathlib import Path


def read_rows(path):
    rows = []
    for number, line in enumerate(Path(path).read_text(encoding='utf-8-sig').splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        if not isinstance(row, dict):
            raise ValueError(f'{path}:{number}: expected an object')
        for key in ('assessmentGroup', 'scriptGroup', 'questionNumber', 'question', 'answer', 'rubric'):
            if not isinstance(row.get(key), str) or not row[key].strip():
                raise ValueError(f'{path}:{number}: missing {key}')
        maximum, marks = row.get('maxMarks'), row.get('marks')
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (maximum, marks)) or not 0 <= marks <= maximum or maximum <= 0:
            raise ValueError(f'{path}:{number}: invalid expert mark')
        for key in ('scriptLanguage', 'memoLanguage'):
            if key in row and (not isinstance(row[key], str) or not row[key].strip()):
                raise ValueError(f'{path}:{number}: invalid {key}')
        if 'needsReview' in row and type(row['needsReview']) is not bool:
            raise ValueError(f'{path}:{number}: needsReview must be a boolean')
        rows.append(row)
    if not rows:
        raise ValueError(f'{path}: no examples')
    return rows


def content_key(row):
    return hashlib.sha256(json.dumps([row[k].strip() for k in ('question', 'answer', 'rubric')] + [row['maxMarks']], ensure_ascii=False).encode()).hexdigest()


def prepare(paths, output, seed=42):
    parents, records, labels = {}, {}, {}

    def find(key):
        parents.setdefault(key, key)
        root = key
        while parents[root] != root:
            root = parents[root]
        while parents[key] != key:
            previous = key
            key = parents[key]
            parents[previous] = root
        return root

    for path in paths:
        for row in read_rows(path):
            identity = (row['scriptGroup'], row['questionNumber'])
            signature = content_key(row)
            label = (row['marks'], row.get('needsReview', False))
            if signature in labels and labels[signature] != label:
                raise ValueError('Conflicting labels for identical content')
            labels[signature] = label
            if identity in records and any(records[identity].get(k) != row.get(k) for k in ('question', 'answer', 'rubric', 'maxMarks', 'marks', 'assessmentGroup', 'scriptLanguage', 'memoLanguage')):
                raise ValueError('Conflicting labels or metadata for script/question')
            records[identity] = row
            keys = ['a:' + row['assessmentGroup'], 's:' + row['scriptGroup'], 'c:' + signature]
            for key in keys[1:]:
                parents[find(key)] = find(keys[0])
    groups = {}
    for row in records.values():
        groups.setdefault(find('a:' + row['assessmentGroup']), []).append(row)
    if len(groups) < 10:
        raise ValueError('Need at least 10 independent content/assessment/script groups; this is a tooling minimum, not evidence of accuracy')
    keys = sorted(groups)
    random.Random(seed).shuffle(keys)
    a, b = int(len(keys) * .7), int(len(keys) * .85)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    counts = {}
    for name, selected in zip(('train', 'validation', 'test'), (keys[:a], keys[a:b], keys[b:])):
        rows = [r for key in selected for r in groups[key]]
        # Identical transcriptions count once, even if uploaded under new IDs.
        unique = {content_key(r): r for r in rows}
        (output / f'{name}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in unique.values()), encoding='utf-8')
        counts[name] = len(unique)
    (output / 'split-manifest.json').write_text(json.dumps({'seed': seed, 'groups': len(groups), 'examples': counts}, indent=2), encoding='utf-8')
    return counts


def load_splits(directory):
    splits = {name: read_rows(Path(directory) / f'{name}.jsonl') for name in ('train', 'validation', 'test')}
    seen = set()
    for rows in splits.values():
        keys = {prefix + str(value) for r in rows for prefix, value in (('a:', r['assessmentGroup']), ('s:', r['scriptGroup']), ('c:', content_key(r)))}
        if seen & keys:
            raise ValueError('Data leakage between splits: repeated assessment, script or content')
        seen.update(keys)
    return splits
