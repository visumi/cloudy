import type { Client } from "@libsql/client/web";
import { type DbRow, HttpError, readDbString } from "./shared";

export interface DiscordConnection {
  discordUserId: string;
  userId: string;
  shortcutTokenId: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function connectDiscord(db: Client, discordUserId: string, userId: string, shortcutTokenId: string): Promise<DiscordConnection> {
  const transaction = await db.transaction("write");
  try {
    await transaction.execute({
      sql: "DELETE FROM discord_connections WHERE discord_user_id = ? OR user_id = ?",
      args: [discordUserId, userId]
    });
    await transaction.execute({
      sql: `INSERT INTO discord_connections (discord_user_id, user_id, shortcut_token_id)
        VALUES (?, ?, ?)`,
      args: [discordUserId, userId, shortcutTokenId]
    });
    await transaction.commit();
  } finally {
    transaction.close();
  }
  const connection = await getDiscordConnection(db, discordUserId);
  if (!connection) throw new HttpError(500, "discord_connection_failed");
  return connection;
}

export async function getDiscordConnection(db: Client, discordUserId: string): Promise<DiscordConnection | null> {
  const result = await db.execute({
    sql: `SELECT dc.discord_user_id, dc.user_id, dc.shortcut_token_id, dc.created_at, dc.last_used_at
      FROM discord_connections dc
      INNER JOIN shortcut_tokens st ON st.id = dc.shortcut_token_id
      WHERE dc.discord_user_id = ? AND st.revoked_at IS NULL
      LIMIT 1`,
    args: [discordUserId]
  });
  const row = result.rows[0] as DbRow | undefined;
  if (!row) return null;
  return mapDiscordConnection(row);
}

export async function touchDiscordConnection(db: Client, discordUserId: string): Promise<void> {
  await db.execute({
    sql: `UPDATE discord_connections
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE discord_user_id = ?
        AND EXISTS (
          SELECT 1 FROM shortcut_tokens st
          WHERE st.id = discord_connections.shortcut_token_id AND st.revoked_at IS NULL
        )`,
    args: [discordUserId]
  });
}

export async function disconnectDiscord(db: Client, discordUserId: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM discord_connections WHERE discord_user_id = ?", args: [discordUserId] });
}

function mapDiscordConnection(row: DbRow): DiscordConnection {
  return {
    discordUserId: readDbString(row, "discord_user_id"),
    userId: readDbString(row, "user_id"),
    shortcutTokenId: readDbString(row, "shortcut_token_id"),
    createdAt: readDbString(row, "created_at"),
    lastUsedAt: row.last_used_at == null ? null : readDbString(row, "last_used_at")
  };
}
