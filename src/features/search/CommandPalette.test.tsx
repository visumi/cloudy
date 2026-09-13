import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CloudyItem } from "../../types/api";
import { CommandPalette } from "./CommandPalette";

const items: CloudyItem[] = [
  { id: "item-1", name: "Café em Lisboa", url: "https://example.com/cafe", imageUrl: null, faviconUrl: null, observation: "Lugar para visitar", category: { id: "travel", name: "Viagens", color: "#bae6fd" }, createdAt: "2026-09-13T15:00:00.000Z", updatedAt: "2026-09-13T15:00:00.000Z" },
  { id: "item-2", name: "Animações suaves", url: "https://example.com/motion", imageUrl: null, faviconUrl: null, observation: "Referência de interface", category: { id: "design", name: "Design", color: "#bbf7d0" }, createdAt: "2026-09-12T15:00:00.000Z", updatedAt: "2026-09-12T15:00:00.000Z" }
];

describe("CommandPalette", () => {
  it("filtra sem diferenciar acentos e abre o resultado pelo teclado", () => {
    const onSelect = vi.fn();
    render(<CommandPalette open items={items} isLoading={false} error={null} onClose={vi.fn()} onRetry={vi.fn()} onSelect={onSelect} />);

    expect(document.querySelector(".command-palette-heading")).toHaveClass("modal-heading");
    expect(document.querySelector(".command-palette-heading .modal-heading-icon")).toBeInTheDocument();
    expect(document.querySelector(".command-palette .mobile-drawer-handle")).toBeInTheDocument();
    expect(document.querySelector(".command-palette-topline")).not.toBeInTheDocument();
    expect(document.querySelector(".command-results-label")?.textContent).toBe("Recentemente salvos");
    expect(document.querySelector(".command-result-category")).toHaveStyle("--category-color: #38BDF8");
    expect(document.querySelector(".command-result-note")).toBeInTheDocument();
    expect(document.querySelectorAll(".command-result-note svg")).toHaveLength(2);
    expect(screen.queryByText("Nota")).not.toBeInTheDocument();
    expect(document.querySelector(".command-input-escape")).not.toBeInTheDocument();
    expect(document.querySelector(".command-footer")).not.toBeInTheDocument();

    const input = screen.getByRole("combobox", { name: "Pesquisar referências" });
    fireEvent.change(input, { target: { value: "cafe" } });
    expect(screen.getByRole("option", { name: /Café em Lisboa/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Animações suaves/ })).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  it("lista somente os dez itens recentes e mantém o título fora da rolagem", () => {
    const recentItems = Array.from({ length: 11 }, (_, index) => {
      const date = `2026-09-${String(13 - index).padStart(2, "0")}T15:00:00.000Z`;
      return { ...items[0], id: `recent-${index + 1}`, name: `Item recente ${index + 1}`, createdAt: date, updatedAt: date };
    });
    render(<CommandPalette open items={recentItems} isLoading={false} error={null} onClose={vi.fn()} onRetry={vi.fn()} onSelect={vi.fn()} />);

    const label = document.querySelector(".command-results-label")!;
    const list = document.querySelector(".command-results-list")!;
    expect(screen.getAllByRole("option")).toHaveLength(10);
    expect(screen.queryByRole("option", { name: /Item recente 11/ })).not.toBeInTheDocument();
    expect(list).not.toContainElement(label);
  });

  it("mostra carregamento e permite tentar novamente em caso de erro", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<CommandPalette open items={[]} isLoading error={null} onClose={vi.fn()} onRetry={onRetry} onSelect={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Abrindo sua nuvem...");

    rerender(<CommandPalette open items={[]} isLoading={false} error="Não conseguimos abrir sua busca agora." onClose={vi.fn()} onRetry={onRetry} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("foca a busca ao abrir e fecha com Escape", async () => {
    const onClose = vi.fn();
    render(<CommandPalette open items={items} isLoading={false} error={null} onClose={onClose} onRetry={vi.fn()} onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Pesquisar referências" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
