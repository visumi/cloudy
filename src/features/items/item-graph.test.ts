import { describe, expect, it } from "vitest";
import { INTEGRATIONS_CATEGORY_ID, type CategorySummary, type CloudyItem } from "../../types/api";
import { buildCategoryGraphLayout, buildCategoryItemGraphLayout, buildItemGraphLayout } from "./item-graph";

function category(id: string, name: string): CategorySummary {
  return { id, name, color: "#38BDF8", itemCount: 0, recentItems: [] };
}

function item(id: string, categoryId: string, categoryName: string): CloudyItem {
  return { id, name: id, url: `https://example.com/${id}`, imageUrl: null, faviconUrl: null, observation: null, category: { id: categoryId, name: categoryName, color: "#38BDF8" }, createdAt: id, updatedAt: id };
}

describe("item graph layout", () => {
  it("abre dois ramos independentes para as categorias na nuvem", () => {
    const layout = buildCategoryGraphLayout([category("ideas", "Ideias"), category("work", "Trabalho")]);

    expect(layout.nodes[0].left).not.toBe(layout.nodes[1].left);
    expect(layout.connections).toEqual([
      { kind: "core", x1: 50, y1: 48, x2: layout.nodes[0].left, y2: layout.nodes[0].top },
      { kind: "core", x1: 50, y1: 48, x2: layout.nodes[1].left, y2: layout.nodes[1].top }
    ]);
  });

  it("distribui 11 categorias em um anel amplo sem esconder cards", () => {
    const categories = Array.from({ length: 11 }, (_, index) => category(`category-${index}`, `Categoria ${index}`));
    const layout = buildCategoryGraphLayout(categories);

    expect(layout.nodes).toHaveLength(11);
    expect(new Set(layout.nodes.map((node) => `${node.left}:${node.top}`)).size).toBe(11);
    expect(Math.max(...layout.nodes.map((node) => node.top))).toBeGreaterThan(70);
    expect(layout.connections).toHaveLength(11);
  });

  it.each([9, 10])("distribui %i coleções comuns sem sobrepor cards ao lado de Integrações", (categoryCount) => {
    const integration = { ...category("integrations", "Integrações"), id: INTEGRATIONS_CATEGORY_ID, isSystem: true };
    const layout = buildCategoryGraphLayout([
      ...Array.from({ length: categoryCount }, (_, index) => category(`category-${index}`, `Categoria ${index}`)),
      integration
    ]);
    const overlappingPairs = layout.nodes.flatMap((node, index) => layout.nodes.slice(index + 1).filter((other) => (
      Math.abs(node.left - other.left) < 10 && Math.abs(node.top - other.top) < 9
    )));

    expect(layout.nodes).toHaveLength(categoryCount + 1);
    expect(overlappingPairs).toHaveLength(0);
    expect(layout.nodes.find((node) => node.category.id === INTEGRATIONS_CATEGORY_ID)).toMatchObject({ left: 50, top: 72 });
  });

  it("separa 15 categorias em dois anéis e dá respiro à base da nuvem", () => {
    const categories = Array.from({ length: 15 }, (_, index) => category(`category-${index}`, `Categoria ${index}`));
    const layout = buildCategoryGraphLayout(categories);

    expect(layout.nodes).toHaveLength(15);
    expect(new Set(layout.nodes.map((node) => `${node.left}:${node.top}`)).size).toBe(15);
    expect(Math.max(...layout.nodes.map((node) => node.top))).toBeGreaterThan(70);
    expect(layout.nodes.filter((node) => node.top > 70)).toHaveLength(1);
    expect(layout.nodes.slice(8).some((node) => node.left === 50 && node.top === 20)).toBe(true);
    expect(layout.connections).toHaveLength(15);
  });

  it("mantém os 11 itens visíveis em mais de um anel", () => {
    const items = Array.from({ length: 11 }, (_, index) => item(`item-${index}`, "ideas", "Ideias"));
    const layout = buildCategoryItemGraphLayout(items);
    const positions = new Set(layout.nodes.map((node) => `${node.left}:${node.top}`));

    expect(layout.nodes).toHaveLength(11);
    expect(positions.size).toBe(11);
    expect(new Set(layout.nodes.slice(0, 6).map((node) => node.left)).size).toBeGreaterThan(1);
    expect(layout.connections.filter((connection) => connection.kind === "category")).toHaveLength(5);
    expect(layout.connections.filter((connection) => connection.kind === "item")).toHaveLength(2);
  });

  it("não empilha dois cards na base com 5 itens", () => {
    const layout = buildCategoryItemGraphLayout(Array.from({ length: 5 }, (_, index) => item(`item-${index}`, "ideas", "Ideias")));
    const bottomNodes = layout.nodes.filter((node) => node.top > 60);

    expect(new Set(layout.nodes.map((node) => `${node.left}:${node.top}`)).size).toBe(5);
    expect(new Set(bottomNodes.map((node) => node.left)).size).toBe(bottomNodes.length);
  });

  it("fixa Integrações abaixo da nuvem e libera o slot para uma categoria comum", () => {
    const integration = { ...category("integrations", "Integrações"), id: INTEGRATIONS_CATEGORY_ID, isSystem: true };
    const layout = buildCategoryGraphLayout([
      category("a", "A"),
      category("b", "B"),
      category("c", "C"),
      category("d", "D"),
      integration
    ]);
    const integrationsNode = layout.nodes.find((node) => node.category.id === INTEGRATIONS_CATEGORY_ID)!;

    expect(integrationsNode).toMatchObject({ left: 50, top: 72 });
    expect(layout.nodes).toHaveLength(5);
    expect(layout.nodes.filter((node) => node.left === 50 && node.top === 72)).toHaveLength(1);
  });

  it("abre o setor inferior entre 5h e 7h sem criar um card às 6h", () => {
    const layout = buildCategoryGraphLayout(Array.from({ length: 6 }, (_, index) => category(`category-${index}`, `Categoria ${index}`)));

    expect(layout.nodes.some(({ left, top }) => left > 50 && top > 48)).toBe(true);
    expect(layout.nodes.some(({ left, top }) => left < 50 && top > 48)).toBe(true);
    expect(layout.nodes.some(({ left, top }) => left === 50 && top > 60)).toBe(false);
  });

  it("move o card deslocado pela reserva de Integrações para o espaço livre superior esquerdo", () => {
    const layout = buildCategoryGraphLayout([
      ...Array.from({ length: 16 }, (_, index) => category(`category-${index}`, `Categoria ${index}`)),
      { ...category("integrations", "Integrações"), id: INTEGRATIONS_CATEGORY_ID, isSystem: true }
    ]);
    const innerLowerNodes = layout.nodes.slice(13, 16);

    expect(layout.nodes[4]).toMatchObject({ left: 22, top: 37 });
    expect(Math.hypot(layout.nodes[4].left - layout.nodes[5].left, layout.nodes[4].top - layout.nodes[5].top)).toBeGreaterThan(18);
    expect(innerLowerNodes.map(({ left, top }) => ({ left: Math.round(left), top: Math.round(top) }))).toEqual([
      { left: 35, top: 16 },
      { left: 36, top: 62 },
      { left: 38, top: 34 }
    ]);
  });

  it("distribui 70 itens por toda a tela sem empilhar os cards", () => {
    const layout = buildCategoryItemGraphLayout(Array.from({ length: 70 }, (_, index) => item(`item-${index}`, "ideas", "Leitura")));
    const positions = new Set(layout.nodes.map((node) => `${node.left}:${node.top}`));
    const radialBands = new Set(layout.nodes.map((node) => Math.round(Math.hypot(node.left - 50, node.top - 48))));

    expect(layout.nodes).toHaveLength(70);
    expect(positions.size).toBe(70);
    expect(radialBands.size).toBeGreaterThanOrEqual(5);
    expect(Math.min(...layout.nodes.map((node) => Math.hypot(node.left - 50, node.top - 48)))).toBeGreaterThan(16);
    expect(Math.max(...layout.nodes.map((node) => node.left)) - Math.min(...layout.nodes.map((node) => node.left))).toBeGreaterThan(70);
    expect(Math.max(...layout.nodes.map((node) => node.top)) - Math.min(...layout.nodes.map((node) => node.top))).toBeGreaterThan(70);
    const distancesBetweenNodes = layout.nodes.flatMap((node, index) => layout.nodes.slice(index + 1).map((other) => Math.hypot(node.left - other.left, node.top - other.top)));
    expect(Math.min(...distancesBetweenNodes)).toBeGreaterThan(0);
    expect(Math.min(...distancesBetweenNodes)).toBeGreaterThan(6);
    expect(layout.connections.length).toBeLessThan(layout.nodes.length);
    expect(layout.connections.some((connection) => connection.kind === "item")).toBe(true);
  });

  it("mantém distância da nuvem e separação entre cards em diferentes densidades", () => {
    for (const count of [1, 3, 8, 11]) {
      const layout = buildCategoryItemGraphLayout(Array.from({ length: count }, (_, index) => item(`item-${index}`, "ideas", "Ideias")));
      const distancesFromCloud = layout.nodes.map((node) => Math.hypot(node.left - 50, node.top - 48));
      const distancesBetweenNodes = layout.nodes.flatMap((node, index) => layout.nodes.slice(index + 1).map((otherNode) => Math.hypot(node.left - otherNode.left, node.top - otherNode.top)));

      expect(Math.min(...distancesFromCloud)).toBeGreaterThan(24);
      if (distancesBetweenNodes.length > 0) expect(Math.min(...distancesBetweenNodes)).toBeGreaterThan(14);
    }
  });

  it("reserva o centro da nuvem e a área dos controles no modo denso", () => {
    const layout = buildCategoryItemGraphLayout(Array.from({ length: 70 }, (_, index) => item(`item-${index}`, "ideas", "Ideias")));

    expect(layout.nodes).toHaveLength(70);
    expect(layout.nodes.every((node) => Math.hypot(node.left - 50, node.top - 48) >= 24)).toBe(true);
    expect(50 - Math.min(...layout.nodes.map((node) => node.left))).toBeCloseTo(Math.max(...layout.nodes.map((node) => node.left)) - 50);
    expect(new Set(layout.nodes.map((node) => `${node.left}:${node.top}`)).size).toBe(70);
  });

  it("ordena os itens e as conexões pela data de criação", () => {
    const older = { ...item("older", "ideas", "Ideias"), createdAt: "2026-09-08T00:00:00Z" };
    const newer = { ...item("newer", "ideas", "Ideias"), createdAt: "2026-09-12T00:00:00Z" };
    const middle = { ...item("middle", "ideas", "Ideias"), createdAt: "2026-09-10T00:00:00Z" };
    const layout = buildCategoryItemGraphLayout([older, newer, middle]);

    expect(layout.nodes.map((node) => node.item.id)).toEqual(["newer", "middle", "older"]);
    expect(layout.connections).toHaveLength(3);
  });

  it("posiciona os itens mais recentes nos anéis internos", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      ...item(`item-${index}`, "ideas", "Ideias"),
      createdAt: `2026-09-${String(12 - index).padStart(2, "0")}T00:00:00Z`
    }));
    const layout = buildCategoryItemGraphLayout(items);
    const distancesFromCloud = layout.nodes.map((node) => Math.hypot(node.left - 50, node.top - 48));

    expect(Math.max(...distancesFromCloud.slice(0, 4))).toBeLessThan(Math.min(...distancesFromCloud.slice(4)));
  });

  it("keeps items from the same category in the same cluster", () => {
    const layout = buildItemGraphLayout([item("a", "ideas", "Ideias"), item("b", "ideas", "Ideias"), item("c", "work", "Trabalho")]);
    const ideas = layout.nodes.filter((node) => node.item.category?.id === "ideas");
    const work = layout.nodes.find((node) => node.item.category?.id === "work")!;
    expect(ideas[0].categoryLeft).toBe(ideas[1].categoryLeft);
    expect(ideas[0].categoryTop).toBe(ideas[1].categoryTop);
    expect({ left: ideas[0].categoryLeft, top: ideas[0].categoryTop }).not.toEqual({ left: work.categoryLeft, top: work.categoryTop });
    expect(layout.connections.filter((connection) => connection.kind === "item")).toHaveLength(1);
    expect(layout.connections.filter((connection) => connection.kind === "category")).toHaveLength(2);
  });

  it("produces a deterministic layout for the same items", () => {
    const items = [item("a", "ideas", "Ideias"), item("b", "ideas", "Ideias")];
    expect(buildItemGraphLayout(items)).toEqual(buildItemGraphLayout(items));
  });

  it("mantém itens sem tag no grafo", () => {
    const untaggedItem = { ...item("untagged", "unused", "unused"), category: null };
    const layout = buildItemGraphLayout([untaggedItem]);

    expect(layout.clusters[0]).toMatchObject({ categoryId: "__untagged__", categoryName: "Vazio" });
    expect(layout.nodes[0].item.category).toBeNull();
  });
});
