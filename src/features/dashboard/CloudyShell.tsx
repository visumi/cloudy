import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../hooks/use-auth";
import { CloudActionCloud } from "./CloudActionCloud";
import { ItemDialog } from "../items/ItemDialog";
import { ItemGraph } from "../items/ItemGraph";
import { TagManagerDialog } from "../settings/TagManagerDialog";
import type { CategoriesResponse, CategorySummary, CloudyItem, ItemsResponse } from "../../types/api";

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
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [items, setItems] = useState<CloudyItem[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const isActionCloudHidden = useActionCloudIdle(isMenuOpen);
  const isActionCloudSuppressed = isActionCloudHidden || isItemDialogOpen || isItemDialogClosing || isItemDetailOpen || isTagManagerOpen;
  const isModalOpen = isItemDialogOpen || isItemDialogClosing || isItemDetailOpen || isTagManagerOpen;
  const photoURL = user?.photoURL ?? profile?.picture;
  const email = user?.email ?? profile?.email;
  const itemCategories = useMemo(() => {
    const categories = new Map<string, CategorySummary>();
    items.forEach((item) => {
      if (item.category) categories.set(item.category.id, item.category);
    });
    return [...categories.values()].sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  }, [items]);
  const categoryOptions = categories.length > 0 ? categories : itemCategories;

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

  useEffect(() => {
    let active = true;
    void apiRequest<CategoriesResponse>("/categories").then((response) => {
      if (active) setCategories(response.categories);
    }).catch(() => {
      if (active) setCategories([]);
    });
    return () => { active = false; };
  }, []);

  const handleItemCreated = useCallback((item: CloudyItem) => {
    setItems((currentItems) => [item, ...currentItems]);
    if (!item.category) {
      setSavedMessage("Referência salva na sua nuvem.");
      window.setTimeout(() => setSavedMessage(null), 2600);
      return;
    }
    const category = item.category;
    setCategories((currentCategories) => {
      const existing = currentCategories.find((currentCategory) => currentCategory.id === category.id);
      if (existing) return currentCategories.map((currentCategory) => currentCategory.id === category.id ? { ...currentCategory, ...category, itemCount: (currentCategory.itemCount ?? 0) + 1 } : currentCategory);
      return [...currentCategories, { ...category, itemCount: 1 }].sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
    });
    setSavedMessage("Referência salva na sua nuvem.");
    window.setTimeout(() => setSavedMessage(null), 2600);
  }, []);

  const handleCategoriesChange = useCallback((nextCategories: CategorySummary[]) => {
    setCategories(nextCategories);
    setItems((currentItems) => currentItems.map((item) => {
      if (!item.category) return item;
      const nextCategory = nextCategories.find((category) => category.id === item.category?.id);
      return { ...item, category: nextCategory ? { id: nextCategory.id, name: nextCategory.name, color: nextCategory.color } : null };
    }));
  }, []);

  return (
    <main className="app-page" inert={isModalOpen || undefined}>
      <section className="workspace" aria-label="Espaço do Cloudy">
        <ItemGraph items={items} isLoading={itemsLoading} error={itemsError} onRetry={() => void loadItems()} onAddLink={() => setIsItemDialogOpen(true)} onDetailOpenChange={setIsItemDetailOpen}>
          <Suspense fallback={<div className="cloud-mascot" aria-hidden="true" />}>
            <CloudMascot />
          </Suspense>
        </ItemGraph>
      </section>
      <aside className={`action-cloud-dock${isActionCloudSuppressed ? " action-cloud-dock--hidden" : ""}`} aria-label="Ações do Cloudy" aria-hidden={isActionCloudSuppressed}>
        <CloudActionCloud email={email} name={profile?.name} onMenuOpenChange={setIsMenuOpen} onSignOut={signOutUser} photoURL={photoURL} disabled={isActionCloudSuppressed} onAddLink={() => setIsItemDialogOpen(true)} onTagsOpen={() => setIsTagManagerOpen(true)} />
      </aside>
      {savedMessage && <p className="workspace-toast" role="status">{savedMessage}</p>}
      <ItemDialog open={isItemDialogOpen} categoryOptions={categoryOptions} onClose={() => setIsItemDialogOpen(false)} onCreated={handleItemCreated} onClosingChange={setIsItemDialogClosing} />
      <TagManagerDialog open={isTagManagerOpen} categories={categories} onClose={() => setIsTagManagerOpen(false)} onCategoriesChange={handleCategoriesChange} />
    </main>
  );
}
