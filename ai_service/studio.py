"""Local-only browser training controls. No academic marking routes or deployment."""
import asyncio
import hashlib
import io
import json
import os
import secrets
import shutil
import stat
import subprocess
import sys
import threading
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from filelock import FileLock, Timeout
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from ai_training.training import save_json

PROJECT = Path(__file__).resolve().parent.parent
ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']


def now():
    return datetime.now(timezone.utc).isoformat()


def identifier(value):
    try:
        if str(UUID(value)) != value:
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(404, 'Record not found') from None
    return value


class RunRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    datasetId: str
    name: str = Field(min_length=1, max_length=80)
    epochs: int = Field(default=10, ge=1, le=5000)
    batchSize: int = Field(default=4, ge=1, le=64)
    profile: Literal['small', 'standard'] = 'small'
    device: Literal['auto', 'cpu', 'cuda'] = 'auto'
    seed: int = Field(default=42, ge=0, le=2**31-1)


class TrialRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    question: str = Field(min_length=1, max_length=20000)
    answer: str = Field(min_length=1, max_length=30000)
    rubric: str = Field(min_length=1, max_length=20000)
    maxMarks: float = Field(gt=0, le=1000, allow_inf_nan=False)


class Studio:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        for name in ('datasets', 'runs'):
            (self.root / name).mkdir(exist_ok=True)
        self.key = secrets.token_urlsafe(32)
        self.lock = threading.RLock()
        self.process = None
        self.active = None
        self.closing = False
        self.file_lock = FileLock(str(self.root / '.studio.lock'))
        try:
            self.file_lock.acquire(timeout=0)
        except Timeout:
            raise RuntimeError('This training studio directory is already in use; run one service worker') from None
        for row in self.records('runs'):
            if row['status'] in ('running', 'stopping'):
                row.update(status='interrupted', finishedAt=now(), message='The training service restarted. Resume from the last saved checkpoint.')
                self.write('runs', row)
        for row in self.records('datasets'):
            if row['status'] == 'preparing':
                row.update(status='failed', message='Dataset preparation was interrupted. Import the source files again.')
                self.write('datasets', row)

    def path(self, category, key):
        return self.root / category / identifier(key)

    def read(self, category, key):
        try:
            return json.loads((self.path(category, key) / 'record.json').read_text(encoding='utf-8'))
        except FileNotFoundError:
            raise HTTPException(404, 'Record not found') from None

    def write(self, category, row):
        with self.lock:
            directory = self.path(category, row['id'])
            directory.mkdir(parents=True, exist_ok=True)
            save_json(directory / 'record.json', row)

    def records(self, category):
        rows = []
        for path in (self.root / category).glob('*/record.json'):
            try:
                rows.append(json.loads(path.read_text(encoding='utf-8')))
            except (ValueError, OSError):
                continue
        return sorted(rows, key=lambda r: r['createdAt'], reverse=True)[:100]

    def status(self):
        import torch
        return {'connected': True, 'trainingOnly': True, 'markingEnabled': False,
                'device': 'CUDA' if torch.cuda.is_available() else 'CPU', 'torchVersion': str(torch.__version__),
                'datasets': self.records('datasets'), 'runs': [self.detail(row) for row in self.records('runs')],
                'activeRunId': self.active}

    def detail(self, row):
        directory = self.path('runs', row['id']) / 'model'
        history = []
        for path in sorted(directory.glob('history*.json')):
            try:
                history.extend(json.loads(path.read_text(encoding='utf-8')))
            except (ValueError, OSError):
                pass
        history.sort(key=lambda point: (point.get('member', 0), point['epoch']))
        evaluation, manifest = None, None
        for name in ('evaluation', 'manifest'):
            try:
                value = json.loads((directory / f'{name}.json').read_text(encoding='utf-8'))
                if name == 'evaluation':
                    evaluation = value
                else:
                    manifest = value
            except (ValueError, OSError):
                pass
        members = manifest['config'].get('members', 1) if manifest else (2 if row['profile'] == 'small' else 3) if row['kind'] == 'scorer' else 1
        if row['status'] == 'interrupted' and manifest and manifest.get('training_complete'):
            row.update(status='completed', finishedAt=now(), message='The checkpoint completed while the training service was disconnected. Research output only; marking remains disabled.')
            self.write('runs', row)
        completed_epochs = len(history)
        total_epochs = row['epochs'] * members
        return {**row, 'history': history[-2000:], 'evaluation': evaluation,
                'completedEpochs': completed_epochs, 'totalEpochs': total_epochs,
                'progress': min(100, round(100 * completed_epochs / total_epochs)),
                'canResume': row['status'] in ('stopped', 'failed', 'interrupted') and manifest is not None and not manifest.get('training_complete'),
                'trained': bool(manifest and manifest.get('training_complete'))}

    def prepare(self, row):
        try:
            sources = sorted(path for path in (self.path('datasets', row['id']) / 'source').rglob('*') if path.is_file() and path.suffix.lower() == '.jsonl')
            if not sources:
                raise ValueError('No JSONL label file was supplied')
            if row['kind'] == 'scorer':
                from ai_training.data import prepare, read_rows
                labels = [record for source in sources for record in read_rows(source)]
                row['examples'] = len(labels)
                row['reviewExamples'] = sum(r.get('needsReview', False) for r in labels)
                row['groups'] = len({r['assessmentGroup'] for r in labels})
                counts = prepare(sources, self.path('datasets', row['id']) / 'splits')
            else:
                from ai_training.ocr_data import prepare_ocr
                labels = [json.loads(line) for source in sources for line in source.read_text(encoding='utf-8-sig').splitlines() if line.strip()]
                row['examples'] = len(labels)
                row['groups'] = len({r.get('assessmentGroup') for r in labels})
                counts = prepare_ocr(sources, self.path('datasets', row['id']) / 'splits')
            row.update(status='ready', splits=counts, message='Verified labels prepared with independent grouped train, validation and test splits.')
        except (ValueError, OSError, KeyError, TypeError) as error:
            message = str(error)
            row.update(status='needs_data' if 'at least 10' in message else 'failed', message=message[:1200])
        except Exception:
            row.update(status='failed', message='The source files could not be prepared. Check document formats and label fields.')
        self.write('datasets', row)

    def command(self, row, resume=False):
        arguments = [sys.executable, '-u', '-m', 'ai_service.studio_worker', 'train-ocr' if row['kind'] == 'ocr' else 'train-scorer',
                     '--data', str(self.path('datasets', row['datasetId']) / 'splits'),
                     '--output', str(self.path('runs', row['id']) / 'model'), '--epochs', str(row['epochs']),
                     '--batch-size', str(row['batchSize']), '--seed', str(row['seed']), '--device', row['device']]
        if row['profile'] == 'small':
            options = {'--height': 32, '--channels': 8, '--hidden': 32, '--max-width': 1600} if row['kind'] == 'ocr' else {'--width': 32, '--heads': 4, '--layers': 1, '--members': 2, '--max-tokens': 2048}
            for flag, value in options.items():
                arguments.extend([flag, str(value)])
        if resume:
            arguments.append('--resume')
        return arguments

    def start(self, request, resume_id=None):
        with self.lock:
            if self.closing or self.active is not None:
                raise HTTPException(409, 'One training run can use this local trainer at a time')
            try:
                with FileLock(str(self.root / '.worker.lock'), timeout=0):
                    pass
            except Timeout:
                raise HTTPException(409, 'A previous training worker is still finishing. Wait before starting another run.') from None
            if resume_id:
                row = self.read('runs', resume_id)
                if not self.detail(row)['canResume']:
                    raise HTTPException(409, 'This run has no resumable checkpoint state')
            else:
                dataset = self.read('datasets', request.datasetId)
                if dataset['status'] != 'ready':
                    raise HTTPException(409, 'Prepare a ready dataset before starting training')
                row = {**request.model_dump(), 'id': str(uuid4()), 'kind': dataset['kind'], 'synthetic': dataset.get('synthetic', False), 'createdAt': now()}
            row.update(status='running', startedAt=now(), finishedAt=None, message='Loading the dataset and initializing the model.')
            self.write('runs', row)
            self.active = row['id']
            try:
                environment = {**os.environ, 'PYTHONUTF8': '1', 'OMP_NUM_THREADS': '2', 'MKL_NUM_THREADS': '2',
                               'PROSPERA_STUDIO_WORKER_LOCK': str(self.root / '.worker.lock')}
                with (self.path('runs', row['id']) / 'worker.log').open('ab') as log:
                    self.process = subprocess.Popen(self.command(row, bool(resume_id)), cwd=PROJECT, env=environment,
                        stdout=log, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            except OSError:
                self.active = None
                self.process = None
                row.update(status='failed', message='Could not start the local training worker.', finishedAt=now())
                self.write('runs', row)
                raise HTTPException(500, row['message']) from None
            threading.Thread(target=self.monitor, args=(row['id'], self.process), daemon=True).start()
            return self.detail(row)

    def monitor(self, key, process):
        code = process.wait()
        with self.lock:
            row = self.read('runs', key)
            complete = self.detail(row)['trained']
            status = 'completed' if complete and code == 0 else 'stopped' if row['status'] == 'stopping' else 'failed'
            message = 'Training and held-out evaluation completed. This checkpoint is for research; marking remains disabled.' if status == 'completed' else 'Stopped. The latest saved epoch can be resumed.' if status == 'stopped' else 'Training stopped with an error.'
            if status == 'failed':
                lines = (self.path('runs', key) / 'worker.log').read_text(encoding='utf-8', errors='replace').splitlines()
                if lines:
                    message = lines[-1][:1000]
            row.update(status=status, message=message, finishedAt=now())
            self.write('runs', row)
            self.active = None
            self.process = None

    def stop(self, key):
        with self.lock:
            if self.active != key or self.process is None:
                raise HTTPException(409, 'This run is not active')
            row = self.read('runs', key)
            row.update(status='stopping', message='Stopping the worker. Completed epoch checkpoints are retained.')
            self.write('runs', row)
            self.process.terminate()
            return self.detail(row)

    def close(self):
        with self.lock:
            self.closing = True
            process = self.process
            key = self.active
            if process is not None:
                self.stop(key)
        if process is not None:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
        self.file_lock.release()


def safe_extract(content, destination):
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        entries = archive.infolist()
        if len(entries) > 5000 or sum(item.file_size for item in entries) > 250 * 1024 * 1024:
            raise ValueError('Archive exceeds 5,000 files or 250 MB expanded size')
        paths = set()
        for item in entries:
            if item.is_dir():
                continue
            path = (destination / item.filename.replace('\\', '/')).resolve()
            if not path.is_relative_to(destination.resolve()) or stat.S_ISLNK(item.external_attr >> 16) or path in paths:
                raise ValueError('Archive contains unsafe or duplicate paths')
            paths.add(path)
            if path.suffix.lower() not in ('.jsonl', '.png', '.jpg', '.jpeg', '.pdf') or item.file_size > 10 * 1024 * 1024:
                raise ValueError('Use JSONL labels and PDF/PNG/JPEG originals, each at most 10 MB')
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.exists():
                raise ValueError('Duplicate source filename')
            with archive.open(item) as source, path.open('xb') as target:
                shutil.copyfileobj(source, target)


def create_app(root=None, origins=None):
    trusted = origins or ORIGINS
    @asynccontextmanager
    async def lifespan(application):
        application.state.studio = Studio(root or os.environ.get('PROSPERA_STUDIO_DIR', PROJECT / '.local/training-studio'))
        try:
            yield
        finally:
            application.state.studio.close()

    application = FastAPI(title='Prospera Local Training Studio', lifespan=lifespan)
    application.add_middleware(CORSMiddleware, allow_origins=trusted, allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'X-Prospera-Studio-Key'])
    application.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', 'testserver'])

    @application.middleware('http')
    async def check_origin(request: Request, call_next):
        if request.headers.get('origin') and request.headers['origin'] not in trusted:
            from fastapi.responses import JSONResponse
            return JSONResponse({'detail': 'This local trainer only accepts its trusted frontend origins'}, status_code=403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    def authorized(request: Request, x_prospera_studio_key: str = Header(default='')):
        studio = request.app.state.studio
        if not secrets.compare_digest(x_prospera_studio_key, studio.key):
            raise HTTPException(401, 'Connect to the local training studio again')
        return studio

    @application.get('/studio/session')
    def session(request: Request):
        if request.headers.get('origin') not in trusted:
            raise HTTPException(403, 'Open the studio through its local frontend')
        return {'key': request.app.state.studio.key, 'trainingOnly': True}

    @application.get('/studio/status')
    def status(studio=Depends(authorized)):
        return studio.status()

    @application.post('/studio/datasets', status_code=202)
    async def upload_dataset(name: str = Form(..., min_length=1, max_length=80), kind: Literal['ocr', 'scorer'] = Form(...),
                             verified: bool = Form(False), files: list[UploadFile] = File(...), studio=Depends(authorized)):
        if not verified:
            raise HTTPException(422, 'Confirm that these labels have been independently reviewed')
        if not 1 <= len(files) <= 5000:
            raise HTTPException(422, 'Select between 1 and 5,000 source files')
        row = {'id': str(uuid4()), 'name': name.strip(), 'kind': kind, 'createdAt': now(), 'status': 'preparing',
               'examples': 0, 'groups': 0, 'reviewExamples': 0, 'splits': None, 'synthetic': False, 'message': 'Checking source files and preparing grouped splits.'}
        destination = studio.path('datasets', row['id']) / 'source'
        destination.mkdir(parents=True)
        size = 0
        try:
            for file in files:
                content = await file.read(100 * 1024 * 1024 + 1)
                size += len(content)
                if size > 100 * 1024 * 1024:
                    raise ValueError('Upload exceeds 100 MB; split it into a smaller dataset')
                filename = file.filename or ''
                if not filename or filename in ('.', '..') or Path(filename).name != filename or '\\' in filename or ':' in filename:
                    raise ValueError('Use plain filenames or a ZIP preserving the dataset folders')
                if filename.lower().endswith('.zip'):
                    safe_extract(content, destination)
                else:
                    if len(content) > 10 * 1024 * 1024 or Path(filename).suffix.lower() not in ('.jsonl', '.png', '.jpg', '.jpeg', '.pdf'):
                        raise ValueError('Use JSONL labels, original PDF/PNG/JPEG pages, or a ZIP archive')
                    with (destination / filename).open('xb') as stream:
                        stream.write(content)
        except (ValueError, OSError, zipfile.BadZipFile) as error:
            row.update(status='failed', message=str(error)[:1000])
            studio.write('datasets', row)
            raise HTTPException(422, row['message']) from None
        studio.write('datasets', row)
        threading.Thread(target=studio.prepare, args=(row,), daemon=True).start()
        return row

    @application.post('/studio/runs', status_code=202)
    def start(request: RunRequest, studio=Depends(authorized)):
        return studio.start(request)

    @application.get('/studio/runs/{key}')
    def detail(key: str, studio=Depends(authorized)):
        return studio.detail(studio.read('runs', key))

    @application.post('/studio/runs/{key}/stop')
    def stop(key: str, studio=Depends(authorized)):
        return studio.stop(identifier(key))

    @application.post('/studio/runs/{key}/resume', status_code=202)
    def resume(key: str, studio=Depends(authorized)):
        return studio.start(None, resume_id=identifier(key))

    @application.get('/studio/runs/{key}/report')
    def report(key: str, studio=Depends(authorized)):
        studio.read('runs', key)
        path = studio.path('runs', key) / 'model/evaluation.json'
        if not path.is_file():
            raise HTTPException(409, 'Held-out evaluation is not available yet')
        return FileResponse(path, filename=f'prospera-{key}-evaluation.json', media_type='application/json')

    @application.get('/studio/runs/{key}/checkpoint')
    def checkpoint(key: str, studio=Depends(authorized)):
        row = studio.read('runs', key)
        if row['status'] != 'completed':
            raise HTTPException(409, 'Wait for the research checkpoint to complete')
        directory = studio.path('runs', key) / 'model'
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for path in directory.iterdir():
                if path.suffix == '.json' or path.name.startswith('best') and path.suffix == '.pt':
                    archive.write(path, path.name)
        return Response(output.getvalue(), media_type='application/zip', headers={'Content-Disposition': f'attachment; filename="prospera-{key}-checkpoint.zip"'})

    @application.post('/studio/render')
    async def render(document: UploadFile = File(...), studio=Depends(authorized)):
        from ai_training.documents import render_pages
        content = await document.read(10 * 1024 * 1024 + 1)
        def work():
            output = io.BytesIO()
            pixels = 0
            with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for index, page in enumerate(render_pages(content, document.content_type), 1):
                    pixels += page.width * page.height
                    if pixels > 150_000_000:
                        raise ValueError('Render a smaller part of this document at a time')
                    image = io.BytesIO()
                    page.save(image, format='PNG')
                    archive.writestr(f'page-{index:03}.png', image.getvalue())
            return output.getvalue()
        try:
            data = await asyncio.to_thread(work)
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        return Response(data, media_type='application/zip', headers={'Content-Disposition': 'attachment; filename="training-pages.zip"'})

    @application.post('/studio/demo', status_code=202)
    def demo(kind: Literal['ocr', 'scorer'] = 'scorer', studio=Depends(authorized)):
        if studio.active is not None:
            raise HTTPException(409, 'Wait for the active run before starting a demonstration')
        from .studio_demo import make_demo
        row = make_demo(studio, kind)
        return studio.start(RunRequest(datasetId=row['id'], name='Fictional walkthrough', epochs=1, batchSize=4, device='cpu'))

    @application.post('/studio/runs/{key}/try-scorer')
    def try_scorer(key: str, trial: TrialRequest, studio=Depends(authorized)):
        from .studio_trials import score_trial
        return score_trial(studio, key, trial)

    @application.post('/studio/runs/{key}/try-ocr')
    async def try_ocr(key: str, image: UploadFile = File(...), studio=Depends(authorized)):
        from .studio_trials import ocr_trial
        content = await image.read(10 * 1024 * 1024 + 1)
        return await asyncio.to_thread(ocr_trial, studio, key, content, image.content_type)

    return application


app = create_app()
