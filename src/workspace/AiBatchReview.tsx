import { lazy, Suspense, useState } from 'react';
import { request } from '../auth/session';
import { annotationLabels, languageLabel } from './markingLanguages';
const ScriptPageViewer = lazy(() => import('./ScriptPageViewer'));
export type ScriptAnnotation = {page: number; x: number; y: number; width: number; height: number; kind: string; note: string};
export type QuestionMark = { number: string; maxMarks: number; marks: number | null; evidence: string; feedback: string; needsReview: boolean; memoEvidence?: string; detectedLanguage?: string; readingConfidence?: number; annotations?: ScriptAnnotation[] };
export type MarkedScript = { id: string; batchId: string; candidate: string; fileName: string; status: string; revision: number; total: number | null; error: string | null; model: string | null; result: { needsAttention: boolean; summary: string; questions: QuestionMark[] } | null; audit: { at: string; actor: string; action: string; reason: string }[] };
export type BatchSummary = { id: string; assessmentId: string; createdAt?: string; paperName: string; memoName: string; scriptLanguage?: string; memoLanguage?: string; scripts: { id: string; candidate: string; status: string; error: string | null }[] };
export type BatchDetail = Omit<BatchSummary, 'scripts'> & { scripts: MarkedScript[] };
export const statusLabel = (status: string) => ({ Uploaded: 'Uploaded', Queued: 'Queued', Processing: 'AI marking', NeedsAttention: 'Needs attention', AwaitingModeration: 'Awaiting teacher review', TeacherReviewed: 'Awaiting HOD moderation', ReturnedToTeacher: 'Returned to teacher', Moderated: 'Awaiting approval', Approved: 'Approved', Failed: 'Processing failed' }[status] || status);

