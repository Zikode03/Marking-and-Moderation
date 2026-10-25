import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BrainCircuit, BookOpenCheck, Building2, CheckCheck, GraduationCap, LayoutDashboard, ListChecks, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { request, roleLabel, type Session } from '../auth/session';
import AcademicStructure from './AcademicStructure';
import AssessmentWorkspace from './AssessmentWorkspace';
import StaffWorkspace from './StaffWorkspace';
import MarkingDashboard from './MarkingDashboard';
import AiTrainingWorkspace from './AiTrainingWorkspace';
import { useMarkingFeed, workRows, type QueueKind } from './markingData';
import { emptyAcademics, type Academics, type Assessment, type RunAction } from './types';
import './workspace.css';

type Page = 'Overview' | 'Structure' | 'Staff' | 'Training' | QueueKind;
export default function Workspace({ session }: { session: Session }) {
  const { profile, selection } = session; const { logout } = useAuth();
  const school = selection.organisationType === 'school';
  const canMark = profile.roles.some(role => (school ? ['Teacher', 'AcademicAdmin'] : ['Lecturer', 'Professor', 'AcademicAdmin']).includes(role));
  const canModerate = profile.roles.some(role => ['HOD', 'AcademicAdmin'].includes(role));
  const canApprove = profile.roles.some(role => ['Principal', 'SchoolAdmin', 'AcademicAdmin'].includes(role));
  const manager = profile.roles.some(role => ['SchoolAdmin', 'AcademicAdmin'].includes(role));
  const canUpload = canMark || manager;
  const [page, setPage] = useState<Page>(canModerate && !canMark ? 'moderation' : canApprove && !canUpload ? 'approval' : 'Overview');
  const [queue, setQueue] = useState<QueueKind>('marking');
  const [academics, setAcademics] = useState<Academics>(emptyAcademics); const [allAssessments, setAssessments] = useState<Assessment[]>([]);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [uploadRequest, setUploadRequest] = useState(0); const feed = useMarkingFeed();
  const structureTitle = school ? 'Grades & subjects' : 'Faculties & modules'; const staffTitle = school ? 'Teaching staff' : 'Academic staff';
  const navigation: { name: Page; label: string; icon: typeof LayoutDashboard }[] = [
    { name: 'Overview', label: 'Overview', icon: LayoutDashboard }, { name: 'Training', label: 'AI & Training', icon: BrainCircuit }, { name: 'marking', label: 'AI marking', icon: BookOpenCheck },
    ...(canMark ? [{ name: 'review' as const, label: 'Teacher review', icon: BookOpenCheck }] : []),
    ...(canModerate ? [{ name: 'moderation' as const, label: 'Moderation', icon: ListChecks }] : []),
    ...(canApprove ? [{ name: 'approval' as const, label: 'Approvals', icon: ShieldCheck }] : []),
    { name: 'completed', label: 'Completed', icon: CheckCheck }, { name: 'Structure', label: structureTitle, icon: school ? GraduationCap : Building2 },
    ...(manager ? [{ name: 'Staff' as const, label: staffTitle, icon: Users }] : []),
  ];
  const assessments = useMemo(() => allAssessments.filter(a => school ? !!a.school : !!a.institution), [allAssessments, school]);
  const rows = useMemo(() => workRows(feed.batches, assessments), [feed.batches, assessments]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const [structure, assessmentRows] = await Promise.all([request<Academics>(`/api/academics?organisationType=${selection.organisationType}`, { signal }), request<Assessment[]>('/api/assessments', { signal })]);
    if (!signal?.aborted) { setAcademics(structure); setAssessments(assessmentRows); setError(''); }
  }, [selection.organisationType]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load the academic workspace.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load]);
  const run: RunAction = async (operation, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); await load(); setNotice(message); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The operation failed. Please try again.'); return false; }
    finally { setBusy(false); }
  };
  const isQueue = ['marking', 'review', 'moderation', 'approval', 'completed'].includes(page);
  const activeQueue = isQueue ? page as QueueKind : queue;
  function openQueue(next: QueueKind) { setPage(next); setQueue(next); setNotice(''); }
  function openUpload() { openQueue('marking'); setUploadRequest(value => value + 1); }
  const heading = page === 'Training' ? 'AI & Training' : page === 'Structure' ? structureTitle : page === 'Staff' ? staffTitle : page === 'marking' ? 'AI marking' : page === 'review' ? 'Teacher review' : page === 'moderation' ? 'Moderation' : page === 'approval' ? 'Approvals' : page === 'completed' ? 'Completed' : 'Your workspace';
  return <div className={`shell ${school ? 'school-workspace' : 'institution-workspace'} ${isQueue ? 'queue-workspace' : ''}`}><aside className="sidebar"><div className="brand"><div className="brandicon">{school ? <GraduationCap size={25}/> : <Building2 size={24}/>}</div><div><strong>PROSPERA</strong><span>ASSESS</span></div></div><div className="small-label">{school ? 'SCHOOL · GRADES 8–12' : 'INSTITUTION · FACULTIES'}</div><nav aria-label="Workspace">{navigation.map(({ name, label, icon: Icon }) => <button key={name} className={page === name ? 'active' : ''} aria-current={page === name ? 'page' : undefined} onClick={() => { if (['marking','review','moderation','approval','completed'].includes(name)) openQueue(name as QueueKind); else { setPage(name); setNotice(''); } }}><Icon size={18}/>{label}{page === name && <ArrowRight size={14} className="push"/>}</button>)}</nav><div className="sidebar-bottom"><ShieldCheck size={17}/><span className="workspace-email">{profile.email}</span><small className="workspace-role">{roleLabel(profile.roles)}</small><button className="signout" onClick={logout}>Sign out</button><small>{selection.sector === 'public' ? 'Public' : 'Private'} {school ? 'school' : 'institution'}{selection.organisationType === 'school' ? ` · ${selection.pathway === 'ieb' ? 'IEB' : 'CAPS / DBE'}` : ''}</small></div></aside>
    <main><header><div><div className="eyebrow">{school ? 'SCHOOL WORKSPACE' : 'INSTITUTION WORKSPACE'}</div><h1>{heading}</h1><p>{school ? 'Grade 8–12 subjects · AI marking, teacher review, HOD moderation and approval' : 'Faculties & modules · AI marking, human moderation and approval'}</p></div><button className="secondary" disabled={busy || loading} onClick={() => void run(async () => { await Promise.all([load(), feed.refresh()]); }, 'Workspace refreshed')}><RefreshCw size={16}/>Refresh</button></header>
      {error && <div className="alert error" role="alert">{error}<button className="secondary" onClick={() => void run(() => load(), 'Workspace loaded')}>Retry</button></div>}{notice && <div className="alert success" role="status">{notice}</div>}
      {loading ? <div className="panel academic-empty" role="status">Loading your academic workspace…</div> : <>
        {page === 'Overview' && <>{feed.error && <p className="alert error" role="alert">{feed.error}</p>}<MarkingDashboard school={school} academics={academics} rows={rows} model={feed.model} loading={feed.loading} canUpload={canUpload} canModerate={canModerate} canApprove={canApprove} manager={manager} onQueue={openQueue} onUpload={openUpload}/></>}
        {page === 'Training' && <AiTrainingWorkspace feed={feed} assessments={assessments} canLabel={canMark} canVerify={canModerate} manager={manager} canUpload={canUpload} onUpload={openUpload}/>}
        {page === 'Structure' && <AcademicStructure selection={selection} academics={academics} assessments={assessments} manager={manager} busy={busy} run={run}/>}
        <div hidden={!isQueue}><AssessmentWorkspace selection={selection} academics={academics} assessments={assessments} manager={manager} busy={busy} run={run} canModerate={canModerate} canApprove={canApprove} canReview={canMark} canUpload={canUpload} canLabel={canMark} feed={feed} queue={activeQueue} onQueueChange={openQueue} uploadRequest={uploadRequest} active={isQueue}/></div>
        {page === 'Staff' && manager && <StaffWorkspace selection={selection} academics={academics} canCreate={profile.roles.includes('SchoolAdmin')} busy={busy} run={run}/>}
      </>}
      <footer>Prospera Core · {school ? 'School marking · Grades 8–12' : 'Institution marking · Faculties & modules'}</footer>
    </main>
  </div>;
}
