import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { request } from '../auth/session';
import AiBatchReview, { downloadBatchFile, type BatchDetail, type ReviewDraft } from './AiBatchReview';
import type { WorkRow } from './markingData';
import TrainingExamples from './TrainingExamples';
const Viewer = lazy(() => import('./ScriptPageViewer'));
const emptyAnnotations: [] = [];
export default function ReviewDesk({ row, position, count, canReview = false, canModerate, canApprove, canLabel, manager, draft, onDraftChange, onMove, onClose, onSaved }: {
  row: WorkRow; position: number; count: number; canReview?: boolean; canModerate: boolean; canApprove: boolean; canLabel: boolean; manager: boolean; draft?: ReviewDraft;
  onDraftChange: (draft?: ReviewDraft) => void; onMove: (offset: number) => void; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<BatchDetail | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState({ page: 1, request: 0 }); const [document, setDocument] = useState<'memo' | 'paper'>('memo');
  const heading = useRef<HTMLHeadingElement>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const value = await request<BatchDetail>(`/api/ai/batches/${row.batchId}`, { signal });
    if (!signal?.aborted) { setDetail(value); setError(''); }
  }, [row.batchId]);
  useEffect(() => {
    setDetail(null); const controller = new AbortController(); let stopped = false;
    const tick = async () => { try { await refresh(controller.signal); } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load this script.'); } if (!stopped) timer = window.setTimeout(tick, 6000); };
    let timer = window.setTimeout(tick, 0);
    return () => { stopped = true; controller.abort(); window.clearTimeout(timer); };
  }, [refresh]);
  useEffect(() => { setFocus({ page: 1, request: 0 }); heading.current?.focus(); }, [row.id]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || busy) return;
      if (event.key.toLowerCase() === 'j' && position < count - 1) { event.preventDefault(); onMove(1); }
      if (event.key.toLowerCase() === 'k' && position > 0) { event.preventDefault(); onMove(-1); }
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [onMove, position, count, busy]);
  const script = detail?.scripts.find(s => s.id === row.id);
  return <section className="review-desk" aria-label="Script review desk">
    <div className="review-toolbar"><div><span className="eyebrow">SCRIPT {position + 1} OF {count}</span><h2 ref={heading} tabIndex={-1}>Candidate {row.candidate}</h2><p>{row.title} · {row.context}</p></div><div className="buttons"><button className="secondary" disabled={position === 0 || busy} onClick={() => onMove(-1)}><ArrowLeft size={16}/>Previous script</button><button className="secondary" disabled={position >= count - 1 || busy} onClick={() => onMove(1)}>Next script<ArrowRight size={16}/></button><button className="secondary" disabled={busy} onClick={onClose}><X size={16}/>Close review</button></div></div>
    <p className="muted">Alt + J: next script · Alt + K: previous script. Review drafts stay in this signed-in workspace; submit a decision to save it to the server.</p>
    {error && <div className="alert error" role="alert">{error}<button className="secondary" onClick={() => void refresh().catch(cause => setError(String(cause)))}>Retry</button></div>}
    {!script ? <p role="status">{detail ? 'This script is no longer available in the batch.' : 'Loading script and memorandum…'}</p> : <>
      <div className="review-columns">
        <section className="review-document"><h3>Candidate script</h3><Suspense fallback={<p role="status">Loading script viewer…</p>}><Viewer batchId={row.batchId} scriptId={row.id} annotations={script.result?.questions.flatMap(q => q.annotations || []) || emptyAnnotations} focusPage={focus.page} focusRequest={focus.request}/></Suspense></section>
        <section className="review-document"><label>Reference document<select value={document} onChange={e => setDocument(e.target.value as 'memo' | 'paper')}><option value="memo">Approved memorandum</option><option value="paper">Question paper</option></select></label><Suspense fallback={<p role="status">Loading reference…</p>}><Viewer key={`${row.batchId}-${document}`} batchId={row.batchId} scriptId={document} annotations={emptyAnnotations} title={document === 'memo' ? 'Approved memorandum' : 'Question paper'}/></Suspense></section>
        <AiBatchReview key={row.id} script={script} canReview={canReview} canModerate={canModerate} canApprove={canApprove} draft={draft} onDraftChange={onDraftChange} onBusyChange={setBusy} embedded onFocusPage={page => setFocus(previous => ({ page, request: previous.request + 1 }))} onSaved={async () => { await refresh(); await onSaved(); }}/>
      </div>
      <div className="ai-file-actions"><button className="secondary" onClick={() => void downloadBatchFile(row.batchId, 'results', 'approved-results.csv').catch(cause => setError(String(cause)))}>Export approved batch results</button></div>
      <TrainingExamples key={row.batchId} batch={detail!} canLabel={canLabel} canVerify={canModerate} canExport={manager}/>
    </>}
  </section>;
}
