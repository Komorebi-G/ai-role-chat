import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Use DATABASE_URL if set, otherwise fallback for prisma generate to work.
    // Vercel: DATABASE_URL is not always set (Turso projects use TURSO_DATABASE_URL).
    // Runtime connection is handled by the adapter in lib/db.ts, so the fallback is safe.
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
  migrations: {
    path: "prisma/migrations",
  },
});
