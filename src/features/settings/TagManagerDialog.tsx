import { useCallback, useEffect, useRef, useState, type AnimationEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMobileDrawerBodyLock, useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import { ApiError, apiRequest } from "../../lib/api";
import type { CategorySummary } from "../../types/api";
import { CATEGORY_COLOR_OPTIONS, DEFAULT_CATEGORY_COLOR, getCategoryColorStyle } from "../items/category-colors";

const TAG_MANAGER_EXIT_DURATION = 220;
const MAX_CATEGORY_NAME_LENGTH = 12;
const MAX_CATEGORY_COUNT = 15;

interface TagManagerDialogProps {
  open: boolean;
  categories: CategorySummary[];
  onClose: () => void;
  onCategoriesChange: (categories: CategorySummary[]) => void;
  onClosingChange?: (closing: boolean) => void;
}

export function TagManagerDialog({ open, categories, onClose, onCategoriesChange, onClosingChange }: TagManagerDialogProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const savedTimerRef = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);

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
    exitTimerRef.current = window.setTimeout(finishExit, TAG_MANAGER_EXIT_DURATION);
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
      onClosingChange?.(false);
    } else if (shouldRender) {
      startExit();
    }
  }, [open, shouldRender, startExit, onClosingChange]);

  useEffect(() => () => {
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
    if (savedTimerRef.current !== undefined) window.clearTimeout(savedTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    setEditingId(null);
    setName("");
    setColor(DEFAULT_CATEGORY_COLOR);
    setError(null);
    setSavedMessage(null);
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => nameInputRef.current?.focus(), 0);
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, input, textarea, [href]")].filter((element) => !element.hasAttribute("disabled"));
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
    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleDialogKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [open, requestClose]);

  const handleExitAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (!isClosing || event.target !== event.currentTarget) return;
    if (event.animationName === "tag-manager-departure" || event.animationName === "item-drawer-departure") finishExit();
  };

  const resetEditor = () => {
    setEditingId(null);
    setName("");
    setColor(DEFAULT_CATEGORY_COLOR);
    setError(null);
    nameInputRef.current?.focus();
  };

  const startEditing = (category: CategorySummary) => {
    setEditingId(category.id);
    setName(category.name);
    setColor(category.color);
    setError(null);
    window.requestAnimationFrame(() => nameInputRef.current?.focus());
  };

  const showSavedMessage = (message: string) => {
    setSavedMessage(message);
    if (savedTimerRef.current !== undefined) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => {
      setSavedMessage(null);
      savedTimerRef.current = undefined;
    }, 2200);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Dê um nome para sua coleção.");
      nameInputRef.current?.focus();
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const category = await apiRequest<CategorySummary>(editingId ? `/categories/${editingId}` : "/categories", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ name: trimmedName, color })
      });
      const nextCategories = sortCategories(editingId ? categories.map((current) => current.id === category.id ? category : current) : [...categories, category]);
      onCategoriesChange(nextCategories);
      showSavedMessage(editingId ? "Coleção atualizada." : "Coleção criada na sua nuvem.");
      resetEditor();
    } catch (submitError) {
      setError(formatTagError(submitError));
    } finally {
      setIsSaving(false);
    }
  };

  const removeCategory = async (category: CategorySummary) => {
    setError(null);
    setDeletingId(category.id);
    try {
      await apiRequest<{ id: string }>(`/categories/${category.id}`, { method: "DELETE" });
      onCategoriesChange(categories.filter((current) => current.id !== category.id));
      if (editingId === category.id) resetEditor();
      showSavedMessage("Coleção removida.");
    } catch (deleteError) {
      setError(formatTagError(deleteError));
    } finally {
      setDeletingId(null);
    }
  };

  if (!shouldRender) return null;

  const previewName = name.trim() || "Sua nova coleção";
  const sortedCategories = sortCategories(categories);

  return createPortal(
    <div className="tag-manager-backdrop" data-closing={isClosing || undefined} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section
        ref={dialogRef}
        className="tag-manager-panel"
        data-closing={isClosing || undefined}
        data-dragging={drawerGesture.isDragging || undefined}
        style={drawerGesture.panelStyle}
        onAnimationEnd={handleExitAnimationEnd}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-manager-title"
        onClick={(event) => event.stopPropagation()}
        {...drawerGesture.panelProps}
      >
        <div className="mobile-drawer-handle" aria-hidden="true" {...drawerGesture.handleProps} />
        <button className="modal-close tag-manager-close" type="button" aria-label="Fechar coleções" onClick={requestClose}><X aria-hidden="true" /></button>

        <div className="tag-manager-hero">
          <div className="tag-manager-preview" aria-label={`Prévia da coleção ${previewName}`}>
            <span className="tag-manager-preview-cloud tag-manager-preview-cloud--one" aria-hidden="true" />
            <span className="tag-manager-preview-cloud tag-manager-preview-cloud--two" aria-hidden="true" />
            <span className="tag-manager-preview-ring" aria-hidden="true" />
            <span className="tag-manager-preview-chip" style={getCategoryColorStyle(color)}>
              <span aria-hidden="true" />
              <span>{previewName}</span>
            </span>
          </div>
          <div className="tag-manager-heading modal-heading-copy">
            <span className="item-dialog-kicker">Organize sua nuvem</span>
            <h2 id="tag-manager-title">Coleções</h2>
            <p>Dê um nome e uma cor para encontrar tudo de relance.</p>
          </div>
        </div>

        <form className="tag-manager-form" onSubmit={submit}>
          <div className="tag-manager-form-heading">
            <label className="field-label" htmlFor="tag-name">Nome da coleção</label>
            {editingId && <button className="tag-manager-cancel" type="button" onClick={resetEditor}>Cancelar</button>}
          </div>
          <div className="tag-manager-name-field field-with-character-count">
            <input ref={nameInputRef} id="tag-name" className="field-input" maxLength={MAX_CATEGORY_NAME_LENGTH} placeholder="Ex.: Inspirações" value={name} onChange={(event) => { setName(event.target.value); setError(null); }} />
            <span className="field-character-count" aria-hidden="true">{name.length}/{MAX_CATEGORY_NAME_LENGTH}</span>
          </div>

          <div className="tag-manager-palette-heading">
            <span className="field-label">Cor da coleção</span>
          </div>
          <div className="tag-manager-palette" role="group" aria-label="Escolha uma cor para a coleção">
            {CATEGORY_COLOR_OPTIONS.map((option) => (
              <button
                className={`tag-manager-color${color === option.value ? " tag-manager-color--selected" : ""}`}
                key={option.value}
                type="button"
                aria-label={option.name}
                aria-pressed={color === option.value}
                style={getCategoryColorStyle(option.value)}
                onClick={() => { setColor(option.value); setError(null); }}
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>

          {error && <p className="tag-manager-message tag-manager-message--error" role="alert">{error}</p>}
          {savedMessage && <p className="tag-manager-message tag-manager-message--success" role="status"><Check aria-hidden="true" />{savedMessage}</p>}
          <button className="button-action tag-manager-submit" type="submit" disabled={isSaving} aria-busy={isSaving}>
            {isSaving ? <LoaderCircle className="button-loading-spinner" aria-hidden="true" /> : editingId ? <Check aria-hidden="true" /> : null}
            <span>{isSaving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar coleção"}</span>
          </button>
        </form>

        <div className="tag-manager-list-heading">
          <div>
            <h3>Coleções salvas</h3>
          </div>
          <span className="tag-manager-count">{categories.length}/{MAX_CATEGORY_COUNT}</span>
        </div>
        <div className="tag-manager-list" aria-label="Coleções salvas">
          {sortedCategories.length === 0 ? (
            <div className="tag-manager-empty"><span className="tag-manager-empty-mark" aria-hidden="true"><Plus /></span><p>Sua paleta começa aqui.</p></div>
          ) : sortedCategories.map((category) => {
            const itemCount = category.itemCount ?? 0;
            return (
              <div className="tag-manager-row" key={category.id}>
                <span className="tag-manager-row-tag" style={getCategoryColorStyle(category.color)}><span aria-hidden="true" /><span>{category.name}</span></span>
                <span className="tag-manager-row-count">{itemCount} {itemCount === 1 ? "item" : "itens"}</span>
                <div className="tag-manager-row-actions">
                  <button className="tag-manager-icon-button" type="button" aria-label={`Editar coleção ${category.name}`} title={`Editar ${category.name}`} onClick={() => startEditing(category)}><Pencil aria-hidden="true" /></button>
                  <button className="tag-manager-icon-button tag-manager-icon-button--delete" type="button" aria-label={deletingId === category.id ? "Excluindo coleção" : itemCount > 0 ? `Coleção ${category.name} tem itens` : `Excluir coleção ${category.name}`} title={itemCount > 0 ? "Remova os itens antes de excluir" : `Excluir ${category.name}`} disabled={deletingId === category.id || itemCount > 0} aria-busy={deletingId === category.id} onClick={() => void removeCategory(category)}>{deletingId === category.id ? <LoaderCircle className="button-loading-spinner" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>,
    document.body
  );
}

function sortCategories(categories: CategorySummary[]) {
  return [...categories].sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

function formatTagError(error: unknown) {
  if (!(error instanceof ApiError)) return "Não foi possível atualizar suas coleções agora.";
  const messages: Record<string, string> = {
    category_limit_reached: `Você já tem ${MAX_CATEGORY_COUNT} coleções. Remova uma para criar outra.`,
    category_name_taken: "Você já tem uma coleção com esse nome.",
    invalid_category_name: "O nome da coleção deve ter até 12 caracteres.",
    invalid_category_color: "Escolha uma cor da paleta.",
    category_not_found: "Essa coleção não está mais disponível. Atualize a lista.",
    category_has_items: "Remova os itens da coleção antes de excluí-la."
  };
  return messages[error.code] || "Não foi possível atualizar suas coleções agora.";
}
