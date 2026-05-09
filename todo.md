# AI Role Chat — 维护 todo

## 一、已有功能总结

- Next.js 15 (App Router) + React 19 + TypeScript + SQLite/Turso + Prisma + DeepSeek API
- JWT 认证（jose）：注册/登录/登出，httpOnly cookie，7 天有效期
- 双模式数据库：本地 SQLite（dev.db） / Turso 云端 SQLite（Vercel生产）
- 角色卡系统：JSON 文件加载，字段 fallback 容错，内置默认角色
- 分层 Prompt 构建（SillyTavern 风格）：system → character → scenario → example → history
- 上下文裁剪：FIFO 策略 + 字符数估算 token 预算（默认 20 条 / 8000 字符）
- 速率限制：全局 30 次/分钟滑动窗口 + 30 秒超时
- 内置账号：演示账号 123/123（内存存储）、管理员 lbh/lbh（DB 存储）
- 管理员面板：查看/删除用户（级联删除聊天记录），二次确认，禁止自删
- 密码校验：8-16 位 + 字母 + 数字，后端强制校验
- 聊天 UI：角色侧边栏、消息淡入动画、乐观更新、开场白显示

## 二、当前缺失功能

### 高优先级
- [x] **无 ESLint/代码规范** — ✅ 已添加 `eslint` + `eslint.config.mjs` (flat config)，`npm run lint` 可用
- [x] **无 TypeScript 类型检查脚本** — ✅ 已添加 `npm run typecheck`（`tsc --noEmit`）

### 中优先级
- [ ] **Token 计数使用字符估算** — `context.ts` 用 chars/4 估算，应替换为 tiktoken 精确计算
- [ ] **无流式输出（streaming）** — AI 回复整段返回，体验不如逐字流式输出
- [x] **演示账号数据多人共享** — ✅ 已隔离：`Map<sessionId, MemMessage[]>`，每个浏览器独立会话
- [ ] **速率限制基于进程内存** — 多实例（serverless）部署时不准确

### 低优先级
- [x] **无测试** — ✅ 已添加 vitest + 14 个单元测试（context.ts 6 个 + buildPrompt.ts 8 个）
- [ ] **角色卡只能手动编辑 JSON** — 无在线导入/创建/编辑界面
- [x] **无对话清空功能** — ✅ 已添加 `DELETE /api/chat?characterId=` + 前端 Clear 按钮
- [ ] **不能删除单条对话、导出对话** — Clear 已做，单条删除和导出待评估
- [x] **无 per-user 速率限制** — ✅ 已改为 per-user：`Map<userId, timestamps[]>`，每人独立限流

## 三、可扩展方向

- 支持多后端（OpenAI / Claude / 本地模型）
- Lorebook / World Info 系统（SillyTavern 风格的世界书）
- 角色卡 PNG 嵌入（类似 SillyTavern 的 tEXt chunk）
- 用户自定义 System Prompt
- Markdown 渲染消息内容
- 对话分支 / 多轮对话树
- 多语言 UI（i18n）

## 四、任务列表（按优先级排序）

| # | 任务 | 难度 | 影响范围 | 涉及文件 |
|---|------|------|----------|----------|
| 1 | ✅ 添加 ESLint + TypeScript type-check 脚本 | 低 | package.json, 配置文件 | `package.json`, 新增 `eslint.config.mjs` |
| 2 | 修复 Token 估算：引入 tiktoken | 中 | `lib/chat/context.ts` | `lib/chat/context.ts`, `package.json` |
| 3 | 添加 AI 流式输出（streaming） | 中 | 前后端 | `lib/deepseek.ts`, `lib/ai.ts`, `app/api/chat/route.ts`, `app/chat/page.tsx` |
| 4 | ✅ 演示账号隔离：每个浏览器独立会话 | 中 | auth、聊天 API | `app/api/auth/login/route.ts`, `app/api/chat/route.ts` |
| 5 | ✅ 添加 per-user 速率限制 | 低 | `lib/ai.ts` | `lib/ai.ts`, `app/api/chat/route.ts` |
| 6 | ✅ 对话清空功能 | 低 | API + 前端 | `app/api/chat/route.ts`, `app/chat/page.tsx`, `app/globals.css` |
| 7 | ✅ 添加基础测试框架（vitest + 单元测试） | 中 | 全局 | `package.json`, `vitest.config.ts`, `lib/**/*.test.ts` |

