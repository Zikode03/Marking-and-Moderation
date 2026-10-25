import json
import tempfile
import unittest
from pathlib import Path

from ai_training.__main__ import train
from ai_training.data import load_splits, prepare, read_rows
from ai_training.model import Model, features


def fixture():
    # Fictional data tests the machinery, not academic accuracy.
    return [dict(assessmentGroup=f'paper-{i}', scriptGroup=f'script-{i}',
                 questionNumber='1', question=f'Fictional question {i}',
                 answer='correct method' if i % 2 else 'incorrect method',
                 rubric='Credit correct method', maxMarks=10, marks=9 if i % 2 else 1,
                 scriptLanguage='en') for i in range(20)]


def write(path, rows):
    path.write_text(''.join(json.dumps(r) + '\n' for r in rows), encoding='utf-8')


class TrainingTests(unittest.TestCase):
    def test_gradient_learns_and_checkpoint_roundtrips(self):
        row = fixture()[1]
        model = Model(32, 8)
        before = abs(model.predict(row) - 9)
        x = features(row, 32)
        for _ in range(300):
            model.step(x, .9, .2)
        self.assertLess(abs(model.predict(row) - 9), before / 5)
        restored = Model.restore(json.loads(json.dumps(model.state())))
        self.assertEqual(model.predict(row), restored.predict(row))
        self.assertEqual(features(row, 32), features(row, 32))

    def test_reproducible_end_to_end_run_and_gates(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write(root / 'source.jsonl', fixture())
            prepare([root / 'source.jsonl'], root / 'data')
            splits = load_splits(root / 'data')
            self.assertEqual(sum(map(len, splits.values())), 20)
            for run in ('run1', 'run2'):
                train(root / 'data', root / run, epochs=8, dimensions=32, hidden=4)
            for name in ('weights', 'evaluation', 'manifest', 'history'):
                self.assertEqual((root / 'run1' / f'{name}.json').read_bytes(), (root / 'run2' / f'{name}.json').read_bytes())
            manifest = json.loads((root / 'run1/manifest.json').read_text())
            self.assertFalse(manifest['validation_approved'])
            self.assertEqual(manifest['validated_languages'], [])
            self.assertNotIn('correct method', (root / 'run1/weights.json').read_text())
            with self.assertRaisesRegex(ValueError, 'never overwritten'):
                train(root / 'data', root / 'run1')
            report = json.loads((root / 'run1/evaluation.json').read_text())
            self.assertIn('train_mean_baseline', report['test'])
            self.assertIn('en', report['test']['by_script_language'])

    def test_detects_manual_split_leakage(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ('train', 'validation', 'test'):
                write(root / f'{name}.jsonl', [fixture()[0]])
            with self.assertRaisesRegex(ValueError, 'leakage'):
                load_splits(root)

    def test_duplicate_content_and_connected_groups_stay_together(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            rows = fixture()
            rows.append(dict(rows[0], assessmentGroup='reupload', scriptGroup='other'))
            rows.append(dict(rows[1], scriptGroup='script-0', questionNumber='2'))
            write(root / 'source', rows)
            prepare([root / 'source'], root / 'data')
            splits = load_splits(root / 'data')
            containing = [name for name, group in splits.items() if any(r['assessmentGroup'] in ('paper-0', 'paper-1', 'reupload') for r in group)]
            self.assertEqual(len(containing), 1)

    def test_conflicts_invalid_labels_and_tiny_datasets_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'source'
            for bad in (True, float('nan'), -1, 11):
                write(source, [dict(fixture()[0], marks=bad)])
                with self.assertRaises(ValueError):
                    read_rows(source)
            write(source, [fixture()[0], dict(fixture()[0], marks=2)])
            with self.assertRaisesRegex(ValueError, 'Conflicting'):
                prepare([source], Path(temp) / 'data')
            write(source, [fixture()[0]])
            with self.assertRaisesRegex(ValueError, '10 independent'):
                prepare([source], Path(temp) / 'data')


if __name__ == '__main__':
    unittest.main()
