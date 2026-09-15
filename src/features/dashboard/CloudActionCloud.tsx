import { useEffect, useRef, useState, type ComponentProps } from "react";
import { ArrowLeftRight, Blocks, CircleUser, Ellipsis, Hand, LayersPlus, LogOut, Plus, Pointer, Search, Settings, Share2, Tags, Trash2, type LucideIcon } from "lucide-react";
import packageJson from "../../../package.json";
import { Badge } from "../../components/ui/badge";
import { DropdownMenu, DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { IconButton } from "../../components/ui/icon-button";

interface CloudActionCloudProps {
  email?: string | null;
  name?: string | null;
  onAddLink?: () => void;
  onSearch?: () => void;
  onTagsOpen?: () => void;
  onIntegrationsOpen?: () => void;
  onShareOpen?: () => void;
  selectionMode?: boolean;
  selectionAvailable?: boolean;
  selectedCount?: number;
  onSelectionToggle?: () => void;
  onSelectAll?: () => void;
  onBulkMove?: () => void;
  onBulkDelete?: () => void;
  onSignOut?: () => Promise<void>;
  onMenuOpenChange?: (isOpen: boolean) => void;
  photoURL?: string | null;
  disabled?: boolean;
}

type CloudMenu = "settings" | "bulk";

interface CloudMenuItem {
  icon: LucideIcon;
  label: string;
}

const cloudMenus: Record<CloudMenu, { items: CloudMenuItem[]; title: string }> = {
  settings: {
    title: "Configurações",
    items: []
  },
  bulk: { title: "Ações em massa", items: [] }
};

export function CloudActionCloud({ email, name, onAddLink, onSearch, onTagsOpen, onIntegrationsOpen, onShareOpen, onSignOut, onMenuOpenChange, photoURL, disabled = false, selectionMode = false, selectionAvailable = false, selectedCount = 0, onSelectionToggle, onSelectAll, onBulkMove, onBulkDelete }: CloudActionCloudProps) {
  const [openMenu, setOpenMenu] = useState<CloudMenu | null>(null);
  const [closingMenu, setClosingMenu] = useState<CloudMenu | null>(null);
  const [selectionToggleMounted, setSelectionToggleMounted] = useState(selectionAvailable);
  const [selectionToggleClosing, setSelectionToggleClosing] = useState(false);
  const bulkActionAvailable = selectionMode && selectedCount > 0;
  const [bulkActionMounted, setBulkActionMounted] = useState(bulkActionAvailable);
  const [bulkActionClosing, setBulkActionClosing] = useState(false);
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProfileImageFailed(false);
  }, [photoURL]);

  const closeMenu = () => {
    if (!openMenu) return;
    setClosingMenu(openMenu);
    setOpenMenu(null);
    onMenuOpenChange?.(false);
  };

  const toggleMenu = (menu: CloudMenu) => {
    if (openMenu === menu) {
      closeMenu();
      return;
    }
    setClosingMenu(null);
    setOpenMenu(menu);
    onMenuOpenChange?.(true);
  };

  useEffect(() => {
    if (disabled) {
      setOpenMenu(null);
      setClosingMenu(null);
      onMenuOpenChange?.(false);
    }
  }, [disabled, onMenuOpenChange]);

  useEffect(() => {
    if (selectionAvailable) {
      setSelectionToggleMounted(true);
      setSelectionToggleClosing(false);
      return;
    }
    if (!selectionToggleMounted) return;
    setSelectionToggleClosing(true);
    const timeoutId = window.setTimeout(() => {
      setSelectionToggleMounted(false);
      setSelectionToggleClosing(false);
    }, 220);
    return () => window.clearTimeout(timeoutId);
  }, [selectionAvailable, selectionToggleMounted]);

  useEffect(() => {
    if (bulkActionAvailable) {
      setBulkActionMounted(true);
      setBulkActionClosing(false);
      return;
    }
    if (!bulkActionMounted) return;
    setBulkActionClosing(true);
    const timeoutId = window.setTimeout(() => {
      setBulkActionMounted(false);
      setBulkActionClosing(false);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [bulkActionAvailable, bulkActionMounted]);

  useEffect(() => {
    if (!openMenu || !menuRef.current) return;
    menuRef.current.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
  }, [openMenu]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) closeMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  });

  const renderedMenu = openMenu ?? closingMenu;
  const isClosing = renderedMenu !== null && openMenu === null;

  return (
    <div ref={menuRef} className="action-cloud" aria-label="Ações do Cloudy">
      <div className="cloud-action-slot cloud-action-slot--search">
        <button className="global-search-trigger" type="button" onClick={onSearch} aria-keyshortcuts="Control+K" aria-label="Abrir busca global" title="Abrir busca global (Ctrl+K)" disabled={disabled}>
          <Search aria-hidden="true" />
          <span>Pesquisar</span>
          <kbd><span>Ctrl</span><span>K</span></kbd>
        </button>
      </div>
      <div className="cloud-action-slot cloud-action-slot--settings">
        <IconButton
          tone="settings"
          label="Abrir configurações"
          aria-haspopup="menu"
          aria-expanded={openMenu === "settings"}
          aria-controls="cloud-action-menu-settings"
          disabled={disabled}
          onClick={() => toggleMenu("settings")}
        >
          <Settings aria-hidden="true" strokeWidth={2.1} />
        </IconButton>
      </div>
      <div className="cloud-action-slot cloud-action-slot--add">
        <IconButton
          tone="add"
          label="Adicionar referência"
          disabled={disabled}
          onClick={() => { closeMenu(); onAddLink?.(); }}
        >
          <Plus aria-hidden="true" strokeWidth={2.5} />
        </IconButton>
      </div>
      <div className="cloud-action-slot cloud-action-slot--share">
        <IconButton
          tone="share"
          label="Compartilhar"
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={() => { closeMenu(); onShareOpen?.(); }}
        >
          <Share2 aria-hidden="true" strokeWidth={2.2} />
        </IconButton>
      </div>
      {bulkActionMounted && <div className={`cloud-action-slot cloud-action-slot--bulk${bulkActionClosing ? " cloud-action-slot--bulk-closing" : ""}`}>
        <IconButton tone="settings" className="icon-button--bulk" label={`Ações para ${selectedCount} ${selectedCount === 1 ? "item" : "itens"} selecionados`} aria-haspopup="menu" aria-expanded={openMenu === "bulk"} aria-controls="cloud-action-menu-bulk" disabled={disabled} onClick={() => toggleMenu("bulk")}>
          <Ellipsis aria-hidden="true" strokeWidth={2.3} />
        </IconButton>
      </div>}
      {selectionToggleMounted && <div className={`cloud-action-slot cloud-action-slot--selection-toggle${selectionToggleClosing ? " cloud-action-slot--selection-toggle-closing" : ""}`}>
        <IconButton tone="settings" className="icon-button--selection-toggle" label={selectionMode ? "Desativar seleção de itens" : "Ativar seleção de itens"} disabled={disabled} aria-pressed={selectionMode} onClick={() => { closeMenu(); onSelectionToggle?.(); }}>
          {selectionMode ? <Hand aria-hidden="true" strokeWidth={2.1} /> : <Pointer aria-hidden="true" strokeWidth={2.1} />}
        </IconButton>
      </div>}
      {renderedMenu && <CloudMenuPanel menu={renderedMenu} id={`cloud-action-menu-${renderedMenu}`} closing={isClosing} email={email} name={name} onAddLink={onAddLink} onTagsOpen={onTagsOpen} onIntegrationsOpen={onIntegrationsOpen} onClose={closeMenu} onSignOut={onSignOut} photoURL={photoURL} profileImageFailed={profileImageFailed} setProfileImageFailed={setProfileImageFailed} selectedCount={selectedCount} onSelectAll={onSelectAll} onBulkMove={onBulkMove} onBulkDelete={onBulkDelete} onAnimationEnd={(event) => { if (isClosing && event.animationName === "dropdown-menu-close") setClosingMenu(null); }} />}
    </div>
  );
}

