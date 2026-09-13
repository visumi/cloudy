import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../hooks/use-auth";
import { CloudActionCloud } from "./CloudActionCloud";
import { ItemDialog } from "../items/ItemDialog";
import { ItemGraph } from "../items/ItemGraph";
import { TagManagerDialog } from "../settings/TagManagerDialog";
import { IntegrationDialog } from "../settings/IntegrationDialog";
import { EMPTY_CATEGORY_COLOR } from "../items/category-colors";
import type { CategoriesResponse, CategoryRecentItem, CategorySummary, CloudyItem, ItemsResponse } from "../../types/api";

const CloudMascot = lazy(() => import("./CloudMascot").then(({ CloudMascot: Mascot }) => ({ default: Mascot })));
const ACTION_CLOUD_IDLE_DELAY = 4200;
const UNTAGGED_CATEGORY_ID = "__untagged__";

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
  const [isIntegrationDialogOpen, setIsIntegrationDialogOpen] = useState(false);
  const [isIntegrationDialogClosing, setIsIntegrationDialogClosing] = useState(false);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryItems, setCategoryItems] = useState<Record<string, CloudyItem[]>>({});
  const [categoryItemsLoading, setCategoryItemsLoading] = useState(false);
  const [categoryItemsError, setCategoryItemsError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const categoryRequestId = useRef(0);
  const isActionCloudHidden = useActionCloudIdle(isMenuOpen);
  const isActionCloudSuppressed = isActionCloudHidden || isItemDialogOpen || isItemDialogClosing || isItemDetailOpen || isTagManagerOpen || isIntegrationDialogOpen || isIntegrationDialogClosing;
  const isModalOpen = isItemDialogOpen || isItemDialogClosing || isItemDetailOpen || isTagManagerOpen || isIntegrationDialogOpen || isIntegrationDialogClosing;
  const photoURL = user?.photoURL ?? profile?.picture;
  const email = user?.email ?? profile?.email;
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const managedCategories = useMemo(() => categories.filter((category) => !category.isVirtual && !category.isSystem), [categories]);
  const visibleItems = selectedCategoryId ? categoryItems[selectedCategoryId] ?? [] : [];

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const response = await apiRequest<CategoriesResponse>("/categories");
      setCategories(response.categories);
    } catch {
      setCategoriesError("Não conseguimos abrir suas categorias agora.");
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => { void loadCategories(); }, [loadCategories]);

  const loadCategoryItems = useCallback(async (categoryId: string) => {
    const requestId = ++categoryRequestId.current;
    setSelectedCategoryId(categoryId);
    setCategoryItemsError(null);
    if (categoryItems[categoryId]) {
      setCategoryItemsLoading(false);
      return;
    }

    setCategoryItemsLoading(true);
    try {
      const response = await apiRequest<ItemsResponse>(`/categories/${encodeURIComponent(categoryId)}/items`);
      if (requestId !== categoryRequestId.current) return;
      setCategoryItems((current) => ({ ...current, [categoryId]: response.items }));
    } catch {
      if (requestId !== categoryRequestId.current) return;
      setCategoryItemsError("Não conseguimos abrir os itens desta categoria.");
    } finally {
      if (requestId === categoryRequestId.current) setCategoryItemsLoading(false);
    }
  }, [categoryItems]);

  const handleCategoryBack = useCallback(() => {
    categoryRequestId.current += 1;
    setSelectedCategoryId(null);
    setCategoryItemsLoading(false);
    setCategoryItemsError(null);
  }, []);

  useEffect(() => {
    if (selectedCategoryId && !selectedCategory) handleCategoryBack();
  }, [handleCategoryBack, selectedCategory, selectedCategoryId]);

  const handleItemCreated = useCallback((item: CloudyItem) => {
    const categoryId = item.category?.id ?? UNTAGGED_CATEGORY_ID;
    const recentItem = toCategoryRecentItem(item);
    setCategories((currentCategories) => updateCategorySummary(currentCategories, item, recentItem));
    setCategoryItems((currentItems) => {
      if (!Object.prototype.hasOwnProperty.call(currentItems, categoryId)) return currentItems;
      return { ...currentItems, [categoryId]: [item, ...currentItems[categoryId].filter((currentItem) => currentItem.id !== item.id)] };
    });
    showSavedMessage(setSavedMessage);
  }, []);

  const handleCategoriesChange = useCallback((nextCategories: CategorySummary[]) => {
    const reservedCategories = categories.filter((category) => category.isVirtual || category.isSystem);
    const next = sortCategories([...nextCategories.filter((category) => !category.isVirtual && !category.isSystem), ...reservedCategories]);
    setCategories(next);
    setCategoryItems({});
    if (selectedCategoryId && !next.some((category) => category.id === selectedCategoryId)) handleCategoryBack();
    void loadCategories();
  }, [categories, handleCategoryBack, loadCategories, selectedCategoryId]);

  const retry = selectedCategoryId ? () => void loadCategoryItems(selectedCategoryId) : () => void loadCategories();

  return (
    <main className="app-page" inert={isModalOpen || undefined}>
      <section className="workspace" aria-label="Espaço do Cloudy">
        <ItemGraph
          categories={categories}
          selectedCategory={selectedCategory}
          items={visibleItems}
          isLoading={selectedCategoryId ? categoryItemsLoading : categoriesLoading}
          error={selectedCategoryId ? categoryItemsError : categoriesError}
          onRetry={retry}
          onAddLink={() => setIsItemDialogOpen(true)}
          onCategorySelect={(categoryId) => void loadCategoryItems(categoryId)}
          onCategoryBack={handleCategoryBack}
          onDetailOpenChange={setIsItemDetailOpen}
        >
          <Suspense fallback={<div className="cloud-mascot" aria-hidden="true" />}>
            <CloudMascot />
          </Suspense>
        </ItemGraph>
      </section>
      <aside className={`action-cloud-dock${isActionCloudSuppressed ? " action-cloud-dock--hidden" : ""}`} aria-label="Ações do Cloudy" aria-hidden={isActionCloudSuppressed}>
        <CloudActionCloud email={email} name={profile?.name} onMenuOpenChange={setIsMenuOpen} onSignOut={signOutUser} photoURL={photoURL} disabled={isActionCloudSuppressed} onAddLink={() => setIsItemDialogOpen(true)} onTagsOpen={() => setIsTagManagerOpen(true)} onIntegrationsOpen={() => setIsIntegrationDialogOpen(true)} />
      </aside>
      {savedMessage && <p className="workspace-toast" role="status">{savedMessage}</p>}
      <ItemDialog open={isItemDialogOpen} categoryOptions={managedCategories} onClose={() => setIsItemDialogOpen(false)} onCreated={handleItemCreated} onClosingChange={setIsItemDialogClosing} />
      <TagManagerDialog open={isTagManagerOpen} categories={managedCategories} onClose={() => setIsTagManagerOpen(false)} onCategoriesChange={handleCategoriesChange} />
      <IntegrationDialog open={isIntegrationDialogOpen} onClose={() => setIsIntegrationDialogOpen(false)} onClosingChange={setIsIntegrationDialogClosing} />
    </main>
  );
}

