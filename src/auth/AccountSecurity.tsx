import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { adoptSessionTokens, request, type Tokens } from './session';
import './security.css';
type Security = {
  email: string;
  mfaEnabled: boolean;
  mfaRequired: boolean;
  recoveryCodesRemaining: number;
  enrollmentRequired: boolean;
};
type MfaResult = {
  session: Tokens;
  recoveryCodes?: string[];
  sharedKey?: string;
  authenticatorUri?: string;
};
export default function AccountSecurity({
  onLogout,
  onVerified,
}: {
  onLogout: () => void;
  onVerified?: () => void;
}) {
  const [status, setStatus] = useState<Security>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<MfaResult>();
  const [codes, setCodes] = useState<string[]>([]);
  const [recovery, setRecovery] = useState(false);
  const [revokePassword, setRevokePassword] = useState('');
  async function load() {
    setStatus(await request<Security>('/api/account/security'));
  }
  useEffect(() => {
    const controller = new AbortController();
    void request<Security>('/api/account/security', { signal: controller.signal })
      .then(setStatus)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, []);
  async function run(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function mfa(action: 'setup' | 'enable' | 'disable' | 'recovery-codes' | 'replace') {
    await run(async () => {
      const result = await request<MfaResult>(`/api/account/mfa/${action}`, {
        method: 'POST',
        body: JSON.stringify(
          action === 'setup'
            ? { password: mfaPassword }
            : action === 'enable'
              ? { code }
              : { password: mfaPassword, code, recoveryCode: recovery },
        ),
      });
      if (result.session) adoptSessionTokens(result.session);
      if (action === 'setup' || action === 'replace') {
        setSetup(result);
        setCodes([]);
      } else if (action === 'disable') {
        onLogout();
        return;
      } else {
        setCodes(result.recoveryCodes || []);
        setSetup(undefined);
        setNotice('MFA is enabled. Save the recovery codes somewhere private.');
      }
      setRecovery(false);
      setMfaPassword('');
      setCode('');
      await load();
      if (action === 'enable') onVerified?.();
    });
  }
  function changePassword(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (newPassword !== confirm) throw new Error('The new passwords do not match.');
      await request('/api/account/password/change', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      onLogout();
    });
  }
  return (
    <div className="account-security">
      <div className="academic-section-heading">
        <ShieldCheck size={25} />
        <div>
          <h2>Protect your staff account</h2>
          <p>Manage your password, authenticator and active sessions.</p>
        </div>
      </div>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="alert success">
          {notice}
        </div>
      )}
      {!status ? (
        <div className="panel">
          <p>Loading security settings...</p>
          <button className="secondary" onClick={() => void run(load)}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <section className="panel">
            <h2>Multi-factor authentication</h2>
            <p>
              {status.mfaEnabled
                ? 'An authenticator code is required when you sign in.'
                : 'Add an authenticator app to protect your account.'}
            </p>
            {status.enrollmentRequired && (
              <p role="alert">
                Your administrator role requires MFA. Complete setup before managing the
                organisation.
              </p>
            )}
            {status.mfaEnabled && <p>{status.recoveryCodesRemaining} recovery codes remaining.</p>}
            {setup && (
              <div className="account-mfa-key">
                <p>
                  In your authenticator app, add a time-based account named Prospera Assess using
                  this setup key:
                </p>
                <code>{setup.sharedKey}</code>
                <p>
                  <a href={setup.authenticatorUri}>Open in an authenticator app</a>
                </p>
                <label>
                  Authenticator code
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={20}
                  />
                </label>
                <button disabled={busy || !code.trim()} onClick={() => void mfa('enable')}>
                  Verify and enable MFA
                </button>
              </div>
            )}
            {!setup && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mfa(status.mfaEnabled ? 'recovery-codes' : 'setup');
                }}
              >
                <label>
                  Current password for MFA
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={mfaPassword}
                    onChange={(e) => setMfaPassword(e.target.value)}
                    maxLength={1024}
                    required
                  />
                </label>
                {status.mfaEnabled && (
                  <>
                    <label>
                      {recovery ? 'MFA recovery code' : 'Current authenticator code'}
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        autoComplete="one-time-code"
                        maxLength={100}
                        required
                      />
                    </label>
                    <label className="security-check">
                      <input
                        type="checkbox"
                        checked={recovery}
                        onChange={(e) => {
                          setRecovery(e.target.checked);
                          setCode('');
                        }}
                      />
                      Use a recovery code instead of an authenticator code
                    </label>
                  </>
                )}
                <div className="buttons">
                  <button disabled={busy || (status.mfaEnabled && recovery)}>
                    {status.mfaEnabled ? 'Replace recovery codes' : 'Set up authenticator'}
                  </button>
                  {status.mfaEnabled && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || !mfaPassword || !code}
                      onClick={() => void mfa('replace')}
                    >
                      Replace authenticator
                    </button>
                  )}
                  {status.mfaEnabled && !status.mfaRequired && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || !mfaPassword || !code}
                      onClick={() => void mfa('disable')}
                    >
                      Disable MFA and sign out
                    </button>
                  )}
                </div>
              </form>
            )}
            {codes.length > 0 && (
              <div className="account-recovery-codes" role="status">
                <h3>Save these recovery codes now</h3>
                <p>Each code works once. Replacing codes invalidates the previous set.</p>
                <ul>
                  {codes.map((item) => (
                    <li key={item}>
                      <code>{item}</code>
                    </li>
                  ))}
                </ul>
                <button
                  className="secondary"
                  onClick={() => {
                    setCodes([]);
                    setNotice('');
                  }}
                >
                  I have saved my recovery codes
                </button>
              </div>
            )}
          </section>
          <div className="two">
            <section className="panel">
              <h2>Change password</h2>
              <p>Changing your password signs out existing sessions.</p>
              <form onSubmit={changePassword}>
                <label>
                  Current password
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    maxLength={1024}
                  />
                </label>
                <label>
                  New password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={12}
                    maxLength={1024}
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={12}
                    maxLength={1024}
                  />
                </label>
                <button disabled={busy}>Change password and sign out</button>
              </form>
            </section>
            <section className="panel">
              <h2>Sign out all devices</h2>
              <p>
                Revoke every existing access and refresh token, including this session. Use this if
                another device may have your account open.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await request('/api/account/sessions/revoke', {
                      method: 'POST',
                      body: JSON.stringify({ password: revokePassword }),
                    });
                    onLogout();
                  });
                }}
              >
                <label>
                  Confirm your password
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={revokePassword}
                    onChange={(e) => setRevokePassword(e.target.value)}
                    required
                    maxLength={1024}
                  />
                </label>
                <button disabled={busy}>Sign out all devices</button>
              </form>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
