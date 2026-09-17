import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client/web";
import { bulkItemAction, createCategory, createIntegrationItem, createItem, deleteCategory, deleteItem, listCategories, listCategoryItems, parseBulkItemActionInput, parseCategoryInput, parseCreateItemInput, parseIntegrationItemInput, parseUpdateItemInput, resolveLinkPreview, UNTAGGED_CATEGORY_ID, INTEGRATIONS_CATEGORY_ID, updateCategory, updateItem } from "./items";

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

  it("exclui uma coleção vazia", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT id FROM categories")) return { rows: [{ id: "category-1" }] };
      if (statement.sql.includes("SELECT COUNT(*) AS item_count FROM items WHERE user_id = ? AND category_id = ?")) return { rows: [{ item_count: 0 }] };
      return { rows: [] };
    });

    await expect(deleteCategory({ execute } as Client, "user-1", "category-1")).resolves.toEqual({ id: "category-1" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("DELETE FROM categories") }));
  });

  it("bloqueia a exclusão de uma coleção com itens", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT id FROM categories")) return { rows: [{ id: "category-1" }] };
      if (statement.sql.includes("SELECT COUNT(*) AS item_count FROM items WHERE user_id = ? AND category_id = ?")) return { rows: [{ item_count: 1 }] };
      return { rows: [] };
    });

    await expect(deleteCategory({ execute } as Client, "user-1", "category-1")).rejects.toThrowError("category_has_items");
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("DELETE FROM categories") }));
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
      if (statement.sql.includes("category_id IS NULL AND system_category IS NULL")) return { rows: [{ item_count: 100 }] };
      if (statement.sql.includes("system_category = 'integrations'")) return { rows: [{ item_count: 1 }] };
      return { rows: [] };
    });

    await expect(listCategories({ execute } as Client, "user-1")).resolves.toEqual([
      expect.objectContaining({ id: "category-1", itemCount: 6, recentItems: expect.arrayContaining([expect.objectContaining({ id: "recent-0" })]) }),
      expect.objectContaining({ id: UNTAGGED_CATEGORY_ID, name: "Vazio", itemCount: 100, isVirtual: true, recentItems: [expect.objectContaining({ id: "empty-1" })] }),
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

  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?t=42",
    "https://m.youtube.com/shorts/dQw4w9WgXcQ"
  ])("usa oEmbed para extrair título e thumbnail de links do YouTube: %s", async (url) => {
    let requestedUrl = "";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        title: "Título do vídeo",
        thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveLinkPreview(url)).resolves.toEqual({
      title: "Título do vídeo",
      imageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      faviconUrl: new URL("/favicon.ico", url).toString()
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrl).toBe("https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json");
  });

  it("mantém fallback quando o oEmbed rejeita o vídeo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not Found", { status: 404 })));

    await expect(resolveLinkPreview("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).resolves.toEqual({
      title: "youtube.com",
      imageUrl: null,
      faviconUrl: "https://www.youtube.com/favicon.ico"
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
      if (statement.sql.includes("category_id IS NULL AND system_category IS NULL")) return { rows: [{ item_count: 0 }] };
      if (statement.sql.includes("SELECT i.id, i.name")) return { rows: [{ id: "item-2", name: "Sem tag", url: null, image_url: null, favicon_url: null, observation: null, created_at: "2026-09-11", updated_at: "2026-09-11", category_id: null, category_name: null, category_color: null }] };
      return { rows: [] };
    });

    const created = await createItem({ execute } as Client, "user-1", { name: "Sem tag" });

    expect(created.category).toBeNull();
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("INSERT INTO categories") }));
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("INSERT INTO items") }));
  });

  it("bloqueia o centésimo primeiro item da coleção Vazio", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("category_id IS NULL AND system_category IS NULL")) return { rows: [{ item_count: 100 }] };
      return { rows: [] };
    });

    await expect(createItem({ execute } as Client, "user-1", { name: "Nova referência" })).rejects.toThrowError("category_item_limit_reached");
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

  it("salva título e thumbnail do YouTube em links recebidos pela integração", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      title: "Vídeo no YouTube",
      thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    }), { status: 200, headers: { "content-type": "application/json" } })));
    let insertedArgs: unknown[] = [];
    const execute = vi.fn(async (statement: { sql: string; args?: unknown[] }) => {
      if (statement.sql.includes("system_category = 'integrations'") && statement.sql.includes("LIMIT 1")) return { rows: [] };
      if (statement.sql.includes("INSERT INTO items")) { insertedArgs = statement.args ?? []; return { rows: [] }; }
      if (statement.sql.includes("WHERE i.id = ?")) return { rows: [{ id: insertedArgs[0], name: insertedArgs[2], url: insertedArgs[3], image_url: insertedArgs[4], favicon_url: insertedArgs[5], observation: insertedArgs[6], system_category: "integrations", created_at: "2026-09-12", updated_at: "2026-09-12", category_id: null, category_name: null, category_color: null }] };
      return { rows: [] };
    });

    const result = await createIntegrationItem({ execute } as Client, "user-1", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });

    expect(result.item.name).toBe("Vídeo no YouTube");
    expect(result.item.imageUrl).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      sql: expect.stringContaining("INSERT INTO items"),
      args: expect.arrayContaining(["Vídeo no YouTube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"])
    }));
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

  it("bloqueia o centésimo primeiro item da coleção", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT id, name, color FROM categories")) return { rows: [{ id: "category-1", name: "Ideias", color: "#A78BFA" }] };
      if (statement.sql.includes("SELECT COUNT(*) AS item_count")) return { rows: [{ item_count: 100 }] };
      return { rows: [] };
    });

    await expect(createItem({ execute } as Client, "user-1", { name: "Nova referência", categoryName: "Ideias" })).rejects.toThrowError("category_item_limit_reached");
  });
});

