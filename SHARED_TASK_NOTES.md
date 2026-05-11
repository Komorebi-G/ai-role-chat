## Next Iteration Suggestions

### Refactoring opportunities in `app/chat/page.tsx` (998 lines, ~22% smaller than before)

The page is still fairly large. The `handleCreateChar` submit handler (form serialization + API call) could be extracted to a helper. Settings/theme persistence helpers (loadSettings, saveSettings, loadTheme, applyTheme) could move to `lib/client-storage.ts`.

### P1 features to consider

1. **Real tokenizer** — replace char-count estimation in `lib/chat/context.ts` with `tiktoken` (or `@anthropic-ai/tokenizer`). The context trimming currently uses `totalChars / maxChars` which is a rough proxy.
2. **Prompt debug panel** — show the assembled prompt messages in a dev-only modal. Useful for debugging character cards and World Info.
3. **Advanced World Info** — add recursion depth, sticky entries, cooldown timers to the current keyword-based system in `lib/world/index.ts`.

### Current state

- `npm run build` ✅ | `npm run lint` ✅ (0 errors) | `npm run typecheck` ✅ | `npm run test` ✅ (25 passed)
- 3 new shared components in `components/`: `CreateCharModal`, `SettingsModal`, `AdminModal` — extracted from duplicate JSX in page.tsx
- Fixed i18n regression: the chat-view character edit form had hardcoded English labels (missed during initial i18n pass)
