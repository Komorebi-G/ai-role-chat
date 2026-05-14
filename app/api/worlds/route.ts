import { NextResponse } from "next/server";
import { getAllWorldBooks, getWorldBook, saveWorldBook, deleteWorldBook, worldBookExists } from "@/lib/world";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

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
    const book = await getWorldBook(id);
    if (!book) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(book);
  }

  return NextResponse.json(await getAllWorldBooks());
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

    const bookId = body.id.trim();

    if (await worldBookExists(bookId)) {
      return NextResponse.json({ error: "World book ID already exists" }, { status: 409 });
    }

    const book = {
      id: bookId,
      name: body.name.trim(),
      description: body.description?.trim() || "",
      entries: Array.isArray(body.entries) ? body.entries : [],
    };

    await saveWorldBook(bookId, book);

    return NextResponse.json(book, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("Create world book error:", message);
    if (err instanceof Error && err.stack) {
      console.error("Create world book error stack:", err.stack);
    }
    return NextResponse.json({ error: message }, { status: 500 });
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

    if (!(await worldBookExists(bookId))) {
      return NextResponse.json({ error: "World book not found" }, { status: 404 });
    }

    const book = {
      id: bookId,
      name: body.name.trim(),
      description: body.description?.trim() || "",
      entries: Array.isArray(body.entries) ? body.entries : [],
    };

    await saveWorldBook(bookId, book);

    return NextResponse.json(book);
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("Update world book error:", message);
    if (err instanceof Error && err.stack) {
      console.error("Update world book error stack:", err.stack);
    }
    return NextResponse.json({ error: message }, { status: 500 });
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

    if (!(await worldBookExists(bookId))) {
      return NextResponse.json({ error: "World book not found" }, { status: 404 });
    }

    await deleteWorldBook(bookId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("Delete world book error:", message);
    if (err instanceof Error && err.stack) {
      console.error("Delete world book error stack:", err.stack);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
