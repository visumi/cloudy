import { useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Globe, X } from "lucide-react";
import { useMobileDrawerBodyLock, useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import type { CloudyItem } from "../../types/api";
import { buildItemGraphLayout } from "./item-graph";
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
  items: CloudyItem[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onAddLink: () => void;
  onDetailOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function ItemGraph({ items, isLoading, error, onRetry, onAddLink, onDetailOpenChange, children }: ItemGraphProps) {
  const layout = useMemo(() => buildItemGraphLayout(items), [items]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<CloudyItem | null>(null);
  const selectedItem = items.find((item) => item.id === selectedItemId) || null;

  useEffect(() => {
    if (selectedItemId && !selectedItem) setSelectedItemId(null);
  }, [selectedItem, selectedItemId]);

  useEffect(() => {
    if (selectedItem) setDetailItem(selectedItem);
  }, [selectedItem]);

  useEffect(() => {
    onDetailOpenChange?.(detailItem !== null);
  }, [detailItem, onDetailOpenChange]);

  return (
    <div className="graph-scene">
      <svg className="graph-connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {layout.connections.map((connection, index) => (
          <line className={`graph-connection graph-connection--${connection.kind}`} key={`${connection.kind}-${index}`} x1={connection.x1} y1={connection.y1} x2={connection.x2} y2={connection.y2} />
        ))}
      </svg>
      <div className="graph-cloud">{children}</div>
      <div className="graph-nodes" aria-label="Itens salvos">
        {layout.nodes.map(({ item, left, top }) => (
          <button
            className={`item-node${selectedItemId === item.id ? " item-node--selected" : ""}`}
            key={item.id}
            type="button"
            style={{ left: `${left}%`, top: `${top}%` }}
            aria-label={`${item.name}, ${item.category ? `categoria ${item.category.name}` : "categoria Vazio"}`}
            aria-pressed={selectedItemId === item.id}
            onClick={() => { setSelectedItemId(item.id); setDetailItem(item); }}
          >
            <FallbackImage src={item.imageUrl} alt="" className="item-node-image" />
            <span className="item-node-copy">
              <strong>{item.name}</strong>
            <small className="item-node-category" style={getCategoryColorStyle(item.category?.color ?? EMPTY_CATEGORY_COLOR)}><span aria-hidden="true" /><span>{item.category?.name ?? "Vazio"}</span></small>
            </span>
          </button>
        ))}
      </div>

      {isLoading && <p className="graph-status" role="status">Abrindo sua nuvem...</p>}
      {!isLoading && error && (
        <div className="graph-status graph-status--error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onRetry}>Tentar novamente</button>
        </div>
      )}
      {!isLoading && !error && items.length === 0 && (
        <div className="graph-empty-state">
          <p>Sua nuvem começa com uma referência.</p>
          <button type="button" onClick={onAddLink}>Adicionar primeiro link</button>
        </div>
      )}
      {detailItem && <ItemDetail item={detailItem} open={selectedItemId === detailItem.id} onClose={() => setSelectedItemId(null)} onExited={() => setDetailItem(null)} />}
    </div>
  );
}

const ITEM_DETAIL_EXIT_DURATION = 200;

function ItemDetail({ item, open, onClose, onExited }: { item: CloudyItem; open: boolean; onClose: () => void; onExited: () => void }) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const copyTimerRef = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);

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
        <button className="item-detail-close" type="button" aria-label="Fechar detalhes" onClick={requestClose}><X aria-hidden="true" /></button>
        <FallbackImage src={item.imageUrl} alt="" className="item-detail-image" />
        <div className="item-detail-content">
          <div className="item-detail-source">
            <FallbackImage src={item.faviconUrl} alt="" className="item-detail-favicon" />
            <span className="item-detail-category" style={getCategoryColorStyle(category?.color ?? EMPTY_CATEGORY_COLOR)}><span aria-hidden="true" /><span>{category?.name ?? "Vazio"}</span></span>
          </div>
          <h2 id="item-detail-title">{item.name}</h2>
          <p className="item-detail-saved-at">Salvo em: {formatSavedDate(item.createdAt)}</p>
          {item.observation && <p>{item.observation}</p>}
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

export function FallbackImage({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [imageSrc, setImageSrc] = useState(src || FALLBACK_IMAGE);

  useEffect(() => {
    setImageSrc(src || FALLBACK_IMAGE);
  }, [src]);

  return <img className={className} src={imageSrc} alt={alt} onError={() => setImageSrc(FALLBACK_IMAGE)} />;
}
