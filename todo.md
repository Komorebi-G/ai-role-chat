# TODO — AI Role Chat

> SillyTavern 思想参考: `sillytavern_feature_analysis.md`
> 实现记录: `CHANGELOG.md`

---

## 已完成

| 功能 | 状态 | 文件 |
|---|---|---|
| JWT 认证 (login/register/logout) | ✅ | `app/api/auth/`, `lib/auth.ts` |
| 双账户 (demo 123/123 + admin lbh/lbh) | ✅ | `app/api/auth/login/route.ts` |
| 角色卡 JSON 加载/fallback/多角色 | ✅ | `lib/character.ts`, `characters/` |
| 角色卡 CRUD API + 导入/导出 | ✅ | `app/api/characters/route.ts` |
| 分层 Prompt 构建 (system → char → example → history) | ✅ | `lib/prompt/buildPrompt.ts` |
| FIFO 上下文裁剪 (字符估算) | ✅ | `lib/chat/context.ts` |
| DeepSeek API + SSE 流式输出 | ✅ | `lib/deepseek.ts`, `lib/ai.ts` |
| 多会话管理 (Conversation 模型) | ✅ | `app/api/conversations/`, `app/api/chat/` |
| WeChat 移动端 UI (480px 居中 + 抽屉 + 底部输入) | ✅ | `app/chat/page.tsx` |
| 深色模式 + Markdown 渲染 | ✅ | `app/globals.css` |
| 流式消息 "Thinking" → 内容 (单气泡) | ✅ | `app/chat/page.tsx` |
| 消息复制/重新生成 | ✅ | `app/chat/page.tsx` |
| 管理员面板 (用户管理) | ✅ | `app/api/admin/` |
| 设置面板 (temperature/maxTokens) | ✅ | `app/chat/page.tsx` |
| 速率限制 (30 req/min) | ✅ | `lib/ai.ts` |
| Turso 自动迁移 (Vercel 构建) | ✅ | `scripts/migrate-turso.mjs` |
| 文件名 vs ID 不匹配容错 | ✅ | `lib/character.ts` getCharacterFilePath() |
| 角色卡字段: name/description/personality/scenario/first_mes/mes_example/system_prompt/creator_notes/tags | ✅ | `lib/character.ts`, `characters/*.json` |

---

## P0：当前缺失（核心体验）

### 1. Swipe 回复变体系统 ✅
- Schema: `swipes TEXT NOT NULL DEFAULT '[]'` + `swipeId INT NOT NULL DEFAULT 0`
- API: POST regenerate=true 追加新 swipe，PATCH 切换当前 swipe
- 前端: ◂ N/M ▸ 导航按钮，左右切换

### 2. World Info / 简化世界书 ✅
- `worlds/default.json` + `lib/world/index.ts` 模块
- 条目字段: keys, content, enabled, position (beforeCharacter/afterCharacter)
- 匹配逻辑: 扫描最近 10 条消息，keyword 匹配 → 注入 Prompt
- API: CRUD `/api/worlds` (admin only for write)

### 3. post_history_instructions 支持 ✅
- `lib/character.ts` 已添加字段
- `buildPrompt.ts` 在 history 之后注入 system 消息

### 4. alternate_greetings 支持 ✅
- `lib/character.ts` 已添加 `alternate_greetings?: string[]`

---

## P1：增强体验

### 5. Token 预算可视化 ✅
- 输入框上方 3px 进度条，绿/黄/红三色
- 基于字符数 / 8000，hover 显示 token 估算

### 6. 用户人设 (persona) ✅
- `ChatSettings` 增加 persona 字段，localStorage 存储
- 注入到 system prompt 中 [User Persona] 区域
- 前端设置面板 textarea，API 透传

### 7. 角色卡字段扩展 ✅
- `lib/character.ts`: 新增 `creator`, `character_version`, `post_history_instructions`, `alternate_greetings`
- `app/api/characters/`: POST/PUT 已支持新字段
- 前端 create/edit modal 已添加新字段输入

### 8. 对话搜索 ✅
- Nav bar 搜索按钮，点击展开搜索输入框
- 实时过滤消息，显示匹配数量

### 9. JSONL 聊天存储 ✅
- More menu "Export as JSONL" 按钮下载当前对话

---

## P2：高级功能（写 TODO 不做）

- PNG 角色卡嵌入 (tEXt chunk)
- 精确 tokenizer (tiktoken)
- 世界书递归扫描 + sticky/cooldown
- Prompt 调试面板 (查看实际发送的完整 Prompt)
- 多角色群聊
- 插件系统
- 国际语言支持 (i18n)
- PWA

---

## 本阶段实现记录

### 2026-05-10: CLAUDE.md 更新
- 重写 CLAUDE.md 反映当前项目状态和 SillyTavern 方向
- 关联 `sillytavern_feature_analysis.md` 作为设计参考
