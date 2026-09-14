import type { Client } from "@libsql/client/web";
import { type DbRow, HttpError, readDbString } from "./shared";
import { listCategories, MAX_ITEMS_PER_CATEGORY } from "./items";

export const MAX_CATEGORIES_PER_USER = 15;
const MAX_SHARED_CATEGORIES = 15;
const MAX_CATEGORY_NAME_LENGTH = 12;

type DbExecutor = Pick<Client, "execute">;

export interface SharedCategorySummary {
  id: string;
  name: string;
  color: string;
  itemCount: number;
}

export interface ShareSnapshot {
  id: string;
  createdAt: string;
  categories: SharedCategorySummary[];
}

export interface CreateShareInput {
  categoryIds: string[];
}

export interface ImportShareInput {
  shareCategoryIds: string[];
}

export async function createShare(db: Client, userId: string, payload: unknown): Promise<{ shareId: string }> {
  const input = parseCreateShareInput(payload);
  const transaction = await db.transaction("write");
  const shareId = crypto.randomUUID();

  try {
    const categories = await transaction.execute({
      sql: `SELECT id, name, color FROM categories
        WHERE user_id = ? AND id IN (${input.categoryIds.map(() => "?").join(", ")})
        AND EXISTS (
          SELECT 1 FROM items
          WHERE items.user_id = categories.user_id AND items.category_id = categories.id
        )`,
      args: [userId, ...input.categoryIds]
    });
    const categoryById = new Map((categories.rows as DbRow[]).map((row) => [readDbString(row, "id"), row]));
    if (categoryById.size !== input.categoryIds.length) throw new HttpError(400, "category_not_shareable");

    await transaction.execute({ sql: "INSERT INTO shares (id, owner_user_id) VALUES (?, ?)", args: [shareId, userId] });
    for (const [position, categoryId] of input.categoryIds.entries()) {
      const category = categoryById.get(categoryId);
      if (!category) throw new HttpError(400, "category_not_shareable");
      const shareCategoryId = crypto.randomUUID();
      await transaction.execute({
        sql: "INSERT INTO share_categories (id, share_id, name, color, position) VALUES (?, ?, ?, ?, ?)",
        args: [shareCategoryId, shareId, readDbString(category, "name"), readDbString(category, "color"), position]
      });
      const items = await transaction.execute({
        sql: `SELECT name, url, image_url, favicon_url, observation
          FROM items WHERE user_id = ? AND category_id = ?
          ORDER BY created_at DESC, id DESC`,
        args: [userId, categoryId]
      });
      if (items.rows.length > MAX_ITEMS_PER_CATEGORY) throw new HttpError(400, "category_item_limit_reached");
      for (const [itemPosition, row] of (items.rows as DbRow[]).entries()) {
        await transaction.execute({
          sql: `INSERT INTO share_items
            (id, share_category_id, name, url, image_url, favicon_url, observation, position)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            crypto.randomUUID(),
            shareCategoryId,
            readDbString(row, "name"),
            readNullableString(row, "url"),
            readNullableString(row, "image_url"),
            readNullableString(row, "favicon_url"),
            readNullableString(row, "observation"),
            itemPosition
          ]
        });
      }
    }
    await transaction.commit();
    return { shareId };
  } finally {
    transaction.close();
  }
}

export async function getShare(db: Client, shareId: string): Promise<ShareSnapshot> {
  const share = await db.execute({ sql: "SELECT id, created_at FROM shares WHERE id = ? LIMIT 1", args: [shareId] });
  const shareRow = share.rows[0] as DbRow | undefined;
  if (!shareRow) throw new HttpError(404, "share_not_found");
  const categories = await db.execute({
    sql: `SELECT sc.id, sc.name, sc.color, COUNT(si.id) AS item_count
      FROM share_categories sc
      LEFT JOIN share_items si ON si.share_category_id = sc.id
      WHERE sc.share_id = ?
      GROUP BY sc.id, sc.name, sc.color, sc.position
      HAVING COUNT(si.id) > 0
      ORDER BY sc.position ASC, sc.id ASC`,
    args: [shareId]
  });
  return {
    id: readDbString(shareRow, "id"),
    createdAt: readDbString(shareRow, "created_at"),
    categories: (categories.rows as DbRow[]).map((row) => ({
      id: readDbString(row, "id"),
      name: readDbString(row, "name"),
      color: readDbString(row, "color"),
      itemCount: readDbCount(row, "item_count")
    }))
  };
}

export async function importShare(db: Client, userId: string, shareId: string, payload: unknown): Promise<{ categories: Awaited<ReturnType<typeof listCategories>> }> {
  const input = parseImportShareInput(payload);
  const transaction = await db.transaction("write");
  const createdCategories: Array<{ id: string; name: string; color: string; itemCount: number; recentItems: Array<{ id: string; name: string; imageUrl: string | null; faviconUrl: string | null; createdAt: string }> }> = [];
  const importedAt = new Date().toISOString();

  try {
    const share = await transaction.execute({ sql: "SELECT id FROM shares WHERE id = ? LIMIT 1", args: [shareId] });
    if (share.rows.length === 0) throw new HttpError(404, "share_not_found");
    const sharedCategories = await transaction.execute({
      sql: `SELECT id, name, color, position FROM share_categories
        WHERE share_id = ? AND id IN (${input.shareCategoryIds.map(() => "?").join(", ")})
        AND EXISTS (
          SELECT 1 FROM share_items
          WHERE share_items.share_category_id = share_categories.id
        )`,
      args: [shareId, ...input.shareCategoryIds]
    });
    const sharedById = new Map((sharedCategories.rows as DbRow[]).map((row) => [readDbString(row, "id"), row]));
    if (sharedById.size !== input.shareCategoryIds.length) throw new HttpError(400, "share_category_not_found");

    const currentCountResult = await transaction.execute({ sql: "SELECT COUNT(*) AS category_count FROM categories WHERE user_id = ?", args: [userId] });
    if (readDbCount(currentCountResult.rows[0] as DbRow | undefined, "category_count") + input.shareCategoryIds.length > MAX_CATEGORIES_PER_USER) {
      throw new HttpError(400, "category_limit_reached");
    }
    const existing = await transaction.execute({ sql: "SELECT normalized_name FROM categories WHERE user_id = ?", args: [userId] });
    const usedNames = new Set((existing.rows as DbRow[]).map((row) => readDbString(row, "normalized_name")));

    for (const shareCategoryId of input.shareCategoryIds) {
      const sharedCategory = sharedById.get(shareCategoryId)!;
      const name = makeUniqueCategoryName(readDbString(sharedCategory, "name"), usedNames);
      const normalizedName = normalizeCategoryName(name);
      usedNames.add(normalizedName);
      const categoryId = crypto.randomUUID();
      await transaction.execute({
        sql: "INSERT INTO categories (id, user_id, name, normalized_name, color) VALUES (?, ?, ?, ?, ?)",
        args: [categoryId, userId, name, normalizedName, readDbString(sharedCategory, "color")]
      });
      const itemResult = await transaction.execute({
        sql: `SELECT id, name, url, image_url, favicon_url, observation
          FROM share_items WHERE share_category_id = ? ORDER BY position ASC, id ASC`,
        args: [shareCategoryId]
      });
      if (itemResult.rows.length > MAX_ITEMS_PER_CATEGORY) throw new HttpError(400, "category_item_limit_reached");
      const recentItems = [];
      let position = 0;
      for (const row of itemResult.rows as DbRow[]) {
        const itemId = crypto.randomUUID();
        await transaction.execute({
          sql: `INSERT INTO items
            (id, user_id, category_id, system_category, name, url, image_url, favicon_url, observation)
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
          args: [itemId, userId, categoryId, readDbString(row, "name"), readNullableString(row, "url"), readNullableString(row, "image_url"), readNullableString(row, "favicon_url"), readNullableString(row, "observation")]
        });
        if (position < 5) recentItems.push({ id: itemId, name: readDbString(row, "name"), imageUrl: readNullableString(row, "image_url"), faviconUrl: readNullableString(row, "favicon_url"), createdAt: importedAt });
        position += 1;
      }
      createdCategories.push({ id: categoryId, name, color: readDbString(sharedCategory, "color"), itemCount: position, recentItems });
    }
    await transaction.commit();
    return { categories: createdCategories };
  } finally {
    transaction.close();
  }
}

