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

There is a hardcoded demo account: username `123`, password `123`. It has a reserved user ID `"demo"` (`DEMO_USER_ID` in `lib/auth.ts`). The demo user **completely bypasses the database** — its chat history is stored in an in-memory array (`demoMessages` in `app/api/chat/route.ts`). This means demo chat data is ephemeral (lost on server restart) and shared across all demo sessions. `/api/auth/me` handles the demo user specially, returning hardcoded role `"user"` without a DB lookup.

### Role system

The `User` model has a `role` field: `"user"` (default) or `"admin"`. No built-in admin promotion exists — set `role = "admin"` directly in the database.

**Admin API** (`app/api/admin/users/`):
- `GET /api/admin/users` — list all users (admin only)
- `DELETE /api/admin/users/[id]` — delete a user, with guard against self-deletion (admin only)

The chat page frontend (`app/chat/page.tsx`) fetches `/api/auth/me` to get the current role. Admin users see a "User Management" button that opens a modal with the user table and delete actions (with confirm step).

### AI pipeline

```
app/api/chat/ → lib/ai.ts → lib/deepseek.ts → api.deepseek.com/v1/chat/completions
```

- `lib/deepseek.ts`: raw fetch to DeepSeek API (model: `deepseek-v4-flash`, temp 0.8, max_tokens 1024). Takes optional `AbortSignal`.
- `lib/ai.ts`: wraps DeepSeek with in-memory rate limiting (30 req/min sliding window) and a 30-second `AbortController` timeout. Throw errors on rate limit or timeout.
- The chat route builds a system prompt from the character card JSON (name, description, personality, scenario) and sends the last 20 messages as conversation history.

### Characters

Static JSON files in `characters/`. Loaded synchronously with `fs.readFileSync`. Schema defined in `lib/character.ts` (`Character` interface): id, name, description, personality, scenario, firstMessage. `firstMessage` is defined but not yet used in the chat route.

### Frontend routing

`app/page.tsx` is an auth gate: it fetches `/api/characters` on mount. If 200 → redirect to `/chat`; if 401 → redirect to `/login`. All page components are `"use client"`. Login and register pages call their respective API routes and redirect to `/chat` on success.

### Environment variables

| Variable | Local | Vercel |
|---|---|---|
| `DEEPSEEK_API_KEY` | `.env.local` | Required |
| `JWT_SECRET` | Defaults to `"dev-secret-change-in-production"` | Required (use `openssl rand -hex 32`) |
| `DATABASE_URL` | `file:./dev.db` | Not needed |
| `TURSO_DATABASE_URL` | Not needed | Required |
| `TURSO_AUTH_TOKEN` | Not needed | Required |
