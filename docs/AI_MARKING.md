# Script marking and proprietary model development

## Implemented workflow

Staff upload an **existing** question paper, its approved memorandum/rubric, and candidate scripts. There is no assessment authoring screen. POST /api/assessments returns 410; academic assessment records remain internally as scope metadata and to preserve historical work.

School uploads use allocated Grade 8–12 subjects. Institution uploads use allocated faculty modules. The same academic permissions apply to files, batches, results and training labels, including direct API requests.

Uploads accept PDF, PNG and JPEG, checking extension and signature. One complete candidate script belongs in each file; use the candidate/student number as its filename. Combined multi-candidate PDFs must be split before upload. Limits: 30 scripts, 10 MB each, 59 MB total files. Duplicate script contents or candidate filenames within a batch are rejected. Original files are saved in SQL, atomically with their metadata. SQL backups therefore include uploaded scripts; storage capacity and retention need planning before large-scale rollout.

States: Uploaded → Queued → Processing → AwaitingModeration / NeedsAttention → Moderated → Approved. Processing failures can be retried. A SQL compare-and-set claim prevents two workers from taking the same queued script. Interrupted processing is marked failed after 15 minutes; jobs are not silently re-run. Each model call has a ten-minute timeout. Results include question-level marks, maximums, answer evidence and feedback. Invalid marks are rejected. Uncertain/unreadable answers require attention; totals are withheld until resolved. Moderation preserves the original model output and corrections in history; revisions reject stale edits. Approval requires moderation. CSV export includes only approved scripts.

## Current model status

**No academically approved marking model or handwriting-recognition model exists yet.** From-scratch CRNN/CTC handwriting recognition, an ensemble of rubric-conditioned transformer scorers, local visual line labelling, resumable training, held-out evaluation, packaging and the live `mark_files` adapter are implemented in [`ai_training`](../ai_training/START_HERE.md). The initial adapter uses staff-reviewed fixed answer-booklet layouts bound to exact paper/memo hashes. No actual trained or approved weights are supplied. An older text baseline remains available separately. The user has chosen to train entirely from their own marked scripts and will gather data over time. There are no paid provider calls, API keys, downloaded pretrained weights, automatic training on upload, or fabricated marks. Queue integration tests use an explicitly fictional test-only model transport; they do not establish marking accuracy.

The local model host reports not ready until a first-party model package and academically approved versioned artifacts are installed. Uploads and training-example capture work while the model is unavailable. The UI disables Start AI marking and the API returns 503, retaining originals.

## Collecting training examples

Open a batch and expand **Build our training dataset**. Teachers/lecturers/professors capture a question number, exact question, accurate answer transcription, approved marking guide, maximum mark and expert mark. This is expert labelling for training, separate from released academic results. A different HOD/AcademicAdmin verifies the label. SchoolAdmin/AcademicAdmin can export verified examples as JSONL. Review the original script and all label fields before verification. Incorrect labels should not be verified; label correction/versioning is a follow-up capability.

Exports omit candidate filenames and staff identities, but free text still needs de-identification before research use. Only use scripts and memorandums with appropriate rights and authorisation. Dataset records include content-derived assessment/script grouping hashes, so repeated uploads can be kept in the same split. No images are embedded in the text JSONL; original scan files remain in the restricted batch and can be downloaded separately. The new offline labelling desk captures independently verified image-line regions for handwriting training; those labels are exported separately from the existing text JSONL.

`ai-service/training/prepare_dataset.py` validates and deduplicates JSONL exports and creates deterministic grouped train/validation/test splits. It rejects conflicting labels and keeps connected assessment/script groups together to prevent leakage. It does **not** train a model. Do not interpret successful dataset preparation as proof that the dataset is sufficient or representative.

## Local service setup

From this frontend/training repository:

```powershell
python -m venv .local/model-venv
.local/model-venv/Scripts/python -m pip install -r ai_service/requirements.txt
.local/model-venv/Scripts/python -m uvicorn ai_service.main:app --host 127.0.0.1 --port 8000
```

The .NET backend uses `AI:ServiceUrl` (environment `AI__ServiceUrl`), default `http://127.0.0.1:8000/`. No key is required. Docker Compose provides a private `ai` service; the host service URL is `http://ai:8000/` within Docker. Restart the backend and refresh the frontend after updating both repositories.

Trained and academically approved first-party model deployments set `PROSPERA_MODEL_MODULE` and `PROSPERA_MODEL_DIR`. The module implements `load(Path)`, returning an object with `mark_files(paper, memo, script, request_id, script_language, memo_language, academic_context, marking_policy)`. Each file argument is `{content: bytes, content_type: str}`. The academic context contains the school subject/grade or institution faculty/module. The server-owned marking policy requires the uploaded approved memorandum as the grading source, valid equivalent methods/wording to be considered, and uncertainty to be reviewed. It must handle document reading, answer mapping, rubric marking and uncertainty. It returns:

