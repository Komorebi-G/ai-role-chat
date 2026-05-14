# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server (port 3000)
npm run build                  # Production build (migrate-turso + next build)
npm run lint                   # ESLint (flat config: eslint .)
npm run typecheck              # tsc --noEmit
npm run test                   # vitest run (41 tests, 4 files)
npx vitest run --pool=forks    # Fork pool (avoids SQLite concurrency timeouts)
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

Prisma schema has five models (sixth `RateLimit` not listed — see below):
- **User** — id, username (unique), passwordHash (bcrypt), role (default `"user"`), createdAt. Has `messages[]` and `conversations[]` relations, both cascade on delete.
- **Conversation** — id, userId, characterId, title (default "New Chat"), worldState (JSON, default `"{}"`, stores `WorldState` { sticky, cooldown } for World Info tracking), type ("single" default, or "group"), characterIds (JSON string array for group chats), createdAt. Has `messages[]`.
- **Message** — id, userId, characterId, conversationId, role, content, swipes (JSON string array of reply variants), swipeId (current index), createdAt. Cascade-deletes with both User and Conversation.
- **Asset** — id, type ("character" or "world"), data (JSON string), createdAt, updatedAt. Stores character/world JSON blobs, replacing filesystem-based storage for Vercel compatibility. Auto-seeded from `characters/` and `worlds/` directories on first load when DB is empty.
- **RateLimit** — id, userId (unique), requestCount, windowStart. DB-backed sliding-window rate limiting for cross-instance coordination on Vercel. `lib/ai.ts` also keeps an in-memory fast path to skip DB calls within the same instance.

### Auth flow

`lib/auth.ts` — JWT via `jose`. Token in `token` httpOnly cookie (7-day expiry). Exports:
- `requireAuth()` — throws `"Unauthorized"` if no session.
- `getSession()` — returns userId or null without throwing.

**Auth endpoints:**
- `POST /api/auth/login` — `{ username, password }` → sets `token` httpOnly cookie (7-day JWT)
- `POST /api/auth/logout` — clears `token` cookie
- `GET /api/auth/me` — returns current user info from session
- `POST /api/auth/register` — create new user account

**Hardcoded accounts** in `app/api/auth/login/route.ts`:
- **Demo** — `123` / `123`. Creates a DB-backed user (`demo_<sessionId>`), isolated per browser via `demo_sid` cookie. Data persists across cold starts and Vercel instances.
- **Admin** — `lbh` / `lbh`. Auto-created in DB on first login with `role: "admin"`.

### i18n

`lib/i18n/index.tsx` — React context provider with `useLocale()` and `useTranslation()` hooks. Supports `"en"` (default) and `"zh-CN"`. Language detection: checks `localStorage("locale")` first, then `navigator.language` (starts with "zh" → zh-CN, else en). Translation strings in `locales/en.ts` and `locales/zh-CN.ts` (flat key-value maps). Frontend components use `<T key="..." />` shorthand.

### AI pipeline

```
app/api/chat/ → lib/prompt/buildPrompt.ts → lib/chat/context.ts → lib/tokenizer.ts → lib/ai.ts → lib/deepseek.ts → api.deepseek.com/v1/chat/completions
```

- **`lib/deepseek.ts`**: raw fetch to DeepSeek API (model: `deepseek-v4-flash`, temp 0.8, max_tokens 1024). Two exports: `chatWithDeepSeek(messages, signal?, options?)` and `chatWithDeepSeekStream(messages, signal?, options?)` (async generator for SSE streaming via `ReadableStream.getReader()`). Both accept optional `AbortSignal` and `ModelOptions` (temperature, maxTokens).
- **`lib/ai.ts`**: wraps DeepSeek with DB-backed per-user rate limiting (30 req/min sliding window, `RateLimit` table) plus an in-memory fast path, and 30-second `AbortController` timeout. Two async exports: `aiChat()` and `aiChatStream()`.
- **`lib/prompt/buildPrompt.ts`**: async layered prompt assembly — system rules → user persona → world info (before) → character system_prompt → character card info → world info (after) → example dialogue → trimmed history → post_history_instructions → user input. Accepts optional `worldBefore`/`worldAfter` arrays (pre-computed by the chat route to avoid double-calling `getActiveWorldEntries`). Output as `Promise<ChatMessage[]>`.
- **`lib/world/index.ts`**: loads world books from `worlds/`, matches entries by keyword against recent history, returns active entries split into before/after character groups injected into the system prompt.
- **`lib/tokenizer.ts`**: token counting via `gpt-tokenizer` (cl100k_base encoding, compatible with DeepSeek). Exports `countTokens(text)` and `countMessageTokens(messages)`. Replaces the old character-count `/ 4` estimation.
- **`lib/chat/context.ts`**: FIFO history trimming (default 20 messages / 4000 tokens). Uses `lib/tokenizer.ts` for accurate token counting instead of character-count estimation.

