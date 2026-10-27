import { useCallback, useEffect, useState } from 'react';
import { request } from '../auth/session';
import { institutionModules, type ManagedRecord, type ModuleDefinition } from './institutionModules';
import type { Academics, Assessment } from './types';
import { parseRecordCsv, exportRecordCsv } from './recordCsv';
import './institution.css';
type Props = {
  academics: Academics;
  assessments: Assessment[];
  manager: boolean;
  learnersOnly?: boolean;
  onHistory?: (candidate: string) => void;
};
export default function InstitutionWorkspace({
  academics,
  assessments,
  manager,
  learnersOnly = false,
  onHistory
}: Props) {
  const modules = learnersOnly ? institutionModules.filter(m => ['learner', 'enrolment'].includes(m.key)) : institutionModules.filter(m => !['learner', 'enrolment'].includes(m.key));
  const [kind, setKind] = useState(modules[0].key);
  const module = modules.find(m => m.key === kind)!;
  return <section className="institution-workspace"><div className="queue-tabs" role="group" aria-label="Institution modules">{modules.map(m => <button key={m.key} className={kind === m.key ? 'selected' : 'secondary'} aria-pressed={kind === m.key} onClick={() => setKind(m.key)}>{m.label}</button>)}</div><RecordManager key={kind} module={module} academics={academics} assessments={assessments} manager={manager} onHistory={onHistory} /></section>;
}
function RecordManager({
  module,
  academics,
  assessments,
  manager,
  onHistory
}: Props & {
  module: ModuleDefinition;
}) {
  const [rows, setRows] = useState<ManagedRecord[]>([]);
  const [references, setReferences] = useState<Record<string, ManagedRecord[]>>({});
  const [edit, setEdit] = useState<ManagedRecord>();
  const [creating, setCreating] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    const kinds = [...new Set(module.fields.map(f => f.reference).filter((v): v is string => !!v && !['faculty', 'module', 'assessment'].includes(v)))];
    const [records, ...links] = await Promise.all([request<ManagedRecord[]>(`/api/institution/records/${module.key}`, {
      signal
    }), ...kinds.map(k => request<ManagedRecord[]>(`/api/institution/records/${k}`, {
      signal
    }))]);
    if (!signal?.aborted) {
      setRows(records);
      setReferences(Object.fromEntries(kinds.map((k, i) => [k, links[i]])));
    }
  }, [module]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(e => {
      if (!controller.signal.aborted) setError(e.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [load]);
  function begin(row?: ManagedRecord) {
    setEdit(row);
    setCreating(true);
    setCode(row?.code || '');
    setName(row?.name || '');
    setFields(row?.fields || {
      brandColor: '#245f50',
      academicYear: String(new Date().getFullYear()),
      requireEnrolment: 'false',
      requireMemoApproval: 'true',
      retentionDays: '365',
      moderationSamplePercent: '100',
      language: 'English'
    });
    setActive(row?.active ?? true);
    setError('');
    setNotice('');
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const values = Object.fromEntries(module.fields.map(f => [f.key, fields[f.key] || '']));
      await request(`/api/institution/records/${module.key}${edit ? '/' + edit.id : ''}`, {
        method: edit ? 'PUT' : 'POST',
        body: JSON.stringify({
          code: module.singleton ? 'CURRENT' : code,
          name,
          fields: values,
          active,
          revision: edit?.revision || 0
        })
      });
      setCreating(false);
      await load();
      if (module.key === 'institution') window.dispatchEvent(new Event('prospera:institution-updated'));
      setNotice('Saved. Changes are recorded in the audit.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }
  async function importCsv(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('Maximum CSV size is 2 MB.');
      const entries = parseRecordCsv(await file.text(), module);
      await request(`/api/institution/import/${module.key}`, {
        method: 'POST',
        body: JSON.stringify(entries)
      });
      await load();
      setNotice(`${entries.length} records imported. All rows were validated before committing.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([exportRecordCsv(module, rows)], {
      type: 'text/csv;charset=utf-8'
    }));
    const a = document.createElement('a');
    a.href = url;
    a.download = module.key + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function options(reference: string) {
    if (reference === 'faculty') return academics.faculties.map(r => ({
      id: r.id,
      name: `${r.code} - ${r.name}`
    }));
    if (reference === 'module') return academics.modules.map(r => ({
      id: r.id,
      name: `${r.code} - ${r.name}`
    }));
    if (reference === 'assessment') return assessments.map(r => ({
      id: r.id,
      name: r.title
    }));
    return (references[reference] || []).filter(r => r.active || Object.values(fields).includes(r.id)).map(r => ({
      id: r.id,
      name: `${r.code} - ${r.name}${r.active ? '' : ' (archived)'}`
    }));
  }
  const filtered = rows.filter(r => (r.code + ' ' + r.name).toLowerCase().includes(search.toLowerCase()));
  return <><div className="queue-heading"><div><h2>{module.label}</h2><p>{module.description}</p></div>{manager && !creating && (!module.singleton || !rows.length) && <button disabled={loading} onClick={() => begin()}>Add {module.singleton ? 'profile' : 'record'}</button>}</div>{error && <p role="alert" className="alert error">{error}</p>}{notice && <p role="status" className="alert success">{notice}</p>}
 {creating && <form className="panel institution-form" onSubmit={e => void save(e)}><h3>{edit ? 'Edit' : 'Add'} {module.label.toLowerCase()}</h3>{!module.singleton && <label>{module.codeLabel || 'Code'}<input required maxLength={100} value={code} onChange={e => setCode(e.target.value)} /></label>}<label>{module.nameLabel || 'Name'}<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
 {module.fields.map(f => <label key={f.key}>{f.label}{f.reference || f.options ? <select aria-label={f.label} required={f.required} value={fields[f.key] || ''} onChange={e => setFields(v => ({
          ...v,
          [f.key]: e.target.value
        }))}><option value="">Select</option>{f.reference ? options(f.reference).map(o => <option key={o.id} value={o.id}>{o.name}</option>) : f.options!.map(v => <option key={v} value={v}>{v}</option>)}</select> : f.type === 'textarea' ? <textarea aria-label={f.label} required={f.required} maxLength={5000} value={fields[f.key] || ''} onChange={e => setFields(v => ({
          ...v,
          [f.key]: e.target.value
        }))} /> : <input aria-label={f.label} required={f.required} type={f.type || 'text'} maxLength={5000} value={fields[f.key] || ''} onChange={e => setFields(v => ({
          ...v,
          [f.key]: e.target.value
        }))} />}</label>)}
 {edit && !module.singleton && <label className="check-label"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Active (clear to archive)</label>}<div className="buttons"><button disabled={busy}>Save</button><button type="button" className="secondary" disabled={busy} onClick={() => setCreating(false)}>Cancel</button></div></form>}
 <section className="panel"><div className="buttons"><button type="button" className="secondary" onClick={exportCsv}>Export CSV / template</button>{manager && !module.singleton && <label>Import CSV<input type="file" accept=".csv,text/csv" disabled={busy || creating} onChange={e => {
            void importCsv(e.target.files?.[0]);
            e.target.value = '';
          }} /></label>}</div><label>Search {module.label.toLowerCase()}<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>{loading ? <p role="status">Loading records...</p> : !filtered.length ? <p>No records found.</p> : <div className="tablewrap"><table><thead><tr><th>Code</th><th>Name</th><th>Details</th><th>Status</th><th>Action</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{module.fields.map(f => row.fields[f.key] && <div key={f.key}><strong>{f.label}: </strong>{f.reference ? options(f.reference).find(o => o.id === row.fields[f.key])?.name || 'Unavailable reference' : row.fields[f.key]}</div>)}</td><td>{row.active ? 'Active' : 'Archived'}<small>Revision {row.revision}</small></td><td>{module.key === 'learner' && onHistory && <button className="secondary" onClick={() => onHistory(row.code)}>View history</button>}{manager && <button className="secondary" disabled={creating} onClick={() => begin(row)}>Edit {row.name}</button>}</td></tr>)}</tbody></table></div>}</section></>;
}
