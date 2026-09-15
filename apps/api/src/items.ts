import type { Client } from "@libsql/client/web";
import { type DbRow, HttpError, readDbString } from "./shared";

const PREVIEW_TIMEOUT_MS = 5000;
const PREVIEW_BODY_LIMIT = 256 * 1024;
const MAX_CATEGORIES_PER_USER = 15;
export const MAX_ITEMS_PER_CATEGORY = 100;
const MAX_ITEM_NAME_LENGTH = 24;
const MAX_CATEGORY_NAME_LENGTH = 12;
const MAX_ITEM_URL_LENGTH = 2048;
const MAX_ITEM_OBSERVATION_LENGTH = 120;
const DEFAULT_CATEGORY_COLOR = "#38BDF8";
export const UNTAGGED_CATEGORY_ID = "__untagged__";
export const INTEGRATIONS_CATEGORY_ID = "__integrations__";
const INTEGRATIONS_CATEGORY_NAME = "Integrações";
const CATEGORY_COLORS = new Set([
  "#38BDF8",
  "#A78BFA",
  "#FB7185",
  "#FBBF24",
  "#4ADE80",
  "#FB923C",
  "#818CF8",
  "#A3E635"
]);

export interface ItemPreview {
  title: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
}

export interface ItemRecord {
  id: string;
  name: string;
  url: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  observation: string | null;
  category: { id: string; name: string; color: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  color: string;
  itemCount: number;
  recentItems: CategoryRecentItem[];
  isVirtual?: boolean;
  isSystem?: boolean;
}

export interface CategoryRecentItem {
  id: string;
  name: string;
  imageUrl: string | null;
  faviconUrl: string | null;
  createdAt: string;
}

export interface CreateItemInput {
  name: string;
  url: string | null;
  categoryName: string | null;
  categoryColor: string;
  observation: string | null;
}

export interface UpdateItemInput {
  name: string;
  url: string | null;
  categoryId: string | null;
  observation: string | null;
}

export interface CategoryInput {
  name: string;
  color: string;
}

export type BulkItemActionInput =
  | { action: "move"; itemIds: string[]; sourceCategoryId: string; categoryId: string | null }
  | { action: "delete"; itemIds: string[]; sourceCategoryId: string };

export interface BulkItemActionResult {
  items: ItemRecord[];
  deletedIds: string[];
  categories: CategoryRecord[];
}

export async function listCategories(db: Client, userId: string): Promise<CategoryRecord[]> {
  const result = await db.execute({
    sql: `SELECT c.id, c.name, c.color, COUNT(i.id) AS item_count
      FROM categories c
      LEFT JOIN items i ON i.category_id = c.id AND i.user_id = c.user_id
      WHERE c.user_id = ?
      GROUP BY c.id, c.name, c.color
      ORDER BY c.name COLLATE NOCASE ASC`,
    args: [userId]
  });
  const recentItems = await listRecentItemsByCategory(db, userId);
  const categories = result.rows.map((row) => {
    const category = mapCategoryRow(row);
    return { ...category, recentItems: recentItems.get(category.id) ?? [] };
  });

  const untaggedCountResult = await db.execute({
    sql: "SELECT COUNT(*) AS item_count FROM items WHERE user_id = ? AND category_id IS NULL AND system_category IS NULL",
    args: [userId]
  });
  const untaggedCount = readOptionalDbCount(untaggedCountResult.rows[0], "item_count");
  if (untaggedCount > 0) {
    categories.push({
      id: UNTAGGED_CATEGORY_ID,
      name: "Vazio",
      color: "#CBD5E1",
      itemCount: untaggedCount,
      recentItems: recentItems.get(UNTAGGED_CATEGORY_ID) ?? [],
      isVirtual: true
    });
  }
  const integrationsCountResult = await db.execute({
    sql: "SELECT COUNT(*) AS item_count FROM items WHERE user_id = ? AND system_category = 'integrations'",
    args: [userId]
  });
  categories.push({
    id: INTEGRATIONS_CATEGORY_ID,
    name: INTEGRATIONS_CATEGORY_NAME,
    color: DEFAULT_CATEGORY_COLOR,
    itemCount: readOptionalDbCount(integrationsCountResult.rows[0], "item_count"),
    recentItems: recentItems.get(INTEGRATIONS_CATEGORY_ID) ?? [],
    isSystem: true
  });
  return categories;
}

export async function createCategory(db: Client, userId: string, payload: unknown): Promise<CategoryRecord> {
  const input = parseCategoryInput(payload);
  const normalizedName = normalizeCategoryName(input.name);
  if (normalizedName === normalizeCategoryName(INTEGRATIONS_CATEGORY_NAME)) throw new HttpError(400, "category_reserved");
  const existing = await db.execute({
    sql: "SELECT id FROM categories WHERE user_id = ? AND normalized_name = ? LIMIT 1",
    args: [userId, normalizedName]
  });
  if (existing.rows.length > 0) throw new HttpError(400, "category_name_taken");

  const categoryCount = await db.execute({
    sql: "SELECT COUNT(*) AS category_count FROM categories WHERE user_id = ?",
    args: [userId]
  });
  if (readDbCount(categoryCount.rows[0], "category_count") >= MAX_CATEGORIES_PER_USER) {
    throw new HttpError(400, "category_limit_reached");
  }

  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO categories (id, user_id, name, normalized_name, color)
      VALUES (?, ?, ?, ?, ?)`,
    args: [id, userId, input.name, normalizedName, input.color]
  });
  return getCategory(db, userId, id);
}

export async function updateCategory(db: Client, userId: string, categoryId: string, payload: unknown): Promise<CategoryRecord> {
  if (categoryId === INTEGRATIONS_CATEGORY_ID) throw new HttpError(403, "system_category");
  const input = parseCategoryInput(payload);
  const normalizedName = normalizeCategoryName(input.name);
  const current = await db.execute({
    sql: "SELECT id FROM categories WHERE id = ? AND user_id = ? LIMIT 1",
    args: [categoryId, userId]
  });
  if (current.rows.length === 0) throw new HttpError(404, "category_not_found");

  const duplicate = await db.execute({
    sql: "SELECT id FROM categories WHERE user_id = ? AND normalized_name = ? AND id <> ? LIMIT 1",
    args: [userId, normalizedName, categoryId]
  });
  if (duplicate.rows.length > 0) throw new HttpError(400, "category_name_taken");

  await db.execute({
    sql: `UPDATE categories
      SET name = ?, normalized_name = ?, color = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    args: [input.name, normalizedName, input.color, categoryId, userId]
  });
  return getCategory(db, userId, categoryId);
}

