import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Ghost, LoaderCircle, PlayingCardsFan, X } from "lucide-react";
import { useMobileDrawerBodyLock, useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import { ApiError, apiRequest } from "../../lib/api";
import type { ImportShareResponse, ShareSnapshot, SharedCategorySummary } from "../../types/api";
import { getCategoryColorStyle } from "../items/category-colors";

const SHARED_DIALOG_EXIT_DURATION = 220;
const MAX_CATEGORIES_PER_USER = 15;

interface SharedCategoriesDialogProps {
  open: boolean;
  shareId: string | null;
  currentCategoryCount: number;
  onClose: () => void;
  onImported: (categories: ImportShareResponse["categories"]) => void;
  onClosingChange?: (closing: boolean) => void;
}

export function SharedCategoriesDialog({ open, shareId, currentCategoryCount, onClose, onImported, onClosingChange }: SharedCategoriesDialogProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);
  const shareRequestId = useRef(0);

  const availableSlots = Math.max(0, MAX_CATEGORIES_PER_USER - currentCategoryCount);
  const selectedCount = selectedIds.length;

  const finishExit = useCallback(() => {
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = undefined;
    closingRef.current = false;
    setShouldRender(false);
    setIsClosing(false);
    onClosingChange?.(false);
  }, [onClosingChange]);

  const startExit = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    onClosingChange?.(true);
    exitTimerRef.current = window.setTimeout(finishExit, SHARED_DIALOG_EXIT_DURATION);
  }, [finishExit, onClosingChange]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    startExit();
    onClose();
  }, [onClose, startExit]);

  const drawerGesture = useMobileDrawerGesture(requestClose);
  useMobileDrawerBodyLock(shouldRender);

  useEffect(() => {
    if (open) {
      if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = undefined;
      closingRef.current = false;
      setShouldRender(true);
      setIsClosing(false);
      setSnapshot(null);
      setSelectedIds([]);
      setError(null);
      setIsLoading(true);
      const requestId = ++shareRequestId.current;
      onClosingChange?.(false);
      const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
      if (shareId) {
        void apiRequest<ShareSnapshot>(`/shares/${encodeURIComponent(shareId)}`)
          .then((nextSnapshot) => { if (requestId === shareRequestId.current) setSnapshot(nextSnapshot); })
          .catch((requestError) => { if (requestId === shareRequestId.current) setError(requestError instanceof ApiError && requestError.code === "share_not_found" ? "Este link de compartilhamento não está disponível." : "Não conseguimos carregar este compartilhamento agora."); })
          .finally(() => { if (requestId === shareRequestId.current) setIsLoading(false); });
      } else {
        setError("Link de compartilhamento inválido.");
        setIsLoading(false);
      }
      return () => window.clearTimeout(focusTimer);
    }
    if (shouldRender) {
      shareRequestId.current += 1;
      startExit();
    }
  }, [open, shareId, shouldRender, startExit, onClosingChange]);

  useEffect(() => () => { if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current); }, []);

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { requestClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, input, [href]")].filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleDialogKeyDown);
    return () => { document.removeEventListener("keydown", handleDialogKeyDown); previousActiveElement?.focus?.(); };
  }, [open, requestClose]);

  const toggleCategory = (categoryId: string) => {
    setSelectedIds((current) => current.includes(categoryId) ? current.filter((id) => id !== categoryId) : current.length >= availableSlots ? current : [...current, categoryId]);
    setError(null);
  };

  const importCategories = async () => {
    if (!shareId || selectedIds.length === 0) return;
    setError(null);
    setIsImporting(true);
    try {
      const result = await apiRequest<ImportShareResponse>(`/shares/${encodeURIComponent(shareId)}/imports`, { method: "POST", body: JSON.stringify({ shareCategoryIds: selectedIds }) });
      onImported(result.categories);
      requestClose();
    } catch (requestError) {
      setError(requestError instanceof ApiError && requestError.code === "category_limit_reached" ? "Você não tem slots suficientes. Remova uma coleção e tente novamente." : "Não conseguimos adicionar essas coleções agora.");
    } finally {
      setIsImporting(false);
    }
  };

  if (!shouldRender) return null;
  const handleExitAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (!isClosing || event.target !== event.currentTarget) return;
    if (event.animationName === "integration-dialog-departure" || event.animationName === "item-drawer-departure") finishExit();
  };
  const categories: SharedCategorySummary[] = (snapshot?.categories ?? []).filter((category) => category.itemCount > 0);

  return createPortal(
    <div className="shared-backdrop" data-closing={isClosing || undefined} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={dialogRef} className="shared-panel" data-closing={isClosing || undefined} data-dragging={drawerGesture.isDragging || undefined} style={drawerGesture.panelStyle} onAnimationEnd={handleExitAnimationEnd} role="dialog" aria-modal="true" aria-labelledby="shared-dialog-title" aria-describedby="shared-dialog-description" {...drawerGesture.panelProps}>
        <div className="mobile-drawer-handle" aria-hidden="true" {...drawerGesture.handleProps} />
        <button ref={closeButtonRef} className="modal-close shared-close" type="button" aria-label="Fechar coleções compartilhadas" onClick={requestClose}><X aria-hidden="true" /></button>
        <div className="modal-heading shared-heading">
          <div className="modal-heading-icon" aria-hidden="true"><PlayingCardsFan /></div>
          <div className="modal-heading-copy"><h2 id="shared-dialog-title">Coleções compartilhadas</h2><p id="shared-dialog-description">Escolha o que você quer adicionar à sua nuvem.</p></div>
        </div>

        {isLoading ? <div className="share-loading" role="status"><LoaderCircle aria-hidden="true" /><span>Carregando compartilhamento...</span></div> : error && !snapshot ? <div className="share-error-state" role="alert"><Ghost aria-hidden="true" /><p>{error}</p></div> : (
          <>
            <div className="shared-list" aria-label="Coleções compartilhadas">
              {categories.length === 0 ? <p className="share-empty">Este compartilhamento não tem coleções.</p> : categories.map((category) => {
                const checked = selectedIds.includes(category.id);
                const disabled = !checked && (availableSlots === 0 || selectedCount >= availableSlots);
                return <label className={`share-category-option${checked ? " share-category-option--selected" : ""}${disabled ? " share-category-option--disabled" : ""}`} key={category.id} onClick={(event) => {
                  if (event.target instanceof HTMLInputElement || disabled || isImporting) return;
                  event.preventDefault();
                  toggleCategory(category.id);
                }}>
                  <input type="checkbox" checked={checked} disabled={disabled || isImporting} onChange={() => toggleCategory(category.id)} />
                  <span className="share-category-mark" style={getCategoryColorStyle(category.color)} aria-hidden="true"><span /></span>
                  <span className="share-category-copy"><strong>{category.name}</strong><small>{category.itemCount} {category.itemCount === 1 ? "item" : "itens"}</small></span>
                  {checked && <Check className="shared-selected-check" aria-hidden="true" />}
                </label>;
              })}
            </div>
            {error && <p className="share-message share-message--error" role="alert">{error}</p>}
            {availableSlots === 0 && <p className="shared-capacity-note">Sua nuvem está cheia. Remova uma coleção para importar outras.</p>}
            <button className="button-action share-primary-action" type="button" disabled={isImporting || selectedCount === 0 || availableSlots === 0} aria-busy={isImporting} onClick={() => void importCategories()}>{isImporting && <LoaderCircle className="button-loading-spinner" aria-hidden="true" />}<span>{isImporting ? "Adicionando…" : "Adicionar selecionadas"}</span></button>
          </>
        )}
      </section>
    </div>,
    document.body
  );
}
