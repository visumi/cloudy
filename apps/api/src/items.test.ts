import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client/web";
import { createCategory, createIntegrationItem, createItem, deleteCategory, listCategories, listCategoryItems, parseCategoryInput, parseCreateItemInput, parseIntegrationItemInput, resolveLinkPreview, UNTAGGED_CATEGORY_ID, INTEGRATIONS_CATEGORY_ID, updateCategory } from "./items";

afterEach(() => vi.restoreAllMocks());

describe("item input", () => {
  it("normaliza texto e mantém observação opcional", () => {
    expect(parseCreateItemInput({ name: "  Uma   referência ", url: " https://example.com/a ", categoryName: "  Inspirações  ", categoryColor: "#A78BFA", observation: " uma nota " })).toEqual({
      name: "Uma referência",
      url: "https://example.com/a",
      categoryName: "Inspirações",
      categoryColor: "#A78BFA",
      observation: "uma nota"
    });
  });

  it("aceita item sem URL", () => {
    expect(parseCreateItemInput({ name: "  Uma anotação ", categoryName: "Ideias" })).toMatchObject({
      name: "Uma anotação",
      url: null,
      categoryName: "Ideias"
    });
  });

  it("aceita item sem tag", () => {
    expect(parseCreateItemInput({ name: "  Uma referência sem tag " })).toMatchObject({
      name: "Uma referência sem tag",
      url: null,
      categoryName: null,
      categoryColor: "#38BDF8"
    });
  });

  it("exige URL e limita o texto recebido pela integração", () => {
    expect(parseIntegrationItemInput({ url: " https://instagram.com/reel/1 ", text: " uma   legenda " })).toEqual({ url: "https://instagram.com/reel/1", text: "uma legenda" });
    expect(() => parseIntegrationItemInput({ text: "sem link" })).toThrowError("invalid_url");
  });

  it("rejeita protocolos que não são links web", () => {
    expect(() => parseCreateItemInput({ name: "Referência", url: "javascript:alert(1)", categoryName: "Ideias" })).toThrowError("invalid_url");
  });

  it("rejeita campos obrigatórios fora dos limites", () => {
    expect(() => parseCreateItemInput({ name: "", url: "https://example.com", categoryName: "Ideias" })).toThrowError("invalid_item_name");
    expect(() => parseCreateItemInput({ name: "a".repeat(25), url: "https://example.com", categoryName: "Ideias" })).toThrowError("invalid_item_name");
    expect(() => parseCreateItemInput({ name: "Referência", url: "https://example.com", categoryName: "a".repeat(13) })).toThrowError("invalid_category_name");
    expect(() => parseCreateItemInput({ name: "Referência", url: "https://example.com", categoryName: "Ideias", observation: "a".repeat(121) })).toThrowError("invalid_item_observation");
    expect(() => parseCreateItemInput({ name: "Referência", url: `https://example.com/${"a".repeat(2048)}`, categoryName: "Ideias" })).toThrowError("invalid_url_length");
  });
});