Streaming flow: POST body includes `stream: true` → route returns a `ReadableStream` (text/plain) → frontend reads with `reader.read()` and progressively renders into assistant message bubble. Full reply saved to DB after streaming completes.

Group chat streaming: When `characterIds` is sent, each character's response is preceded by `\n[GROUP_CHAR:id|name]\n` and the stream ends with `\n[GROUP_END]\n`. The frontend parses these delimiters to create separate message bubbles per character. The `X-Group-Chat: 1` response header signals group chat mode.

**Prompt debug** (`/api/chat/prompt-debug`): POST `{ characterId, persona?, conversationId?, content? }` returns the fully assembled prompt messages array. No AI call — purely for debugging prompt assembly.

**Chat import** (`/api/chat/import`): POST with external chat data, creates a new conversation with imported messages.

### Characters

Stored in `Asset` table (type="character"), auto-seeded from `characters/` JSON files on first load. Schema in `lib/character.ts`:

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

Key functions (all async — DB-backed with in-memory cache):
- `getAllCharacters()` — returns all characters, falls back to built-in if empty
- `getCharacter(id)` — find by id
- `getDefaultCharacter()` — first character or fallback
- `saveCharacter(id, data)` — upsert to Asset table, invalidates cache
- `getCharacterJson(id)` — raw JSON from DB (for merge-on-update)
- `characterExists(id)` — check if character asset exists
- `reloadCharacters()` — invalidate in-memory cache (forces re-read from DB next call)

Auto-seed: first call checks DB; if empty, reads `characters/` directory and seeds Asset table. Works on both local dev and Vercel (JSON files are in the deployment package).

**Character API** (`app/api/characters/route.ts`):
- GET — list all or by `?id=X` (any authenticated user), `?id=X&format=png` returns PNG character card
- POST — create (admin only, writes to Asset table)
- PUT — update by `?id=X` (admin only, merges with existing JSON from DB)

**PNG Character Cards** (`lib/character-card.ts`) — SillyTavern V1-compatible:
- `generateCharacterCard(characterData)` → PNG `Buffer` (400×600 gradient with JSON in tEXt "chara" chunk as base64)
- `extractCharacterCard(pngBuffer)` → parsed character object or null
- Import: POST `/api/characters/import-card` (multipart, admin-only) — extracts JSON from PNG tEXt chunk and saves
- Frontend: export button downloads `.png`, import file input accepts `.json,.png`

### World Books

Stored in `Asset` table (type="world"), auto-seeded from `worlds/` JSON files on first load. Schema in `lib/world/index.ts`:

| Field | Notes |
|---|---|
| `id` | Unique identifier |
| `name` | Display name |
| `description` | Optional description |
| `entries[]` | Array of `{ id, keys[], content, enabled, position, order, recursive?, sticky?, cooldown? }` |
| `recursive` | If true, this entry's content is scanned for keywords that can trigger other entries |
| `sticky` | Number of turns to keep entry active after matching (0 = not sticky) |
| `cooldown` | Number of turns to prevent re-triggering after activation (0 = no cooldown) |

Key functions (all async — DB-backed with in-memory cache):
- `getAllWorldBooks()` — returns all world books
- `getWorldBook(id)` — find by id
- `getActiveWorldEntries(history, maxMessages?, worldState?)` — scans recent messages for keyword matches with recursion/sticky/cooldown support. Returns `{ before, after, state: WorldState }`. State tracks `{ sticky, cooldown }` counters keyed by entry ID.
- `saveWorldBook(id, data)` — upsert to Asset table, invalidates cache
- `deleteWorldBook(id)` — delete from Asset table, invalidates cache
- `reloadWorldBooks()` — invalidate in-memory cache

