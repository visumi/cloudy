import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../hooks/use-auth";
import { CloudActionCloud } from "./CloudActionCloud";
import { ItemDialog } from "../items/ItemDialog";
import { ItemGraph } from "../items/ItemGraph";
import { TagManagerDialog } from "../settings/TagManagerDialog";
import { IntegrationDialog } from "../settings/IntegrationDialog";
import { CommandPalette } from "../search/CommandPalette";
import { ItemDetail } from "../items/ItemGraph";
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchItems, setSearchItems] = useState<CloudyItem[]>([]);
  const [searchItemsLoading, setSearchItemsLoading] = useState(false);
  const [searchItemsError, setSearchItemsError] = useState<string | null>(null);
  const [searchDetailItem, setSearchDetailItem] = useState<CloudyItem | null>(null);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryItems, setCategoryItems] = useState<Record<string, CloudyItem[]>>({});
  const [categoryItemsLoading, setCategoryItemsLoading] = useState(false);
  const [categoryItemsError, setCategoryItemsError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const categoryRequestId = useRef(0);
  const searchItemsLoadedRef = useRef(false);
  const searchItemsRequestRef = useRef(false);
  const isActionCloudHidden = useActionCloudIdle(isMenuOpen);
  const isActionCloudSuppressed = isActionCloudHidden || isItemDialogOpen || isItemDialogClosing || isItemDetailOpen || isTagManagerOpen || isIntegrationDialogOpen || isIntegrationDialogClosing || isSearchOpen || searchDetailItem !== null;
  const isModalOpen = isItemDialogOpen || isItemDialogClosing || isItemDetailOpen || isTagManagerOpen || isIntegrationDialogOpen || isIntegrationDialogClosing || isSearchOpen || searchDetailItem !== null;
  const photoURL = user?.photoURL ?? profile?.picture;
  const email = user?.email ?? profile?.email;
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const managedCategories = useMemo(() => categories.filter((category) => !category.isVirtual && !category.isSystem), [categories]);
  const visibleItems = selectedCategoryId ? categoryItems[selectedCategoryId] ?? [] : [];

  const loadSearchItems = useCallback(async () => {
    if (searchItemsLoadedRef.current || searchItemsRequestRef.current) return;
    searchItemsRequestRef.current = true;
    setSearchItemsLoading(true);
    setSearchItemsError(null);
    try {
      const response = await apiRequest<ItemsResponse>("/items");
      setSearchItems(response.items);
      searchItemsLoadedRef.current = true;
    } catch {
      setSearchItemsError("Não conseguimos abrir sua busca agora.");
    } finally {
      searchItemsRequestRef.current = false;
      setSearchItemsLoading(false);
    }
  }, []);

  const openSearch = useCallback(() => {
    if (isModalOpen && !isSearchOpen) return;
    setIsSearchOpen(true);
    void loadSearchItems();
  }, [isModalOpen, isSearchOpen, loadSearchItems]);

  const closeSearch = useCallback(() => setIsSearchOpen(false), []);

  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      } else if (event.key === "Escape" && isSearchOpen) {
        closeSearch();
      }
    };
    document.addEventListener("keydown", handleGlobalShortcut);
    return () => document.removeEventListener("keydown", handleGlobalShortcut);
  }, [closeSearch, isSearchOpen, openSearch]);

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
  const retrySearch = () => { searchItemsLoadedRef.current = false; void loadSearchItems(); };

  return (
    <main className="app-page" inert={isModalOpen || undefined}>
      <section className="workspace" aria-label="Espaço do Cloudy">
        <button className={`global-search-trigger${isActionCloudSuppressed ? " global-search-trigger--hidden" : ""}`} type="button" onClick={openSearch} aria-keyshortcuts="Control+K" aria-label="Abrir busca global" aria-hidden={isActionCloudSuppressed || undefined} title="Abrir busca global (Ctrl+K)">
          <SearchIcon aria-hidden="true" />
          <span>Pesquisar</span>
          <kbd><span>Ctrl</span><span>K</span></kbd>
        </button>
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
      <CommandPalette open={isSearchOpen} items={searchItems} isLoading={searchItemsLoading} error={searchItemsError} onClose={closeSearch} onRetry={retrySearch} onSelect={(item) => { closeSearch(); setSearchDetailItem(item); }} />
      {searchDetailItem && <ItemDetail item={searchDetailItem} open onClose={() => setSearchDetailItem(null)} onExited={() => setSearchDetailItem(null)} />}
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
