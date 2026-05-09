# IMPLEMENTATION_LOG

## 2026-05-10 — 审计与修复

### 当前 commit: 34c981e

### 审计结果

- typecheck: ✅ 通过
- lint: ✅ 0 errors
- test: ✅ 14 passed (2 files)
- build: ✅ 通过

### 发现的问题及修复

1. **mes_example 不支持 `<START>` 分隔符** — parseExampleDialogue() 按行前缀解析, 需要添加 `<START>` 分隔支持
2. **README.md 过时** — 缺少 world books, swipe, persona, 新字符字段
3. **缺少单元测试** — persona/world-info/post_history_instructions 无测试覆盖
4. **CHANGELOG 过时** — 停在 Round 10

### 修改的文件

- `lib/prompt/buildPrompt.ts` — parseExampleDialogue 支持 <START> 分隔符 (SillyTavern 标准), 保留行前缀回退
- `lib/prompt/buildPrompt.test.ts` — 新增 6 个测试: <START> 解析, persona 注入/不注入, post_history_instructions 注入
- `lib/world/index.test.ts` — 新增世界书测试 (8 tests): 匹配、分组、禁用、窗口
- `README.md` — 全面重写: 角色卡格式, 世界书格式, Swipe 机制, 目录结构, Persona, 未完成功能
- `CHANGELOG.md` — 添加 Rounds 11-14
- `VERIFY_REPORT.md` — 创建, 56 项验证
- `IMPLEMENTATION_LOG.md` — 创建
- `TODO.md` — 重写为结构化审计格式 (15 部分, ~150 项检查)

---

## 之前实现的记录 (Rounds 11-13, 未记录在 CHANGELOG)

### Round 11 — Swipe Reply Variants System
- `prisma/schema.prisma` — Message 模型添加 swipes (TEXT, JSON array) + swipeId (INT)
- `prisma/migrations/20260509174233_add_swipes/migration.sql` — 重建 Message 表, 复制数据
- `app/api/chat/route.ts` — POST regenerate: true 追加新 swipe; PATCH 切换 swipeId
- `app/chat/page.tsx` — handleSwipe 左右切换, ◂ N/M ▸ UI

### Round 12 — World Info / Simplified Lorebook
- `worlds/default.json` — 空起始世界书
- `lib/world/index.ts` — getActiveWorldEntries 关键词匹配, beforeCharacter/afterCharacter 分组
- `lib/prompt/buildPrompt.ts` — 注入 world info 到 system prompt
- `app/api/worlds/route.ts` — CRUD API (admin only for write)

### Round 13 — Persona, Token Bar, Search, JSONL Export, Card Extensions
- Persona: ChatSettings.persona, buildPrompt 注入 [User Persona], 前端 textarea
- Token bar: 消息区域顶部 3px 进度条 (绿/黄/红)
- Search: Nav bar 搜索按钮, 过滤消息
- JSONL Export: handleExportJsonl, "Export as JSONL" 按钮
- Card fields: post_history_instructions, alternate_greetings, creator, character_version
