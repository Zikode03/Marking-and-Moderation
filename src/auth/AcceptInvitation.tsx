import { useState } from 'react';
import { request } from './session';
export default function AcceptInvitation() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function accept(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request('/api/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({
          token,
          password
        })
      });
      window.history.replaceState({}, '', window.location.pathname);
      setDone(true);
      setPassword('');
      setConfirm('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept invitation.');
    } finally {
      setBusy(false);
    }
  }
  return <main style={{
    maxWidth: 560,
    margin: '60px auto',
    padding: 24
  }}><section className="panel"><h1>Activate your Prospera account</h1>{done ? <><p>Your staff account is ready.</p><a href="/">Continue to sign in</a></> : !token ? <p>This invitation link is incomplete. Ask your administrator for a new link.</p> : <form onSubmit={e => void accept(e)}><p>Choose your own password. Invitation links expire after seven days and can be used once.</p><label>Password<input required type="password" minLength={8} maxLength={1024} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label><label>Confirm password<input required type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label><button disabled={busy}>Activate account</button></form>}{error && <p role="alert" className="alert error">{error}</p>}</section></main>;
}
