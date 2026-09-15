import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-checked" | "onChange" | "role" | "type"> {
  checked: boolean;
  label: string;
  loading?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function Switch({ checked, className = "", disabled, label, loading = false, onCheckedChange, ...props }: SwitchProps) {
  return (
    <button
      {...props}
      className={`switch${checked ? " switch--checked" : ""}${loading ? " switch--loading" : ""} ${className}`.trim()}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      onClick={() => onCheckedChange?.(!checked)}
    >
      <span className="switch-thumb" aria-hidden="true">{loading && <LoaderCircle />}</span>
    </button>
  );
}
