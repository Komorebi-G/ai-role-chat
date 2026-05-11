# Vercel 部署后登录 Internal Server Error 问题分析

## 现象

修改文件（如角色卡 `characters/ben.json`）后推送，Vercel 自动部署成功，但登录 API (`/api/auth/login`) 返回 `{"error": "Internal server error"}`。

修改的角色文件与登录逻辑完全无关，但推送触发了 Vercel 重新构建，引发了此问题。

## 根因：Prisma 包版本不匹配

**核心问题：`@prisma/adapter-libsql` 主版本与 `@prisma/client` / `prisma` 不一致。**

### 触发条件

`package.json` 中使用了 `^` 语义化版本范围：

```json
{
  "@prisma/adapter-libsql": "^7.8.0",  // 允许 7.x.x
  "@prisma/client": "^6.12.0",          // 只允许 6.x.x —— 无法升到 7
  "prisma": "^6.12.0"                   // 只允许 6.x.x —— 无法升到 7
}
```

当 `@prisma/adapter-libsql` 发布 v7 后，`npm install` 会自动将 adapter 升级到 v7，但 `@prisma/client` 和 `prisma` 被 `^6.12.0` 锁定在 v6。

**Prisma 7 adapter 与 Prisma 6 client 不兼容**。当代码执行 `new PrismaClient({ adapter: v7Adapter })` 时，PrismaClient v6 无法识别 v7 adapter 的接口，构造函数抛出异常。

## Vercel 部署流水线分析

```
git push → Vercel 检测到分支变更 → 触发部署
  │
  ├─ [1] npm install
  │     └─ postinstall: prisma generate  
  │         ├─ adapter-libsql 解析为 v7.x (^7.8.0)
  │         ├─ @prisma/client 解析为 v6.x (^6.12.0)
  │         └─ 生成 PrismaClient v6 —— 此时无报错
  │
  ├─ [2] npm run build  
  │     └─ migrate-turso.mjs && next build
  │         ├─ migrations 使用 @libsql/client 直接操作 Turso（不依赖 Prisma）
  │         └─ Next.js 编译成功 —— 无编译错误
  │
  └─ [3] 运行时（Vercel Serverless Function）
        └─ POST /api/auth/login
            └─ lib/db.ts: new PrismaClient({ adapter: v7 PrismaLibSql })
                └─ PrismaClient v6 无法使用 v7 adapter → throw Error
                    └─ catch: return "Internal server error"
```

### 为什么部署构建成功但运行时失败？

- **构建阶段**：`prisma generate` 使用 v6 CLI 生成 v6 Client，不涉及 adapter 版本检查
- **迁移阶段**：`migrate-turso.mjs` 使用 `@libsql/client` 直连 Turso，完全绕过了 Prisma adapter
- **运行时**：`new PrismaClient({ adapter })` 是第一次真正将 v7 adapter 传入 v6 Client，此时才暴露不兼容

## 为什么此问题反复出现

1. **`^` 版本范围**允许主版本发散。每次 `npm install` 的解析结果可能不同：
   - 本地开发时如果已有 `node_modules`，`npm install` 是增量的，可能不会触发升级
   - Vercel 构建使用干净的 `node_modules`，总是解析到最新允许的版本

2. **`package-lock.json` 理论上锁版本**，但以下情况会导致不一致：
   - Lock file 未提交到仓库（gitignore）
   - Lock file 已过期，Vercel 使用 `npm install` 而非 `npm ci` 重新解析
   - 本地 lock file 版本与 Vercel 不一致（跨平台差异）

3. **adapter 版本"率先升级"**：adapter 是独立包，其主版本更新和 client/CLI 不同步。当 adapter 先发布新版，依赖 `^` 范围就会自动引入不兼容版本。

## 解决方案

### 短期修复（已应用 - commit 3d8d35f）

将所有 Prisma 相关包统一升级到 v7：

```diff
- "@prisma/client": "^6.12.0",
+ "@prisma/client": "^7.8.0",

- "prisma": "^6.12.0",
+ "prisma": "^7.8.0",
```

### Prisma 7 配套改动

1. **新增 `prisma.config.ts`**：Prisma 7 将 datasource URL 从 `schema.prisma` 移到了独立配置文件
2. **本地开发适配**：Prisma 7 移除 `new PrismaClient()` 无参构造函数，必须传入 adapter：
   ```typescript
   // 本地开发也必须使用 adapter
   const adapter = new PrismaLibSql({ url: "file:./prisma/dev.db" });
   return new PrismaClient({ adapter });
   ```

### 长期预防

1. **保持 Prisma 包版本一致**：`@prisma/client`、`prisma`、`@prisma/adapter-libsql` 应始终使用相同主版本
2. **提交 `package-lock.json`**：确保 Vercel 和本地使用完全相同的依赖树
3. **在 `push.sh` 中增加版本一致性检查**：避免推送不兼容的依赖组合
4. **改进错误日志**：登录路由应输出完整错误信息，便于排查

## 环境变量注意事项

`prisma.config.ts` 使用 `env("DATABASE_URL")`，Vercel 构建时必须设置此变量才能让 `prisma generate` 成功。虽然运行时 `lib/db.ts` 使用 `TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN`，但 `prisma generate` 阶段需要 `DATABASE_URL`。

Vercel 上需要设置三个环境变量：
- `TURSO_DATABASE_URL` — 运行时数据库连接（Turso）
- `TURSO_AUTH_TOKEN` — 运行时认证令牌（Turso）
- `DATABASE_URL` — 构建时 prisma generate 使用（可设为任意有效 SQLite URL，如 `file:./dev.db`）

## 调试建议

如果再次遇到登录 500 错误：

1. 检查 Vercel 部署日志中 `prisma generate` 是否成功
2. 检查 `DATABASE_URL` 环境变量是否已设置
3. 检查 `package.json` 中 Prisma 相关包的主版本是否一致
4. 在 Vercel Function Logs 中查看实际抛出的异常信息
5. 确认 `package-lock.json` 已提交且未被 `.gitignore` 排除
