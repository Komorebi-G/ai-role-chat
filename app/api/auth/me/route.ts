import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const userId = await getSession();
    if (!userId) return NextResponse.json({ role: null }, { status: 401 });

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) return NextResponse.json({ role: null }, { status: 401 });
    return NextResponse.json({ userId: user.id, role: user.role });
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("Me error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
