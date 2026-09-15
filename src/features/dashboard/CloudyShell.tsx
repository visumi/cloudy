import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../hooks/use-auth";
import { CloudActionCloud } from "./CloudActionCloud";
import { ItemDialog } from "../items/ItemDialog";
import { ItemDeleteDialog } from "../items/ItemDeleteDialog";
import { ItemGraph } from "../items/ItemGraph";
import { TagManagerDialog } from "../settings/TagManagerDialog";
import { IntegrationDialog } from "../settings/IntegrationDialog";
import { ShareDialog } from "../sharing/ShareDialog";
import { SharedCategoriesDialog } from "../sharing/SharedCategoriesDialog";
import { CommandPalette } from "../search/CommandPalette";
import { ItemDetail } from "../items/ItemGraph";
import { BulkActionDialog } from "../items/BulkActionDialog";
import { EMPTY_CATEGORY_COLOR } from "../items/category-colors";
import type { BulkItemActionPayload, BulkItemActionResponse, CategoriesResponse, CategoryRecentItem, CategorySummary, CloudyItem, ItemsResponse } from "../../types/api";

const CloudMascot = lazy(() => import("./CloudMascot").then(({ CloudMascot: Mascot }) => ({ default: Mascot })));
const UNTAGGED_CATEGORY_ID = "__untagged__";

interface RefreshOptions {
  background?: boolean;
  force?: boolean;
  preserveItem?: CloudyItem;
}

interface CategoryItemsRefreshOptions extends RefreshOptions {
  select?: boolean;
}

interface PendingItemAction {
  type: "edit" | "delete";
  item: CloudyItem;
}

