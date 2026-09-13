import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";
import { createPortal } from "react-dom";
import { Blocks, Check, Copy, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useMobileDrawerBodyLock, useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import { ApiError, apiBaseUrl, apiRequest } from "../../lib/api";

interface IntegrationDialogProps {
  open: boolean;
  onClose: () => void;
  onClosingChange?: (closing: boolean) => void;
}

interface ShortcutTokenMetadata {
  configured: boolean;
  tokenPrefix: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
}

interface CreatedShortcutToken extends ShortcutTokenMetadata {
  token: string;
}

const INTEGRATION_DIALOG_EXIT_DURATION = 220;

export function IntegrationDialog({ open, onClose, onClosingChange }: IntegrationDialogProps) {
  const [metadata, setMetadata] = useState<ShortcutTokenMetadata | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isEndpointCopied, setIsEndpointCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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
    exitTimerRef.current = window.setTimeout(finishExit, INTEGRATION_DIALOG_EXIT_DURATION);
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
  }, []);

  useEffect(() => {
    if (!open) return;
    setToken(null);
    setIsCopied(false);
    setIsEndpointCopied(false);
    setError(null);
    setIsLoading(true);
    void apiRequest<ShortcutTokenMetadata>("/integrations/shortcut/token")
      .then(setMetadata)
      .catch(() => setError("Não conseguimos carregar a configuração agora."))
      .finally(() => setIsLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
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

  const generateToken = async () => {
    setError(null);
    setIsSaving(true);
    setIsCopied(false);
    try {
      const created = await apiRequest<CreatedShortcutToken>("/integrations/shortcut/token", { method: "POST" });
      setMetadata(created);
      setToken(created.token);
    } catch (requestError) {
      setError(requestError instanceof ApiError && requestError.code === "forbidden" ? "Sua conta não pode configurar integrações." : "Não conseguimos gerar o token agora.");
    } finally {
      setIsSaving(false);
    }
  };

  const revokeToken = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await apiRequest<{ ok: boolean }>("/integrations/shortcut/token", { method: "DELETE" });
      setMetadata({ configured: false, tokenPrefix: null, createdAt: null, lastUsedAt: null });
      setToken(null);
    } catch {
      setError("Não conseguimos revogar o token agora.");
    } finally {
      setIsSaving(false);
    }
  };

  const copyToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setIsCopied(true);
    } catch {
      setError("Não conseguimos copiar o token. Selecione-o e copie manualmente.");
    }
  };

  const shortcutEndpoint = `${apiBaseUrl}/integrations/shortcut/items`;
  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(shortcutEndpoint);
      setIsEndpointCopied(true);
    } catch {
      setError("Não conseguimos copiar o endpoint agora.");
    }
  };

  if (!shouldRender) return null;

  const handleExitAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (!isClosing || event.target !== event.currentTarget) return;
    if (event.animationName === "integration-dialog-departure" || event.animationName === "item-drawer-departure") finishExit();
  };
  const portalRoot = document.body ?? document.documentElement;

  return createPortal(
    <div className="integration-backdrop" data-closing={isClosing || undefined} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section
        ref={dialogRef}
        className="integration-panel"
        data-closing={isClosing || undefined}
        data-dragging={drawerGesture.isDragging || undefined}
        onAnimationEnd={handleExitAnimationEnd}
        style={drawerGesture.panelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="integration-title"
      >
        <div className="mobile-drawer-handle" aria-hidden="true" {...drawerGesture.handleProps} />
        <button ref={closeButtonRef} className="modal-close integration-close" type="button" aria-label="Fechar integrações" onClick={requestClose}><X aria-hidden="true" /></button>
        <div className="modal-heading integration-heading">
          <div className="modal-heading-icon integration-heading-icon" aria-hidden="true"><Blocks /></div>
          <div className="modal-heading-copy">
            <span className="item-dialog-kicker">Conecte sua nuvem</span>
            <h2 id="integration-title">Integração com atalhos</h2>
            <p>Salve links direto do botão Compartilhar do iPhone.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="integration-loading" role="status" aria-live="polite">
            <span className="integration-loading-mark" aria-hidden="true">
              <LoaderCircle className="integration-loading-spinner" />
            </span>
            <span className="integration-loading-copy">
              <strong>Carregando configurações</strong>
              <span>Buscando os dados do Atalho...</span>
            </span>
          </div>
        ) : (
          <>
            <div className="integration-card">
              <div className="integration-card-heading">
                <div className="integration-card-title">
                  <KeyRound aria-hidden="true" />
                  <div>
                    <strong>Token do Atalho</strong>
                    <p>Permite registrar novos links na categoria Integrações.</p>
                  </div>
                </div>
                <span className={`integration-status-pill${metadata?.configured || token ? " integration-status-pill--active" : ""}`}>{token ? "NOVO" : metadata?.configured ? "ATIVO" : "INATIVO"}</span>
              </div>
              {token ? (
                <div className="integration-token-reveal">
                  <code>{token}</code>
                  <button type="button" onClick={() => void copyToken()} aria-label={isCopied ? "Token copiado" : "Copiar token"}>{isCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button>
                  <small>Copie agora. Por segurança, ele não será mostrado novamente.</small>
                </div>
              ) : metadata?.configured ? (
                <p className="integration-token-meta"><code>{metadata.tokenPrefix}••••</code></p>
              ) : <p className="integration-token-meta">Nenhum token configurado.</p>}
              <div className="integration-actions">
                <button className="button-action integration-primary" type="button" disabled={isSaving} onClick={() => void generateToken()}>{isSaving ? <LoaderCircle aria-hidden="true" /> : metadata?.configured ? <RefreshCw aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{metadata?.configured ? "Gerar novo token" : "Gerar token"}</button>
                {metadata?.configured && <button className="button-action integration-revoke" type="button" disabled={isSaving} onClick={() => void revokeToken()}>Revogar token</button>}
              </div>
            </div>
            {error && <p className="integration-message integration-message--error" role="alert">{error}</p>}
            <div className="integration-card integration-config-card">
              <div className="integration-card-heading">
                <div className="integration-card-title">
                  <picture className="integration-shortcuts-icon">
                    <source srcSet="/atalhos-icon.webp" type="image/webp" />
                    <img src="/atalhos-icon.png" alt="" width="36" height="36" decoding="async" aria-hidden="true" />
                  </picture>
                  <div>
                    <strong>Configuração do Atalho</strong>
                    <p>Use este endpoint no app Atalhos.</p>
                  </div>
                </div>
              </div>
              <div className="integration-endpoint">
                <code>{shortcutEndpoint}</code>
                <button type="button" onClick={() => void copyEndpoint()} aria-label={isEndpointCopied ? "Endpoint copiado" : "Copiar endpoint"}>{isEndpointCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button>
              </div>
              <ol className="integration-steps">
                <li>Use “Obter conteúdo de URL” no app Atalhos.</li>
                <li>Escolha POST e envie o token no cabeçalho <code>X-Cloudy-Capture-Token</code>.</li>
                <li>Envie um JSON somente com <code>url</code>.</li>
              </ol>
            </div>
          </>
        )}
      </section>
    </div>,
    portalRoot
  );
}