export async function deleteCategory(db: Client, userId: string, categoryId: string): Promise<{ id: string }> {
  if (categoryId === INTEGRATIONS_CATEGORY_ID) throw new HttpError(403, "system_category");
  const result = await db.execute({
    sql: "SELECT id FROM categories WHERE id = ? AND user_id = ? LIMIT 1",
    args: [categoryId, userId]
  });
  const row = result.rows[0] as DbRow | undefined;
  if (!row) throw new HttpError(404, "category_not_found");

  const itemCount = await db.execute({
    sql: "SELECT COUNT(*) AS item_count FROM items WHERE user_id = ? AND category_id = ?",
    args: [userId, categoryId]
  });
  if (readOptionalDbCount(itemCount.rows[0], "item_count") > 0) throw new HttpError(400, "category_has_items");

  await db.execute({
    sql: "DELETE FROM categories WHERE id = ? AND user_id = ?",
    args: [categoryId, userId]
  });
  return { id: categoryId };
}

export async function listItems(db: Client, userId: string): Promise<ItemRecord[]> {
  const result = await db.execute({
    sql: `SELECT i.id, i.name, i.url, i.image_url, i.favicon_url, i.observation, i.system_category,
      i.created_at, i.updated_at, c.id AS category_id, c.name AS category_name, c.color AS category_color
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id AND c.user_id = i.user_id
      WHERE i.user_id = ?
      ORDER BY i.created_at DESC, i.id DESC`,
    args: [userId]
  });
  return result.rows.map(mapItemRow);
}

