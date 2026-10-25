"""Grounded, learner-facing script feedback; never infers unseen mistakes."""


def script_feedback(questions):
    scored = [q for q in questions if q['marks'] is not None]
    pending = len(questions) - len(scored)
    parts = []
    if scored:
        total = sum(q['marks'] for q in scored)
        maximum = sum(q['maxMarks'] for q in scored)
        scope = 'the questions that could be scored' if pending else 'this script'
        parts.append(f"Your provisional score for {scope} is {total:g} out of {maximum:g}.")
        strongest = sorted((q for q in scored if q['marks'] > 0 and q['maxMarks'] > 0), key=lambda q: q['marks'] / q['maxMarks'], reverse=True)[:3]
        if strongest:
            numbers = ', '.join(str(q['number']) for q in strongest)
            parts.append(f"You earned credit in question(s) {numbers}. Use these answers as a starting point when you revise.")
        priorities = sorted((q for q in scored if q['marks'] < q['maxMarks']), key=lambda q: q['marks'] / q['maxMarks'])[:3]
        if priorities:
            numbers = ', '.join(str(q['number']) for q in priorities)
            parts.append(f"Focus next on question(s) {numbers}, where there is room to earn more marks. Compare your answers with the approved memorandum and work through the question feedback with your teacher or lecturer before trying them again.")
        else:
            parts.append("You received full provisional credit on the scored questions. Keep practising to build on this work.")
    else:
        parts.append("Your script needs a closer look before we can give you a fair score. This does not mean your answers are wrong.")
    if pending:
        parts.append(f"{pending} question(s) could not be scored reliably. Your teacher or lecturer will check the original answers; these have not been counted as zero.")
    parts.append("These marks and comments are provisional. Your teacher or lecturer will review them before moderation and final approval.")
    return ' '.join(parts)
