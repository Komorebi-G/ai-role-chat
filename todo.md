# TODO

## Vercel Cloud Reliability (ongoing)

- [ ] **Character CRUD uses `fs.writeFileSync`** — works locally, fails on Vercel Serverless (no writable filesystem). Characters created/edited via admin panel won't persist after deploy. Options: migrate to DB-backed character storage, or make file-based ops Vercel-compatible via Turso/blob storage.
- [ ] **Demo account is fully in-memory** (`lib/demo-store.ts`) — `Map`-based storage lost on cold start, not shared across Vercel instances. Demo conversations/messages disappear unpredictably in production.
- [ ] **Rate limiting is in-memory** (`lib/ai.ts`) — per-instance sliding window. Multiple Vercel instances each have independent counters, so effective rate limit = 30 × N instances, not 30.

## Features (P1)

- [ ] **Swipe UI navigation** — data structure exists (swipes JSON array + swipeId in DB), but frontend needs ◂ N/M ▸ controls for switching between reply variants on assistant messages.
- [ ] **World Info frontend management** — world books can only be created/edited via API or direct JSON editing. Needs a UI panel for managing world entries (add/edit/delete keys and content).

## Features (P2)

- [ ] **PNG character cards** — embed character JSON in PNG tEXt chunk, import/export character cards as images (V1 SillyTavern spec).
- [ ] **Real tokenizer** — replace character-count estimation in `lib/chat/context.ts` with `tiktoken` or DeepSeek-compatible tokenizer for accurate context budget management.
- [ ] **Prompt debug panel** — frontend panel showing the fully assembled system prompt sent to the AI, with per-layer token counts. Essential for debugging prompt assembly.
- [ ] **Advanced World Info** — recursion (matched entries can trigger other entries), sticky (pin entries for N turns), cooldown (prevent re-triggering for N turns).
- [ ] **Multi-character group chat** — select multiple characters, AI responds in-character for each, user messages addressed to all.
- [ ] **Plugin system** — extension points for custom prompt transformers, UI components, API middleware.

## Polish

- [ ] **Mobile PWA** — service worker, offline support, install prompt.
- [ ] **i18n** — full translation coverage (currently partial: login page and basic UI strings in `lib/i18n/`).
