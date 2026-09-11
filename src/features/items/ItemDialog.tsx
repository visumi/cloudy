import { useCallback, useEffect, useRef, useState, type AnimationEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, X } from "lucide-react";
import { useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import { ApiError, apiRequest } from "../../lib/api";
import type { CloudyItem, ItemPreview } from "../../types/api";
import { FallbackImage } from "./ItemGraph";

interface ItemDialogProps {
  open: boolean;
  categoryNames: string[];
  onClose: () => void;
  onCreated: (item: CloudyItem) => void;
  onClosingChange?: (closing: boolean) => void;
}

const ITEM_DIALOG_EXIT_DURATION = 220;

export function ItemDialog({ open, categoryNames, onClose, onCreated, onClosingChange }: ItemDialogProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [observation, setObservation] = useState("");
  const [preview, setPreview] = useState<ItemPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameTouched = useRef(false);
  const previewRequestId = useRef(0);
  const urlInputRef = useRef<HTMLInputElement>(null);
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
    setObservation("");
    setPreview(null);
    setPreviewMessage(null);
    setError(null);
    setSaving(false);
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
      setPreviewMessage(formatItemError(previewError, "Não conseguimos ler a prévia agora. Você ainda pode salvar o link."));
    } finally {
      if (requestId === previewRequestId.current) setPreviewLoading(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const item = await apiRequest<CloudyItem>("/items", {
        method: "POST",
        body: JSON.stringify({ name, url, categoryName, observation: observation.trim() || undefined })
      });
      onCreated(item);
      requestClose();
    } catch (submitError) {
      setError(formatItemError(submitError, "Não foi possível salvar este link agora."));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="item-dialog-backdrop" data-closing={isClosing || undefined} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={dialogRef} className="item-dialog" data-closing={isClosing || undefined} data-dragging={drawerGesture.isDragging || undefined} onAnimationEnd={handleExitAnimationEnd} style={drawerGesture.panelStyle} role="dialog" aria-modal="true" aria-labelledby="item-dialog-title">
        <div className="mobile-drawer-handle" aria-hidden="true" {...drawerGesture.handleProps} />
        <button className="item-dialog-close" type="button" aria-label="Fechar cadastro" onClick={requestClose}><X aria-hidden="true" /></button>
        <div className="item-dialog-heading">
          <span className="item-dialog-kicker">Nova referência</span>
          <h2 id="item-dialog-title">Adicionar link</h2>
          <p>Guarde algo que merece voltar para a sua nuvem.</p>
        </div>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="item-url">Link</label>
          <input ref={urlInputRef} id="item-url" className="field-input" type="url" required placeholder="https://..." value={url} onChange={(event) => setUrl(event.target.value)} onBlur={() => void loadPreview()} />
          {previewLoading && <p className="field-hint field-hint--loading"><LoaderCircle aria-hidden="true" /> Lendo a prévia...</p>}
          {previewMessage && <p className="field-hint">{previewMessage}</p>}

          {preview && (
            <div className="item-preview" aria-live="polite">
              <FallbackImage src={preview.imageUrl} alt="" className="item-preview-image" />
              <div>
                <strong>{preview.title || "Prévia do link"}</strong>
                <span>{preview.faviconUrl ? "Imagem e favicon encontrados" : "Usaremos o visual padrão do Cloudy"}</span>
              </div>
              <FallbackImage src={preview.faviconUrl} alt="" className="item-preview-favicon" />
            </div>
          )}

          <label className="field-label" htmlFor="item-name">Nome</label>
          <input id="item-name" className="field-input" type="text" required minLength={1} maxLength={120} placeholder="Como você quer lembrar disso?" value={name} onChange={(event) => { nameTouched.current = true; setName(event.target.value); }} />

          <label className="field-label" htmlFor="item-category">Categoria</label>
          <input id="item-category" className="field-input" type="text" required maxLength={60} list="item-category-options" placeholder="Ex.: Inspirações" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
          <datalist id="item-category-options">{categoryNames.map((category) => <option key={category} value={category} />)}</datalist>

          <label className="field-label" htmlFor="item-observation">Observação <span>opcional</span></label>
          <textarea id="item-observation" className="field-input field-textarea" maxLength={2000} placeholder="Uma nota curta para o seu eu do futuro..." value={observation} onChange={(event) => setObservation(event.target.value)} />

          {error && <p className="item-dialog-error" role="alert">{error}</p>}
          <button className="item-dialog-submit" type="submit" disabled={saving}>
            {saving ? <><LoaderCircle aria-hidden="true" /> Salvando...</> : "Salvar na nuvem"}
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
    invalid_item_name: "Escolha um nome de até 120 caracteres.",
    invalid_category_name: "Informe uma categoria de até 60 caracteres.",
    invalid_item_observation: "A observação deve ter até 2.000 caracteres."
  };
  return messages[error.code] || fallback;
}
