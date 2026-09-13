import type { Client } from "@libsql/client/web";
import { type DbRow, HttpError, readDbString } from "./shared";

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = "cly_cap_";

export interface ShortcutTokenMetadata {
  configured: boolean;
  tokenPrefix: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export interface CreatedShortcutToken extends ShortcutTokenMetadata {
  token: string;
}

export interface ShortcutTokenIdentity {
  id: string;
  userId: string;
}

export async function createShortcutToken(db: Client, userId: string): Promise<CreatedShortcutToken> {
  await db.execute({ sql: "UPDATE shortcut_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL", args: [userId] });

  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const token = `${TOKEN_PREFIX}${toBase64Url(bytes)}`;
  const tokenHash = await hashToken(token);
  const tokenId = crypto.randomUUID();
  const tokenPrefix = token.slice(0, 14);
  const createdAt = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO shortcut_tokens (id, user_id, token_hash, token_prefix, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    args: [tokenId, userId, tokenHash, tokenPrefix]
  });

  return { configured: true, token, tokenPrefix, createdAt, lastUsedAt: null };
}

export async function getShortcutToken(db: Client, userId: string): Promise<ShortcutTokenMetadata> {
  const result = await db.execute({
    sql: `SELECT token_prefix, created_at, last_used_at
      FROM shortcut_tokens
      WHERE user_id = ? AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    args: [userId]
  });
  const row = result.rows[0] as DbRow | undefined;
  if (!row) return { configured: false, tokenPrefix: null, createdAt: null, lastUsedAt: null };
  return {
    configured: true,
    tokenPrefix: readDbString(row, "token_prefix"),
    createdAt: readDbString(row, "created_at"),
    lastUsedAt: readNullableDbString(row, "last_used_at")
  };
}

export async function revokeShortcutToken(db: Client, userId: string): Promise<void> {
  await db.execute({ sql: "UPDATE shortcut_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL", args: [userId] });
}

export async function authenticateShortcutToken(db: Client, token: string | null): Promise<ShortcutTokenIdentity> {
  if (!token) throw new HttpError(401, "missing_capture_token");
  const tokenHash = await hashToken(token);
  const result = await db.execute({
    sql: `SELECT id, user_id
      FROM shortcut_tokens
      WHERE token_hash = ? AND revoked_at IS NULL
      LIMIT 1`,
    args: [tokenHash]
  });
  const row = result.rows[0] as DbRow | undefined;
  if (!row) throw new HttpError(401, "invalid_capture_token");
  const identity = { id: readDbString(row, "id"), userId: readDbString(row, "user_id") };
  await markShortcutTokenUsed(db, identity.id);
  return identity;
}

async function markShortcutTokenUsed(db: Client, tokenId: string): Promise<void> {
  await db.execute({ sql: "UPDATE shortcut_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?", args: [tokenId] });
}

async function hashToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function readNullableDbString(row: DbRow, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value !== "string") throw new HttpError(500, `invalid_db_${key}`);
  return value;
}
