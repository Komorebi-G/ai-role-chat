import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUserId = await getSession();
  if (!currentUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await db.user.findUnique({ where: { id: currentUserId } });
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetId } = await params;

  if (targetId === currentUserId) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  const targetUser = await db.user.findUnique({ where: { id: targetId } });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await db.user.delete({ where: { id: targetId } });

  return NextResponse.json({ ok: true });
}
