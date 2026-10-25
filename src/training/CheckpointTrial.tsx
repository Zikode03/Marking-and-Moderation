import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { studioRequest, type Run, type Trial } from './studioApi';

export default function CheckpointTrial({ run, disabled }: { run: Run; disabled: boolean }) {
  const [question, setQuestion] = useState(''); const [answer, setAnswer] = useState(''); const [rubric, setRubric] = useState('');
  const [maximum, setMaximum] = useState(10); const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Trial | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function test(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try {
      let body: FormData | string;
      if (run.kind === 'ocr') { const form = new FormData(); if (file) form.set('image', file); body = form; }
      else body = JSON.stringify({ question, answer, rubric, maxMarks: maximum });
      setResult(await studioRequest<Trial>(`/runs/${run.id}/try-${run.kind}`, { method: 'POST', body }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not test this checkpoint.'); }
    finally { setBusy(false); }
  }
  return <section className="studio-card studio-trial"><div className="studio-section-head"><div><span className="studio-eyebrow">EXPERIMENT WITH YOUR CHECKPOINT</span><h2><FlaskConical size={20}/>Try what it has learned</h2></div><span className="studio-badge">Research only</span></div><p className="studio-helper">Using “{run.name}”. {run.synthetic ? 'This run used fictional demonstration data and has no established academic accuracy.' : 'Compare the result with an independently verified answer. Nothing here becomes a released mark.'}</p><form onSubmit={event => void test(event)}>{run.kind === 'ocr' ? <label>One handwritten line · PNG or JPEG<input type="file" accept="image/png,image/jpeg" onChange={event => { setFile(event.target.files?.[0] ?? null); setResult(null); }} required/></label> : <div className="studio-trial-fields"><label>Question<textarea required value={question} onChange={event => setQuestion(event.target.value)}/></label><label>Answer transcription<textarea required value={answer} onChange={event => setAnswer(event.target.value)}/></label><label>Approved rubric<textarea required value={rubric} onChange={event => setRubric(event.target.value)}/></label><label>Maximum marks<input type="number" min="0.5" max="1000" step="0.5" value={maximum} onChange={event => setMaximum(Number(event.target.value))}/></label></div>}<button className="studio-button secondary" disabled={disabled || busy}>{busy ? 'Reading the checkpoint…' : 'Try checkpoint'}</button></form>{error && <p className="studio-error" role="alert">{error}</p>}{result && <div className="studio-trial-result" role="status"><span className="studio-eyebrow">EXPERIMENTAL OUTPUT</span>{run.kind === 'ocr' ? <><strong>{result.text || 'No readable text returned'}</strong><p>Raw model confidence: {((result.confidence ?? 0) * 100).toFixed(1)}%</p></> : <><strong>{result.suggestedMarks?.toFixed(2)} / {result.maxMarks}</strong><p>Review signal: {((result.reviewSignal ?? 0) * 100).toFixed(1)}% · Ensemble spread: {result.ensembleSpread?.toFixed(3)}</p></>}<small>{result.message}</small></div>}</section>;
}
