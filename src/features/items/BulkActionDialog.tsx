import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, Check, LoaderCircle, Trash2, X } from "lucide-react";
import { useMobileDrawerBodyLock, useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import { ApiError } from "../../lib/api";
import type { CategorySummary, CloudyItem } from "../../types/api";

interface BulkActionDialogProps {
  open: boolean;
  mode: "move" | "delete";
  items: CloudyItem[];
  sourceCategory: CategorySummary;
  categories: CategorySummary[];
  onClose: () => void;
  onConfirm: (categoryId?: string | null) => Promise<void>;
  onClosingChange?: (closing: boolean) => void;
}

const BULK_ACTION_DIALOG_EXIT_DURATION = 220;

export function BulkActionDialog({ open, mode, items, sourceCategory, categories, onClose, onConfirm, onClosingChange }: BulkActionDialogProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);
  const busyRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const count = items.length;

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
    exitTimerRef.current = window.setTimeout(finishExit, BULK_ACTION_DIALOG_EXIT_DURATION);
  }, [finishExit, onClosingChange]);

  const requestClose = useCallback(() => {
    if (closingRef.current || busyRef.current) return;
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
      busyRef.current = false;
      setTargetId(null);
      setBusy(false);
      setError(null);
      onClosingChange?.(false);
    } else if (shouldRender) {
      startExit();
    }
  }, [mode, onClosingChange, open, shouldRender, sourceCategory.id, startExit]);

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

  const destinations = categories.filter((category) => {
    if (category.id === sourceCategory.id || category.id === "__integrations__" || category.id === "__untagged__") return false;
    return category.itemCount + count <= 100;
  });
  const emptyCategory = categories.find((category) => category.id === "__untagged__");
  const canMoveToEmpty = sourceCategory.id !== "__untagged__" && (emptyCategory?.itemCount ?? 0) + count <= 100;
  const canConfirm = mode === "delete" || targetId !== null;

  const confirm = async () => {
    if (!canConfirm || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(targetId);
    } catch (reason) {
      setError(reason instanceof ApiError && reason.code === "category_item_limit_reached" ? "A categoria escolhida não tem espaço para todos os itens." : "Não conseguimos concluir esta ação agora. Tente novamente.");
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!shouldRender) return null;

  return createPortal(
    <div className="item-dialog-backdrop" data-closing={isClosing || undefined} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section
        ref={dialogRef}
        className="item-delete-dialog bulk-action-dialog"
        data-closing={isClosing || undefined}
        data-dragging={drawerGesture.isDragging || undefined}
        style={drawerGesture.panelStyle}
        onAnimationEnd={handleExitAnimationEnd}
        role={mode === "delete" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="bulk-action-title"
        aria-describedby="bulk-action-description"
        {...drawerGesture.panelProps}
      >
        <div className="mobile-drawer-handle" aria-hidden="true" {...drawerGesture.handleProps} />
        <button className="modal-close item-delete-close" type="button" aria-label="Fechar" disabled={busy} onClick={requestClose}><X aria-hidden="true" /></button>
        <div className="modal-heading item-delete-heading">
          <div className="modal-heading-icon item-delete-heading-icon" aria-hidden="true">{mode === "delete" ? <Trash2 /> : <ArrowLeftRight />}</div>
          <div className="modal-heading-copy">
            <h2 id="bulk-action-title">{mode === "delete" ? `Excluir ${count} ${count === 1 ? "item" : "itens"}?` : "Mover itens"}</h2>
            <p id="bulk-action-description">{mode === "delete" ? `Os itens selecionados de ${sourceCategory.name} serão removidos permanentemente.` : `Escolha uma categoria para os ${count} ${count === 1 ? "item selecionado" : "itens selecionados"}.`}</p>
          </div>
        </div>
        {mode === "move" && <div className="bulk-destination-list" role="listbox" aria-label="Categoria de destino">
          <button className={`bulk-destination${targetId === "__untagged__" ? " bulk-destination--selected" : ""}`} type="button" role="option" aria-selected={targetId === "__untagged__"} disabled={!canMoveToEmpty} onClick={() => setTargetId("__untagged__")}><span>Vazio{!canMoveToEmpty && " (sem espaço)"}</span>{targetId === "__untagged__" && <Check aria-hidden="true" />}</button>
          {destinations.map((category) => <button className={`bulk-destination${targetId === category.id ? " bulk-destination--selected" : ""}`} key={category.id} type="button" role="option" aria-selected={targetId === category.id} onClick={() => setTargetId(category.id)}><span>{category.name}</span>{targetId === category.id && <Check aria-hidden="true" />}</button>)}
          {destinations.length === 0 && <p className="bulk-destination-empty">Não há categorias disponíveis para este movimento.</p>}
        </div>}
        {error && <p className="item-dialog-error" role="alert">{error}</p>}
        <div className="item-delete-actions">
          <button ref={cancelButtonRef} className="button-action item-delete-cancel" type="button" disabled={busy} onClick={requestClose}>Cancelar</button>
          <button className={`button-action ${mode === "delete" ? "item-delete-confirm" : "item-dialog-submit"}`} type="button" disabled={!canConfirm || busy} aria-busy={busy} onClick={() => void confirm()}>
            {busy && <LoaderCircle className="button-loading-spinner" aria-hidden="true" />}
            <span>{busy ? "Salvando…" : mode === "delete" ? `Excluir ${count} ${count === 1 ? "item" : "itens"}` : "Mover itens"}</span>
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
