import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Database, FileCheck2, RefreshCw, Upload } from 'lucide-react';
import { request } from '../auth/session';
import type { Assessment } from './types';
import { assessmentContext } from './types';
import type { MarkingFeed } from './markingData';
import type { BatchDetail } from './AiBatchReview';
import TrainingExamples from './TrainingExamples';
import { markingLanguages } from './markingLanguages';
import labelerUrl from '../../ai_training/labeler.html?url';
const Viewer = lazy(() => import('./ScriptPageViewer'));
const noAnnotations: [] = [];
type Counts = { total: number; verified: number };
type ExampleSummary = { verifiedBy: string | null };
export default function AiTrainingWorkspace({ feed, assessments, canLabel, canVerify, manager, canUpload, onUpload }: {
  feed: MarkingFeed; assessments: Assessment[]; canLabel: boolean; canVerify: boolean; manager: boolean; canUpload: boolean; onUpload: () => void;
}) {
  const assessmentMap = useMemo(() => new Map(assessments.map(a => [a.id, a])), [assessments]);
  const batches = useMemo(() => feed.batches.filter(b => assessmentMap.has(b.assessmentId)), [feed.batches, assessmentMap]);
  const batchIds = batches.map(b => b.id).join(',');
  const [counts, setCounts] = useState<Record<string, Counts>>({}); const [failures, setFailures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true); const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(''); const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [script, setScript] = useState(''); const [error, setError] = useState(''); const [reference, setReference] = useState<'memo' | 'paper'>('memo');
  useEffect(() => {
    const ids = batchIds ? batchIds.split(',') : []; const controller = new AbortController();
    setLoading(true); setCounts({}); setFailures([]);
    // Bounded concurrency avoids opening every script batch request together.
    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length && !controller.signal.aborted) {
        const id = ids[cursor++];
        try { const examples = await request<ExampleSummary[]>(`/api/ai/batches/${id}/training`, { signal: controller.signal });
          if (!controller.signal.aborted) setCounts(previous => ({ ...previous, [id]: { total: examples.length, verified: examples.filter(e => e.verifiedBy).length } }));
        } catch { if (!controller.signal.aborted) setFailures(previous => [...previous, id]); }
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker)).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [batchIds, revision]);
  useEffect(() => {
    setDetail(null); setError(''); setScript(''); if (!selected) return;
    const controller = new AbortController();
    void request<BatchDetail>(`/api/ai/batches/${selected}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setDetail(value); setScript(value.scripts[0]?.id || ''); } }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not open this training batch.'); });
    return () => controller.abort();
  }, [selected]);
  const refreshSelected = useCallback(async () => {
    if (!selected) return;
    try { const examples = await request<ExampleSummary[]>(`/api/ai/batches/${selected}/training`); setCounts(previous => ({ ...previous, [selected]: { total: examples.length, verified: examples.filter(e => e.verifiedBy).length } })); }
    catch { setError('Your example was saved, but the totals could not refresh. Refresh training data to check the count.'); }
  }, [selected]);
  const totals = Object.values(counts).reduce((sum, c) => ({ total: sum.total + c.total, verified: sum.verified + c.verified }), { total: 0, verified: 0 });
  const statusUnavailable = feed.model.status.toLowerCase().includes('unavailable');
  const partial = failures.length > 0;
  const currentBatch = batches.find(b => b.id === selected);
  const scripts = batches.reduce((sum, b) => sum + b.scripts.length, 0);
  const selectedScript = detail?.scripts.find(s => s.id === script);
  return <div className="ai-training-workspace">
    {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_TRAINING_STUDIO === 'true') && <section className="panel"><div className="headrow"><div><span className="eyebrow">CONNECTED LOCAL TRAINING</span><h2>Your model studio is ready</h2><p>See the model architecture, import verified data, start and resume runs, follow real learning curves, and try saved research checkpoints.</p></div><a className="studio-button" href="/training">Open Model Studio →</a></div><p className="muted">The studio runs on this computer. You can focus on training while academic script marking remains disabled.</p></section>}
    <section className="ai-model-card panel"><div className="ai-model-icon"><BrainCircuit size={34}/></div><div><span className="eyebrow">PROSPERA LOCAL AI</span><h2>{feed.loading ? 'Checking the AI service…' : feed.model.ready ? 'A trained model is connected' : statusUnavailable ? 'The AI service is offline' : 'The AI is awaiting training'}</h2><p>{feed.model.status}</p><p className="muted">{statusUnavailable ? 'Model readiness cannot be checked while the service is unavailable. Training examples can still be collected through the backend.' : 'Our own scripts and independently verified marks will form the training data. Uploading a memorandum helps guide marking; it does not train a model.'}</p></div><div className="ai-model-version"><span>Deployed model version</span><strong>{feed.model.model || 'Not reported'}</strong><small>{feed.model.ready ? 'Marking enabled for the deployed model’s validated scope' : 'AI marking is not enabled'}</small></div></section>
    {feed.error && <p className="alert error" role="alert">{feed.error}</p>}
    <div className="headrow ai-training-heading"><div><h2>Training data</h2><p className="muted">Real records available to your account in this workspace.</p></div><div className="buttons"><button className="secondary" disabled={loading} onClick={() => { setRevision(value => value + 1); void feed.refresh(); }}><RefreshCw size={16}/>Refresh training data</button>{canUpload && <button onClick={onUpload}><Upload size={16}/>Upload training scripts</button>}</div></div>
    {partial && <p className="alert error" role="alert">Could not load examples from {failures.length} batch(es). Totals below include only successfully loaded batches; unavailable counts are shown as “—”.</p>}
    <div className="stats ai-training-stats">{[['Script originals', scripts, 'Saved candidate files'], ['Labelled examples', totals.total, 'Question, transcription, memo and expert mark'], ['Independently verified', totals.verified, 'Eligible for verified-data export'], ['Awaiting verification', totals.total - totals.verified, 'A second reviewer must check these']].map(([label, value, hint]) => <div className="stat" key={label}><span>{label}</span><strong>{feed.loading || (loading && label !== 'Script originals') ? '…' : value}</strong><small>{hint}{partial && label !== 'Script originals' ? ' · partial count' : ''}</small></div>)}</div>
    <section className="panel training-roadmap"><h2>What is ready, and what still needs building?</h2><ol><li><Database size={20}/><div><strong>Collect and verify examples</strong><p>{totals.verified ? `${totals.verified} verified question examples are available in the loaded batches.` : 'No independently verified examples are available in the loaded batches yet.'} Start below with original scripts and approved memos.</p></div><span className="tag">Available now</span></li><li><BrainCircuit size={20}/><div><strong>Train the handwriting and marking models</strong><p>Handwriting recognition and rubric-scoring models can now be trained locally from scratch. Export verified text examples and use the offline labelling desk to prepare independently verified handwriting lines. A reviewed answer-booklet layout connects each question to its memo and answer regions.</p></div><span className="tag training-unbuilt">Local training available</span></li><li><FileCheck2 size={20}/><div><strong>Evaluate and approve a model version</strong><p>Evaluate unseen scripts by subject, language and handwriting quality before enabling marks. The Model Studio shows live run history, saved checkpoints and held-out evaluation reports.</p></div><span className="tag">{feed.model.ready ? 'Deployment reports readiness' : 'Not reported'}</span></li></ol>{(import.meta.env.DEV || import.meta.env.VITE_ENABLE_TRAINING_STUDIO === 'true') && <a className="studio-button" href="/training">Open training controls</a>}<p className="muted">Use the connected Model Studio to import verified labels, train either model, follow its progress, and test saved research checkpoints. Training remains separate from academic marking.</p></section>
    <section className="panel"><h2>Prepare handwriting training data</h2><p>Download the offline labelling desk, open it locally, and draw one handwritten line at a time on rendered PNG or JPEG pages. A second reviewer verifies each transcription before training. Export your work before closing the desk.</p><a href={labelerUrl} download="prospera-handwriting-labeler.html">Download handwriting labelling desk</a><p className="muted">The initial marking pipeline supports reviewed, fixed answer-booklet layouts. It flags uncertain readings and changed layouts for moderation. Training instructions are in ai_training/START_HERE.md in the project.</p></section>
    <section className="panel training-batches"><h2>Build the dataset from scripts</h2><p>Select a batch to inspect original handwriting beside the paper or memorandum and capture expert-labelled examples.</p>{!batches.length ? <div className="academic-empty">No script batches are available here yet. {canUpload ? 'Upload a paper, an approved memo and complete candidate scripts to begin.' : 'Ask your teaching team to upload the scripts and approved memorandum.'}</div> : <><label>Training batch<select aria-label="Training batch" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Select an uploaded batch</option>{batches.map(b => <option key={b.id} value={b.id}>{assessmentMap.get(b.assessmentId)?.title} · {b.scripts.length} scripts</option>)}</select></label><div className="tablewrap"><table><thead><tr><th>Batch</th><th>Scripts</th><th>Labelled</th><th>Verified</th><th>Action</th></tr></thead><tbody>{batches.map(b => <tr key={b.id}><td><strong>{assessmentMap.get(b.assessmentId)?.title}</strong><small>{assessmentContext(assessmentMap.get(b.assessmentId))}</small></td><td>{b.scripts.length}</td><td>{counts[b.id]?.total ?? '—'}</td><td>{counts[b.id]?.verified ?? '—'}</td><td><button className="secondary" onClick={() => setSelected(b.id)}>Open training batch</button></td></tr>)}</tbody></table></div></>}
      {error && <p className="alert error" role="alert">{error}</p>}
      {selected && !detail && !error && <p role="status">Loading original scripts…</p>}
      {detail && currentBatch && <div className="training-batch-detail"><h3>{assessmentMap.get(currentBatch.assessmentId)?.title}</h3><div className="training-source-grid"><section><h3>Original handwriting</h3><label>Preview candidate script<select aria-label="Preview candidate script" value={script} onChange={e => setScript(e.target.value)}>{detail.scripts.map(s => <option key={s.id} value={s.id}>{s.candidate}</option>)}</select></label>{selectedScript ? <Suspense fallback={<p role="status">Loading script…</p>}><Viewer batchId={detail.id} scriptId={selectedScript.id} annotations={noAnnotations}/></Suspense> : <p>No candidate script is available.</p>}</section><section><label>Training reference<select aria-label="Training reference" value={reference} onChange={e => setReference(e.target.value as 'memo' | 'paper')}><option value="memo">Approved memorandum</option><option value="paper">Question paper</option></select></label><Suspense fallback={<p role="status">Loading reference…</p>}><Viewer key={`${detail.id}-${reference}`} batchId={detail.id} scriptId={reference} title={reference === 'memo' ? 'Approved memorandum' : 'Question paper'} annotations={noAnnotations}/></Suspense></section></div>
        <TrainingExamples key={detail.id} batch={detail} canLabel={canLabel} canVerify={canVerify} canExport={manager} expanded selectedScriptId={script} onChanged={refreshSelected} onScriptChange={setScript}/>
      </div>}
    </section>
    <section className="panel training-languages"><h2>Language readiness</h2><p className="muted">Upload language metadata describes collected material. It does not demonstrate handwriting recognition or marking accuracy.</p><div className="language-readiness-grid">{markingLanguages.map(([code, name]) => <div key={code}><strong>{name}</strong><span>{feed.model.ready && feed.model.languages?.includes(code) ? 'Listed in deployed model’s validated languages' : 'No ready model validation reported'}</span><small>{batches.filter(b => b.scriptLanguage === code).length} batch(es) labelled with this script language</small></div>)}</div></section>
  </div>;
}
