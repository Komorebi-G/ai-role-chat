import { NextResponse } from "next/server";
import { getAllCharacters, getCharacter, reloadCharacters, getCharacterFilePath } from "@/lib/character";
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
    const character = getCharacter(id);
    if (!character) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(character);
  }

  return NextResponse.json(getAllCharacters());
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

    const character = {
      id: body.id.trim(),
      name: body.name.trim(),
      description: body.description?.trim() || "",
      personality: body.personality?.trim() || "",
      scenario: body.scenario?.trim() || "",
      first_mes: body.first_mes?.trim() || "",
      mes_example: body.mes_example?.trim() || "",
      system_prompt: body.system_prompt?.trim() || "",
      post_history_instructions: body.post_history_instructions?.trim() || "",
      alternate_greetings: Array.isArray(body.alternate_greetings) ? body.alternate_greetings : [],
      creator: body.creator?.trim() || "",
      character_version: body.character_version?.trim() || "",
      creator_notes: body.creator_notes?.trim() || "",
      tags: Array.isArray(body.tags) ? body.tags : [],
    };

    const dir = path.join(process.cwd(), "characters");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filepath = path.join(dir, `${character.id}.json`);
    if (fs.existsSync(filepath)) {
      return NextResponse.json({ error: "Character ID already exists" }, { status: 409 });
    }

    fs.writeFileSync(filepath, JSON.stringify(character, null, 2), "utf-8");
    reloadCharacters();

    return NextResponse.json(character, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("Create character error:", message);
    if (err instanceof Error && err.stack) {
      console.error("Create character error stack:", err.stack);
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
    const characterId = searchParams.get("id") || body.id;

    const filepath = getCharacterFilePath(characterId);
    if (!filepath) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Read existing file and merge to prevent data loss from partial updates
    const existingRaw = fs.readFileSync(filepath, "utf-8");
    const existing = JSON.parse(existingRaw);

    const merged = {
      id: characterId,
      name: body.name?.trim() || existing.name || "",
      description: body.description?.trim() ?? existing.description ?? "",
      personality: body.personality?.trim() ?? existing.personality ?? "",
      scenario: body.scenario?.trim() ?? existing.scenario ?? "",
      first_mes: body.first_mes?.trim() ?? existing.first_mes ?? existing.firstMessage ?? "",
      mes_example: body.mes_example?.trim() ?? existing.mes_example ?? "",
      system_prompt: body.system_prompt?.trim() ?? existing.system_prompt ?? "",
      post_history_instructions: body.post_history_instructions?.trim() ?? existing.post_history_instructions ?? "",
      alternate_greetings: Array.isArray(body.alternate_greetings) ? body.alternate_greetings : (existing.alternate_greetings || []),
      creator: body.creator?.trim() ?? existing.creator ?? "",
      character_version: body.character_version?.trim() ?? existing.character_version ?? "",
      creator_notes: body.creator_notes?.trim() ?? existing.creator_notes ?? "",
      tags: Array.isArray(body.tags) ? body.tags : (existing.tags || []),
    };

    fs.writeFileSync(filepath, JSON.stringify(merged, null, 2), "utf-8");
    reloadCharacters();

    return NextResponse.json(merged);
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("Update character error:", message);
    if (err instanceof Error && err.stack) {
      console.error("Update character error stack:", err.stack);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
