# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server (port 3000)
npm run build                  # Production build (migrate-turso + next build)
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

# Turso (production database, migrations auto-applied during Vercel build)
turso db shell ai-role-chat ".tables"
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

| Variable | Local | Vercel |
|---|---|---|
| `DEEPSEEK_API_KEY` | `.env.local` | Required |
| `JWT_SECRET` | Defaults to `"dev-secret-change-in-production"` | Required |
| `DATABASE_URL` | `file:./dev.db` | Not needed |
| `TURSO_DATABASE_URL` | Not needed | Required |
| `TURSO_AUTH_TOKEN` | Not needed | Required |

## SillyTavern Analysis Reference

`sillytavern_feature_analysis.md` contains a deep analysis of SillyTavern's architecture, covering: character card V1/V2/V3 specs, PromptManager order system, token budget management, World Info activation/recursion, swipe data model, JSONL chat storage, mobile layout, settings layering, and PNG metadata embedding. Refer to it when designing new features.

## Pending Work (see todo.md)

The current todo.md tracks a phased implementation plan:
- **P0**: Character card JSON, Prompt Builder, context trimming, chat API, mobile UX (already mostly done)
- **P1**: Swipe/reply variants (data structure exists, UI needs swipe navigation), simplified World Info (keyword-based lorebook), README
- **P2**: PNG character cards, real tokenizer, prompt debug panel, advanced World Info (recursion, sticky, cooldown), multi-character group chat, plugin system



# AI Role Chat — Autonomous Development Rules

这是一个长期持续迭代的 AI Role Chat 项目。

目标：
构建一个以手机端体验为核心、接近 SillyTavern 深度角色扮演能力的 AI 聊天应用。

技术栈：
- Next.js App Router
- TypeScript
- Tailwind
- SQLite (local)
- Turso (production)
- DeepSeek API
- SSE Streaming

==================================================
# CORE PRODUCT DIRECTION
==================================================

产品核心：

1. 手机端优先
2. 类微信聊天体验
3. 强角色扮演沉浸感
4. SillyTavern 风格 prompt stack
5. 长期记忆与上下文管理
6. 流式响应体验
7. 高可扩展性
8. AI-native interaction

==================================================
# UI / UX RULES
==================================================

UI 必须：

- 优先优化移动端
- 默认适配竖屏
- 输入框固定底部
- 注意 iPhone safe area
- 类微信气泡布局
- 动画轻量自然
- 不允许廉价后台管理风 UI
- 减少“网页感”
- 强调沉浸感

聊天体验：

- thinking 状态自然
- AI 回复不要突然闪出
- 支持流式生成
- 避免布局跳动
- Markdown 渲染稳定
- 长文本滚动自然

==================================================
# ARCHITECTURE RULES
==================================================

必须遵守：

- 小步迭代
- 避免无意义大重构
- 优先局部修改
- 保持结构清晰
- 避免过度工程化
- 新功能必须可验证
- 保持代码可读性

禁止：

- 随意删除旧功能
- 未验证直接宣布完成
- 引入明显复杂依赖
- 无理由重写已有模块

==================================================
# ROLEPLAY SYSTEM RULES
==================================================

Prompt stack 顺序必须稳定：

1. system
2. world/system extensions
3. character card
4. example dialogues
5. memory
6. recent chat history

上下文管理：

- 必须支持 FIFO trimming
- 避免 prompt 爆炸
- 保持角色一致性
- 尽量减少角色崩坏

角色系统：

- 支持角色卡导入导出
- 支持 JSON character cards
- 兼容 SillyTavern 思想
- 允许未来扩展世界书/lorebook

==================================================
# DEVELOPMENT LOOP RULES
==================================================

每轮迭代必须：

1. 先分析现有代码
2. 阅读 TODO.md
3. 阅读 SHARED_TASK_NOTES.md
4. 阅读 CHANGELOG.md
5. 理解当前目标
6. 再开始实现

每轮结束必须：

1. 验证功能
2. 尝试运行 build
3. 检查 lint
4. 更新 CHANGELOG.md
5. 更新 SHARED_TASK_NOTES.md
6. 更新 TODO.md 状态

==================================================
# AUTONOMOUS BEHAVIOR
==================================================

允许主动：

- 发现 bug
- 修复问题
- 优化 UI
- 优化 prompt
- 改善移动端体验
- 提高稳定性
- 增加合理功能
- 完善项目结构

如果发现：

- 明显 UX 问题
- 技术债务
- 结构混乱
- 重复代码
- prompt 不合理

允许自主处理。

==================================================
# PRIORITY ORDER
==================================================

优先级：

1. 手机端体验
2. 聊天沉浸感
3. 流式响应稳定性
4. 角色扮演质量
5. UI 美观
6. 性能
7. 可扩展性
8. 管理功能

==================================================
# LONG TERM GOALS
==================================================

长期目标：

- 接近 SillyTavern 核心体验
- 接近原生 App 体验
- 高质量移动端聊天 UI
- 稳定角色扮演
- 多角色支持
- 长上下文管理
- AI companion experience

==================================================
# IMPORTANT
==================================================

不要：

- 提前宣布完成
- 跳过验证
- 只改 UI 不验证逻辑
- 生成占位代码
- 留下明显 TODO 不处理

如果某轮无法彻底解决问题：
必须记录到 SHARED_TASK_NOTES.md，
交给下一轮继续处理。