export async function listCategoryItems(db: Client, userId: string, categoryId: string): Promise<ItemRecord[]> {
  if (categoryId !== UNTAGGED_CATEGORY_ID && categoryId !== INTEGRATIONS_CATEGORY_ID) {
    const category = await db.execute({
      sql: "SELECT id FROM categories WHERE id = ? AND user_id = ? LIMIT 1",
      args: [categoryId, userId]
    });
    if (category.rows.length === 0) throw new HttpError(404, "category_not_found");
  }

  const filter = categoryId === UNTAGGED_CATEGORY_ID ? "i.category_id IS NULL AND i.system_category IS NULL" : categoryId === INTEGRATIONS_CATEGORY_ID ? "i.system_category = 'integrations'" : "i.category_id = ?";
  const args = categoryId === UNTAGGED_CATEGORY_ID || categoryId === INTEGRATIONS_CATEGORY_ID ? [userId] : [userId, categoryId];
  const result = await db.execute({
    sql: `SELECT i.id, i.name, i.url, i.image_url, i.favicon_url, i.observation, i.system_category,
      i.created_at, i.updated_at, c.id AS category_id, c.name AS category_name, c.color AS category_color
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id AND c.user_id = i.user_id
      WHERE i.user_id = ? AND ${filter}
      ORDER BY i.created_at DESC, i.id DESC`,
    args
  });
  return result.rows.map(mapItemRow);
}

export async function createItem(db: Client, userId: string, payload: unknown): Promise<ItemRecord> {
  const input = parseCreateItemInput(payload);
  const category = input.categoryName ? await findOrCreateCategory(db, userId, input.categoryName, input.categoryColor) : null;
  await ensureCategoryItemCapacity(db, userId, category?.id ?? null);
  const preview = input.url ? await resolveLinkPreview(input.url) : { title: null, imageUrl: null, faviconUrl: null };
  const itemId = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO items (id, user_id, category_id, system_category, name, url, image_url, favicon_url, observation)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    args: [itemId, userId, category?.id ?? null, input.name, input.url, preview.imageUrl, preview.faviconUrl, input.observation]
  });

  const result = await db.execute({
    sql: `SELECT i.id, i.name, i.url, i.image_url, i.favicon_url, i.observation, i.system_category,
      i.created_at, i.updated_at, c.id AS category_id, c.name AS category_name, c.color AS category_color
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id AND c.user_id = i.user_id
      WHERE i.id = ? AND i.user_id = ?
      LIMIT 1`,
    args: [itemId, userId]
  });
  const row = result.rows[0] as DbRow | undefined;
  if (!row) throw new HttpError(500, "item_created_but_not_found");
  return mapItemRow(row);
}

