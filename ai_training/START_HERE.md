# Train your Prospera models

**Prefer a visual workflow?** Open the connected [Model Studio](STUDIO.md) with
`./Start-TrainingStudio.ps1`, then visit `http://localhost:5173/training`.
You can import datasets, start/stop/resume training, watch actual epoch metrics,
and try research checkpoints directly in the frontend. The CLI below remains
available for advanced runs and later academic deployment.

The development now includes a handwriting reader, rubric-conditioned text
scorer, visual labelling desk, checkpointed training, independent evaluation,
model packaging and the application's file-marking adapter. Both networks
start with random weights. You supply verified examples and run the training.
No pretrained model, paid AI provider or hosted inference API is used.

**Initial supported workflow:** fixed answer-booklet layouts with staff-reviewed
questions and line regions. Different page counts/proportions are rejected for
manual review. Unconstrained essays written anywhere on arbitrary pages, automatic
question discovery, mathematical two-dimensional notation recognition and
automatic scan registration are not implemented. A matching page shape does not
prove alignment: staff must check that scripts use the reviewed layout and that
the regions capture all working. Every suggested mark still requires moderation.

## 1. Environment

From the repository root in PowerShell:

```powershell
python -m venv .local/model-venv
.local/model-venv/Scripts/python -m pip install -r ai_service/requirements.txt
.local/model-venv/Scripts/python -m ai_training.pipeline --help
```

The environment in this workspace has already been created and tested. Training
can run on CPU; `--device auto` uses CUDA when installed and available. Install
the appropriate official PyTorch CUDA build if you want GPU training. Do not
recreate the environment while a job is running. No training jobs run on upload.

## 2. Prepare the two datasets

**Text scoring:** use the existing application to capture question text, accurate
answer transcriptions, approved rubrics and expert marks. A different academic
reviewer verifies them. Export verified JSONL from each batch and collect the
exports under a restricted local dataset directory. Representative examples need
correct and incorrect reasoning, partial credit, equivalent wording and valid
alternative methods, not just full-mark answers. The scorer learns from those
examples; its architecture does not guarantee reasoning correctness.

During independent dataset review, add `"needsReview": true` to supplementary
text examples that must be withheld from automatic scoring (for example readable
attempts to override the rubric, ambiguous rubric coverage or unresolvable
answers). Retain their independently adjudicated expert marks. Ordinary examples
default to `false`. This optional local dataset field trains a separate abstention
classifier; its positive examples do not train the score regression head. Existing
application exports do not yet collect that field, so curate it independently in
the exported JSONL. The dataset preparation tool rejects conflicting flags for
identical content. A package requires both withheld and ordinary examples in its
training split, and each split needs ordinary examples for mark evaluation.
This flag means **withhold a model mark**, which is stricter than the runtime's
routine moderation requirement for all provisional suggestions.

**Handwriting:** render each script to images, then open the offline labelling
desk. Use a different output folder per script, retaining de-identified script
and paper group identifiers. Keep the page images beside the exported JSONL.

```powershell
.local/model-venv/Scripts/python -m ai_training.pipeline render --input .local/dataset/script.pdf --output .local/dataset/script-pages
.local/model-venv/Scripts/python -m ai_training.pipeline labeler --output .local/dataset/labeler.html
```

Open `labeler.html` in your browser. Select a PNG/JPEG page, drag a rectangle
around **one handwritten line**, enter its exact transcription, written language,
paper/script groups and author identifier, then add the label. Export all labels.
The second reviewer imports those labels, selects each record, loads its exact
original page, compares the highlighted region with the transcription, enters
a different reviewer identifier and verifies it. Export the verified labels.
Local reviewer declarations are not authenticated account signatures. No data
is uploaded by this tool, and unsaved work is lost when its tab closes.

Keep all pages for one script under the same script group, and all scripts for
one paper under the same assessment group. The prep tool also connects repeated
image hashes. Staff identities are removed from prepared OCR datasets. Source
page hashes bind verification to the file reviewed. The trained models and
datasets remain restricted research artifacts.

At least **10 independent connected assessment/script/image groups** are required
for train/validation/test splitting. That is a tooling minimum, not a useful
training target or proof of representativeness. Include varied handwriting,
scan conditions, marks, subjects and languages. The OCR alphabet is derived only
from training labels: held-out characters missing from training cause a clear
error instead of being silently discarded. Add appropriate training coverage
without moving held-out examples into training or inspecting test outputs to
choose settings. Empty/unreadable lines belong in the separate evaluation set,
not as invented text in OCR training labels.

