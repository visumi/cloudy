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
});