export async function downloadBatchFile(batch: string, file: string, filename: string) {
  const blob = await request<Blob>(`/api/ai/batches/${batch}/${file === "results" ? "results" : `files/${file}`}`, { headers: { Accept: 'application/octet-stream' } });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type ReviewDraft = { revision: number; marks: Record<string, string>; reason: string };
export default function AiBatchReview({ script, canReview = false, canModerate, canApprove, onSaved, draft, onDraftChange, embedded = false, onFocusPage, onBusyChange }: { script: MarkedScript; canReview?: boolean; canModerate: boolean; canApprove: boolean; onSaved: () => Promise<void>; draft?: ReviewDraft; onDraftChange?: (draft?: ReviewDraft) => void; embedded?: boolean; onFocusPage?: (page: number) => void; onBusyChange?: (busy: boolean) => void }) {
  const [localDraft, setLocalDraft] = useState<ReviewDraft | undefined>();
  const currentDraft = onDraftChange ? draft : localDraft;
  const marks = currentDraft?.marks || {}; const reason = currentDraft?.reason || '';
  const dirty = !!currentDraft; const stale = dirty && currentDraft.revision !== script.revision;
  function change(next?: ReviewDraft) { if (onDraftChange) onDraftChange(next); else setLocalDraft(next); }
  function edit(patch: Partial<ReviewDraft>) { change({ revision: currentDraft?.revision ?? script.revision, marks, reason, ...patch }); }
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false); const [focusPage, setFocusPage] = useState(1);
  const [focusRequest, setFocusRequest] = useState(0);
  const annotations = script.result?.questions.flatMap(question => question.annotations || []) || [];
  const teacherReviewable = canReview && ['AwaitingModeration', 'NeedsAttention', 'ReturnedToTeacher'].includes(script.status);
  const hodReviewable = canModerate && script.status === 'TeacherReviewed';
  const reviewable = teacherReviewable || hodReviewable;
  const draftValues = script.result?.questions.map(q => ({ value: marks[q.number] ?? (q.marks === null ? '' : String(q.marks)), max: q.maxMarks })) || [];
  const completeDraft = draftValues.length > 0 && draftValues.every(q => q.value.trim() && Number.isFinite(Number(q.value)) && Number(q.value) >= 0 && Number(q.value) <= q.max);
  async function action(kind: 'review' | 'moderate' | 'return' | 'approve') {
    if (busy || stale || saved) return;
    setBusy(true); onBusyChange?.(true); setError('');
    try {
      const entered = Object.fromEntries((script.result?.questions || []).map(q => [q.number, marks[q.number] ?? (q.marks === null ? '' : String(q.marks))]));
      if ((kind === 'review' || kind === 'moderate') && (script.result?.questions || []).some(q => !entered[q.number].trim() || !Number.isFinite(Number(entered[q.number])) || Number(entered[q.number]) < 0 || Number(entered[q.number]) > q.maxMarks)) throw new Error('Confirm or correct every AI-suggested mark against the memorandum.');
      await request(`/api/ai/batches/${script.batchId}/scripts/${script.id}/${kind}`, { method: 'POST', body: JSON.stringify({ revision: script.revision, reason, marks: kind === 'review' || kind === 'moderate' ? Object.fromEntries(Object.entries(entered).map(([key, value]) => [key, Number(value)])) : null }) });
      setSaved(true); change();
      try { await onSaved(); } catch { setError('Your decision was saved, but the view could not refresh. Reopen this script to see its current status.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the review.'); } finally { setBusy(false); onBusyChange?.(false); }
  }
  return <section className="panel ai-review"><div className="headrow"><h2>Script {script.candidate}</h2><span className="tag">{statusLabel(script.status)}</span></div>
    <button className="secondary" onClick={() => void downloadBatchFile(script.batchId, script.id, script.fileName).catch(cause => setError(String(cause)))}>Download original script</button>
    {!embedded && <button className="secondary" onClick={() => setPreview(value => !value)}>{preview ? 'Close script preview' : 'View script & review circles'}</button>}
    {preview && <Suspense fallback={<p role="status">Loading script viewer…</p>}><ScriptPageViewer batchId={script.batchId} scriptId={script.id} annotations={annotations} focusPage={focusPage} focusRequest={focusRequest}/></Suspense>}
    {script.error && <p className="alert error">{script.error}</p>}
    {dirty && <div className={`alert ${stale ? 'error' : ''}`} role="status">{stale ? 'This script changed since you began editing. Discard your draft and review the latest marks before submitting.' : 'Draft kept while you switch scripts. It has not been submitted and will clear when you sign out or close this tab.'}<button className="secondary" disabled={busy} onClick={() => change()}>Discard draft</button></div>}
    {saved && <p className="alert success" role="status">Decision saved.</p>}
    {script.result ? <><p>{script.result.summary}</p><p className="muted">Local model: {script.model}. Marks remain provisional until moderation and approval.</p>
      <div className="ai-questions">{script.result.questions.map(q => <article key={q.number} className={q.needsReview ? 'ai-question flagged' : 'ai-question'}><div className="headrow"><h3>Question {q.number}</h3><strong>{q.marks ?? 'Review needed'} / {q.maxMarks}</strong></div>
        <p><strong>Answer evidence:</strong> {q.evidence || 'No readable evidence returned.'}</p><p>{q.feedback}</p>
        {q.memoEvidence && <p><strong>Memorandum evidence:</strong> {q.memoEvidence}</p>}
        {q.detectedLanguage && <p className="muted">{languageLabel(q.detectedLanguage)} · Reading confidence (model estimate): {q.readingConfidence === undefined ? 'Not reported' : `${Math.round(q.readingConfidence * 100)}%`}</p>}
        {q.annotations?.map((annotation, index) => <div key={index} className="script-review-note"><strong>{annotationLabels[annotation.kind] || 'Review required'}</strong><p>{annotation.note}</p><button className="secondary" onClick={() => {setFocusPage(annotation.page); setFocusRequest(value => value + 1); if (embedded) onFocusPage?.(annotation.page); else setPreview(true);}}>Show circle · page {annotation.page}</button></div>)}
        {q.needsReview && !q.annotations?.length && <p className="muted">Review required; the model did not provide a reliable page location.</p>}
        {reviewable && <label>Confirmed mark · Question {q.number}<input type="number" min={0} max={q.maxMarks} step="0.5" disabled={busy || stale || saved} value={marks[q.number] ?? (q.marks === null ? '' : String(q.marks))} onChange={e => edit({ marks: { ...marks, [q.number]: e.target.value } })} /></label>}
      </article>)}</div>
      <p><strong>{script.total === null ? 'Total withheld until flagged answers are resolved.' : `Total: ${script.total}`}</strong></p>
      {dirty && reviewable && <p className="draft-total"><strong>{completeDraft ? `Draft total: ${draftValues.reduce((sum, q) => sum + Number(q.value), 0)} / ${draftValues.reduce((sum, q) => sum + q.max, 0)}` : 'Draft total: confirm a valid mark for every question.'}</strong></p>}
      {reviewable && <><label>{teacherReviewable ? 'Teacher review notes / verified learner improvements' : 'HOD moderation reason'}<textarea value={reason} disabled={busy || stale || saved} onChange={e => edit({ reason: e.target.value })} maxLength={5000} required /></label><button disabled={busy || stale || saved || !reason.trim() || !completeDraft} onClick={() => void action(teacherReviewable ? 'review' : 'moderate')}>{teacherReviewable ? 'Confirm AI marks & send to HOD' : 'Approve HOD moderation'}</button>{hodReviewable && <button className="secondary" disabled={busy || stale || saved || !reason.trim()} onClick={() => void action('return')}>Return to teacher for correction</button>}</>}
      {canApprove && script.status === 'Moderated' && <button disabled={busy || saved || stale} onClick={() => void action('approve')}>Approve result</button>}
    </> : <p className="academic-empty">{script.status === 'Processing' || script.status === 'Queued' ? 'The local AI is processing this script.' : 'No AI marks yet. Start marking when your local model is ready.'}</p>}
    {error && <p role="alert" className="alert error">{error}</p>}
    {!!script.audit?.length && <details><summary>Marking history</summary>{script.audit.map((entry, i) => <p key={i}><strong>{entry.action}</strong> · {new Date(entry.at).toLocaleString('en-ZA')} · {entry.actor}<br />{entry.reason}</p>)}</details>}
  </section>;
}
