# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server (port 3000)
npm run build                  # Production build (next build)
npm run lint                   # ESLint (flat config: eslint .)
npm run typecheck              # tsc --noEmit
npm run test                   # vitest run (14 tests, 2 files)
npx vitest                     # Watch mode
npx prisma migrate dev         # Apply pending migrations + regenerate client
npx prisma generate            # Regenerate Prisma client only

# Git workflow
git add <files>                 # Stage specific files (never use -A blindly)
git commit -m "..."             # Commit with descriptive message
git push                        # Push to origin/master → Vercel auto-deploys

# Turso (production database)
turso db shell ai-role-chat ".tables"
turso db shell ai-role-chat < prisma/migrations/*/migration.sql  # Push latest schema
```

`DATABASE_URL` must be in the environment for Prisma CLI (`export DATABASE_URL="file:./dev.db"` — or read from `.env.local`).

## Architecture

### Database: dual-mode SQLite

`lib/db.ts` switches based on environment variables:
- **Local dev**: Turso vars NOT set → `DATABASE_URL` (file: `prisma/dev.db`)
- **Production (Vercel)**: Turso vars ARE set → `@prisma/adapter-libsql` to Turso

Prisma schema has three models:
- **User** — id, username (unique), passwordHash (bcrypt), role (default `"user"`), createdAt. Has `messages[]` and `conversations[]` relations, both cascade on delete.
- **Conversation** — id, userId, characterId, title (default "New Chat"), createdAt. Has `messages[]`.
- **Message** — id, userId, characterId, conversationId, role, content, createdAt. Cascade-deletes with both User and Conversation.

### Auth flow

`lib/auth.ts` — JWT via `jose`. Token in `token` httpOnly cookie (7-day expiry). Exports:
- `requireAuth()` — throws `"Unauthorized"` if no session. Use in try/catch; most routes use this.
- `getSession()` — returns userId or null without throwing. Use when you need custom HTTP status codes (e.g., admin routes returning 403).
- `DEMO_USER_ID = "demo"` — reserved ID for the demo account.

**Hardcoded accounts** in `app/api/auth/login/route.ts`:
- **Demo** — `123` / `123`. Fully in-memory (Map-based), isolated per browser via `demo_sid` cookie. Conversations stored per-session. Ephemeral — lost on server restart.
- **Admin** — `lbh` / `lbh`. Auto-created in DB on first login with `role: "admin"`. Normal DB-backed storage.

### Role system

User.role is `"user"` or `"admin"`. No built-in promotion — set `role = "admin"` directly in DB.

**Admin API** (`app/api/admin/users/`): GET list users, DELETE user (with self-deletion guard).

### AI pipeline

```
app/api/chat/ → lib/prompt/buildPrompt.ts → lib/chat/context.ts → lib/ai.ts → lib/deepseek.ts → api.deepseek.com/v1/chat/completions
```

- **`lib/deepseek.ts`**: raw fetch to DeepSeek API (model: `deepseek-v4-flash`, temp 0.8, max_tokens 1024). Two exports:
  - `chatWithDeepSeek(messages, signal?, options?)` — standard single-reply
  - `chatWithDeepSeekStream(messages, signal?, options?)` — async generator, SSE streaming via `ReadableStream.getReader()`
  - Both accept optional `AbortSignal` and `ModelOptions` (temperature, maxTokens)
- **`lib/ai.ts`**: wraps DeepSeek with in-memory per-user rate limiting (30 req/min sliding window, `Map<userId, timestamps[]>`) and 30-second `AbortController` timeout. Two async exports: `aiChat()` and `aiChatStream()`.
- **`lib/prompt/buildPrompt.ts`**: layered prompt assembly — system rules → character system_prompt → character card info → example dialogue (parsed from `mes_example`) → trimmed history → user input. Output as `ChatMessage[]`.
- **`lib/chat/context.ts`**: FIFO history trimming (default 20 messages / 8000 chars). Character-count estimation (no tokenizer).

Streaming flow: POST body includes `stream: true` → route returns a `ReadableStream` (text/plain) → frontend reads with `reader.read()` and progressively renders into assistant message bubble. Full reply is saved to DB after streaming completes.

### Characters

JSON files in `characters/`. Schema in `lib/character.ts`:

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | Unique, also the filename (`{id}.json`) |
| `name` | Yes | Display name |
| `description` | No | Defaults to `""` |
| `personality` | No | Defaults to `""` |
| `scenario` | No | Defaults to `""` |
| `first_mes` | No | Opening message (alias: `firstMessage`) |
| `mes_example` | No | Example dialogue, `"Speaker: content"` lines |
| `system_prompt` | No | Character-specific instructions |
| `creator_notes` | No | Unused by prompt |
| `tags` | No | `string[]`, unused by prompt |

Characters load at module init. `reloadCharacters()` clears the cache — call after writing/updating character files. `normalizeCharacter()` fills all missing fields with empty strings. `getAllCharacters()` returns a built-in fallback if the directory is empty.

**Character API** (`app/api/characters/route.ts`):
- GET — list all or by `?id=X` (any authenticated user)
- POST — create (admin only, writes `{id}.json`)
- PUT — update by `?id=X` (admin only, overwrites file)

### Conversations

`app/api/conversations/route.ts`:
- GET `?characterId=X` — list conversations for current user + character
- POST `{ characterId, title? }` — create new conversation

Chat routes (`app/api/chat/route.ts`) all accept `conversationId`: GET loads messages for a conversation, POST sends with conversation context, DELETE clears a specific conversation. If conversationId is omitted, the latest conversation is auto-used or created.

### Frontend

All pages are `"use client"`. `app/page.tsx` is an auth gate (fetches `/api/characters`, redirects to `/chat` or `/login`).

`app/chat/page.tsx` — single-page chat app containing: character sidebar (with conversation sublist + "New Chat" button), message area (ReactMarkdown rendering, streaming display), input area, settings modal (temperature/tokens in localStorage), create/edit character modal, admin user management modal, import/export, theme toggle. Dark mode uses `data-theme` attribute on `<html>` with CSS variables.

`app/globals.css` — all styles via CSS variables (`:root` for light, `[data-theme="dark"]` for dark). Responsive at 768px breakpoint (sidebar becomes slide-in drawer with hamburger button).

Dark mode applies via an inline `<script>` in `app/layout.tsx` (reads localStorage before paint to prevent FOUC), then React state manages the toggle.

### Environment variables

| Variable | Local | Vercel |
|---|---|---|
| `DEEPSEEK_API_KEY` | `.env.local` | Required |
| `JWT_SECRET` | Defaults to `"dev-secret-change-in-production"` | Required |
| `DATABASE_URL` | `file:./dev.db` | Not needed |
| `TURSO_DATABASE_URL` | Not needed | Required |
| `TURSO_AUTH_TOKEN` | Not needed | Required |
