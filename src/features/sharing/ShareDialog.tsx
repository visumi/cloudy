import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Link2, LoaderCircle, Share2, X } from "lucide-react";
import { useMobileDrawerBodyLock, useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import { ApiError, apiRequest } from "../../lib/api";
import type { CategorySummary, CreateShareResponse } from "../../types/api";
import { getCategoryColorStyle } from "../items/category-colors";

const SHARE_DIALOG_EXIT_DURATION = 220;

interface ShareDialogProps {
  open: boolean;
  categories: CategorySummary[];
  onClose: () => void;
  onClosingChange?: (closing: boolean) => void;
}

export function ShareDialog({ open, categories, onClose, onClosingChange }: ShareDialogProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const firstCheckboxRef = useRef<HTMLInputElement>(null);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);
  const availableCategories = categories.filter((category) => !category.isVirtual && !category.isSystem && category.itemCount > 0);

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
    exitTimerRef.current = window.setTimeout(finishExit, SHARE_DIALOG_EXIT_DURATION);
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
      setSelectedIds([]);
      setShareUrl(null);
      setIsCopied(false);
      setError(null);
      onClosingChange?.(false);
      const focusTimer = window.setTimeout(() => firstCheckboxRef.current?.focus(), 0);
      return () => window.clearTimeout(focusTimer);
    }
    if (shouldRender) startExit();
  }, [open, shouldRender, startExit, onClosingChange]);

  useEffect(() => {
    if (open && shareUrl) window.setTimeout(() => closeButtonRef.current?.focus(), 0);
  }, [open, shareUrl]);

  useEffect(() => () => {
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
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
    setSelectedIds((current) => current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId]);
    setError(null);
  };

  const generateShare = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const result = await apiRequest<CreateShareResponse>("/shares", { method: "POST", body: JSON.stringify({ categoryIds: selectedIds }) });
      setShareUrl(`${window.location.origin}/?share=${encodeURIComponent(result.shareId)}`);
    } catch (requestError) {
      setError(requestError instanceof ApiError && requestError.code === "category_not_shareable" ? "Uma das coleções não está mais disponível." : "Não conseguimos criar o compartilhamento agora.");
    } finally {
      setIsSaving(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
    } catch {
      setError("Não conseguimos copiar o link. Selecione-o e copie manualmente.");
    }
  };

  if (!shouldRender) return null;
  const handleExitAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (!isClosing || event.target !== event.currentTarget) return;
    if (event.animationName === "integration-dialog-departure" || event.animationName === "item-drawer-departure") finishExit();
  };

  return createPortal(
    <div className="share-backdrop" data-closing={isClosing || undefined} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={dialogRef} className="share-panel" data-closing={isClosing || undefined} data-dragging={drawerGesture.isDragging || undefined} style={drawerGesture.panelStyle} onAnimationEnd={handleExitAnimationEnd} role="dialog" aria-modal="true" aria-labelledby="share-dialog-title" aria-describedby="share-dialog-description" {...drawerGesture.panelProps}>
        <div className="mobile-drawer-handle" aria-hidden="true" {...drawerGesture.handleProps} />
        <button ref={closeButtonRef} className="modal-close share-close" type="button" aria-label="Fechar compartilhamento" onClick={requestClose}><X aria-hidden="true" /></button>
        <div className="modal-heading share-heading">
          <div className="modal-heading-icon" aria-hidden="true"><Share2 /></div>
          <div className="modal-heading-copy">
            <h2 id="share-dialog-title">Compartilhar coleções</h2>
            <p id="share-dialog-description">Escolha quais coleções quer compartilhar.</p>
          </div>
        </div>

        {shareUrl ? (
          <div className="share-result" role="status">
            <div className="share-result-icon" aria-hidden="true"><Link2 /></div>
            <div className="share-result-copy"><strong>Link pronto</strong><p>Qualquer usuário autorizado do Cloudy poderá abrir este snapshot.</p></div>
            <div className="share-link-field"><input readOnly value={shareUrl} title={shareUrl} aria-label="Link de compartilhamento" onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void copyShareUrl()} aria-label={isCopied ? "Link copiado" : "Copiar link"}>{isCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button></div>
          </div>
        ) : (
          <>
            <div className="share-list" aria-label="Coleções que podem ser compartilhadas">
              {availableCategories.length === 0 ? <p className="share-empty">Crie uma coleção para começar a compartilhar.</p> : availableCategories.map((category, index) => (
                <label className={`share-category-option${selectedIds.includes(category.id) ? " share-category-option--selected" : ""}`} key={category.id} onClick={(event) => {
                  if (event.target instanceof HTMLInputElement) return;
                  event.preventDefault();
                  toggleCategory(category.id);
                }}>
                  <input ref={index === 0 ? firstCheckboxRef : undefined} type="checkbox" checked={selectedIds.includes(category.id)} onChange={() => toggleCategory(category.id)} />
                  <span className="share-category-mark" style={getCategoryColorStyle(category.color)} aria-hidden="true"><span /></span>
                  <span className="share-category-copy"><strong>{category.name}</strong><small>{category.itemCount} {category.itemCount === 1 ? "item" : "itens"}</small></span>
                </label>
              ))}
            </div>
            {error && <p className="share-message share-message--error" role="alert">{error}</p>}
            <button className="button-action share-primary-action" type="button" disabled={isSaving || selectedIds.length === 0} aria-busy={isSaving} onClick={() => void generateShare()}>{isSaving && <LoaderCircle className="button-loading-spinner" aria-hidden="true" />}<span>{isSaving ? "Criando link…" : "Compartilhar"}</span></button>
          </>
        )}
      </section>
    </div>,
    document.body
  );
}
