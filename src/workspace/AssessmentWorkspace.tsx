import { useEffect, useMemo, useState } from 'react';
import { Search, Upload, Play, RefreshCw, ArrowRight } from 'lucide-react';
import { request, type OrganisationSelection } from '../auth/session';
import type { Academics, Assessment, RunAction } from './types';
import { statusLabel, type ReviewDraft } from './AiBatchReview';
import { queueLabels, queueStatuses, useMarkingFeed, workRows, type MarkingFeed, type QueueKind, type WorkRow } from './markingData';
import UploadWizard from './UploadWizard';
import ReviewDesk from './ReviewDesk';

export default function AssessmentWorkspace({ selection, academics, assessments, manager, busy, run, canModerate = false, canApprove = false, canUpload = true, canLabel = false, feed: suppliedFeed, queue: suppliedQueue, onQueueChange, uploadRequest = 0, active = true }: {
  selection: OrganisationSelection; academics: Academics; assessments: Assessment[]; manager: boolean; busy: boolean; run: RunAction; canModerate?: boolean; canApprove?: boolean; canUpload?: boolean; canLabel?: boolean;
  feed?: MarkingFeed; queue?: QueueKind; onQueueChange?: (queue: QueueKind) => void; uploadRequest?: number; active?: boolean;
}) {
  const localFeed = useMarkingFeed(!suppliedFeed); const feed = suppliedFeed || localFeed;
  const [localQueue, setLocalQueue] = useState<QueueKind>('marking'); const queue = suppliedQueue || localQueue;
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState(''); const [assessmentId, setAssessmentId] = useState(''); const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest'); const [page, setPage] = useState(0); const [error, setError] = useState(''); const [starting, setStarting] = useState('');
  const [desk, setDesk] = useState<{ rows: WorkRow[]; index: number } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  useEffect(() => { if (uploadRequest && canUpload) setUploadOpen(true); }, [uploadRequest, canUpload]);
  useEffect(() => { setStatus(''); setPage(0); setDesk(null); }, [queue]);
  useEffect(() => { if (!active) setDesk(null); }, [active]);
  useEffect(() => { setPage(0); }, [search, assessmentId, status, sort]);
  useEffect(() => {
    if (!Object.keys(drafts).length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [drafts]);
  const rows = useMemo(() => workRows(feed.batches, assessments), [feed.batches, assessments]);
  const filtered = useMemo(() => rows.filter(row => queueStatuses[queue].includes(row.status) && (!assessmentId || row.assessmentId === assessmentId) && (!status || row.status === status) && `${row.candidate} ${row.title} ${row.context}`.toLowerCase().includes(search.toLowerCase().trim())).sort((a,b) => {
    if (sort === 'candidate') return a.candidate.localeCompare(b.candidate, undefined, { numeric: true });
    if (sort === 'attention') { const rank = (s: string) => ['Failed', 'NeedsAttention', 'AwaitingModeration', 'Uploaded'].indexOf(s); return (rank(a.status) < 0 ? 9 : rank(a.status)) - (rank(b.status) < 0 ? 9 : rank(b.status)) || a.candidate.localeCompare(b.candidate); }
    return (sort === 'oldest' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt) || a.candidate.localeCompare(b.candidate, undefined, { numeric: true });
  }), [rows, queue, assessmentId, status, search, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 15)); const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * 15, (currentPage + 1) * 15);
  function changeQueue(next: QueueKind) { setLocalQueue(next); onQueueChange?.(next); }
  async function start(batchId: string) {
    setStarting(batchId); setError('');
    try { await request(`/api/ai/batches/${batchId}/start`, { method: 'POST' }); await feed.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start marking.'); }
    finally { setStarting(''); }
  }
  const selected = desk?.rows[desk.index];
  return <div className="ai-workspace">
    <div className={`alert model-banner ${feed.model.ready ? 'success' : ''}`} role="status"><strong>{feed.model.ready ? 'Local AI ready' : 'Local model not ready'}</strong><span>{feed.model.model || feed.model.status}{!feed.model.ready && ' · Uploads can be saved now. AI marks will appear after a trained local model is connected.'}</span></div>
    {(error || feed.error) && <p className="alert error" role="alert">{error || feed.error}</p>}
    {uploadOpen && canUpload && <div hidden={queue !== 'marking'}><UploadWizard selection={selection} academics={academics} manager={manager} onClose={() => setUploadOpen(false)} onUploaded={async () => { await run(async () => { await feed.refresh(); }, 'Scripts uploaded. Originals are saved.'); }}/></div>}
    {uploadOpen && canUpload && queue === 'marking' ? null
    : selected && desk ? <ReviewDesk row={selected} position={desk.index} count={desk.rows.length} canModerate={canModerate && queue === 'moderation'} canApprove={canApprove && queue === 'approval'} canLabel={canLabel} manager={manager} draft={drafts[selected.id]} onDraftChange={draft => setDrafts(previous => { const next = { ...previous }; if (draft) next[selected.id] = draft; else delete next[selected.id]; return next; })} onMove={offset => setDesk(previous => previous ? { ...previous, index: Math.max(0, Math.min(previous.rows.length - 1, previous.index + offset)) } : null)} onClose={() => setDesk(null)} onSaved={async () => { await feed.refresh(); }}/>
    : <>
      <div className="queue-heading"><div><h2>{queueLabels[queue]} queue</h2><p>{queue === 'marking' ? 'Saved, queued, processing and failed scripts.' : queue === 'moderation' ? 'AI-marked scripts waiting for human review, including flagged answers.' : queue === 'approval' ? 'Moderated results waiting for final approval.' : 'Approved scripts and their marking history.'}</p></div>{canUpload && <button onClick={() => setUploadOpen(true)}><Upload size={16}/>Upload scripts</button>}</div>
      <div className="queue-tabs" role="group" aria-label="Script queues">{(Object.keys(queueLabels) as QueueKind[]).map(kind => <button className={queue === kind ? 'selected' : 'secondary'} aria-pressed={queue === kind} key={kind} onClick={() => changeQueue(kind)}>{queueLabels[kind]}<span>{rows.filter(r => queueStatuses[kind].includes(r.status)).length}</span></button>)}</div>
      {queue === 'marking' && canLabel && <p className="muted">Starting or retrying a batch queues every uploaded or failed script in that batch.</p>}
      <section className="panel queue-panel"><div className="queue-filters"><label className="queue-search"><Search size={16}/><span>Search scripts</span><input type="search" placeholder="Candidate, batch, subject or module" value={search} onChange={e => setSearch(e.target.value)}/></label><label>Batch<select value={assessmentId} onChange={e => setAssessmentId(e.target.value)}><option value="">All batches</option>{assessments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label><label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All queue statuses</option>{queueStatuses[queue].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label>Sort by<select value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest batch</option><option value="oldest">Oldest batch</option><option value="candidate">Candidate number</option><option value="attention">Needs attention first</option></select></label><button className="secondary" disabled={feed.loading} aria-label="Refresh batches" onClick={() => void feed.refresh()}><RefreshCw size={16}/></button></div>
      {feed.loading ? <p role="status" className="academic-empty">Loading scripts…</p> : !filtered.length ? <div className="queue-empty"><h3>{search || status || assessmentId ? 'No scripts match these filters.' : 'This queue is clear.'}</h3><p>{queue === 'marking' && canUpload ? 'Upload an existing paper, its approved memorandum and candidate scripts to begin.' : 'Scripts appear here when they reach this stage.'}</p>{(search || status || assessmentId) && <button className="secondary" onClick={() => { setSearch(''); setStatus(''); setAssessmentId(''); }}>Clear filters</button>}</div> : <>
        <div className="tablewrap"><table className="script-table"><thead><tr><th>Candidate</th><th>Batch & responsibility</th><th>Status</th><th>Action</th></tr></thead><tbody>{pageRows.map(row => <tr key={row.id}><td><strong>{row.candidate}</strong>{drafts[row.id] && <small className="draft-label">Draft kept</small>}</td><td><strong>{row.title}</strong><small>{row.context}</small></td><td><span className={`tag status-${row.status.toLowerCase()}`}>{statusLabel(row.status)}</span>{row.error && <small className="field-error">{row.error}</small>}</td><td><div className="buttons"><button className="secondary" aria-label={`Open script ${row.candidate}`} onClick={() => setDesk({ rows: filtered, index: filtered.findIndex(r => r.id === row.id) })}>{queue === 'moderation' && canModerate ? 'Review' : queue === 'approval' && canApprove ? 'Check result' : 'Open'}<ArrowRight size={14}/></button>{queue === 'marking' && canLabel && ['Uploaded','Failed'].includes(row.status) && <button disabled={!feed.model.ready || !!starting || busy} onClick={() => void start(row.batchId)} title="Queues every uploaded or failed script in this batch"><Play size={14}/>{starting === row.batchId ? 'Queueing…' : row.status === 'Failed' ? 'Retry batch' : 'Start AI marking'}</button>}</div></td></tr>)}</tbody></table></div>
        <div className="queue-pagination"><span>{currentPage * 15 + 1}–{Math.min((currentPage + 1) * 15, filtered.length)} of {filtered.length} scripts</span><div className="buttons"><button className="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous page</button><span>Page {currentPage + 1} of {pageCount}</span><button className="secondary" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next page</button></div></div>
      </>}
      </section>
      {Object.keys(drafts).length > 0 && <p className="muted">{Object.keys(drafts).length} review draft(s) kept in this workspace. Reopen a script to continue; drafts clear when you sign out or close the tab.</p>}
    </>}
  </div>;
}
