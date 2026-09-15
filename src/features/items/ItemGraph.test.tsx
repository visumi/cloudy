import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { INTEGRATIONS_CATEGORY_ID, type CategorySummary, type CloudyItem } from "../../types/api";
import { ItemDetail, ItemGraph } from "./ItemGraph";

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
      onItemSelect={() => undefined}
      {...overrides}
    >
      <div aria-hidden="true" />
    </ItemGraph>
  );
}

describe("ItemGraph", () => {
  it("renderiza somente coleções e até cinco previews na visão inicial", () => {
    renderGraph();

    expect(screen.getByRole("button", { name: "Coleção Ideias, 2 itens" })).toBeInTheDocument();
    expect(document.querySelectorAll(".category-node-preview")).toHaveLength(2);
    expect(document.querySelectorAll(".item-node")).toHaveLength(0);
  });

  it("solicita a coleção ao clicar no card", async () => {
    const user = userEvent.setup();
    const onCategorySelect = vi.fn();
    renderGraph({ onCategorySelect });

    await user.click(screen.getByRole("button", { name: "Coleção Ideias, 2 itens" }));
    expect(onCategorySelect).toHaveBeenCalledWith("category-1");
  });

  it("exibe o retorno para coleções como uma seta compacta", () => {
    renderGraph({ selectedCategory: category, items: [item] });

    const backButton = screen.getByRole("button", { name: "Voltar para todas as coleções" });
    expect(backButton).toHaveAttribute("title", "Voltar para todas as coleções");
    expect(backButton.querySelector("svg")).toBeInTheDocument();
    expect(backButton.querySelector("span")).not.toBeInTheDocument();
  });

  it("substitui os cards por itens e informa o item selecionado", async () => {
    const user = userEvent.setup();
    const onItemSelect = vi.fn();
    renderGraph({ categories: [category], selectedCategory: category, items: [item], onItemSelect });

    expect(screen.queryByRole("button", { name: "Coleção Ideias, 2 itens" })).not.toBeInTheDocument();
    expect(document.querySelector(".graph-cloud")).toBeInTheDocument();
    expect(document.querySelectorAll(".graph-connection-layer--items line")).toHaveLength(1);
    expect(document.querySelector(".graph-connection-layer--items .graph-connection--category")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Página de inspiração, coleção Ideias" }));
    expect(onItemSelect).toHaveBeenCalledWith(item);
  });

  it("alterna itens sem abrir detalhes no modo de seleção", async () => {
    const user = userEvent.setup();
    const onItemSelect = vi.fn();
    const onItemToggle = vi.fn();
    renderGraph({ selectedCategory: category, items: [item], selectionMode: true, selectedItemIds: [item.id], onItemSelect, onItemToggle });

    const itemButton = screen.getByRole("button", { name: "Página de inspiração, coleção Ideias" });
    expect(itemButton).toHaveAttribute("aria-pressed", "true");
    expect(itemButton).toHaveClass("item-node--bulk-selected");
    expect(itemButton.querySelector(".item-node-selection-mark")).toBeInTheDocument();
    await user.click(itemButton);
    expect(onItemToggle).toHaveBeenCalledWith(item);
    expect(onItemSelect).not.toHaveBeenCalled();
  });

  it("exibe detalhes, copia o link e abre o menu de ações", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<ItemDetail item={item} open onClose={vi.fn()} onExited={vi.fn()} onEdit={onEdit} onDelete={onDelete} />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Salvo em: 10/09/2026")).toBeInTheDocument();
    expect(screen.getByText("Uma referência para revisar depois.", { selector: ".item-detail-observation-text" })).toBeInTheDocument();

    const copyButton = screen.getByRole("button", { name: "Copiar link" });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await user.click(copyButton);
    await waitFor(() => expect(copyButton).toHaveAccessibleName("Link copiado"));

    const menuTrigger = screen.getByRole("button", { name: "Abrir ações de Página de inspiração" });
    expect(menuTrigger.closest(".item-detail-heading-row")).toContainElement(screen.getByText("Salvo em: 10/09/2026"));
    await user.click(menuTrigger);
    expect(screen.getByRole("menu", { name: "Ações de Página de inspiração" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Editar" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(menuTrigger).toHaveFocus());

    await user.click(menuTrigger);
    await user.click(screen.getByRole("heading", { name: "Página de inspiração" }));
    expect(screen.queryByRole("menu", { name: "Ações de Página de inspiração" })).not.toBeInTheDocument();
    await user.click(menuTrigger);
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalledWith(item);
  });

  it("exibe a coleção Vazio em cinza", async () => {
    const user = userEvent.setup();
    const emptyCategory: CategorySummary = { id: "__untagged__", name: "Vazio", color: "#CBD5E1", itemCount: 1, recentItems: [], isVirtual: true };
    const onItemSelect = vi.fn();
    renderGraph({ categories: [emptyCategory], selectedCategory: emptyCategory, items: [{ ...item, category: null }], onItemSelect });

    expect(screen.getByRole("button", { name: "Página de inspiração, coleção Vazio" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Página de inspiração, coleção Vazio" }));
    expect(onItemSelect).toHaveBeenCalledWith(expect.objectContaining({ category: null }));
  });

  it("renderiza Integrações com o ícone do menu e abre sua coleção", async () => {
    const user = userEvent.setup();
    const integrations: CategorySummary = { id: INTEGRATIONS_CATEGORY_ID, name: "Integrações", color: "#38BDF8", itemCount: 2, recentItems: [], isSystem: true };
    const onCategorySelect = vi.fn();
    renderGraph({ categories: [category, integrations], onCategorySelect });

    const node = screen.getByRole("button", { name: "Coleção Integrações, 2 itens" });
    expect(node).toHaveClass("category-node--system");
    expect(node.querySelector("svg")).toBeInTheDocument();
    await user.click(node);
    expect(onCategorySelect).toHaveBeenCalledWith(INTEGRATIONS_CATEGORY_ID);
  });

  it("renderiza Vazio com o ícone Ghost", () => {
    const emptyCategory: CategorySummary = { id: "__untagged__", name: "Vazio", color: "#CBD5E1", itemCount: 1, recentItems: [], isVirtual: true };
    renderGraph({ categories: [emptyCategory] });
    const node = screen.getByRole("button", { name: "Coleção Vazio, 1 item" });
    expect(node).toHaveClass("category-node--virtual");
    expect(node.querySelector(".category-node-icon")).toBeInTheDocument();
    expect(node.querySelector("svg")).toBeInTheDocument();
  });

  it("renderiza a coleção Vazio com 100 itens de massa", () => {
    const emptyCategory: CategorySummary = { id: "__untagged__", name: "Vazio", color: "#CBD5E1", itemCount: 100, recentItems: [], isVirtual: true };
    const emptyItems = Array.from({ length: 100 }, (_, index) => ({
      ...item,
      id: `empty-${index}`,
      name: `Item sem coleção ${index + 1}`,
      category: null,
      createdAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T00:00:00Z`
    }));

    renderGraph({ categories: [emptyCategory], selectedCategory: emptyCategory, items: emptyItems });

    expect(document.querySelectorAll(".item-node")).toHaveLength(100);
  });

  it("mantém o zoom reduzido para exibir todos os itens", () => {
    renderGraph({ selectedCategory: category, items: [item] });
    const viewport = document.querySelector(".graph-viewport")!;
    const layer = document.querySelector(".graph-zoom-layer")!;

    expect(viewport).not.toHaveClass("graph-viewport--interactive");
    expect(layer).toHaveStyle("transform: scale(0.9)");
  });
});
