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
- [ ] **演示账号数据多人共享** — 所有用 123 登录的人看到同一份聊天记录
- [ ] **速率限制基于进程内存** — 多实例（serverless）部署时不准确

### 低优先级
- [ ] **无测试** — 项目完全没有测试套件（单元测试 / 集成测试）
- [ ] **角色卡只能手动编辑 JSON** — 无在线导入/创建/编辑界面
- [ ] **无对话管理** — 不能删除单条对话、清空历史、导出对话
- [ ] **无 per-user 速率限制** — 限流是全局的，一个用户滥用影响所有人

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
| 4 | 演示账号隔离：每个浏览器独立会话 | 中 | 聊天 API、前端 | `app/api/chat/route.ts`, `app/chat/page.tsx` |
| 5 | 添加 per-user 速率限制 | 低 | `lib/ai.ts` | `lib/ai.ts` |
| 6 | 对话清空功能 | 低 | API + 前端 | `app/api/chat/route.ts`, `app/chat/page.tsx` |
| 7 | 添加基础测试框架（vitest + 单元测试） | 中 | 全局 | `package.json`, `lib/*.test.ts` |

## 五、已完成任务

| 轮次 | 任务 | 修改文件 | 测试结果 |
|------|------|----------|----------|
| - | admin 角色系统、用户管理面板、密码校验、消息动画、分层 Prompt 构建、上下文裁剪、角色卡扩展、first_mes 开场白 | 多个文件 | ✅ build 通过 |

**第 1 轮**：添加 ESLint (flat config) + TypeScript type-check 脚本
- 新增 `eslint.config.mjs`：使用 `@eslint/js` + `typescript-eslint` + `eslint-plugin-react` + `eslint-plugin-react-hooks` + `@next/eslint-plugin-next`
- `package.json`：添加 `lint` 和 `typecheck` 脚本
- 修复 3 个 lint 错误：`err: any` → `err: unknown`（2处），删除未使用的 `Character` 接口
- 验证：`npm run lint` ✅、`npm run typecheck` ✅、`npm run build` ✅

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
