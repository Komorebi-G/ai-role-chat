import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createToken, DEMO_USER_ID } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    // Demo account: bypass database
    if (username === "123" && password === "123") {
      const token = await createToken(DEMO_USER_ID);
      const demoSessionId = crypto.randomUUID();
      const res = NextResponse.json({ ok: true, role: "user" });
      const cookieOpts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      };
      res.cookies.set("token", token, cookieOpts);
      res.cookies.set("demo_sid", demoSessionId, cookieOpts);
      return res;
    }

    // Admin account: auto-create on first login
    if (username === "lbh" && password === "lbh") {
      let admin = await db.user.findUnique({ where: { username: "lbh" } });
      if (!admin) {
        const passwordHash = await bcrypt.hash("lbh", 10);
        admin = await db.user.create({
          data: { username: "lbh", passwordHash, role: "admin" },
        });
      }
      const token = await createToken(admin.id);
      const res = NextResponse.json({ ok: true, role: "admin" });
      res.cookies.set("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
      return res;
    }

    const user = await db.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const token = await createToken(user.id);
    const res = NextResponse.json({ ok: true, role: user.role });
    res.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("Login error:", message);
    if (err instanceof Error && err.stack) {
      console.error("Login error stack:", err.stack);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
