import type { Client } from "@libsql/client/web";
import { type DbRow, HttpError, readDbString } from "./shared";

const PREVIEW_TIMEOUT_MS = 5000;
const PREVIEW_BODY_LIMIT = 256 * 1024;

export interface ItemPreview {
  title: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
}

export interface ItemRecord {
  id: string;
  name: string;
  url: string;
  imageUrl: string | null;
  faviconUrl: string | null;
  observation: string | null;
  category: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemInput {
  name: string;
  url: string;
  categoryName: string;
  observation: string | null;
}

export async function listItems(db: Client, userId: string): Promise<ItemRecord[]> {
  const result = await db.execute({
    sql: `SELECT i.id, i.name, i.url, i.image_url, i.favicon_url, i.observation,
      i.created_at, i.updated_at, c.id AS category_id, c.name AS category_name
      FROM items i
      INNER JOIN categories c ON c.id = i.category_id AND c.user_id = i.user_id
      WHERE i.user_id = ?
      ORDER BY i.created_at DESC, i.id DESC`,
    args: [userId]
  });
  return result.rows.map(mapItemRow);
}

export async function createItem(db: Client, userId: string, payload: unknown): Promise<ItemRecord> {
  const input = parseCreateItemInput(payload);
  const preview = await resolveLinkPreview(input.url);
  const category = await findOrCreateCategory(db, userId, input.categoryName);
  const itemId = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO items (id, user_id, category_id, name, url, image_url, favicon_url, observation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [itemId, userId, category.id, input.name, input.url, preview.imageUrl, preview.faviconUrl, input.observation]
  });

  const result = await db.execute({
    sql: `SELECT i.id, i.name, i.url, i.image_url, i.favicon_url, i.observation,
      i.created_at, i.updated_at, c.id AS category_id, c.name AS category_name
      FROM items i
      INNER JOIN categories c ON c.id = i.category_id AND c.user_id = i.user_id
      WHERE i.id = ? AND i.user_id = ?
      LIMIT 1`,
    args: [itemId, userId]
  });
  const row = result.rows[0] as DbRow | undefined;
  if (!row) throw new HttpError(500, "item_created_but_not_found");
  return mapItemRow(row);
}

export async function previewItem(payload: unknown): Promise<ItemPreview> {
  const source = readObject(payload);
  const url = readUrl(source.url);
  return resolveLinkPreview(url);
}

export async function resolveLinkPreview(sourceUrl: string): Promise<ItemPreview> {
  const parsedUrl = parseHttpUrl(sourceUrl);
  const fallbackTitle = parsedUrl.hostname.replace(/^www\./i, "") || null;
  const fallbackFavicon = new URL("/favicon.ico", parsedUrl).toString();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);

  try {
    const response = await fetch(parsedUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "CloudyLinkPreview/1.0"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok || !isHtmlResponse(response)) return { title: fallbackTitle, imageUrl: null, faviconUrl: fallbackFavicon };

    const html = await readLimitedText(response.body, PREVIEW_BODY_LIMIT);
    const baseUrl = response.url || parsedUrl.toString();
    const title = extractTitle(html) || fallbackTitle;
    const imageUrl = resolveAssetUrl(firstMetaValue(html, ["og:image", "twitter:image", "twitter:image:src"]) || findImageSource(html), baseUrl);
    const faviconUrl = resolveAssetUrl(findFaviconSource(html), baseUrl) || new URL("/favicon.ico", baseUrl).toString();
    return { title, imageUrl, faviconUrl };
  } catch {
    return { title: fallbackTitle, imageUrl: null, faviconUrl: fallbackFavicon };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function parseCreateItemInput(payload: unknown): CreateItemInput {
  const source = readObject(payload);
  const name = normalizeText(readRequiredString(source.name, "name"));
  const url = readUrl(source.url);
  const categoryName = normalizeText(readRequiredString(source.categoryName, "categoryName"));
  const observation = source.observation == null ? null : normalizeText(readRequiredString(source.observation, "observation")) || null;

  if (name.length < 1 || name.length > 120) throw new HttpError(400, "invalid_item_name");
  if (categoryName.length < 1 || categoryName.length > 60) throw new HttpError(400, "invalid_category_name");
  if (observation && observation.length > 2000) throw new HttpError(400, "invalid_item_observation");
  return { name, url, categoryName, observation };
}

function readObject(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new HttpError(400, "invalid_json");
  return payload as Record<string, unknown>;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new HttpError(400, `invalid_${field}`);
  return value;
}

function readUrl(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "invalid_url");
  const trimmed = value.trim();
  parseHttpUrl(trimmed);
  return trimmed;
}

