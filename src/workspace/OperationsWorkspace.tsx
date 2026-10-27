import { useCallback, useEffect, useState } from 'react';
import { request } from '../auth/session';
import { downloadBatchFile, statusLabel, type QuestionMark } from './AiBatchReview';
import type { Academics } from './types';
import type { QueueKind, WorkRow } from './markingData';
import type { ManagedRecord } from './institutionModules';
import './institution.css';
type Staff = {
  id: string;
  email: string;
  active: boolean;
  roles: string[];
};
type Task = {
  scriptId: string;
  batchId: string;
  candidate: string;
  status: string;
  stage: QueueKind;
  ownerId: string | null;
  dueAt: string | null;
};
type Report = {
  session?: string;
  className?: string;
  academicYear?: string;
  id: string;
  candidate: string;
  assessment: string;
  total: number;
  maximum: number;
  feedback: string;
  approvedAt: string;
  model: string;
  questions: QuestionMark[];
};
type Audit = {
  events: {
    id: string;
    actor: string;
    action: string;
    at: string;
    beforeJson: string;
    afterJson: string;
  }[];
  workflow: {
    recordId: string;
    candidate: string;
    actor: string;
    action: string;
    at: string;
    reason: string;
  }[];
};
function useLoad<T>(path: string, initial: T) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const value = await request<T>(path, {
        signal
      });
      if (!signal?.aborted) {
        setData(value);
        setError('');
      }
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Could not load.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    const c = new AbortController();
    void refresh(c.signal);
    return () => c.abort();
  }, [refresh]);
  return {
    data,
    error,
    loading,
    refresh
  };
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], {
    type
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const cell = (v: unknown) => '"' + String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]!);
export function TasksWorkspace({
  onQueue
}: {
  onQueue: (queue: QueueKind) => void;
}) {
  const {
    data,
    error,
    loading,
    refresh
  } = useLoad<Task[]>('/api/institution/tasks', []);
  return <section className="panel institution-workspace"><div className="headrow"><h2>Notifications & tasks</h2><button className="secondary" onClick={() => void refresh()}>Refresh tasks</button></div><p>Current work follows script status and reviewer assignments. Overdue dates remain visible until the stage is completed.</p>{error && <p role="alert" className="alert error">{error}</p>}{loading ? <p role="status">Loading tasks...</p> : !data.length ? <p>You have no outstanding tasks.</p> : <div className="tablewrap"><table><thead><tr><th>Candidate</th><th>Status</th><th>Due</th><th>Action</th></tr></thead><tbody>{data.map(t => <tr key={t.scriptId}><td>{t.candidate}</td><td>{statusLabel(t.status)}</td><td>{t.dueAt ? `${new Date(t.dueAt).toLocaleDateString()}${new Date(t.dueAt) < new Date() ? ' - Overdue' : ''}` : 'No due date'}</td><td><button onClick={() => onQueue(t.stage)}>Open {t.stage}</button></td></tr>)}</tbody></table></div>}</section>;
}
export function ReportsWorkspace({
  initialCandidate = ''
}: {
  initialCandidate?: string;
} = {}) {
  const {
    data,
    error,
    loading
  } = useLoad<Report[]>('/api/institution/results', []);
  const [candidate, setCandidate] = useState(initialCandidate);
  const [selected, setSelected] = useState<string>();
  const [session, setSession] = useState('');
  const [cohort, setCohort] = useState('');
  const rows = data.filter(r => r.candidate.toLowerCase().includes(candidate.toLowerCase()) && (!session || r.session === session) && (!cohort || r.className === cohort));
  const current = rows.find(r => r.id === selected);
  const average = rows.length ? rows.reduce((sum, r) => sum + (r.maximum ? r.total / r.maximum : 0), 0) / rows.length * 100 : 0;
  return <section className="panel institution-workspace"><div className="headrow"><h2>Approved results & reports</h2><button disabled={!rows.length} onClick={() => download('approved-results.csv', ['Candidate,Assessment,Total,Maximum,Feedback,Approved', ...rows.map(r => [r.candidate, r.assessment, r.total, r.maximum, r.feedback, r.approvedAt].map(cell).join(','))].join('\r\n'), 'text/csv;charset=utf-8')}>Export approved CSV</button></div><p>Only final approved results are included. Average percentages give each script equal weight.</p>{error && <p role="alert" className="alert error">{error}</p>}<label>Candidate reference<input type="search" value={candidate} onChange={e => setCandidate(e.target.value)} /></label><label>Examination session<select value={session} onChange={e => setSession(e.target.value)}><option value="">All sessions</option>{[...new Set(data.map(r => r.session).filter((s): s is string => !!s))].map(s => <option key={s}>{s}</option>)}</select></label><label>Class / cohort<select value={cohort} onChange={e => setCohort(e.target.value)}><option value="">All classes</option>{[...new Set(data.map(r => r.className).filter((s): s is string => !!s))].map(s => <option key={s}>{s}</option>)}</select></label><div className="report-summary"><div><strong>{rows.length}</strong>Approved scripts</div><div><strong>{new Set(rows.map(r => r.candidate)).size}</strong>Candidates</div><div><strong>{average.toFixed(1)}%</strong>Average script percentage</div></div>{loading ? <p role="status">Loading approved results...</p> : !rows.length ? <p>No approved results match.</p> : <div className="tablewrap"><table><thead><tr><th>Candidate</th><th>Assessment</th><th>Result</th><th>Report</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.candidate}</td><td>{r.assessment}</td><td>{r.total} / {r.maximum}</td><td><button className="secondary" onClick={() => setSelected(r.id)}>View report {r.candidate}</button></td></tr>)}</tbody></table></div>}{current && <article className="panel"><h3>{current.candidate} - {current.assessment}</h3><p><strong>{current.total} / {current.maximum}</strong> - Approved {new Date(current.approvedAt).toLocaleDateString()}</p><h4>Overall learner feedback</h4><p className="report-feedback">{current.feedback}</p>{current.questions.map(q => <section key={q.number}><h4>Question {q.number}: {q.marks} / {q.maxMarks}</h4><p>{q.feedback}</p></section>)}<button onClick={() => download('learner-report.html', `<!doctype html><html lang="en"><meta charset="utf-8"><title>Learner report</title><style>body{font:16px system-ui;max-width:800px;margin:40px auto;padding:20px}p{white-space:pre-wrap}</style><h1>${escape(current.candidate)}</h1><h2>${escape(current.assessment)}</h2><p>Approved result: ${current.total} / ${current.maximum}</p><p>${escape(current.feedback)}</p>${current.questions.map(q => `<h3>Question ${escape(q.number)}: ${q.marks} / ${q.maxMarks}</h3><p>${escape(q.feedback)}</p>`).join('')}<p>Approved ${escape(current.approvedAt)}</p></html>`, 'text/html;charset=utf-8')}>Download learner report</button></article>}</section>;
}
export function AuditWorkspace() {
  const [search, setSearch] = useState('');
  const {
    data,
    error,
    loading
  } = useLoad<Audit>(`/api/institution/audit?search=${encodeURIComponent(search)}`, {
    events: [],
    workflow: []
  });
  return <section className="panel institution-workspace"><h2>Audit history</h2><p>Institution changes and result decisions retain actor, time and evidence. Most recent 500 records per category are shown.</p><label>Search action, actor or candidate<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>{error && <p role="alert" className="alert error">{error}</p>}{loading ? <p role="status">Loading audit...</p> : <><h3>Institution and access changes</h3>{!data.events.length && <p>No matching institution events.</p>}{data.events.map(e => <details key={e.id}><summary>{new Date(e.at).toLocaleString()} - {e.action} - {e.actor}</summary><h4>Before</h4><pre className="audit-snapshot">{e.beforeJson || 'New record'}</pre><h4>After</h4><pre className="audit-snapshot">{e.afterJson}</pre></details>)}<h3>Result decisions</h3>{data.workflow.map((e, i) => <p key={e.recordId + String(i)}><strong>{e.candidate}: {e.action}</strong> - {e.actor} - {new Date(e.at).toLocaleString()}<br />{e.reason}</p>)}</>}</section>;
}
export function StaffAccessWorkspace() {
  const {
    data,
    error,
    refresh
  } = useLoad<Staff[]>('/api/institution/staff', []);
  const [editing, setEditing] = useState<Staff>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    if (!editing) return;
    setBusy(true);
    setMessage('');
    try {
      await request(`/api/institution/staff/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          active: editing.active,
          roles: editing.roles
        })
      });
      setEditing(undefined);
      await refresh();
      setMessage('Staff access updated. Changed roles take effect after a new sign-in.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel institution-workspace"><h2>Staff access & roles</h2><p>Only the school administrator can change access. A different administrator must change your own account.</p>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{editing && <section><h3>{editing.email}</h3><label className="check-label"><input type="checkbox" checked={editing.active} onChange={e => setEditing({
          ...editing,
          active: e.target.checked
        })} />Active account</label><div className="staff-role-options">{['Teacher', 'Lecturer', 'Professor', 'HOD', 'Moderator', 'Principal', 'SchoolAdmin', 'AcademicAdmin'].map(role => <label key={role}><input type="checkbox" checked={editing.roles.includes(role)} onChange={e => setEditing({
            ...editing,
            roles: e.target.checked ? [...editing.roles, role] : editing.roles.filter(r => r !== role)
          })} />{role}</label>)}</div><div className="buttons"><button disabled={busy || !editing.roles.length} onClick={() => void save()}>Save access</button><button disabled={busy} className="secondary" onClick={() => setEditing(undefined)}>Cancel</button></div></section>}<div className="tablewrap"><table><thead><tr><th>Staff</th><th>Roles</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.map(s => <tr key={s.id}><td>{s.email}</td><td>{s.roles.join(', ')}</td><td>{s.active ? 'Active' : 'Disabled'}</td><td><button className="secondary" disabled={!!editing} onClick={() => setEditing({
                ...s,
                roles: [...s.roles]
              })}>Manage {s.email}</button></td></tr>)}</tbody></table></div></section>;
}
export function AssignmentWorkspace({
  rows
}: {
  rows: WorkRow[];
}) {
  const {
    data: staff,
    error
  } = useLoad<Staff[]>('/api/institution/staff', []);
  const {
    data: assignments,
    refresh
  } = useLoad<ManagedRecord[]>('/api/institution/records/assignment', []);
  const {
    data: settings
  } = useLoad<ManagedRecord[]>('/api/institution/records/settings', []);
  const [scriptId, setScriptId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [moderatorId, setModeratorId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [percent, setPercent] = useState('');
  const eligible = rows.filter(r => !['Approved', 'Moderated'].includes(r.status));
  const samplePercent = Number(percent || settings[0]?.fields.moderationSamplePercent || 100);
  const sample = [...eligible].sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.ceil(eligible.length * samplePercent / 100));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const old = assignments.find(a => a.code === scriptId);
      await request(`/api/institution/assignments/${scriptId}`, {
        method: 'PUT',
        body: JSON.stringify({
          teacherId,
          moderatorId,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          revision: old?.revision || 0
        })
      });
      await refresh();
      setMessage('Reviewers assigned. Only those reviewers can make the assigned decisions.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not assign.');
    } finally {
      setBusy(false);
    }
  }
  return <section className="institution-workspace"><h2>Moderation assignments & sampling</h2><p>Sampling selects a reproducible set for inspection; every script still requires the normal teacher review, independent moderation and final approval.</p>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}<form className="panel institution-form" onSubmit={e => void save(e)}><label>Script<select required value={scriptId} onChange={e => {
          const id = e.target.value;
          setScriptId(id);
          const a = assignments.find(r => r.code === id);
          setTeacherId(a?.fields.teacherId || '');
          setModeratorId(a?.fields.moderatorId || '');
          setDueAt(a?.fields.dueAt ? new Date(a.fields.dueAt).toISOString().slice(0, 16) : '');
        }}><option value="">Choose script</option>{eligible.map(r => <option key={r.id} value={r.id}>{r.candidate} - {r.title}</option>)}</select></label><label>Teaching reviewer<select required value={teacherId} onChange={e => setTeacherId(e.target.value)}><option value="">Choose teaching staff</option>{staff.filter(s => s.active && s.roles.some(r => ['Teacher', 'Lecturer', 'Professor', 'AcademicAdmin'].includes(r))).map(s => <option key={s.id} value={s.id}>{s.email}</option>)}</select></label><label>Independent moderator<select required value={moderatorId} onChange={e => setModeratorId(e.target.value)}><option value="">Choose moderator</option>{staff.filter(s => s.id !== teacherId && s.active && s.roles.some(r => ['HOD', 'Moderator', 'AcademicAdmin'].includes(r))).map(s => <option key={s.id} value={s.id}>{s.email}</option>)}</select></label><label>Due date (local time)<input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label><button disabled={busy}>Assign reviewers</button></form><section className="panel"><label>Inspection sample (%)<input type="number" min={1} max={100} value={percent || String(samplePercent)} onChange={e => setPercent(e.target.value)} /></label><p>{sample.length} of {eligible.length} eligible scripts in this sample.</p><button className="secondary" disabled={busy || samplePercent < 1 || samplePercent > 100} onClick={() => {
        setBusy(true);
        void request(`/api/institution/samples/${samplePercent}`, {
          method: 'POST'
        }).then(() => setMessage('Inspection sample recorded in the audit.')).catch(e => setMessage(e.message)).finally(() => setBusy(false));
      }}>Record inspection sample</button><div className="tablewrap"><table><thead><tr><th>Candidate</th><th>Assessment</th><th>Teacher</th><th>Moderator</th></tr></thead><tbody>{sample.map(r => {
              const a = assignments.find(a => a.code === r.id);
              return <tr key={r.id}><td>{r.candidate}</td><td>{r.title}</td><td>{staff.find(s => s.id === a?.fields.teacherId)?.email || 'Unassigned'}</td><td>{staff.find(s => s.id === a?.fields.moderatorId)?.email || 'Unassigned'}</td></tr>;
            })}</tbody></table></div></section></section>;
}
export function DocumentsWorkspace({
  canModerate
}: {
  canModerate: boolean;
}) {
  type Document = {
    id: string;
    paperName: string;
    memoName: string;
    paperHash: string;
    memoHash: string;
    approvedBy: string | null;
    previousBatchId: string | null;
    createdAt: string;
  };
  const {
    data,
    error,
    refresh
  } = useLoad<Document[]>('/api/institution/documents', []);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function approve(id: string) {
    setBusy(true);
    try {
      await request(`/api/institution/documents/${id}/approve`, {
        method: 'POST'
      });
      await refresh();
      setMessage('This exact memorandum version is approved.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not approve.');
    } finally {
      setBusy(false);
    }
  }
  async function file(id: string, type: string, name: string) {
    try {
      await downloadBatchFile(id, type, name);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not download.');
    }
  }
  return <section className="panel institution-workspace"><h2>Assessment documents & versions</h2><p>Original documents are retained. Choose a previous version in Upload scripts when replacing documents; each revision needs its own independent memorandum approval.</p>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{!data.length ? <p>No uploaded assessment documents yet.</p> : data.map(d => <article className="panel" key={d.id}><h3>{d.paperName}</h3><p>{d.memoName} - {new Date(d.createdAt).toLocaleDateString()}</p><p>{d.previousBatchId ? 'Revision of ' + (data.find(v => v.id === d.previousBatchId)?.paperName || 'earlier document') : 'First version'} - {d.approvedBy ? 'Memorandum approved' : 'Awaiting memorandum approval'}</p><div className="buttons"><button className="secondary" onClick={() => void file(d.id, 'paper', d.paperName)}>Read paper</button><button className="secondary" onClick={() => void file(d.id, 'memo', d.memoName)}>Read memorandum</button>{canModerate && !d.approvedBy && <button disabled={busy} onClick={() => void approve(d.id)}>Approve memorandum version</button>}</div><details><summary>Document fingerprints</summary><p className="audit-snapshot">Paper: {d.paperHash}<br />Memorandum: {d.memoHash}</p></details></article>)}</section>;
}
export function TaskNotifications({
  onOpen
}: {
  onOpen: () => void;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const rows = await request<Task[]>('/api/institution/tasks', {
          signal: c.signal
        });
        if (!stopped && Array.isArray(rows)) setCount(rows.length);
      } catch {/* The task page provides retry and errors. */}
      if (!stopped) timer = setTimeout(() => void tick(), 30000);
    };
    void tick();
    return () => {
      stopped = true;
      c.abort();
      clearTimeout(timer);
    };
  }, []);
  return count > 0 ? <button className="secondary" onClick={onOpen}>{count} outstanding tasks</button> : null;
}
export function InviteStaffWorkspace({
  academics
}: {
  academics: Academics;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Teacher');
  const [grade, setGrade] = useState('10');
  const [subject, setSubject] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [mailMessage, setMailMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setLink('');setMailMessage('');
    try {
      const result = await request<{
        invitationPath: string;
      }>('/api/institution/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email,
          role,
          grade: role === 'Teacher' ? Number(grade) : null,
          subject: role === 'Teacher' ? subject : null,
          moduleId: ['Lecturer', 'Professor'].includes(role) ? moduleId : null
        })
      });
      setLink(window.location.origin + result.invitationPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create invitation.');
    } finally {
      setBusy(false);
    }
  }
  async function sendInvitation() {
    setBusy(true);setError('');setMailMessage('');
    try { const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token'); const result=await request<{message:string}>('/api/institution/invitations/email',{method:'POST',body:JSON.stringify({token})});setMailMessage(result.message); }
    catch(cause){setError(cause instanceof Error?cause.message:'Could not send invitation.');}finally{setBusy(false);}
  }
  return <section className="panel"><h2>Invite staff</h2><p>Create a seven-day activation link. Share it privately with the intended staff member; they choose their own password.</p><form className="institution-form" onSubmit={e => void invite(e)}><label>Invitation email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Invitation role<select value={role} onChange={e => setRole(e.target.value)}>{['Teacher', 'Lecturer', 'Professor', 'HOD', 'Moderator', 'Principal', 'AcademicAdmin', 'SchoolAdmin'].map(r => <option key={r}>{r}</option>)}</select></label>{role === 'Teacher' && <><label>Initial grade<select value={grade} onChange={e => setGrade(e.target.value)}>{[8, 9, 10, 11, 12].map(g => <option key={g}>{g}</option>)}</select></label><label>Initial subject<input required maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} /></label></>}{['Lecturer', 'Professor'].includes(role) && <label>Initial module<select required value={moduleId} onChange={e => setModuleId(e.target.value)}><option value="">Select module</option>{academics.modules.map(m => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}</select></label>}<button disabled={busy}>Create invitation link</button></form>{error && <p role="alert">{error}</p>}{link && <><label>Private activation link<textarea readOnly value={link} /></label><button disabled={busy} onClick={()=>void sendInvitation()}>Email invitation</button></>}{mailMessage && <p role="status">{mailMessage}</p>}</section>;
}
