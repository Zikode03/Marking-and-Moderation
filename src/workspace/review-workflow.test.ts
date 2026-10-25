import { describe, expect, it } from 'vitest';
import { queueLabels, queueStatuses } from './markingData';
import { statusLabel } from './AiBatchReview';

describe('AI-first academic review workflow', () => {
  it('keeps teacher review separate from HOD moderation and approval', () => {
    expect(queueStatuses.review).toEqual(['NeedsAttention', 'AwaitingModeration', 'ReturnedToTeacher']);
    expect(queueStatuses.moderation).toEqual(['TeacherReviewed']);
    expect(queueStatuses.approval).toEqual(['Moderated']);
    expect(queueStatuses.completed).toEqual(['Approved']);
    expect(queueLabels.review).toBe('Teacher review');
  });
  it('makes every human review state understandable', () => {
    expect(statusLabel('AwaitingModeration')).toBe('Awaiting teacher review');
    expect(statusLabel('TeacherReviewed')).toBe('Awaiting HOD moderation');
    expect(statusLabel('ReturnedToTeacher')).toBe('Returned to teacher');
  });
});
