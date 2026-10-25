import { useEffect, useRef, useState } from 'react';
import { FileUp, X } from 'lucide-react';
import { modelNames, studioRequest, type Dataset, type ModelKind } from './studioApi';

export default function ImportDataset({ kind, onClose, onCreated }: { kind: ModelKind; onClose: () => void; onCreated: (dataset: Dataset) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(`${modelNames[kind]} examples`);
  const [files, setFiles] = useState<File[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    const form = new FormData();
    form.set('kind', kind); form.set('name', name.trim()); form.set('verified', String(reviewed));
    files.forEach(file => form.append('files', file));
    try { onCreated(await studioRequest<Dataset>('/datasets', { method: 'POST', body: form })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not import these files.'); }
    finally { setBusy(false); }
  }
  return <dialog className="studio-dialog" ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><form onSubmit={event => void save(event)}><div className="studio-section-head"><div><span className="studio-eyebrow">IMPORT VERIFIED DATA</span><h2>{modelNames[kind]}</h2></div><button type="button" className="studio-icon-button" aria-label="Close import" disabled={busy} onClick={onClose}><X size={20}/></button></div><label>Dataset name<input value={name} onChange={event => setName(event.target.value)} required maxLength={80}/></label><label className="studio-file-drop"><FileUp size={29}/><strong>Select your dataset files</strong><span>{kind === 'scorer' ? 'Verified question / answer / rubric exports · JSONL' : 'A ZIP of verified JSONL labels and original page images, preserving folders. You can also select labels and matching pages together.'}</span><input aria-label="Dataset source files" type="file" multiple accept={kind === 'scorer' ? '.jsonl,.zip' : '.zip,.jsonl,.png,.jpg,.jpeg,.pdf'} onChange={event => setFiles(Array.from(event.target.files ?? []))}/></label>{files.length > 0 && <p className="studio-file-summary">{files.length} file(s) selected · {(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MB</p>}<label className="studio-checkbox"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)}/><span>These labels have been independently reviewed.</span></label><p className="studio-helper">At least 10 independent connected paper/script groups are needed for separate training, validation and test sets. Files stay on this computer.</p>{error && <p className="studio-error" role="alert">{error}</p>}<div className="studio-dialog-actions"><button className="studio-button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="studio-button" disabled={busy || !files.length || !reviewed || !name.trim()}>{busy ? 'Importing…' : 'Import & prepare data'}</button></div></form></dialog>;
}
