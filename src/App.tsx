import { useEffect } from "react";
import { CloudyShell } from "./features/dashboard/CloudyShell";
import { LoginPage } from "./features/login/LoginPage";
import { useAuth } from "./hooks/use-auth";

function useBootLoading(ready: boolean) {
  useEffect(() => {
    if (!ready) return;

    const bootLoading = document.getElementById("boot-loading");
    if (!bootLoading) return;

    bootLoading.setAttribute("data-leaving", "true");
    const removeBootLoading = () => bootLoading.remove();
    bootLoading.addEventListener("transitionend", removeBootLoading, { once: true });
    const fallbackTimer = window.setTimeout(removeBootLoading, 320);

    return () => {
      window.clearTimeout(fallbackTimer);
      bootLoading.removeEventListener("transitionend", removeBootLoading);
    };
  }, [ready]);
}

export function App() {
  const { ready, user, profileLoading, profile, authError } = useAuth();
  const isBooting = !ready || profileLoading;
  useBootLoading(!isBooting);

  if (isBooting) return null;
  if (!user || !profile?.allowed || authError) return <LoginPage />;
  return <CloudyShell />;
}
