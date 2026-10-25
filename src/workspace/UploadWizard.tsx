import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, Upload, X } from 'lucide-react';
import { uploadWithProgress, type OrganisationSelection } from '../auth/session';
import type { Academics } from './types';
import { markingLanguages } from './markingLanguages';
import { inspectUpload, type FileInspection } from './inspectUpload';
import CombinedScanSplitter from './CombinedScanSplitter';
const Viewer = lazy(() => import('./ScriptPageViewer'));
const noAnnotations: [] = [];
type ScriptFile = { id: number; file: File; candidate: string; inspection?: FileInspection; error?: string };
const stages = ['Subject or module', 'Paper & memorandum', 'Candidate scripts', 'Check & upload'];
const candidateError = (candidate: string) => !candidate.trim() || candidate.trim().length > 100 || /[<>:"/\\|?*\u0000-\u001f]/.test(candidate) ? 'Use a candidate number of 1–100 characters without filename symbols.' : '';

export default function UploadWizard({ selection, academics, manager, onUploaded, onClose }: {
  selection: OrganisationSelection; academics: Academics; manager: boolean; onUploaded: (id: string) => Promise<void>; onClose: () => void;
}) {
  const school = selection.organisationType === 'school';
  const allocations = academics.allocations.filter(a => a.grade !== null);
  const grades = manager ? [8, 9, 10, 11, 12] : [...new Set(allocations.map(a => a.grade!))].sort();
  const [step, setStep] = useState(0); const [title, setTitle] = useState('');
  const [grade, setGrade] = useState(grades[0] || 10); const [subject, setSubject] = useState(manager ? 'Mathematics' : allocations[0]?.subject || '');
  const [term, setTerm] = useState(1); const [facultyId, setFacultyId] = useState(academics.faculties[0]?.id || '');
  const [moduleChoice, setModuleChoice] = useState(''); const modules = academics.modules.filter(m => m.facultyId === facultyId);
  const moduleId = modules.some(m => m.id === moduleChoice) ? moduleChoice : modules[0]?.id || '';
  const subjects = [...new Set(allocations.filter(a => a.grade === grade).map(a => a.subject!))];
  const [year, setYear] = useState(new Date().getFullYear()); const [semester, setSemester] = useState(1);
  const [assessmentType, setAssessmentType] = useState('Test');
  const [schoolType, setSchoolType] = useState(selection.sector === 'private' ? 'Independent' : 'Public');
  const [pathway, setPathway] = useState(selection.organisationType === 'school' && selection.pathway === 'ieb' ? 'IEB' : 'DBE-NSC');
  const [scriptLanguage, setScriptLanguage] = useState('auto'); const [memoLanguage, setMemoLanguage] = useState('auto');
  const [paper, setPaper] = useState<File | null>(null); const [memo, setMemo] = useState<File | null>(null);
  const [documentChecks, setDocumentChecks] = useState<{ paper?: FileInspection; memo?: FileInspection }>({});
  const [scripts, setScripts] = useState<ScriptFile[]>([]); const nextId = useRef(0);
  const [expectedPages, setExpectedPages] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [checking, setChecking] = useState(false); const [uploading, setUploading] = useState(false); const [progress, setProgress] = useState(0);
  const [error, setError] = useState(''); const [preview, setPreview] = useState<File | null>(null);
  const [savedId, setSavedId] = useState(''); const controller = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (!savedId && (title || paper || memo || scripts.length)) window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [title, paper, memo, scripts.length, savedId]);
  const totalBytes = (paper?.size || 0) + (memo?.size || 0) + scripts.reduce((sum, s) => sum + s.file.size, 0);
  const contextAllowed = school ? !!subject.trim() && grades.includes(grade) && (manager || allocations.some(a => a.grade === grade && a.subject === subject)) : !!moduleId;
  const duplicates = new Set(scripts.filter((s, i) => scripts.some((other, j) => i !== j && other.candidate.trim().toLowerCase() === s.candidate.trim().toLowerCase())).map(s => s.id));
  const mismatches = scripts.filter(s => expectedPages && s.inspection && s.inspection.pages !== Number(expectedPages));
  function close() { if (uploading) return; if ((title || paper || memo || scripts.length) && !savedId && !window.confirm('Discard this upload preparation? No files have been saved.')) return; onClose(); }
  async function advance() {
    setError(''); setPreview(null);
    if (step === 0) { if (!contextAllowed || !title.trim()) { setError('Enter a batch title and select an allocated subject or module.'); return; } setStep(1); return; }
    if (step === 1) {
      if (!paper || !memo) { setError('Select the existing question paper and approved memorandum.'); return; }
      setChecking(true);
      try { const [p, m] = await Promise.all([inspectUpload(paper), inspectUpload(memo)]); setDocumentChecks({ paper: p, memo: m }); setStep(2); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'A document could not be read.'); }
      finally { setChecking(false); }
      return;
    }
    if (!scripts.length || scripts.length > 30 || totalBytes > 59 * 1024 * 1024) { setError('Select 1–30 complete scripts, up to 10 MB each and 59 MB for the full batch.'); return; }
    if (duplicates.size || scripts.some(s => candidateError(s.candidate))) { setError('Correct candidate numbers and duplicates before continuing.'); return; }
    setChecking(true);
    try {
      const checked: ScriptFile[] = [];
      // Keep PDF decoding bounded rather than loading 30 documents into memory together.
      for (const item of scripts) {
        try { checked.push({ ...item, inspection: await inspectUpload(item.file), error: '' }); }
        catch (cause) { checked.push({ ...item, error: cause instanceof Error ? cause.message : 'Unreadable file' }); }
      }
      const hashes = new Set<string>();
      for (const item of checked) { if (item.inspection) { if (hashes.has(item.inspection.hash)) item.error = 'Duplicate script content. Remove this file.'; hashes.add(item.inspection.hash); } }
      setScripts(checked);
      if (checked.some(s => s.error)) { setError('Replace or remove the highlighted files.'); return; }
      setConfirmed(false); setStep(3);
    } finally { setChecking(false); }
  }
  async function upload() {
    if (uploading || savedId) return;
    setError(''); setUploading(true); setProgress(0); controller.current = new AbortController();
    const context = { title: title.trim(), scriptLanguage, memoLanguage, school: school ? { grade, subject: subject.trim(), term, assessmentType, schoolType, pathway, weightPercent: 0 } : null, institution: school ? null : { moduleId, academicYear: year, semester, assessmentType, weightPercent: 0 } };
    const form = new FormData(); form.append('context', JSON.stringify(context)); form.append('paper', paper!); form.append('memo', memo!);
    scripts.forEach(s => form.append('scripts', s.file, `${s.candidate.trim()}.${s.file.name.split('.').pop()}`));
    try {
      const result = await uploadWithProgress<{ id: string }>('/api/ai/batches', form, setProgress, controller.current.signal);
      setSavedId(result.id);
      try { await onUploaded(result.id); } catch { setError('Files were saved. Refresh the queue to see this batch; do not upload it again.'); }
    } catch (cause) { setError(cause instanceof DOMException && cause.name === 'AbortError' ? 'Upload cancelled. Check the queue before retrying; the server may have finished saving it.' : cause instanceof Error ? cause.message : 'Upload failed. Your selected files are retained.'); }
    finally { setUploading(false); }
  }
  return <section className="panel upload-wizard" aria-label="Guided script upload">
    <div className="headrow"><div><span className="eyebrow">UPLOAD EXISTING WORK</span><h2 ref={heading} tabIndex={-1}>{savedId ? 'Batch saved' : stages[step]}</h2></div><button className="secondary" onClick={close} disabled={uploading || checking}><X size={16}/>Close upload</button></div>
    <ol className="upload-steps">{stages.map((stage, i) => <li key={stage} aria-current={i === step ? 'step' : undefined} className={i <= step ? 'reached' : ''}><span>{i < step ? <Check size={14}/> : i + 1}</span>{stage}</li>)}</ol>
    <p className="muted">Upload an existing assessment and its approved memo. This workspace does not create assessments.</p>
    {error && <p className="alert error" role="alert">{error}</p>}
    {savedId ? <div className="alert success" role="status">Your originals are saved. AI marking can start when a trained local model is ready.<button className="secondary" onClick={onClose}>Back to queue</button></div> : <form onSubmit={event => { event.preventDefault(); if (step < 3) void advance(); else void upload(); }}>
      <fieldset disabled={uploading || checking}>
      {step === 0 && <><div className="academic-form-grid">{school ? <>
        <label>Grade<select value={grades.includes(grade) ? grade : ''} onChange={e => { const g = Number(e.target.value); setGrade(g); if (!manager) setSubject(allocations.find(a => a.grade === g)?.subject || ''); }} required><option value="" disabled>Select grade</option>{grades.map(g => <option key={g} value={g}>Grade {g}</option>)}</select></label>
        <label>Subject{manager ? <input required maxLength={200} value={subject} onChange={e => setSubject(e.target.value)}/> : <select value={subject} onChange={e => setSubject(e.target.value)} required><option value="" disabled>Select subject</option>{subjects.map(s => <option key={s}>{s}</option>)}</select>}</label>
        <label>Term<select value={term} onChange={e => setTerm(Number(e.target.value))}>{[1,2,3,4].map(t => <option key={t}>{t}</option>)}</select></label>
        <label>School type<select value={schoolType} onChange={e => setSchoolType(e.target.value)}><option value="Public">Public</option><option value="Independent">Private / Independent</option></select></label>
        <label>Assessment pathway<select value={pathway} onChange={e => setPathway(e.target.value)}><option value="DBE-NSC">CAPS / DBE</option><option value="IEB">IEB</option></select></label>
      </> : <>
        <label>Faculty<select value={facultyId} onChange={e => { setFacultyId(e.target.value); setModuleChoice(''); }} required><option value="" disabled>Select faculty</option>{academics.faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Module<select value={moduleId} onChange={e => setModuleChoice(e.target.value)} required><option value="" disabled>Select module</option>{modules.map(m => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></label>
        <label>Academic year<input type="number" min={2000} max={2100} value={year} onChange={e => setYear(Number(e.target.value))} required/></label><label>Semester<select value={semester} onChange={e => setSemester(Number(e.target.value))}><option value={1}>1</option><option value={2}>2</option></select></label>
      </>}<label>Assessment type<select value={assessmentType} onChange={e => setAssessmentType(e.target.value)}>{['Test','Examination','Assignment','Project','Practical','Other'].map(t => <option key={t}>{t}</option>)}</select></label></div>
        {!contextAllowed && <p className="alert">Ask your administrator to allocate your grade and subject or faculty module.</p>}
        <label>Batch title<input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder={school ? 'Grade 10 Mathematics · Term 3' : 'Module examination · Semester 1'}/></label></>}
      {step === 1 && <><div className="academic-form-grid"><label>Script language<select value={scriptLanguage} onChange={e => setScriptLanguage(e.target.value)}><option value="auto">Detect automatically</option><option value="mixed">Mixed languages</option>{markingLanguages.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><label>Memorandum language<select value={memoLanguage} onChange={e => setMemoLanguage(e.target.value)}><option value="auto">Detect automatically</option><option value="mixed">Mixed languages</option>{markingLanguages.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label></div>
        <label>Existing question paper<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => { setPaper(e.target.files?.[0] || null); setDocumentChecks({}); }}/></label>{paper && <p>{paper.name} <button className="secondary" type="button" onClick={() => setPreview(paper)}><Eye size={14}/>Preview paper</button></p>}
        <label>Approved memorandum / rubric<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => { setMemo(e.target.files?.[0] || null); setDocumentChecks({}); }}/></label>{memo && <p>{memo.name} <button className="secondary" type="button" onClick={() => setPreview(memo)}><Eye size={14}/>Preview memorandum</button></p>}
        <p className="muted">PDF, PNG or JPEG · Up to 10 MB per file. Language selections do not establish model accuracy.</p></>}
      {step === 2 && <><label>Add candidate scripts<input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple onChange={e => { const files = Array.from(e.target.files || []); setScripts(previous => [...previous, ...files.map(file => ({ id: nextId.current++, file, candidate: file.name.replace(/\.[^.]+$/, '').trim() }))]); e.target.value = ''; setConfirmed(false); }}/></label>
        <p className="muted">One complete candidate per file. Confirm candidate numbers below; these become the saved script references. For a combined PDF, use the splitter to assign each candidate’s pages.</p>
        <CombinedScanSplitter onSplit={files => { setScripts(previous => [...previous, ...files.map(file => ({ id: nextId.current++, file, candidate: file.name.replace(/\.[^.]+$/, '').trim() }))]); setConfirmed(false); }}/>
        <label>Expected pages per script (optional)<input type="number" min={1} max={1000} value={expectedPages} onChange={e => setExpectedPages(e.target.value)} placeholder="Use only if every candidate should have the same page count"/></label>
        <div className="upload-file-list">{scripts.map(s => <div className="upload-file" key={s.id}><div><strong>{s.file.name}</strong><small>{(s.file.size / 1024 / 1024).toFixed(2)} MB</small><label>Candidate number for {s.file.name}<input value={s.candidate} maxLength={100} onChange={e => setScripts(previous => previous.map(item => item.id === s.id ? { ...item, candidate: e.target.value } : item))} required/></label>{(s.error || candidateError(s.candidate) || duplicates.has(s.id)) && <p className="field-error">{s.error || candidateError(s.candidate) || 'Duplicate candidate number'}</p>}</div><div className="buttons"><button className="secondary" type="button" onClick={() => setPreview(s.file)}>Preview</button><button className="secondary" type="button" aria-label={`Remove ${s.file.name}`} onClick={() => setScripts(previous => previous.filter(item => item.id !== s.id))}>Remove</button></div></div>)}</div>
        <p>{scripts.length} / 30 scripts · {(totalBytes / 1024 / 1024).toFixed(2)} / 59 MB including paper and memo</p></>}
      {step === 3 && <><div className="upload-check-summary"><strong>{title}</strong><p>{school ? `Grade ${grade} · ${subject} · Term ${term}` : `${modules.find(m => m.id === moduleId)?.code} · ${year} · Semester ${semester}`}</p><p>Paper: {paper?.name} · {documentChecks.paper?.pages} pages</p><p>Memo: {memo?.name} · {documentChecks.memo?.pages} pages</p><p>{scripts.length} candidates · {(totalBytes / 1024 / 1024).toFixed(2)} MB</p></div>
        {!!mismatches.length && <p className="alert" role="status">Page-count warning: {mismatches.map(s => `${s.candidate} (${s.inspection?.pages} pages)`).join(', ')} differ from the expected {expectedPages} pages. Check for missing or additional pages before confirming.</p>}
        <ul className="upload-check-list">{scripts.map(s => <li key={s.id}><span><strong>{s.candidate}</strong> · {s.inspection?.pages} pages · {s.file.name}</span><button className="secondary" type="button" onClick={() => setPreview(s.file)}>Preview</button></li>)}</ul>
        <label className="check-line"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>I checked candidate numbers and page completeness. Each file contains one candidate, and the memorandum is approved.</label>
        <p className="muted">Page counts cannot prove that every answer page is present. Check the scans. Uploading saves originals; it does not start AI marking.</p></>}
      </fieldset>
      <div className="wizard-actions">{step > 0 && <button className="secondary" type="button" disabled={uploading || checking} onClick={() => { setStep(s => s - 1); setError(''); setPreview(null); }}><ArrowLeft size={16}/>Back</button>}{step < 3 ? <button disabled={checking} type="submit">{checking ? 'Checking files…' : 'Continue'}<ArrowRight size={16}/></button> : <button disabled={!confirmed || uploading} type="submit"><Upload size={16}/>{uploading ? 'Uploading…' : 'Upload scripts'}</button>}</div>
    </form>}
    {uploading && <div role="status" className="upload-progress"><label htmlFor="batch-progress">{progress < 100 ? `Uploading batch · ${progress}%` : 'Files transferred · waiting for the server to save…'}</label><progress id="batch-progress" value={progress} max={100}/><p className="muted">Progress covers the whole batch; files are saved together.</p><button className="secondary" onClick={() => controller.current?.abort()}>Cancel upload</button></div>}
    {preview && <section className="upload-preview"><div className="headrow"><h3>{preview.name}</h3><button className="secondary" onClick={() => setPreview(null)}>Close preview</button></div><Suspense fallback={<p role="status">Loading preview…</p>}><Viewer file={preview} annotations={noAnnotations} title="Upload preview"/></Suspense></section>}
  </section>;
}
