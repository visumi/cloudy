import { describe, expect, it, vi } from "vitest";
import { createAccessGrant, deleteAccessGrant, getOwnerEmails, listAccessGrants, normalizeEmail, requireOwner, resolveAccessDecision, updateAccessGrant } from "./access";
import type { AuthUser, Env } from "./shared";

describe("access policy", () => {
  const env = { OWNER_EMAIL: "Owner@Example.com, second@example.com" };
  it("normaliza e-mails e remove duplicados", () => expect(getOwnerEmails({ OWNER_EMAIL: " Owner@Example.com, owner@example.com " })).toEqual(["owner@example.com"]));
  it("autoriza o owner configurado", () => expect(resolveAccessDecision("owner@example.com", null, env)).toEqual({ allowed: true, role: "owner" }));
  it("autoriza grant ativo e bloqueia grant inativo", () => {
    expect(resolveAccessDecision("member@example.com", { role: "member", active: 1 }, env)).toEqual({ allowed: true, role: "member" });
    expect(resolveAccessDecision("member@example.com", { role: "member", active: 0 }, env)).toEqual({ allowed: false, role: null });
  });
  it("normaliza um e-mail individual", () => expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com"));
  it("exige o papel de owner para administrar acessos", () => {
    expect(() => requireOwner({ role: "member" } as AuthUser)).toThrowError("owner_required");
    expect(() => requireOwner({ role: "owner" } as AuthUser)).not.toThrow();
  });
});

describe("access grants", () => {
  const fullEnv: Env = { TURSO_URL: "https://example.turso.io", TURSO_AUTH_TOKEN: "token", FIREBASE_PROJECT_ID: "cloudy", OWNER_EMAIL: "owner@example.com" };
  const owner: AuthUser = { uid: "owner-1", email: "owner@example.com", name: "Owner", picture: null, allowed: true, role: "owner" };
  const timestamps = { created_at: "2026-09-15 12:00:00", updated_at: "2026-09-15 12:00:00" };

  it("lista owner primeiro e separa membros ativos e inativos", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [
        { email: "inactive@example.com", role: "member", active: 0, created_by_user_id: "owner-1", ...timestamps, user_id: null, name: null, picture: null, last_login_at: null },
        { email: "active@example.com", role: "member", active: 1, created_by_user_id: "owner-1", ...timestamps, user_id: "user-1", name: "Ana", picture: null, last_login_at: timestamps.updated_at },
        { email: "owner@example.com", role: "owner", active: 1, created_by_user_id: null, ...timestamps, user_id: "owner-1", name: "Owner", picture: null, last_login_at: timestamps.updated_at }
      ] });

    const result = await listAccessGrants({ execute } as never, fullEnv);

    expect(result.map((user) => user.email)).toEqual(["owner@example.com", "active@example.com", "inactive@example.com"]);
    expect(result[1].user).toMatchObject({ uid: "user-1", name: "Ana" });
    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({ args: ["owner@example.com"] }));
  });

  it("normaliza e cria ou reativa um membro", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: "member@example.com", role: "member", active: 1, created_by_user_id: "owner-1", ...timestamps, user_id: null, name: null, picture: null, last_login_at: null }] });

    const result = await createAccessGrant({ execute } as never, owner, fullEnv, { email: " Member@Example.COM " });

    expect(result).toMatchObject({ email: "member@example.com", role: "member", active: true, user: null });
    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({ args: ["member@example.com", "member", "owner-1"] }));
  });

  it("recusa e-mail inválido", async () => {
    const execute = vi.fn();
    await expect(createAccessGrant({ execute } as never, owner, fullEnv, { email: "invalido" })).rejects.toThrowError("invalid_email");
    expect(execute).not.toHaveBeenCalled();
  });

  it("ativa e desativa membros existentes", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ email: "member@example.com", role: "member", active: 1, created_by_user_id: "owner-1", ...timestamps }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ email: "member@example.com", role: "member", active: 0, created_by_user_id: "owner-1", ...timestamps, user_id: null, name: null, picture: null, last_login_at: null }] });

    await expect(updateAccessGrant({ execute } as never, fullEnv, "member%40example.com", { active: false })).resolves.toMatchObject({ email: "member@example.com", active: false });
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ args: [0, "member@example.com"] }));
  });

  it("protege o owner e informa quando o acesso não existe", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    await expect(updateAccessGrant({ execute } as never, fullEnv, "owner%40example.com", { active: false })).rejects.toThrowError("cannot_disable_owner");
    await expect(updateAccessGrant({ execute } as never, fullEnv, "missing%40example.com", { active: true })).rejects.toThrowError("not_found");
  });

  it("exclui o grant de um membro, mas protege o proprietário", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ email: "member@example.com", role: "member", active: 1, created_by_user_id: "owner-1", ...timestamps }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(deleteAccessGrant({ execute } as never, fullEnv, "member%40example.com")).resolves.toEqual({ email: "member@example.com" });
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ sql: "DELETE FROM access_grants WHERE email = ?", args: ["member@example.com"] }));
    await expect(deleteAccessGrant({ execute } as never, fullEnv, "owner%40example.com")).rejects.toThrowError("cannot_delete_owner");
  });
});
