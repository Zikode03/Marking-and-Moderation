"""Train, resume and evaluate first-party OCR and rubric-scoring models."""
import hashlib
import json
import math
import os
import platform
import random
from pathlib import Path

import torch
from PIL import Image
from torch import nn

from .data import load_splits
from .networks import HandwritingReader, RubricScorer, collate_lines, decode_ctc, encode_example, line_tensor, pad_tokens
from .ocr_data import load_ocr_splits, recognition_metrics


def save_json(path, payload):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    os.replace(temporary, path)


def save_checkpoint(path, payload):
    temporary = Path(path).with_suffix('.tmp')
    torch.save(payload, temporary)
    os.replace(temporary, path)


def seed_all(seed):
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def device_for(name):
    if name == 'auto':
        return torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    if name not in ('cpu', 'cuda'):
        raise ValueError('Choose cpu, cuda or auto')
    if name == 'cuda' and not torch.cuda.is_available():
        raise ValueError('CUDA is unavailable in this Python environment')
    return torch.device(name)


def batches(items, batch_size, seed):
    indices = list(range(len(items)))
    random.Random(seed).shuffle(indices)
    for start in range(0, len(indices), batch_size):
        yield [items[index] for index in indices[start:start + batch_size]]


def hashes(directory):
    return {name: hashlib.sha256((Path(directory) / f'{name}.jsonl').read_bytes()).hexdigest() for name in ('train', 'validation', 'test')}


def group_fingerprints(rows):
    return sorted({hashlib.sha256((prefix + str(row[field]).lower()).encode()).hexdigest()
                   for row in rows for prefix, field in (('a:', 'assessmentGroup'), ('s:', 'scriptGroup'))})


def initialize_run(output, kind, config, fingerprints, resume):
    output = Path(output)
    if resume:
        manifest = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
        if manifest['kind'] != kind or manifest['config'] != config or manifest['dataset_sha256'] != fingerprints:
            raise ValueError('Resume requires identical architecture, configuration and dataset; use a new run for changes')
        if manifest.get('training_complete'):
            raise ValueError('This run is complete; start a new run')
    else:
        output.mkdir(parents=True, exist_ok=False)
        manifest = {'version': output.name, 'kind': kind, 'config': config, 'dataset_sha256': fingerprints,
                    'training_origin': 'from_scratch', 'validation_approved': False,
                    'validated_languages': [], 'training_complete': False,
                    'environment': {'python': platform.python_version(), 'torch': str(torch.__version__), 'cuda': torch.version.cuda}}
        save_json(output / 'manifest.json', manifest)
    return output, manifest


def mark_metrics(rows, fractions, baseline):
    scorable = [(row, value) for row, value in zip(rows, fractions) if not row.get('needsReview', False)]
    rows, fractions = [item[0] for item in scorable], [item[1] for item in scorable]
    if not rows:
        return {'model': {'examples': 0, 'mae_fraction': None}, 'train_mean_baseline': {'examples': 0, 'mae_fraction': None}, 'by_script_language': {}}
    def measure(values):
        errors = [value - row['marks'] / row['maxMarks'] for row, value in zip(rows, values)]
        raw = [error * row['maxMarks'] for error, row in zip(errors, rows)]
        return {'examples': len(rows), 'mae_fraction': sum(map(abs, errors)) / len(rows),
                'mae_marks': sum(map(abs, raw)) / len(rows),
                'rmse_marks': math.sqrt(sum(e*e for e in raw) / len(rows)),
                'within_half_mark': sum(abs(e) <= .5 for e in raw) / len(rows)}
    by_language = {}
    for language in sorted({r.get('scriptLanguage', 'unspecified') for r in rows}):
        selected = [(r, f) for r, f in zip(rows, fractions) if r.get('scriptLanguage', 'unspecified') == language]
        by_language[language] = {'examples': len(selected), 'mae_fraction': sum(abs(f - r['marks']/r['maxMarks']) for r, f in selected) / len(selected)}
    return {'model': measure(fractions), 'train_mean_baseline': measure([baseline] * len(rows)), 'by_script_language': by_language}


