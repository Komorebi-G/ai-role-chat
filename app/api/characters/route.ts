import { NextResponse } from "next/server";
import { getAllCharacters, getCharacter, saveCharacter, characterExists, getCharacterJson } from "@/lib/character";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCharacterCard } from "@/lib/character-card";

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
  const format = searchParams.get("format");

  if (id) {
    const character = await getCharacter(id);
    if (!character) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // PNG character card export
    if (format === "png") {
      const cardData = await getCharacterJson(id) || character;
      // Use avatar image as the card image if available
      let imageBuffer: Buffer | undefined;
      const avatar = (cardData as Record<string, unknown>).avatar as string | undefined;
      if (avatar && avatar.startsWith("data:image/png;base64,")) {
        imageBuffer = Buffer.from(avatar.slice("data:image/png;base64,".length), "base64");
      }
      const pngBuffer = generateCharacterCard(cardData as Record<string, unknown>, imageBuffer);
      return new NextResponse(new Uint8Array(pngBuffer), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `attachment; filename="${character.id}.png"`,
        },
      });
    }

    return NextResponse.json(character);
  }

  return NextResponse.json(await getAllCharacters());
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

    const characterId = body.id.trim();

    if (await characterExists(characterId)) {
      return NextResponse.json({ error: "Character ID already exists" }, { status: 409 });
    }

    const character: Record<string, unknown> = {
      id: characterId,
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
    if (body.avatar) character.avatar = body.avatar;

    await saveCharacter(characterId, character);

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

    const existing = await getCharacterJson(characterId);
    if (!existing) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const merged: Record<string, unknown> = {
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
    // Preserve existing avatar, allow override
    if (body.avatar !== undefined) {
      merged.avatar = body.avatar;
    } else if (existing.avatar) {
      merged.avatar = existing.avatar;
    }

    await saveCharacter(characterId, merged);

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
