import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { characterFromRow } from "@/lib/character";

export async function GET(req: Request) {
  try {
    const userId = await getSession();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const row = await db.character.findUnique({ where: { id } });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(characterFromRow(row));
    }

    const rows = await db.character.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(rows.map(characterFromRow));
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("GET characters error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const userId = await getSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.id || !body.name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }

    const existing = await db.character.findUnique({ where: { id: body.id.trim() } });
    if (existing) {
      return NextResponse.json({ error: "Character ID already exists" }, { status: 409 });
    }

    const jsonArray = (val: unknown): string => JSON.stringify(Array.isArray(val) ? val : []);

    const row = await db.character.create({
      data: {
        id: body.id.trim(),
        name: body.name.trim(),
        description: body.description?.trim() || "",
        personality: body.personality?.trim() || "",
        scenario: body.scenario?.trim() || "",
        firstMessage: body.first_mes?.trim() || body.firstMessage?.trim() || "",
        mes_example: body.mes_example?.trim() || "",
        system_prompt: body.system_prompt?.trim() || "",
        post_history_instructions: body.post_history_instructions?.trim() || "",
        alternate_greetings: jsonArray(body.alternate_greetings),
        creator: body.creator?.trim() || "",
        character_version: body.character_version?.trim() || "",
        creator_notes: body.creator_notes?.trim() || "",
        tags: jsonArray(body.tags),
      },
    });

    return NextResponse.json(characterFromRow(row), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("Create character error:", message);
    if (err instanceof Error && err.stack) console.error("Create character error stack:", err.stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const userId = await getSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.character.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Character not found" }, { status: 404 });

    const jsonArray = (val: unknown): string => JSON.stringify(Array.isArray(val) ? val : []);

    const row = await db.character.update({
      where: { id: body.id },
      data: {
        name: body.name?.trim() ?? existing.name,
        description: body.description?.trim() ?? existing.description,
        personality: body.personality?.trim() ?? existing.personality,
        scenario: body.scenario?.trim() ?? existing.scenario,
        firstMessage: body.first_mes?.trim() ?? body.firstMessage?.trim() ?? existing.firstMessage,
        mes_example: body.mes_example?.trim() ?? existing.mes_example,
        system_prompt: body.system_prompt?.trim() ?? existing.system_prompt,
        post_history_instructions: body.post_history_instructions?.trim() ?? existing.post_history_instructions,
        alternate_greetings: body.alternate_greetings !== undefined ? jsonArray(body.alternate_greetings) : existing.alternate_greetings,
        creator: body.creator?.trim() ?? existing.creator,
        character_version: body.character_version?.trim() ?? existing.character_version,
        creator_notes: body.creator_notes?.trim() ?? existing.creator_notes,
        tags: body.tags !== undefined ? jsonArray(body.tags) : existing.tags,
      },
    });

    return NextResponse.json(characterFromRow(row));
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("Update character error:", message);
    if (err instanceof Error && err.stack) console.error("Update character error stack:", err.stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
