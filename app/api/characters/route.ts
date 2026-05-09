import { NextResponse } from "next/server";
import { getAllCharacters, getCharacter } from "@/lib/character";
import { requireAuth } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    await requireAuth();
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