function parseHttpUrl(value: string): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new HttpError(400, "invalid_url"); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new HttpError(400, "invalid_url");
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname.toLowerCase())) throw new HttpError(400, "invalid_url");
  return parsed;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeCategoryName(value: string): string {
  return normalizeText(value).toLowerCase();
}

async function findOrCreateCategory(db: Client, userId: string, name: string): Promise<{ id: string; name: string }> {
  const normalizedName = normalizeCategoryName(name);
  const existing = await db.execute({
    sql: "SELECT id, name FROM categories WHERE user_id = ? AND normalized_name = ? LIMIT 1",
    args: [userId, normalizedName]
  });
  const existingRow = existing.rows[0] as DbRow | undefined;
  if (existingRow) return { id: readDbString(existingRow, "id"), name: readDbString(existingRow, "name") };

  await db.execute({
    sql: `INSERT INTO categories (id, user_id, name, normalized_name)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, normalized_name) DO NOTHING`,
    args: [crypto.randomUUID(), userId, name, normalizedName]
  });

  const created = await db.execute({
    sql: "SELECT id, name FROM categories WHERE user_id = ? AND normalized_name = ? LIMIT 1",
    args: [userId, normalizedName]
  });
  const row = created.rows[0] as DbRow | undefined;
  if (!row) throw new HttpError(500, "category_creation_failed");
  return { id: readDbString(row, "id"), name: readDbString(row, "name") };
}

function mapItemRow(row: DbRow): ItemRecord {
  return {
    id: readDbString(row, "id"),
    name: readDbString(row, "name"),
    url: readDbString(row, "url"),
    imageUrl: readNullableString(row, "image_url"),
    faviconUrl: readNullableString(row, "favicon_url"),
    observation: readNullableString(row, "observation"),
    category: { id: readDbString(row, "category_id"), name: readDbString(row, "category_name") },
    createdAt: readDbString(row, "created_at"),
    updatedAt: readDbString(row, "updated_at")
  };
}

function readNullableString(row: DbRow, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value !== "string") throw new HttpError(500, `invalid_db_${key}`);
  return value;
}

function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  return contentType.includes("text/html") || contentType.includes("application/xhtml+xml");
}

async function readLimitedText(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      text += decoder.decode();
      break;
    }
    const remaining = limit - bytesRead;
    if (remaining <= 0) {
      await reader.cancel();
      break;
    }
    const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    bytesRead += chunk.byteLength;
    text += decoder.decode(chunk, { stream: bytesRead < limit });
    if (bytesRead >= limit) {
      await reader.cancel();
      break;
    }
  }
  return text;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1]).trim().replace(/\s+/g, " ").slice(0, 160) || null : null;
}

function firstMetaValue(html: string, names: string[]): string | null {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const name = readAttribute(tag, "property") || readAttribute(tag, "name");
    if (name && wanted.has(name.toLowerCase())) {
      const content = readAttribute(tag, "content");
      if (content) return decodeHtml(content).trim();
    }
  }
  return null;
}

function findImageSource(html: string): string | null {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = readAttribute(tag, "rel")?.toLowerCase() || "";
    if (rel.split(/\s+/).includes("image_src")) return readAttribute(tag, "href");
  }
  return null;
}

function findFaviconSource(html: string): string | null {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = readAttribute(tag, "rel")?.toLowerCase() || "";
    if (rel.split(/\s+/).some((value) => value === "icon" || value === "shortcut" || value === "apple-touch-icon" || value === "apple-touch-icon-precomposed")) {
      const href = readAttribute(tag, "href");
      if (href) return decodeHtml(href).trim();
    }
  }
  return null;
}

function readAttribute(tag: string, attribute: string): string | null {
  const match = tag.match(new RegExp(`${attribute}\\s*=\\s*([\\"'])(.*?)\\1`, "i"));
  return match?.[2] || null;
}

function resolveAssetUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const resolved = new URL(value, baseUrl);
    return ['http:', 'https:'].includes(resolved.protocol) ? resolved.toString() : null;
  } catch {
    return null;
  }
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ");
}