export function parseCreateShareInput(payload: unknown): CreateShareInput {
  const source = readObject(payload);
  const value = source.categoryIds;
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SHARED_CATEGORIES || value.some((id) => typeof id !== "string" || !id.trim())) throw new HttpError(400, "invalid_share_categories");
  const categoryIds = value.map((id) => id.trim());
  if (new Set(categoryIds).size !== categoryIds.length) throw new HttpError(400, "invalid_share_categories");
  return { categoryIds };
}

export function parseImportShareInput(payload: unknown): ImportShareInput {
  const source = readObject(payload);
  const value = source.shareCategoryIds;
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SHARED_CATEGORIES || value.some((id) => typeof id !== "string" || !id.trim())) throw new HttpError(400, "invalid_share_categories");
  const shareCategoryIds = value.map((id) => id.trim());
  if (new Set(shareCategoryIds).size !== shareCategoryIds.length) throw new HttpError(400, "invalid_share_categories");
  return { shareCategoryIds };
}

function makeUniqueCategoryName(originalName: string, usedNames: Set<string>): string {
  const base = normalizeText(originalName).slice(0, MAX_CATEGORY_NAME_LENGTH);
  if (!usedNames.has(normalizeCategoryName(base))) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const marker = ` (${suffix})`;
    const candidate = `${base.slice(0, Math.max(1, MAX_CATEGORY_NAME_LENGTH - marker.length)).trim()}${marker}`.slice(0, MAX_CATEGORY_NAME_LENGTH);
    if (!usedNames.has(normalizeCategoryName(candidate))) return candidate;
  }
  throw new HttpError(400, "category_name_generation_failed");
}

function normalizeText(value: string): string { return value.trim().replace(/\s+/g, " "); }
function normalizeCategoryName(value: string): string { return normalizeText(value).toLowerCase(); }
function readObject(payload: unknown): Record<string, unknown> { if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new HttpError(400, "invalid_json"); return payload as Record<string, unknown>; }
function readNullableString(row: DbRow, key: string): string | null { const value = row[key]; if (value == null) return null; if (typeof value !== "string") throw new HttpError(500, `invalid_db_${key}`); return value; }
function readDbCount(row: DbRow | undefined, key: string): number { const value = row?.[key]; if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "bigint") return Number(value); if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value); throw new HttpError(500, `invalid_db_${key}`); }
