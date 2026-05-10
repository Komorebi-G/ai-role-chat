// Apply pending migrations to Turso (runs during Vercel build)
import { createClient } from "@libsql/client";
import { readFile, readdir } from "node:fs/promises";
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

// 60-second timeout for the migration run (Vercel build has ~5 min total)
const MIGRATE_TIMEOUT_MS = 60_000;

async function runMigrations() {
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

  // Get all migration directories, sorted by name (chronological)
  const migrationsDir = path.join(__dirname, "..", "prisma", "migrations");
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const migrationNames = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const migrationName of migrationNames) {
    // Check if already applied
    const existing = await client.execute({
      sql: `SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = ?`,
      args: [migrationName],
    });

    if (existing.rows.length > 0) {
      console.log(`[migrate-turso] Migration ${migrationName} already applied — skipping`);
      continue;
    }

    console.log(`[migrate-turso] Applying migration: ${migrationName}`);

    const sqlPath = path.join(migrationsDir, migrationName, "migration.sql");
    const sql = await readFile(sqlPath, "utf-8");

    await client.executeMultiple(sql);

    // Record the migration
    await client.execute({
      sql: `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count", "logs")
            VALUES (?, ?, ?, datetime('now'), datetime('now'), 1, 'applied by migrate-turso.mjs')`,
      args: [crypto.randomUUID(), "manual-via-migrate-turso", migrationName],
    });

    console.log(`[migrate-turso] Migration ${migrationName} applied successfully`);
  }
}

try {
  await Promise.race([
    runMigrations(),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Migration timed out after ${MIGRATE_TIMEOUT_MS / 1000}s`)), MIGRATE_TIMEOUT_MS)),
  ]);
} catch (err) {
  console.error("[migrate-turso] Failed:", err);
  process.exit(1);
} finally {
  client.close();
}
