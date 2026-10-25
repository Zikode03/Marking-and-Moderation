"""Trainable CRNN/CTC reader and byte-level transformer rubric scorer.

All parameters are randomly initialized. No model hub or pretrained tokenizer.
"""
import math
import torch
from torch import nn


class HandwritingReader(nn.Module):
    def __init__(self, classes, channels=32, hidden=96):
        super().__init__()
        self.cnn = nn.Sequential(
            nn.Conv2d(1, channels, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(channels, channels * 2, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(channels * 2, channels * 2, 3, padding=1), nn.ReLU())
        self.sequence = nn.LSTM(channels * 2, hidden, num_layers=2, bidirectional=True, batch_first=True, dropout=.1)
        self.output = nn.Linear(hidden * 2, classes)

    def forward(self, images, lengths=None):
        # Collapse height, preserve horizontal reading order. Input is one line.
        features = self.cnn(images).mean(dim=2).transpose(1, 2)
        if lengths is not None:
            packed = nn.utils.rnn.pack_padded_sequence(features, lengths.cpu(), batch_first=True, enforce_sorted=False)
            sequence, _ = self.sequence(packed)
            sequence, _ = nn.utils.rnn.pad_packed_sequence(sequence, batch_first=True, total_length=features.shape[1])
        else:
            sequence, _ = self.sequence(features)
        return self.output(sequence).log_softmax(dim=-1).transpose(0, 1)


class RubricScorer(nn.Module):
    def __init__(self, width=96, heads=4, layers=2, max_tokens=2048):
        super().__init__()
        if width % heads:
            raise ValueError('Scorer width must be divisible by attention heads')
        self.max_tokens = max_tokens
        # PAD=0, field boundaries=1..3, byte tokens=4..259.
        self.embedding = nn.Embedding(260, width, padding_idx=0)
        position = torch.arange(max_tokens).unsqueeze(1)
        frequency = torch.exp(torch.arange(0, width, 2) * (-math.log(10000.0) / width))
        encoding = torch.zeros(max_tokens, width)
        encoding[:, 0::2] = torch.sin(position * frequency)
        encoding[:, 1::2] = torch.cos(position * frequency)
        self.register_buffer('positions', encoding)
        layer = nn.TransformerEncoderLayer(width, heads, width * 4, dropout=.1, batch_first=True, norm_first=True)
        self.encoder = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.output = nn.Sequential(nn.LayerNorm(width), nn.Linear(width, 1), nn.Sigmoid())
        self.review_output = nn.Sequential(nn.LayerNorm(width), nn.Linear(width, 1), nn.Sigmoid())

    def forward(self, tokens, return_review=False):
        mask = tokens.eq(0)
        if tokens.shape[1] > self.max_tokens:
            raise ValueError('Question/answer/rubric exceeds model token limit')
        values = self.embedding(tokens) + self.positions[:tokens.shape[1]]
        encoded = self.encoder(values, src_key_padding_mask=mask)
        pooled = (encoded * (~mask).unsqueeze(-1)).sum(1) / (~mask).sum(1, keepdim=True).clamp_min(1)
        scores = self.output(pooled).squeeze(-1)
        if return_review:
            return scores, self.review_output(pooled).squeeze(-1)
        return scores


def encode_example(row, max_tokens):
    tokens = []
    for index, field in enumerate(('question', 'answer', 'rubric'), 1):
        value = row.get(field)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f'Missing {field}')
        tokens.append(index)
        tokens.extend(byte + 4 for byte in value.encode('utf-8'))
    if len(tokens) > max_tokens:
        raise ValueError('Question/answer/rubric exceeds token limit; increase --max-tokens, never silently truncate the memo')
    return torch.tensor(tokens, dtype=torch.long)


def pad_tokens(rows):
    return nn.utils.rnn.pad_sequence(rows, batch_first=True, padding_value=0)


def line_tensor(image, height=48, max_width=1600):
    from PIL import ImageOps
    image = ImageOps.grayscale(image)
    width = max(16, round(image.width * height / image.height))
    if width > max_width:
        raise ValueError('Line is too wide: label shorter line regions or increase max width')
    image = image.resize((width, height))
    # White page -> 0, dark strokes -> positive values.
    values = torch.tensor(list(image.tobytes()), dtype=torch.float32).view(height, width)
    return (1 - values / 255).unsqueeze(0)


def collate_lines(items):
    images, labels = zip(*items)
    width = max(image.shape[2] for image in images)
    batch = torch.zeros(len(images), 1, images[0].shape[1], width)
    for index, image in enumerate(images):
        batch[index, :, :, :image.shape[2]] = image
    lengths = torch.tensor([image.shape[2] // 4 for image in images], dtype=torch.long)
    target_lengths = torch.tensor([len(label) for label in labels], dtype=torch.long)
    targets = torch.cat(labels)
    # CTC needs an extra time step for each repeated adjacent character.
    for length, label in zip(lengths.tolist(), labels):
        needed = len(label) + sum(a == b for a, b in zip(label.tolist(), label.tolist()[1:]))
        if needed > length:
            raise ValueError('Transcription cannot align to this line width; split it or use a higher-resolution region')
    return batch, targets, lengths, target_lengths


def decode_ctc(log_probs, alphabet, lengths=None):
    probabilities, indices = log_probs.detach().cpu().exp().max(dim=2)
    results = []
    for column in range(indices.shape[1]):
        limit = lengths[column] if lengths is not None else indices.shape[0]
        text, confidence, previous = [], [], 0
        for token, score in zip(indices[:limit, column].tolist(), probabilities[:limit, column].tolist()):
            if token and token != previous:
                text.append(alphabet[token - 1])
                confidence.append(score)
            previous = token
        # This raw confidence is NOT calibrated accuracy.
        results.append((''.join(text), sum(confidence) / len(confidence) if confidence else 0.0))
    return results