export async function updateItem(db: Client, userId: string, itemId: string, payload: unknown): Promise<ItemRecord> {
  const input = parseUpdateItemInput(payload);
  const currentResult = await db.execute({
    sql: `SELECT i.id, i.name, i.url, i.image_url, i.favicon_url, i.observation, i.system_category,
      i.created_at, i.updated_at, c.id AS category_id, c.name AS category_name, c.color AS category_color
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id AND c.user_id = i.user_id
      WHERE i.id = ? AND i.user_id = ?
      LIMIT 1`,
    args: [itemId, userId]
  });
  const currentRow = currentResult.rows[0] as DbRow | undefined;
  if (!currentRow) throw new HttpError(404, "item_not_found");

  const currentItem = mapItemRow(currentRow);
  const currentCategoryId = currentItem.category?.id ?? null;
  let nextCategoryId: string | null = null;
  let nextSystemCategory: "integrations" | null = null;

  if (input.categoryId === INTEGRATIONS_CATEGORY_ID) {
    if (currentCategoryId !== INTEGRATIONS_CATEGORY_ID) throw new HttpError(403, "system_category");
    nextSystemCategory = "integrations";
  } else if (input.categoryId) {
    const category = await db.execute({
      sql: "SELECT id FROM categories WHERE id = ? AND user_id = ? LIMIT 1",
      args: [input.categoryId, userId]
    });
    if (category.rows.length === 0) throw new HttpError(404, "category_not_found");
    nextCategoryId = input.categoryId;
  }

  const nextGroupId = nextSystemCategory ? INTEGRATIONS_CATEGORY_ID : nextCategoryId;
  if (currentCategoryId !== nextGroupId) await ensureCategoryItemCapacity(db, userId, nextCategoryId);

  const preview = input.url === currentItem.url
    ? { imageUrl: currentItem.imageUrl, faviconUrl: currentItem.faviconUrl }
    : input.url
      ? await resolveLinkPreview(input.url)
      : { imageUrl: null, faviconUrl: null };

  await db.execute({
    sql: `UPDATE items
      SET category_id = ?, system_category = ?, name = ?, url = ?, image_url = ?, favicon_url = ?, observation = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    args: [nextCategoryId, nextSystemCategory, input.name, input.url, preview.imageUrl, preview.faviconUrl, input.observation, itemId, userId]
  });

  return getItem(db, userId, itemId);
}

export async function deleteItem(db: Client, userId: string, itemId: string): Promise<{ id: string }> {
  const current = await db.execute({
    sql: "SELECT id FROM items WHERE id = ? AND user_id = ? LIMIT 1",
    args: [itemId, userId]
  });
  if (current.rows.length === 0) throw new HttpError(404, "item_not_found");

  await db.execute({
    sql: "DELETE FROM items WHERE id = ? AND user_id = ?",
    args: [itemId, userId]
  });
  return { id: itemId };
}

export async function bulkItemAction(db: Client, userId: string, payload: unknown): Promise<BulkItemActionResult> {
  const input = parseBulkItemActionInput(payload);
  const transaction = await db.transaction("write");
  try {
    const placeholders = input.itemIds.map(() => "?").join(", ");
    const currentResult = await transaction.execute({
      sql: `SELECT id, category_id, system_category FROM items WHERE user_id = ? AND id IN (${placeholders})`,
      args: [userId, ...input.itemIds]
    });
    const rows = currentResult.rows as DbRow[];
    if (rows.length !== input.itemIds.length) throw new HttpError(404, "item_not_found");
    const sourceIds = new Set(rows.map((row) => readNullableString(row, "system_category") === "integrations" ? INTEGRATIONS_CATEGORY_ID : readNullableString(row, "category_id") ?? UNTAGGED_CATEGORY_ID));
    if (sourceIds.size !== 1 || !sourceIds.has(input.sourceCategoryId)) throw new HttpError(409, "items_changed");

    if (input.action === "delete") {
      await transaction.execute({ sql: `DELETE FROM items WHERE user_id = ? AND id IN (${placeholders})`, args: [userId, ...input.itemIds] });
    } else {
      if (input.categoryId === INTEGRATIONS_CATEGORY_ID) throw new HttpError(403, "system_category");
      const destinationCategoryId = input.categoryId;
      if (destinationCategoryId) {
        const category = await transaction.execute({ sql: "SELECT id FROM categories WHERE id = ? AND user_id = ? LIMIT 1", args: [destinationCategoryId, userId] });
        if (category.rows.length === 0) throw new HttpError(404, "category_not_found");
      }
      const countResult = await transaction.execute({
        sql: destinationCategoryId
          ? "SELECT COUNT(*) AS item_count FROM items WHERE user_id = ? AND category_id = ?"
          : "SELECT COUNT(*) AS item_count FROM items WHERE user_id = ? AND category_id IS NULL AND system_category IS NULL",
        args: destinationCategoryId ? [userId, destinationCategoryId] : [userId]
      });
      if (readDbCount(countResult.rows[0], "item_count") + input.itemIds.length > MAX_ITEMS_PER_CATEGORY) throw new HttpError(400, "category_item_limit_reached");
      await transaction.execute({
        sql: `UPDATE items SET category_id = ?, system_category = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id IN (${placeholders})`,
        args: [destinationCategoryId, userId, ...input.itemIds]
      });
    }
    await transaction.commit();
  } finally {
    transaction.close();
  }

  const allItems = input.action === "move" ? await listItems(db, userId) : [];
  return { items: allItems.filter((item) => input.itemIds.includes(item.id)), deletedIds: input.action === "delete" ? input.itemIds : [], categories: await listCategories(db, userId) };
}

export interface IntegrationItemInput {
  url: string;
  text: string | null;
}

export interface IntegrationItemResult {
  item: ItemRecord;
  duplicate: boolean;
}

export async function createIntegrationItem(db: Client, userId: string, payload: unknown): Promise<IntegrationItemResult> {
  const input = parseIntegrationItemInput(payload);
  const existing = await db.execute({
    sql: `SELECT i.id, i.name, i.url, i.image_url, i.favicon_url, i.observation, i.system_category,
      i.created_at, i.updated_at, c.id AS category_id, c.name AS category_name, c.color AS category_color
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id AND c.user_id = i.user_id
      WHERE i.user_id = ? AND i.system_category = 'integrations' AND i.url = ?
      LIMIT 1`,
    args: [userId, input.url]
  });
  const existingRow = existing.rows[0] as DbRow | undefined;
  if (existingRow) {
    const existingItem = mapItemRow(existingRow);
    if (existingItem.imageUrl === null || existingItem.faviconUrl === null) {
      const preview = await resolveLinkPreview(input.url);
      await db.execute({
        sql: `UPDATE items
          SET image_url = COALESCE(image_url, ?), favicon_url = COALESCE(favicon_url, ?), updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?`,
        args: [preview.imageUrl, preview.faviconUrl, existingItem.id, userId]
      });
      return {
        item: {
          ...existingItem,
          imageUrl: existingItem.imageUrl ?? preview.imageUrl,
          faviconUrl: existingItem.faviconUrl ?? preview.faviconUrl
        },
        duplicate: true
      };
    }
    return { item: existingItem, duplicate: true };
  }

  const preview = await resolveLinkPreview(input.url);
  const itemId = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO items (id, user_id, category_id, system_category, name, url, image_url, favicon_url, observation)
      VALUES (?, ?, NULL, 'integrations', ?, ?, ?, ?, ?)`,
    args: [itemId, userId, deriveIntegrationItemName(input.text, preview.title, input.url), input.url, preview.imageUrl, preview.faviconUrl, input.text]
  });
  const result = await db.execute({
    sql: `SELECT i.id, i.name, i.url, i.image_url, i.favicon_url, i.observation, i.system_category,
      i.created_at, i.updated_at, c.id AS category_id, c.name AS category_name, c.color AS category_color
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id AND c.user_id = i.user_id
      WHERE i.id = ? AND i.user_id = ?
      LIMIT 1`,
    args: [itemId, userId]
  });
  const row = result.rows[0] as DbRow | undefined;
  if (!row) throw new HttpError(500, "item_created_but_not_found");
  return { item: mapItemRow(row), duplicate: false };
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
  const url = readOptionalUrl(source.url);
  const categoryName = source.categoryName == null ? null : normalizeText(readRequiredString(source.categoryName, "categoryName")) || null;
  const categoryColor = categoryName ? readCategoryColor(source.categoryColor) : DEFAULT_CATEGORY_COLOR;
  const observation = source.observation == null ? null : normalizeText(readRequiredString(source.observation, "observation")) || null;

  if (name.length < 1 || name.length > MAX_ITEM_NAME_LENGTH) throw new HttpError(400, "invalid_item_name");
  if (categoryName && categoryName.length > MAX_CATEGORY_NAME_LENGTH) throw new HttpError(400, "invalid_category_name");
  if (observation && observation.length > MAX_ITEM_OBSERVATION_LENGTH) throw new HttpError(400, "invalid_item_observation");
  return { name, url, categoryName, categoryColor, observation };
}

