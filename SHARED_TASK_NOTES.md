# Shared Task Notes — Round 15

## Done this round
- Fixed chat view character edit form using hardcoded English labels → now uses `t()` i18n
- Fixed hardcoded "Import" string in drawer footer
- Improved system prompt for better roleplay immersion (better global rules, cleaner character card)

## Known issues for next iteration

### Code quality
- `app/chat/page.tsx` is 1277 lines with duplicated modals (settings, create-char, admin appear in both character list view AND chat view). Extract into shared components when touching.
- `lib/prompt/buildPrompt.ts` — the `post_history_instructions` is a separate system message between history and user input. Works fine with DeepSeek but a real tokenizer would help budget it properly.

### UX improvements to consider
- The first greeting message (id="first_mes") creates unnecessary swipe PATCH API calls — handleSwipe should skip virtual messages
- Token budget bar uses char count (8000), not aligned with actual `maxTokens` setting
- When no `system_prompt` set, the default `"You are {name}"` is appended to global rules — consider moving it after the character card section for better effect
- Search filters messages but scroll position can jump when toggling search

### Mobile
- Voice and emoji buttons in the input bar are non-functional placeholders — either implement or remove
- `scrollIntoView` uses smooth but can cause jank on long streams — consider `auto` during streaming, `smooth` after

### Features worth adding next
- Swipe UI for regenerated replies already works, but could show a visual indicator of which variant is active
- World info entries list (below token bar) is currently just badges — no edit/disable toggle
- No way to see which prompt was sent (prompt debug panel — P2 item)

## Validation
All passing: lint, typecheck, 25 tests (3 files), build should succeed
