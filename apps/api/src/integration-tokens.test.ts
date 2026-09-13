import { describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client/web";
import { authenticateShortcutToken, createShortcutToken, getShortcutToken } from "./integration-tokens";

describe("shortcut tokens", () => {
  it("gera um token aleatório e nunca retorna seu hash", async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const created = await createShortcutToken({ execute } as Client, "user-1");

    expect(created.token).toMatch(/^cly_cap_[A-Za-z0-9_-]+$/);
    expect(created.tokenPrefix).toBe(created.token.slice(0, 14));
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("INSERT INTO shortcut_tokens") }));
  });

  it("retorna apenas metadados e resolve o usuário do token ativo", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => {
      if (statement.sql.includes("SELECT token_prefix")) return { rows: [{ token_prefix: "cly_cap_abc", created_at: "now", last_used_at: null }] };
      if (statement.sql.includes("SELECT id, user_id")) return { rows: [{ id: "token-1", user_id: "user-1" }] };
      return { rows: [] };
    });
    const metadata = await getShortcutToken({ execute } as Client, "user-1");
    const identity = await authenticateShortcutToken({ execute } as Client, "cly_cap_secret");

    expect(metadata).toEqual({ configured: true, tokenPrefix: "cly_cap_abc", createdAt: "now", lastUsedAt: null });
    expect(identity).toEqual({ id: "token-1", userId: "user-1" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("last_used_at = CURRENT_TIMESTAMP") }));
  });
});
