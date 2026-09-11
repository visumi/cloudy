import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "../../hooks/use-auth";
import { CloudActionCloud } from "./CloudActionCloud";

const CloudMascot = lazy(() => import("./CloudMascot").then(({ CloudMascot: Mascot }) => ({ default: Mascot })));
const ACTION_CLOUD_IDLE_DELAY = 4200;

function useActionCloudIdle(menuOpen: boolean) {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    let timeoutId: number | undefined;

    const scheduleHide = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setIsHidden(true), ACTION_CLOUD_IDLE_DELAY);
    };

    const wake = () => {
      setIsHidden(false);
      if (!menuOpen) scheduleHide();
    };

    const activityEvents: Array<keyof WindowEventMap> = ["pointermove", "pointerdown", "touchstart", "wheel", "scroll", "keydown", "focusin"];
    if (menuOpen) setIsHidden(false);
    else scheduleHide();
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, wake, eventName === "touchstart" || eventName === "wheel" || eventName === "scroll" ? { passive: true } : undefined);
    });

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, wake));
    };
  }, [menuOpen]);

  return isHidden;
}

export function CloudyShell() {
  const { profile, signOutUser, user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isActionCloudHidden = useActionCloudIdle(isMenuOpen);
  const photoURL = user?.photoURL ?? profile?.picture;
  const email = user?.email ?? profile?.email;

  return (
    <main className="app-page">
      <section className="workspace" aria-label="Espaço do Cloudy">
        <Suspense fallback={<div className="cloud-mascot" aria-hidden="true" />}>
          <CloudMascot />
        </Suspense>
      </section>
      <aside className={`action-cloud-dock${isActionCloudHidden ? " action-cloud-dock--hidden" : ""}`} aria-label="Ações do Cloudy" aria-hidden={isActionCloudHidden}>
        <CloudActionCloud email={email} onMenuOpenChange={setIsMenuOpen} onSignOut={signOutUser} photoURL={photoURL} disabled={isActionCloudHidden} />
      </aside>
    </main>
  );
}
