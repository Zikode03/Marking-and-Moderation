# Connected frontend training studio

Open **http://localhost:5173/training**, or choose **AI & Training → Open Model
Studio** in the assessment portal. This local studio can be used before signing
in to the academic portal: it belongs to this computer's operator, not to an
institutional account or tenant. It reads only datasets you explicitly import.

## Start

The model Python environment has already been installed in this workspace.

```powershell
./Start-TrainingStudio.ps1
```

The script starts the Vite frontend on loopback port 5173 and the local training
service on loopback port 8001. It opens the studio in your browser. Use
`-NoBrowser` to start the services without opening a browser. Logs are under
`.local/training-studio-services/`. Do not run multiple trainer service workers.

On a fresh checkout:

```powershell
npm install
python -m venv .local/model-venv
.local/model-venv/Scripts/python -m pip install -r ai_service/requirements.txt
./Start-TrainingStudio.ps1
```

## What you can do

- **Model studio:** switch between the handwriting reader and rubric scorer,
  inspect the architecture, choose a dataset/model size/epochs/batch size/device,
  and start training. The small profile is intended for initial CPU experiments.
- **Tiny demonstration:** creates explicitly fictional samples and runs a real
  single-epoch training job. Its metrics verify the controls, not academic
  accuracy. Fictional datasets and runs are clearly labelled throughout.
- **Datasets:** import reviewed JSONL text exports, or verified handwriting label
  files with their original page images. A ZIP can preserve subfolders for OCR.
  Grouped splitting and source-image checks run automatically. Insufficient
  groups and invalid labels are reported with the imported dataset.
- **Training runs:** follow measurements from actual saved epoch history, stop a
  worker, resume its last completed checkpoint, and download the held-out
  evaluation report and research checkpoint. Work already done in a partly
  completed epoch is not saved. One training worker owns the local compute slot.
- **Try checkpoint:** experiment with a completed scorer using question/answer/
  rubric text, or try a handwriting checkpoint on one cropped line image.
  Results are explicitly research outputs and never enter academic results.
- **Labelling desk:** use the existing visual region/transcription editor inside
  the frontend. Render a PDF or image to downloadable page images first, then
  label and independently verify each line. Export labels before leaving the
  editor; its drafts are held in browser memory. An offline copy is available.

The studio stores datasets and runs under `.local/training-studio/`. Source
labels and checkpoint files remain restricted local research material. Preparing
a dataset can take time for many image regions. Import source files with unique
filenames, or use a ZIP preserving their folders. JSONL document paths are
relative to the directory of that JSONL file.

## Boundaries

This is a **local, single-computer training tool**, not a multi-tenant hosted
training API. It uses a per-process capability key handed only to the trusted
loopback frontend origins. Requests from unrelated browser origins, invalid
hosts and clients without that key are rejected. The key is kept in browser
memory and changes when the trainer restarts. Keep the service bound to
`127.0.0.1`; do not expose it on a LAN or internet-facing address.

No institutional account permissions are inferred from a local upload or review
checkbox. Export only records you are authorised to use. The studio does not
automatically fetch institutional data or join it to local runs.

The training service has **no marking, model approval or model deployment
endpoint**. It does not load a model into the application's live marking host.
The academic service on port 8000 remains separate and its approval gate stays
in place. Model architecture, real-data training requirements and later academic
evaluation are described in [START_HERE.md](START_HERE.md).

The frontend is lazy-loaded at `/training`. It calls the dedicated local service
directly; it does not require the SQL/.NET backend to be running just to explore
or train. The assessment portal's existing authentication and marking workflows
are unchanged.