describe("category management", () => {
  it("normaliza e valida o nome e a cor da tag", () => {
    expect(parseCategoryInput({ name: "  Inspirações  ", color: "#A78BFA" })).toEqual({ name: "Inspirações", color: "#A78BFA" });
    expect(() => parseCategoryInput({ name: "Nova", color: "#ffffff" })).toThrowError("invalid_category_color");
  });

  it("reserva o nome e as rotas da categoria de sistema", async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    await expect(createCategory({ execute } as Client, "user-1", { name: "Integrações", color: "#38BDF8" })).rejects.toThrowError("category_reserved");
    await expect(updateCategory({ execute } as Client, "user-1", "__integrations__", { name: "Outra", color: "#38BDF8" })).rejects.toThrowError("system_category");
    await expect(deleteCategory({ execute } as Client, "user-1", "__integrations__")).rejects.toThrowError("system_category");
  });

  it("cria e atualiza uma tag com a contagem de itens", async () => {
    let updated = false;
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT id FROM categories") && statement.sql.includes("normalized_name")) return { rows: [] };
      if (statement.sql.includes("SELECT COUNT(*) AS category_count")) return { rows: [{ category_count: 1 }] };
      if (statement.sql.includes("WHERE id = ? AND user_id")) return { rows: [{ id: "category-1" }] };
      if (statement.sql.includes("SELECT id FROM categories") && statement.sql.includes("id <>")) return { rows: [] };
      if (statement.sql.includes("UPDATE categories")) { updated = true; return { rows: [] }; }
      if (statement.sql.includes("SELECT c.id, c.name, c.color, COUNT(i.id)")) return { rows: [{ id: "category-1", name: updated ? "Referências" : "Inspirações", color: updated ? "#FB7185" : "#A78BFA", item_count: 3 }] };
      return { rows: [] };
    });

    await expect(createCategory({ execute } as Client, "user-1", { name: " Inspirações ", color: "#A78BFA" })).resolves.toEqual({ id: "category-1", name: "Inspirações", color: "#A78BFA", itemCount: 3, recentItems: [] });
    await expect(updateCategory({ execute } as Client, "user-1", "category-1", { name: "Referências", color: "#FB7185" })).resolves.toMatchObject({ id: "category-1", itemCount: 3 });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("UPDATE categories") }));
  });

  it("exclui uma tag mesmo quando ela possui itens", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT id FROM categories")) return { rows: [{ id: "category-1" }] };
      return { rows: [] };
    });

    await expect(deleteCategory({ execute } as Client, "user-1", "category-1")).resolves.toEqual({ id: "category-1" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("DELETE FROM categories") }));
  });

  it("lista contagens, cinco previews recentes e a categoria virtual Vazio", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT c.id, c.name, c.color, COUNT(i.id)")) return { rows: [{ id: "category-1", name: "Ideias", color: "#A78BFA", item_count: 6 }] };
      if (statement.sql.includes("WITH ranked_items")) return {
        rows: [
          ...Array.from({ length: 5 }, (_, index) => ({ id: `recent-${index}`, name: `Recente ${index}`, image_url: null, favicon_url: null, created_at: `2026-09-${String(12 - index).padStart(2, "0")}`, category_id: "category-1" })),
          { id: "empty-1", name: "Sem categoria", image_url: null, favicon_url: null, created_at: "2026-09-10", category_id: null }
        ]
      };
      if (statement.sql.includes("SELECT COUNT(*) AS item_count FROM items WHERE user_id")) return { rows: [{ item_count: 1 }] };
      return { rows: [] };
    });

    await expect(listCategories({ execute } as Client, "user-1")).resolves.toEqual([
      expect.objectContaining({ id: "category-1", itemCount: 6, recentItems: expect.arrayContaining([expect.objectContaining({ id: "recent-0" })]) }),
      expect.objectContaining({ id: UNTAGGED_CATEGORY_ID, name: "Vazio", itemCount: 1, isVirtual: true, recentItems: [expect.objectContaining({ id: "empty-1" })] }),
      expect.objectContaining({ id: INTEGRATIONS_CATEGORY_ID, name: "Integrações", itemCount: 1, isSystem: true })
    ]);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("category_id IS NULL AND system_category IS NULL") }));
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("ROW_NUMBER() OVER") }));
  });

  it("carrega apenas os itens da categoria autorizada e rejeita categoria inexistente", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT id FROM categories")) return { rows: [{ id: "category-1" }] };
      if (statement.sql.includes("SELECT i.id, i.name")) return { rows: [{ id: "item-1", name: "Ideia", url: null, image_url: null, favicon_url: null, observation: null, created_at: "2026-09-11", updated_at: "2026-09-11", category_id: "category-1", category_name: "Ideias", category_color: "#A78BFA" }] };
      return { rows: [] };
    });

    await expect(listCategoryItems({ execute } as Client, "user-1", "category-1")).resolves.toHaveLength(1);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ args: ["user-1", "category-1"] }));

    execute.mockResolvedValueOnce({ rows: [] });
    await expect(listCategoryItems({ execute } as Client, "user-1", "missing")).rejects.toThrowError("category_not_found");

    await expect(listCategoryItems({ execute } as Client, "user-1", UNTAGGED_CATEGORY_ID)).resolves.toHaveLength(1);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ args: ["user-1"] }));
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
      if (statement.sql.includes("SELECT id, name, color FROM categories")) return { rows: [{ id: "category-1", name: "Ideias", color: "#A78BFA" }] };
      if (statement.sql.includes("SELECT COUNT(*) AS item_count")) return { rows: [{ item_count: 0 }] };
      if (statement.sql.includes("SELECT i.id, i.name")) return { rows: [{ id: "item-1", name: "Inspiração", url: "https://example.com", image_url: "https://example.com/cover.jpg", favicon_url: "https://example.com/favicon.png", observation: null, created_at: "2026-09-11", updated_at: "2026-09-11", category_id: "category-1", category_name: "Ideias", category_color: "#A78BFA" }] };
      return { rows: [] };
    });

    const item = await createItem({ execute } as Client, "user-1", { name: "Inspiração", url: "https://example.com", categoryName: " ideias ", categoryColor: "#A78BFA", observation: "Uma nota" });

    expect(item.category).toEqual({ id: "category-1", name: "Ideias", color: "#A78BFA" });
    expect(item.imageUrl).toBe("https://example.com/cover.jpg");
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("INSERT INTO items") }));
  });

  it("salva um item sem tag sem criar categoria", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT i.id, i.name")) return { rows: [{ id: "item-2", name: "Sem tag", url: null, image_url: null, favicon_url: null, observation: null, created_at: "2026-09-11", updated_at: "2026-09-11", category_id: null, category_name: null, category_color: null }] };
      return { rows: [] };
    });

    const created = await createItem({ execute } as Client, "user-1", { name: "Sem tag" });

    expect(created.category).toBeNull();
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("INSERT INTO categories") }));
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("INSERT INTO items") }));
  });

  it("salva a integração no agrupador reservado e evita duplicatas", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<title>Reel inspirador</title>", { status: 200, headers: { "content-type": "text/html" } })));
    let stored = false;
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("system_category = 'integrations'") && statement.sql.includes("LIMIT 1")) {
        return { rows: stored ? [{ id: "item-3", name: "Legenda", url: "https://instagram.com/reel/3", image_url: null, favicon_url: null, observation: "Legenda", system_category: "integrations", created_at: "2026-09-12", updated_at: "2026-09-12", category_id: null, category_name: null, category_color: null }] : [] };
      }
      if (statement.sql.includes("INSERT INTO items")) { stored = true; return { rows: [] }; }
      if (statement.sql.includes("WHERE i.id = ?")) return { rows: [{ id: "item-3", name: "Legenda", url: "https://instagram.com/reel/3", image_url: null, favicon_url: null, observation: "Legenda", system_category: "integrations", created_at: "2026-09-12", updated_at: "2026-09-12", category_id: null, category_name: null, category_color: null }] };
      return { rows: [] };
    });

    const first = await createIntegrationItem({ execute } as Client, "user-1", { url: "https://instagram.com/reel/3", text: "Legenda" });
    const second = await createIntegrationItem({ execute } as Client, "user-1", { url: "https://instagram.com/reel/3", text: "Legenda" });

    expect(first.duplicate).toBe(false);
    expect(first.item.category).toEqual({ id: INTEGRATIONS_CATEGORY_ID, name: "Integrações", color: "#38BDF8" });
    expect(second.duplicate).toBe(true);
  });

  it("preenche a prévia de uma integração duplicada que ainda não tinha metadados", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`
      <meta property="og:image" content="/cover.jpg">
      <link rel="icon" href="/favicon.png">
    `, { status: 200, headers: { "content-type": "text/html" } })));
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("system_category = 'integrations'") && statement.sql.includes("LIMIT 1")) {
        return { rows: [{ id: "item-4", name: "example.com", url: "https://example.com/reel/4", image_url: null, favicon_url: null, observation: null, system_category: "integrations", created_at: "2026-09-12", updated_at: "2026-09-12", category_id: null, category_name: null, category_color: null }] };
      }
      return { rows: [] };
    });

    const result = await createIntegrationItem({ execute } as Client, "user-1", { url: "https://example.com/reel/4" });

    expect(result.duplicate).toBe(true);
    expect(result.item.imageUrl).toBe("https://example.com/cover.jpg");
    expect(result.item.faviconUrl).toBe("https://example.com/favicon.png");
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("COALESCE(image_url") }));
  });

  it("bloqueia a criação da décima sexta categoria", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT id, name, color FROM categories")) return { rows: [] };
      if (statement.sql.includes("SELECT COUNT(*) AS category_count")) return { rows: [{ category_count: 15 }] };
      return { rows: [] };
    });

    await expect(createItem({ execute } as Client, "user-1", { name: "Nova referência", categoryName: "Categoria 16" })).rejects.toThrowError("category_limit_reached");
  });

  it("bloqueia o septuagésimo primeiro item da categoria", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT id, name, color FROM categories")) return { rows: [{ id: "category-1", name: "Ideias", color: "#A78BFA" }] };
      if (statement.sql.includes("SELECT COUNT(*) AS item_count")) return { rows: [{ item_count: 70 }] };
      return { rows: [] };
    });

    await expect(createItem({ execute } as Client, "user-1", { name: "Nova referência", categoryName: "Ideias" })).rejects.toThrowError("category_item_limit_reached");
  });
});
