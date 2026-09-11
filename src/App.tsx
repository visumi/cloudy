import { CloudyShell } from "./features/dashboard/CloudyShell";
import { LoginPage } from "./features/login/LoginPage";
import { useAuth } from "./hooks/use-auth";

export function App() {
  const { ready, user, profileLoading, profile, authError } = useAuth();
  if (!ready || profileLoading) {
    return <main className="loading-page"><div className="loading-mark" aria-hidden="true" /><p>Preparando seu espaço…</p></main>;
  }
  if (!user || !profile?.allowed || authError) return <LoginPage />;
  return <CloudyShell />;
}
