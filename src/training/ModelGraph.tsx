import { ArrowRight, Braces, Eye, Layers3, ScanLine, ShieldCheck, TextCursorInput, Workflow } from 'lucide-react';
import type { ModelKind } from './studioApi';

export default function ModelGraph({ kind, active }: { kind: ModelKind; active: boolean }) {
  const stages = kind === 'ocr'
    ? [{ icon: ScanLine, title: 'Handwritten line', detail: 'Verified image regions' }, { icon: Layers3, title: 'Visual features', detail: 'Convolutional encoder' }, { icon: Workflow, title: 'Reading sequence', detail: 'Bidirectional LSTM' }, { icon: TextCursorInput, title: 'Transcription', detail: 'CTC character decoder' }]
    : [{ icon: Braces, title: 'Question + rubric', detail: 'With the answer text' }, { icon: Layers3, title: 'UTF-8 bytes', detail: 'No pretrained tokenizer' }, { icon: Workflow, title: 'Context & patterns', detail: 'Transformer ensemble' }, { icon: ShieldCheck, title: 'Score + review', detail: 'Learn when to abstain' }];
  return <div className={`studio-graph ${active ? 'is-training' : ''}`} aria-label={`${kind === 'ocr' ? 'Handwriting' : 'Rubric scoring'} model architecture`}>
    <div className="studio-graph-grid" aria-hidden="true" />
    <div className="studio-flow">{stages.map(({ icon: Icon, title, detail }, index) => <div className="studio-flow-part" key={title}><div className={`studio-node node-${index}`}><div className="studio-node-icon"><Icon size={23}/></div><strong>{title}</strong><span>{detail}</span></div>{index < stages.length - 1 && <ArrowRight className="studio-flow-arrow" size={21}/>}</div>)}</div>
    <div className="studio-graph-foot"><span><Eye size={13}/> {active ? 'Training is running on this computer' : 'Architecture available · weights learned from your data'}</span><span className="studio-mono">{kind === 'ocr' ? 'IMAGE → TEXT' : 'TEXT → SCORE / REVIEW'}</span></div>
  </div>;
}