## 3. Review the question and answer layout

The labelling desk's **Assessment layout** section can use the same line
rectangles to define each question's answer regions in reading order. Enter the
complete question list, maximums, mark increments, approved rubrics, exact memo
evidence, expected script pages and academic context. Export the layout
specification, then bind it to the exact uploaded paper and memo:

```powershell
.local/model-venv/Scripts/python -m ai_training.pipeline register-template --specification .local/dataset/layout-specification.json --paper .local/dataset/paper.pdf --memo .local/dataset/memo.pdf --output .local/dataset/reviewed-template.json
```

`academicContext` must match the corresponding fields sent by the backend; the
current backend uses `{"school": {...}, "institution": null}` for a school and
the inverse for an institution. Copy the actual scope metadata, not the editor's
illustrative default. Template language must match the script and memo language.
Auto language selection uses that reviewed language; the reader does not perform
independent language classification. Multiple-language answers require manual
review. The service never lets a candidate document set maximums or the question
inventory. A changed memo or paper requires a new reviewed template.

For answer-booklet pages with no answer regions (for example a cover sheet),
edit `pageAspectRatios` in the specification to include every page's width/height
before registration. Register one template per paper/memo/context combination.
For a different layout under the same combination, use a separate deployment
scope; automatic selection between layouts is not implemented.

## 4. Train

The wrapper prepares both datasets, trains the two networks, and packages their
best validation checkpoints. Use a new output directory for every experiment:

```powershell
./Train-Models.ps1 -TextLabels .local/dataset/verified-training-examples.jsonl -HandwritingLabels .local/dataset/script-pages/handwriting-labels.jsonl -Templates .local/dataset/reviewed-template.json -Output .local/training/run-v1
```

The parameters accept arrays for multiple label files/templates. The handwriting
JSONL paths are relative to their own directory; put each file beside the source
pages it references. Networks, batch sizes and epochs are configurable directly:

```powershell
.local/model-venv/Scripts/python -m ai_training prepare --input .local/dataset/verified-training-examples.jsonl --output .local/training/text-splits
.local/model-venv/Scripts/python -m ai_training.pipeline prepare-ocr --input .local/dataset/script-pages/handwriting-labels.jsonl --output .local/training/ocr-splits
.local/model-venv/Scripts/python -m ai_training.pipeline train-ocr --data .local/training/ocr-splits --output .local/training/reader-v1 --epochs 30
.local/model-venv/Scripts/python -m ai_training.pipeline train-scorer --data .local/training/text-splits --output .local/training/scorer-v1 --epochs 20
.local/model-venv/Scripts/python -m ai_training.pipeline bundle --ocr .local/training/reader-v1 --scorer .local/training/scorer-v1 --templates .local/dataset/reviewed-template.json --output .local/training/package-v1
```

OCR uses a convolutional encoder, bidirectional recurrent reader and CTC loss.
It learns horizontal text lines, with a character vocabulary from your data.
The scorer uses UTF-8 byte tokens, positional encodings and transformer attention
over question, answer and rubric. Independently initialized ensemble members
provide a disagreement signal. The scorer also learns when to abstain;
validation checkpoint selection combines
ordinary-answer mark error with review-classifier loss. Its reports include
review recall and false-review rate separately from mark accuracy.
This is a learned supervised scorer, not a
symbolic proof engine or a generative explanation model. Feedback explains the
review requirement and cites staff-provided memo evidence.

Each epoch writes training progress, a last checkpoint and the best validation
checkpoint. Reports keep OCR character/word error separate from marking error.
Both include language slices, and scoring includes a training-mean baseline.
Test splits are evaluated only after best validation checkpoint selection.
Run manifests record Python/PyTorch/CUDA versions; exact numerical reproducibility
can still depend on the hardware and library build.
The scorer also records an empirical 90th-percentile validation error. That and
ensemble disagreement are review signals, not calibrated guarantees.

For an interrupted run, repeat the **same** train command with `--resume`,
identical configuration and unchanged data. The last saved epoch and optimizer
state are restored. A mid-epoch interruption restarts that epoch. Completed runs
cannot be resumed or overwritten. New hyperparameters require a new run. Do not
select hyperparameters repeatedly against the held-out test set. Training output
directories contain sensitive learned artifacts; keep them out of source control.

## 5. Evaluate unseen scripts before approval

