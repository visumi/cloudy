import type { AnimationEvent, ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface DropdownMenuProps {
  children: ReactNode;
  closing?: boolean;
  id: string;
  label: string;
  onAnimationEnd?: (event: AnimationEvent<HTMLDivElement>) => void;
}

export function DropdownMenu({ children, closing = false, id, label, onAnimationEnd }: DropdownMenuProps) {
  return (
    <div id={id} className={`dropdown-menu${closing ? " dropdown-menu--closing" : ""}`} role="menu" aria-label={label} onAnimationEnd={onAnimationEnd}>
      {children}
    </div>
  );
}

interface DropdownMenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  children: ReactNode;
  destructive?: boolean;
  icon: LucideIcon;
}

export function DropdownMenuItem({ children, className = "", destructive = false, icon: Icon, ...props }: DropdownMenuItemProps) {
  return (
    <button
      {...props}
      className={`dropdown-menu-item${destructive ? " dropdown-menu-item--destructive" : ""} ${className}`.trim()}
      type="button"
      role="menuitem"
    >
      <Icon aria-hidden="true" strokeWidth={2} />
      <span>{children}</span>
    </button>
  );
}
