import { useEffect, useState } from "react";
import { Check, Copy, LoaderCircle, RefreshCw, ShieldCheck, X } from "lucide-react";
import { ApiError, apiRequest } from "../../lib/api";

interface IntegrationDialogProps {
  open: boolean;
  onClose: () => void;
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

export function IntegrationDialog({ open, onClose }: IntegrationDialogProps) {
  const [metadata, setMetadata] = useState<ShortcutTokenMetadata | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setToken(null);
    setIsCopied(false);
    setError(null);
    setIsLoading(true);
    void apiRequest<ShortcutTokenMetadata>("/integrations/shortcut/token")
      .then(setMetadata)
      .catch(() => setError("Não conseguimos carregar a configuração agora."))
      .finally(() => setIsLoading(false));
  }, [open]);

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

  if (!open) return null;

  return (
    <div className="integration-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="integration-panel" role="dialog" aria-modal="true" aria-labelledby="integration-title" onClick={(event) => event.stopPropagation()}>
        <button className="integration-close" type="button" aria-label="Fechar integrações" onClick={onClose}><X aria-hidden="true" /></button>
        <div className="integration-heading">
          <div className="integration-heading-icon" aria-hidden="true"><ShieldCheck /></div>
          <div>
            <span className="item-dialog-kicker">Conecte sua nuvem</span>
            <h2 id="integration-title">Integrações</h2>
            <p>Salve links direto do botão Compartilhar do iPhone.</p>
          </div>
        </div>

        {isLoading ? <p className="integration-status" role="status"><LoaderCircle aria-hidden="true" /> Carregando...</p> : (
          <>
            <div className="integration-card">
              <div>
                <strong>Atalho do iPhone</strong>
                <p>O token permite apenas registrar novos links na sua categoria Integrações.</p>
              </div>
              {token ? (
                <div className="integration-token-reveal">
                  <code>{token}</code>
                  <button type="button" onClick={() => void copyToken()} aria-label={isCopied ? "Token copiado" : "Copiar token"}>{isCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button>
                  <small>Copie agora. Por segurança, ele não será mostrado novamente.</small>
                </div>
              ) : metadata?.configured ? (
                <p className="integration-token-meta">Token ativo: <code>{metadata.tokenPrefix}••••</code></p>
              ) : <p className="integration-token-meta">Nenhum token configurado.</p>}
            </div>
            {error && <p className="integration-message integration-message--error" role="alert">{error}</p>}
            <div className="integration-actions">
              <button className="integration-primary" type="button" disabled={isSaving} onClick={() => void generateToken()}>{isSaving ? <LoaderCircle aria-hidden="true" /> : metadata?.configured ? <RefreshCw aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{metadata?.configured ? "Gerar novo token" : "Gerar token"}</button>
              {metadata?.configured && <button className="integration-revoke" type="button" disabled={isSaving} onClick={() => void revokeToken()}>Revogar token</button>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
