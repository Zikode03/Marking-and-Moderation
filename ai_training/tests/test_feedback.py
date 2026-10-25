from ai_training.feedback import script_feedback


def test_feedback_identifies_strengths_and_next_steps_from_marks():
    text = script_feedback([{'number': '1', 'maxMarks': 10, 'marks': 10}, {'number': '2', 'maxMarks': 10, 'marks': 3}])
    assert '13 out of 20' in text
    assert 'earned credit in question(s) 1, 2' in text
    assert 'Focus next on question(s) 2' in text
    assert 'provisional' in text


def test_unreadable_script_does_not_assume_zero_or_blame_learner():
    text = script_feedback([{'number': '1', 'maxMarks': 10, 'marks': None}])
    assert 'does not mean your answers are wrong' in text
    assert 'not been counted as zero' in text
    assert 'out of' not in text


def test_partial_feedback_does_not_present_partial_score_as_whole_script():
    text = script_feedback([{'number': '1', 'maxMarks': 5, 'marks': 0}, {'number': '2', 'maxMarks': 10, 'marks': None}])
    assert 'questions that could be scored is 0 out of 5' in text
    assert 'earned credit' not in text
    assert 'Focus next on question(s) 1' in text


def test_full_marks_get_supportive_feedback_without_invented_weaknesses():
    text = script_feedback([{'number': '1', 'maxMarks': 5, 'marks': 5}])
    assert 'full provisional credit' in text
    assert 'Focus next' not in text