## 五、已完成任务

| 轮次 | 任务 | 修改文件 | 测试结果 |
|------|------|----------|----------|
| - | admin 角色系统、用户管理面板、密码校验、消息动画、分层 Prompt 构建、上下文裁剪、角色卡扩展、first_mes 开场白 | 多个文件 | ✅ build 通过 |
| 1 | ESLint flat config + TypeScript type-check 脚本 | `package.json`, `eslint.config.mjs`, `app/api/chat/route.ts`, `lib/ai.ts`, `app/page.tsx` | ✅ lint typecheck build |
| 2 | per-user 速率限制 | `lib/ai.ts`, `app/api/chat/route.ts` | ✅ lint typecheck build |
| 3 | 对话清空功能 | `app/api/chat/route.ts`, `app/chat/page.tsx`, `app/globals.css` | ✅ lint typecheck build |
| 4 | 添加基础测试框架（vitest + 14 单元测试） | `package.json`, `vitest.config.ts`, `lib/**/*.test.ts` | ✅ test lint typecheck build |
| 5 | 演示账号隔离 | `app/api/auth/login/route.ts`, `app/api/chat/route.ts` | ✅ lint typecheck test build |

## 六、待确认问题

1. `firstMessage` 字段保留还是统一用 `first_mes`？当前 `normalizeCharacter` 兼容两者
2. DeepSeek 模型是否需要支持用户自定义切换？
3. 是否需要保留 demo 账号（123/123）？还是改为每个浏览器独立的匿名会话？
4. 消息存储是否需要上限？（当前无上限，仅在 prompt 组装时裁剪）

## 七、迭代记录

### 第 1 轮 (2026-05-09)
- **选择任务**：添加 ESLint + TypeScript type-check 脚本
- **修改文件**：`package.json` (+2 scripts)、`eslint.config.mjs` (新增)、`app/api/chat/route.ts` (err type)、`lib/ai.ts` (err type)、`app/page.tsx` (remove unused interface)
- **测试结果**：`npm run lint` ✅ 0 errors、`npm run typecheck` ✅ 0 errors、`npm run build` ✅
- **新发现问题**：无

### 第 2 轮 (2026-05-09)
- **选择任务**：per-user 速率限制
- **修改文件**：`lib/ai.ts`（单数组 → `Map<userId, number[]>`，`aiChat` 新增 `userId` 参数）、`app/api/chat/route.ts`（传入 userId）
- **改动量**：2 处函数签名变更，~10 行核心逻辑
- **测试结果**：`npm run lint` ✅、`npm run typecheck` ✅、`npm run build` ✅
- **新发现问题**：无

### 第 4 轮 (2026-05-09)
- **选择任务**：添加基础测试框架（vitest）
- **修改文件**：`package.json`（新增 test 脚本）、`vitest.config.ts`（新增）、`lib/chat/context.test.ts`（新增，6 tests）、`lib/prompt/buildPrompt.test.ts`（新增，8 tests）
- **测试结果**：`npm run test` ✅ 14/14、`npm run lint` ✅、`npm run typecheck` ✅、`npm run build` ✅
- **新发现问题**：无

### 第 5 轮 (2026-05-09)
- **选择任务**：演示账号隔离
- **修改文件**：`app/api/auth/login/route.ts`（demo 登录时下发 `demo_sid` cookie）、`app/api/chat/route.ts`（`demoMessages: MemMessage[]` → `demoSessions: Map<string, MemMessage[]>`，按 `demo_sid` 隔离）
- **改动量**：login +5 行，chat +30 行重构
- **测试结果**：`npm run lint` ✅、`npm run typecheck` ✅、`npm run test` ✅、`npm run build` ✅
- **新发现问题**：无

### 第 3 轮 (2026-05-09)
- **选择任务**：对话清空功能
- **修改文件**：`app/api/chat/route.ts`（新增 DELETE handler）、`app/chat/page.tsx`（新增 handleClearChat + 状态 + Clear 按钮）、`app/globals.css`（新增 .clear-btn 样式）
- **改动量**：API +25 行、前端 +23 行、CSS +20 行
- **测试结果**：`npm run lint` ✅、`npm run typecheck` ✅、`npm run build` ✅
- **新发现问题**：无
