import type { CSSProperties } from "react";

export const DEFAULT_CATEGORY_COLOR = "#38BDF8";
export const EMPTY_CATEGORY_COLOR = "#CBD5E1";

const EMPTY_CATEGORY_OPTION = { value: EMPTY_CATEGORY_COLOR, background: "#F1F5F9", ink: "#475569" } as const;

export const CATEGORY_COLOR_OPTIONS = [
  { name: "Azul céu", value: "#38BDF8", background: "#E0F2FE", ink: "#0C4A6E" },
  { name: "Lavanda", value: "#A78BFA", background: "#EDE9FE", ink: "#2E1065" },
  { name: "Rosa", value: "#FB7185", background: "#FFE4E6", ink: "#881337" },
  { name: "Âmbar", value: "#FBBF24", background: "#FEF3C7", ink: "#78350F" },
  { name: "Verde", value: "#4ADE80", background: "#DCFCE7", ink: "#14532D" },
  { name: "Laranja", value: "#FB923C", background: "#FFEDD5", ink: "#7C2D12" },
  { name: "Índigo", value: "#818CF8", background: "#E0E7FF", ink: "#312E81" },
  { name: "Limão", value: "#A3E635", background: "#ECFCCB", ink: "#365314" }
] as const;

export function getCategoryColorStyle(color: string): CSSProperties {
  const option = CATEGORY_COLOR_OPTIONS.find((candidate) => candidate.value === color) ?? (color === EMPTY_CATEGORY_COLOR ? EMPTY_CATEGORY_OPTION : undefined);
  return {
    "--category-color": option?.value ?? DEFAULT_CATEGORY_COLOR,
    "--category-bg": option?.background ?? "#E0F2FE",
    "--category-ink": option?.ink ?? "#0C4A6E"
  } as CSSProperties;
}