export function parseUpdateItemInput(payload: unknown): UpdateItemInput {
  const source = readObject(payload);
  if (!("url" in source)) throw new HttpError(400, "invalid_url");
  if (!("observation" in source)) throw new HttpError(400, "invalid_item_observation");
  if (!("categoryId" in source)) throw new HttpError(400, "invalid_category_id");

  const name = normalizeText(readRequiredString(source.name, "item_name"));
  const url = readOptionalUrl(source.url);
  const observation = source.observation == null ? null : normalizeText(readRequiredString(source.observation, "item_observation")) || null;
  const categoryId = source.categoryId == null ? null : normalizeText(readRequiredString(source.categoryId, "category_id"));

  if (name.length < 1 || name.length > MAX_ITEM_NAME_LENGTH) throw new HttpError(400, "invalid_item_name");
  if (observation && observation.length > MAX_ITEM_OBSERVATION_LENGTH) throw new HttpError(400, "invalid_item_observation");
  if (categoryId === "") throw new HttpError(400, "invalid_category_id");
  return { name, url, categoryId, observation };
}

export function parseIntegrationItemInput(payload: unknown): IntegrationItemInput {
  const source = readObject(payload);
  const url = readUrl(source.url);
  const text = source.text == null ? null : normalizeText(readRequiredString(source.text, "text")).slice(0, MAX_ITEM_OBSERVATION_LENGTH) || null;
  return { url, text };
}

