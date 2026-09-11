import { decodeProtectedHeader, importX509, jwtVerify, type JWTPayload } from "jose";
import type { Client } from "@libsql/client/web";
import { type AccessRole, type AuthUser, type DbRow, type Env, HttpError, readDbString, requiredEnv } from "./shared";

interface AuthIdentity { uid: string; email: string; name: string | null; picture: string | null; }
interface AccessGrantRow { role: AccessRole; active: number; }
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
export function resolveAccessDecision(email: string, grant: AccessGrantRow | null, env: Pick<Env, "OWNER_EMAIL">): { allowed: boolean; role: AccessRole | null } {
  if (isOwnerEmail(email, env)) return { allowed: true, role: "owner" };
  if (grant?.active === 1) return { allowed: true, role: "member" };
  return { allowed: false, role: null };
}

export async function resolveAuthenticatedUser(db: Client, identity: AuthIdentity, env: Env): Promise<AuthUser> {
  const result = isOwnerEmail(identity.email, env) ? null : await db.execute({ sql: "SELECT role, active FROM access_grants WHERE email = ? LIMIT 1", args: [identity.email] });
  const row = result?.rows[0] as DbRow | undefined;
  const grant = row ? { role: readRole(row), active: Number(row.active) } : null;
  const access = resolveAccessDecision(identity.email, grant, env);
  return { ...identity, allowed: access.allowed, role: access.role };
}

function readRole(row: DbRow): AccessRole {
  const role = readDbString(row, "role");
  if (role !== "owner" && role !== "member") throw new HttpError(500, "invalid_db_role");
  return role;
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
