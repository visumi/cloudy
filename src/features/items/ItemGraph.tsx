import { useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent, type ReactNode } from "react";
import { ExternalLink, X } from "lucide-react";
import { useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import type { CloudyItem } from "../../types/api";
import { buildItemGraphLayout } from "./item-graph";

const FALLBACK_IMAGE = "/cloudy-icon.png";

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
        {layout.clusters.map((cluster) => (
          <line key={cluster.categoryId} x1="50" y1="48" x2={cluster.left} y2={cluster.top} />
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
            aria-label={`${item.name}, categoria ${item.category.name}`}
            aria-pressed={selectedItemId === item.id}
            onClick={() => { setSelectedItemId(item.id); setDetailItem(item); }}
          >
            <FallbackImage src={item.imageUrl} alt="" className="item-node-image" />
            <span className="item-node-copy">
              <strong>{item.name}</strong>
              <small>{item.category.name}</small>
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
  const exitTimerRef = useRef<number | undefined>(undefined);
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
  }, []);

  if (!shouldRender) return null;

  return (
    <div className="item-detail-backdrop" data-closing={isClosing || undefined} role="presentation" onClick={requestClose}>
      <section className="item-detail-panel" data-closing={isClosing || undefined} data-dragging={drawerGesture.isDragging || undefined} style={drawerGesture.panelStyle} onAnimationEnd={handleExitAnimationEnd} role="dialog" aria-modal="true" aria-labelledby="item-detail-title" onClick={(event) => event.stopPropagation()}>
        <div className="mobile-drawer-handle" aria-hidden="true" {...drawerGesture.handleProps} />
        <button className="item-detail-close" type="button" aria-label="Fechar detalhes" onClick={requestClose}><X aria-hidden="true" /></button>
        <FallbackImage src={item.imageUrl} alt="" className="item-detail-image" />
        <div className="item-detail-content">
          <div className="item-detail-source">
            <FallbackImage src={item.faviconUrl} alt="" className="item-detail-favicon" />
            <span className="item-detail-category">{item.category.name}</span>
          </div>
          <h2 id="item-detail-title">{item.name}</h2>
          {item.observation && <p>{item.observation}</p>}
          <a href={item.url} target="_blank" rel="noreferrer">
            Abrir referência <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}

export function FallbackImage({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [imageSrc, setImageSrc] = useState(src || FALLBACK_IMAGE);

  useEffect(() => {
    setImageSrc(src || FALLBACK_IMAGE);
  }, [src]);

  return <img className={className} src={imageSrc} alt={alt} onError={() => setImageSrc(FALLBACK_IMAGE)} />;
}
