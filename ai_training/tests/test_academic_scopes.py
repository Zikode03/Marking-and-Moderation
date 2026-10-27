import json
import pytest
from ai_training.data import prepare, load_splits, read_rows
from ai_training.ocr_data import prepare_ocr


def rows():
    return [dict(assessmentGroup=f'paper-{i}', scriptGroup=f'script-{i}', questionNumber='1', question=f'Question {i}', answer=f'Answer {i}', rubric='Marking guide', maxMarks=10, marks=5, preparation=dict(sourceMarked=True,learnerWritingOnly=True,preparationNotes='Teacher ticks excluded',datasetScope='CAPS/Grade10/Math/en',learnerGroup=f'learner-{i//2}')) for i in range(24)]


def test_marked_scripts_require_annotation_handling(tmp_path):
    source=tmp_path/'labels.jsonl';data=rows();data[0]['preparation']['learnerWritingOnly']=False;source.write_text(json.dumps(data[0]))
    with pytest.raises(ValueError,match='annotation handling'): read_rows(source)


def test_different_scopes_cannot_enter_one_training_run(tmp_path):
    source=tmp_path/'labels.jsonl';data=rows();data[-1]['preparation']['datasetScope']='University/Computing/Level1/en';source.write_text('\n'.join(map(json.dumps,data)))
    with pytest.raises(ValueError,match='different academic scopes'): prepare([source],tmp_path/'split')


def test_same_learner_never_crosses_training_and_evaluation(tmp_path):
    source=tmp_path/'labels.jsonl';source.write_text('\n'.join(map(json.dumps,rows())));prepare([source],tmp_path/'split');splits=load_splits(tmp_path/'split');seen=set()
    for data in splits.values():
        learners={r['preparation']['learnerGroup'] for r in data};assert not learners & seen;seen.update(learners)


def test_ocr_rejects_marked_crops_without_learner_only_confirmation(tmp_path):
    source=tmp_path/'ocr.jsonl';source.write_text(json.dumps(dict(sourceMarked=True,learnerWritingOnly=False)))
    with pytest.raises(ValueError,match='exclude teacher annotations'): prepare_ocr([source],tmp_path/'split')