```json
{"needsAttention":false,"summary":"Rubric-based marking summary","questions":[{"number":"1.1","maxMarks":5,"marks":3,"evidence":"Answer excerpt/page reference","feedback":"Reason against the marking guide","needsReview":false,"memoEvidence":"Relevant criterion from the uploaded memo","detectedLanguage":"en","readingConfidence":0.98,"annotations":[]}]}
```

Missing/unreadable/ambiguous answers must be flagged (`marks:null`, `needsReview:true`, `needsAttention:true`), never assumed to be zero. The service wraps validated output with `model` and `runId`. Maximums and the complete question inventory must come from the approved paper/memo, not the candidate's instructions. All uploaded documents are untrusted input. Models must be evaluated against altered-script/prompt-injection attempts before deployment.

The model directory needs `manifest.json` with `version`, `training_origin:"from_scratch"`, and `validation_approved:true`. These fields are a deployment gate, **not evidence of accuracy**. Academic approval must follow documented held-out evaluations, including question mark errors, human disagreements, unreadable-script detection and subgroup/language performance. Keep OCR and marking evaluations separate. The document pipeline now supplies trainable OCR and rubric-scoring architectures and a reviewed-layout adapter. Academic acceptance thresholds still require real held-out data and documented approval. The packaging/approval commands bind the reviewed artifacts and inference settings to an end-to-end evaluation; all question scores remain provisional and require moderation.

## Database update and verification

Debug/development startup applies additive AiBatches, AiScripts and AiTrainingExamples tables under a SQL application lock. Existing assessments, users and submissions are retained. Release deployments with database initialisation disabled must apply `docs/ai-script-schema-v1.sql` first.

Tests cover isolated SQL upload/persistence, file/role/tenant/allocation validation, unavailable-model handling, the local model contract, queue processing, stale revisions, moderation/approval locking, verified-only training export, and UI upload flow. Actual model accuracy, training on real handwriting, unrestricted document layouts, PDF splitting, large-cohort throughput, student publishing, retention controls and production-scale storage remain future work.

## Memorandum-grounded multilingual review

The approved memorandum/rubric is mandatory for every batch and is sent with the matching question paper, candidate script and academic context to the local model. Every new model result must include non-empty memorandum evidence for each question. This enforces an auditable output contract; it does not prove semantic accuracy without model evaluation. Batch files are immutable; a corrected memorandum belongs in a new upload.

Upload metadata supports Afrikaans (af), English (en), isiNdebele (nr), isiXhosa (xh), isiZulu (zu), Sepedi (nso), Sesotho (st), Setswana (tn), siSwati (ss), Tshivenda (ve), and Xitsonga (ts), plus automatic detection and mixed languages. Both script and memorandum language are saved and included in training exports. These are supported metadata choices, not a claim of trained recognition in all languages.

Model manifests must also declare `validated_languages`, for example `["en"]`. The host rejects selected languages outside that scope and results reporting an undeclared language. The .NET API checks declared model language support before queuing explicitly selected languages. Per-answer reading confidence is a model estimate, not a calibrated probability. The initial review threshold is 0.85: lower confidence or unknown language requires review. Its usefulness must be evaluated on held-out handwriting data before deployment.

Review annotations use `{page,x,y,width,height,kind,note}` with 1-based page numbers and normalized 0–1 coordinates measured from the top-left of the displayed page. Coordinates must account for PDF page rotation/image orientation; regions must remain entirely on the page. Kinds: `uncertain_handwriting`, `alternative_answer`, `possible_harsh_marking`, `memo_ambiguity`, `missing_page`. An annotation requires question and overall review flags. Missing/unlocatable work should have no invented region. The viewer reports out-of-range page references.

Staff can open original PDFs/images, navigate pages, zoom, and inspect circles with their review explanations alongside answer and memo evidence. Review circles persist in the recorded model output after moderation as historical evidence. The original scan is never overwritten or redrawn. The circles are viewer overlays, not an annotated-PDF download.

No structured existing-teacher-mark comparison is implemented. The 'potentially overlooked credit' annotation asks a reviewer to check a valid method/answer; it does not conclude that a teacher was harsh. A future comparison feature needs the original teacher's question marks and independent adjudication.

Handwriting recognition and multilingual semantic marking remain untrained; the software needed to train and evaluate the initial fixed-layout pipeline is now implemented. No claim is made that every handwriting size, scan, language or subject can be read accurately. This update implements language metadata, strict model outputs and visual review, not trained recognition weights. PDF page rendering was checked with a generated two-page document including a rotated page; UI tests cover authenticated image overlays and zoom. There is no connected browser for full visual browser QA in this environment.
