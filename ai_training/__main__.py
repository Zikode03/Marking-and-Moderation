"""Run with python -m ai_training --help."""
import argparse
import copy
import hashlib
import json
import math
import random
from pathlib import Path
from .data import load_splits, prepare, read_rows
from .model import Model, features


def metrics(rows, predictor):
    errors = [predictor(r) - r['marks'] for r in rows]
    return {'examples': len(rows), 'mae_marks': sum(abs(e) for e in errors) / len(rows),
            'rmse_marks': math.sqrt(sum(e*e for e in errors) / len(rows)),
            'mae_fraction': sum(abs(e) / r['maxMarks'] for e, r in zip(errors, rows)) / len(rows)}


def evaluate(rows, model, baseline):
    groups = {}
    for row in rows:
        groups.setdefault(row.get('scriptLanguage', 'unspecified'), []).append(row)
    return {'model': metrics(rows, model.predict),
            'train_mean_baseline': metrics(rows, lambda r: baseline * r['maxMarks']),
            'by_script_language': {k: metrics(v, model.predict) for k, v in groups.items()}}


def train(data, output, epochs=100, rate=.1, seed=42, dimensions=128, hidden=16):
    if epochs < 1 or not math.isfinite(rate) or not 0 < rate <= 1 or not 8 <= dimensions <= 4096 or not 1 <= hidden <= 128:
        raise ValueError('Invalid training configuration')
    splits = load_splits(data)
    output = Path(output)
    if output.exists():
        raise ValueError('Choose a new run directory; existing runs are never overwritten')
    model, rng = Model(dimensions, hidden, seed), random.Random(seed)
    examples = [(features(r, dimensions), r['marks'] / r['maxMarks']) for r in splits['train']]
    baseline = sum(y for _, y in examples) / len(examples)
    best, best_state, selected_epoch, history = float('inf'), None, 0, []
    for epoch in range(1, epochs + 1):
        rng.shuffle(examples)
        for x, y in examples:
            model.step(x, y, rate)
        loss = metrics(splits['validation'], model.predict)['mae_fraction']
        history.append({'epoch': epoch, 'validation_mae_fraction': loss})
        if loss < best:
            best, best_state, selected_epoch = loss, copy.deepcopy(model.state()), epoch
    model = Model.restore(best_state)
    report = {name: evaluate(rows, model, baseline) for name, rows in splits.items()}
    config = dict(epochs=epochs, learning_rate=rate, seed=seed, dimensions=dimensions, hidden=hidden)
    manifest = {'version': 'prospera-text-baseline-v1', 'architecture': 'hashed-text-tanh-mlp-v1',
                'training_origin': 'from_scratch', 'validation_approved': False, 'validated_languages': [],
                'capability': 'experimental_transcription_score_only', 'selected_epoch': selected_epoch,
                'config': config, 'train_mean_fraction': baseline,
                'dataset_sha256': {name: hashlib.sha256((Path(data) / f'{name}.jsonl').read_bytes()).hexdigest() for name in splits}}
    output.mkdir(parents=True, exist_ok=False)
    for name, payload in (('weights', model.state()), ('manifest', manifest), ('evaluation', report), ('history', history)):
        (output / f'{name}.json').write_text(json.dumps(payload, indent=2, allow_nan=False), encoding='utf-8')
    return {'run': str(output), 'selected_epoch': selected_epoch, 'test': report['test'], 'validation_approved': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('prepare', help='Split verified JSONL exports without group leakage')
    p.add_argument('--input', nargs='+', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--seed', type=int, default=42)
    p = sub.add_parser('train', help='Train a text scoring research baseline from scratch')
    p.add_argument('--data', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--epochs', type=int, default=100)
    p.add_argument('--rate', type=float, default=.1)
    p.add_argument('--seed', type=int, default=42)
    p.add_argument('--dimensions', type=int, default=128)
    p.add_argument('--hidden', type=int, default=16)
    p = sub.add_parser('predict', help='Score labelled transcriptions for research review')
    p.add_argument('--model', required=True)
    p.add_argument('--input', required=True)
    args = parser.parse_args()
    try:
        if args.command == 'prepare':
            result = prepare(args.input, args.output, args.seed)
        elif args.command == 'train':
            result = train(args.data, args.output, args.epochs, args.rate, args.seed, args.dimensions, args.hidden)
        else:
            model = Model.restore(json.loads((Path(args.model) / 'weights.json').read_text(encoding='utf-8')))
            result = [{'questionNumber': r['questionNumber'], 'suggestedMarks': model.predict(r), 'needsReview': True} for r in read_rows(args.input)]
        print(json.dumps(result, indent=2, allow_nan=False))
    except (ValueError, OSError, KeyError) as error:
        parser.exit(2, f'{error}\n')


if __name__ == '__main__':
    main()
