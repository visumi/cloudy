import { authenticate, createAccessGrant, listAccessGrants, requireOwner, resolveAuthenticatedUser, updateAccessGrant, upsertUser } from "./access";
import { bulkItemAction, createCategory, createIntegrationItem, createItem, deleteCategory, deleteItem, listCategories, listCategoryItems, listItems, previewItem, updateCategory, updateItem } from "./items";
import { authenticateShortcutToken, createShortcutToken, getShortcutToken, revokeShortcutToken } from "./integration-tokens";
import { createShare, getShare, importShare } from "./shares";
import { createDatabaseClient, type AuthUser, type Env, type HttpError } from "./shared";
import { HttpError as CloudyHttpError } from "./shared";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
export interface RequestDependencies {
  authenticate: typeof authenticate;
  createDatabaseClient: typeof createDatabaseClient;
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  upsertUser: typeof upsertUser;
  listItems: typeof listItems;
  listCategoryItems?: typeof listCategoryItems;
  createItem: typeof createItem;
  updateItem?: typeof updateItem;
  deleteItem?: typeof deleteItem;
  bulkItemAction?: typeof bulkItemAction;
  previewItem: typeof previewItem;
  listCategories?: typeof listCategories;
  createCategory?: typeof createCategory;
  updateCategory?: typeof updateCategory;
  deleteCategory?: typeof deleteCategory;
  createIntegrationItem?: typeof createIntegrationItem;
  authenticateShortcutToken?: typeof authenticateShortcutToken;
  createShortcutToken?: typeof createShortcutToken;
  getShortcutToken?: typeof getShortcutToken;
  revokeShortcutToken?: typeof revokeShortcutToken;
  createShare?: typeof createShare;
  getShare?: typeof getShare;
  importShare?: typeof importShare;
  listAccessGrants?: typeof listAccessGrants;
  createAccessGrant?: typeof createAccessGrant;
  updateAccessGrant?: typeof updateAccessGrant;
}
const defaultDependencies: RequestDependencies = { authenticate, createDatabaseClient, resolveAuthenticatedUser, upsertUser, listItems, listCategoryItems, createItem, updateItem, deleteItem, bulkItemAction, previewItem, listCategories, createCategory, updateCategory, deleteCategory, createIntegrationItem, authenticateShortcutToken, createShortcutToken, getShortcutToken, revokeShortcutToken, createShare, getShare, importShare, listAccessGrants, createAccessGrant, updateAccessGrant };

export default { fetch: (request: Request, env: Env) => handleRequest(request, env) } satisfies ExportedHandler<Env>;

