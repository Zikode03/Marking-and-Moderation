"""Small one-hidden-layer neural regressor, initialized and trained from scratch.

Uses deterministic hashed Unicode word/bigram features. This research baseline
cannot read scans or reliably judge semantic equivalence or mathematical proofs.
Only Python's standard library is required; no pretrained weights are used.
"""
import hashlib
import math
import random
import re


def features(row, dimensions):
    values = [0.0] * dimensions
    for field in ('question', 'answer', 'rubric'):
        tokens = re.findall(r'\w+|[^\w\s]', row[field].casefold())
        terms = tokens + [' '.join(pair) for pair in zip(tokens, tokens[1:])]
        for term in terms:
            digest = hashlib.blake2b((field + ':' + term).encode(), digest_size=8).digest()
            index = int.from_bytes(digest[:4], 'little') % dimensions
            values[index] += 1 if digest[4] & 1 else -1
    norm = math.sqrt(sum(x*x for x in values)) or 1
    return [x / norm for x in values]


class Model:
    def __init__(self, dimensions=128, hidden=16, seed=42):
        rng = random.Random(seed)
        self.dimensions = dimensions
        self.w = [[rng.gauss(0, 1 / math.sqrt(dimensions)) for _ in range(dimensions)] for _ in range(hidden)]
        self.b = [0.0] * hidden
        self.v = [rng.gauss(0, 1 / math.sqrt(hidden)) for _ in range(hidden)]
        self.bias = 0.0

    def forward(self, x):
        h = [math.tanh(sum(a*b for a, b in zip(w, x)) + bias) for w, bias in zip(self.w, self.b)]
        z = max(-40, min(40, sum(a*b for a, b in zip(h, self.v)) + self.bias))
        return 1 / (1 + math.exp(-z)), h

    def predict(self, row):
        return self.forward(features(row, self.dimensions))[0] * row['maxMarks']

    def step(self, x, target, rate):
        prediction, h = self.forward(x)
        delta = 2 * (prediction - target) * prediction * (1 - prediction)
        for j in range(len(h)):
            inner = delta * self.v[j] * (1 - h[j] ** 2)
            self.v[j] -= rate * delta * h[j]
            self.b[j] -= rate * inner
            for k, value in enumerate(x):
                self.w[j][k] -= rate * inner * value
        self.bias -= rate * delta

    def state(self):
        return dict(dimensions=self.dimensions, w=self.w, b=self.b, v=self.v, bias=self.bias)

    @classmethod
    def restore(cls, state):
        model = cls(state['dimensions'], len(state['b']))
        for key in ('w', 'b', 'v', 'bias'):
            setattr(model, key, state[key])
        return model
