from fastapi.testclient import TestClient
import pytest
from ai_service import main

client = TestClient(main.app)


def test_untrained_service_does_not_invent_marks():
    assert client.get('/health').json()['ready'] is False
    files = {name: (name + '.pdf', b'%PDF-1.4 fictional', 'application/pdf') for name in ['paper', 'memo', 'script']}
    response = client.post('/mark-files', files=files, data={'request_id': 'test'})
    assert response.status_code == 503


@pytest.mark.parametrize('marks,flagged,attention', [(11, False, False), (None, False, False), (None, True, False)])
def test_invalid_model_marks_rejected(marks, flagged, attention):
    with pytest.raises(ValueError):
        main.Result.model_validate({'needsAttention': attention, 'summary': 'test', 'questions': [{'number':'1','maxMarks':10,'marks':marks,'evidence':'answer','feedback':'test','needsReview':flagged}]})


def test_local_model_contract_and_file_validation(monkeypatch):
    class FakeModel:
        def mark_files(self, **inputs):
            assert inputs['script']['content'].startswith(b'%PDF-')
            assert inputs['memo']['content'].startswith(b'%PDF-')
            assert inputs['marking_policy']['version'] == 'memo-grounded-v1'
            assert 'marking_source' in inputs['marking_policy']
            return {'needsAttention':False,'summary':'Test fixture only','questions':[{'number':'1','maxMarks':10,'marks':7,'evidence':'Fictional answer','feedback':'Fixture','needsReview':False,'memoEvidence':'Uploaded guide: method mark','detectedLanguage':'en','readingConfidence':0.99,'annotations':[]}]}
    monkeypatch.setattr(main, 'runner', FakeModel())
    monkeypatch.setattr(main, 'model_version', 'test-fixture-only')
    monkeypatch.setattr(main, 'model_languages', {'en'})
    files = {name:(name+'.pdf', b'%PDF-1.4 fictional', 'application/pdf') for name in ['paper','memo','script']}
    response=client.post('/mark-files', files=files, data={'request_id':'test'})
    assert response.status_code == 200
    assert response.json()['result']['questions'][0]['marks'] == 7
    files['script'] = ('script.pdf', b'not a pdf', 'application/pdf')
    assert client.post('/mark-files',files=files,data={'request_id':'test'}).status_code == 422


def test_training_manifest_cannot_enable_unapproved_model(monkeypatch,tmp_path):
    (tmp_path/'manifest.json').write_text('{"version":"test","training_origin":"pretrained","validation_approved":true}')
    monkeypatch.setenv('PROSPERA_MODEL_MODULE','not_a_real_model')
    monkeypatch.setenv('PROSPERA_MODEL_DIR',str(tmp_path))
    with pytest.raises(RuntimeError): main.load_model()


def test_review_regions_and_reading_uncertainty_are_validated():
    with pytest.raises(ValueError):
        main.Annotation.model_validate(dict(page=1,x=.9,y=.2,width=.5,height=.2,kind='alternative_answer',note='Outside page'))
    base = dict(number='1',maxMarks=5,marks=2,evidence='unclear answer',feedback='Check reading',needsReview=False,memoEvidence='Memo point 1',detectedLanguage='zu',readingConfidence=.4,annotations=[])
    with pytest.raises(ValueError): main.Question.model_validate(base)
    question = main.Question.model_validate(dict(base,needsReview=True,marks=None,annotations=[dict(page=1,x=.1,y=.2,width=.2,height=.1,kind='uncertain_handwriting',note='Confirm these symbols')]))
    assert question.marks is None
    with pytest.raises(ValueError): main.Result.model_validate(dict(needsAttention=False,summary='Review',questions=[question]))
    for language in ('mixed', 'und'):
        with pytest.raises(ValueError): main.Question.model_validate(dict(base, detectedLanguage=language, readingConfidence=.99))
