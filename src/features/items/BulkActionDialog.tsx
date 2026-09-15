import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle, MoveRight, Trash2, X } from "lucide-react";
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
}

export function BulkActionDialog({ open, mode, items, sourceCategory, categories, onClose, onConfirm }: BulkActionDialogProps) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = items.length;

  useEffect(() => {
    if (!open) return;
    setTargetId(null);
    setBusy(false);
    setError(null);
  }, [open, mode, sourceCategory.id]);

  if (!open) return null;

  const destinations = categories.filter((category) => {
    if (category.id === sourceCategory.id || category.id === "__integrations__" || category.id === "__untagged__") return false;
    return category.itemCount + count <= 100;
  });
  const emptyCategory = categories.find((category) => category.id === "__untagged__");
  const canMoveToEmpty = sourceCategory.id !== "__untagged__" && (emptyCategory?.itemCount ?? 0) + count <= 100;
  const canConfirm = mode === "delete" || targetId !== null;

  const confirm = async () => {
    if (!canConfirm || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(targetId);
    } catch (reason) {
      setError(reason instanceof ApiError && reason.code === "category_item_limit_reached" ? "A categoria escolhida não tem espaço para todos os itens." : "Não conseguimos concluir esta ação agora. Tente novamente.");
      setBusy(false);
    }
  };

  return createPortal(
    <div className="item-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="item-delete-dialog bulk-action-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-action-title" aria-describedby="bulk-action-description">
        <button className="modal-close item-delete-close" type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button>
        <div className="modal-heading item-delete-heading">
          <div className="modal-heading-icon item-delete-heading-icon" aria-hidden="true">{mode === "delete" ? <Trash2 /> : <MoveRight />}</div>
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
          <button className="button-action item-delete-cancel" type="button" disabled={busy} onClick={onClose}>Cancelar</button>
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
