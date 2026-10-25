import { useState } from 'react';
import { BookOpen, Building2, GraduationCap, Pencil, Plus } from 'lucide-react';
import { request, type OrganisationSelection } from '../auth/session';
import { type Academics, type Assessment, type Faculty, type Module, type RunAction } from './types';

export default function AcademicStructure({ selection, academics, assessments, manager, busy, run, compact = false }: { selection: OrganisationSelection; academics: Academics; assessments: Assessment[]; manager: boolean; busy: boolean; run: RunAction; compact?: boolean }) {
  const school = selection.organisationType === 'school';
  const editable = manager && !compact;
  const [facultyId, setFacultyId] = useState('');
  const [facultyName, setFacultyName] = useState('');
  const [facultyCode, setFacultyCode] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [moduleFaculty, setModuleFaculty] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [moduleCode, setModuleCode] = useState('');

  function editFaculty(faculty: Faculty) { setFacultyId(faculty.id); setFacultyName(faculty.name); setFacultyCode(faculty.code); }
  function editModule(module: Module) { setModuleId(module.id); setModuleFaculty(module.facultyId); setModuleName(module.name); setModuleCode(module.code); }
  async function saveFaculty(event: React.FormEvent) {
    event.preventDefault();
    if (await run(() => request(`/api/academics/faculties${facultyId ? '/' + facultyId : ''}`, { method: facultyId ? 'PUT' : 'POST', body: JSON.stringify({ name: facultyName, code: facultyCode }) }), 'Faculty saved')) { setFacultyId(''); setFacultyName(''); setFacultyCode(''); }
  }
  async function saveModule(event: React.FormEvent) {
    event.preventDefault();
    if (await run(() => request(`/api/academics/modules${moduleId ? '/' + moduleId : ''}`, { method: moduleId ? 'PUT' : 'POST', body: JSON.stringify({ facultyId: moduleFaculty || academics.faculties[0]?.id, name: moduleName, code: moduleCode }) }), 'Module saved')) { setModuleId(''); setModuleName(''); setModuleCode(''); }
  }

  if (school) return <><div className="academic-section-heading"><GraduationCap size={23} /><div><h2>Grades 8–12</h2><p>{manager ? 'Each teacher is allocated to specific grades and subjects under Teaching staff.' : 'Your administrator assigns the grades and subjects you teach.'}</p></div></div>
    <div className="academic-grade-grid">{(manager ? [8, 9, 10, 11, 12] : [...new Set(academics.allocations.filter(a => a.grade !== null).map(a => a.grade!))].sort()).map(grade => {
      const allocations = academics.allocations.filter(a => a.grade === grade);
      const subjects = [...new Set(allocations.map(a => a.subject!))];
      return <section className="panel academic-grade-card" key={grade}><span className="academic-grade-number">{grade}</span><h3>Grade {grade}</h3><p>{assessments.filter(a => a.school?.grade === grade).length} assessments · {subjects.length} subjects</p><div className="academic-tags">{subjects.map(subject => <span className="tag" key={subject}>{subject}</span>)}</div>{!subjects.length && <small>No teaching allocations yet</small>}</section>;
    })}</div>
    {!manager && !academics.allocations.length && <div className="panel academic-empty">No grade or subject is assigned to your account yet. Ask your school administrator to allocate your teaching responsibilities.</div>}
  </>;

  return <><div className="academic-section-heading"><Building2 size={23} /><div><h2>Faculties & modules</h2><p>{manager ? 'Create faculties, add their modules, then allocate lecturers and professors under Academic staff.' : 'Your faculty and module allocations define the student work available to you.'}</p></div></div>
    <div className="academic-faculty-grid">{academics.faculties.map(faculty => <section className="panel academic-faculty-card" key={faculty.id}><div className="headrow"><div><small>{faculty.code}</small><h3>{faculty.name}</h3></div>{editable && <button className="textbutton" aria-label={`Edit ${faculty.name}`} onClick={() => editFaculty(faculty)}><Pencil size={15} /></button>}</div>
      {academics.modules.filter(module => module.facultyId === faculty.id).map(module => <div className="academic-module-row" key={module.id}><BookOpen size={17} /><div><strong>{module.code}</strong><span>{module.name}</span></div>{editable && <button className="textbutton" aria-label={`Edit ${module.code}`} onClick={() => editModule(module)}><Pencil size={14} /></button>}</div>)}
      {!academics.modules.some(module => module.facultyId === faculty.id) && <p className="muted">No modules added yet.</p>}
    </section>)}</div>
    {!academics.faculties.length && <div className="panel academic-empty">{manager ? 'Create your first faculty below, then add its modules.' : 'No modules are allocated to your account yet. Contact your academic administrator.'}</div>}
    {editable && <div className="two academic-setup-forms"><section className="panel"><h2>{facultyId ? 'Edit faculty' : 'Add faculty'}</h2><form onSubmit={event => void saveFaculty(event)}><label>Faculty name<input value={facultyName} onChange={event => setFacultyName(event.target.value)} maxLength={200} required /></label><label>Faculty code<input value={facultyCode} onChange={event => setFacultyCode(event.target.value)} maxLength={50} required /></label><div className="buttons"><button disabled={busy} type="submit"><Plus size={16} />Save faculty</button>{facultyId && <button type="button" className="secondary" onClick={() => { setFacultyId(''); setFacultyName(''); setFacultyCode(''); }}>Cancel edit</button>}</div></form></section>
      <section className="panel"><h2>{moduleId ? 'Edit module' : 'Add module'}</h2><form onSubmit={event => void saveModule(event)}><label>Module faculty<select value={moduleFaculty || academics.faculties[0]?.id || ''} onChange={event => setModuleFaculty(event.target.value)} required disabled={!!moduleId || !academics.faculties.length}><option value="" disabled>Select faculty</option>{academics.faculties.map(faculty => <option key={faculty.id} value={faculty.id}>{faculty.name}</option>)}</select></label><label>Module name<input value={moduleName} onChange={event => setModuleName(event.target.value)} maxLength={200} required /></label><label>Module code<input value={moduleCode} onChange={event => setModuleCode(event.target.value)} maxLength={50} required /></label><div className="buttons"><button disabled={busy || !academics.faculties.length} type="submit"><Plus size={16} />Save module</button>{moduleId && <button type="button" className="secondary" onClick={() => { setModuleId(''); setModuleName(''); setModuleCode(''); }}>Cancel edit</button>}</div></form></section>
    </div>}
  </>;
}