`WorldState` is persisted on `Conversation.worldState` (JSON string, default `"{}"`). The chat route reads it before computing active entries and writes the updated state back after. State only advances on POST (user message), not on GET (page load).

Auto-seed behavior same as characters: first call checks DB, falls back to filesystem if empty.

**World API** (`app/api/worlds/route.ts`): GET/POST/PUT/DELETE, admin-only for write operations. All write operations now use DB (Vercel-compatible).

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

`app/chat/page.tsx` — single-page WeChat-style chat app. Modals are extracted to separate components:
- `AdminModal.tsx` — user management, DB stats (admin only)
- `CharacterFormModal.tsx` — create/edit character form
- `PromptDebugModal.tsx` — view assembled prompt with per-layer token counts
- `SettingsModal.tsx` — temperature, max tokens, persona settings
- `WorldInfoModal.tsx` — create/edit world book entries

`app/chat/types.ts` — shared frontend types (Character, Message, ConversationSummary, AdminUser, WorldBook, WorldEntry, ChatSettings).

Main page features:
- Character list view (avatar + name + preview) when no character selected
- Chat view with fixed top nav (back button + name + more menu), message area, fixed bottom input bar
- Drawer for character/conversation switching
- More menu: conversations, new chat, settings, theme toggle, edit character, clear chat, logout
- Streaming display with `thinking` state (shows "Thinking..." until first chunk, then assistant bubble)
- ReactMarkdown rendering, copy, regenerate
- Swipe navigation (◂ N/M ▸) on assistant messages
- Import/export, theme toggle (light/dark via `data-theme` attribute)

`app/globals.css` — CSS variables (`:root` for light, `[data-theme="dark"]` for dark). Responsive at 768px (sidebar becomes drawer). WeChat-style bubbles with triangle arrows.

Dark mode: inline `<script>` in `app/layout.tsx` reads localStorage before paint (FOUC prevention).

### PWA (Progressive Web App)

`public/manifest.json` — PWA manifest (`display: standalone`, WeChat-green `theme_color`, `start_url: /chat`).

`public/sw.js` — Service worker with three cache strategies:
- **Cache-first** (JS/CSS/fonts/images): serve cached, refresh cache in background
- **Network-first** (navigation): fetch from network, cache on success, fallback to cached `/chat`
- **Network-first with caching** (API GET): fetch from network, cache on success, fallback to `{"error":"Offline"}` JSON
- **Network-only** (API mutations): let the browser handle — offline mutations fail gracefully
- Cache name `ai-role-chat-v2` — bump version to invalidate old caches on activate

Frontend PWA features in `app/chat/page.tsx`:
- Install banner: listens for `beforeinstallprompt` event (Chrome/Android), shows banner with Install button
- iOS hint: detects iOS Safari (userAgent), shows "Tap Share → Add to Home Screen" after 5s, dismissed via localStorage
- Offline detection: listens for `online`/`offline` events, amber banner when offline
- SW registration: inline `<script>` in `app/layout.tsx` body

ESLint: `eslint.config.mjs` defines worker globals (`self`, `caches`, `fetch`, `Response`, `URL`) for `public/sw.js`.

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
npm test              # Should pass (41 tests, vitest.config.ts)
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

#### Methodology: Systematic API-First Debugging

When users report bugs (especially AI behavior issues like "characters not speaking"), follow this proven workflow. **Never guess — trace the data.**

**Step 1: Start dev server and bypass the frontend entirely.** Test the API directly with curl. This eliminates frontend rendering as a variable and lets you isolate server-side vs client-side issues.

```bash
npm run dev &    # Start server in background
sleep 3          # Wait for it to be ready
```

**Step 2: Deal with proxy interference.** WSL/Windows environments often set `http_proxy`/`ALL_PROXY` env vars that route localhost traffic through a proxy. Curl commands against localhost will fail with 502 or empty responses. Fix with `--noproxy '*'`:

```bash
# Login — use cookie jar, NOT manual token extraction
curl -s --noproxy '*' -c /tmp/cookies.txt http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"123","password":"123"}'

# All subsequent requests use the cookie jar
curl -s --noproxy '*' -b /tmp/cookies.txt http://localhost:3000/api/characters | jq '.[].id'
```