function CloudMenuPanel({ menu, id, closing, email, name, onAddLink, onTagsOpen, onIntegrationsOpen, onClose, onSignOut, photoURL, profileImageFailed, setProfileImageFailed, selectedCount = 0, onSelectAll, onBulkMove, onBulkDelete, onAnimationEnd }: { menu: CloudMenu; id: string; closing: boolean; email?: string | null; name?: string | null; onAddLink?: () => void; onTagsOpen?: () => void; onIntegrationsOpen?: () => void; onClose: () => void; onSignOut?: () => Promise<void>; photoURL?: string | null; profileImageFailed: boolean; setProfileImageFailed: (failed: boolean) => void; selectedCount?: number; onSelectAll?: () => void; onBulkMove?: () => void; onBulkDelete?: () => void; onAnimationEnd: ComponentProps<typeof DropdownMenu>["onAnimationEnd"]; }) {
  const content = cloudMenus[menu];

  return (
    <DropdownMenu id={id} label={content.title} closing={closing} onAnimationEnd={onAnimationEnd}>
      {menu === "settings" ? (
        <div className="dropdown-menu-account">
          <div className="dropdown-menu-brand" aria-label="Cloudy">
            <div className="dropdown-menu-brand-lockup">
              <img src="/cloudy-logo.png" alt="" aria-hidden="true" />
              <span className="brand-name">cloudy</span>
            </div>
            <Badge tone="slate">{packageJson.version}</Badge>
          </div>
          <div className="dropdown-menu-account-info">
            <div className="dropdown-menu-account-avatar">
              {photoURL && !profileImageFailed ? <img src={photoURL} alt="" referrerPolicy="no-referrer" onError={() => setProfileImageFailed(true)} /> : <CircleUser aria-hidden="true" strokeWidth={2} />}
            </div>
            <div className="dropdown-menu-account-copy">
              <span className="dropdown-menu-account-name">{name || "Conta conectada"}</span>
              <span className="dropdown-menu-account-email">{formatAccountEmail(email)}</span>
            </div>
          </div>
          <DropdownMenuItem icon={Tags} onClick={() => { onClose(); onTagsOpen?.(); }}>Coleções</DropdownMenuItem>
          <DropdownMenuItem icon={Blocks} onClick={() => { onClose(); onIntegrationsOpen?.(); }}>Integrações</DropdownMenuItem>
          <DropdownMenuItem icon={LogOut} destructive onClick={() => { onClose(); void onSignOut?.(); }}>Sair</DropdownMenuItem>
        </div>
      ) : (
        <>
          <DropdownMenuItem icon={LayersPlus} onClick={() => { onSelectAll?.(); }}>Selecionar tudo</DropdownMenuItem>
          <DropdownMenuItem icon={ArrowLeftRight} onClick={() => { onClose(); onBulkMove?.(); }}>Mover {selectedCount} {selectedCount === 1 ? "item" : "itens"}</DropdownMenuItem>
          <DropdownMenuItem icon={Trash2} destructive onClick={() => { onClose(); onBulkDelete?.(); }}>Excluir {selectedCount} {selectedCount === 1 ? "item" : "itens"}</DropdownMenuItem>
        </>
      )}
    </DropdownMenu>
  );
}

function formatAccountEmail(email?: string | null) {
  return email?.split("@", 1)[0] || "Conta conectada";
}
