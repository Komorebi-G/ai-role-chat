// Apply pending migrations to Turso (runs during Vercel build)
import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
  console.log("[migrate-turso] Turso env vars not set — skipping (local dev)");
  process.exit(0);
}

const client = createClient({ url: tursoUrl, authToken: tursoToken });

try {
  // Ensure _prisma_migrations table exists
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )
  `);

  const migrationName = "20260509150453_add_conversations";

  // Check if this migration was already applied
  const existing = await client.execute({
    sql: `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = ?`,
    args: [migrationName],
  });

  if (existing.rows.length > 0) {
    console.log(`[migrate-turso] Migration ${migrationName} already applied — skipping`);
    process.exit(0);
  }

  console.log(`[migrate-turso] Applying migration: ${migrationName}`);

  const sql = await readFile(
    path.join(__dirname, "..", "prisma", "migrations", migrationName, "migration.sql"),
    "utf-8"
  );

  // Execute the migration as a batch
  await client.executeMultiple(sql);

  // Record the migration
  await client.execute({
    sql: `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count", "logs")
          VALUES (?, ?, ?, datetime('now'), datetime('now'), 1, 'applied by migrate-turso.mjs')`,
    args: [crypto.randomUUID(), "manual-via-migrate-turso", migrationName],
  });

  console.log(`[migrate-turso] Migration ${migrationName} applied successfully`);
} catch (err) {
  console.error("[migrate-turso] Failed:", err);
  process.exit(1);
} finally {
  client.close();
}
