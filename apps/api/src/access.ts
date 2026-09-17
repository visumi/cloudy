import { decodeProtectedHeader, importX509, jwtVerify, type JWTPayload } from "jose";
import type { Client } from "@libsql/client/web";
import { type AccessRole, type AuthUser, type DbRow, type Env, HttpError, readDbNullableString, readDbNumber, readDbString, requiredEnv } from "./shared";

interface AuthIdentity { uid: string; email: string; name: string | null; picture: string | null; }
interface AccessGrantRow {
  email: string;
  role: AccessRole;
  active: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  user_id?: string | null;
  name?: string | null;
  picture?: string | null;
  last_login_at?: string | null;
}

export interface AccessGrantInput { email?: string; }
export interface AccessGrantPatchInput { active?: boolean; }

type FirebaseKey = Awaited<ReturnType<typeof importX509>>;
let keyCache: { expiresAt: number; keys: Map<string, FirebaseKey> } | null = null;

export async function authenticate(request: Request, env: Env): Promise<AuthIdentity> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError(401, "missing_token");
  const payload = await verifyFirebaseToken(token, env);
  const email = normalizeEmail(typeof payload.email === "string" ? payload.email : "");
  if (!email || payload.email_verified !== true) throw new HttpError(401, "invalid_identity");
  return { uid: String(payload.sub), email, name: typeof payload.name === "string" ? payload.name : null, picture: typeof payload.picture === "string" ? payload.picture : null };
}

async function verifyFirebaseToken(token: string, env: Env): Promise<JWTPayload> {
  const projectId = requiredEnv(env.FIREBASE_PROJECT_ID, "FIREBASE_PROJECT_ID");
  const { kid, alg } = decodeProtectedHeader(token);
  if (!kid || alg !== "RS256") throw new HttpError(401, "invalid_token_header");
  const key = await getFirebaseKey(kid);
  const { payload } = await jwtVerify(token, key, { audience: projectId, issuer: `https://securetoken.google.com/${projectId}` });
  if (!payload.sub) throw new HttpError(401, "invalid_subject");
  return payload;
}

async function getFirebaseKey(kid: string): Promise<FirebaseKey> {
  const now = Date.now();
  if (keyCache && keyCache.expiresAt > now && keyCache.keys.has(kid)) return keyCache.keys.get(kid)!;
  const response = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new HttpError(503, "firebase_keys_unavailable");
  const maxAge = response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1];
  const certificates = await response.json<Record<string, string>>();
  const keys = new Map<string, FirebaseKey>();
  for (const [certKid, certificate] of Object.entries(certificates)) keys.set(certKid, await importX509(certificate, "RS256"));
  keyCache = { expiresAt: now + Number(maxAge || 3600) * 1000, keys };
  const key = keys.get(kid);
  if (!key) throw new HttpError(401, "unknown_key");
  return key;
}

export function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
export function getOwnerEmails(env: Pick<Env, "OWNER_EMAIL">): string[] {
  const emails = [...new Set(requiredEnv(env.OWNER_EMAIL, "OWNER_EMAIL").split(",").map(normalizeEmail).filter(Boolean))];
  if (!emails.length) throw new HttpError(500, "OWNER_EMAIL_not_configured");
  return emails;
}
export function isOwnerEmail(email: string, env: Pick<Env, "OWNER_EMAIL">): boolean { return getOwnerEmails(env).includes(normalizeEmail(email)); }
export function resolveAccessDecision(email: string, grant: Pick<AccessGrantRow, "active" | "role"> | null, env: Pick<Env, "OWNER_EMAIL">): { allowed: boolean; role: AccessRole | null } {
  if (isOwnerEmail(email, env)) return { allowed: true, role: "owner" };
  if (grant?.active === 1) return { allowed: true, role: "member" };
  return { allowed: false, role: null };
}

export async function resolveAuthenticatedUser(db: Client, identity: AuthIdentity, env: Env): Promise<AuthUser> {
  const grant = isOwnerEmail(identity.email, env) ? null : await findAccessGrant(db, identity.email);
  const access = resolveAccessDecision(identity.email, grant, env);
  return { ...identity, allowed: access.allowed, role: access.role };
}

function readRole(row: DbRow): AccessRole {
  const role = readDbString(row, "role");
  if (role !== "owner" && role !== "member") throw new HttpError(500, "invalid_db_role");
  return role;
}

function mapAccessGrantRow(row: DbRow): AccessGrantRow {
  return {
    email: readDbString(row, "email"),
    role: readRole(row),
    active: readDbNumber(row, "active"),
    created_by_user_id: readDbNullableString(row, "created_by_user_id"),
    created_at: readDbString(row, "created_at"),
    updated_at: readDbString(row, "updated_at"),
    user_id: row.user_id === undefined ? undefined : readDbNullableString(row, "user_id"),
    name: row.name === undefined ? undefined : readDbNullableString(row, "name"),
    picture: row.picture === undefined ? undefined : readDbNullableString(row, "picture"),
    last_login_at: row.last_login_at === undefined ? undefined : readDbNullableString(row, "last_login_at")
  };
}

