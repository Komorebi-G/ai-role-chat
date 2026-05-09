# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server (port 3000)
npm run build                  # Production build
npx prisma migrate dev --name init  # Init local SQLite (creates prisma/dev.db)
npx prisma generate            # Regenerate Prisma client after schema changes

# Turso (production database)
turso db shell ai-role-chat ".tables"                                 # Check tables
turso db shell ai-role-chat < prisma/migrations/*/migration.sql      # Push schema to Turso
```

No test suite exists yet. There is no lint script configured.

## Architecture

### Database: dual-mode SQLite

`lib/db.ts` switches based on environment variables:
- **Local dev**: if `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are NOT set → uses `DATABASE_URL` (file: `prisma/dev.db`)
- **Production (Vercel)**: if both Turso vars ARE set → uses `@prisma/adapter-libsql` to connect to Turso

This means local dev never needs Turso credentials, and Vercel never needs a file-based SQLite.

Prisma schema has two models: `User` (username unique, bcrypt-hashed password, role defaults to `"user"`) and `Message` (userId, characterId, role, content). Messages cascade-delete with user.

### Auth flow

`lib/auth.ts` uses `jose` for JWT signing/verification. Token is stored in `token` httpOnly cookie (7-day expiry).

Two auth patterns in API routes:
- **`requireAuth()`** — throws `new Error("Unauthorized")` if no session. Use in try/catch to return 401 JSON. Simpler, used by most routes.
- **`getSession()`** — returns userId or null without throwing. Use when you need custom error handling (e.g., admin routes that return 403 for non-admins).

Hardcoded accounts in login route (`app/api/auth/login/route.ts`), checked before normal DB lookup:

- **Demo account** — `123` / `123`. Reserved user ID `"demo"` (`DEMO_USER_ID` in `lib/auth.ts`). **Completely bypasses the database** — chat history stored in an in-memory array (`demoMessages` in `app/api/chat/route.ts`), ephemeral (lost on server restart), shared across all demo sessions. Role is `"user"`.
- **Admin account** — `lbh` / `lbh`. Auto-created in the database on first login with `role: "admin"`. Normal DB-backed storage, chat history persists.

`/api/auth/me` handles the demo user specially, returning hardcoded role `"user"` without a DB lookup.

### Role system

The `User` model has a `role` field: `"user"` (default) or `"admin"`. No built-in admin promotion exists — set `role = "admin"` directly in the database.

**Admin API** (`app/api/admin/users/`):
- `GET /api/admin/users` — list all users (admin only)
- `DELETE /api/admin/users/[id]` — delete a user, with guard against self-deletion (admin only)

The chat page frontend (`app/chat/page.tsx`) fetches `/api/auth/me` to get the current role. Admin users see a "User Management" button that opens a modal with the user table and delete actions (with confirm step).

### AI pipeline

```
app/api/chat/ → lib/prompt/buildPrompt.ts → lib/chat/context.ts → lib/ai.ts → lib/deepseek.ts → api.deepseek.com/v1/chat/completions
```

- `lib/deepseek.ts`: raw fetch to DeepSeek API (model: `deepseek-v4-flash`, temp 0.8, max_tokens 1024). Takes optional `AbortSignal`. Exports `ChatMessage` interface.
- `lib/ai.ts`: wraps DeepSeek with in-memory rate limiting (30 req/min sliding window) and a 30-second `AbortController` timeout.
- `lib/prompt/buildPrompt.ts`: assembles final messages array in layers — system prompt (global rules + character system_prompt) → character card info → example dialogue (parsed from `mes_example`) → trimmed chat history → user input. All output as `ChatMessage[]` format.
- `lib/chat/context.ts`: trims history to fit context window budget (default 20 messages / 8000 chars). FIFO strategy — oldest messages discarded first. Uses character-count estimation (TODO: proper tokenizer).

### Characters

Static JSON files in `characters/`. Schema defined in `lib/character.ts`:

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | Unique identifier |
| `name` | Yes | Display name |
| `description` | No | Role description, defaults to `""` |
| `personality` | No | Personality traits, defaults to `""` |
| `scenario` | No | Conversation scenario, defaults to `""` |
| `first_mes` | No | Opening message (alias: `firstMessage`, preferred: `first_mes`) |
| `mes_example` | No | Example dialogue lines, `"Speaker: content"` format |
| `system_prompt` | No | Character-specific system prompt |
| `creator_notes` | No | Author notes (unused in prompt) |
| `tags` | No | String array (unused in prompt) |

`normalizeCharacter()` handles all field fallbacks. Missing fields never crash — they default to empty strings. `getAllCharacters()` returns a built-in fallback character if the `characters/` directory is empty/missing.

### Frontend routing

`app/page.tsx` is an auth gate: it fetches `/api/characters` on mount. If 200 → redirect to `/chat`; if 401 → redirect to `/login`. All page components are `"use client"`. Login and register pages call their respective API routes and redirect to `/chat` on success.

`app/chat/page.tsx` loads characters on mount, fetches `/api/auth/me` for role (to conditionally show admin panel). When a character is selected and chat history is empty, the character's `firstMessage` is displayed as the initial assistant message (not persisted to DB).

### Environment variables

| Variable | Local | Vercel |
|---|---|---|
| `DEEPSEEK_API_KEY` | `.env.local` | Required |
| `JWT_SECRET` | Defaults to `"dev-secret-change-in-production"` | Required (use `openssl rand -hex 32`) |
| `DATABASE_URL` | `file:./dev.db` | Not needed |
| `TURSO_DATABASE_URL` | Not needed | Required |
| `TURSO_AUTH_TOKEN` | Not needed | Required |
