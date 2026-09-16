import { describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client/web";
import { connectDiscord, disconnectDiscord, getDiscordConnection, touchDiscordConnection } from "./discord-connections";

describe("conexões do Discord", () => {
  it("substitui a conexão anterior nos dois lados", async () => {
    const execute = vi.fn(async (statement: { sql: string }) => statement.sql.startsWith("SELECT dc") ? { rows: [{ discord_user_id: "discord-1", user_id: "user-1", shortcut_token_id: "token-1", created_at: "now", last_used_at: null }] } : { rows: [] });
    const transaction = { execute, commit: vi.fn(async () => {}), close: vi.fn() };
    const db = { execute, transaction: vi.fn(async () => transaction) } as unknown as Client;
    const connection = await connectDiscord(db, "discord-1", "user-1", "token-1");
    expect(connection.userId).toBe("user-1");
    expect(transaction.execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining("discord_user_id = ? OR user_id = ?") }));
    expect(transaction.commit).toHaveBeenCalledOnce();
  });

  it("ignora conexão cujo token foi revogado", async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    await expect(getDiscordConnection({ execute } as Client, "discord-1")).resolves.toBeNull();
  });

  it("atualiza uso e permite desconectar sem tocar no token", async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const db = { execute } as unknown as Client;
    await touchDiscordConnection(db, "discord-1");
    await disconnectDiscord(db, "discord-1");
    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({ sql: expect.stringContaining("last_used_at = CURRENT_TIMESTAMP") }));
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ sql: expect.stringContaining("DELETE FROM discord_connections") }));
  });
});
