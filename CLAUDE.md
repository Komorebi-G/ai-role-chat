# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server (port 3000)
npm run build                  # Production build (migrate-turso + next build)
npm run lint                   # ESLint (flat config: eslint .)
npm run typecheck              # tsc --noEmit
npm run test                   # vitest run (25 tests, 3 files)
npx vitest                     # Watch mode
npx vitest run <path>          # Run a single test file
npx prisma migrate dev         # Apply pending migrations + regenerate client
npx prisma generate            # Regenerate Prisma client only

# Git workflow
git add <files>                 # Stage specific files (never use -A blindly)
git commit -m "..."             # Commit with descriptive message
git push                        # Push to origin/master → Vercel auto-deploys

# push.sh — safe push with Prisma version check, auto-commits uncommitted changes
./push.sh

# Turso (production database, migrations auto-applied during Vercel build)
turso db shell ai-role-chat ".tables"

# Setup from scratch
cp .env.example .env.local      # Then edit .env.local with DEEPSEEK_API_KEY
npx prisma migrate dev          # Initialize local SQLite database
```

`DATABASE_URL` is in `.env` (local) and `.env.local`. Prisma CLI reads `.env`, Next.js reads `.env.local`.

## Project Direction

This project is evolving toward a **SillyTavern-inspired AI role-play chat platform**, learning from SillyTavern's design philosophy without copying its implementation. Key design principles:

- **Character cards as first-class citizens** — JSON files with layered prompt fields (name, description, personality, scenario, first_mes, mes_example, system_prompt, post_history_instructions, tags), loaded from `characters/` directory
- **Layered prompt assembly** — system rules → character system_prompt → persona → description → personality → scenario → world info → example dialogue → chat history → post-history instructions. Each layer has its own position and priority.
- **Token budget-driven context management** — not "truncate when full", but "per-component budgets with priority-based degradation"
- **Swipe/regenerate as core UX** — AI replies support multiple variants, user can switch between them
- **World Info (simplified lorebook)** — conditional prompt injection triggered by keyword matching in recent messages
- **Mobile-first WeChat-style UI** — 480px centered container, fixed bottom input, drawer sidebar

## Architecture

### Database: dual-path SQLite (local file vs remote Turso)

`lib/db.ts` switches at module init based on environment variables. **These two paths use the same adapter class but connect to completely different databases — local dev never touches Turso, Vercel never touches local files.**

- **Local dev** (no Turso vars): `PrismaLibSql({ url: "file:./prisma/dev.db" })` → local SQLite file. Connection is instant.
- **Production Vercel** (Turso vars set): `PrismaLibSql({ url: tursoUrl, authToken })` → remote Turso over HTTPS. Cold starts add 1-3s latency.

Both paths use `@prisma/adapter-libsql`, so the Prisma Client API is identical — queries, relations, cascades work the same. The difference is only the underlying connection.

Prisma schema has three models:
- **User** — id, username (unique), passwordHash (bcrypt), role (default `"user"`), createdAt. Has `messages[]` and `conversations[]` relations, both cascade on delete.
- **Conversation** — id, userId, characterId, title (default "New Chat"), createdAt. Has `messages[]`.
- **Message** — id, userId, characterId, conversationId, role, content, createdAt. Cascade-deletes with both User and Conversation.

### Auth flow

`lib/auth.ts` — JWT via `jose`. Token in `token` httpOnly cookie (7-day expiry). Exports:
- `requireAuth()` — throws `"Unauthorized"` if no session.
- `getSession()` — returns userId or null without throwing.
- `DEMO_USER_ID = "demo"` — reserved ID for the demo account.

**Hardcoded accounts** in `app/api/auth/login/route.ts`:
- **Demo** — `123` / `123`. Fully in-memory (Map-based), isolated per browser via `demo_sid` cookie. Ephemeral — lost on server restart.
- **Admin** — `lbh` / `lbh`. Auto-created in DB on first login with `role: "admin"`.

### AI pipeline

```
app/api/chat/ → lib/prompt/buildPrompt.ts → lib/chat/context.ts → lib/ai.ts → lib/deepseek.ts → api.deepseek.com/v1/chat/completions
```

- **`lib/deepseek.ts`**: raw fetch to DeepSeek API (model: `deepseek-v4-flash`, temp 0.8, max_tokens 1024). Two exports: `chatWithDeepSeek(messages, signal?, options?)` and `chatWithDeepSeekStream(messages, signal?, options?)` (async generator for SSE streaming via `ReadableStream.getReader()`). Both accept optional `AbortSignal` and `ModelOptions` (temperature, maxTokens).
- **`lib/ai.ts`**: wraps DeepSeek with in-memory per-user rate limiting (30 req/min sliding window) and 30-second `AbortController` timeout. Two async exports: `aiChat()` and `aiChatStream()`.
- **`lib/prompt/buildPrompt.ts`**: layered prompt assembly — system rules → user persona → world info (before) → character system_prompt → character card info → world info (after) → example dialogue → trimmed history → post_history_instructions → user input. Output as `ChatMessage[]`.
- **`lib/world/index.ts`**: loads world books from `worlds/`, matches entries by keyword against recent history, returns active entries split into before/after character groups injected into the system prompt.
- **`lib/chat/context.ts`**: FIFO history trimming (default 20 messages / 8000 chars). Character-count estimation (no tokenizer).

Streaming flow: POST body includes `stream: true` → route returns a `ReadableStream` (text/plain) → frontend reads with `reader.read()` and progressively renders into assistant message bubble. Full reply saved to DB after streaming completes.

### Characters

JSON files in `characters/`. Schema in `lib/character.ts`:

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | Unique identifier (not necessarily the filename) |
| `name` | Yes | Display name |
| `description` | No | Defaults to `""` |
| `personality` | No | Defaults to `""` |
| `scenario` | No | Defaults to `""` |
| `first_mes` | No | Opening message (alias: `firstMessage`) |
| `mes_example` | No | Example dialogue lines |
| `system_prompt` | No | Character-specific instructions |
| `post_history_instructions` | No | Injected as system message after chat history |
| `alternate_greetings` | No | `string[]`, additional opening messages |
| `creator` | No | Character creator name |
| `character_version` | No | Version string |
| `creator_notes` | No | Display-only |
| `tags` | No | `string[]` |

Key functions:
- `getCharacterFilePath(id)` — scan directory for JSON file whose content id matches (filename may differ)
- `reloadCharacters()` — invalidate cache after file writes
- `normalizeCharacter()` — fill missing fields with empty strings
- `getAllCharacters()` — returns built-in fallback if directory is empty

**Character API** (`app/api/characters/route.ts`):
- GET — list all or by `?id=X` (any authenticated user)
- POST — create (admin only, writes `{id}.json`)
- PUT — update by `?id=X` (admin only, resolves filename via `getCharacterFilePath`)

### World Books

JSON files in `worlds/`. Schema in `lib/world/index.ts`:

| Field | Notes |
|---|---|
| `id` | Unique identifier |
| `name` | Display name |
| `description` | Optional description |
| `entries[]` | Array of `{ id, keys[], content, enabled, position, order }` |

`getActiveWorldEntries(history)` scans the last 10 messages for keyword matches, returns matched entries grouped by position (`beforeCharacter` / `afterCharacter`) for injection into the system prompt.

**World API** (`app/api/worlds/route.ts`): GET/POST/PUT/DELETE, admin-only for write operations.

### Swipe System

Messages have `swipes` (JSON string array of reply variants) and `swipeId` (index of current). Chat API:
- POST `regenerate: true` — appends new variant to last assistant message's swipes array
- PATCH `{ messageId, conversationId, swipeId }` — switches the active swipe
- Frontend shows ◂ N/M ▸ navigation on assistant messages with multiple swipes

### Persona

User can set a persona description in Settings (stored in localStorage). Sent with chat requests as `persona` field, injected into system prompt as `[User Persona]` section.

### Conversations

`app/api/conversations/route.ts`:
- GET `?characterId=X` — list conversations for current user + character
- POST `{ characterId, title? }` — create new conversation

Chat routes (`app/api/chat/route.ts`) all accept `conversationId`: GET loads messages for a conversation, POST sends with conversation context, DELETE clears a specific conversation. If conversationId is omitted, the latest conversation is auto-used or created.

### Frontend

All pages are `"use client"`. `app/page.tsx` is an auth gate (fetches `/api/characters`, redirects to `/chat` or `/login`).

`app/chat/page.tsx` — single-page WeChat-style chat app containing:
- Character list view (avatar + name + preview) when no character selected
- Chat view with fixed top nav (back button + name + more menu), message area, fixed bottom input bar
- Drawer for character/conversation switching
- More menu: conversations, new chat, settings, theme toggle, edit character, clear chat, logout
- Streaming display with `thinking` state (shows "Thinking..." until first chunk, then assistant bubble)
- ReactMarkdown rendering, copy, regenerate
- Settings modal (temperature/tokens, localStorage), character create/edit modal, admin panel
- Import/export, theme toggle (light/dark via `data-theme` attribute)

`app/globals.css` — CSS variables (`:root` for light, `[data-theme="dark"]` for dark). Responsive at 768px (sidebar becomes drawer). WeChat-style bubbles with triangle arrows.

Dark mode: inline `<script>` in `app/layout.tsx` reads localStorage before paint (FOUC prevention).

### Environment variables

| Variable | Local | Vercel | Used by |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | `.env.local` | Required | `lib/deepseek.ts` at runtime |
| `JWT_SECRET` | Defaults to `"dev-secret-change-in-production"` | Required | `lib/auth.ts` cookie signing |
| `DATABASE_URL` | `file:./prisma/dev.db` | Required for build | `prisma generate` (postinstall), local `lib/db.ts` |
| `TURSO_DATABASE_URL` | Not needed | Required | `migrate-turso.mjs` (build) + `lib/db.ts` (runtime) |
| `TURSO_AUTH_TOKEN` | Not needed | Required | `migrate-turso.mjs` (build) + `lib/db.ts` (runtime) |

**Vercel needs ALL FIVE variables set** in Settings → Environment Variables. Missing any = either build fails or runtime 500s.

`DATABASE_URL` is in `.env` (read by Prisma CLI) and `.env.local` (read by Next.js). Copy `.env.example` to `.env.local` for local setup.

## Vercel Deployment & Cloud Reliability

**Critical rule: local dev works ≠ Vercel works.** The two environments use completely different database connections via the same `lib/db.ts` conditional. Code that passes locally can still fail on Vercel because the Turso connection path is never exercised in local development.

### Database: two code paths, one file

`lib/db.ts` switches database connection at runtime based on environment variables:

```
TURSO_DATABASE_URL + TURSO_AUTH_TOKEN both set?
  ├─ YES → Vercel production path: PrismaLibSql({ url: tursoUrl, authToken })
  │         Connects to remote Turso (libsql://) over HTTPS
  │         This path is NEVER tested by npm run dev
  │
  └─ NO  → Local dev path: PrismaLibSql({ url: "file:./prisma/dev.db" })
            Connects to local SQLite file
```

Any change to `lib/db.ts`, `prisma/schema.prisma`, migrations, or Prisma package versions MUST be validated against BOTH paths.

### How to test the Vercel Turso path locally

Before pushing, simulate Vercel's database connection locally:

```bash
# Get Turso URL and token
turso db show ai-role-chat --url       # → TURSO_DATABASE_URL
turso db tokens create ai-role-chat    # → TURSO_AUTH_TOKEN

# Test with a quick script
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

Or run the full build locally with Turso vars to fully simulate Vercel:

```bash
TURSO_DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." npm run build
```

### Build pipeline (Vercel's perspective)

```
git push → Vercel detects branch change
  ├─ npm install
  │   └─ postinstall: prisma generate          ← needs DATABASE_URL (has fallback in prisma.config.ts)
  ├─ npm run build
  │   ├─ node scripts/migrate-turso.mjs         ← needs TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
  │   │   Uses @libsql/client directly, NOT Prisma
  │   │   Has 60s timeout, schema snapshot detection for idempotency
  │   └─ next build                             ← compiles all routes/pages
  └─ Deploy → serverless functions live
       └─ First request: cold start → PrismaClient({ adapter }) connects to Turso
```

### Pre-push mandatory verification

Every push must pass these checks. The build check is the most important because it's the closest simulation of Vercel:

```bash
npm run typecheck     # Must pass
npm run build         # MUST PASS — simulates Vercel build pipeline locally
npm run lint          # Should pass (flat config: eslint.config.mjs)
npm test              # Should pass (25 tests, vitest.config.ts)
```

**`npm run build` is the gatekeeper.** If it fails locally, it WILL fail on Vercel. This runs both `migrate-turso.mjs` (on local DB) and `next build`.

**`./push.sh` is the recommended push workflow** — it validates Prisma version consistency, auto-commits uncommitted changes, and pushes.

### Database connection: most common failure points

These are the things most likely to break on Vercel but work locally:

1. **Prisma version mismatch** — `@prisma/adapter-libsql`, `@prisma/client`, `prisma` must all be same major version. The adapter talks to the client internally; different majors = incompatible API. This caused repeated login crashes (see `docs/vercel-login-crash-analysis.md`).

2. **Turso credentials** — `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` must be set in Vercel dashboard (Settings → Environment Variables). Expired or wrong token = all DB queries fail at runtime.

3. **Schema drift** — if you modify `prisma/schema.prisma` without creating a migration, the Prisma Client types won't match the actual Turso tables. Always create a migration: `npx prisma migrate dev --name <name>`.

4. **New migration not in snapshot detection** — `migrate-turso.mjs` has an `isMigrationAlreadyApplied()` switch. New migrations must be added there or the build may fail with "table already exists".

5. **`prisma generate` needs valid URL** — `prisma.config.ts` requires a datasource URL. It now has a `file:./prisma/dev.db` fallback, but if that path is removed or renamed, Vercel build breaks at `postinstall`.

6. **Cold start timeout** — On Vercel's free tier, first request after inactivity triggers a cold start. Turso connection over HTTPS can take 1-3 seconds. The PrismaClient is cached on `globalThis` for warm requests.

### Debugging

**Local API debugging:**

```bash
# Test auth
curl -s http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"123","password":"123"}' | jq .

# Test characters
curl -s http://localhost:3000/api/characters | jq .

# Chat with cookie from login response
curl -s http://localhost:3000/api/chat -H "Content-Type: application/json" -b "token=<jwt>" -d '{"characterId":"alice","content":"hello"}'
```

**AI pipeline debugging:**
- Set `NODE_ENV=development` and check server console for `console.error` output during chat requests
- The full assembled messages array sent to DeepSeek is logged before the fetch call in `lib/deepseek.ts`
- Rate limiting events are logged in `lib/ai.ts` — check for "Rate limit exceeded" in console
- Stream response errors appear in the server console, not in the browser

**Database inspection locally:**

```bash
npx prisma studio                  # GUI on port 5555
sqlite3 prisma/dev.db ".tables"    # List tables
sqlite3 prisma/dev.db "SELECT * FROM User;"
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Message;"
```

**Frontend debugging:**
- All pages are `"use client"` — standard React DevTools work
- Auth state: check `token` cookie in Application → Cookies (httpOnly, can't read from JS)
- Streaming: open Network tab, filter for `/api/chat`, view the response as text/plain chunks
- localStorage keys: `theme`, `persona`, `temperature`, `maxTokens` (Settings panel)

**Vercel runtime failures (works locally, 500 on Vercel):**

1. **Vercel Function Logs**: Dashboard → Project → Functions → click the failing route → Logs tab
2. **PrismaClient init errors**: `lib/db.ts` detects adapter errors and prints version mismatch hint
3. **Test Turso connectivity**: `turso db shell ai-role-chat ".tables"` to verify credentials
4. **Isolate with curl**: `curl https://your-app.vercel.app/api/auth/login -H "Content-Type: application/json" -d '{"username":"123","password":"123"}'`

### After deployment, verify these endpoints

```bash
curl https://your-app.vercel.app/api/auth/login -H "Content-Type: application/json" -d '{"username":"123","password":"123"}'
# Should return: {"ok":true,"role":"user"}

curl https://your-app.vercel.app/api/characters
# Should return: [...] (JSON array, even if empty)
```

### Prisma package version lock

All three must stay on the same major version. `push.sh` enforces this before any push:

```bash
# Verify manually:
node -e "const p = require('./package.json').dependencies; console.log('adapter:', p['@prisma/adapter-libsql']); console.log('client:', p['@prisma/client']); console.log('prisma:', p['prisma'])"
# All should show same major: ^7.x.x
```

When upgrading: change all three together, run `npm install`, commit BOTH `package.json` and `package-lock.json`.

## Pending Work (see todo.md)

**Vercel reliability (ongoing):** Character CRUD uses `fs.writeFileSync` (fails on Vercel), demo account is in-memory, rate limiting is per-instance.

**P1:** Swipe UI navigation, World Info frontend management UI.

**P2:** PNG character cards, real tokenizer, prompt debug panel, advanced World Info (recursion/sticky/cooldown), multi-character group chat, plugin system.
