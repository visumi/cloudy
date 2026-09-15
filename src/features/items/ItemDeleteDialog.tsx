import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { useMobileDrawerBodyLock, useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import { ApiError, apiRequest } from "../../lib/api";
import type { CloudyItem } from "../../types/api";

interface ItemDeleteDialogProps {
  open: boolean;
  item: CloudyItem | null;
  onClose: () => void;
  onDeleted: (item: CloudyItem) => void;
  onClosingChange?: (closing: boolean) => void;
}

const ITEM_DELETE_DIALOG_EXIT_DURATION = 220;

export function ItemDeleteDialog({ open, item, onClose, onDeleted, onClosingChange }: ItemDeleteDialogProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);
  const deletingRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

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
    exitTimerRef.current = window.setTimeout(finishExit, ITEM_DELETE_DIALOG_EXIT_DURATION);
  }, [finishExit, onClosingChange]);

  const requestClose = useCallback(() => {
    if (closingRef.current || deletingRef.current) return;
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
      deletingRef.current = false;
      setDeleting(false);
      setError(null);
      onClosingChange?.(false);
    } else if (shouldRender) {
      startExit();
    }
  }, [open, onClosingChange, shouldRender, startExit]);

  useEffect(() => () => {
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => cancelButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button")].filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [open, requestClose]);

  const handleExitAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (!isClosing || event.target !== event.currentTarget) return;
    if (event.animationName === "item-dialog-departure" || event.animationName === "item-drawer-departure") finishExit();
  };

  const confirmDelete = async () => {
    if (!item || deleting) return;
    deletingRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      await apiRequest<{ id: string }>(`/items/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      onDeleted(item);
      startExit();
      onClose();
    } catch (deleteError) {
      setError(formatDeleteError(deleteError));
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  if (!shouldRender || !item) return null;

  return createPortal(
    <div className="item-dialog-backdrop" data-closing={isClosing || undefined} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section
        ref={dialogRef}
        className="item-delete-dialog"
        data-closing={isClosing || undefined}
        data-dragging={drawerGesture.isDragging || undefined}
        style={drawerGesture.panelStyle}
        onAnimationEnd={handleExitAnimationEnd}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="item-delete-title"
        aria-describedby="item-delete-description"
        {...drawerGesture.panelProps}
      >
        <div className="mobile-drawer-handle" aria-hidden="true" {...drawerGesture.handleProps} />
        <button className="modal-close item-delete-close" type="button" aria-label="Fechar confirmação" disabled={deleting} onClick={requestClose}><X aria-hidden="true" /></button>
        <div className="modal-heading item-delete-heading">
          <div className="modal-heading-icon item-delete-heading-icon" aria-hidden="true"><Trash2 /></div>
          <div className="modal-heading-copy">
            <h2 id="item-delete-title">Excluir item?</h2>
            <p id="item-delete-description">"{item.name}" será removido permanentemente</p>
          </div>
        </div>
        {error && <p className="item-dialog-error" role="alert"><span>{error}</span></p>}
        <div className="item-delete-actions">
          <button ref={cancelButtonRef} className="button-action item-delete-cancel" type="button" disabled={deleting} onClick={requestClose}>Cancelar</button>
          <button className="button-action item-delete-confirm" type="button" disabled={deleting} aria-busy={deleting} onClick={() => void confirmDelete()}>
            {deleting ? <><LoaderCircle className="button-loading-spinner" aria-hidden="true" /><span>Excluindo…</span></> : <><Trash2 aria-hidden="true" /><span>Excluir</span></>}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function formatDeleteError(error: unknown): string {
  if (error instanceof ApiError && error.code === "item_not_found") return "Este item não está mais disponível.";
  return "Não foi possível excluir este item agora. Tente novamente.";
}
