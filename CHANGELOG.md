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
