"""Exercise browser-facing local training controls using fictional data only."""
import io
import json
import time
import zipfile

from fastapi.testclient import TestClient

from ai_service.studio import create_app, safe_extract

ORIGIN = {'Origin': 'http://localhost:5173'}


def connect(client):
    response = client.get('/studio/session', headers=ORIGIN)
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    return {**ORIGIN, 'X-Prospera-Studio-Key': response.json()['key']}


def wait_until(client, headers, predicate, seconds=60):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        response = client.get('/studio/status', headers=headers)
        assert response.status_code == 200
        state = response.json()
        if predicate(state):
            return state
        time.sleep(.15)
    raise AssertionError('Local training did not reach the expected state')


def test_local_origin_session_and_training_only_boundary(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        assert client.get('/studio/session').status_code == 403
        assert client.get('/studio/session', headers={'Origin': 'https://unrelated.example'}).status_code == 403
        assert client.get('/studio/status', headers=ORIGIN).status_code == 401
        headers = connect(client)
        state = client.get('/studio/status', headers=headers).json()
        assert state['trainingOnly'] and not state['markingEnabled']
        assert client.post('/mark-files', headers=headers).status_code == 404
        assert client.get('/studio/runs/not-a-uuid', headers=headers).status_code == 404
        assert client.post('/studio/runs', json={'datasetId': 'bad', 'name': 'bad', 'epochs': 0}, headers=headers).status_code == 422


def test_dataset_import_prepares_splits_and_reports_insufficient_examples(tmp_path):
    rows = [dict(assessmentGroup=f'paper-{index}', scriptGroup=f'script-{index}', questionNumber='1',
                 question=f'Fictional question {index}', answer='a', rubric='Credit a', maxMarks=10, marks=7, scriptLanguage='en') for index in range(12)]
    with TestClient(create_app(tmp_path)) as client:
        headers = connect(client)
        upload = {'files': ('labels.jsonl', '\n'.join(json.dumps(row) for row in rows), 'application/x-ndjson')}
        assert client.post('/studio/datasets', headers=headers, data={'name': 'Text', 'kind': 'scorer'}, files=upload).status_code == 422
        response = client.post('/studio/datasets', headers=headers, data={'name': 'Text', 'kind': 'scorer', 'verified': 'true'}, files=upload)
        assert response.status_code == 202
        key = response.json()['id']
        state = wait_until(client, headers, lambda state: any(row['id'] == key and row['status'] != 'preparing' for row in state['datasets']))
        dataset = next(row for row in state['datasets'] if row['id'] == key)
        assert dataset['status'] == 'ready' and sum(dataset['splits'].values()) == 12
        response = client.post('/studio/datasets', headers=headers, data={'name': 'Too small', 'kind': 'scorer', 'verified': 'true'}, files={'files': ('small.jsonl', json.dumps(rows[0]), 'application/x-ndjson')})
        key = response.json()['id']
        state = wait_until(client, headers, lambda state: any(row['id'] == key and row['status'] == 'needs_data' for row in state['datasets']))
        assert next(row for row in state['datasets'] if row['id'] == key)['examples'] == 1


def test_zip_traversal_and_duplicate_paths_are_rejected(tmp_path):
    import pytest
    for names in (['../escape.jsonl'], ['same.jsonl', 'same.jsonl']):
        content = io.BytesIO()
        with zipfile.ZipFile(content, 'w') as archive:
            for name in names:
                archive.writestr(name, '{}')
        with pytest.raises(ValueError):
            safe_extract(content.getvalue(), tmp_path)
    assert not (tmp_path.parent / 'escape.jsonl').exists()


def test_actual_demo_worker_history_downloads_and_checkpoint_trial(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        headers = connect(client)
        response = client.post('/studio/demo?kind=scorer', headers=headers)
        assert response.status_code == 202
        run = response.json()
        assert run['synthetic'] and run['status'] == 'running'
        assert client.post('/studio/demo?kind=ocr', headers=headers).status_code == 409
        state = wait_until(client, headers, lambda state: any(row['id'] == run['id'] and row['status'] in ('completed', 'failed') for row in state['runs']))
        completed = next(row for row in state['runs'] if row['id'] == run['id'])
        assert completed['status'] == 'completed', completed['message']
        assert completed['completedEpochs'] == completed['totalEpochs'] == 2
        assert completed['progress'] == 100 and completed['trained']
        assert completed['evaluation']['test']['model']['examples'] > 0
        trial = client.post(f"/studio/runs/{run['id']}/try-scorer", headers=headers,
                            json=dict(question='Fictional question', answer='A valid method', rubric='Credit a valid method', maxMarks=10))
        assert trial.status_code == 200
        assert trial.json()['researchOnly'] and 0 <= trial.json()['suggestedMarks'] <= 10
        assert client.get(f"/studio/runs/{run['id']}/report", headers=headers).status_code == 200
        archive = client.get(f"/studio/runs/{run['id']}/checkpoint", headers=headers)
        with zipfile.ZipFile(io.BytesIO(archive.content)) as zipped:
            assert 'best-0.pt' in zipped.namelist()
            assert json.loads(zipped.read('manifest.json'))['validation_approved'] is False
        assert client.post(f"/studio/runs/{run['id']}/resume", headers=headers).status_code == 409
        assert not client.get('/studio/status', headers=headers).json()['markingEnabled']
        # Check the real stop/resume boundary after an epoch has actually reached disk.
        response = client.post('/studio/runs', headers=headers, json={'datasetId': run['datasetId'], 'name': 'Checkpoint control fixture', 'epochs': 100, 'batchSize': 4})
        key = response.json()['id']
        state = wait_until(client, headers, lambda state: any(row['id'] == key and row['completedEpochs'] > 0 for row in state['runs']))
        assert client.post(f'/studio/runs/{key}/stop', headers=headers).status_code == 200
        state = wait_until(client, headers, lambda state: any(row['id'] == key and row['status'] == 'stopped' for row in state['runs']))
        stopped = next(row for row in state['runs'] if row['id'] == key)
        assert stopped['canResume']
        assert client.post(f'/studio/runs/{key}/resume', headers=headers).status_code == 202
        state = wait_until(client, headers, lambda state: any(row['id'] == key and row['completedEpochs'] > stopped['completedEpochs'] for row in state['runs']))
        assert client.post(f'/studio/runs/{key}/stop', headers=headers).status_code == 200
        wait_until(client, headers, lambda state: any(row['id'] == key and row['status'] == 'stopped' for row in state['runs']))


def test_render_endpoint_returns_original_page_images(tmp_path):
    from PIL import Image
    content = io.BytesIO()
    Image.new('RGB', (100, 40), 'white').save(content, format='PNG')
    with TestClient(create_app(tmp_path)) as client:
        response = client.post('/studio/render', headers=connect(client), files={'document': ('line.png', content.getvalue(), 'image/png')})
        assert response.status_code == 200
        with zipfile.ZipFile(io.BytesIO(response.content)) as zipped:
            assert zipped.namelist() == ['page-001.png']
