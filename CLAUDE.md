# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server (port 3000)
npm run build                  # Production build (migrate-turso + next build)
npm run lint                   # ESLint (flat config: eslint.config.mjs)
npm run typecheck              # tsc --noEmit
npm run test                   # vitest run (19 tests, 2 files)
npx vitest                     # Watch mode
npx vitest run <path>          # Run a single test file
npx prisma migrate dev         # Apply pending migrations + regenerate client
npx prisma generate            # Regenerate Prisma client only

# Setup from scratch
cp .env.example .env.local     # Then edit .env.local with DEEPSEEK_API_KEY
npx prisma migrate dev         # Initialize local SQLite database

# Turso (production database)
turso db shell ai-role-chat ".tables"
```

`DATABASE_URL` is in `.env` (read by Prisma CLI). Copy `.env.example` to `.env.local` for local setup.

## Architecture

### Overview — minimal, stable, Vercel-first

This is a lightweight AI role-play chat MVP. The rule: **if it works locally but breaks on Vercel, it's broken.**

Stack: Next.js 15 App Router (React 19) + Prisma 7 + SQLite (local) / Turso (Vercel) + DeepSeek API + JWT auth.

### Database: dual-path SQLite/Turso

`lib/db.ts` picks the connection at startup. Same Prisma adapter class, two different databases:

- **Local dev** (no Turso vars): `PrismaLibSql({ url: "file:./prisma/dev.db" })` — local SQLite, instant
- **Vercel** (Turso vars set): `PrismaLibSql({ url: tursoUrl, authToken })` — remote Turso over HTTPS

### Prisma schema

Four models:
- **User** — id, username (unique), passwordHash (bcrypt), role (`"user"` or `"admin"`), createdAt
- **Character** — id, name, description, personality, scenario, firstMessage, mes_example, system_prompt, post_history_instructions, alternate_greetings (JSON string), creator, character_version, creator_notes, tags (JSON string), createdAt, updatedAt
- **Conversation** — id, userId, characterId, title, createdAt. Cascade-deletes with User.
- **Message** — id, userId, characterId, conversationId, role, content, createdAt. Cascade-deletes with both User and Conversation.

### API routes (11 routes)

| Route | Methods | Auth |
|---|---|---|
| `/api/auth/login` | POST | Public |
| `/api/auth/register` | POST | Public |
| `/api/auth/logout` | POST | Authenticated |
| `/api/auth/me` | GET | Authenticated |
| `/api/characters` | GET, POST, PUT | GET: authenticated; POST/PUT: admin only |
| `/api/chat` | GET, POST, DELETE | Authenticated |
| `/api/conversations` | GET, POST, PATCH | Authenticated |

### Auth flow

`lib/auth.ts` — JWT via `jose`. Token in `token` httpOnly cookie (7-day expiry).
- `requireAuth()` — throws `"Unauthorized"` if no session
- `getSession()` — returns userId or null without throwing

Users register via `/api/auth/register` (bcrypt hashed). Admin role required for character CRUD write operations.

### AI pipeline

```
app/api/chat/ → lib/prompt/buildPrompt.ts → lib/chat/context.ts → lib/ai.ts → lib/deepseek.ts → api.deepseek.com/v1/chat/completions
```

- **`lib/deepseek.ts`**: raw fetch to DeepSeek API (model: `deepseek-v4-flash`, temp 0.8, max_tokens 1024). Exports `chatWithDeepSeek()` and `chatWithDeepSeekStream()` (async generator for SSE streaming). Both accept optional `AbortSignal` and `ModelOptions`.
- **`lib/ai.ts`**: wraps DeepSeek with in-memory per-user rate limiting (30 req/min sliding window) and 30s `AbortController` timeout.
- **`lib/prompt/buildPrompt.ts`**: layered prompt assembly — system rules → user persona → character system_prompt → character card info → example dialogue → chat history → post_history_instructions → user input.
- **`lib/chat/context.ts`**: FIFO history trimming (default 20 messages / 8000 chars). Character-count estimation.

### Character system

Characters are stored in the database (Character model). Admin users create/edit them via the UI or API. `lib/character.ts` provides the `Character` interface and `characterFromRow()` helper to convert DB rows.

### Frontend

Single-page WeChat-style chat app at `app/chat/page.tsx` (`"use client"`):
- Character list view → character chat view
- Streaming display with "Thinking..." state
- ReactMarkdown rendering, copy, search
- Drawer for conversation switching (create, rename, delete)
- Settings modal (temperature, maxTokens, persona — stored in localStorage)
- Character create/edit modal (admin only)
- i18n: Chinese (zh-CN) and English (en) via `lib/i18n/`, switchable in header
- Dark mode via `data-theme` attribute with FOUC prevention in `app/layout.tsx`

### Environment variables

| Variable | Local | Vercel |
|---|---|---|
| `DEEPSEEK_API_KEY` | `.env.local` | Required |
| `JWT_SECRET` | Defaults to dev fallback | Required |
| `DATABASE_URL` | `file:./prisma/dev.db` | Required for build |
| `TURSO_DATABASE_URL` | Not needed | Required |
| `TURSO_AUTH_TOKEN` | Not needed | Required |

## Vercel Deployment

**Critical: local dev works ≠ Vercel works.** The two environments use completely different database connections. Any change to `lib/db.ts`, `prisma/schema.prisma`, or migrations MUST be validated against both paths.

### Pre-push verification

```bash
npm run typecheck     # Must pass
npm run build         # MUST PASS — gatekeeper for Vercel
npm run lint          # Should pass
npm test              # Should pass (19 tests)
```

### How to test the Turso path locally

```bash
TURSO_DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." node -e "
const { PrismaLibSql } = require('@prisma/adapter-libsql');
const { PrismaClient } = require('@prisma/client');
(async () => {
  const adapter = new PrismaLibSql({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  const db = new PrismaClient({ adapter });
  const u = await db.user.findUnique({ where: { username: 'lbh' } });
  console.log('Turso OK, user:', u?.username ?? 'not found');
  await db.\$disconnect();
})().catch(e => { console.error('Turso FAIL:', e.message); process.exit(1); });
```

### Build pipeline (Vercel)

```
git push → Vercel
  ├─ npm install → postinstall: prisma generate (needs DATABASE_URL, has fallback in prisma.config.ts)
  ├─ npm run build
  │   ├─ scripts/migrate-turso.mjs (Turso vars required, 60s timeout, snapshot detection)
  │   └─ next build
  └─ Deploy → cold start: PrismaClient connects to Turso via adapter
```

### Vercel runtime failures

When it works locally but 500s on Vercel:
1. **Vercel Function Logs**: Dashboard → Functions → click route → Logs tab
2. **All API errors now return real messages** — no more generic "Internal server error". The frontend displays the actual error.
3. **Test Turso connectivity**: `turso db shell ai-role-chat ".tables"`
4. **Prisma version mismatch**: `@prisma/adapter-libsql`, `@prisma/client`, `prisma` must be same major version

### After deployment, verify

```bash
curl https://your-app.vercel.app/api/auth/login -H "Content-Type: application/json" -d '{"username":"testuser","password":"test1234"}'
curl https://your-app.vercel.app/api/characters
```

### Database connection: common failure points

1. **Prisma version mismatch** — all three Prisma packages must be same major (^7.x.x)
2. **Turso credentials** — expired or wrong token → all DB queries fail
3. **Schema drift** — schema changed without migration → Prisma Client types don't match DB
4. **New migration not in snapshot detection** — `migrate-turso.mjs` `isMigrationAlreadyApplied()` switch must include new migrations

## Debugging

**Local API debugging:**
```bash
curl -s http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"test","password":"test1234"}' | jq .
curl -s http://localhost:3000/api/characters | jq .
```

**Database inspection:**
```bash
npx prisma studio                  # GUI on port 5555
sqlite3 prisma/dev.db ".tables"
sqlite3 prisma/dev.db "SELECT * FROM User;"
```

**Frontend debugging:**
- All pages are `"use client"` — React DevTools work
- Auth: `token` cookie is httpOnly (can't read from JS)
- Streaming: Network tab → `/api/chat` → response as text/plain chunks
- localStorage keys: `theme`, `locale`, `chat-settings` (temperature, maxTokens, persona)

## What was removed (v2 architecture slimdown)

- World Books system (file-based, Vercel-incompatible)
- Swipe/regenerate multi-reply variants
- Demo account (in-memory, lost on cold start)
- Admin user management panel
- JSONL import/export
- File-based character storage (now fully DB-backed)
- All `fs` module usage — zero remaining
