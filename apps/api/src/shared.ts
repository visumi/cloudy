import { createClient, type Client } from "@libsql/client/web";

export interface Env {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  FIREBASE_PROJECT_ID: string;
  OWNER_EMAIL: string;
  ALLOWED_ORIGIN?: string;
  DISCORD_PUBLIC_KEY?: string;
}

export type AccessRole = "owner" | "member";
export interface AuthUser { uid: string; email: string; name: string | null; picture: string | null; allowed: boolean; role: AccessRole | null; }
export type DbRow = Record<string, unknown>;

export function createDatabaseClient(env: Env): Client {
  return createClient({ url: requiredEnv(env.TURSO_URL, "TURSO_URL"), authToken: requiredEnv(env.TURSO_AUTH_TOKEN, "TURSO_AUTH_TOKEN") });
}

export function requiredEnv(value: string | undefined, name: string): string {
  if (!value) throw new HttpError(500, `${name}_not_configured`);
  return value;
}

export function readDbString(row: DbRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new HttpError(500, `invalid_db_${key}`);
  return value;
}

export function readDbNullableString(row: DbRow, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new HttpError(500, `invalid_db_${key}`);
  return value;
}

export function readDbNumber(row: DbRow, key: string): number {
  const rawValue = row[key];
  if (typeof rawValue !== "number" && typeof rawValue !== "bigint") throw new HttpError(500, `invalid_db_${key}`);
  const value = Number(rawValue);
  if (!Number.isFinite(value)) throw new HttpError(500, `invalid_db_${key}`);
  return value;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
