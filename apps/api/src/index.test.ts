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
      upsertUser
    };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/me", { headers: { Authorization: "Bearer test" } }), env, dependencies);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(profile);
    expect(upsertUser).toHaveBeenCalledWith(expect.anything(), profile);
  });
  it("converte HttpError em resposta JSON", async () => {
    const dependencies: RequestDependencies = { authenticate: vi.fn(async () => { throw new HttpError(401, "invalid_token"); }), createDatabaseClient: vi.fn(() => ({} as never)), resolveAuthenticatedUser: vi.fn(), upsertUser: vi.fn() };
    const response = await handleRequest(new Request("https://cloudy-api.isumi.com.br/me"), env, dependencies);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_token" });
  });
});
