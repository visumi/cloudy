import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type AnimationEvent, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Blocks, Check, Copy, EllipsisVertical, Ghost, Globe, NotepadText, Pencil, Trash2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { useMobileDrawerBodyLock, useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import { INTEGRATIONS_CATEGORY_ID, type CategorySummary, type CloudyItem } from "../../types/api";
import { buildCategoryGraphLayout, buildCategoryItemGraphLayout } from "./item-graph";
import { EMPTY_CATEGORY_COLOR, getCategoryColorStyle } from "./category-colors";

const FALLBACK_IMAGE = "/cloudy-icon.png";
const SAVED_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

function formatSavedDate(value: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;

  const normalizedValue = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? value : SAVED_DATE_FORMATTER.format(date);
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Não foi possível copiar o link");
}

interface ItemGraphProps {
  categories: CategorySummary[];
  items: CloudyItem[];
  selectedCategory: CategorySummary | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onAddLink: () => void;
  onCategorySelect: (categoryId: string) => void;
  onCategoryBack: () => void;
  onItemSelect: (item: CloudyItem) => void;
  activeItemId?: string | null;
  children: ReactNode;
}

const DEFAULT_GRAPH_ZOOM = 0.9;
const CATEGORY_GRAPH_TRANSITION_DURATION = 360;
const OVERVIEW_GRAPH_TRANSITION_DURATION = 320;

type GraphViewTransition = "overview" | "to-category" | "category" | "to-overview";

export function ItemGraph({ categories, items, selectedCategory, isLoading, error, onRetry, onAddLink, onCategorySelect, onCategoryBack, onItemSelect, activeItemId = null, children }: ItemGraphProps) {
  const categoryLayout = useMemo(() => buildCategoryGraphLayout(categories), [categories]);
  const itemLayout = useMemo(() => buildCategoryItemGraphLayout(items), [items]);
  const isCategoryView = selectedCategory !== null;
  const [viewTransition, setViewTransition] = useState<GraphViewTransition>(selectedCategory ? "category" : "overview");
  const previousCategoryRef = useRef<CategorySummary | null>(selectedCategory);
  const viewTransitionTimerRef = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const previousCategory = previousCategoryRef.current;
    const nextCategory = selectedCategory;
    previousCategoryRef.current = nextCategory;
    if (viewTransitionTimerRef.current !== undefined) window.clearTimeout(viewTransitionTimerRef.current);

    const previousMode = previousCategory ? "category" : "overview";
    const nextMode = nextCategory ? "category" : "overview";
    if (previousMode === nextMode && previousCategory?.id === nextCategory?.id) {
      setViewTransition(nextMode);
      return;
    }

    const enteringCategory = nextMode === "category";
    setViewTransition(enteringCategory ? "to-category" : "to-overview");
    viewTransitionTimerRef.current = window.setTimeout(() => {
      setViewTransition(enteringCategory ? "category" : "overview");
      viewTransitionTimerRef.current = undefined;
    }, enteringCategory ? CATEGORY_GRAPH_TRANSITION_DURATION : OVERVIEW_GRAPH_TRANSITION_DURATION);

    return () => {
      if (viewTransitionTimerRef.current !== undefined) window.clearTimeout(viewTransitionTimerRef.current);
    };
  }, [selectedCategory?.id]);

  useEffect(() => () => {
    if (viewTransitionTimerRef.current !== undefined) window.clearTimeout(viewTransitionTimerRef.current);
  }, []);

  const categoryNodesState = viewTransition === "to-category" ? "exiting" : viewTransition === "to-overview" ? "entering" : viewTransition === "overview" ? "active" : "hidden";
  const itemNodesState = viewTransition === "to-category" ? "entering" : viewTransition === "to-overview" ? "exiting" : viewTransition === "category" ? "active" : "hidden";
  const graphLayerStyle = isCategoryView ? { transform: `scale(${DEFAULT_GRAPH_ZOOM})` } : undefined;

  return (
    <div className={`graph-scene${isCategoryView ? " graph-scene--category" : " graph-scene--overview"}`}>
      {selectedCategory && (
        <div className="graph-category-toolbar">
          <button className="graph-back-button" type="button" onClick={onCategoryBack} aria-label="Voltar para todas as coleções" title="Voltar para todas as coleções">
            <ArrowLeft aria-hidden="true" />
          </button>
          <div className="graph-category-heading" aria-live="polite">
            <strong>{selectedCategory.name}</strong>
            <span>{formatItemCount(selectedCategory.itemCount)}</span>
          </div>
        </div>
      )}

      <div
        className="graph-viewport"
      >
        <div className="graph-zoom-layer" style={graphLayerStyle as CSSProperties}>
          <svg className="graph-connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <g className="graph-connection-layer graph-connection-layer--categories" data-state={categoryNodesState}>
              {categoryLayout.connections.map((connection, index) => (
                <line className={`graph-connection graph-connection--${connection.kind}`} key={`category-${connection.kind}-${index}`} x1={connection.x1} y1={connection.y1} x2={connection.x2} y2={connection.y2} />
              ))}
            </g>
            <g className="graph-connection-layer graph-connection-layer--items" data-state={itemNodesState}>
              {itemLayout.connections.map((connection, index) => (
                <line className={`graph-connection graph-connection--${connection.kind}`} key={`item-${connection.kind}-${index}`} x1={connection.x1} y1={connection.y1} x2={connection.x2} y2={connection.y2} />
              ))}
            </g>
          </svg>
          <div className="graph-cloud">{children}</div>
          <div className="graph-nodes graph-nodes--categories" data-state={categoryNodesState} aria-hidden={categoryNodesState !== "active"} aria-label="Coleções salvas">
            {categoryLayout.nodes.map(({ category, left, top }, index) => (
              <button
                className={`category-node${category.id === INTEGRATIONS_CATEGORY_ID || category.isSystem ? " category-node--system" : category.isVirtual ? " category-node--virtual" : ""}`}
                key={category.id}
                type="button"
                style={{ left: `${left}%`, top: `${top}%`, "--graph-delay": `${Math.min(index, 7) * 18}ms`, ...getCategoryColorStyle(category.color) } as CSSProperties}
                aria-label={`Coleção ${category.name}, ${formatItemCount(category.itemCount)}`}
                onClick={() => onCategorySelect(category.id)}
              >
                <span className="category-node-orbit" aria-hidden="true">
                  {category.recentItems.map((preview, previewIndex) => (
                    <span className={`category-node-preview category-node-preview--${previewIndex}`} key={preview.id}>
                      <FallbackImage src={preview.imageUrl || preview.faviconUrl} alt="" className="category-node-preview-image" loading="lazy" />
                    </span>
                  ))}
                </span>
                <span className="category-node-content">
                  {category.id === INTEGRATIONS_CATEGORY_ID || category.isSystem ? <span className="category-node-icon" aria-hidden="true"><Blocks strokeWidth={2.1} /></span> : category.isVirtual ? <span className="category-node-icon" aria-hidden="true"><Ghost strokeWidth={2.1} /></span> : <span className="category-node-dot" aria-hidden="true" />}
                  <span className="category-node-copy">
                    <strong>{category.name}</strong>
                    <small>{formatItemCount(category.itemCount)}</small>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div key={`items-${selectedCategory?.id ?? "overview"}`} className={`graph-nodes graph-nodes--items${items.length > 20 ? " graph-nodes--dense" : ""}`} data-state={itemNodesState} aria-hidden={itemNodesState === "hidden" || itemNodesState === "exiting"} aria-label={selectedCategory ? `Itens de ${selectedCategory.name}` : "Itens da coleção"}>
            {itemLayout.nodes.map(({ item, left, top }, index) => (
              <button
                className={`item-node${activeItemId === item.id ? " item-node--selected" : ""}`}
                key={item.id}
                type="button"
                style={{ left: `${left}%`, top: `${top}%`, zIndex: items.length - index, "--graph-delay": `${Math.min(index, 7) * 12}ms`, "--graph-card-alpha": items.length > 20 ? (index % 4 === 1 ? ".72" : index % 4 === 2 ? ".84" : ".9") : ".94" } as CSSProperties}
                aria-label={`${item.name}, ${item.category ? `coleção ${item.category.name}` : "coleção Vazio"}`}
                aria-pressed={activeItemId === item.id}
                onClick={() => onItemSelect(item)}
              >
                <FallbackImage src={item.imageUrl} alt="" className="item-node-image" loading="lazy" />
                <span className="item-node-copy">
                  <strong>{item.name}</strong>
                  <small className="item-node-category" style={getCategoryColorStyle(item.category?.color ?? EMPTY_CATEGORY_COLOR)}><span aria-hidden="true" /><span>{item.category?.name ?? "Vazio"}</span></small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && <p className="graph-status" role="status">{isCategoryView ? `Abrindo ${selectedCategory.name}...` : "Abrindo suas coleções..."}</p>}
      {!isLoading && error && (
        <div className="graph-status graph-status--error" role="alert">
          <span>{error}</span>
          <button className="button-action" type="button" onClick={onRetry}>Tentar novamente</button>
        </div>
      )}
      {!isLoading && !error && !isCategoryView && categories.every((category) => category.id === INTEGRATIONS_CATEGORY_ID || category.isSystem) && (
        <div className="graph-empty-state">
          <p>Sua nuvem começa com uma referência.</p>
          <button className="button-action" type="button" onClick={onAddLink}>Adicionar primeiro link</button>
        </div>
      )}
      {!isLoading && !error && isCategoryView && items.length === 0 && (
        <div className="graph-empty-state">
          <p>Esta coleção ainda não tem referências</p>
          <button className="button-action" type="button" onClick={onCategoryBack}>Voltar para coleções</button>
        </div>
      )}
    </div>
  );
}

function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "itens"}`;
}

const ITEM_DETAIL_EXIT_DURATION = 200;

export function ItemDetail({ item, open, onClose, onExited, onEdit, onDelete }: { item: CloudyItem; open: boolean; onClose: () => void; onExited: () => void; onEdit: (item: CloudyItem) => void; onDelete: (item: CloudyItem) => void }) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const copyTimerRef = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const finishExit = useCallback(() => {
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = undefined;
    closingRef.current = false;
    setShouldRender(false);
    setIsClosing(false);
    onExited();
  }, [onExited]);

  const startExit = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    exitTimerRef.current = window.setTimeout(finishExit, ITEM_DETAIL_EXIT_DURATION);
  }, [finishExit]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    startExit();
    onClose();
  }, [onClose, startExit]);

  const drawerGesture = useMobileDrawerGesture(requestClose);
  useMobileDrawerBodyLock(shouldRender);
  const category = item.category;

  const handleExitAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (!isClosing || event.target !== event.currentTarget) return;
    if (event.animationName === "item-detail-departure" || event.animationName === "item-drawer-departure") finishExit();
  };

  useEffect(() => {
    if (open) {
      if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = undefined;
      closingRef.current = false;
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      startExit();
    }
  }, [open, shouldRender, startExit]);

  useEffect(() => () => {
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
    if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isMenuOpen || !menuRef.current) return;
    menuRef.current.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeMenu = (restoreFocus: boolean) => {
      setIsMenuOpen(false);
      if (restoreFocus) window.setTimeout(() => menuTriggerRef.current?.focus(), 0);
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) closeMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeMenu(true);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [isMenuOpen]);

  const handleCopy = useCallback(async () => {
    if (!item.url) return;
    try {
      await copyToClipboard(item.url);
      setIsCopied(true);
      if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setIsCopied(false);
        copyTimerRef.current = undefined;
      }, 1800);
    } catch {
      setIsCopied(false);
    }
  }, [item.url]);

  if (!shouldRender) return null;

  return createPortal(
    <div className="item-detail-backdrop" data-closing={isClosing || undefined} role="presentation" onClick={requestClose}>
      <section className="item-detail-panel" data-closing={isClosing || undefined} data-dragging={drawerGesture.isDragging || undefined} style={{ ...drawerGesture.panelStyle, ...getCategoryColorStyle(category?.color ?? EMPTY_CATEGORY_COLOR) }} onAnimationEnd={handleExitAnimationEnd} role="dialog" aria-modal="true" aria-labelledby="item-detail-title" onClick={(event) => event.stopPropagation()} {...drawerGesture.panelProps}>
        <div className="mobile-drawer-handle" aria-hidden="true" />
      <button className="modal-close item-detail-close" type="button" aria-label="Fechar detalhes" onClick={requestClose}><X aria-hidden="true" /></button>
        <FallbackImage src={item.imageUrl} alt="" className="item-detail-image" />
        <div className="item-detail-content">
          <div className="item-detail-source">
            <FallbackImage src={item.faviconUrl} alt="" className="item-detail-favicon" />
            <span className="item-detail-category" style={getCategoryColorStyle(category?.color ?? EMPTY_CATEGORY_COLOR)}><span aria-hidden="true" /><span>{category?.name ?? "Vazio"}</span></span>
          </div>
          <div className="item-detail-heading-row">
            <div className="item-detail-heading-copy">
              <h2 id="item-detail-title">{item.name}</h2>
              <p className="item-detail-saved-at">Salvo em: {formatSavedDate(item.createdAt)}</p>
            </div>
            <div ref={menuRef} className="item-detail-menu-wrap">
              <button
                ref={menuTriggerRef}
                className="item-detail-menu-trigger"
                type="button"
                aria-label={`Abrir ações de ${item.name}`}
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                aria-controls={`item-detail-menu-${item.id}`}
                onClick={() => setIsMenuOpen((current) => !current)}
              >
                <EllipsisVertical aria-hidden="true" />
              </button>
              {isMenuOpen && (
                <DropdownMenu id={`item-detail-menu-${item.id}`} label={`Ações de ${item.name}`}>
                  <DropdownMenuItem icon={Pencil} onClick={() => { setIsMenuOpen(false); onEdit(item); }}>Editar</DropdownMenuItem>
                  <DropdownMenuItem icon={Trash2} destructive onClick={() => { setIsMenuOpen(false); onDelete(item); }}>Excluir</DropdownMenuItem>
                </DropdownMenu>
              )}
            </div>
          </div>
          {item.observation && (
            <div className="item-detail-observation">
              <NotepadText aria-hidden="true" strokeWidth={2} />
              <p className="item-detail-observation-text">{item.observation}</p>
            </div>
          )}
          {item.url && (
            <div className="item-detail-actions">
              <a href={item.url} target="_blank" rel="noreferrer" title="Acessar">
                <Globe aria-hidden="true" />
                <span>Acessar</span>
              </a>
              <button className="item-detail-copy" type="button" aria-label={isCopied ? "Link copiado" : "Copiar link"} title={isCopied ? "Link copiado" : "Copiar link"} onClick={() => void handleCopy()}>
                {isCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}

export function FallbackImage({ src, alt, className, loading = "lazy" }: { src: string | null; alt: string; className: string; loading?: "lazy" | "eager" }) {
  const [imageSrc, setImageSrc] = useState(src || FALLBACK_IMAGE);

  useEffect(() => {
    setImageSrc(src || FALLBACK_IMAGE);
  }, [src]);

  return <img className={className} src={imageSrc} alt={alt} loading={loading} decoding="async" onError={() => setImageSrc(FALLBACK_IMAGE)} />;
}
