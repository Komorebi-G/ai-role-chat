import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { db: PrismaClient };

function createPrismaClient(): PrismaClient {
  try {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (tursoUrl && tursoToken) {
      const adapter = new PrismaLibSql({ url: tursoUrl, authToken: tursoToken });
      return new PrismaClient({ adapter });
    }

    // Local dev: use SQLite file via libsql adapter
    const dbUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
    const adapter = new PrismaLibSql({ url: dbUrl });
    return new PrismaClient({ adapter });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to create PrismaClient:", message);
    if (message.includes("adapter")) {
      console.error(
        "Possible version mismatch between @prisma/adapter-libsql and @prisma/client. " +
        "Ensure both are on the same major version (both v7 or both v6)."
      );
    }
    throw err;
  }
}

export const db = globalForPrisma.db ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.db = db;
