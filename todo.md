# TODO — AI Role Chat

## 2026-05-10: Turso 云端缺少 Conversation 表 ✅

**问题**: `no such table: main.Conversation` 反复出现。

**根因分析**:
- 本地 SQLite (`prisma/dev.db`) — 迁移已应用，表存在 ✅
- Turso 云端（Vercel 生产环境）— 迁移从未应用，Conversation 表不存在 ❌
- 之前两次修复只处理了本地，没碰 Turso

**修复**:
1. 创建 `scripts/migrate-turso.mjs` — 在 Vercel 构建时自动检查并应用缺失的迁移
   - 检查 Turso 环境变量是否设置（未设置则跳过，本地开发不影响）
   - 创建 `_prisma_migrations` 表（如不存在）
   - 检查 `20260509150453_add_conversations` 迁移是否已应用
   - 未应用则执行迁移 SQL（`executeMultiple` 批量执行）
   - 记录迁移到 `_prisma_migrations`
2. 更新 `package.json` build 脚本：`node scripts/migrate-turso.mjs && next build`
3. ESLint flat config 排除 `scripts/` 目录

**Vercel 构建流程**: `npm run build` → 自动检测 Turso 环境变量 → 应用缺失迁移 → 构建 Next.js

**验证**:
- 本地运行 `node scripts/migrate-turso.mjs` → 正确跳过（无 Turso 环境变量）
- `npm run build` → 成功
- typecheck, lint, test → 全部通过 ✅

---

## 已有功能

- JWT 认证（登录/注册/登出），httpOnly cookie
- 双账户：demo (123/123, 内存存储) + admin (lbh/lbh, DB 存储)
- 角色卡系统：JSON 文件 CRUD，导入/导出
- AI 对话：DeepSeek v4-flash，SSE 流式输出
- 多会话管理：每个角色可创建多个对话
- WeChat 风格 UI：移动端优先，480px 居中，抽屉侧栏
- 深色模式：CSS 变量 + localStorage
- Markdown 渲染 + 代码高亮
- 消息操作：复制、重新生成
- 管理员面板：用户列表、删除用户
- 设置面板：temperature、maxTokens
- 速率限制：30 req/min

## 可扩展方向

- 真正的 tokenizer
- 用户修改密码
- 角色卡头像上传
- 对话搜索/导出
- i18n