@torch.inference_mode()
def score_predictions(models, rows, config, device, return_review=False):
    for model in models:
        model.eval()
    predictions = []
    for start in range(0, len(rows), config['batch_size']):
        tokens = pad_tokens([encode_example(r, config['max_tokens']) for r in rows[start:start + config['batch_size']]]).to(device)
        members = torch.stack([model(tokens, return_review=True)[1] if return_review else model(tokens) for model in models])
        predictions.extend(members.mean(0).cpu().tolist())
    return predictions


def train_scorer(data, output, epochs=20, batch_size=8, rate=.0003, seed=42,
                 width=96, heads=4, layers=2, max_tokens=2048, members=3, device='auto', resume=False):
    if not 1 <= epochs <= 100000 or not 1 <= batch_size <= 512 or not 0 < rate <= 1 or not math.isfinite(rate):
        raise ValueError('Invalid training configuration')
    if not 8 <= width <= 512 or not 1 <= heads <= 16 or width % heads or width % 2 or not 1 <= layers <= 12 or not 32 <= max_tokens <= 8192 or not 2 <= members <= 8:
        raise ValueError('Invalid scorer architecture; use at least two ensemble members')
    config = dict(epochs=epochs, batch_size=batch_size, rate=rate, seed=seed, width=width,
                  heads=heads, layers=layers, max_tokens=max_tokens, members=members)
    splits = load_splits(data)
    if any(not any(not row.get('needsReview', False) for row in rows) for rows in splits.values()):
        raise ValueError('Each scorer split needs ordinary scorable examples as well as any abstention labels')
    encoded = {name: [encode_example(r, max_tokens) for r in rows] for name, rows in splits.items()}
    output, manifest = initialize_run(output, 'rubric-transformer-v1', config, hashes(data), resume)
    device = device_for(device)
    ordinary = [r for r in splits['train'] if not r.get('needsReview', False)]
    baseline = sum(r['marks']/r['maxMarks'] for r in ordinary) / len(ordinary)
    for member in range(members):
        seed_all(seed + member)
        model = RubricScorer(width, heads, layers, max_tokens).to(device)
        optimizer = torch.optim.AdamW(model.parameters(), lr=rate)
        last, best = output / f'last-{member}.pt', output / f'best-{member}.pt'
        start, best_loss, history = 0, float('inf'), []
        if resume and last.exists():
            checkpoint = torch.load(last, map_location=device, weights_only=True)
            model.load_state_dict(checkpoint['model'])
            optimizer.load_state_dict(checkpoint['optimizer'])
            start, best_loss, history = checkpoint['epoch'], checkpoint['best_loss'], checkpoint['history']
        for epoch in range(start + 1, epochs + 1):
            seed_all(seed + member * 100000 + epoch)
            model.train()
            losses = []
            for indices in batches(list(range(len(splits['train']))), batch_size, seed + epoch):
                tokens = pad_tokens([encoded['train'][i] for i in indices]).to(device)
                labels = torch.tensor([splits['train'][i]['marks']/splits['train'][i]['maxMarks'] for i in indices], device=device)
                optimizer.zero_grad(set_to_none=True)
                review_labels = torch.tensor([float(splits['train'][i].get('needsReview', False)) for i in indices], device=device)
                fractions, review = model(tokens, return_review=True)
                # Unscorable examples teach abstention without teaching an arbitrary mark.
                score_loss = (((fractions - labels) ** 2) * (1 - review_labels)).sum() / (1 - review_labels).sum().clamp_min(1)
                loss = score_loss + .25 * nn.functional.binary_cross_entropy(review, review_labels)
                if not torch.isfinite(loss):
                    raise ValueError('Non-finite scorer loss; inspect labels and learning rate')
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                losses.append(loss.item())
            predictions = score_predictions([model], splits['validation'], config, device)
            value = mark_metrics(splits['validation'], predictions, baseline)['model']['mae_fraction']
            review_predictions = score_predictions([model], splits['validation'], config, device, return_review=True)
            review_loss = sum(-math.log(max(1e-7, min(1 - 1e-7, p if row.get('needsReview', False) else 1-p))) for row, p in zip(splits['validation'], review_predictions)) / len(review_predictions)
            objective = value + .25 * review_loss
            if objective < best_loss:
                best_loss = objective
                save_checkpoint(best, {'model': model.state_dict(), 'epoch': epoch})
            progress = {'member': member, 'epoch': epoch, 'train_loss': sum(losses)/len(losses), 'validation_mae_fraction': value, 'validation_objective': objective}
            history.append(progress)
            save_checkpoint(last, {'model': model.state_dict(), 'optimizer': optimizer.state_dict(), 'epoch': epoch, 'best_loss': best_loss, 'history': history})
            save_json(output / f'history-{member}.json', history)
            print(json.dumps(progress), flush=True)
    models = []
    for member in range(members):
        model = RubricScorer(width, heads, layers, max_tokens).to(device)
        model.load_state_dict(torch.load(output / f'best-{member}.pt', map_location=device, weights_only=True)['model'])
        models.append(model.eval())
    report = {}
    for name, rows in splits.items():
        predicted = score_predictions(models, rows, config, device)
        report[name] = mark_metrics(rows, predicted, baseline)
        review = score_predictions(models, rows, config, device, return_review=True)
        positives = [value for row, value in zip(rows, review) if row.get('needsReview', False)]
        negatives = [value for row, value in zip(rows, review) if not row.get('needsReview', False)]
        report[name]['abstention'] = {'review_examples': len(positives), 'scorable_examples': len(negatives),
                                    'review_recall_at_half': sum(v >= .5 for v in positives)/len(positives) if positives else None,
                                    'false_review_rate_at_half': sum(v >= .5 for v in negatives)/len(negatives) if negatives else None}
        if name == 'validation':
            residuals = sorted(abs(value - row['marks']/row['maxMarks']) for row, value in zip(rows, predicted) if not row.get('needsReview', False))
            # Empirical bound, not a distribution-free coverage guarantee.
            manifest['validation_error_p90_fraction'] = residuals[min(len(residuals)-1, math.ceil(.9 * len(residuals))-1)]
    save_json(output / 'evaluation.json', report)
    manifest.update(training_complete=True, trained_languages=sorted({r.get('scriptLanguage', 'unspecified') for r in splits['train']}),
                    review_training_examples=sum(r.get('needsReview', False) for r in splits['train']),
                    scorable_training_examples=sum(not r.get('needsReview', False) for r in splits['train']),
                    fitting_groups=group_fingerprints(splits['train'] + splits['validation']))
    save_json(output / 'manifest.json', manifest)
    return {'run': str(output), 'test': report['test'], 'validation_approved': False}


