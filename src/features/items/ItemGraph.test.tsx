import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CategorySummary, CloudyItem } from "../../types/api";
import { ItemGraph } from "./ItemGraph";

const category: CategorySummary = {
  id: "category-1",
  name: "Ideias",
  color: "#A78BFA",
  itemCount: 2,
  recentItems: [
    { id: "item-2", name: "Outra referência", imageUrl: null, faviconUrl: null, createdAt: "2026-09-12T00:00:00Z" },
    { id: "item-1", name: "Página de inspiração", imageUrl: null, faviconUrl: null, createdAt: "2026-09-11T00:00:00Z" }
  ]
};

const item: CloudyItem = {
  id: "item-1",
  name: "Página de inspiração",
  url: "https://example.com/inspiration",
  imageUrl: null,
  faviconUrl: null,
  observation: "Uma referência para revisar depois.",
  category: { id: "category-1", name: "Ideias", color: "#A78BFA" },
  createdAt: "2026-09-11T00:00:00Z",
  updatedAt: "2026-09-12T00:00:00Z"
};

function renderGraph(overrides: Partial<React.ComponentProps<typeof ItemGraph>> = {}) {
  return render(
    <ItemGraph
      categories={[category]}
      selectedCategory={null}
      items={[]}
      isLoading={false}
      error={null}
      onRetry={() => undefined}
      onAddLink={() => undefined}
      onCategorySelect={() => undefined}
      onCategoryBack={() => undefined}
      {...overrides}
    >
      <div aria-hidden="true" />
    </ItemGraph>
  );
}

describe("ItemGraph", () => {
  it("renderiza somente categorias e até cinco previews na visão inicial", () => {
    renderGraph();

    expect(screen.getByRole("button", { name: "Categoria Ideias, 2 itens" })).toBeInTheDocument();
    expect(document.querySelectorAll(".category-node-preview")).toHaveLength(2);
    expect(document.querySelectorAll(".item-node")).toHaveLength(0);
  });

  it("solicita a categoria ao clicar no card", async () => {
    const user = userEvent.setup();
    const onCategorySelect = vi.fn();
    renderGraph({ onCategorySelect });

    await user.click(screen.getByRole("button", { name: "Categoria Ideias, 2 itens" }));
    expect(onCategorySelect).toHaveBeenCalledWith("category-1");
  });

  it("exibe o retorno para categorias como uma seta compacta", () => {
    renderGraph({ selectedCategory: category, items: [item] });

    const backButton = screen.getByRole("button", { name: "Voltar para todas as categorias" });
    expect(backButton).toHaveAttribute("title", "Voltar para todas as categorias");
    expect(backButton.querySelector("svg")).toBeInTheDocument();
    expect(backButton.querySelector("span")).not.toBeInTheDocument();
  });

  it("substitui os cards por itens e mantém o drawer clicável", async () => {
    const user = userEvent.setup();
    renderGraph({ categories: [category], selectedCategory: category, items: [item] });

    expect(screen.queryByRole("button", { name: "Categoria Ideias, 2 itens" })).not.toBeInTheDocument();
    expect(document.querySelector(".graph-cloud")).toBeInTheDocument();
    expect(document.querySelectorAll(".graph-connection-layer--items line")).toHaveLength(1);
    expect(document.querySelector(".graph-connection-layer--items .graph-connection--category")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Página de inspiração, categoria Ideias" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Salvo em: 10/09/2026")).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "Copiar link" });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await user.click(copyButton);
    await waitFor(() => expect(copyButton).toHaveAccessibleName("Link copiado"));
  });

  it("exibe a categoria Vazio em cinza", async () => {
    const user = userEvent.setup();
    const emptyCategory: CategorySummary = { id: "__untagged__", name: "Vazio", color: "#CBD5E1", itemCount: 1, recentItems: [], isVirtual: true };
    renderGraph({ categories: [emptyCategory], selectedCategory: emptyCategory, items: [{ ...item, category: null }] });

    expect(screen.getByRole("button", { name: "Página de inspiração, categoria Vazio" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Página de inspiração, categoria Vazio" }));
    expect(await screen.findByText("Vazio", { selector: ".item-detail-category > span:last-child" })).toBeInTheDocument();
  });

  it("mantém o zoom reduzido para exibir todos os itens", () => {
    renderGraph({ selectedCategory: category, items: [item] });
    const viewport = document.querySelector(".graph-viewport")!;
    const layer = document.querySelector(".graph-zoom-layer")!;

    expect(viewport).not.toHaveClass("graph-viewport--interactive");
    expect(layer).toHaveStyle("transform: scale(0.9)");
  });
});
