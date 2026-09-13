import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Blocks, CircleUser, Link2, LogOut, Plus, Settings, Share2, Tags, UsersRound, type LucideIcon } from "lucide-react";
import packageJson from "../../../package.json";
import { Badge } from "../../components/ui/badge";
import { DropdownMenu, DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { IconButton } from "../../components/ui/icon-button";

interface CloudActionCloudProps {
  email?: string | null;
  name?: string | null;
  onAddLink?: () => void;
  onTagsOpen?: () => void;
  onIntegrationsOpen?: () => void;
  onSignOut?: () => Promise<void>;
  onMenuOpenChange?: (isOpen: boolean) => void;
  photoURL?: string | null;
  disabled?: boolean;
}

type CloudMenu = "settings" | "share";

interface CloudMenuItem {
  icon: LucideIcon;
  label: string;
}

const cloudMenus: Record<CloudMenu, { items: CloudMenuItem[]; title: string }> = {
  settings: {
    title: "Configurações",
    items: []
  },
  share: {
    title: "Compartilhar",
    items: [
      { icon: Link2, label: "Copiar link" },
      { icon: UsersRound, label: "Convidar pessoas" }
    ]
  }
};

export function CloudActionCloud({ email, name, onAddLink, onTagsOpen, onIntegrationsOpen, onSignOut, onMenuOpenChange, photoURL, disabled = false }: CloudActionCloudProps) {
  const [openMenu, setOpenMenu] = useState<CloudMenu | null>(null);
  const [closingMenu, setClosingMenu] = useState<CloudMenu | null>(null);
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
          aria-haspopup="menu"
          aria-expanded={openMenu === "share"}
          aria-controls="cloud-action-menu-share"
          disabled={disabled}
          onClick={() => toggleMenu("share")}
        >
          <Share2 aria-hidden="true" strokeWidth={2.2} />
        </IconButton>
      </div>
      {renderedMenu && <CloudMenuPanel menu={renderedMenu} id={`cloud-action-menu-${renderedMenu}`} closing={isClosing} email={email} name={name} onAddLink={onAddLink} onTagsOpen={onTagsOpen} onIntegrationsOpen={onIntegrationsOpen} onClose={closeMenu} onSignOut={onSignOut} photoURL={photoURL} profileImageFailed={profileImageFailed} setProfileImageFailed={setProfileImageFailed} onAnimationEnd={(event) => { if (isClosing && event.animationName === "dropdown-menu-close") setClosingMenu(null); }} />}
    </div>
  );
}

function CloudMenuPanel({ menu, id, closing, email, name, onAddLink, onTagsOpen, onIntegrationsOpen, onClose, onSignOut, photoURL, profileImageFailed, setProfileImageFailed, onAnimationEnd }: { menu: CloudMenu; id: string; closing: boolean; email?: string | null; name?: string | null; onAddLink?: () => void; onTagsOpen?: () => void; onIntegrationsOpen?: () => void; onClose: () => void; onSignOut?: () => Promise<void>; photoURL?: string | null; profileImageFailed: boolean; setProfileImageFailed: (failed: boolean) => void; onAnimationEnd: ComponentProps<typeof DropdownMenu>["onAnimationEnd"]; }) {
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
          <DropdownMenuItem icon={Tags} onClick={() => { onClose(); onTagsOpen?.(); }}>Tags</DropdownMenuItem>
          <DropdownMenuItem icon={Blocks} onClick={() => { onClose(); onIntegrationsOpen?.(); }}>Integrações</DropdownMenuItem>
          <DropdownMenuItem icon={LogOut} destructive onClick={() => { onClose(); void onSignOut?.(); }}>Sair</DropdownMenuItem>
        </div>
      ) : (
        <div className="dropdown-menu-items">
          {content.items.map(({ icon: Icon, label }) => (
            <DropdownMenuItem icon={Icon} key={label} onClick={onClose}>{label}</DropdownMenuItem>
          ))}
        </div>
      )}
    </DropdownMenu>
  );
}

function formatAccountEmail(email?: string | null) {
  return email?.split("@", 1)[0] || "Conta conectada";
}
