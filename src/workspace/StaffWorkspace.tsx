import { useEffect, useState } from 'react';
import { Plus, UserPlus, X } from 'lucide-react';
import { request, roleLabel, type OrganisationSelection } from '../auth/session';
import { type Academics, type RunAction } from './types';

export default function StaffWorkspace({ selection, academics, canCreate, busy, run }: { selection: OrganisationSelection; academics: Academics; canCreate: boolean; busy: boolean; run: RunAction }) {
  const [catalogue,setCatalogue] = useState<{name:string;active:boolean}[]>([]);
  useEffect(()=>{const c=new AbortController();void request<{name:string;active:boolean}[]>('/api/institution/records/subject',{signal:c.signal}).then(rows=>{if(Array.isArray(rows))setCatalogue(rows);}).catch(()=>{});return()=>c.abort();},[]);
  const school = selection.organisationType === 'school';
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [role, setRole] = useState(school ? 'Teacher' : 'Lecturer');
  const [userId, setUserId] = useState(''); const [grade, setGrade] = useState(10);
  const [subject, setSubject] = useState('Mathematics'); const [moduleId, setModuleId] = useState('');
  const selectedUser = userId || academics.staff[0]?.id || '';
  const selectedModule = moduleId || academics.modules[0]?.id || '';

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (await run(() => request('/api/bootstrap/staff', { method: 'POST', body: JSON.stringify({ email, password, role, ...(school ? { grade, subject } : { moduleId: selectedModule }) }) }), 'Staff account created with its initial teaching allocation.')) { setEmail(''); setPassword(''); }
  }
  async function allocate(event: React.FormEvent) {
    event.preventDefault();
    await run(() => request('/api/academics/allocations', { method: 'POST', body: JSON.stringify(school ? { userId: selectedUser, grade, subject } : { userId: selectedUser, moduleId: selectedModule }) }), school ? 'Grade and subject allocated' : 'Faculty module allocated');
  }

  return <><datalist id="managed-subjects">{catalogue.filter(s=>s.active).map(s=><option key={s.name} value={s.name}/>)}</datalist><div className="academic-section-heading"><UserPlus size={23} /><div><h2>{school ? 'Teachers & grade allocations' : 'Lecturers, professors & module allocations'}</h2><p>{school ? 'A teacher can teach more than one Grade 8–12 subject. Allocate each grade and subject separately.' : 'Allocate modules to each lecturer or professor. Every module belongs to a faculty.'}</p></div></div>
    <section className="panel"><h2>{school ? 'Teaching staff' : 'Academic staff'}</h2>{!academics.staff.length && <p className="academic-empty">No {school ? 'teacher' : 'lecturer or professor'} accounts yet.</p>}
      {academics.staff.map(staff => <div className="academic-staff-row" key={staff.id}><div><strong>{staff.email}</strong><small>{roleLabel(staff.roles)}</small></div><div className="academic-allocation-tags">{academics.allocations.filter(allocation => allocation.userId === staff.id).map(allocation => {
        const module = academics.modules.find(item => item.id === allocation.moduleId); const faculty = academics.faculties.find(item => item.id === module?.facultyId);
        return <span key={allocation.id}>{allocation.grade ? `Grade ${allocation.grade} · ${allocation.subject}` : `${faculty?.name || 'Faculty'} · ${module?.code || 'Module'}`}<button type="button" className="textbutton" aria-label={`Remove allocation ${allocation.grade ? `Grade ${allocation.grade} ${allocation.subject}` : module?.code} from ${staff.email}`} title="Keep at least one teaching allocation. Add a replacement first." disabled={busy || academics.allocations.filter(item => item.userId === staff.id).length <= 1} onClick={() => void run(() => request(`/api/academics/allocations/${allocation.id}`, { method: 'DELETE' }), 'Allocation removed')}><X size={12} /></button></span>;
      })}{!academics.allocations.some(allocation => allocation.userId === staff.id) && <small>No teaching responsibilities allocated</small>}</div></div>)}
    </section>
    <div className="two academic-setup-forms">{canCreate && <section className="panel"><h2>Add {school ? 'teacher' : 'academic staff'} account</h2><form onSubmit={event => void create(event)}><label>Staff email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="off" maxLength={256} required /></label><label>Initial password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" required minLength={6} maxLength={1024} /></label><label>Staff role<select value={role} onChange={event => setRole(event.target.value)}>{(school ? ['Teacher'] : ['Lecturer', 'Professor']).map(value => <option key={value}>{value}</option>)}</select></label>{school ? <><label>Initial grade<select value={grade} onChange={event => setGrade(Number(event.target.value))}>{[8, 9, 10, 11, 12].map(value => <option key={value} value={value}>Grade {value}</option>)}</select></label><label>Initial subject<input list="managed-subjects" value={subject} onChange={event => setSubject(event.target.value)} required maxLength={200} /></label></> : <label>Initial faculty module<select value={selectedModule} onChange={event => setModuleId(event.target.value)} required><option value="" disabled>Select faculty module</option>{academics.modules.map(module => <option key={module.id} value={module.id}>{academics.faculties.find(f => f.id === module.facultyId)?.name} · {module.code} · {module.name}</option>)}</select></label>}<button disabled={busy || !email.trim() || !password || (school ? !subject.trim() : !selectedModule)} type="submit"><UserPlus size={16} />Create staff account</button></form></section>}
      <section className="panel"><h2>{school ? 'Allocate grade & subject' : 'Allocate faculty module'}</h2><form onSubmit={event => void allocate(event)}><label>{school ? 'Teacher' : 'Lecturer / professor'}<select value={selectedUser} onChange={event => setUserId(event.target.value)} required><option value="" disabled>Select staff member</option>{academics.staff.map(staff => <option key={staff.id} value={staff.id}>{staff.email}</option>)}</select></label>
        {school ? <><label>Allocated grade<select value={grade} onChange={event => setGrade(Number(event.target.value))}>{[8, 9, 10, 11, 12].map(value => <option key={value} value={value}>Grade {value}</option>)}</select></label><label>Allocated subject<input list="managed-subjects" value={subject} onChange={event => setSubject(event.target.value)} required maxLength={200} /></label></> : <label>Allocated module<select value={selectedModule} onChange={event => setModuleId(event.target.value)} required><option value="" disabled>Select module</option>{academics.modules.map(module => <option key={module.id} value={module.id}>{academics.faculties.find(f => f.id === module.facultyId)?.name} · {module.code} · {module.name}</option>)}</select></label>}
        <button disabled={busy || !selectedUser || (!school && !selectedModule) || (school && !subject.trim())} type="submit"><Plus size={16} />Save allocation</button>
      </form></section></div>
  </>;
}