def ocr_items(rows, root, alphabet, config):
    lookup = {character: index + 1 for index, character in enumerate(alphabet)}
    items = []
    for row in rows:
        if any(character not in lookup for character in row['text']):
            raise ValueError('A held-out transcription contains characters absent from the training alphabet; collect training examples covering them')
        with Image.open(Path(root) / row['image']) as image:
            tensor = line_tensor(image, config['height'], config['max_width'])
        label = torch.tensor([lookup[c] for c in row['text']], dtype=torch.long)
        collate_lines([(tensor, label)])  # Fail early for impossible CTC alignments.
        items.append((tensor, label))
    return items


@torch.inference_mode()
def evaluate_ocr(model, rows, items, alphabet, batch_size, device):
    model.eval()
    predicted = []
    for start in range(0, len(items), batch_size):
        images, _, lengths, _ = collate_lines(items[start:start + batch_size])
        predicted.extend(decode_ctc(model(images.to(device), lengths), alphabet, lengths.tolist()))
    pairs = [(r['text'], p[0]) for r, p in zip(rows, predicted)]
    report = recognition_metrics(pairs)
    report['by_language'] = {language: recognition_metrics([pair for r, pair in zip(rows, pairs) if r['language'] == language]) for language in sorted({r['language'] for r in rows})}
    report['confidence_slices'] = []
    for threshold in (.5, .7, .85, .9, .95):
        accepted = [pair for pair, p in zip(pairs, predicted) if p[0] and p[1] >= threshold]
        report['confidence_slices'].append({'threshold': threshold, 'coverage': len(accepted)/len(rows), **recognition_metrics(accepted)})
    return report


