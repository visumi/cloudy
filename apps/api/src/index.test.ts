import { describe, expect, it, vi } from "vitest";
import { handleRequest, type RequestDependencies } from "./index";
import { type Env, HttpError } from "./shared";

const env: Env = { TURSO_URL: "https://example.turso.io", TURSO_AUTH_TOKEN: "token", FIREBASE_PROJECT_ID: "cloudy", OWNER_EMAIL: "owner@example.com" };
const identity = { uid: "uid-1", email: "owner@example.com", name: "Owner", picture: null };
const profile = { ...identity, allowed: true, role: "owner" as const };

describe("API base", () => {
  it("responde health sem autenticação", async () => {
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/health"), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: "cloudy-api" });
  });
  it("exige token no /me", async () => {
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/me"), env);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "missing_token" });
  });
  it("retorna o perfil autorizado e persiste o usuário", async () => {
    const upsertUser = vi.fn();
    const dependencies: RequestDependencies = {
      authenticate: vi.fn(async () => identity),
      createDatabaseClient: vi.fn(() => ({} as never)),
      resolveAuthenticatedUser: vi.fn(async () => profile),
      upsertUser,
      listItems: vi.fn(),
      createItem: vi.fn(),
      previewItem: vi.fn()
    };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/me", { headers: { Authorization: "Bearer test" } }), env, dependencies);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(profile);
    expect(upsertUser).toHaveBeenCalledWith(expect.anything(), profile);
  });
  it("converte HttpError em resposta JSON", async () => {
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => { throw new HttpError(401, "invalid_token"); }), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem: vi.fn() };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/me"), env, dependencies);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_token" });
  });

  it("protege o clima, valida coordenadas e não devolve dados de localização", async () => {
    const fetchMascotWeather = vi.fn(async (coordinates: { latitude: number; longitude: number }) => {
      expect(coordinates).toEqual({ latitude: -23.56, longitude: -46.63 });
      return { isRaining: true };
    });
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem: vi.fn(), fetchMascotWeather };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/mascot-weather", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ latitude: -23.556, longitude: -46.633 }) }), env, dependencies);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ isRaining: true });
    expect(dependencies.createDatabaseClient).not.toHaveBeenCalled();

    const invalidResponse = await handleRequest(new Request("https://cloudy-api.isumi.com.br/mascot-weather", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ latitude: 200, longitude: 0 }) }), env, dependencies);
    expect(invalidResponse.status).toBe(400);
    expect(fetchMascotWeather).toHaveBeenCalledTimes(1);
  });

  it("exige autenticação para consultar o clima", async () => {
    const fetchMascotWeather = vi.fn();
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => { throw new HttpError(401, "missing_token"); }), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem: vi.fn(), fetchMascotWeather };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/mascot-weather", { method: "POST", body: "{}" }), env, dependencies);
    expect(response.status).toBe(401);
    expect(fetchMascotWeather).not.toHaveBeenCalled();
  });

  it("não expõe detalhes quando o provedor de clima falha", async () => {
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => { throw new Error("Turso should not be reached"); }), resolveAuthenticatedUser: vi.fn(), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem: vi.fn(), fetchMascotWeather: vi.fn(async () => { throw new HttpError(502, "weather_unavailable"); }) };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/mascot-weather", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ latitude: 0, longitude: 0 }) }), env, dependencies);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "weather_unavailable" });
  });

  it("permite que o owner liste acessos sem cache", async () => {
    const listAccessGrants = vi.fn(async () => [{ email: "owner@example.com", role: "owner", active: true }]);
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem: vi.fn(), listAccessGrants };

    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/admin/access-users", { headers: { Authorization: "Bearer test" } }), env, dependencies);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual([{ email: "owner@example.com", role: "owner", active: true }]);
    expect(listAccessGrants).toHaveBeenCalledWith(expect.anything(), env);
  });

  it("bloqueia a administração de acessos para membros", async () => {
    const listAccessGrants = vi.fn();
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => ({ ...identity, email: "member@example.com" })), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => ({ ...profile, email: "member@example.com", role: "member" as const })), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem: vi.fn(), listAccessGrants };

    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/admin/access-users", { headers: { Authorization: "Bearer test" } }), env, dependencies);

    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "owner_required" });
    expect(listAccessGrants).not.toHaveBeenCalled();

    const updateResponse = await handleRequest(new Request("https://cloudy-api.isumi.com.br/admin/access-users/other%40example.com", { method: "PATCH", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) }), env, dependencies);
    expect(updateResponse.status).toBe(403);
    expect(updateResponse.headers.get("Cache-Control")).toBe("no-store");
    await expect(updateResponse.json()).resolves.toEqual({ error: "owner_required" });
  });

  it("cria, atualiza e exclui acessos como owner", async () => {
    const createAccessGrant = vi.fn(async () => ({ email: "member@example.com", active: true }));
    const updateAccessGrant = vi.fn(async () => ({ email: "member@example.com", active: false }));
    const deleteAccessGrant = vi.fn(async () => ({ email: "member@example.com" }));
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem: vi.fn(), createAccessGrant, updateAccessGrant, deleteAccessGrant };

    const createResponse = await handleRequest(new Request("https://cloudy-api.isumi.com.br/admin/access-users", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ email: "member@example.com" }) }), env, dependencies);
    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(createAccessGrant).toHaveBeenCalledWith(expect.anything(), profile, env, { email: "member@example.com" });

    const updateResponse = await handleRequest(new Request("https://cloudy-api.isumi.com.br/admin/access-users/member%40example.com", { method: "PATCH", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) }), env, dependencies);
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(updateAccessGrant).toHaveBeenCalledWith(expect.anything(), env, "member%40example.com", { active: false });

    const deleteResponse = await handleRequest(new Request("https://cloudy-api.isumi.com.br/admin/access-users/member%40example.com", { method: "DELETE", headers: { Authorization: "Bearer test" } }), env, dependencies);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.headers.get("Cache-Control")).toBe("no-store");
    await expect(deleteResponse.json()).resolves.toEqual({ email: "member@example.com" });
    expect(deleteAccessGrant).toHaveBeenCalledWith(expect.anything(), env, "member%40example.com");
  });

  it("lista itens apenas para o usuário autenticado", async () => {
    const listItems = vi.fn(async () => [{ id: "item-1" }]);
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems, createItem: vi.fn(), previewItem: vi.fn() };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/items", { headers: { Authorization: "Bearer test" } }), env, dependencies);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [{ id: "item-1" }] });
    expect(listItems).toHaveBeenCalledWith(expect.anything(), "uid-1");
  });

  it("lista itens sob demanda para uma categoria", async () => {
    const listCategoryItems = vi.fn(async () => [{ id: "item-1" }]);
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems: vi.fn(), listCategoryItems, createItem: vi.fn(), previewItem: vi.fn() };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/categories/category-1/items", { headers: { Authorization: "Bearer test" } }), env, dependencies);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [{ id: "item-1" }] });
    expect(listCategoryItems).toHaveBeenCalledWith(expect.anything(), "uid-1", "category-1");
  });

  it("cria item e retorna status 201", async () => {
    const createItem = vi.fn(async () => ({ id: "item-1", name: "Referência" }));
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems: vi.fn(), createItem, previewItem: vi.fn() };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/items", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ name: "Referência", url: "https://example.com", categoryName: "Ideias" }) }), env, dependencies);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "item-1", name: "Referência" });
    expect(createItem).toHaveBeenCalledWith(expect.anything(), "uid-1", { name: "Referência", url: "https://example.com", categoryName: "Ideias" });
  });

  it("edita e exclui um item autenticado", async () => {
    const updateItem = vi.fn(async () => ({ id: "item-1", name: "Referência revisada" }));
    const deleteItem = vi.fn(async () => ({ id: "item-1" }));
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), updateItem, deleteItem, previewItem: vi.fn() };
    const payload = { name: "Referência revisada", url: null, observation: null, categoryId: null };

    const updateResponse = await handleRequest(new Request("https://cloudy-api.isumi.com.br/items/item-1", { method: "PATCH", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify(payload) }), env, dependencies);
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual({ id: "item-1", name: "Referência revisada" });
    expect(updateItem).toHaveBeenCalledWith(expect.anything(), "uid-1", "item-1", payload);

    const deleteResponse = await handleRequest(new Request("https://cloudy-api.isumi.com.br/items/item-1", { method: "DELETE", headers: { Authorization: "Bearer test" } }), env, dependencies);
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({ id: "item-1" });
    expect(deleteItem).toHaveBeenCalledWith(expect.anything(), "uid-1", "item-1");
  });

  it("encaminha ações em massa para itens autenticados", async () => {
    const bulkItemAction = vi.fn(async () => ({ items: [], deletedIds: ["item-1"], categories: [] }));
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), bulkItemAction, previewItem: vi.fn() };
    const payload = { action: "delete", itemIds: ["item-1"], sourceCategoryId: "category-1" };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/items/bulk-actions", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify(payload) }), env, dependencies);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [], deletedIds: ["item-1"], categories: [] });
    expect(bulkItemAction).toHaveBeenCalledWith(expect.anything(), "uid-1", payload);
  });

  it("cria item pelo token restrito do Atalho", async () => {
    const createIntegrationItem = vi.fn(async () => ({ item: { id: "item-1" }, duplicate: false }));
    const authenticateShortcutToken = vi.fn(async () => ({ id: "token-1", userId: "uid-1" }));
    const dependencies: RequestDependencies = {
      authenticate: vi.fn(),
      authenticateShortcutToken,
      createDatabaseClient: vi.fn(() => ({} as never)),
      createIntegrationItem,
      resolveAuthenticatedUser: vi.fn(),
      upsertUser: vi.fn(),
      listItems: vi.fn(),
      createItem: vi.fn(),
      previewItem: vi.fn()
    };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/integrations/shortcut/items", { method: "POST", headers: { "X-Cloudy-Capture-Token": "cly_cap_test", "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://instagram.com/reel/1" }) }), env, dependencies);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ item: { id: "item-1" }, duplicate: false });
    expect(authenticateShortcutToken).toHaveBeenCalledWith(expect.anything(), "cly_cap_test");
    expect(createIntegrationItem).toHaveBeenCalledWith(expect.anything(), "uid-1", { url: "https://instagram.com/reel/1" });
  });

  it("gera token usando a sessão Firebase, sem expor o token em cache", async () => {
    const createShortcutToken = vi.fn(async () => ({ configured: true, token: "cly_cap_secret", tokenPrefix: "cly_cap_secre", createdAt: "now", lastUsedAt: null }));
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem: vi.fn(), createShortcutToken };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/integrations/shortcut/token", { method: "POST", headers: { Authorization: "Bearer firebase", "Content-Type": "application/json" } }), env, dependencies);

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ token: "cly_cap_secret" });
    expect(createShortcutToken).toHaveBeenCalledWith(expect.anything(), "uid-1");
  });

  it("gera prévia sem persistir o item", async () => {
    const previewItem = vi.fn(async () => ({ title: "Example", imageUrl: null, faviconUrl: "https://example.com/favicon.ico" }));
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/items/preview", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://example.com" }) }), env, dependencies);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ title: "Example", imageUrl: null, faviconUrl: "https://example.com/favicon.ico" });
    expect(previewItem).toHaveBeenCalledWith({ url: "https://example.com" });
  });

  it("bloqueia itens para usuário não autorizado", async () => {
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => ({ ...profile, allowed: false, role: null })), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem: vi.fn() };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/items", { headers: { Authorization: "Bearer test" } }), env, dependencies);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("cria e lê um compartilhamento pela sessão autenticada", async () => {
    const createShare = vi.fn(async () => ({ shareId: "share-1" }));
    const getShare = vi.fn(async () => ({ id: "share-1", createdAt: "now", categories: [] }));
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem: vi.fn(), createShare, getShare };
    const createResponse = await handleRequest(new Request("https://cloudy-api.isumi.com.br/shares", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ categoryIds: ["category-1"] }) }), env, dependencies);
    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.get("Cache-Control")).toBe("no-store");
    await expect(createResponse.json()).resolves.toEqual({ shareId: "share-1" });
    expect(createShare).toHaveBeenCalledWith(expect.anything(), "uid-1", { categoryIds: ["category-1"] });

    const readResponse = await handleRequest(new Request("https://cloudy-api.isumi.com.br/shares/share-1", { headers: { Authorization: "Bearer test" } }), env, dependencies);
    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toEqual({ id: "share-1", createdAt: "now", categories: [] });
    expect(getShare).toHaveBeenCalledWith(expect.anything(), "share-1");
  });

  it("importa categorias compartilhadas pela sessão autenticada", async () => {
    const importShare = vi.fn(async () => ({ categories: [{ id: "category-copy", name: "Ideias", color: "#A78BFA", itemCount: 1, recentItems: [] }] }));
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => identity), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(async () => profile), upsertUser: vi.fn(), listItems: vi.fn(), createItem: vi.fn(), previewItem: vi.fn(), importShare };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/shares/share-1/imports", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ shareCategoryIds: ["shared-category-1"] }) }), env, dependencies);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ categories: [{ id: "category-copy", name: "Ideias", color: "#A78BFA", itemCount: 1, recentItems: [] }] });
    expect(importShare).toHaveBeenCalledWith(expect.anything(), "uid-1", "share-1", { shareCategoryIds: ["shared-category-1"] });
  });
});
