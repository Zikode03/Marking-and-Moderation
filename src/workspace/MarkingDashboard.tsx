import { ArrowRight, BookOpen, CheckCircle2, Clock3, Files, GraduationCap, Layers3, Upload, AlertCircle } from 'lucide-react';
import type { Academics } from './types';
import type { ModelStatus, QueueKind, WorkRow } from './markingData';
import { queueStatuses } from './markingData';
import './overview.css';

export default function MarkingDashboard({ school, academics, rows, model, loading, canUpload, canReview = false, canModerate, canApprove, manager, educatorRole, onQueue, onUpload }: {
  school: boolean; academics: Academics; rows: WorkRow[]; model: ModelStatus; loading: boolean; canUpload: boolean; canReview?: boolean; canModerate: boolean; canApprove: boolean; manager: boolean; educatorRole?: string;
  onQueue: (queue: QueueKind) => void; onUpload: () => void;
}) {
  const count = (statuses: string[]) => rows.filter(row => statuses.includes(row.status)).length;
  const reviewLabel = school ? 'Teacher review' : 'Academic review';
  const allocations = school
    ? [...new Map(academics.allocations.filter(a => a.grade !== null).map(a => [`${a.grade}-${a.subject}`, { code: `Grade ${a.grade}`, title: a.subject || 'Subject', detail: 'Teaching allocation' }])).values()]
    : academics.modules.filter(m => manager || !academics.allocations.some(a => a.moduleId) || academics.allocations.some(a => a.moduleId === m.id)).map(m => ({ code: m.code, title: m.name, detail: academics.faculties.find(f => f.id === m.facultyId)?.name || 'Faculty' }));
  const grouped = new Map<string, WorkRow[]>();
  for (const row of rows) {
    const scripts = grouped.get(row.batchId);
    if (scripts) scripts.push(row); else grouped.set(row.batchId, [row]);
  }
  const batches = [...grouped.values()].map(scripts => ({ ...scripts[0], scripts, approved: scripts.filter(script => script.status === 'Approved').length })).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  const reviewed = count(['TeacherReviewed', 'Moderated', 'Approved']);
  const approved = count(['Approved']);
  const cards: { label: string; value: number; queue: QueueKind; hint: string; icon: typeof Files }[] = [
    { label: reviewLabel, value: count(queueStatuses.review), queue: 'review', hint: 'Provisional marks needing your judgement', icon: BookOpen },
    { label: 'In marking', value: count(['Uploaded', 'Queued', 'Processing', 'Failed']), queue: 'marking', hint: `${count(['Processing', 'Queued'])} processing / ${count(['Failed'])} failed`, icon: Files },
    { label: 'Awaiting moderation', value: count(queueStatuses.moderation), queue: 'moderation', hint: 'Reviewed scripts ready for moderation', icon: Layers3 },
    { label: 'Completed', value: approved, queue: 'completed', hint: 'Results approved for release', icon: CheckCircle2 },
  ];
  const tasks: { label: string; hint: string; count: number; queue: QueueKind }[] = [
    ...(canReview ? [{ label: 'Review provisional marks', hint: 'Inspect flags and compare answers with the memo.', count: count(queueStatuses.review), queue: 'review' as const }] : []),
    ...(canModerate ? [{ label: 'Moderate reviewed scripts', hint: 'Check the evidence and record your decision.', count: count(queueStatuses.moderation), queue: 'moderation' as const }] : []),
    ...(canApprove ? [{ label: 'Approve moderated results', hint: 'Complete the final academic check.', count: count(['Moderated']), queue: 'approval' as const }] : []),
    { label: 'Retry failed processing', hint: 'Check the error before retrying a script.', count: count(['Failed']), queue: 'marking' },
    { label: 'Prepare uploaded scripts', hint: model.ready ? 'Open the marking queue to begin.' : 'Collect files while the local model is prepared.', count: count(['Uploaded']), queue: 'marking' },
  ];
  return <div className={`marking-dashboard educator-overview ${school ? 'teacher-overview' : 'academic-overview'}`}>
    <section className="overview-intro"><div><span className="overview-kicker">{manager ? 'ORGANISATION OVERVIEW' : `${educatorRole || (school ? 'Teacher' : 'Academic')} overview`}</span><h2>{school ? 'Your marking day, at a glance.' : 'Your modules. Your marking priorities.'}</h2><p>{school ? 'Manage your Grade 8–12 scripts, review flagged answers and follow results through moderation.' : 'Follow your faculty modules from uploaded scripts through academic review and approved results.'}</p></div>{canUpload && <button onClick={onUpload}><Upload size={17}/>Upload scripts</button>}</section>
    <div className="overview-model"><span className={model.ready ? 'model-dot ready' : 'model-dot'}/><strong>{model.ready ? 'Local AI ready' : 'Local AI not ready'}</strong><span>{model.ready ? 'AI marks are provisional until staff review and approval.' : 'A trained, validated model must be connected before AI marking.'}</span><small>{loading ? 'Loading scripts...' : `${rows.length} scripts / ${batches.length} ${batches.length === 1 ? 'batch' : 'batches'}`}</small></div>
    <div className="stats dashboard-stats overview-metrics">{cards.map(({ icon: Icon, ...card }) => <button className="stat metric-card" key={card.label} disabled={loading} onClick={() => onQueue(card.queue)}><span>{card.label}</span><strong>{loading ? '\u2014' : card.value}</strong><small>{card.hint}</small><Icon size={20}/></button>)}</div>
    <div className="overview-work-grid"><section className="panel overview-attention"><div className="overview-panel-heading"><div><span className="overview-kicker">NEXT STEPS</span><h2>What needs your attention</h2></div><Clock3 size={20}/></div>{loading ? <p role="status">Loading your queues...</p> : <>{tasks.filter(task => task.count > 0).map(task => <button className="overview-task" key={task.label} onClick={() => onQueue(task.queue)}><span className="overview-task-count">{task.count}</span><span><strong>{task.label}</strong><small>{task.hint}</small></span><ArrowRight size={17}/></button>)}{!tasks.some(task => task.count > 0) && <div className="overview-clear"><CheckCircle2 size={30}/><h3>No outstanding actions</h3><p>{rows.length ? 'Your current queues are clear. Follow submitted work in recent batches.' : 'Upload existing scripts and their approved memo to get started.'}</p>{canUpload && <button className="secondary" onClick={onUpload}>Upload your first batch<ArrowRight size={16}/></button>}</div>}</>}</section>
      <section className="panel overview-allocations"><div className="overview-panel-heading"><div><span className="overview-kicker">{school ? 'TEACHING ALLOCATIONS' : 'FACULTIES & MODULES'}</span><h2>{manager ? 'Academic responsibilities' : school ? 'Your grades & subjects' : 'Your allocated modules'}</h2></div><GraduationCap size={22}/></div><div className="overview-allocation-list">{allocations.map(item => <article key={`${item.code}-${item.title}-${item.detail}`}><span>{item.code}</span><div><h3>{item.title}</h3><p>{item.detail}</p></div></article>)}</div>{!allocations.length && <p className="academic-empty">{manager ? 'Allocate teaching responsibilities under staff management to get started.' : 'No teaching allocation is available. Ask your administrator to assign your subjects or modules.'}</p>}</section></div>
    <section className="panel overview-batches"><div className="overview-panel-heading"><div><span className="overview-kicker">WORK IN PROGRESS</span><h2>Recent batches</h2></div><span className="overview-batch-total">{reviewed} reviewed / {approved} approved</span></div>{loading ? <p role="status">Loading batches...</p> : batches.length ? <div className="overview-batch-list">{batches.slice(0, 5).map(batch => { const failures = batch.scripts.filter(s => s.status === 'Failed').length; const needsReview = batch.scripts.some(s => queueStatuses.review.includes(s.status)); const queue: QueueKind = batch.approved === batch.scripts.length ? 'completed' : canReview && needsReview ? 'review' : canModerate && batch.scripts.some(s => s.status === 'TeacherReviewed') ? 'moderation' : canApprove && batch.scripts.some(s => s.status === 'Moderated') ? 'approval' : 'marking'; return <article key={batch.batchId}><div className="overview-batch-icon"><Files size={22}/></div><div className="overview-batch-name"><h3>{batch.title}</h3><p>{batch.context}</p><small>{batch.scripts.length} scripts{failures > 0 && <span className="overview-failed"><AlertCircle size={12}/> {failures} failed</span>}</small></div><div className="overview-progress"><span>{batch.approved} / {batch.scripts.length} approved</span><progress aria-label={`Approved scripts for ${batch.title}`} value={batch.approved} max={batch.scripts.length}/></div><button className="secondary" onClick={() => onQueue(queue)}>Open queue<ArrowRight size={15}/></button></article>; })}</div> : <p className="academic-empty">No script batches yet. Existing papers, memorandums and scripts will appear here after upload.</p>}</section>
  </div>;
}
