import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BookOpenCheck, Building2, Check, CheckCircle2, Eye, EyeOff,
  GraduationCap, LifeBuoy, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { loginError, type OrganisationType, type Sector, type OrganisationSelection } from './session';
import './signin.css';
import MarkedPaperPreview from './MarkedPaperPreview';

const organisations = [
  { id: 'institution' as const, title: 'Institution', description: 'Universities, colleges and training providers.', icon: Building2 },
  { id: 'school' as const, title: 'School', description: 'Grades 8–12, subjects and teacher assessment.', icon: BookOpenCheck },
];

export default function SignIn() {
  const { login, message, restoring } = useAuth();
  const [organisationType, setOrganisationType] = useState<OrganisationType | null>(null);
  const [sector, setSector] = useState<Sector | null>(null);
  const [pathway, setPathway] = useState<'caps' | 'ieb' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const selected = organisations.find(item => item.id === organisationType);

  const stage = !organisationType ? 'organisation' : !sector ? 'sector' : organisationType === 'school' && !pathway ? 'pathway' : 'credentials';
  const steps = organisationType === 'school' ? ['Organisation', 'Public or private', 'Assessment pathway', 'Sign in'] : ['Organisation', 'Public or private', 'Sign in'];
  const stepIndex = stage === 'organisation' ? 0 : stage === 'sector' ? 1 : stage === 'pathway' ? 2 : steps.length - 1;
  const selection: OrganisationSelection | null = organisationType && sector
    ? organisationType === 'institution' ? { organisationType, sector } : pathway ? { organisationType, sector, pathway } : null
    : null;
  const heading = stage === 'organisation' ? 'Welcome to Prospera.' : stage === 'sector' ? `What type of ${organisationType}?` : stage === 'pathway' ? 'Which assessment pathway?' : 'Welcome back.';
  const description = stage === 'organisation' ? 'Are you signing in through an institution or a school?'
    : stage === 'sector' ? `Choose whether your ${organisationType} is public or private.`
    : stage === 'pathway' ? 'Choose the assessment pathway your school uses.'
    : `Sign in with the account your ${organisationType} gave you.`;

  function back() {
    if (stage === 'credentials') {
      if (organisationType === 'school') setPathway(null);
      else setSector(null);
    } else if (stage === 'pathway') { setSector(null); setPathway(null); }
    else { setOrganisationType(null); setSector(null); setPathway(null); }
    setError(''); setPassword(''); setVisible(false); setHelp(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try { await login(email, password, selection); }
    catch (cause) {
      setError(loginError(cause));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { submitting.current = false; setBusy(false); }
  }

  return <div className="signin-shell" data-step={stage}>
    <aside className="signin-story" aria-label="About Prospera Assess">
      <a className="signin-brand" href="/" aria-label="Prospera Assess home">
        <span className="signin-mark"><GraduationCap size={27} /></span>
        <span>PROSPERA<small>ASSESS</small></span>
      </a>
      <div className="signin-story-content">
        <span className="signin-kicker"><span /> THE THINKING BEHIND EVERY MARK</span>
        <h1>Every answer.<br /><em>A clearer picture.</em></h1>
        <p>A glimpse of AI-assisted feedback, with teacher judgement at the centre.</p>
        <MarkedPaperPreview />
      </div>
      <div className="signin-story-footer"><ShieldCheck size={17} /><span>Your organisation. Your team. Clear accountability.</span></div>
    </aside>

    <main className="signin-main">
      <div className="signin-topline"><span className="signin-mobile-brand"><GraduationCap size={22} />Prospera Assess</span><span className="signin-workspace-label">{organisationType === 'institution' ? 'INSTITUTION WORKSPACE' : organisationType === 'school' ? 'SCHOOL WORKSPACE' : 'YOUR ASSESSMENT WORKSPACE'}</span><span className="signin-private"><LockKeyhole size={13} /> Staff access</span></div>
      <div className="signin-content">
        {restoring ? <div className="signin-restoring" role="status"><LoaderCircle className="signin-spinner" size={30} /><h2>Welcome back</h2><p>Opening your workspace…</p></div> : <>
          <div className="signin-progress" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
            {steps.map((step, index) => <span key={step} className={index < stepIndex ? 'complete' : index === stepIndex ? 'current' : ''} aria-current={index === stepIndex ? 'step' : undefined} aria-label={step}>{index < stepIndex ? <Check size={12} /> : index + 1}</span>)}
            <small>{steps[stepIndex]}</small>
          </div>
          {organisationType ? <button className="signin-back" type="button" disabled={busy} onClick={back}><ArrowLeft size={15} />Back</button> : null}
          <div className="signin-heading"><h2>{heading}</h2><p>{description}</p></div>
          {!organisationType ? <div className="signin-choices">
            {organisations.map(({ id, title, description, icon: Icon }) => <button className="signin-choice" key={id} onClick={() => { setOrganisationType(id); setSector(null); setPathway(null); setError(''); }} type="button">
              <span className="signin-choice-icon"><Icon size={23} /></span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight className="signin-choice-arrow" size={19} />
            </button>)}
          </div> : stage === 'sector' ? <div className="signin-choices" aria-label="Public or private">
            {(['public', 'private'] as const).map(value => <button className="signin-choice" key={value} type="button" onClick={() => { setSector(value); setPathway(null); }}>
              <span className="signin-choice-icon"><Building2 size={23} /></span><span><strong>{value === 'public' ? 'Public' : 'Private'}</strong><small>{value === 'public' ? `Public ${organisationType}` : `Private / independent ${organisationType}`}</small></span><ArrowRight className="signin-choice-arrow" size={19} />
            </button>)}
          </div> : stage === 'pathway' ? <div className="signin-choices" aria-label="School assessment pathway">
            {[{ id: 'caps' as const, title: 'CAPS / DBE', description: 'DBE assessment pathway.' }, { id: 'ieb' as const, title: 'IEB', description: 'Independent Examinations Board.' }].map(option => <button className="signin-choice" key={option.id} type="button" onClick={() => setPathway(option.id)}>
              <span className="signin-choice-icon"><BookOpenCheck size={23} /></span><span><strong>{option.title}</strong><small>{option.description}</small></span><ArrowRight className="signin-choice-arrow" size={19} />
            </button>)}
            <p className="signin-session-note">Public or private describes your school type. Your assessment pathway is selected separately.</p>
          </div> : <>
            <div className="signin-selected"><span><CheckCircle2 size={17} />{selected?.title}</span><small>{sector === 'private' ? 'Private' : 'Public'}{organisationType === 'school' ? ` · ${pathway === 'ieb' ? 'IEB' : 'CAPS / DBE'}` : ''}</small></div>
            {(error || message) ? <div className="signin-error" role="alert" tabIndex={-1} ref={errorRef}>{error || message}</div> : null}
            <form onSubmit={submit} className="signin-form" aria-busy={busy}>
              <label htmlFor="signin-email">Email address</label><div className="signin-field"><Mail size={18} aria-hidden="true" /><input autoFocus id="signin-email" name="email" type="email" autoComplete="username" placeholder={organisationType === 'institution' ? 'you@yourinstitution.ac.za' : 'you@yourschool.co.za'} value={email} onChange={event => { setEmail(event.target.value); setError(''); }} disabled={busy} required maxLength={256} /></div>
              <label htmlFor="signin-password">Password</label><div className="signin-field"><LockKeyhole size={18} aria-hidden="true" /><input id="signin-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={event => { setPassword(event.target.value); setError(''); }} disabled={busy} required maxLength={1024} /><button className="signin-reveal" type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} disabled={busy} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
              <button className="signin-submit" type="submit" disabled={busy || !selection || !email.trim() || !password}>{busy ? <><LoaderCircle className="signin-spinner" size={18} />Signing in…</> : <>Sign in to {organisationType === 'institution' ? 'institution' : 'school'}<ArrowRight size={18} /></>}</button>
            </form>
          </>}
          {!organisationType && message ? <p className="signin-session-note" role="status">{message}</p> : null}
          <div className="signin-help"><button type="button" className="signin-help-toggle" aria-expanded={help} aria-controls="signin-help-content" onClick={() => setHelp(value => !value)}><LifeBuoy size={16} />Need help signing in?</button>{help ? <div id="signin-help-content" className="signin-help-content"><strong>Your organisation sets up your account.</strong><p>Ask your administrator to confirm your email, password and role. Administrators can contact the person who set up Prospera for their organisation.</p><p>Choose <b>Institution</b> for a university, college or training provider, or <b>School</b> for school education. Then choose public or private. Schools also select CAPS / DBE or IEB before signing in. Your account determines your staff access.</p></div> : null}</div>
          <p className="signin-access-note"><ShieldCheck size={15} /> Your account determines your role and access after sign-in.</p>
        </>}
      </div>
      <footer className="signin-footer"><span>© {new Date().getFullYear()} Prospera Core</span><span>Built for better assessment.</span></footer>
    </main>
  </div>;
}
