import { lazy, Suspense, useState } from 'react';
import { splitScan } from './splitScan';
const Viewer = lazy(() => import('./ScriptPageViewer'));
const annotations: [] = [];
export default function CombinedScanSplitter({ onSplit }: { onSplit: (files: File[]) => void }) {
  const [file, setFile] = useState<File | null>(null); const [ranges, setRanges] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState('');
  async function split() {
    if (!file || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { const files = await splitScan(file, ranges); onSplit(files); setMessage(`${files.length} candidate scripts added. Confirm their numbers below.`); setFile(null); setRanges(''); setPreview(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not split this scan. Use an unlocked, readable PDF.'); }
    finally { setBusy(false); }
  }
  return <details className="scan-splitter"><summary>Split a combined PDF scan</summary><p className="muted">Identify each candidate’s page range manually. The app checks for overlaps and unassigned pages; it does not identify candidate boundaries automatically. Files stay on your device until you upload the batch.</p><label>Combined scan PDF<input key={message} disabled={busy} type="file" accept=".pdf" onChange={e => { setFile(e.target.files?.[0] || null); setMessage(''); setError(''); }}/></label>
    {file && <><p>{file.name}</p><button type="button" className="secondary" disabled={busy} onClick={() => setPreview(value => !value)}>{preview ? 'Hide combined scan' : 'Preview combined scan'}</button><label>Candidate page ranges<textarea disabled={busy} value={ranges} onChange={e => setRanges(e.target.value)} rows={5} placeholder={'C001, 1-8\nC002, 9-16'}/></label><button type="button" disabled={busy || !ranges.trim()} onClick={() => void split()}>{busy ? 'Splitting PDF…' : 'Split into candidate scripts'}</button></>}
    {error && <p className="alert error" role="alert">{error}</p>}{message && <p className="alert success" role="status">{message}</p>}
    {file && preview && <Suspense fallback={<p role="status">Loading scan preview…</p>}><Viewer file={file} annotations={annotations} title="Combined scan"/></Suspense>}
  </details>;
}
