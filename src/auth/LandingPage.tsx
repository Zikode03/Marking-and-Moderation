import { ArrowRight, BookOpen, ChartNoAxesColumnIncreasing, Check, GraduationCap, Landmark, LockKeyhole, Menu, Play, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import './landing.css';

type Information = 'product' | 'solutions' | 'about' | 'resources' | 'workflow' | 'contact';
const informationTitles: Record<Information, string> = { product: 'One workflow for marking and moderation', solutions: 'Choose your learning environment', about: 'Academic judgement at the centre', resources: 'Guides and walkthrough', workflow: 'From script to reviewed result', contact: 'Plan a conversation with Prospera' };

export default function LandingPage({ onStart, children }: { onStart: () => void; children?: ReactNode }) {
  const [enquiryStatus, setEnquiryStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [enquiryError, setEnquiryError] = useState('');
  const enquiryPending = useRef(false);
  const [menu, setMenu] = useState(false);
  const [information, setInformation] = useState<Information | null>(null);
  const videoDialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  function stopVideo() { if (video.current) { video.current.pause(); video.current.currentTime = 0; } }
  function closeVideo() { stopVideo(); videoDialog.current?.close(); }
  function watchVideo() { videoDialog.current?.showModal(); void video.current?.play().catch(() => { /* Native controls allow retry if autoplay is blocked. */ }); }
  const infoDialog = useRef<HTMLDialogElement>(null);
  function info(kind: Information) { setMenu(false); setInformation(kind); infoDialog.current?.showModal(); }
  function home() { setMenu(false); infoDialog.current?.close(); closeVideo(); window.scrollTo(0, 0); }
  function start() { setMenu(false); infoDialog.current?.close(); onStart(); }
  async function sendEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enquiryPending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    enquiryPending.current = true;
    setEnquiryStatus('sending'); setEnquiryError('');
    try {
      const response = await fetch(`${(import.meta.env.VITE_API_URL || 'http://localhost:5080').replace(/\/$/, '')}/api/sales/enquiries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.get('Name'), email: data.get('Email'), organisation: data.get('Organisation'), requirements: data.get('Requirements') }),
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error(response.status === 429 ? 'Too many enquiries. Please wait a few minutes and try again.' : 'We could not send your enquiry. Please try again or email prosperacore.tech@gmail.com.');
      setEnquiryStatus('sent'); form.reset();
    } catch (error) {
      setEnquiryStatus('error');
      setEnquiryError(error instanceof Error && error.message.startsWith('Too many') ? error.message : 'We could not send your enquiry. Please try again or email prosperacore.tech@gmail.com.');
    } finally { enquiryPending.current = false; }
  }
  const features = [
    { icon: Sparkles, title: 'AI-assisted marking', text: 'A memorandum-led workflow with provisional marks and feedback.' },
    { icon: Users, title: 'Human review', text: 'Teacher judgement and independent moderation at every step.' },
    { icon: ChartNoAxesColumnIncreasing, title: 'Clear reporting', text: 'Follow each script from upload through to approved results.' },
    { icon: LockKeyhole, title: 'Controlled access', text: 'Staff roles and academic allocations keep work in the right hands.' },
  ];
  return <div className="prospera-landing" id="home">
    <header className="landing-nav"><a href="#home" className="landing-brand" aria-label="Prospera Assess home" onClick={home}><GraduationCap size={43} strokeWidth={1.8}/><span>PROSPERA<small>ASSESS</small></span></a>
      <button className="landing-menu-toggle" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu} onClick={() => setMenu(value => !value)}>{menu ? <X size={23}/> : <Menu size={23}/>}</button>
      <nav aria-label="Main navigation" className={menu ? 'open' : ''}><button className={!information ? 'current' : ''} onClick={home}>Home</button>{(['product', 'solutions', 'about', 'resources'] as const).map(item => <button key={item} className={information === item ? 'current' : ''} onClick={() => info(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
      <div className="landing-nav-actions"><button className="landing-outline" onClick={() => info('contact')}>Contact sales</button><button className="landing-primary" onClick={start}>Sign in</button></div>
    </header>
    <main className="landing-hero" aria-labelledby="landing-title"><div className="landing-hero-photo"/><div className="landing-hero-shade"/><div className="landing-hero-content"><div className="landing-eyebrow"><span/>AI-ASSISTED ASSESSMENT PLATFORM</div><h1 id="landing-title">Turn assessment<br/>into meaningful<br/><em>learning outcomes.</em></h1><p>Bring scripts, memorandums and academic judgement together. Support marking, teacher review and moderation across schools, colleges and universities.</p><div className="landing-hero-actions"><button className="landing-primary" onClick={start}>Get started<ArrowRight size={18}/></button><button className="landing-outline" onClick={watchVideo}><span className="landing-play"><Play size={12} fill="currentColor"/></span>How it works<small>30 sec</small></button></div><div className="landing-trust">{['Staff access', 'Easy to set up', 'Built for education'].map(text => <span key={text}><Check size={13}/>{text}</span>)}</div></div></main>
    <section className="landing-details" id="product" aria-label="Platform and education environments"><div className="landing-features">{features.map(({ icon: Icon, title, text }) => <article key={title}><span className="landing-feature-icon"><Icon size={27} strokeWidth={1.8}/></span><div><h2>{title}</h2><p>{text}</p></div></article>)}</div>
      <div className="landing-environments" id="solutions"><div className="landing-environments-copy"><h2>Built for every learning environment</h2><p>Whether you’re a school, college or university, Prospera Assess adapts to your academic structure and assessment needs.</p></div><div className="landing-environment-cards">{[
        { title: 'Schools', sub: 'Grades 8–12', image: 'school-campus.jpg', icon: BookOpen },
        { title: 'Colleges', sub: 'Training providers', image: 'college-campus.jpg', icon: GraduationCap },
        { title: 'Universities', sub: 'Faculties and modules', image: 'university-campus.jpg', icon: Landmark },
      ].map(({ title, sub, image, icon: Icon }) => <button key={title} onClick={start} className="landing-environment-card" aria-label={`Sign in for ${title.toLowerCase()}`}><img src={`/images/${image}`} alt=""/><span className="landing-environment-label"><span className="landing-environment-icon"><Icon size={23}/></span><span><strong>{title}</strong><small>{sub}</small></span><ArrowRight size={17}/></span></button>)}</div></div>
    </section>
    <dialog ref={infoDialog} className="landing-info-dialog" aria-labelledby="landing-info-title" onClose={() => setInformation(null)} onClick={event => { if (event.target === event.currentTarget) infoDialog.current?.close(); }}>
      <button className="landing-dialog-close" aria-label="Close information" onClick={() => infoDialog.current?.close()}><X size={21}/></button><ShieldCheck size={30}/>
      <h2 id="landing-info-title">{information ? informationTitles[information] : ''}</h2>
      {information === 'product' && <><p>Work with existing assessments. Upload the question paper, approved memorandum and candidate scripts together, then follow each batch through marking, review, moderation and approval.</p><ul><li><strong>Memo-led marking:</strong> provisional question-level marks when a trained model is available.</li><li><strong>Review in context:</strong> compare scripts and reference documents, inspect flagged regions and record reasons for changes.</li><li><strong>Accountable results:</strong> separate staff roles, approval queues and a decision history.</li></ul><button className="landing-primary" onClick={start}>Open staff workspace<ArrowRight size={16}/></button></>}
      {information === 'solutions' && <div className="landing-solution-options">{[{title:'Schools',text:'Grades 8–12, subject and grade allocations. Public and private schools, with CAPS / DBE and IEB pathways.'},{title:'Colleges',text:'Organise marking around your institution’s programmes, modules and assigned teaching staff.'},{title:'Universities',text:'Faculty and module allocations for lecturers and professors, with independent moderation and approval.'}].map(item => <article key={item.title}><h3>{item.title}</h3><p>{item.text}</p><button className="landing-outline" onClick={start}>Continue to staff sign in<ArrowRight size={16}/></button></article>)}</div>}
      {information === 'about' && <><p>Prospera Assess brings existing scripts, memorandums and academic review into one staff workspace for South African schools and institutions.</p><p>Our aim is to reduce repetitive marking work while keeping teachers, lecturers and moderators responsible for final academic decisions.</p><p>The local AI programme is being developed around verified marked scripts. AI marking depends on training and validation; this page does not promise an already trained model or universal handwriting accuracy.</p></>}
      {information === 'resources' && <div className="landing-resource-actions"><p>Learn the workflow before signing in.</p><button className="landing-primary" onClick={() => { infoDialog.current?.close(); watchVideo(); }}><Play size={16}/>Watch the 30-second walkthrough</button><button className="landing-outline" onClick={() => info('workflow')}>Read the marking workflow</button><a href="/guides/prospera-staff-guide.txt" download>Download the staff quick-start guide</a></div>}
      {information === 'workflow' && <><ol><li><strong>Select your workspace.</strong> Choose school or institution, sector and academic pathway; sign in with your issued staff account.</li><li><strong>Upload existing work.</strong> Select a subject or module, then add the paper, approved memo and candidate scripts.</li><li><strong>Mark and review.</strong> A connected, validated model can provide provisional marks. Inspect flagged answers and confirm decisions.</li><li><strong>Moderate and approve.</strong> Review independently, record reasons and approve results.</li></ol><p>AI availability depends on a trained, validated model being connected. The workspace reports its current status.</p></>}
      {information === 'contact' && <><p>Tell us about your school or institution. Your enquiry will be sent to <a href="mailto:prosperacore.tech@gmail.com">prosperacore.tech@gmail.com</a>.</p>{enquiryStatus === 'sent' ? <div role="status"><h3>Enquiry sent</h3><p>Thank you. The Prospera team will reply to the email address you provided.</p><button className="landing-outline" onClick={() => setEnquiryStatus('idle')}>Send another enquiry</button></div> : <form onSubmit={sendEnquiry} aria-busy={enquiryStatus === 'sending'}><label>Your name<input name="Name" autoComplete="name" required maxLength={120}/></label><label>Work email<input name="Email" type="email" autoComplete="email" required maxLength={180}/></label><label>School or institution<input name="Organisation" autoComplete="organization" required maxLength={180}/></label><label>What do you need?<textarea name="Requirements" required rows={3} maxLength={3000} placeholder="Grades or modules, staff numbers and estimated script volume"/></label>{enquiryStatus === 'error' && <p role="alert">{enquiryError}</p>}<button className="landing-primary" type="submit" disabled={enquiryStatus === 'sending'}>{enquiryStatus === 'sending' ? 'Sending…' : 'Send enquiry'}</button></form>}</>}
    </dialog>
    <dialog ref={videoDialog} className="landing-video-dialog" aria-labelledby="landing-video-title" onClose={stopVideo} onCancel={closeVideo} onClick={event => { if (event.target === event.currentTarget) closeVideo(); }}>
      <div className="landing-video-header"><div><span>THE PROSPERA WORKFLOW · 30 SECONDS</span><h2 id="landing-video-title">See how it works</h2></div><button className="landing-outline" aria-label="Close video" onClick={closeVideo}><X size={21}/></button></div>
      <video ref={video} controls playsInline preload="none" poster="/videos/walkthrough-poster.jpg" aria-label="30-second Prospera Assess walkthrough"><source src="/videos/prospera-walkthrough.mp4" type="video/mp4"/><track kind="captions" src="/videos/walkthrough.vtt" srcLang="en" label="English" default/>Your browser cannot play this video. <a href="/videos/prospera-walkthrough.mp4">Download the walkthrough</a>.</video>
      <p>Upload scripts and a memo, review marks, moderate and approve. Illustrative screens; AI marking requires a trained and validated model.</p>
    </dialog>
    {children}
  </div>;
}
