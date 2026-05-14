# Shared Task Notes — Iteration next

## What was done this round
- **Mobile PWA** — install prompt, offline support, iOS install guidance.
  - CSS for install banner (pwa-install-banner classes) — was missing, now styled with primary theme colors
  - Service worker (`public/sw.js`) rewritten: cache-first for static assets, network-first for navigation with offline fallback to `/chat`, network-first caching for GET API requests, proper cache versioning
  - Offline detection: online/offline event listeners + `navigator.onLine` initial state, amber banner when offline
  - iOS install hint: detects iOS Safari, shows "Tap Share → Add to Home Screen" after 5s delay, dismissed via localStorage
  - ESLint config: worker globals for sw.js (flat config doesn't support `/* eslint-env */`)
  - Fixed pre-existing ESLint react-hooks/set-state-in-effect warning in PWA prompt effect

## What to do next
Highest-value next steps:

1. **Plugin system** — extension points for custom prompt transformers, UI components, API middleware.
2. **Token budget management** — per-component budgets with priority-based degradation (currently FIFO trimming only).
3. **Structured logging** — server-side request logging with request IDs for debugging Vercel issues.

## Files to pay attention to
- `public/sw.js` — service worker with cache strategies (network-first for nav/API-GET, cache-first for static)
- `public/manifest.json` — PWA manifest with icons, display mode, theme color
- `app/chat/page.tsx` — PWA install banner (beforeinstallprompt event), offline banner, iOS hint
- `app/layout.tsx` — inline SW registration script, manifest link via Metadata API
- `app/globals.css` — pwa-install-banner and offline-banner styles
- `eslint.config.mjs` — worker globals for sw.js

## Test note
SQLite doesn't support concurrent writers, so `npx vitest run` may timeout when test files run in parallel. Use `--pool=forks` to isolate: `npx vitest run --pool=forks`.

## Health pause - 2026-05-12 19:15:05 CST

- Iteration: (12/31)
- Consecutive failures: 3
- Reason: reviewer failed

Recent diagnostics:
    error: unexpected argument '--dangerously-skip-permissions' found
    
      tip: a similar argument exists: '--dangerously-bypass-approvals-and-sandbox'
    
    Usage: codex exec [OPTIONS] [PROMPT]
           codex exec [OPTIONS] <COMMAND> [ARGS]
    
    For more information, try '--help'.

Next step: Inspect the failure, fix the project or adjust the prompt, then rerun Continuous Claude.
