import { memo, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpRight, Check, CheckCheck, FileText, ListChecks, MessageSquareText, Sparkles } from 'lucide-react';
import './paper-preview.css';

const rubric = [
  { name: 'Factorisation method', detail: 'Correct factors and a clear method.', awarded: 4, maximum: 4 },
  { name: 'Final answers', detail: 'Both roots are correctly identified.', awarded: 4, maximum: 4 },
  { name: 'Verification', detail: 'Substitution checks are missing.', awarded: 0, maximum: 2 },
];
const total = rubric.reduce((sum, criterion) => sum + criterion.awarded, 0);
const maximum = rubric.reduce((sum, criterion) => sum + criterion.maximum, 0);

function MarkedPaperPreview() {
  const [tab, setTab] = useState<'paper' | 'rubric'>('paper');
  const paperTab = useRef<HTMLButtonElement>(null);
  const rubricTab = useRef<HTMLButtonElement>(null);
  const fitArea = useRef<HTMLDivElement>(null);
  const paperStage = useRef<HTMLDivElement>(null);
  const [paperScale, setPaperScale] = useState(1);

  useLayoutEffect(() => {
    const area = fitArea.current;
    const stage = paperStage.current;
    if (!area || !stage || typeof ResizeObserver === 'undefined') return;
    function fit() {
      if (!area || !stage || !area.clientHeight || !stage.offsetHeight) return;
      setPaperScale(Math.min(1, Math.max(0, area.clientHeight - 16) / stage.offsetHeight));
    }
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    observer.observe(stage);
    fit();
    return () => observer.disconnect();
  }, [tab]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'paper' : event.key === 'End' ? 'rubric' : tab === 'paper' ? 'rubric' : 'paper';
    setTab(next);
    (next === 'paper' ? paperTab : rubricTab).current?.focus();
  }

  return <figure className="paper-preview" aria-label="Illustrative AI marking preview">
    <div className="paper-preview-toolbar">
      <div className="paper-preview-tabs" role="tablist" aria-label="Sample assessment views">
        <button ref={paperTab} id="sample-paper-tab" type="button" role="tab" aria-selected={tab === 'paper'} aria-controls="sample-paper-panel" tabIndex={tab === 'paper' ? 0 : -1} onKeyDown={navigate} onClick={() => setTab('paper')}><FileText size={13} />Marked paper</button>
        <button ref={rubricTab} id="sample-rubric-tab" type="button" role="tab" aria-selected={tab === 'rubric'} aria-controls="sample-rubric-panel" tabIndex={tab === 'rubric' ? 0 : -1} onKeyDown={navigate} onClick={() => setTab('rubric')}><ListChecks size={13} />Rubric</button>
      </div>
      <span className="paper-demo-label">ILLUSTRATIVE DEMO</span>
    </div>

    <div className="paper-fit-area" ref={fitArea}>
    <div className="paper-preview-stage" ref={paperStage} style={{ transform: `scale(${paperScale})` }}>
      <div className="paper-sheet-back" aria-hidden="true" />
      <article className="paper-sheet" role="tabpanel" id="sample-paper-panel" aria-labelledby="sample-paper-tab" hidden={tab !== 'paper'} tabIndex={0}>
        <div className="paper-letterhead"><span><span className="paper-logo">P.</span>PROSPERA <b>ASSESS</b></span><span>SAMPLE SCRIPT</span></div>
        <div className="paper-title"><div><small>MATHEMATICS · ALGEBRA</small><h2>Mathematics assessment</h2></div><span className="paper-page">01 / 01</span></div>
        <div className="paper-student"><span>Sample learner <b>DEMO-001</b></span><span>Question 1 <b>[10 marks]</b></span></div>
        <p className="paper-question">Solve for <i>x</i> and verify both roots. Show your working.</p>
        <div className="paper-equation">x² − 5x + 6 = 0</div>
        <div className="paper-working" aria-label="Example learner working">
          <div><span>x² − 2x − 3x + 6 = 0</span><Check size={21} aria-label="Correct step" /></div>
          <div><span>(x − 2)(x − 3) = 0</span><Check size={21} aria-label="Correct step" /></div>
          <div><span className="paper-highlight">∴ x = 2 or x = 3</span><CheckCheck size={24} aria-label="Both roots correct" /></div>
        </div>
        <div className="paper-margin-note"><span>−2</span><p>Check both roots in<br />the original equation.</p><svg viewBox="0 0 70 25" aria-hidden="true"><path d="M66 3C42 2 35 23 6 17m0 0 10-5M6 17l8 6" /></svg></div>
        <div className="paper-result"><div><span>EXAMPLE SUGGESTED MARK</span><strong>{total}<small> / {maximum}</small></strong></div><div className="paper-result-description"><span><Sparkles size={12} />AI review concept</span><p>Strong method.<br />Add verification.</p></div></div>
        <div className="paper-bottom"><span>Fictional work · Demonstration only</span><span>Staff review required<ArrowUpRight size={10} /></span></div>
      </article>

      <article className="paper-sheet paper-rubric" role="tabpanel" id="sample-rubric-panel" aria-labelledby="sample-rubric-tab" hidden={tab !== 'rubric'} tabIndex={0}>
        <div className="paper-letterhead"><span><span className="paper-logo">P.</span>PROSPERA <b>ASSESS</b></span><span>SAMPLE RUBRIC</span></div>
        <div className="paper-title"><div><small>THE REASON BEHIND THE MARK</small><h2>Every point.<br />With a reason.</h2></div><span className="paper-page">01 / 01</span></div>
        <p className="paper-question">An illustrative rubric for the sample algebra question.</p>
        <div className="paper-rubric-criteria">{rubric.map(criterion => <div className="paper-rubric-row" key={criterion.name}><div><strong>{criterion.name}</strong><p>{criterion.detail}</p><span className="paper-rubric-track"><span style={{ width: `${criterion.awarded / criterion.maximum * 100}%` }} /></span></div><span className={criterion.awarded === criterion.maximum ? 'paper-rubric-full' : 'paper-rubric-missing'}>{criterion.awarded}<small>/{criterion.maximum}</small></span></div>)}</div>
        <div className="paper-result"><div><span>EXAMPLE SUGGESTED MARK</span><strong>{total}<small> / {maximum}</small></strong></div><div className="paper-result-description"><span><Sparkles size={12} />AI review concept</span><p>The teacher reviews<br />the final decision.</p></div></div>
        <div className="paper-bottom"><span>Fictional rubric · Demonstration only</span><span>Staff review required<ArrowUpRight size={10} /></span></div>
      </article>

      <div className="paper-feedback"><span className="paper-feedback-icon"><MessageSquareText size={17} /></span><div><span>PROSPERA AI <b>CONCEPT</b></span><strong>A useful next step.</strong><p>Substitute 2 and 3 into the original equation to verify your answers.</p></div></div>
    </div>
    </div>
    <figcaption><Sparkles size={12} /><span>Illustrative preview. AI marking is not yet available.</span></figcaption>
  </figure>;
}

export default memo(MarkedPaperPreview);