export function parseCategoryInput(payload: unknown): CategoryInput {
  const source = readObject(payload);
  const name = normalizeText(readRequiredString(source.name, "category_name"));
  const color = readCategoryColor(source.color);
  if (name.length < 1 || name.length > MAX_CATEGORY_NAME_LENGTH) throw new HttpError(400, "invalid_category_name");
  return { name, color };
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

function readOptionalUrl(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new HttpError(400, "invalid_url");
  const trimmed = value.trim();
  if (!trimmed) return null;
  parseHttpUrl(trimmed);
  return trimmed;
}

function parseHttpUrl(value: string): URL {
  if (value.length > MAX_ITEM_URL_LENGTH) throw new HttpError(400, "invalid_url_length");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new HttpError(400, "invalid_url"); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new HttpError(400, "invalid_url");
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname.toLowerCase())) throw new HttpError(400, "invalid_url");
  return parsed;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function deriveIntegrationItemName(text: string | null, previewTitle: string | null, url: string): string {
  const textName = text?.replace(/https?:\/\/\S+/gi, "").trim();
  const source = textName || previewTitle || new URL(url).hostname.replace(/^www\./i, "") || "Integração";
  const normalized = normalizeText(source);
  return Array.from(normalized).slice(0, MAX_ITEM_NAME_LENGTH).join("") || "Integração";
}

function normalizeCategoryName(value: string): string {
  return normalizeText(value).toLowerCase();
}

async function findOrCreateCategory(db: Client, userId: string, name: string, color: string): Promise<{ id: string; name: string; color: string }> {
  const normalizedName = normalizeCategoryName(name);
  const existing = await db.execute({
    sql: "SELECT id, name, color FROM categories WHERE user_id = ? AND normalized_name = ? LIMIT 1",
    args: [userId, normalizedName]
  });
  const existingRow = existing.rows[0] as DbRow | undefined;
  if (existingRow) {
    const id = readDbString(existingRow, "id");
    await db.execute({
      sql: "UPDATE categories SET color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
      args: [color, id, userId]
    });
    return { id, name: readDbString(existingRow, "name"), color };
  }

  const categoryCount = await db.execute({
    sql: "SELECT COUNT(*) AS category_count FROM categories WHERE user_id = ?",
    args: [userId]
  });
  if (readDbCount(categoryCount.rows[0], "category_count") >= MAX_CATEGORIES_PER_USER) {
    throw new HttpError(400, "category_limit_reached");
  }

  await db.execute({
    sql: `INSERT INTO categories (id, user_id, name, normalized_name, color)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, normalized_name) DO NOTHING`,
    args: [crypto.randomUUID(), userId, name, normalizedName, color]
  });

  const created = await db.execute({
    sql: "SELECT id, name, color FROM categories WHERE user_id = ? AND normalized_name = ? LIMIT 1",
    args: [userId, normalizedName]
  });
  const row = created.rows[0] as DbRow | undefined;
  if (!row) throw new HttpError(500, "category_creation_failed");
  return { id: readDbString(row, "id"), name: readDbString(row, "name"), color: readCategoryColor(row.color) };
}