describe("item mutations", () => {
  it("valida ações em massa e limita a seleção à capacidade da categoria", () => {
    expect(parseBulkItemActionInput({ action: "move", itemIds: ["item-1", "item-2"], sourceCategoryId: "category-1", categoryId: null })).toEqual({ action: "move", itemIds: ["item-1", "item-2"], sourceCategoryId: "category-1", categoryId: null });
    expect(parseBulkItemActionInput({ action: "delete", itemIds: ["item-1"], sourceCategoryId: "__integrations__" })).toEqual({ action: "delete", itemIds: ["item-1"], sourceCategoryId: "__integrations__" });
    expect(() => parseBulkItemActionInput({ action: "move", itemIds: ["item-1", "item-1"], sourceCategoryId: "category-1", categoryId: "category-2" })).toThrowError("invalid_item_ids");
    expect(() => parseBulkItemActionInput({ action: "move", itemIds: [], sourceCategoryId: "category-1", categoryId: "category-2" })).toThrowError("invalid_item_ids");
  });

  it("executa a movimentação em uma transação e bloqueia destino Integrações", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT id, category_id, system_category")) return { rows: [{ id: "item-1", category_id: "category-1", system_category: null }] };
      if (statement.sql.includes("SELECT id FROM categories")) return { rows: [{ id: "category-2" }] };
      if (statement.sql.includes("SELECT COUNT(*) AS item_count")) return { rows: [{ item_count: 0 }] };
      return { rows: [] };
    });
    const transaction = { execute, commit: vi.fn(async () => undefined), close: vi.fn() };
    const db = { transaction: vi.fn(async () => transaction), execute } as never;

    await expect(bulkItemAction(db, "user-1", { action: "move", itemIds: ["item-1"], sourceCategoryId: "category-1", categoryId: "category-2" })).resolves.toMatchObject({ deletedIds: [] });
    expect(transaction.commit).toHaveBeenCalledOnce();
    await expect(bulkItemAction(db, "user-1", { action: "move", itemIds: ["item-1"], sourceCategoryId: "category-1", categoryId: INTEGRATIONS_CATEGORY_ID })).rejects.toThrowError("system_category");
  });

  it("valida o payload completo de edição", () => {
    expect(parseUpdateItemInput({ name: "  Nova referência  ", url: "", observation: "  Nota curta  ", categoryId: null })).toEqual({
      name: "Nova referência",
      url: null,
      observation: "Nota curta",
      categoryId: null
    });
    expect(() => parseUpdateItemInput({ name: "", url: null, observation: null, categoryId: null })).toThrowError("invalid_item_name");
    expect(() => parseUpdateItemInput({ name: "Item", url: null, observation: null, categoryId: "" })).toThrowError("invalid_category_id");
    expect(() => parseUpdateItemInput({ name: "Item", url: null, observation: null })).toThrowError("invalid_category_id");
  });

  it("edita um item na mesma coleção e preserva sua prévia", async () => {
    const execute = vi.fn(async (statement: { sql: string; args?: unknown[] }) => {
      if (statement.sql.includes("SELECT i.id, i.name")) return { rows: [{ id: "item-1", name: "Ideia", url: "https://example.com", image_url: "https://example.com/cover.jpg", favicon_url: "https://example.com/favicon.ico", observation: null, system_category: null, created_at: "2026-09-11", updated_at: "2026-09-11", category_id: "category-1", category_name: "Ideias", category_color: "#A78BFA" }] };
      if (statement.sql.includes("SELECT id FROM categories")) return { rows: [{ id: "category-1" }] };
      return { rows: [] };
    });
    vi.stubGlobal("fetch", vi.fn());

    const updated = await updateItem({ execute } as Client, "user-1", "item-1", { name: "Ideia revisada", url: "https://example.com", observation: "Nova nota", categoryId: "category-1" });

    expect(updated.id).toBe("item-1");
    expect(fetch).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      sql: expect.stringContaining("UPDATE items"),
      args: ["category-1", null, "Ideia revisada", "https://example.com", "https://example.com/cover.jpg", "https://example.com/favicon.ico", "Nova nota", "item-1", "user-1"]
    }));
  });

  it("move uma integração para uma coleção comum e respeita a capacidade do destino", async () => {
    let destinationCount = 0;
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT i.id, i.name")) return { rows: [{ id: "item-2", name: "Reel", url: "https://example.com/reel", image_url: null, favicon_url: null, observation: null, system_category: "integrations", created_at: "2026-09-11", updated_at: "2026-09-11", category_id: null, category_name: null, category_color: null }] };
      if (statement.sql.includes("SELECT id FROM categories")) return { rows: [{ id: "category-1" }] };
      if (statement.sql.includes("SELECT COUNT(*) AS item_count")) return { rows: [{ item_count: destinationCount }] };
      return { rows: [] };
    });

    await expect(updateItem({ execute } as Client, "user-1", "item-2", { name: "Reel", url: "https://example.com/reel", observation: null, categoryId: "category-1" })).resolves.toMatchObject({ id: "item-2" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ args: ["category-1", null, "Reel", "https://example.com/reel", null, null, null, "item-2", "user-1"] }));

    destinationCount = 100;
    await expect(updateItem({ execute } as Client, "user-1", "item-2", { name: "Reel", url: "https://example.com/reel", observation: null, categoryId: "category-1" })).rejects.toThrowError("category_item_limit_reached");
  });

  it("move uma integração para Vazio e limpa a categoria de sistema", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT i.id, i.name")) return { rows: [{ id: "item-2", name: "Reel", url: null, image_url: null, favicon_url: null, observation: null, system_category: "integrations", created_at: "2026-09-11", updated_at: "2026-09-11", category_id: null, category_name: null, category_color: null }] };
      if (statement.sql.includes("SELECT COUNT(*) AS item_count")) return { rows: [{ item_count: 2 }] };
      return { rows: [] };
    });

    await expect(updateItem({ execute } as Client, "user-1", "item-2", { name: "Reel", url: null, observation: null, categoryId: null })).resolves.toMatchObject({ id: "item-2" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ args: [null, null, "Reel", null, null, null, null, "item-2", "user-1"] }));
  });

  it("retorna 404 para item ou coleção fora do escopo do usuário", async () => {
    const missingItemDb = { execute: vi.fn(async () => ({ rows: [] })) } as unknown as Client;
    await expect(updateItem(missingItemDb, "user-1", "missing", { name: "Item", url: null, observation: null, categoryId: null })).rejects.toThrowError("item_not_found");

    const execute = vi.fn(async (statement: { sql: string }) => statement.sql.includes("SELECT i.id, i.name")
      ? { rows: [{ id: "item-1", name: "Item", url: null, image_url: null, favicon_url: null, observation: null, system_category: null, created_at: "2026-09-11", updated_at: "2026-09-11", category_id: null, category_name: null, category_color: null }] }
      : { rows: [] });
    await expect(updateItem({ execute } as Client, "user-1", "item-1", { name: "Item", url: null, observation: null, categoryId: "category-other-user" })).rejects.toThrowError("category_not_found");
  });

  it("impede que um item comum seja enviado para Integrações", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => statement.sql.includes("SELECT i.id, i.name")
      ? { rows: [{ id: "item-1", name: "Ideia", url: null, image_url: null, favicon_url: null, observation: null, system_category: null, created_at: "2026-09-11", updated_at: "2026-09-11", category_id: null, category_name: null, category_color: null }] }
      : { rows: [] });

    await expect(updateItem({ execute } as Client, "user-1", "item-1", { name: "Ideia", url: null, observation: null, categoryId: INTEGRATIONS_CATEGORY_ID })).rejects.toThrowError("system_category");
  });

  it("recalcula ou limpa a prévia quando o link muda", async () => {
    const updates: unknown[][] = [];
    const execute = vi.fn(async (statement: { sql: string; args?: unknown[] }) => {
      if (statement.sql.includes("SELECT i.id, i.name")) return { rows: [{ id: "item-1", name: "Ideia", url: "https://old.example.com", image_url: "https://old.example.com/cover.jpg", favicon_url: "https://old.example.com/favicon.ico", observation: null, system_category: null, created_at: "2026-09-11", updated_at: "2026-09-11", category_id: null, category_name: null, category_color: null }] };
      if (statement.sql.includes("UPDATE items")) updates.push(statement.args ?? []);
      return { rows: [] };
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`<meta property="og:image" content="/new.jpg"><link rel="icon" href="/new.ico">`, { status: 200, headers: { "content-type": "text/html" } })));

    await updateItem({ execute } as Client, "user-1", "item-1", { name: "Ideia", url: "https://new.example.com", observation: null, categoryId: null });
    await updateItem({ execute } as Client, "user-1", "item-1", { name: "Ideia", url: null, observation: null, categoryId: null });

    expect(updates[0]).toEqual([null, null, "Ideia", "https://new.example.com", "https://new.example.com/new.jpg", "https://new.example.com/new.ico", null, "item-1", "user-1"]);
    expect(updates[1]).toEqual([null, null, "Ideia", null, null, null, null, "item-1", "user-1"]);
  });

  it("exclui somente um item pertencente ao usuário", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => statement.sql.includes("SELECT id FROM items") ? { rows: [{ id: "item-1" }] } : { rows: [] });

    await expect(deleteItem({ execute } as Client, "user-1", "item-1")).resolves.toEqual({ id: "item-1" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: "DELETE FROM items WHERE id = ? AND user_id = ?", args: ["item-1", "user-1"] }));

    execute.mockResolvedValueOnce({ rows: [] });
    await expect(deleteItem({ execute } as Client, "user-1", "missing")).rejects.toThrowError("item_not_found");
  });
});