export function CloudyShell() {
  const { profile, signOutUser, user } = useAuth();
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [isItemDialogClosing, setIsItemDialogClosing] = useState(false);
  const [editingItem, setEditingItem] = useState<CloudyItem | null>(null);
  const [detailItem, setDetailItem] = useState<CloudyItem | null>(null);
  const [isItemDetailOpen, setIsItemDetailOpen] = useState(false);
  const [pendingItemAction, setPendingItemAction] = useState<PendingItemAction | null>(null);
  const [deletingItem, setDeletingItem] = useState<CloudyItem | null>(null);
  const [isItemDeleteOpen, setIsItemDeleteOpen] = useState(false);
  const [isItemDeleteClosing, setIsItemDeleteClosing] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isIntegrationDialogOpen, setIsIntegrationDialogOpen] = useState(false);
  const [isIntegrationDialogClosing, setIsIntegrationDialogClosing] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isShareDialogClosing, setIsShareDialogClosing] = useState(false);
  const [sharedShareId, setSharedShareId] = useState<string | null>(null);
  const [isSharedDialogClosing, setIsSharedDialogClosing] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchItems, setSearchItems] = useState<CloudyItem[]>([]);
  const [searchItemsLoading, setSearchItemsLoading] = useState(false);
  const [searchItemsError, setSearchItemsError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [bulkActionMode, setBulkActionMode] = useState<"move" | "delete" | null>(null);
  const [categoryItems, setCategoryItems] = useState<Record<string, CloudyItem[]>>({});
  const [categoryItemsLoading, setCategoryItemsLoading] = useState(false);
  const [categoryItemsError, setCategoryItemsError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const categoriesRequestId = useRef(0);
  const categoryRequestId = useRef(0);
  const searchItemsRequestId = useRef(0);
  const searchItemsLoadedRef = useRef(false);
  const searchItemsPendingRequestId = useRef<number | null>(null);
  const detailReturnItemRef = useRef<CloudyItem | null>(null);
  const deleteSucceededRef = useRef(false);
  const itemDialogClosingStartedRef = useRef(false);
  const itemDeleteClosingStartedRef = useRef(false);
  const categoryCacheRefreshGenerationRef = useRef(0);
  const isActionCloudSuppressed = bulkActionMode !== null || isItemDialogOpen || isItemDialogClosing || detailItem !== null || isItemDeleteOpen || isItemDeleteClosing || isTagManagerOpen || isIntegrationDialogOpen || isIntegrationDialogClosing || isShareDialogOpen || isShareDialogClosing || sharedShareId !== null || isSharedDialogClosing || isSearchOpen;
  const isModalOpen = bulkActionMode !== null || isItemDialogOpen || isItemDialogClosing || detailItem !== null || isItemDeleteOpen || isItemDeleteClosing || isTagManagerOpen || isIntegrationDialogOpen || isIntegrationDialogClosing || isShareDialogOpen || isShareDialogClosing || sharedShareId !== null || isSharedDialogClosing || isSearchOpen;
  const photoURL = user?.photoURL ?? profile?.picture;
  const email = user?.email ?? profile?.email;
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const managedCategories = useMemo(() => categories.filter((category) => !category.isVirtual && !category.isSystem), [categories]);
  const visibleItems = selectedCategoryId ? categoryItems[selectedCategoryId] ?? [] : [];
  const incomingShareParam = useRef<string | null>(new URLSearchParams(window.location.search).get("share"));

  useEffect(() => {
    if (categoriesLoading || !incomingShareParam.current) return;
    setSharedShareId(incomingShareParam.current);
    incomingShareParam.current = null;
  }, [categoriesLoading]);

  const loadSearchItems = useCallback(async ({ background = false, force = false, preserveItem }: RefreshOptions = {}) => {
    if (!force && (searchItemsLoadedRef.current || searchItemsPendingRequestId.current !== null)) return;
    const requestId = ++searchItemsRequestId.current;
    searchItemsPendingRequestId.current = requestId;
    if (!background) {
      setSearchItemsLoading(true);
      setSearchItemsError(null);
    }
    try {
      const response = await apiRequest<ItemsResponse>("/items");
      if (requestId !== searchItemsRequestId.current) return;
      setSearchItems(preserveItem ? upsertItem(response.items, preserveItem) : sortUniqueItems(response.items));
      searchItemsLoadedRef.current = true;
    } catch {
      if (requestId === searchItemsRequestId.current && !background) setSearchItemsError("Não conseguimos abrir sua busca agora.");
    } finally {
      if (requestId === searchItemsRequestId.current) {
        searchItemsPendingRequestId.current = null;
        setSearchItemsLoading(false);
      }
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

  const loadCategories = useCallback(async ({ background = false, preserveItem }: RefreshOptions = {}) => {
    const requestId = ++categoriesRequestId.current;
    if (!background) {
      setCategoriesLoading(true);
      setCategoriesError(null);
    }
    try {
      const response = await apiRequest<CategoriesResponse>("/categories");
      if (requestId !== categoriesRequestId.current) return;
      setCategories(preserveItem ? updateCategorySummary(response.categories, preserveItem, toCategoryRecentItem(preserveItem)) : response.categories);
    } catch {
      if (requestId === categoriesRequestId.current && !background) setCategoriesError("Não conseguimos abrir suas coleções agora.");
    } finally {
      if (requestId === categoriesRequestId.current) setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => { void loadCategories(); }, [loadCategories]);

  const loadCategoryItems = useCallback(async (categoryId: string, { background = false, force = false, preserveItem, select = true }: CategoryItemsRefreshOptions = {}) => {
    const requestId = ++categoryRequestId.current;
    if (select) setSelectedCategoryId(categoryId);
    if (!background) setCategoryItemsError(null);
    if (!force && categoryItems[categoryId]) {
      setCategoryItemsLoading(false);
      return;
    }

    if (!background) setCategoryItemsLoading(true);
    try {
      const response = await apiRequest<ItemsResponse>(`/categories/${encodeURIComponent(categoryId)}/items`);
      if (requestId !== categoryRequestId.current) return;
      setCategoryItems((current) => ({ ...current, [categoryId]: preserveItem ? upsertItem(response.items, preserveItem) : sortUniqueItems(response.items) }));
    } catch {
      if (requestId !== categoryRequestId.current) return;
      if (!background) setCategoryItemsError("Não conseguimos abrir os itens desta coleção.");
    } finally {
      if (requestId === categoryRequestId.current) setCategoryItemsLoading(false);
    }
  }, [categoryItems]);

  const handleCategoryBack = useCallback(() => {
    categoryRequestId.current += 1;
    setSelectedCategoryId(null);
    setSelectedItemIds([]);
    setSelectionMode(false);
    setCategoryItemsLoading(false);
    setCategoryItemsError(null);
  }, []);

  useEffect(() => {
    if (selectedCategoryId && !selectedCategory) handleCategoryBack();
  }, [handleCategoryBack, selectedCategory, selectedCategoryId]);

  useEffect(() => {
    setSelectedItemIds([]);
    setSelectionMode(false);
  }, [selectedCategoryId]);

  const handleItemCreated = useCallback((item: CloudyItem) => {
    const categoryId = item.category?.id ?? UNTAGGED_CATEGORY_ID;
    const recentItem = toCategoryRecentItem(item);
    const shouldRefreshSearch = searchItemsLoadedRef.current || searchItemsPendingRequestId.current !== null;
    setCategories((currentCategories) => updateCategorySummary(currentCategories, item, recentItem));
    setCategoryItems((currentItems) => {
      if (!Object.prototype.hasOwnProperty.call(currentItems, categoryId)) return currentItems;
      return { ...currentItems, [categoryId]: upsertItem(currentItems[categoryId], item) };
    });
    if (shouldRefreshSearch) {
      searchItemsLoadedRef.current = true;
      setSearchItems((currentItems) => upsertItem(currentItems, item));
      setSearchItemsError(null);
    }
    showSavedMessage(setSavedMessage);
    void loadCategories({ background: true, preserveItem: item });
    if (selectedCategoryId === categoryId) {
      void loadCategoryItems(categoryId, { background: true, force: true, preserveItem: item, select: false });
    }
    if (shouldRefreshSearch) void loadSearchItems({ background: true, force: true, preserveItem: item });
  }, [loadCategories, loadCategoryItems, loadSearchItems, selectedCategoryId]);

  const openItemDetail = useCallback((item: CloudyItem) => {
    setDetailItem(item);
    setIsItemDetailOpen(true);
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((current) => {
      if (current) setSelectedItemIds([]);
      return !current;
    });
  }, []);

  const toggleItemSelection = useCallback((item: CloudyItem) => {
    setSelectedItemIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
  }, []);

  const selectAllItems = useCallback(() => {
    if (visibleItems.length === 0) return;
    setSelectedItemIds(visibleItems.map((item) => item.id));
  }, [visibleItems]);

  const selectedItems = useMemo(() => visibleItems.filter((item) => selectedItemIds.includes(item.id)), [selectedItemIds, visibleItems]);

  const startItemAction = useCallback((type: PendingItemAction["type"], item: CloudyItem) => {
    setPendingItemAction({ type, item });
    setIsItemDetailOpen(false);
  }, []);

  const handleItemDetailExited = useCallback(() => {
    setDetailItem(null);
    if (!pendingItemAction) return;
    const action = pendingItemAction;
    setPendingItemAction(null);
    detailReturnItemRef.current = action.item;
    if (action.type === "edit") {
      setEditingItem(action.item);
      setIsItemDialogOpen(true);
      return;
    }
    deleteSucceededRef.current = false;
    setDeletingItem(action.item);
    setIsItemDeleteOpen(true);
  }, [pendingItemAction]);

  const invalidateItemRequests = useCallback(() => {
    categoriesRequestId.current += 1;
    categoryRequestId.current += 1;
    searchItemsRequestId.current += 1;
    categoryCacheRefreshGenerationRef.current += 1;
    searchItemsPendingRequestId.current = null;
    setCategoriesLoading(false);
    setCategoryItemsLoading(false);
    setSearchItemsLoading(false);
  }, []);

  const revalidateLoadedCategoryItems = useCallback((categoryIds: string[]) => {
    const generation = categoryCacheRefreshGenerationRef.current;
    for (const categoryId of categoryIds) {
      void apiRequest<ItemsResponse>(`/categories/${encodeURIComponent(categoryId)}/items`).then((response) => {
        if (generation !== categoryCacheRefreshGenerationRef.current) return;
        setCategoryItems((current) => Object.prototype.hasOwnProperty.call(current, categoryId)
          ? { ...current, [categoryId]: sortUniqueItems(response.items) }
          : current);
      }).catch(() => undefined);
    }
  }, []);

  const performBulkAction = useCallback(async (payload: BulkItemActionPayload) => {
    const response = await apiRequest<BulkItemActionResponse>("/items/bulk-actions", { method: "POST", body: JSON.stringify(payload) });
    const affectedIds = new Set(payload.itemIds);
    const destinationId = payload.action === "move" ? (payload.categoryId ?? UNTAGGED_CATEGORY_ID) : null;
    invalidateItemRequests();
    setCategories(response.categories);
    setCategoryItems((current) => {
      const next = { ...current };
      const sourceId = payload.sourceCategoryId;
      if (Object.prototype.hasOwnProperty.call(next, sourceId)) next[sourceId] = next[sourceId].filter((item) => !affectedIds.has(item.id));
      if (destinationId && Object.prototype.hasOwnProperty.call(next, destinationId)) next[destinationId] = sortUniqueItems([...next[destinationId].filter((item) => !affectedIds.has(item.id)), ...response.items]);
      return next;
    });
    if (searchItemsLoadedRef.current) setSearchItems((current) => payload.action === "delete" ? current.filter((item) => !affectedIds.has(item.id)) : sortUniqueItems([...current.filter((item) => !affectedIds.has(item.id)), ...response.items]));
    setBulkActionMode(null);
    setSelectedItemIds([]);
    setSelectionMode(false);
    showSavedMessage(setSavedMessage, payload.action === "delete" ? `${payload.itemIds.length} ${payload.itemIds.length === 1 ? "item excluído" : "itens excluídos"} da sua nuvem.` : `${payload.itemIds.length} ${payload.itemIds.length === 1 ? "item movido" : "itens movidos"}.`);
    void loadCategories({ background: true });
    revalidateLoadedCategoryItems(Object.keys(categoryItems));
    if (searchItemsLoadedRef.current) void loadSearchItems({ background: true, force: true });
  }, [categoryItems, invalidateItemRequests, loadCategories, loadSearchItems, revalidateLoadedCategoryItems]);

  const openBulkMove = useCallback(() => { if (selectedItems.length > 0) setBulkActionMode("move"); }, [selectedItems.length]);
  const openBulkDelete = useCallback(() => { if (selectedItems.length > 0) setBulkActionMode("delete"); }, [selectedItems.length]);

  const reconcileItemMutation = useCallback((previousItem: CloudyItem, nextItem: CloudyItem | null) => {
    const shouldRefreshSearch = searchItemsLoadedRef.current || searchItemsPendingRequestId.current !== null;
    const loadedCategoryIds = Object.keys(categoryItems);
    invalidateItemRequests();
    setCategories((current) => reconcileCategories(current, previousItem, nextItem));
    setCategoryItems((current) => reconcileCategoryItemCache(current, previousItem, nextItem));
    if (shouldRefreshSearch) {
      searchItemsLoadedRef.current = true;
      setSearchItems((current) => nextItem ? upsertItem(current.filter((item) => item.id !== previousItem.id), nextItem) : current.filter((item) => item.id !== previousItem.id));
      setSearchItemsError(null);
    }
    void loadCategories({ background: true });
    revalidateLoadedCategoryItems(loadedCategoryIds);
    if (shouldRefreshSearch) void loadSearchItems({ background: true, force: true });
  }, [categoryItems, invalidateItemRequests, loadCategories, loadSearchItems, revalidateLoadedCategoryItems]);

  const handleItemSaved = useCallback((item: CloudyItem, previousItem: CloudyItem | null) => {
    if (!previousItem) {
      handleItemCreated(item);
      return;
    }
    reconcileItemMutation(previousItem, item);
    detailReturnItemRef.current = item;
    showSavedMessage(setSavedMessage, "Item atualizado na sua nuvem.");
  }, [handleItemCreated, reconcileItemMutation]);

  const handleItemDialogClosingChange = useCallback((closing: boolean) => {
    setIsItemDialogClosing(closing);
    if (closing) {
      itemDialogClosingStartedRef.current = true;
      return;
    }
    if (!itemDialogClosingStartedRef.current) return;
    itemDialogClosingStartedRef.current = false;
    if (!editingItem) return;
    const returnItem = detailReturnItemRef.current;
    detailReturnItemRef.current = null;
    setEditingItem(null);
    if (returnItem) openItemDetail(returnItem);
  }, [editingItem, openItemDetail]);

  const handleItemDeleted = useCallback((item: CloudyItem) => {
    reconcileItemMutation(item, null);
    deleteSucceededRef.current = true;
    detailReturnItemRef.current = null;
    showSavedMessage(setSavedMessage, "Item excluído da sua nuvem.");
  }, [reconcileItemMutation]);

  const handleItemDeleteClosingChange = useCallback((closing: boolean) => {
    setIsItemDeleteClosing(closing);
    if (closing) {
      itemDeleteClosingStartedRef.current = true;
      return;
    }
    if (!itemDeleteClosingStartedRef.current) return;
    itemDeleteClosingStartedRef.current = false;
    if (!deletingItem) return;
    const returnItem = deleteSucceededRef.current ? null : detailReturnItemRef.current;
    detailReturnItemRef.current = null;
    deleteSucceededRef.current = false;
    setDeletingItem(null);
    if (returnItem) openItemDetail(returnItem);
  }, [deletingItem, openItemDetail]);

  const handleCategoriesChange = useCallback((nextCategories: CategorySummary[]) => {
    const reservedCategories = categories.filter((category) => category.isVirtual || category.isSystem);
    const next = sortCategories([...nextCategories.filter((category) => !category.isVirtual && !category.isSystem), ...reservedCategories]);
    setCategories(next);
    setCategoryItems({});
    if (selectedCategoryId && !next.some((category) => category.id === selectedCategoryId)) handleCategoryBack();
    void loadCategories();
  }, [categories, handleCategoryBack, loadCategories, selectedCategoryId]);

  const clearShareUrl = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("share");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const handleSharedCategoriesImported = useCallback((importedCategories: CategorySummary[]) => {
    setCategories((current) => sortCategories([...current.filter((category) => !importedCategories.some((imported) => imported.id === category.id)), ...importedCategories]));
    setCategoryItems({});
    showSavedMessage(setSavedMessage, `${importedCategories.length} ${importedCategories.length === 1 ? "coleção adicionada" : "coleções adicionadas"} à sua nuvem.`);
    clearShareUrl();
    void loadCategories({ background: true });
    if (searchItemsLoadedRef.current) void loadSearchItems({ background: true, force: true });
  }, [clearShareUrl, loadCategories, loadSearchItems]);

  const retry = selectedCategoryId ? () => void loadCategoryItems(selectedCategoryId) : () => void loadCategories();
  const retrySearch = () => { searchItemsLoadedRef.current = false; void loadSearchItems(); };

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
          onAddLink={() => { setEditingItem(null); setIsItemDialogOpen(true); }}
          onCategorySelect={(categoryId) => void loadCategoryItems(categoryId)}
          onCategoryBack={handleCategoryBack}
          onItemSelect={openItemDetail}
          selectionMode={selectionMode}
          selectedItemIds={selectedItemIds}
          onItemToggle={toggleItemSelection}
          activeItemId={detailItem?.id}
        >
          <Suspense fallback={<div className="cloud-mascot" aria-hidden="true" />}>
            <CloudMascot />
          </Suspense>
        </ItemGraph>
      </section>
      <aside className={`action-cloud-dock${isActionCloudSuppressed ? " action-cloud-dock--hidden" : ""}`} aria-label="Ações do Cloudy" aria-hidden={isActionCloudSuppressed}>
        <CloudActionCloud email={email} name={profile?.name} onSignOut={signOutUser} photoURL={photoURL} disabled={isActionCloudSuppressed} selectionAvailable={selectedCategory !== null} selectionMode={selectionMode} selectedCount={selectedItemIds.length} onSelectionToggle={toggleSelectionMode} onSelectAll={selectAllItems} onBulkMove={openBulkMove} onBulkDelete={openBulkDelete} onAddLink={() => { setEditingItem(null); setIsItemDialogOpen(true); }} onSearch={openSearch} onTagsOpen={() => setIsTagManagerOpen(true)} onIntegrationsOpen={() => setIsIntegrationDialogOpen(true)} onShareOpen={() => setIsShareDialogOpen(true)} />
      </aside>
      {savedMessage && <p className="workspace-toast" role="status">{savedMessage}</p>}
      <BulkActionDialog open={bulkActionMode !== null} mode={bulkActionMode ?? "move"} items={selectedItems} sourceCategory={selectedCategory ?? { id: "", name: "", color: "", itemCount: 0, recentItems: [] }} categories={categories} onClose={() => setBulkActionMode(null)} onConfirm={(categoryId) => performBulkAction(bulkActionMode === "delete" ? { action: "delete", itemIds: selectedItemIds, sourceCategoryId: selectedCategoryId ?? "" } : { action: "move", itemIds: selectedItemIds, sourceCategoryId: selectedCategoryId ?? "", categoryId: categoryId === "__untagged__" ? null : categoryId ?? null })} />
      <ItemDialog open={isItemDialogOpen} item={editingItem} categoryOptions={managedCategories} onClose={() => setIsItemDialogOpen(false)} onSaved={handleItemSaved} onClosingChange={handleItemDialogClosingChange} />
      <ItemDeleteDialog open={isItemDeleteOpen} item={deletingItem} onClose={() => setIsItemDeleteOpen(false)} onDeleted={handleItemDeleted} onClosingChange={handleItemDeleteClosingChange} />
      <TagManagerDialog open={isTagManagerOpen} categories={managedCategories} onClose={() => setIsTagManagerOpen(false)} onCategoriesChange={handleCategoriesChange} />
      <IntegrationDialog open={isIntegrationDialogOpen} onClose={() => setIsIntegrationDialogOpen(false)} onClosingChange={setIsIntegrationDialogClosing} />
      <ShareDialog open={isShareDialogOpen} categories={managedCategories} onClose={() => setIsShareDialogOpen(false)} onClosingChange={setIsShareDialogClosing} />
      <SharedCategoriesDialog open={sharedShareId !== null} shareId={sharedShareId} currentCategoryCount={managedCategories.length} onClose={() => { setSharedShareId(null); clearShareUrl(); }} onImported={handleSharedCategoriesImported} onClosingChange={setIsSharedDialogClosing} />
      <CommandPalette open={isSearchOpen} items={searchItems} isLoading={searchItemsLoading} error={searchItemsError} onClose={closeSearch} onRetry={retrySearch} onSelect={(item) => { closeSearch(); openItemDetail(item); }} />
      {detailItem && <ItemDetail item={detailItem} open={isItemDetailOpen} onClose={() => setIsItemDetailOpen(false)} onExited={handleItemDetailExited} onEdit={(item) => startItemAction("edit", item)} onDelete={(item) => startItemAction("delete", item)} />}
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
      itemCount: category.recentItems.some((currentItem) => currentItem.id === recentItem.id) ? category.itemCount : category.itemCount + 1,
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

function reconcileCategories(categories: CategorySummary[], previousItem: CloudyItem, nextItem: CloudyItem | null): CategorySummary[] {
  const previousCategoryId = getItemCategoryId(previousItem);
  const nextCategoryId = nextItem ? getItemCategoryId(nextItem) : null;
  const nextRecentItem = nextItem ? toCategoryRecentItem(nextItem) : null;

  let reconciled = categories.map((category) => {
    const isPreviousCategory = category.id === previousCategoryId;
    const isNextCategory = nextCategoryId !== null && category.id === nextCategoryId;
    if (!isPreviousCategory && !isNextCategory) return category;

    if (isPreviousCategory && isNextCategory && nextRecentItem) {
      return {
        ...category,
        recentItems: category.recentItems.map((recentItem) => recentItem.id === previousItem.id ? nextRecentItem : recentItem).sort(compareRecentItems).slice(0, 5)
      };
    }

    if (isPreviousCategory) {
      return {
        ...category,
        itemCount: Math.max(0, category.itemCount - 1),
        recentItems: category.recentItems.filter((recentItem) => recentItem.id !== previousItem.id)
      };
    }

    return {
      ...category,
      itemCount: category.itemCount + 1,
      recentItems: nextRecentItem ? [nextRecentItem, ...category.recentItems.filter((recentItem) => recentItem.id !== nextRecentItem.id)].sort(compareRecentItems).slice(0, 5) : category.recentItems
    };
  });

  if (nextItem && nextCategoryId && !reconciled.some((category) => category.id === nextCategoryId)) {
    const nextCategory: CategorySummary = nextItem.category ? {
      ...nextItem.category,
      itemCount: 1,
      recentItems: nextRecentItem ? [nextRecentItem] : []
    } : {
      id: UNTAGGED_CATEGORY_ID,
      name: "Vazio",
      color: EMPTY_CATEGORY_COLOR,
      itemCount: 1,
      recentItems: nextRecentItem ? [nextRecentItem] : [],
      isVirtual: true
    };
    reconciled = [...reconciled, nextCategory];
  }

  return sortCategories(reconciled.filter((category) => category.id !== UNTAGGED_CATEGORY_ID || category.itemCount > 0));
}

function reconcileCategoryItemCache(cache: Record<string, CloudyItem[]>, previousItem: CloudyItem, nextItem: CloudyItem | null): Record<string, CloudyItem[]> {
  const nextCategoryId = nextItem ? getItemCategoryId(nextItem) : null;
  let changed = false;
  const reconciled = Object.fromEntries(Object.entries(cache).map(([categoryId, items]) => {
    const withoutPrevious = items.filter((item) => item.id !== previousItem.id);
    const nextItems = nextItem && categoryId === nextCategoryId ? upsertItem(withoutPrevious, nextItem) : withoutPrevious;
    if (nextItems.length !== items.length || nextItems.some((item, index) => item !== items[index])) changed = true;
    return [categoryId, nextItems];
  }));
  return changed ? reconciled : cache;
}

function getItemCategoryId(item: CloudyItem): string {
  return item.category?.id ?? UNTAGGED_CATEGORY_ID;
}

function compareRecentItems(first: CategoryRecentItem, second: CategoryRecentItem): number {
  return second.createdAt.localeCompare(first.createdAt) || second.id.localeCompare(first.id);
}

function upsertItem(items: CloudyItem[], item: CloudyItem): CloudyItem[] {
  return sortUniqueItems([item, ...items]);
}

function sortUniqueItems(items: CloudyItem[]): CloudyItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt) || second.id.localeCompare(first.id));
}

function sortCategories(categories: CategorySummary[]): CategorySummary[] {
  return [...categories].sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

function showSavedMessage(setSavedMessage: (message: string | null) => void, message = "Referência salva na sua nuvem.") {
  setSavedMessage(message);
  window.setTimeout(() => setSavedMessage(null), 2600);
}