async function getCategory(db: Client, userId: string, categoryId: string): Promise<CategoryRecord> {
  const result = await db.execute({
    sql: `SELECT c.id, c.name, c.color, COUNT(i.id) AS item_count
      FROM categories c
      LEFT JOIN items i ON i.category_id = c.id AND i.user_id = c.user_id
      WHERE c.id = ? AND c.user_id = ?
      GROUP BY c.id, c.name, c.color
      LIMIT 1`,
    args: [categoryId, userId]
  });
  const row = result.rows[0] as DbRow | undefined;
  if (!row) throw new HttpError(404, "category_not_found");
  const category = mapCategoryRow(row);
  return { ...category, recentItems: (await listRecentItemsForCategory(db, userId, categoryId)) };
}

export function parseBulkItemActionInput(payload: unknown): BulkItemActionInput {
  const source = readObject(payload);
  const action = source.action;
  if (action !== "move" && action !== "delete") throw new HttpError(400, "invalid_bulk_action");
  if (!Array.isArray(source.itemIds) || source.itemIds.length < 1 || source.itemIds.length > MAX_ITEMS_PER_CATEGORY) throw new HttpError(400, "invalid_item_ids");
  const itemIds = source.itemIds.map((value) => normalizeText(readRequiredString(value, "item_id")));
  if (itemIds.some((value) => !value) || new Set(itemIds).size !== itemIds.length) throw new HttpError(400, "invalid_item_ids");
  const sourceCategoryId = normalizeText(readRequiredString(source.sourceCategoryId, "source_category_id"));
  if (!sourceCategoryId) throw new HttpError(400, "invalid_source_category_id");
  if (action === "delete") return { action, itemIds, sourceCategoryId };
  const categoryId = source.categoryId == null ? null : normalizeText(readRequiredString(source.categoryId, "category_id"));
  if (categoryId === "") throw new HttpError(400, "invalid_category_id");
  return { action, itemIds, sourceCategoryId, categoryId };
}

async function getItem(db: Client, userId: string, itemId: string): Promise<ItemRecord> {
  const result = await db.execute({
    sql: `SELECT i.id, i.name, i.url, i.image_url, i.favicon_url, i.observation, i.system_category,
      i.created_at, i.updated_at, c.id AS category_id, c.name AS category_name, c.color AS category_color
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id AND c.user_id = i.user_id
      WHERE i.id = ? AND i.user_id = ?
      LIMIT 1`,
    args: [itemId, userId]
  });
  const row = result.rows[0] as DbRow | undefined;
  if (!row) throw new HttpError(404, "item_not_found");
  return mapItemRow(row);
}

async function ensureCategoryItemCapacity(db: Client, userId: string, categoryId: string | null): Promise<void> {
  const isUntagged = categoryId === null;
  const itemCount = await db.execute({
    sql: isUntagged
      ? "SELECT COUNT(*) AS item_count FROM items WHERE user_id = ? AND category_id IS NULL AND system_category IS NULL"
      : "SELECT COUNT(*) AS item_count FROM items WHERE user_id = ? AND category_id = ?",
    args: isUntagged ? [userId] : [userId, categoryId]
  });
  if (readDbCount(itemCount.rows[0], "item_count") >= MAX_ITEMS_PER_CATEGORY) {
    throw new HttpError(400, "category_item_limit_reached");
  }
}

