import { authenticate, resolveAuthenticatedUser, upsertUser } from "./access";
import { createDatabaseClient, type AuthUser, type Env, type HttpError } from "./shared";
import { HttpError as CloudyHttpError } from "./shared";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
export interface RequestDependencies {
  authenticate: typeof authenticate;
  createDatabaseClient: typeof createDatabaseClient;
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  upsertUser: typeof upsertUser;
}
const defaultDependencies: RequestDependencies = { authenticate, createDatabaseClient, resolveAuthenticatedUser, upsertUser };

export default { fetch: (request: Request, env: Env) => handleRequest(request, env) } satisfies ExportedHandler<Env>;

export async function handleRequest(request: Request, env: Env, dependencies: RequestDependencies = defaultDependencies): Promise<Response> {
  const corsHeaders = buildCorsHeaders(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "cloudy-api" }, 200, corsHeaders);
    const identity = await dependencies.authenticate(request, env);
    const db = dependencies.createDatabaseClient(env);
    const user = await dependencies.resolveAuthenticatedUser(db, identity, env);
    if (request.method === "GET" && url.pathname === "/me") {
      if (user.allowed) await dependencies.upsertUser(db, user);
      return json(user, 200, corsHeaders);
    }
    if (!user.allowed) return json({ error: "forbidden" }, 403, corsHeaders);
    return json({ error: "not_found" }, 404, corsHeaders);
  } catch (error) {
    if (error instanceof CloudyHttpError) return json({ error: error.message }, error.status, corsHeaders);
    console.error(error);
    return json({ error: "internal_server_error" }, 500, corsHeaders);
  }
}

function buildCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173", "https://cloudy.isumi.com.br", ...parseAllowedOrigins(env.ALLOWED_ORIGIN)]);
  if (origin && allowedOrigins.has(origin)) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary", "Origin"); }
  headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}
function parseAllowedOrigins(value: string | undefined): string[] { return (value || "").split(",").map((origin) => origin.trim()).filter(Boolean); }
function json(body: unknown, status: number, headers?: Headers): Response {
  const responseHeaders = new Headers(headers);
  Object.entries(jsonHeaders).forEach(([key, value]) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}
