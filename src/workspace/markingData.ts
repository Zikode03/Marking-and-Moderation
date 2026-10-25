import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../auth/session';
import type { BatchSummary } from './AiBatchReview';
import { assessmentContext, type Assessment } from './types';

export type QueueKind = 'marking' | 'moderation' | 'approval' | 'completed';
export type ModelStatus = { ready: boolean; status: string; model: string | null; languages?: string[] };
export type WorkRow = BatchSummary['scripts'][number] & { batchId: string; title: string; context: string; assessmentId: string; createdAt: string };
export const queueLabels: Record<QueueKind, string> = { marking: 'AI marking', moderation: 'Moderation', approval: 'Approvals', completed: 'Completed' };
export const queueStatuses: Record<QueueKind, string[]> = {
  marking: ['Uploaded', 'Queued', 'Processing', 'Failed'], moderation: ['NeedsAttention', 'AwaitingModeration'], approval: ['Moderated'], completed: ['Approved'],
};
export function workRows(batches: BatchSummary[], assessments: Assessment[]): WorkRow[] {
  const index = new Map(assessments.map(a => [a.id, a]));
  return batches.flatMap(batch => {
    const assessment = index.get(batch.assessmentId);
    return assessment ? batch.scripts.map(script => ({ ...script, batchId: batch.id, assessmentId: assessment.id, title: assessment.title, context: assessmentContext(assessment), createdAt: batch.createdAt || '' })) : [];
  });
}
export function useMarkingFeed(enabled = true) {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [model, setModel] = useState<ModelStatus>({ ready: false, status: 'Checking local model…', model: null });
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const running = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (running.current) return;
    running.current = true;
    try {
      const [rows, health] = await Promise.all([request<BatchSummary[]>('/api/ai/batches', { signal }), request<ModelStatus>('/api/ai/status', { signal })]);
      if (!signal?.aborted) { setBatches(rows); setModel(health); setError(''); }
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Could not refresh script queues.');
    } finally { running.current = false; if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    // Each effect owns its request; cleanup also handles React StrictMode remounts.
    const controller = new AbortController();
    let stopped = false;
    const tick = async () => { await refresh(controller.signal); if (!stopped) timer = window.setTimeout(tick, 6000); };
    let timer = window.setTimeout(tick, 0);
    return () => { stopped = true; controller.abort(); window.clearTimeout(timer); };
  }, [enabled, refresh]);
  return { batches, model, error, loading, refresh };
}
export type MarkingFeed = ReturnType<typeof useMarkingFeed>;
