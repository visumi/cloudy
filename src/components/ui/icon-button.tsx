import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonTone = "settings" | "add" | "share";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label: string;
  tone: IconButtonTone;
}

export function IconButton({ children, className = "", label, tone, type, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      type={type ?? "button"}
      className={`icon-button icon-button--${tone} ${className}`.trim()}
      aria-label={label}
    >
      {children}
    </button>
  );
}
