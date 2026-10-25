# Staff marking workflow

The workspace supports existing assessment uploads, AI script queues, human moderation and final approval. It does not author assessments or claim that a trained marking model is available.

## Dashboards and queues

Teachers start on an overview of allocated Grade 8–12 subjects. Lecturers and professors see their faculties and modules. HODs start in moderation; principals start in approvals. Administrators have an organisation overview and the queues allowed by their account roles.

Dashboard totals come from AI batch scripts for the selected school/institution context. They do not use legacy text-submission totals. The needs-attention card includes failed processing and flagged scripts; awaiting-moderation totals also include flagged scripts, so these cards are not additive.

The work queues are:

- **AI marking:** Uploaded, Queued, Processing and Failed.
- **Moderation:** NeedsAttention and AwaitingModeration.
- **Approvals:** Moderated.
- **Completed:** Approved.

Staff can search by candidate, batch or academic context, filter by batch/status, and sort by candidate, age or attention. Lists show 15 scripts per page. Counts and filtering use the current batch-list API, which returns all accessible summaries; server-side pagination would be a separate backend change.

Queue visibility does not grant the ability to moderate or approve. The UI exposes review actions for the relevant role and queue, and the backend remains the authority for access and revision checks. Effective ABP permission-driven navigation is a separate remaining improvement.

## Guided uploads

1. Choose an allocated subject/module and enter the existing assessment's batch title.
2. Select the existing paper and approved memorandum, and describe their languages.
3. Select candidate scripts, confirm/edit candidate references, and optionally enter an expected page count.
4. Check file/page summaries and confirm candidate identity, completeness and memo approval before uploading.

PDF, PNG and JPEG files are checked for supported signatures, readability and size. Scripts are checked for duplicate references and identical content. Limits remain 30 scripts, 10 MB per file, 59 MB across the batch. Candidate edits are sent as filenames, matching the existing backend's candidate-reference contract.

The combined-scan tool splits a PDF locally using staff-entered candidate/page ranges. Overlaps, duplicate candidates and unassigned pages block splitting. It does not automatically identify handwriting or candidate boundaries. The output scripts go through the ordinary upload checks.

PDF page counts are compared with a staff-entered expected page count when supplied. A warning identifies differences; staff must inspect scans. Neither page counts nor the confirmation checkbox prove that every answer page is present.

Upload progress is actual browser-reported byte transfer for the entire multipart batch. After 100%, the UI waits for the server's successful save response. Files are saved together, so individual file-save progress is not reported. Failed/cancelled uploads retain selections; ambiguous network failures advise checking the queue before retrying. Files are not uploaded by previewing or splitting them.

## Review desk and drafts

The dedicated desk presents the script, approved memo/question-paper reference and question-level marks together on wide screens. Smaller screens stack the panes. Review circles can navigate to the relevant script page. Previous/next controls and **Alt+J / Alt+K** move through the queue snapshot opened by the reviewer.

Draft question marks and reasons stay in React memory across scripts and workspace navigation. They are not stored in browser storage or sent to the server until the reviewer confirms moderation. They clear on sign-out, reload or tab closure; the browser receives an unsaved-work warning while drafts exist. Discard draft removes a single script's draft.

A draft records its starting revision. If the server revision changes, submission is blocked until the draft is discarded and current marks reviewed. Final backend concurrency checks remain in place. Approval remains a separate action after moderation, and approved work is read-only.

Existing original-file downloads, approved-results CSV, audit history and training-example capture remain available from the desk.

## AI & Training

The **AI & Training** sidebar page makes the local model service and training-data collection visible. It reports the model health/version returned by the backend, and distinguishes an unavailable service from a service awaiting a model. Dataset totals come from accessible batches' saved training examples, with unavailable counts and partial totals identified explicitly.

Open a training batch to view original handwriting beside the approved memorandum or question paper. Teachers/lecturers can enter the question, accurate answer transcription, marking guide and expert mark. A second academic reviewer verifies an example; authorised administrators can export verified records using the existing batch export. The candidate-preview selector and labelling selector remain synchronised.

The page does not start a training job. The existing Python service hosts a future validated model, and the dataset utility prepares text examples; there is no implemented handwriting-model architecture, image-region labelling pipeline or training runner yet. The page marks these gaps explicitly and does not invent training progress, evaluation scores or readiness from example counts. Only languages reported by a ready deployed model are labelled as validated.
