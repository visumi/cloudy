import "dotenv/config";
import { createClient } from "@libsql/client/node";

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) throw new Error("TURSO_URL e TURSO_AUTH_TOKEN precisam estar configurados.");

const db = createClient({ url, authToken });
const userEmail = process.env.SEED_USER_EMAIL ?? process.env.OWNER_EMAIL?.split(",")[0]?.trim();
if (!userEmail) throw new Error("Defina SEED_USER_EMAIL ou OWNER_EMAIL para escolher o usuário.");

const colors = ["#38BDF8", "#A78BFA", "#FB7185", "#FBBF24", "#4ADE80", "#FB923C", "#818CF8", "#A3E635"];
const categoryLimit = 15;
const itemLimit = 100;

const userResult = await db.execute({ sql: "SELECT id, email FROM users WHERE email = ? LIMIT 1", args: [userEmail] });
const user = userResult.rows[0];
if (!user) throw new Error(`Usuário não encontrado: ${userEmail}`);

const existingCategories = await db.execute({
  sql: "SELECT id, name, color FROM categories WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC",
  args: [user.id]
});
const categories = existingCategories.rows.map((row) => ({ id: row.id, name: row.name, color: row.color }));

for (let index = categories.length; index < categoryLimit; index += 1) {
  const name = `Massa ${String(index + 1).padStart(2, "0")}`;
  const id = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO categories (id, user_id, name, normalized_name, color) VALUES (?, ?, ?, ?, ?)",
    args: [id, user.id, name, name.toLocaleLowerCase("pt-BR"), colors[index % colors.length]]
  });
  categories.push({ id, name, color: colors[index % colors.length] });
}

let inserted = 0;
const counts = [];
const pendingItems = [];
for (const [categoryIndex, category] of categories.slice(0, categoryLimit).entries()) {
  const countResult = await db.execute({
    sql: "SELECT COUNT(*) AS count FROM items WHERE user_id = ? AND category_id = ?",
    args: [user.id, category.id]
  });
  const existingCount = Number(countResult.rows[0]?.count ?? 0);
  const targetCount = Math.floor(Math.random() * (itemLimit + 1));
  const amount = Math.max(0, targetCount - existingCount);
  counts.push({ category: category.name, amount: targetCount });

  for (let itemIndex = 0; itemIndex < amount; itemIndex += 1) {
    const serial = String(existingCount + itemIndex + 1).padStart(3, "0");
    pendingItems.push({
      sql: `INSERT INTO items
        (id, user_id, category_id, system_category, name, url, image_url, favicon_url, observation)
        VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, ?)` ,
      args: [
        crypto.randomUUID(),
        user.id,
        category.id,
        `Item ${String(categoryIndex + 1).padStart(2, "0")}-${serial}`,
        `https://example.com/massa-${categoryIndex + 1}/item-${serial}`,
        "Dado de teste gerado automaticamente"
      ]
    });
    inserted += 1;
  }
}

for (let offset = 0; offset < pendingItems.length; offset += 100) {
  await db.batch(pendingItems.slice(offset, offset + 100), "write");
}

console.log(JSON.stringify({ user: user.email, categories: categories.length, insertedItems: inserted, targetItemsByCategory: counts }, null, 2));
