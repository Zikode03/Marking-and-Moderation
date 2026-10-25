import { lazy, Suspense } from 'react';
import { useAuth } from './auth/AuthProvider';
import SignIn from './auth/SignIn';
import Workspace from './workspace/Workspace';
const TrainingStudio = lazy(() => import('./training/TrainingStudio'));

export default function App() {
  const { session, restoring } = useAuth();
  if (window.location.pathname.replace(/\/$/, '') === '/training') return <Suspense fallback={<div role="status" style={{ padding: 40 }}>Opening your model studio…</div>}><TrainingStudio/></Suspense>;
  if (restoring || !session) return <SignIn />;
  return <Workspace key={session.profile.email + JSON.stringify(session.selection)} session={session} />;
}
