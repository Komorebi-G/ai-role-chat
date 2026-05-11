## Next iteration tasks

### P1: World Info — admin UI done, backfill real entries
- World Info admin modal is now in both character list view and chat view (admin-only)
- `worlds/default.json` has 3 sample entries. Verify they activate in chat by sending messages with matching keywords (e.g. "大学", "AI", "天气")
- Consider adding a "Create World Book" button (currently only editing the default book)
- The active world entries bar at the bottom of chat shows entry IDs when matched

### P1: Swipe persistence across page reloads
- Swipe variants work in-memory but if you reload the page mid-conversation, the current swipe index should be preserved (the PATCH route persists it, and the GET route returns swipes + swipeId — verify this works end-to-end)

### P2: Real tokenizer
- `lib/chat/context.ts` still uses char-count estimation (chars / 4)
- Consider using `tiktoken` or a simple BPE tokenizer for accurate token counting
- This affects the token budget bar accuracy

### Minor cleanup
- `ben.json` file has `id: "lbh"` — rename file to `lbh.json` or change the id to `ben` for consistency
- Model name `deepseek-v4-flash` is hardcoded in `lib/deepseek.ts` — consider making it configurable via env var
