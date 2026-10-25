# Prospera model development

**Start with [START_HERE.md](START_HERE.md)** for the complete handwriting and rubric-scoring pipeline, visual labelling desk, training, evaluation, approval and service connection.

The older dependency-free text baseline below remains available for small research experiments. It is separate from the document pipeline.

# Experimental transcription scoring

A runnable, dependency-free Python neural regression baseline trained entirely
from random initialization on your own verified question-level examples. It uses
hashed Unicode words/bigrams from the question, transcribed answer and rubric,
a tanh hidden layer, and a sigmoid output predicting a fraction of available
marks. Training minimizes squared fractional mark error with stochastic gradient
descent. Validation fractional MAE selects the saved epoch; the test set is used
only after selection. Defaults are 128 input features and 16 hidden units.

This is an initial research model. It does not read handwriting, PDFs or images,
extract a question inventory, generate marking explanations, or establish
semantic correctness. It is deliberately incompatible with the live service's
`mark_files` contract. Live marking stays disabled. No weights are downloaded
and no external AI service is contacted.

## Train on verified exports

Export independently verified examples from **AI & Training**, review and
de-identify the free text, then run from the repository root using Python 3.10+:

```powershell
python -m ai_training prepare --input verified-training-examples.jsonl --output .local/training/splits-v1
python -m ai_training train --data .local/training/splits-v1 --output .local/training/run-v1 --epochs 100
python -m ai_training predict --model .local/training/run-v1 --input .local/training/splits-v1/test.jsonl
python -m unittest discover -s ai_training/tests -p test_training.py -v
```

The predict command accepts the same labelled JSONL schema for offline review;
it reports suggestions with `needsReview:true`. Scores are continuous and are
not rounded to institutional marking increments. This older baseline is CLI-only; the connected Model Studio uses the new handwriting and transformer models. Dataset preparation trusts that input comes from verified-only
exports; it cannot independently authenticate a local file's provenance.

At least ten independent connected groups are required to form 70/15/15 splits
by group count. This is only a tooling minimum. Assessments, scripts and identical
question/answer/rubric content are connected before splitting; identical content
is deduplicated and conflicting labels are rejected. Hand-edited splits are
checked again before training. Group sizes can yield different example ratios.
Keep the original test split locked for future model comparisons; repeatedly
selecting configurations against its results invalidates held-out evaluation.

Each new run saves `weights.json`, `manifest.json`, `history.json` and
`evaluation.json`. Runs and prepared directories cannot be overwritten. Reports
include raw-mark MAE/RMSE, fractional MAE, a training-mean predictor baseline,
and metrics by recorded script language (metadata, not language validation).
The manifest records seed, configuration, selected epoch and split SHA-256
hashes. Model files contain learned parameters rather than raw example text;
treat all datasets and learned artifacts as restricted research material.

Every run has `validation_approved:false` and no validated languages. No automatic
approval threshold is defined. Before deployment, independently evaluate unseen
papers by subject, language, score band and student population, investigate human
disagreements, and document academic acceptance criteria. This small lexical
model is unlikely to handle mathematical reasoning or equivalent wording well.

Next stages: collect verified scan-region/transcription pairs for a separate
handwriting model; evaluate recognition independently; then develop and evaluate
document reading, question alignment, rubric-grounded reasoning, abstention and
the live service adapter. A transcription model alone cannot mark scanned papers.
