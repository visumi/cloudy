import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client/web";
import { createItem, parseCreateItemInput, resolveLinkPreview } from "./items";

afterEach(() => vi.restoreAllMocks());

describe("item input", () => {
  it("normaliza texto e mantém observação opcional", () => {
    expect(parseCreateItemInput({ name: "  Uma   referência ", url: " https://example.com/a ", categoryName: "  Inspirações  ", observation: " uma nota " })).toEqual({
      name: "Uma referência",
      url: "https://example.com/a",
      categoryName: "Inspirações",
      observation: "uma nota"
    });
  });

  it("rejeita protocolos que não são links web", () => {
    expect(() => parseCreateItemInput({ name: "Referência", url: "javascript:alert(1)", categoryName: "Ideias" })).toThrowError("invalid_url");
  });

  it("rejeita campos obrigatórios fora dos limites", () => {
    expect(() => parseCreateItemInput({ name: "", url: "https://example.com", categoryName: "Ideias" })).toThrowError("invalid_item_name");
    expect(() => parseCreateItemInput({ name: "Referência", url: "https://example.com", categoryName: "" })).toThrowError("invalid_category_name");
  });
});

describe("link preview", () => {
  it("extrai título, imagem e favicon de metadados HTML", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`
      <html><head>
        <title>  Página de inspiração  </title>
        <meta property="og:image" content="/images/cover.jpg">
        <link rel="icon" href="/brand/icon.png">
      </head></html>
    `, { status: 200, headers: { "content-type": "text/html" } })));

    await expect(resolveLinkPreview("https://example.com/articles/inspiration")).resolves.toEqual({
      title: "Página de inspiração",
      imageUrl: "https://example.com/images/cover.jpg",
      faviconUrl: "https://example.com/brand/icon.png"
    });
  });

  it("usa título do domínio e favicon padrão quando o site falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));

    await expect(resolveLinkPreview("https://www.example.com")).resolves.toEqual({
      title: "example.com",
      imageUrl: null,
      faviconUrl: "https://www.example.com/favicon.ico"
    });
  });

  it("aceita twitter:image e image_src como fallbacks de imagem", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`
      <meta name='twitter:image' content='https://cdn.example.com/twitter.jpg'>
      <link rel='image_src' href='/legacy.jpg'>
    `, { status: 200, headers: { "content-type": "text/html" } })));

    await expect(resolveLinkPreview("https://example.com")).resolves.toMatchObject({ imageUrl: "https://cdn.example.com/twitter.jpg" });
  });

  it("reutiliza categoria do usuário e salva o item com a prévia resolvida", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`
      <title>Inspiração</title>
      <meta property="og:image" content="/cover.jpg">
      <link rel="icon" href="/favicon.png">
    `, { status: 200, headers: { "content-type": "text/html" } })));
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT id, name FROM categories")) return { rows: [{ id: "category-1", name: "Ideias" }] };
      if (statement.sql.includes("SELECT i.id, i.name")) return { rows: [{ id: "item-1", name: "Inspiração", url: "https://example.com", image_url: "https://example.com/cover.jpg", favicon_url: "https://example.com/favicon.png", observation: null, created_at: "2026-09-11", updated_at: "2026-09-11", category_id: "category-1", category_name: "Ideias" }] };
      return { rows: [] };
    });

    const item = await createItem({ execute } as Client, "user-1", { name: "Inspiração", url: "https://example.com", categoryName: " ideias ", observation: "Uma nota" });

    expect(item.category).toEqual({ id: "category-1", name: "Ideias" });
    expect(item.imageUrl).toBe("https://example.com/cover.jpg");
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("INSERT INTO items") }));
  });
});
