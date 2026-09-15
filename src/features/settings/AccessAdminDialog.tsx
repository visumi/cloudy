import { useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CircleUser, LoaderCircle, RefreshCw, ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import { Switch } from "../../components/ui/switch";
import { useMobileDrawerBodyLock, useMobileDrawerGesture } from "../../components/ui/mobile-drawer";
import { ApiError, apiRequest } from "../../lib/api";
import type { AccessUser } from "../../types/api";

interface AccessAdminDialogProps {
  open: boolean;
  onClose: () => void;
  onClosingChange?: (closing: boolean) => void;
}

const ACCESS_DIALOG_EXIT_DURATION = 220;

export function AccessAdminDialog({ open, onClose, onClosingChange }: AccessAdminDialogProps) {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);
  const requestIdRef = useRef(0);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const finishExit = useCallback(() => {
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = undefined;
    closingRef.current = false;
    setShouldRender(false);
    setIsClosing(false);
    onClosingChange?.(false);
    window.requestAnimationFrame(() => {
      const returnTarget = returnFocusRef.current?.isConnected
        ? returnFocusRef.current
        : document.querySelector<HTMLButtonElement>('[aria-label="Abrir configurações"]');
      returnTarget?.focus();
    });
  }, [onClosingChange]);

  const startExit = useCallback(() => {
    if (closingRef.current) return;
    requestIdRef.current += 1;
    closingRef.current = true;
    setIsClosing(true);
    onClosingChange?.(true);
    exitTimerRef.current = window.setTimeout(finishExit, ACCESS_DIALOG_EXIT_DURATION);
  }, [finishExit, onClosingChange]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    startExit();
    onClose();
  }, [onClose, startExit]);

  const drawerGesture = useMobileDrawerGesture(requestClose);
  useMobileDrawerBodyLock(shouldRender);

  const loadUsers = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const nextUsers = await apiRequest<AccessUser[]>("/admin/access-users");
      if (requestId === requestIdRef.current) setUsers(sortUsers(nextUsers));
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(error instanceof ApiError && error.code === "owner_required"
        ? "Sua conta não pode gerenciar acessos."
        : "Não foi possível carregar os acessos.");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, []);

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
  }, [onClosingChange, open, shouldRender, startExit]);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setMessage(null);
    void loadUsers();
  }, [loadUsers, open]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => emailInputRef.current?.focus(), 0);
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, input, [href]")]
        .filter((element) => !element.hasAttribute("disabled"));
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
    };
  }, [open, requestClose]);

  const activeCount = useMemo(() => users.filter((user) => user.active).length, [users]);

  const addUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setMessage({ tone: "error", text: "Informe um e-mail válido." });
      emailInputRef.current?.focus();
      return;
    }

    setMessage(null);
    setIsSaving(true);
    try {
      const created = await apiRequest<AccessUser>("/admin/access-users", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail })
      });
      setUsers((current) => sortUsers([created, ...current.filter((user) => user.email !== created.email)]));
      setEmail("");
      setMessage({ tone: "success", text: "Acesso liberado." });
      emailInputRef.current?.focus();
    } catch (error) {
      setMessage({ tone: "error", text: formatMutationError(error, "Não foi possível liberar este acesso.") });
    } finally {
      setIsSaving(false);
    }
  };

  const setActive = async (user: AccessUser, active: boolean) => {
    if (user.role === "owner" || updatingEmail) return;
    setMessage(null);
    setUpdatingEmail(user.email);
    try {
      const updated = await apiRequest<AccessUser>(`/admin/access-users/${encodeURIComponent(user.email)}`, {
        method: "PATCH",
        body: JSON.stringify({ active })
      });
      setUsers((current) => sortUsers([updated, ...current.filter((item) => item.email !== updated.email)]));
      setMessage({ tone: "success", text: active ? "Acesso ativado." : "Acesso desativado." });
    } catch (error) {
      setMessage({ tone: "error", text: formatMutationError(error, "Não foi possível alterar este acesso.") });
    } finally {
      setUpdatingEmail(null);
    }
  };

  if (!shouldRender) return null;

  const handleExitAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (!isClosing || event.target !== event.currentTarget) return;
    if (event.animationName === "integration-dialog-departure" || event.animationName === "item-drawer-departure") finishExit();
  };

  return createPortal(
    <div className="access-admin-backdrop" data-closing={isClosing || undefined} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section
        ref={dialogRef}
        className="access-admin-panel"
        data-closing={isClosing || undefined}
        data-dragging={drawerGesture.isDragging || undefined}
        style={drawerGesture.panelStyle}
        onAnimationEnd={handleExitAnimationEnd}
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-admin-title"
        aria-describedby="access-admin-description"
        {...drawerGesture.panelProps}
      >
        <div className="mobile-drawer-handle" aria-hidden="true" {...drawerGesture.handleProps} />
        <button className="modal-close access-admin-close" type="button" aria-label="Fechar acessos" onClick={requestClose}><X aria-hidden="true" /></button>

        <div className="modal-heading access-admin-heading">
          <div className="modal-heading-icon" aria-hidden="true"><ShieldCheck /></div>
          <div className="modal-heading-copy">
            <h2 id="access-admin-title">Acessos</h2>
            <p id="access-admin-description">Defina quais contas Google podem entrar no Cloudy.</p>
          </div>
          <span className="access-admin-counter"><UsersRound aria-hidden="true" />{activeCount} {activeCount === 1 ? "ativo" : "ativos"}</span>
        </div>

        <form className="access-admin-form" onSubmit={(event) => void addUser(event)} noValidate>
          <label htmlFor="access-admin-email">E-mail da conta Google</label>
          <div className="access-admin-form-row">
            <input ref={emailInputRef} id="access-admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="pessoa@exemplo.com" autoComplete="email" disabled={isSaving} />
            <button className="button-action access-admin-add" type="submit" disabled={isSaving} aria-busy={isSaving}>
              {isSaving ? <LoaderCircle className="button-loading-spinner" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
              <span>{isSaving ? "Liberando…" : "Liberar acesso"}</span>
            </button>
          </div>
        </form>

        {message && <p className={`access-admin-message access-admin-message--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}

        <div className="access-admin-list-heading">
          <h3>Usuários</h3>
          <button type="button" onClick={() => void loadUsers()} disabled={isLoading} aria-label="Atualizar acessos">
            <RefreshCw className={isLoading ? "access-admin-refresh--loading" : undefined} aria-hidden="true" />
            <span>Atualizar</span>
          </button>
        </div>

        {isLoading && users.length === 0 ? (
          <div className="access-admin-loading" role="status" aria-live="polite">
            <LoaderCircle aria-hidden="true" />
            <div><strong>Carregando acessos</strong><span>Buscando os usuários autorizados…</span></div>
          </div>
        ) : loadError && users.length === 0 ? (
          <div className="access-admin-error" role="alert">
            <p>{loadError}</p>
            <button type="button" onClick={() => void loadUsers()}>Tentar novamente</button>
          </div>
        ) : users.length === 0 ? (
          <p className="access-admin-empty">Nenhum acesso cadastrado.</p>
        ) : (
          <div className="access-admin-list" aria-label="Usuários com acesso configurado">
            {users.map((accessUser) => (
              <article className="access-admin-user" key={accessUser.email}>
                <div className="access-admin-avatar" aria-hidden="true">
                  <CircleUser />
                  {accessUser.user?.picture && <img src={accessUser.user.picture} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />}
                </div>
                <div className="access-admin-user-copy">
                  <div className="access-admin-user-title">
                    <strong>{accessUser.user?.name || accessUser.email}</strong>
                    {accessUser.role === "owner" && <span className="access-admin-role">Proprietário</span>}
                    {accessUser.role !== "owner" && <span className={`access-admin-status${accessUser.active ? " access-admin-status--active" : ""}`}>{accessUser.active ? "Ativo" : "Inativo"}</span>}
                  </div>
                  {accessUser.user?.name && <span className="access-admin-user-email">{accessUser.email}</span>}
                  <span className="access-admin-last-login">{formatLastLogin(accessUser.user?.lastLoginAt)}</span>
                </div>
                <Switch
                  checked={accessUser.active}
                  disabled={accessUser.role === "owner" || Boolean(updatingEmail && updatingEmail !== accessUser.email)}
                  loading={updatingEmail === accessUser.email}
                  label={accessUser.role === "owner" ? "Acesso do proprietário protegido" : `${accessUser.active ? "Desativar" : "Ativar"} acesso de ${accessUser.email}`}
                  onCheckedChange={(active) => void setActive(accessUser, active)}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>,
    document.body ?? document.documentElement
  );
}

function sortUsers(users: AccessUser[]): AccessUser[] {
  return [...users].sort((left, right) => Number(right.role === "owner") - Number(left.role === "owner")
    || Number(right.active) - Number(left.active)
    || left.email.localeCompare(right.email));
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatMutationError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === "invalid_email") return "Informe um e-mail válido.";
  if (error.code === "owner_required") return "Sua conta não pode gerenciar acessos.";
  if (error.code === "cannot_disable_owner") return "O acesso do proprietário não pode ser desativado.";
  return fallback;
}

function formatLastLogin(value: string | null | undefined): string {
  if (!value) return "Aguardando primeiro login";
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "Último login registrado";
  return `Último login: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)}`;
}
