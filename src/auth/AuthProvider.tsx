import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { signOut, restoreSession, signIn, SESSION_ENDED, type OrganisationSelection, type Session, type TwoFactorInput } from './session';

type AuthState = {
  session: Session | null;
  restoring: boolean;
  message: string;
  login: (email: string, password: string, selection: OrganisationSelection, twoFactor?: TwoFactorInput) => Promise<void>;
  logout: () => void;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const ended = () => {
      setSession(null);
      setMessage('Your session has ended. Sign in again to continue.');
    };
    window.addEventListener(SESSION_ENDED, ended);
    restoreSession().then(value => { if (active) setSession(value); })
      .catch(() => { if (active) setMessage('We couldn’t restore your session. Please sign in again.'); })
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; window.removeEventListener(SESSION_ENDED, ended); };
  }, []);

  async function login(email: string, password: string, selection: OrganisationSelection, twoFactor?: TwoFactorInput) {
    const value = await signIn(email, password, selection, twoFactor);
    setMessage('');
    setSession(value);
  }
  async function logout() {
    setRestoring(true);
    try { await signOut(); }
    finally { setSession(null); setMessage(''); setRestoring(false); }
  }

  return <AuthContext.Provider value={{ session, restoring, message, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth requires AuthProvider');
  return auth;
}
