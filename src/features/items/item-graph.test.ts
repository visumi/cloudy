import { describe, expect, it } from "vitest";
import type { CloudyItem } from "../../types/api";
import { buildItemGraphLayout } from "./item-graph";

function item(id: string, categoryId: string, categoryName: string): CloudyItem {
  return { id, name: id, url: `https://example.com/${id}`, imageUrl: null, faviconUrl: null, observation: null, category: { id: categoryId, name: categoryName, color: "#38BDF8" }, createdAt: id, updatedAt: id };
}

describe("item graph layout", () => {
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
