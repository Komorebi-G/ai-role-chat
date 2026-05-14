import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractCharacterCard } from "@/lib/character-card";
import { saveCharacter, characterExists } from "@/lib/character";

function normalize(raw: Record<string, unknown>, id: string, avatar?: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    id,
    name: String(raw.name || "").trim(),
    description: String(raw.description || "").trim(),
    personality: String(raw.personality || "").trim(),
    scenario: String(raw.scenario || "").trim(),
    first_mes: String(raw.first_mes || raw.firstMessage || "").trim(),
    mes_example: String(raw.mes_example || "").trim(),
    system_prompt: String(raw.system_prompt || "").trim(),
    post_history_instructions: String(raw.post_history_instructions || "").trim(),
    alternate_greetings: Array.isArray(raw.alternate_greetings) ? raw.alternate_greetings : [],
    creator: String(raw.creator || "").trim(),
    character_version: String(raw.character_version || "").trim(),
    creator_notes: String(raw.creator_notes || "").trim(),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
  if (avatar) data.avatar = avatar;
  return data;
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
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No PNG file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const character = extractCharacterCard(buffer);

    if (!character) {
      return NextResponse.json({ error: "No valid character card found in PNG" }, { status: 400 });
    }

    if (!character.id || !character.name) {
      return NextResponse.json({ error: "Character card must have id and name" }, { status: 400 });
    }

    const characterId = String(character.id).trim();
    const existed = await characterExists(characterId);

    // Extract the PNG image as an avatar data URL
    const base64Png = buffer.toString("base64");
    const avatarDataUrl = `data:image/png;base64,${base64Png}`;
    const charData = normalize(character as Record<string, unknown>, characterId, avatarDataUrl);

    await saveCharacter(characterId, charData);

    return NextResponse.json(
      { imported: characterId, overwritten: existed },
      { status: existed ? 200 : 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("Import character card error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
