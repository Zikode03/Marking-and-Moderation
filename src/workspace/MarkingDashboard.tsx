import { ArrowRight, CheckCircle2, Clock3, Files, ScanLine } from 'lucide-react';
import type { Academics } from './types';
import type { ModelStatus, QueueKind, WorkRow } from './markingData';
import { queueStatuses } from './markingData';

export default function MarkingDashboard({ school, academics, rows, model, loading, canUpload, canModerate, canApprove, manager, onQueue, onUpload }: {
  school: boolean; academics: Academics; rows: WorkRow[]; model: ModelStatus; loading: boolean; canUpload: boolean; canModerate: boolean; canApprove: boolean; manager: boolean;
  onQueue: (queue: QueueKind) => void; onUpload: () => void;
}) {
  const count = (statuses: string[]) => rows.filter(row => statuses.includes(row.status)).length;
  const responsibilities = school ? [...new Set(academics.allocations.filter(a => a.grade !== null).map(a => `Grade ${a.grade} · ${a.subject}`))] : academics.modules.map(m => `${academics.faculties.find(f => f.id === m.facultyId)?.name || 'Faculty'} · ${m.code} · ${m.name}`);
  const cards: { label: string; value: number; queue: QueueKind; hint: string }[] = [
    { label: 'Waiting to mark', value: count(['Uploaded']), queue: 'marking', hint: 'Files saved and ready to queue' },
    { label: 'Processing', value: count(['Queued', 'Processing']), queue: 'marking', hint: 'Queued or being marked by AI' },
    { label: 'Needs attention', value: count(['NeedsAttention', 'Failed']), queue: canModerate ? 'moderation' : 'marking', hint: `${count(['Failed'])} failed · ${count(['NeedsAttention'])} flagged for review` },
    { label: 'Awaiting moderation', value: count(queueStatuses.moderation), queue: 'moderation', hint: 'Includes flagged answers' },
    { label: 'Awaiting approval', value: count(['Moderated']), queue: 'approval', hint: 'Human moderation completed' },
    { label: 'Completed', value: count(['Approved']), queue: 'completed', hint: 'Approved results available' },
  ];
  return <div className="marking-dashboard">
    <section className="workspace-welcome"><div><span>{manager ? 'YOUR ORGANISATION AT A GLANCE' : school ? 'YOUR TEACHING WORKSPACE' : 'YOUR ACADEMIC WORKSPACE'}</span><h2>{canModerate ? 'Give every flagged answer a fair review.' : canApprove && !canUpload ? 'The final check before results are released.' : 'Less administration. More time for your students.'}</h2><p>{school ? 'Work is organised by your Grade 8–12 subjects.' : 'Work is organised by faculty and allocated module.'} AI marks remain provisional until human moderation and approval.</p></div>{canUpload ? <button onClick={onUpload}>Upload scripts<ArrowRight size={16}/></button> : <button onClick={() => onQueue(canModerate ? 'moderation' : 'approval')}>Open your queue<ArrowRight size={16}/></button>}</section>
    <div className="dashboard-summary"><span><Files size={17}/>{loading ? 'Loading scripts…' : `${rows.length} scripts across ${new Set(rows.map(r => r.batchId)).size} batches`}</span><span><CheckCircle2 size={17}/>{model.ready ? 'Local AI ready' : 'Local model awaiting training'}</span></div>
    <div className="stats dashboard-stats">{cards.map(card => <button className="stat metric-card" key={card.label} disabled={loading} onClick={() => onQueue(card.queue)}><span>{card.label}</span><strong>{loading ? '—' : card.value}</strong><small>{card.hint}</small><ArrowRight size={16}/></button>)}</div>
    <div className="dashboard-columns"><section className="panel"><div className="headrow"><h2>{manager ? 'Academic responsibilities' : 'Your responsibilities'}</h2><ScanLine size={20}/></div>{responsibilities.length ? <ul className="responsibility-list">{responsibilities.map(item => <li key={item}>{item}</li>)}</ul> : <p className="academic-empty">{manager ? 'Allocate teaching responsibilities under staff management to get started.' : 'No teaching allocation is available. Ask your administrator to assign your subjects or modules.'}</p>}</section>
      <section className="panel"><h2><Clock3 size={18}/> What needs your attention</h2>{loading ? <p role="status">Loading your queues…</p> : <>
        {canModerate && <button className="dashboard-task" onClick={() => onQueue('moderation')}><span><strong>{count(queueStatuses.moderation)} scripts to moderate</strong><small>Inspect evidence and confirm question marks</small></span><ArrowRight size={17}/></button>}
        {canApprove && <button className="dashboard-task" onClick={() => onQueue('approval')}><span><strong>{count(['Moderated'])} results to approve</strong><small>Review moderated results before final approval</small></span><ArrowRight size={17}/></button>}
        <button className="dashboard-task" onClick={() => onQueue('marking')}><span><strong>{count(['Uploaded', 'Failed'])} scripts waiting or failed</strong><small>{model.ready ? 'Start marking or retry failed processing' : 'Files can be collected while the local model is prepared'}</small></span><ArrowRight size={17}/></button>
        {!model.ready && <p className="muted">No trained marking model is connected. Uploads and expert training examples can still be collected.</p>}
      </>}</section></div>
  </div>;
}
