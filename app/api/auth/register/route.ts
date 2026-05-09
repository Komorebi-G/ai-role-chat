import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createToken } from "@/lib/auth";

function validatePassword(password: string): string | null {
  if (password.length < 8 || password.length > 16) {
    return "Password must be 8-16 characters";
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "Password must contain at least one letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json(
        { error: "Password must be 8-16 characters with both letters and numbers" },
        { status: 400 }
      );
    }

    const existing = await db.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: { username, passwordHash },
    });

    const token = await createToken(user.id);
    const res = NextResponse.json({ ok: true, role: user.role });
    res.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