async function findAccessGrant(db: Client, email: string, includeUser = false): Promise<AccessGrantRow | null> {
  const result = await db.execute({
    sql: includeUser
      ? `SELECT g.email, g.role, g.active, g.created_by_user_id, g.created_at, g.updated_at,
          u.id AS user_id, u.name, u.picture, u.last_login_at
        FROM access_grants g
        LEFT JOIN users u ON u.email = g.email
        WHERE g.email = ? LIMIT 1`
      : "SELECT email, role, active, created_by_user_id, created_at, updated_at FROM access_grants WHERE email = ? LIMIT 1",
    args: [normalizeEmail(email)]
  });
  const row = result.rows[0] as DbRow | undefined;
  return row ? mapAccessGrantRow(row) : null;
}

export function requireOwner(user: AuthUser): void {
  if (user.role !== "owner") throw new HttpError(403, "owner_required");
}

export async function listAccessGrants(db: Client, env: Env) {
  await ensureOwnerAccessGrants(db, env);
  const result = await db.execute(`SELECT g.email, g.role, g.active, g.created_by_user_id, g.created_at, g.updated_at,
      u.id AS user_id, u.name, u.picture, u.last_login_at
    FROM access_grants g
    LEFT JOIN users u ON u.email = g.email`);

  return (result.rows as DbRow[])
    .map(mapAccessGrantRow)
    .map((row) => mapAccessGrant(row, env))
    .sort((left, right) => Number(right.role === "owner") - Number(left.role === "owner")
      || Number(right.active) - Number(left.active)
      || left.email.localeCompare(right.email));
}

export async function createAccessGrant(db: Client, user: AuthUser, env: Env, payload: unknown) {
  const email = normalizeEmail(readInputEmail(payload));
  if (!isValidEmail(email)) throw new HttpError(400, "invalid_email");

  await db.execute({
    sql: `INSERT INTO access_grants (email, role, active, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET role = excluded.role, active = 1, updated_at = CURRENT_TIMESTAMP`,
    args: [email, isOwnerEmail(email, env) ? "owner" : "member", user.uid]
  });

  return mapAccessGrant((await findAccessGrant(db, email, true))!, env);
}

export async function updateAccessGrant(db: Client, env: Env, rawEmail: string, payload: unknown) {
  const email = normalizeEmail(decodeEmail(rawEmail));
  if (!isValidEmail(email)) throw new HttpError(400, "invalid_email");
  const active = readInputActive(payload);
  if (typeof active !== "boolean") throw new HttpError(400, "invalid_active");
  if (isOwnerEmail(email, env) && active === false) throw new HttpError(400, "cannot_disable_owner");

  const existing = await findAccessGrant(db, email);
  if (!existing) throw new HttpError(404, "not_found");

  await db.execute({
    sql: "UPDATE access_grants SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?",
    args: [active ? 1 : 0, email]
  });
  return mapAccessGrant((await findAccessGrant(db, email, true))!, env);
}

export async function deleteAccessGrant(db: Client, env: Env, rawEmail: string): Promise<{ email: string }> {
  const email = normalizeEmail(decodeEmail(rawEmail));
  if (!isValidEmail(email)) throw new HttpError(400, "invalid_email");
  if (isOwnerEmail(email, env)) throw new HttpError(400, "cannot_delete_owner");

  const existing = await findAccessGrant(db, email);
  if (!existing) throw new HttpError(404, "not_found");

  await db.execute({ sql: "DELETE FROM access_grants WHERE email = ?", args: [email] });
  return { email };
}

async function ensureOwnerAccessGrants(db: Client, env: Env): Promise<void> {
  for (const email of getOwnerEmails(env)) {
    await db.execute({
      sql: `INSERT INTO access_grants (email, role, active, created_at, updated_at)
        VALUES (?, 'owner', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(email) DO UPDATE SET role = 'owner', active = 1, updated_at = CURRENT_TIMESTAMP`,
      args: [email]
    });
  }
}

function mapAccessGrant(row: AccessGrantRow, env: Env) {
  const owner = isOwnerEmail(row.email, env);
  return {
    email: row.email,
    role: owner ? "owner" as const : "member" as const,
    active: owner || row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: row.user_id ? {
      uid: row.user_id,
      name: row.name ?? null,
      picture: row.picture ?? null,
      lastLoginAt: row.last_login_at ?? null
    } : null
  };
}

function readInputEmail(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("email" in payload)) return "";
  return typeof payload.email === "string" ? payload.email : "";
}

function readInputActive(payload: unknown): boolean | undefined {
  if (!payload || typeof payload !== "object" || !("active" in payload)) return undefined;
  return typeof payload.active === "boolean" ? payload.active : undefined;
}

function decodeEmail(value: string): string {
  try { return decodeURIComponent(value); } catch { throw new HttpError(400, "invalid_email"); }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function upsertUser(db: Client, user: AuthUser): Promise<void> {
  await db.execute({
    sql: `INSERT INTO users (id, email, name, picture, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture,
      last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
    args: [user.uid, user.email, user.name, user.picture]
  });
}
