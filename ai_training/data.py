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
        preparation = row.get('preparation') or {}
        if not isinstance(preparation, dict):
            raise ValueError(f'{path}:{number}: invalid preparation metadata')
        if preparation.get('sourceMarked') and (preparation.get('learnerWritingOnly') is not True or not preparation.get('datasetScope') or not preparation.get('preparationNotes')):
            raise ValueError(f'{path}:{number}: marked scripts need verified annotation handling and academic scope')
        rows.append(row)
    if not rows:
        raise ValueError(f'{path}: no examples')
    return rows


def academic_scope(row):
    school, institution = row.get('school'), row.get('institution')
    if isinstance(school, dict):
        return json.dumps(['school', school.get('grade'), school.get('subject'), school.get('pathway'), row.get('scriptLanguage'), row.get('memoLanguage')], sort_keys=True)
    if isinstance(institution, dict):
        return json.dumps(['institution', institution.get('moduleId'), (row.get('preparation') or {}).get('datasetScope'), row.get('scriptLanguage'), row.get('memoLanguage')], sort_keys=True)
    return None


def content_key(row):
    return hashlib.sha256(json.dumps([row[k].strip() for k in ('question', 'answer', 'rubric')] + [row['maxMarks']], ensure_ascii=False).encode()).hexdigest()


def prepare(paths, output, seed=42):
    parents, records, labels = {}, {}, {}
    scopes = set()
    contexts = set()

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
            context = academic_scope(row)
            if context:
                contexts.add(context)
            if len(contexts) > 1:
                raise ValueError('Prepare separate datasets for different grades, subjects, modules or languages')
            preparation = row.get('preparation') or {}
            if preparation.get('datasetScope'):
                scopes.add(preparation['datasetScope'].strip().casefold())
            if len(scopes) > 1:
                raise ValueError('Prepare separate datasets for different academic scopes')
            identity = (row['scriptGroup'], row['questionNumber'])
            signature = content_key(row)
            label = (row['marks'], row.get('needsReview', False))
            if signature in labels and labels[signature] != label:
                raise ValueError('Conflicting labels for identical content')
            labels[signature] = label
            if identity in records and any(records[identity].get(k) != row.get(k) for k in ('question', 'answer', 'rubric', 'maxMarks', 'marks', 'assessmentGroup', 'scriptLanguage', 'memoLanguage', 'preparation')):
                raise ValueError('Conflicting labels or metadata for script/question')
            records[identity] = row
            keys = ['a:' + row['assessmentGroup'], 's:' + row['scriptGroup'], 'c:' + signature]
            if preparation.get('learnerGroup'):
                keys.append('l:' + preparation['learnerGroup'])
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
    (output / 'split-manifest.json').write_text(json.dumps({'seed': seed, 'groups': len(groups), 'examples': counts, 'academicScopes': sorted(scopes)}, indent=2), encoding='utf-8')
    return counts


def load_splits(directory):
    splits = {name: read_rows(Path(directory) / f'{name}.jsonl') for name in ('train', 'validation', 'test')}
    contexts = {academic_scope(r) for rows in splits.values() for r in rows if academic_scope(r)}
    if len(contexts) > 1:
        raise ValueError('Separate academic scopes must not share a training run')
    scopes = {(r.get('preparation') or {}).get('datasetScope', '').strip().casefold() for rows in splits.values() for r in rows if (r.get('preparation') or {}).get('datasetScope')}
    if len(scopes) > 1:
        raise ValueError('Separate academic scopes must not share a training run')
    seen = set()
    for rows in splits.values():
        keys = {prefix + str(value) for r in rows for prefix, value in (('a:', r['assessmentGroup']), ('s:', r['scriptGroup']), ('c:', content_key(r)), ('l:', (r.get('preparation') or {}).get('learnerGroup'))) if value is not None}
        if seen & keys:
            raise ValueError('Data leakage between splits: repeated assessment, script or content')
        seen.update(keys)
    return splits
