import { authenticate, resolveAuthenticatedUser, upsertUser } from "./access";
import { createCategory, createItem, deleteCategory, listCategories, listItems, previewItem, updateCategory } from "./items";
import { createDatabaseClient, type AuthUser, type Env, type HttpError } from "./shared";
import { HttpError as CloudyHttpError } from "./shared";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
export interface RequestDependencies {
  authenticate: typeof authenticate;
  createDatabaseClient: typeof createDatabaseClient;
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  upsertUser: typeof upsertUser;
  listItems: typeof listItems;
  createItem: typeof createItem;
  previewItem: typeof previewItem;
  listCategories?: typeof listCategories;
  createCategory?: typeof createCategory;
  updateCategory?: typeof updateCategory;
  deleteCategory?: typeof deleteCategory;
}
const defaultDependencies: RequestDependencies = { authenticate, createDatabaseClient, resolveAuthenticatedUser, upsertUser, listItems, createItem, previewItem, listCategories, createCategory, updateCategory, deleteCategory };

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
    if (request.method === "POST" && url.pathname === "/items/preview") {
      return json(await dependencies.previewItem(await readRequestJson(request)), 200, corsHeaders);
    }
    if (request.method === "GET" && url.pathname === "/items") {
      return json({ items: await dependencies.listItems(db, user.uid) }, 200, corsHeaders);
    }
    if (request.method === "POST" && url.pathname === "/items") {
      return json(await dependencies.createItem(db, user.uid, await readRequestJson(request)), 201, corsHeaders);
    }
    if (request.method === "GET" && url.pathname === "/categories") {
      return json({ categories: await (dependencies.listCategories ?? defaultDependencies.listCategories!)(db, user.uid) }, 200, corsHeaders);
    }
    if (request.method === "POST" && url.pathname === "/categories") {
      return json(await (dependencies.createCategory ?? defaultDependencies.createCategory!)(db, user.uid, await readRequestJson(request)), 201, corsHeaders);
    }
    const categoryMatch = url.pathname.match(/^\/categories\/([^/]+)$/);
    if (categoryMatch && request.method === "PATCH") {
      return json(await (dependencies.updateCategory ?? defaultDependencies.updateCategory!)(db, user.uid, categoryMatch[1], await readRequestJson(request)), 200, corsHeaders);
    }
    if (categoryMatch && request.method === "DELETE") {
      return json(await (dependencies.deleteCategory ?? defaultDependencies.deleteCategory!)(db, user.uid, categoryMatch[1]), 200, corsHeaders);
    }
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
  headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}
function parseAllowedOrigins(value: string | undefined): string[] { return (value || "").split(",").map((origin) => origin.trim()).filter(Boolean); }
async function readRequestJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new CloudyHttpError(400, "invalid_json"); }
}
function json(body: unknown, status: number, headers?: Headers): Response {
  const responseHeaders = new Headers(headers);
  Object.entries(jsonHeaders).forEach(([key, value]) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}
