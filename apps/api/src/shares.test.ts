import { describe, expect, it } from "vitest";
import { HttpError } from "./shared";
import { createShare, importShare, parseCreateShareInput, parseImportShareInput } from "./shares";

describe("compartilhamento", () => {
  it("valida categorias únicas para criação", () => {
    expect(parseCreateShareInput({ categoryIds: ["a", " b "] })).toEqual({ categoryIds: ["a", "b"] });
    expect(() => parseCreateShareInput({ categoryIds: ["a", "a"] })).toThrowError(HttpError);
    expect(() => parseCreateShareInput({ categoryIds: [] })).toThrowError("invalid_share_categories");
  });

  it("valida categorias do snapshot para importação", () => {
    expect(parseImportShareInput({ shareCategoryIds: ["shared-1"] })).toEqual({ shareCategoryIds: ["shared-1"] });
    expect(() => parseImportShareInput({ shareCategoryIds: ["shared-1", "shared-1"] })).toThrowError("invalid_share_categories");
  });

  it("cria um snapshot com categorias e itens pertencentes ao usuário", async () => {
    const statements: Array<{ sql: string; args?: unknown[] }> = [];
    const transaction = {
      execute: async (statement: { sql: string; args?: unknown[] }) => {
        statements.push(statement);
        if (statement.sql.includes("FROM categories")) return { rows: [{ id: "category-1", name: "Ideias", color: "#A78BFA" }] };
        if (statement.sql.includes("FROM items")) return { rows: [{ name: "Referência", url: "https://example.com", image_url: null, favicon_url: null, observation: "Nota" }] };
        return { rows: [] };
      },
      commit: async () => undefined,
      close: () => undefined
    };
    const db = { transaction: async () => transaction } as never;
    await expect(createShare(db, "user-1", { categoryIds: ["category-1"] })).resolves.toEqual({ shareId: expect.any(String) });
    expect(statements.find((statement) => statement.sql.includes("FROM categories"))?.sql).toContain("EXISTS");
    expect(statements.some((statement) => statement.sql.includes("INSERT INTO share_categories"))).toBe(true);
    expect(statements.some((statement) => statement.sql.includes("INSERT INTO share_items"))).toBe(true);
  });

  it("rejeita categoria sem itens", async () => {
    const transaction = {
      execute: async (statement: { sql: string }) => statement.sql.includes("FROM categories") ? { rows: [] } : { rows: [] },
      commit: async () => undefined,
      close: () => undefined
    };
    const db = { transaction: async () => transaction } as never;
    await expect(createShare(db, "user-1", { categoryIds: ["empty-category"] })).rejects.toThrowError("category_not_shareable");
  });

  it("importa uma categoria como cópia nova", async () => {
    const transaction = {
      execute: async (statement: { sql: string }) => {
        if (statement.sql.includes("SELECT id FROM shares")) return { rows: [{ id: "share-1" }] };
        if (statement.sql.includes("FROM share_categories")) return { rows: [{ id: "shared-category-1", name: "Ideias", color: "#A78BFA", position: 0 }] };
        if (statement.sql.includes("category_count")) return { rows: [{ category_count: 0 }] };
        if (statement.sql.includes("normalized_name FROM categories")) return { rows: [] };
        if (statement.sql.includes("FROM share_items")) return { rows: [{ id: "shared-item-1", name: "Referência", url: "https://example.com", image_url: null, favicon_url: null, observation: null }] };
        return { rows: [] };
      },
      commit: async () => undefined,
      close: () => undefined
    };
    const db = { transaction: async () => transaction } as never;
    const result = await importShare(db, "user-2", "share-1", { shareCategoryIds: ["shared-category-1"] });
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]).toMatchObject({ name: "Ideias", itemCount: 1 });
  });

  it("não importa uma categoria compartilhada sem itens", async () => {
    const transaction = {
      execute: async (statement: { sql: string }) => {
        if (statement.sql.includes("SELECT id FROM shares")) return { rows: [{ id: "share-1" }] };
        if (statement.sql.includes("FROM share_categories")) return { rows: [] };
        return { rows: [] };
      },
      commit: async () => undefined,
      close: () => undefined
    };
    const db = { transaction: async () => transaction } as never;
    await expect(importShare(db, "user-2", "share-1", { shareCategoryIds: ["empty-shared-category"] })).rejects.toThrowError("share_category_not_found");
  });
});
