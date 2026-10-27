import { lazy, Suspense } from 'react';
import { useAuth } from './auth/AuthProvider';
import SignIn from './auth/SignIn';
import AccountRecovery from './auth/AccountRecovery';
import AcceptInvitation from './auth/AcceptInvitation';
import Workspace from './workspace/Workspace';
const TrainingStudio = lazy(() => import('./training/TrainingStudio'));

export default function App() {
  const { session, restoring } = useAuth();
  if (['/forgot-password', '/reset-password'].includes(window.location.pathname.replace(/\/$/, ''))) return <AccountRecovery/>;
  if (window.location.pathname.replace(/\/$/, '') === '/accept-invitation') return <AcceptInvitation/>;
  if ((import.meta.env.DEV || import.meta.env.VITE_ENABLE_TRAINING_STUDIO === 'true') && window.location.pathname.replace(/\/$/, '') === '/training') return <Suspense fallback={<div role="status" style={{ padding: 40 }}>Opening your model studio…</div>}><TrainingStudio/></Suspense>;
  if (restoring || !session) return <SignIn />;
  return <Workspace key={session.profile.email + JSON.stringify(session.selection)} session={session} />;
}
