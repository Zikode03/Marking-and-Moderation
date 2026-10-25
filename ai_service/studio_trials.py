"""Inspect a trained research checkpoint without loading or enabling a live marker."""
import json

import torch
from fastapi import HTTPException

from ai_training.documents import render_pages
from ai_training.networks import HandwritingReader, RubricScorer, decode_ctc, encode_example, line_tensor


def completed(studio, key, kind):
    row = studio.read('runs', key)
    if row['kind'] != kind or row['status'] != 'completed':
        raise HTTPException(409, 'Choose a completed run of the matching model')
    if studio.active is not None:
        raise HTTPException(409, 'Wait for training to finish before trying a checkpoint')
    directory = studio.path('runs', key) / 'model'
    manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
    return directory, manifest, row.get('synthetic', False)


@torch.inference_mode()
def score_trial(studio, key, trial):
    directory, manifest, synthetic = completed(studio, key, 'scorer')
    config = manifest['config']
    try:
        tokens = encode_example(trial.model_dump(), config['max_tokens']).unsqueeze(0)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    values, reviews = [], []
    for index in range(config['members']):
        model = RubricScorer(config['width'], config['heads'], config['layers'], config['max_tokens']).eval()
        model.load_state_dict(torch.load(directory / f'best-{index}.pt', map_location='cpu', weights_only=True)['model'])
        score, review = model(tokens, return_review=True)
        values.append(score.item())
        reviews.append(review.item())
    mean = sum(values)/len(values)
    return {'researchOnly': True, 'synthetic': synthetic, 'suggestedMarks': mean * trial.maxMarks,
            'maxMarks': trial.maxMarks, 'reviewSignal': max(reviews),
            'ensembleSpread': (sum((value-mean)**2 for value in values)/len(values))**.5,
            'message': 'Checkpoint experiment only. This suggestion is not saved as an academic mark.'}


@torch.inference_mode()
def ocr_trial(studio, key, content, content_type):
    directory, manifest, synthetic = completed(studio, key, 'ocr')
    try:
        pages = list(render_pages(content, content_type))
        if len(pages) != 1 or content_type not in ('image/png', 'image/jpeg'):
            raise ValueError('Choose a PNG or JPEG crop containing one handwritten line')
        config = manifest['config']
        tensor = line_tensor(pages[0], config['height'], config['max_width']).unsqueeze(0)
        alphabet = json.loads((directory / 'alphabet.json').read_text(encoding='utf-8'))
        reader = HandwritingReader(len(alphabet) + 1, config['channels'], config['hidden']).eval()
        reader.load_state_dict(torch.load(directory / 'best.pt', map_location='cpu', weights_only=True)['model'])
        text, confidence = decode_ctc(reader(tensor), alphabet)[0]
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    return {'researchOnly': True, 'synthetic': synthetic, 'text': text, 'confidence': confidence,
            'message': 'Experimental transcription. Confidence is an uncalibrated model estimate; compare it with the original line.'}
