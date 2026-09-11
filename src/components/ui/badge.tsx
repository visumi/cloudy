import type { HTMLAttributes, ReactNode } from "react";

type BadgeTone = "default" | "slate";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: BadgeTone;
}

export function Badge({ children, className = "", tone = "default", ...props }: BadgeProps) {
  return (
    <span {...props} className={`badge badge--${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}