function toCategoryRecentItem(item: CloudyItem): CategoryRecentItem {
  return { id: item.id, name: item.name, imageUrl: item.imageUrl, faviconUrl: item.faviconUrl, createdAt: item.createdAt };
}

function updateCategorySummary(categories: CategorySummary[], item: CloudyItem, recentItem: CategoryRecentItem): CategorySummary[] {
  const categoryId = item.category?.id ?? UNTAGGED_CATEGORY_ID;
  const existing = categories.find((category) => category.id === categoryId);
  if (existing) {
    return categories.map((category) => category.id === categoryId ? {
      ...category,
      itemCount: category.itemCount + 1,
      recentItems: [recentItem, ...category.recentItems.filter((currentItem) => currentItem.id !== recentItem.id)].sort(compareRecentItems).slice(0, 5)
    } : category);
  }

  const newCategory: CategorySummary = item.category ? {
    ...item.category,
    itemCount: 1,
    recentItems: [recentItem]
  } : {
    id: UNTAGGED_CATEGORY_ID,
    name: "Vazio",
    color: EMPTY_CATEGORY_COLOR,
    itemCount: 1,
    recentItems: [recentItem],
    isVirtual: true
  };
  return sortCategories([...categories, newCategory]);
}

function compareRecentItems(first: CategoryRecentItem, second: CategoryRecentItem): number {
  return second.createdAt.localeCompare(first.createdAt) || second.id.localeCompare(first.id);
}

function sortCategories(categories: CategorySummary[]): CategorySummary[] {
  return [...categories].sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

function showSavedMessage(setSavedMessage: (message: string | null) => void) {
  setSavedMessage("Referência salva na sua nuvem.");
  window.setTimeout(() => setSavedMessage(null), 2600);
}