function mapItemRow(row: DbRow): ItemRecord {
  const systemCategory = readNullableString(row, "system_category");
  const categoryId = readNullableString(row, "category_id");
  const categoryName = readNullableString(row, "category_name");
  return {
    id: readDbString(row, "id"),
    name: readDbString(row, "name"),
    url: readNullableString(row, "url"),
    imageUrl: readNullableString(row, "image_url"),
    faviconUrl: readNullableString(row, "favicon_url"),
    observation: readNullableString(row, "observation"),
    category: systemCategory === "integrations" ? { id: INTEGRATIONS_CATEGORY_ID, name: INTEGRATIONS_CATEGORY_NAME, color: DEFAULT_CATEGORY_COLOR } : categoryId && categoryName ? { id: categoryId, name: categoryName, color: readCategoryColor(row.category_color) } : null,
    createdAt: readDbString(row, "created_at"),
    updatedAt: readDbString(row, "updated_at")
  };
}

function mapCategoryRow(row: DbRow): CategoryRecord {
  return {
    id: readDbString(row, "id"),
    name: readDbString(row, "name"),
    color: readCategoryColor(row.color),
    itemCount: readDbCount(row, "item_count"),
    recentItems: []
  };
}

async function listRecentItemsByCategory(db: Client, userId: string): Promise<Map<string, CategoryRecentItem[]>> {
  const result = await db.execute({
    sql: `WITH ranked_items AS (
      SELECT i.id, i.name, i.image_url, i.favicon_url, i.created_at, i.category_id, i.system_category,
        ROW_NUMBER() OVER (PARTITION BY COALESCE(i.system_category, i.category_id) ORDER BY i.created_at DESC, i.id DESC) AS item_rank
      FROM items i
      WHERE i.user_id = ?
    )
    SELECT id, name, image_url, favicon_url, created_at, category_id, system_category
    FROM ranked_items
    WHERE item_rank <= 5
    ORDER BY category_id, created_at DESC, id DESC`,
    args: [userId]
  });
  const grouped = new Map<string, CategoryRecentItem[]>();
  for (const row of result.rows as DbRow[]) {
    const categoryId = readNullableString(row, "system_category") === "integrations" ? INTEGRATIONS_CATEGORY_ID : readNullableString(row, "category_id") ?? UNTAGGED_CATEGORY_ID;
    const items = grouped.get(categoryId) ?? [];
    items.push(mapCategoryRecentItem(row));
    grouped.set(categoryId, items);
  }
  return grouped;
}

async function listRecentItemsForCategory(db: Client, userId: string, categoryId: string): Promise<CategoryRecentItem[]> {
  if (categoryId === INTEGRATIONS_CATEGORY_ID) {
    const result = await db.execute({
      sql: `SELECT i.id, i.name, i.image_url, i.favicon_url, i.created_at
        FROM items i
        WHERE i.user_id = ? AND i.system_category = 'integrations'
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT 5`,
      args: [userId]
    });
    return (result.rows as DbRow[]).map(mapCategoryRecentItem);
  }
  const result = await db.execute({
    sql: `SELECT i.id, i.name, i.image_url, i.favicon_url, i.created_at
      FROM items i
      WHERE i.user_id = ? AND i.category_id = ?
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT 5`,
    args: [userId, categoryId]
  });
  return (result.rows as DbRow[]).map(mapCategoryRecentItem);
}

function mapCategoryRecentItem(row: DbRow): CategoryRecentItem {
  return {
    id: readDbString(row, "id"),
    name: readDbString(row, "name"),
    imageUrl: readNullableString(row, "image_url"),
    faviconUrl: readNullableString(row, "favicon_url"),
    createdAt: readDbString(row, "created_at")
  };
}

function readCategoryColor(value: unknown): string {
  if (typeof value !== "string" || !CATEGORY_COLORS.has(value)) {
    if (value == null) return DEFAULT_CATEGORY_COLOR;
    throw new HttpError(400, "invalid_category_color");
  }
  return value;
}

function readDbCount(row: DbRow | undefined, key: string): number {
  const value = row?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  throw new HttpError(500, `invalid_db_${key}`);
}

function readOptionalDbCount(row: DbRow | undefined, key: string): number {
  if (!row || row[key] == null) return 0;
  return readDbCount(row, key);
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