export async function handleRequest(request: Request, env: Env, dependencies: RequestDependencies = defaultDependencies): Promise<Response> {
  const corsHeaders = buildCorsHeaders(request, env);
  const url = new URL(request.url);
  const responseHeaders = url.pathname.startsWith("/admin/access-users") ? noStoreHeaders(corsHeaders) : corsHeaders;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders });
  try {
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "cloudy-api" }, 200, corsHeaders);
    if (request.method === "POST" && url.pathname === "/integrations/shortcut/items") {
      const db = dependencies.createDatabaseClient(env);
      const identity = await (dependencies.authenticateShortcutToken ?? defaultDependencies.authenticateShortcutToken!)(db, request.headers.get("X-Cloudy-Capture-Token"));
      const result = await (dependencies.createIntegrationItem ?? defaultDependencies.createIntegrationItem!)(db, identity.userId, await readRequestJson(request));
      return json(result, result.duplicate ? 200 : 201, corsHeaders);
    }
    const identity = await dependencies.authenticate(request, env);
    const db = dependencies.createDatabaseClient(env);
    const user = await dependencies.resolveAuthenticatedUser(db, identity, env);
    if (request.method === "GET" && url.pathname === "/me") {
      if (user.allowed) await dependencies.upsertUser(db, user);
      return json(user, 200, corsHeaders);
    }
    if (!user.allowed) return json({ error: "forbidden" }, 403, responseHeaders);
    const accessGrantMatch = url.pathname.match(/^\/admin\/access-users\/([^/]+)$/);
    if (url.pathname === "/admin/access-users" || accessGrantMatch) requireOwner(user);
    if (url.pathname === "/admin/access-users") {
      if (request.method === "GET") {
        return json(await (dependencies.listAccessGrants ?? defaultDependencies.listAccessGrants!)(db, env), 200, responseHeaders);
      }
      if (request.method === "POST") {
        await dependencies.upsertUser(db, user);
        return json(await (dependencies.createAccessGrant ?? defaultDependencies.createAccessGrant!)(db, user, env, await readRequestJson(request)), 201, responseHeaders);
      }
    }
    if (accessGrantMatch && request.method === "PATCH") {
      return json(await (dependencies.updateAccessGrant ?? defaultDependencies.updateAccessGrant!)(db, env, accessGrantMatch[1], await readRequestJson(request)), 200, responseHeaders);
    }
    if (request.method === "GET" && url.pathname === "/integrations/shortcut/token") {
      return json(await (dependencies.getShortcutToken ?? defaultDependencies.getShortcutToken!)(db, user.uid), 200, corsHeaders);
    }
    if (request.method === "POST" && url.pathname === "/integrations/shortcut/token") {
      return json(await (dependencies.createShortcutToken ?? defaultDependencies.createShortcutToken!)(db, user.uid), 201, noStoreHeaders(corsHeaders));
    }
    if (request.method === "DELETE" && url.pathname === "/integrations/shortcut/token") {
      await (dependencies.revokeShortcutToken ?? defaultDependencies.revokeShortcutToken!)(db, user.uid);
      return json({ ok: true }, 200, corsHeaders);
    }
    if (request.method === "POST" && url.pathname === "/shares") {
      return json(await (dependencies.createShare ?? defaultDependencies.createShare!)(db, user.uid, await readRequestJson(request)), 201, noStoreHeaders(corsHeaders));
    }
    const shareMatch = url.pathname.match(/^\/shares\/([^/]+)$/);
    if (shareMatch && request.method === "GET") {
      return json(await (dependencies.getShare ?? defaultDependencies.getShare!)(db, shareMatch[1]), 200, noStoreHeaders(corsHeaders));
    }
    const shareImportMatch = url.pathname.match(/^\/shares\/([^/]+)\/imports$/);
    if (shareImportMatch && request.method === "POST") {
      return json(await (dependencies.importShare ?? defaultDependencies.importShare!)(db, user.uid, shareImportMatch[1], await readRequestJson(request)), 201, noStoreHeaders(corsHeaders));
    }
    if (request.method === "POST" && url.pathname === "/items/preview") {
      return json(await dependencies.previewItem(await readRequestJson(request)), 200, corsHeaders);
    }
    if (request.method === "GET" && url.pathname === "/items") {
      return json({ items: await dependencies.listItems(db, user.uid) }, 200, corsHeaders);
    }
    if (request.method === "POST" && url.pathname === "/items") {
      return json(await dependencies.createItem(db, user.uid, await readRequestJson(request)), 201, corsHeaders);
    }
    if (request.method === "POST" && url.pathname === "/items/bulk-actions") {
      return json(await (dependencies.bulkItemAction ?? defaultDependencies.bulkItemAction!)(db, user.uid, await readRequestJson(request)), 200, corsHeaders);
    }
    const itemMatch = url.pathname.match(/^\/items\/([^/]+)$/);
    if (itemMatch && request.method === "PATCH") {
      return json(await (dependencies.updateItem ?? defaultDependencies.updateItem!)(db, user.uid, itemMatch[1], await readRequestJson(request)), 200, corsHeaders);
    }
    if (itemMatch && request.method === "DELETE") {
      return json(await (dependencies.deleteItem ?? defaultDependencies.deleteItem!)(db, user.uid, itemMatch[1]), 200, corsHeaders);
    }
    if (request.method === "GET" && url.pathname === "/categories") {
      return json({ categories: await (dependencies.listCategories ?? defaultDependencies.listCategories!)(db, user.uid) }, 200, corsHeaders);
    }
    if (request.method === "POST" && url.pathname === "/categories") {
      return json(await (dependencies.createCategory ?? defaultDependencies.createCategory!)(db, user.uid, await readRequestJson(request)), 201, corsHeaders);
    }
    const categoryItemsMatch = url.pathname.match(/^\/categories\/([^/]+)\/items$/);
    if (categoryItemsMatch && request.method === "GET") {
      return json({ items: await (dependencies.listCategoryItems ?? defaultDependencies.listCategoryItems!)(db, user.uid, categoryItemsMatch[1]) }, 200, corsHeaders);
    }
    const categoryMatch = url.pathname.match(/^\/categories\/([^/]+)$/);
    if (categoryMatch && request.method === "PATCH") {
      return json(await (dependencies.updateCategory ?? defaultDependencies.updateCategory!)(db, user.uid, categoryMatch[1], await readRequestJson(request)), 200, corsHeaders);
    }
    if (categoryMatch && request.method === "DELETE") {
      return json(await (dependencies.deleteCategory ?? defaultDependencies.deleteCategory!)(db, user.uid, categoryMatch[1]), 200, corsHeaders);
    }
    return json({ error: "not_found" }, 404, responseHeaders);
  } catch (error) {
    if (error instanceof CloudyHttpError) return json({ error: error.message }, error.status, responseHeaders);
    console.error(error);
    return json({ error: "internal_server_error" }, 500, responseHeaders);
  }
}

function buildCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173", "https://cloudy.isumi.com.br", ...parseAllowedOrigins(env.ALLOWED_ORIGIN)]);
  if (origin && allowedOrigins.has(origin)) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary", "Origin"); }
  headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Cloudy-Capture-Token");
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
function noStoreHeaders(headers: Headers): Headers {
  const next = new Headers(headers);
  next.set("Cache-Control", "no-store");
  return next;
}
