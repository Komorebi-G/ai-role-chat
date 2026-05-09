import { NextResponse } from "next/server";
import { getAllWorldBooks, getWorldBook, reloadWorldBooks } from "@/lib/world";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET(req: Request) {
  try {
    const userId = await getSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const book = getWorldBook(id);
    if (!book) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(book);
  }

  return NextResponse.json(getAllWorldBooks());
}

export async function POST(req: Request) {
  const userId = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  try {
    const body = await req.json();

    if (!body.id || !body.name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }

    const book = {
      id: body.id.trim(),
      name: body.name.trim(),
      description: body.description?.trim() || "",
      entries: Array.isArray(body.entries) ? body.entries : [],
    };

    const dir = path.join(process.cwd(), "worlds");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filepath = path.join(dir, `${book.id}.json`);
    if (fs.existsSync(filepath)) {
      return NextResponse.json({ error: "World book ID already exists" }, { status: 409 });
    }

    fs.writeFileSync(filepath, JSON.stringify(book, null, 2), "utf-8");
    reloadWorldBooks();

    return NextResponse.json(book, { status: 201 });
  } catch (err) {
    console.error("Create world book error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const userId = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  try {
    const body = await req.json();

    if (!body.id || !body.name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const bookId = searchParams.get("id") || body.id;

    const dir = path.join(process.cwd(), "worlds");
    const filepath = path.join(dir, `${bookId}.json`);
    if (!fs.existsSync(filepath)) {
      return NextResponse.json({ error: "World book not found" }, { status: 404 });
    }

    const book = {
      id: bookId,
      name: body.name.trim(),
      description: body.description?.trim() || "",
      entries: Array.isArray(body.entries) ? body.entries : [],
    };

    fs.writeFileSync(filepath, JSON.stringify(book, null, 2), "utf-8");
    reloadWorldBooks();

    return NextResponse.json(book);
  } catch (err) {
    console.error("Update world book error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const userId = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const bookId = searchParams.get("id");
    if (!bookId) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "worlds");
    const filepath = path.join(dir, `${bookId}.json`);
    if (!fs.existsSync(filepath)) {
      return NextResponse.json({ error: "World book not found" }, { status: 404 });
    }

    fs.unlinkSync(filepath);
    reloadWorldBooks();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete world book error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
