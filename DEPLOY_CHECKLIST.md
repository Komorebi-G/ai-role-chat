# Vercel Deployment Checklist — ai-role-chat

## 1. Required Vercel Environment Variables

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

| Variable | Required | Notes |
|---|---|---|
| `DEEPSEEK_API_KEY` | Yes | Chat won't work without it; app will return clear errors |
| `JWT_SECRET` | Yes | Without it, all JWTs use the dev fallback (`dev-secret-change-in-production`) — security risk |
| `TURSO_DATABASE_URL` | Yes | `libsql://your-db.turso.io` — both must be set, or the app falls back to SQLite (will fail on Vercel's ephemeral FS) |
| `TURSO_AUTH_TOKEN` | Yes | Auth token for Turso — same as above |
| `DATABASE_URL` | Recommended | Only needed for `prisma generate` during `postinstall`; has a fallback but set it to avoid warnings |

## 2. Turso Initialization

```bash
# 1. Create a Turso database
turso db create ai-role-chat

# 2. Get the connection URL
turso db show ai-role-chat --url

# 3. Create an auth token (valid forever)
turso db tokens create ai-role-chat

# 4. Copy URL and token to Vercel env vars:
#    TURSO_DATABASE_URL = <url from step 2>
#    TURSO_AUTH_TOKEN = <token from step 3>
```

## 3. Database Migrations

Migrations run automatically during `npm run build` via `scripts/migrate-turso.mjs`:

1. Build triggers `node scripts/migrate-turso.mjs` before `next build`
2. The script checks `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` — if both set, applies pending migrations
3. Each migration has a snapshot check to avoid re-applying already-executed DDL
4. Applied migrations are recorded in `_prisma_migrations` table

**Migration list (applied in order):**
- `20260509102121_init` — User, Message tables
- `20260509120133_add_role` — User.role column
- `20260509150453_add_conversations` — Conversation table
- `20260509174233_add_swipes` — Message.swipes column
- `20260512031508_init_new_schema` — Character table, drops old swipe columns

**Manual migration (if needed):**
```bash
turso db shell ai-role-chat < prisma/migrations/XXXX_xxx/migration.sql
```

## 4. Post-Deploy Manual Verification

### 4.1 Health Check
```bash
curl https://your-app.vercel.app/api/health | jq .
```
Expected: `{"status":"ok","database":"connected","env":{...},"runtime":{...}}`

### 4.2 Auth Flow
```bash
# Register
curl -X POST https://your-app.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test1234"}'

# Login
curl -v -X POST https://your-app.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test1234"}' 2>&1 | grep -i set-cookie

# Check session (use the cookie from login)
curl https://your-app.vercel.app/api/auth/me \
  -H "Cookie: token=<token-from-login>"
```

### 4.3 Character API
```bash
# List characters (requires auth)
curl https://your-app.vercel.app/api/characters \
  -H "Cookie: token=<token>"

# Create character (requires admin role)
curl -X POST https://your-app.vercel.app/api/characters \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<admin-token>" \
  -d '{"id":"alice","name":"Alice","description":"A test character"}'
```

### 4.4 Chat API
```bash
curl -X POST https://your-app.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<token>" \
  -d '{"characterId":"alice","messages":[{"role":"user","content":"Hello"}]}'
```

### 4.5 Frontend
- Open `https://your-app.vercel.app/chat` in browser
- Verify login/register works
- Verify character list loads
- Verify chat streaming works

## 5. Common Errors & Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| 500 on all API routes | Prisma version mismatch | Ensure `prisma`, `@prisma/client`, `@prisma/adapter-libsql` are all same major version (^7.x) |
| 500 on all API routes | Turso credentials wrong | `turso db shell ai-role-chat ".tables"` to verify |
| 500 on all API routes | Schema drift | Migration missing — check `migrate-turso.mjs` `isMigrationAlreadyApplied()` switch |
| 500 with "database" error | SQLite fallback on Vercel | Both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` must be set |
| "table already exists" during build | Migration applied but crash before recording | Should be caught by snapshot detection; if not, manually insert into `_prisma_migrations` |
| Build timeout at migration step | Turso connection slow | Build timeout is 60s for migrations; check Turso connectivity |
| "DEEPSEEK_API_KEY is not configured" | Missing env var | Set `DEEPSEEK_API_KEY` in Vercel env vars |
| CORS errors | Vercel domain mismatch | Check frontend API calls use relative URLs |
| Health check: DB error | Turso unreachable | Verify Turso database status, token validity |

### Debugging Vercel Runtime Failures

1. **Vercel Function Logs**: Dashboard → Functions → click the failing route → Logs tab
2. **All API errors return real messages** — not generic "Internal server error"
3. **Test Turso connectivity**: `turso db shell ai-role-chat ".tables"`
4. **Prisma version consistency**: All three `@prisma/*` packages must be same major version
5. **Local Turso test**: Set env vars and run `node -e "..."` as shown in CLAUDE.md

## 6. Pre-Deploy Local Verification

```bash
npm run typecheck     # Must pass
npm run lint          # Should pass
npm run test          # Should pass (19 tests)
npm run build         # Must pass
```