**Step 3: Add temporary `console.error` logging to see raw vs processed data.** This is the single most effective debugging technique. Log what the AI returns BEFORE any post-processing, and log it AFTER:

```typescript
console.error(`[DEBUG ${ch.name}] raw (${fullReply.length}): ${fullReply.slice(0, 200)}`);
const stripped = stripCrossCharacterText(fullReply, ch.name);
console.error(`[DEBUG ${ch.name}] stripped (${stripped.length}): ${stripped.slice(0, 200)}`);
```

Then restart the server with stderr redirected to a file so you can inspect the logs:

```bash
nohup npm run dev > /tmp/stdout.log 2> /tmp/stderr.log &
# ... run tests ...
cat /tmp/stderr.log | grep "DEBUG"
```

**Step 4: Test multi-round conversations.** AI behavior bugs often only appear after several rounds when problematic patterns accumulate in the history. Run at least 5-8 rounds:

```bash
for i in 1 2 3 4 5 6 7 8; do
  RESP=$(curl -s --noproxy '*' -b /tmp/cookies.txt http://localhost:3000/api/chat \
    -H "Content-Type: application/json" \
    -d '{"characterIds":["alice","ben","testchar"],"message":"Round '$i'","stream":false}')
  echo "$RESP" | jq '[.replies[] | {name: .characterName, len: (.content | length)}]'
done
```

Track which character goes silent and at what round — this pinpoints when the degradation starts.

**Step 5: Trace the data end-to-end.** Once you spot the symptom (e.g., "赵煜 goes silent at round 3"), trace the full path:

1. **What does the AI actually return?** → Raw `fullReply` from `aiChatStream`
2. **What does post-processing produce?** → After `stripCrossCharacterText`
3. **What's saved to DB?** → Query with curl: `GET /api/chat?characterId=alice&conversationId=...`
4. **What does the frontend receive?** → Check the streaming response text

**Step 6: When dealing with AI format continuation bugs**, remember this principle:
> The AI model is a text completion engine — it will naturally continue ANY format pattern it sees repeated in the prompt. If you put `[Name]: text` in the message content, the model will generate more `[Name]: text`. The fix is to move speaker identity OUT of the content and into message metadata (the OpenAI `name` field), which the model sees but doesn't treat as completable text.

**Step 7: Verify with the full build pipeline** before declaring a fix complete:

```bash
npm run typecheck && npm run build && npx vitest run --pool=forks
```

#### Quick API Testing (curl recipes)

**Local API debugging:**

```bash
# Test auth
curl -s --noproxy '*' http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"123","password":"123"}' | jq .

# Test characters
curl -s --noproxy '*' http://localhost:3000/api/characters | jq .

# Chat with cookie jar
curl -s --noproxy '*' -c /tmp/cookies.txt http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"123","password":"123"}' > /dev/null
curl -s --noproxy '*' -b /tmp/cookies.txt http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"characterId":"alice","message":"hello"}' | jq .

# Group chat (non-streaming)
curl -s --noproxy '*' -b /tmp/cookies.txt http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"characterIds":["alice","ben"],"message":"hi","stream":false}' | jq .

# Group chat (streaming) — see raw delimiters and content
curl -s --noproxy '*' -b /tmp/cookies.txt http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"characterIds":["alice","ben"],"message":"hi","stream":true}'

# Verify saved messages in DB
curl -s --noproxy '*' -b /tmp/cookies.txt \
  "http://localhost:3000/api/chat?characterId=alice&conversationId=<ID>" | jq '[.messages[] | {role, characterId, content: .content[0:100]}]'
```

**AI pipeline debugging:**
- Set `NODE_ENV=development` and check server console for `console.error` output during chat requests
- The full assembled messages array sent to DeepSeek is logged before the fetch call in `lib/deepseek.ts`
- Rate limiting events are logged in `lib/ai.ts` — check for "Rate limit exceeded" in console
- Stream response errors appear in the server console, not in the browser
- For prompt debugging without AI calls: use `POST /api/chat/prompt-debug` to see the assembled prompt

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

**P2:** Plugin system — extension points for custom prompt transformers, UI components, API middleware.
