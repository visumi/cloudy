import { useCallback, useEffect, useRef, useState, type AnimationEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Copy, Globe, LoaderCircle, MoveRight, Plus, X } from "lucide-react";
import { useMobileDrawerBodyLock, useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import { ApiError, apiRequest } from "../../lib/api";
import type { CategoryRef, CloudyItem, ItemPreview } from "../../types/api";
import { FallbackImage } from "./ItemGraph";
import { EMPTY_CATEGORY_COLOR, getCategoryColorStyle } from "./category-colors";

interface ItemDialogProps {
  open: boolean;
  categoryOptions: CategoryRef[];
  onClose: () => void;
  onCreated: (item: CloudyItem) => void;
  onClosingChange?: (closing: boolean) => void;
}

const ITEM_DIALOG_EXIT_DURATION = 220;
const MAX_ITEM_NAME_LENGTH = 24;
const MAX_ITEM_URL_LENGTH = 2048;
const MAX_ITEM_OBSERVATION_LENGTH = 120;

export function ItemDialog({ open, categoryOptions, onClose, onCreated, onClosingChange }: ItemDialogProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState(EMPTY_CATEGORY_COLOR);
  const [observation, setObservation] = useState("");
  const [preview, setPreview] = useState<ItemPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRequiredError, setShowRequiredError] = useState(false);
  const nameTouched = useRef(false);
  const previewRequestId = useRef(0);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const categoryGroupRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
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
    onClosingChange?.(false);
  }, [onClosingChange]);

  const startExit = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    onClosingChange?.(true);
    exitTimerRef.current = window.setTimeout(finishExit, ITEM_DIALOG_EXIT_DURATION);
  }, [finishExit, onClosingChange]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    startExit();
    onClose();
  }, [onClose, startExit]);

  const drawerGesture = useMobileDrawerGesture(requestClose);
  useMobileDrawerBodyLock(shouldRender);

  const handleExitAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (!isClosing || event.target !== event.currentTarget) return;
    if (event.animationName === "item-dialog-departure" || event.animationName === "item-drawer-departure") finishExit();
  };

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
  }, [open, shouldRender, startExit]);

  useEffect(() => () => {
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setName("");
    setCategoryName("");
    setCategoryColor(EMPTY_CATEGORY_COLOR);
    setObservation("");
    setPreview(null);
    setPreviewMessage(null);
    setError(null);
    setSaving(false);
    setShowRequiredError(false);
    nameTouched.current = false;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => urlInputRef.current?.focus(), 0);
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

  if (!shouldRender) return null;

  const missingRequiredFields = [
    !name.trim() ? "Nome" : null
  ].filter((field): field is string => field !== null);

  const loadPreview = async () => {
    if (!url.trim()) return;
    const requestId = ++previewRequestId.current;
    setPreviewLoading(true);
    setPreviewMessage(null);
    setError(null);
    try {
      const nextPreview = await apiRequest<ItemPreview>("/items/preview", { method: "POST", body: JSON.stringify({ url }) });
      if (requestId !== previewRequestId.current) return;
      setPreview(nextPreview);
      if (!nameTouched.current && nextPreview.title) setName(nextPreview.title);
    } catch (previewError) {
      if (requestId !== previewRequestId.current) return;
      setPreview(null);
    setPreviewMessage(formatItemError(previewError, "Não conseguimos ler a prévia agora. Você ainda pode salvar o item sem prévia."));
    } finally {
      if (requestId === previewRequestId.current) setPreviewLoading(false);
    }
  };

  const selectCategory = (category: CategoryRef) => {
    setCategoryName(category.name);
    setCategoryColor(category.color);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (missingRequiredFields.length > 0) {
      setShowRequiredError(true);
       if (!name.trim()) nameInputRef.current?.focus();
      return;
    }

    setShowRequiredError(false);
    setSaving(true);
    try {
      const item = await apiRequest<CloudyItem>("/items", {
        method: "POST",
        body: JSON.stringify({ name, url: url.trim() || undefined, categoryName, categoryColor, observation: observation.trim() || undefined })
      });
      onCreated(item);
      requestClose();
    } catch (submitError) {
      setError(formatItemError(submitError, "Não foi possível salvar este item agora."));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="item-dialog-backdrop" data-closing={isClosing || undefined} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={dialogRef} className="item-dialog" data-closing={isClosing || undefined} data-dragging={drawerGesture.isDragging || undefined} onAnimationEnd={handleExitAnimationEnd} style={drawerGesture.panelStyle} role="dialog" aria-modal="true" aria-labelledby="item-dialog-title">
        <div className="mobile-drawer-handle" aria-hidden="true" {...drawerGesture.handleProps} />
        <button className="modal-close item-dialog-close" type="button" aria-label="Fechar cadastro" onClick={requestClose}><X aria-hidden="true" /></button>
        <div className="modal-heading item-dialog-heading">
          <div className="modal-heading-icon item-dialog-heading-icon" aria-hidden="true"><Plus /></div>
          <div className="modal-heading-copy">
            <h2 id="item-dialog-title">Criar item</h2>
            <p>Preencha os dados abaixo</p>
          </div>
        </div>
        <form noValidate onSubmit={submit}>
          <div className="item-live-preview" aria-label="Prévia do card">
            <FallbackImage src={preview?.imageUrl ?? null} alt="" className="item-live-preview-image" />
            <div className="item-live-preview-content">
              <div className="item-live-preview-source">
                <FallbackImage src={preview?.faviconUrl ?? null} alt="" className="item-live-preview-favicon" />
                <span className="item-live-preview-category" style={getCategoryColorStyle(categoryColor)}>
                  <span aria-hidden="true" />
                  <span>{categoryName || "Vazio"}</span>
                </span>
              </div>
              <input
                ref={nameInputRef}
                id="item-name"
                className="item-live-preview-title-input"
                type="text"
                required
                aria-invalid={showRequiredError && !name.trim()}
                aria-describedby={showRequiredError && missingRequiredFields.length > 0 ? "item-required-fields-error" : undefined}
                minLength={1}
                maxLength={MAX_ITEM_NAME_LENGTH}
                aria-label="Nome"
                placeholder={preview?.title || "Nome do item"}
                value={name}
                onChange={(event) => { nameTouched.current = true; setName(event.target.value); }}
              />
              <textarea
                id="item-observation"
                className="item-live-preview-observation"
                maxLength={MAX_ITEM_OBSERVATION_LENGTH}
                rows={2}
                aria-label="Observação (opcional)"
                placeholder="Adicione uma nota..."
                value={observation}
                onChange={(event) => setObservation(event.target.value)}
              />
              {url.trim() && (
                <div className="item-live-preview-actions" aria-hidden="true">
                  <span className="item-live-preview-action"><Globe aria-hidden="true" /><span>Acessar</span></span>
                  <span className="item-live-preview-action item-live-preview-action--icon"><Copy aria-hidden="true" /></span>
                </div>
              )}
            </div>
          </div>

          <label className="field-label" htmlFor="item-url">Link <span>(opcional)</span></label>
          <div className="item-url-field field-with-character-count">
            <input ref={urlInputRef} id="item-url" className="field-input" type="text" inputMode="url" autoComplete="url" maxLength={MAX_ITEM_URL_LENGTH} placeholder="https://..." value={url} onChange={(event) => { setUrl(event.target.value); if (!event.target.value.trim()) { previewRequestId.current += 1; setPreview(null); setPreviewMessage(null); setPreviewLoading(false); } }} onBlur={() => void loadPreview()} />
            <span className="field-character-count" aria-hidden="true">{url.length}/{MAX_ITEM_URL_LENGTH}</span>
          </div>
          {previewLoading && <p className="field-hint field-hint--loading"><LoaderCircle aria-hidden="true" /> Lendo a prévia...</p>}
          {previewMessage && <p className="field-hint">{previewMessage}</p>}

          <div className="item-category-heading">
            <span className="field-label">Coleção</span>
            <span className="field-label"><span>Opcional</span></span>
          </div>
          <div
            ref={categoryGroupRef}
            className="category-orbit"
            role="group"
            aria-label="Escolha uma coleção existente"
            tabIndex={-1}
          >
            <div className="category-orbit-glow" aria-hidden="true" />
            <div className="category-orbit-ring category-orbit-ring--one" aria-hidden="true" />
            <div className="category-orbit-ring category-orbit-ring--two" aria-hidden="true" />
            <button
              className={`category-orbit-tag category-orbit-tag--untagged${!categoryName ? " category-orbit-tag--selected" : ""}`}
              type="button"
              aria-pressed={!categoryName}
              style={getCategoryColorStyle(EMPTY_CATEGORY_COLOR)}
              onClick={() => { setCategoryName(""); setCategoryColor(EMPTY_CATEGORY_COLOR); }}
              >
                <span className="category-orbit-dot" aria-hidden="true" />
                <span>Vazio</span>
            </button>
            {categoryOptions.map((category, index) => (
              <button
                className={`category-orbit-tag category-orbit-tag--${index % 4}${categoryName.localeCompare(category.name, "pt-BR", { sensitivity: "base" }) === 0 ? " category-orbit-tag--selected" : ""}`}
                key={category.id}
                type="button"
                aria-pressed={categoryName.localeCompare(category.name, "pt-BR", { sensitivity: "base" }) === 0}
                style={getCategoryColorStyle(category.color)}
                onClick={() => selectCategory(category)}
              >
                <span className="category-orbit-dot" aria-hidden="true" />
                <span>{category.name}</span>
              </button>
            ))}
          </div>

          {showRequiredError && missingRequiredFields.length > 0 && (
            <p className="item-required-fields" id="item-required-fields-error" role="alert">
              <span className="item-required-fields-label">Preencha <MoveRight aria-hidden="true" /></span>
              <span className="item-required-field">{missingRequiredFields.join(" e ")}</span>
            </p>
          )}
          {error && <p className="item-dialog-error" role="alert"><span>{error}</span></p>}
          <button className="button-action item-dialog-submit" type="submit" disabled={saving} aria-busy={saving} aria-label={saving ? "Salvando..." : "Salvar"}>
            {saving ? <><LoaderCircle className="button-loading-spinner" aria-hidden="true" /> <span>Salvando…</span></> : "Salvar"}
          </button>
        </form>
      </section>
    </div>,
    document.body
  );
}

function formatItemError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const messages: Record<string, string> = {
    invalid_json: "Confira os dados informados.",
    invalid_url: "Informe um link válido começando com http:// ou https://.",
    invalid_url_length: "O link deve ter até 2.048 caracteres.",
    invalid_item_name: "Escolha um nome de até 24 caracteres.",
    invalid_category_name: "Informe uma coleção de até 12 caracteres.",
    invalid_item_observation: "A observação deve ter até 120 caracteres.",
    category_limit_reached: "Você pode criar até 15 coleções.",
    category_item_limit_reached: "Essa coleção já tem 100 itens."
  };
  return messages[error.code] || fallback;
}
