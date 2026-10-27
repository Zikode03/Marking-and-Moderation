import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { publicRequest } from './session';
import './security.css';
export default function AccountRecovery() {
  const reset = window.location.pathname.replace(/\/$/, '') === '/reset-password';
  const [details] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  const [email, setEmail] = useState(details.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (reset && window.location.hash) history.replaceState(null, '', window.location.pathname);
  }, [reset]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (reset && password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    if (reset && !details.get('code')) {
      setError('Open the complete reset link from your email, or request a new link.');
      return;
    }
    setBusy(true);
    try {
      const result = await publicRequest<{ message: string }>(
        `/api/account/password/${reset ? 'reset' : 'forgot'}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify(
            reset ? { email, code: details.get('code'), newPassword: password } : { email },
          ),
        },
      );
      setMessage(result.message);
      setPassword('');
      setConfirmation('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-recovery">
      <section>
        <a href="/" className="account-back">
          <ArrowLeft size={16} />
          Back to sign in
        </a>
        <LockKeyhole size={32} />
        <h1>{reset ? 'Choose a new password' : 'Recover your account'}</h1>
        <p>
          {reset
            ? 'Use at least 12 characters, including upper and lower case letters, a number and a symbol.'
            : 'Enter your staff email. If recovery is available, we will send a password reset link.'}
        </p>
        {message ? (
          <div role="status">
            <p>{message}</p>
            <a href="/">Return to sign in</a>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label>
              Staff email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={180}
              />
            </label>
            {reset && (
              <>
                <label>
                  New password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={12}
                    maxLength={1024}
                    required
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    minLength={12}
                    maxLength={1024}
                    required
                  />
                </label>
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <button disabled={busy}>
              {busy ? 'Please wait...' : reset ? 'Reset password' : 'Send reset link'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
