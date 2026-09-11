import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../hooks/use-auth";
import { CloudActionCloud } from "./CloudActionCloud";
import { ItemDialog } from "../items/ItemDialog";
import { ItemGraph } from "../items/ItemGraph";
import type { CloudyItem, ItemsResponse } from "../../types/api";

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
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [isItemDialogClosing, setIsItemDialogClosing] = useState(false);
  const [isItemDetailOpen, setIsItemDetailOpen] = useState(false);
  const [items, setItems] = useState<CloudyItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const isActionCloudHidden = useActionCloudIdle(isMenuOpen);
  const isActionCloudSuppressed = isActionCloudHidden || isItemDialogOpen || isItemDialogClosing || isItemDetailOpen;
  const photoURL = user?.photoURL ?? profile?.picture;
  const email = user?.email ?? profile?.email;
  const categoryNames = useMemo(() => [...new Set(items.map((item) => item.category.name))].sort((first, second) => first.localeCompare(second, "pt-BR")), [items]);

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    setItemsError(null);
    try {
      const response = await apiRequest<ItemsResponse>("/items");
      setItems(response.items);
    } catch {
      setItemsError("Não conseguimos abrir seus itens agora.");
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const handleItemCreated = useCallback((item: CloudyItem) => {
    setItems((currentItems) => [item, ...currentItems]);
    setSavedMessage("Referência salva na sua nuvem.");
    window.setTimeout(() => setSavedMessage(null), 2600);
  }, []);

  return (
    <main className="app-page">
      <section className="workspace" aria-label="Espaço do Cloudy">
        <ItemGraph items={items} isLoading={itemsLoading} error={itemsError} onRetry={() => void loadItems()} onAddLink={() => setIsItemDialogOpen(true)} onDetailOpenChange={setIsItemDetailOpen}>
          <Suspense fallback={<div className="cloud-mascot" aria-hidden="true" />}>
            <CloudMascot />
          </Suspense>
        </ItemGraph>
      </section>
      <aside className={`action-cloud-dock${isActionCloudSuppressed ? " action-cloud-dock--hidden" : ""}`} aria-label="Ações do Cloudy" aria-hidden={isActionCloudSuppressed}>
        <CloudActionCloud email={email} name={profile?.name} onMenuOpenChange={setIsMenuOpen} onSignOut={signOutUser} photoURL={photoURL} disabled={isActionCloudSuppressed} onAddLink={() => setIsItemDialogOpen(true)} />
      </aside>
      {savedMessage && <p className="workspace-toast" role="status">{savedMessage}</p>}
      <ItemDialog open={isItemDialogOpen} categoryNames={categoryNames} onClose={() => setIsItemDialogOpen(false)} onCreated={handleItemCreated} onClosingChange={setIsItemDialogClosing} />
    </main>
  );
}