def train_ocr(data, output, epochs=30, batch_size=8, rate=.001, seed=42,
              height=48, max_width=1600, channels=32, hidden=96, device='auto', resume=False):
    if not 1 <= epochs <= 100000 or not 1 <= batch_size <= 512 or not math.isfinite(rate) or not 0 < rate <= 1 or height < 16 or height > 128 or height % 4 or not 32 <= max_width <= 8192 or not 4 <= channels <= 128 or not 8 <= hidden <= 512:
        raise ValueError('Invalid OCR training configuration')
    config = dict(epochs=epochs, batch_size=batch_size, rate=rate, seed=seed, height=height,
                  max_width=max_width, channels=channels, hidden=hidden)
    splits = load_ocr_splits(data)
    alphabet = ''.join(sorted({c for r in splits['train'] for c in r['text']}))
    items = {name: ocr_items(rows, data, alphabet, config) for name, rows in splits.items()}
    output, manifest = initialize_run(output, 'handwriting-crnn-ctc-v1', config, hashes(data), resume)
    save_json(output / 'alphabet.json', alphabet)
    device = device_for(device)
    seed_all(seed)
    model = HandwritingReader(len(alphabet) + 1, channels, hidden).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=rate)
    criterion = nn.CTCLoss(blank=0, zero_infinity=False)
    start, best_loss, history = 0, float('inf'), []
    if resume and (output / 'last.pt').exists():
        checkpoint = torch.load(output / 'last.pt', map_location=device, weights_only=True)
        model.load_state_dict(checkpoint['model'])
        optimizer.load_state_dict(checkpoint['optimizer'])
        start, best_loss, history = checkpoint['epoch'], checkpoint['best_loss'], checkpoint['history']
    for epoch in range(start + 1, epochs + 1):
        seed_all(seed + epoch)
        model.train()
        losses = []
        for batch in batches(items['train'], batch_size, seed + epoch):
            images, targets, lengths, target_lengths = collate_lines(batch)
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(images.to(device), lengths), targets.to(device), lengths, target_lengths)
            if not torch.isfinite(loss):
                raise ValueError('Non-finite CTC loss; inspect line crops and transcriptions')
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optimizer.step()
            losses.append(loss.item())
        report = evaluate_ocr(model, splits['validation'], items['validation'], alphabet, batch_size, device)
        value = report['character_error_rate']
        if value < best_loss:
            best_loss = value
            save_checkpoint(output / 'best.pt', {'model': model.state_dict(), 'epoch': epoch})
        progress = {'epoch': epoch, 'train_ctc_loss': sum(losses)/len(losses), 'validation_cer': value}
        history.append(progress)
        save_checkpoint(output / 'last.pt', {'model': model.state_dict(), 'optimizer': optimizer.state_dict(), 'epoch': epoch, 'best_loss': best_loss, 'history': history})
        save_json(output / 'history.json', history)
        print(json.dumps(progress), flush=True)
    model.load_state_dict(torch.load(output / 'best.pt', map_location=device, weights_only=True)['model'])
    report = {name: evaluate_ocr(model, rows, items[name], alphabet, batch_size, device) for name, rows in splits.items()}
    save_json(output / 'evaluation.json', report)
    manifest.update(training_complete=True, trained_languages=sorted({r['language'] for r in splits['train']}),
                    fitting_groups=group_fingerprints(splits['train'] + splits['validation']),
                    fitting_documents=sorted({r['sourceHash'] for r in splits['train'] + splits['validation']}))
    save_json(output / 'manifest.json', manifest)
    return {'run': str(output), 'test': report['test'], 'validation_approved': False}
