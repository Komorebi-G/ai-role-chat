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
    console.error("Create character error:", err);
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
    const characterId = searchParams.get("id") || body.id;

    const filepath = getCharacterFilePath(characterId);
    if (!filepath) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const character = {
      id: characterId,
      name: body.name.trim(),
      description: body.description?.trim() || "",
      personality: body.personality?.trim() || "",
      scenario: body.scenario?.trim() || "",
      first_mes: body.first_mes?.trim() || "",
      mes_example: body.mes_example?.trim() || "",
      system_prompt: body.system_prompt?.trim() || "",
      creator_notes: body.creator_notes?.trim() || "",
      tags: Array.isArray(body.tags) ? body.tags : [],
    };

    fs.writeFileSync(filepath, JSON.stringify(character, null, 2), "utf-8");
    reloadCharacters();

    return NextResponse.json(character);
  } catch (err) {
    console.error("Update character error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
