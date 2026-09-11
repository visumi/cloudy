import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@libsql/client/node";

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) throw new Error("TURSO_URL e TURSO_AUTH_TOKEN precisam estar configurados.");

const db = createClient({ url, authToken });
const directory = join(process.cwd(), "db", "migrations");
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

for (const file of files) {
  const applied = await db.execute({ sql: "SELECT name FROM schema_migrations WHERE name = ? LIMIT 1", args: [file] });
  if (applied.rows.length) {
    console.log(`Ignorando ${file} (já aplicada)`);
    continue;
  }
  console.log(`Aplicando ${file}`);
  await db.executeMultiple(await readFile(join(directory, file), "utf8"));
  await db.execute({ sql: "INSERT INTO schema_migrations (name) VALUES (?)", args: [file] });
}

console.log("Migrações concluídas.");
