# Changelog

## Round 1 — Settings Panel ✅
- `app/chat/page.tsx` — SettingsModal, localStorage persistence
- `app/globals.css` — settings styles
- `app/api/chat/route.ts` — POST accepts `temperature`, `maxTokens`
- `lib/ai.ts` — `aiChat` accepts `ModelOptions`

## Round 2 — Markdown Rendering ✅
- `app/chat/page.tsx` — react-markdown for message content
- `app/globals.css` — markdown styles (p, ul, ol, code, pre, blockquote, etc.)

## Round 3 — Character Creation UI ✅
- `app/chat/page.tsx` — CreateCharacter modal form
- `app/globals.css` — form-input, form-textarea styles
- `app/api/characters/route.ts` — POST handler (admin-only)
- `lib/character.ts` — `reloadCharacters()` cache invalidation
- `lib/prompt/buildPrompt.ts` — support `system_prompt`, `mes_example`

## Round 4 — AI Streaming ✅
- `lib/deepseek.ts` — `chatWithDeepSeekStream` async generator (SSE)
- `lib/ai.ts` — `aiChatStream` async generator (rate limit + timeout)
- `app/api/chat/route.ts` — POST returns ReadableStream when `stream: true`
- `app/chat/page.tsx` — `reader.read()` progressive rendering

## Round 5 — Multiple Conversations ✅
- `prisma/schema.prisma` — Conversation model, conversationId on Message
- `app/api/conversations/route.ts` — GET list, POST create
- `app/api/chat/route.ts` — conversationId support, auto-create default
- `app/chat/page.tsx` — conversation sublist, New Chat button
- `app/globals.css` — conversation-sublist, conv-item, new-chat-btn styles

## Round 6 — Mobile Responsive ✅
- `app/chat/page.tsx` — sidebarOpen state, hamburger, overlay
- `app/globals.css` — @media (max-width: 768px) slide-in drawer

## Round 7 — Message Actions ✅
- `app/chat/page.tsx` — handleCopy (clipboard), handleRegenerate (resend + stream)
- `app/globals.css` — .message-actions (hover), .msg-action-btn

## Round 8 — Dark Mode ✅
- `app/globals.css` — CSS variables (:root light + [data-theme="dark"] dark)
- `app/layout.tsx` — inline script for FOUC prevention
- `app/chat/page.tsx` — theme state, toggle button

## Round 9 — Character Editing ✅
- `app/api/characters/route.ts` — PUT handler (admin-only)
- `app/chat/page.tsx` — editingCharId state, startEditChar, pre-filled form
- `app/globals.css` — .char-edit-btn (hover reveal)

## Round 10 — Character Import/Export ✅
- `app/chat/page.tsx` — handleExportChar (download JSON), handleImportChar (upload + POST)
- `app/globals.css` — .char-admin-actions, .import-label, .import-input

## Round 11 — Swipe Reply Variants ✅
- `prisma/schema.prisma` — Message 模型添加 swipes (JSON array) + swipeId
- `prisma/migrations/20260509174233_add_swipes/migration.sql` — 重建 Message 表
- `app/api/chat/route.ts` — POST regenerate: true 追加新 swipe; PATCH 切换 swipeId
- `app/chat/page.tsx` — handleSwipe 左右切换, ◂ N/M ▸ UI

## Round 12 — World Info / Simplified Lorebook ✅
- `worlds/default.json` — 空起始世界书
- `lib/world/index.ts` — getActiveWorldEntries 关键词匹配
- `lib/world/index.test.ts` — 8 个测试覆盖匹配、分组、禁用、窗口等
- `lib/prompt/buildPrompt.ts` — 注入 world info 到 system prompt
- `app/api/worlds/route.ts` — CRUD API (admin only for write)

## Round 13 — Persona, Token Bar, Search, JSONL, Card Extensions ✅
- Persona: ChatSettings.persona, buildPrompt 注入 [User Persona], 前端 textarea
- Token bar: 消息区域顶部 3px 进度条 (绿/黄/红)
- Search: Nav bar 搜索按钮, 过滤消息 + 匹配计数
- JSONL Export: handleExportJsonl, "Export as JSONL" 按钮
- Card fields: post_history_instructions, alternate_greetings, creator, character_version
- Character create/edit modal 已添加所有新字段输入

## Round 14 — Audit & Verification ✅
- mes_example 按 <START> 分隔符解析 (SillyTavern 标准)
- buildPrompt 新增 persona/world-info/post_history_instructions/<START> 测试 (25 tests total)
- README.md 全面更新: 角色卡格式、世界书格式、Swipe 机制、目录结构
- VERIFY_REPORT.md 创建: 环境、命令验证、功能验证 (56 项)
- IMPLEMENTATION_LOG.md 创建: 实现追踪
- TODO.md 重写为结构化审计格式
- `app/globals.css` — .char-admin-actions, .import-label, .import-input
