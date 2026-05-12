import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  // Check required env var presence (boolean only, never values)
  const env = {
    JWT_SECRET: !!process.env.JWT_SECRET,
    DEEPSEEK_API_KEY: !!process.env.DEEPSEEK_API_KEY,
    TURSO_DATABASE_URL: !!process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: !!process.env.TURSO_AUTH_TOKEN,
    DATABASE_URL: !!process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV || "not set",
    VERCEL: !!process.env.VERCEL,
  };

  // Database connectivity check
  let dbOk = false;
  let dbError = null;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }

  const runtime = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  };

  const allOk = dbOk && env.DEEPSEEK_API_KEY;

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      database: dbOk ? "connected" : "error",
      ...(dbError && { databaseError: dbError }),
      env,
      runtime,
    },
    { status: allOk ? 200 : 503 }
  );
}