Use adjudicated scans excluded from both models' training and validation groups.
Supply one JSON object per script in a JSONL file, with file paths relative to
that file's directory. `assessmentGroup` and `scriptGroup` must use the same
grouping conventions as the original verified exports. Evaluation rejects known
fitting groups, fitting OCR source scans and duplicate evaluation scans.

```json
{"assessmentGroup":"held-out-paper-hash","scriptGroup":"held-out-script-hash","paper":"paper.pdf","memo":"memo.pdf","script":"held-out-01.pdf","academicContext":{"school":{"grade":10},"institution":null},"verifiedBy":"independent-adjudicator","questions":[{"number":"1","text":"Exact independently checked answer","marks":7,"unreadable":false,"adversarial":false}]}
```

Every template question needs an expected entry. For an unreadable answer use
`{"number":"2","unreadable":true}`. Include separately adjudicated adversarial
answers labelled `adversarial:true`, such as candidate attempts to override marks
or the rubric. Those still need readable text and adjudicated marks. Acceptance
requires the model to withhold marks for the designated adversarial and
unreadable examples. Low-quality handwriting and intentional blank answers must
be adjudicated distinctly; the current reader conservatively withholds blank
readings instead of assuming zero.

```powershell
.local/model-venv/Scripts/python -m ai_training.pipeline evaluate-bundle --directory .local/training/run-v1/package --dataset .local/evaluation/scripts.jsonl --output .local/evaluation/report-v1.json
```

The report records OCR error, mark error on scored answers, scored coverage,
unreadable false scoring and adversarial false scoring per language. An
always-abstaining model cannot pass a policy requiring nonzero scored coverage.
Configuration and artifact hashes tie the report to the exact evaluated package.
No successful software test or completed training run grants academic approval.

## 6. Academic approval and connection

An academic reviewer supplies a JSON acceptance policy with these fields:
`max_cer`, `max_mae_fraction`, `min_scored_coverage`, `min_scripts_per_language`,
`min_unreadable_questions`, `min_adversarial_questions`. Error/coverage limits
must be finite numbers in 0–1; coverage and the three sample-count requirements
must be positive. Choose and document these requirements before final evaluation;
no academically justified values can be inferred without your actual dataset.
Investigate subgroup performance, human disagreements and rubric suitability as
part of the independent review; language aggregate checks alone are insufficient.

After that review, the reviewer can explicitly attest approval:

```powershell
.local/model-venv/Scripts/python -m ai_training.pipeline approve --directory .local/training/run-v1/package --evaluation .local/evaluation/report-v1.json --policy .local/evaluation/academic-policy.json --reviewer academic-reviewer-id --confirm-academic-review
```

This is a local recorded attestation with performance checks, not a digital
signature or automatic authority check. Restrict write access to deployed model
directories. Unapproved packages cannot be loaded by the live adapter. Editing
weights, templates or inference settings after approval invalidates the checks.

For a local service, from the repository root:

```powershell
$env:PROSPERA_MODEL_MODULE = 'ai_training.runtime'
$env:PROSPERA_MODEL_DIR = (Resolve-Path .local/training/run-v1/package).Path
.local/model-venv/Scripts/python -m uvicorn ai_service.main:app --host 127.0.0.1 --port 8000
```

The .NET backend already calls `/health` and `/mark-files` on this service. Its
`AI:ServiceUrl` defaults to `http://127.0.0.1:8000/`. With Docker, set
`PROSPERA_MODEL_MODULE=ai_training.runtime` and `PROSPERA_MODEL_PATH` to the
approved package directory in `.env.docker`, then rebuild/restart the `ai`
service. Its image is now built from `Dockerfile.ai`; model files mount read-only.
Without a configured module, the service remains unavailable for marking.
Nothing in development automatically starts a real training job or deploys a model.

## Verification and architecture references

```powershell
.local/model-venv/Scripts/python -m pip install -r ai_training/requirements-test.txt
.local/model-venv/Scripts/python -m pytest ai_training/tests -q --basetemp .local/pytest-pipeline
```

Tests use explicitly fictional images and labels to check gradient updates,
checkpointing, image/split integrity, packaging, abstention, approval gates and
the FastAPI result contract. They do not measure real-world handwriting or
marking accuracy.

The implementation follows the official PyTorch contracts for
[CTC loss](https://docs.pytorch.org/docs/stable/generated/torch.nn.CTCLoss.html)
and [weights-only checkpoint loading](https://docs.pytorch.org/docs/stable/generated/torch.load.html).
