# AI Role Chat

SillyTavern 风格的轻量级 AI 角色聊天网站。支持角色卡 JSON、世界书（World Info）、Swipe 回复变体、用户人设（Persona）、流式输出、多会话管理。

> GitHub: https://github.com/Komorebi-G/ai-role-chat

## 技术栈

- Next.js 15 App Router (React 19)
- TypeScript
- SQLite (本地) / Turso (Vercel 云端)
- Prisma ORM + @prisma/adapter-libsql
- bcryptjs + jose (JWT 认证)
- DeepSeek API (deepseek-v4-flash)
- react-markdown (消息渲染)
- vitest (测试)

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local, 填入 DEEPSEEK_API_KEY

# 3. 初始化数据库
npx prisma migrate dev --name init

# 4. 启动开发服务器
npm run dev
```

打开 http://localhost:3000, 使用以下账户登录:
- **Demo**: 用户名 `123`, 密码 `123` (对话不保存, 重启消失)
- **Admin**: 用户名 `lbh`, 密码 `lbh` (完整功能)

## 项目命令

```bash
npm run dev        # 开发服务器 (port 3000)
npm run build      # 生产构建 (含 Turso 迁移)
npm run lint       # ESLint
npm run typecheck  # TypeScript 类型检查
npm run test       # vitest 运行测试
```

## 角色卡

角色卡是 `characters/` 目录下的 JSON 文件，支持以下字段：

| 字段 | 必需 | 说明 |
|---|---|---|
| `id` | 是 | 唯一标识 (可以与文件名不同) |
| `name` | 是 | 显示名称 |
| `description` | 否 | 角色外观/背景描述 |
| `personality` | 否 | 性格特征 |
| `scenario` | 否 | 对话场景/情境 |
| `first_mes` | 否 | 开场白 (首次进入时显示), 也可用 `firstMessage` |
| `mes_example` | 否 | 示例对话, 支持 `<START>` 分隔多轮 |
| `system_prompt` | 否 | 角色专属系统提示词 |
| `post_history_instructions` | 否 | 对话后的系统指令 (放在聊天历史之后) |
| `alternate_greetings` | 否 | 替代开场白列表 (`string[]`) |
| `creator` | 否 | 角色创作者 |
| `character_version` | 否 | 版本号 |
| `creator_notes` | 否 | 创作者备注 |
| `tags` | 否 | 标签列表 (`string[]`) |

示例:

```json
{
  "id": "alice",
  "name": "Alice",
  "description": "Alice 是用户的大学朋友",
  "personality": "温柔、真诚、乐观",
  "scenario": "Alice 发现用户最近有些孤独",
  "first_mes": "嘿，最近好像很少见到你了，你还好吗？",
  "mes_example": "用户：最近压力好大\nAlice：我理解你，不用给自己太大压力\n<START>\n用户：谢谢你\nAlice：真的吗？太好了！我一直都在你这边哦",
  "system_prompt": "保持自然、温暖的语气",
  "post_history_instructions": "",
  "alternate_greetings": ["开场白变体1", "开场白变体2"],
  "creator": "AliceCreator",
  "character_version": "1.0",
  "tags": ["friend", "comfort"]
}
```

管理员可以通过前端界面创建/编辑/导入/导出角色卡。

## 世界书 (World Info)

世界书是 `worlds/` 目录下的 JSON 文件。它是一个条件性的 Prompt 注入系统：当聊天内容匹配到条目的关键词时，条目的内容会自动注入到 Prompt 中。

### 条目字段

| 字段 | 说明 |
|---|---|
| `id` | 条目唯一标识 |
| `keys` | 关键词列表 (`string[]`) |
| `content` | 匹配后注入的内容 |
| `enabled` | 是否启用 (`true`/`false`) |
| `position` | 注入位置: `beforeCharacter` (角色描述前) / `afterCharacter` (角色描述后) |
| `order` | 排序权重 (越小越靠前) |

### 示例

```json
{
  "id": "fantasy-world",
  "name": "Fantasy World",
  "description": "A fantasy setting world book.",
  "entries": [
    {
      "id": "e1",
      "keys": ["dragon", "龙"],
      "content": "The ancient dragon Elthorion watches from the mountain peak.",
      "enabled": true,
      "position": "beforeCharacter",
      "order": 0
    }
  ]
}
```

当用户在消息中提及 "dragon" 或 "龙" 时，龙的相关描述会自动出现在系统 Prompt 中。

管理员可通过 `/api/worlds` 接口管理世界书。

## Swipe 回复变体

每条 AI 回复支持多个变体（swipe），用户可以在不同版本之间切换：

- **重新生成**: 点击重新生成按钮 → 新回复追加到 swipes 数组，不覆盖原回复
- **滑动切换**: 消息气泡显示 ◂ N/M ▸ 按钮，左右切换不同变体
- **刷新保持**: swipeId 存储在数据库中，刷新页面后当前选择的变体保持不变
- **JSONL 导出**: 导出时包含完整的 swipes 信息

## Prompt 构建

采用 SillyTavern 风格的分层 Prompt 结构：

```
System (全局规则)
  → User Persona (用户人设, 可选)
  → World Info Before (匹配的世界书条目)
  → Character System Prompt
  → Character Card Info (name, description, personality, scenario)
  → World Info After (匹配的世界书条目)
→ Example Dialogue (来自 mes_example)
→ Chat History (裁剪后的聊天历史)
→ Post-History Instructions
→ Current User Input
```

所有层使用 OpenAI-compatible messages 格式，不把内容拼成单一字符串。

## 上下文裁剪

基于字符数的 FIFO 策略：从最旧消息开始丢弃，直到字符数控制在预算内。
- 默认保留最近 20 条消息
- 默认最大 8000 字符
- 参数可配置

## 移动端体验

- 480px 居中容器 (WeChat 风格)
- 固定底部输入框
- 抽屉式侧边栏
- 用户/AI 消息气泡区分（绿色/白色）
- Markdown 渲染（支持代码块）
- 深色模式
- 流式输出 "Thinking" 指示器
- 前端消息搜索
- Token 预算进度条（绿/黄/红）

## 用户人设 (Persona)

在 Settings 中设置 "Persona"，让 AI 了解你的角色。会被注入到 Prompt 的 `[User Persona]` 区域。

## 目录结构

```
ai-role-chat/
├── app/
│   ├── api/
│   │   ├── admin/        # 用户管理 (admin only)
│   │   ├── auth/         # 登录/注册/登出
│   │   ├── characters/   # 角色卡 CRUD
│   │   ├── chat/         # 聊天 (GET/POST/PATCH/DELETE)
│   │   ├── conversations/# 会话管理
│   │   └── worlds/       # 世界书 CRUD (admin only write)
│   ├── chat/             # 聊天页 (SPA)
│   ├── login/            # 登录页
│   ├── register/         # 注册页
│   └── page.tsx          # 首页 (auth gate)
├── characters/           # 角色卡 JSON 文件
├── worlds/               # 世界书 JSON 文件
├── lib/
│   ├── db.ts             # Prisma 客户端 (SQLite/Turso 双模式)
│   ├── auth.ts           # JWT 认证 (jose)
│   ├── character.ts      # 角色卡加载/缓存/fallback
│   ├── deepseek.ts       # DeepSeek API (直连 + SSE 流)
│   ├── ai.ts             # AI 请求封装 (速率限制 + 超时)
│   ├── prompt/
│   │   └── buildPrompt.ts  # 分层 Prompt 构建
│   ├── world/
│   │   └── index.ts      # 世界书加载与关键词匹配
│   └── chat/
│       └── context.ts    # 上下文裁剪 (FIFO)
├── prisma/               # 数据库 Schema + Migrations
├── scripts/
│   └── migrate-turso.mjs # Vercel 构建时 Turso 迁移
├── VERIFY_REPORT.md      # 验证报告
├── IMPLEMENTATION_LOG.md # 实现日志
└── TODO.md               # 待办事项
```

## 安全

- 密码使用 bcrypt 哈希存储
- 登录态使用 httpOnly cookie (JWT, 7天过期)
- API Key 仅存储在服务端 `.env.local`
- 所有 API 接口校验登录状态
- 用户只能看到自己的聊天记录
- Admin 接口检查 role 字段

## 环境变量

| 变量名 | 说明 | 本地 | Vercel |
|--------|------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | `.env.local` | 必需 |
| `JWT_SECRET` | JWT 签名密钥 | 默认值可用 | 必需 (更换为随机串) |
| `DATABASE_URL` | SQLite 文件路径 | `file:./dev.db` | 不需要 |
| `TURSO_DATABASE_URL` | Turso 数据库地址 | 不需要 | 必需 |
| `TURSO_AUTH_TOKEN` | Turso 认证令牌 | 不需要 | 必需 |

## Vercel 部署

```bash
# 1. 创建 Turso 数据库
turso db create ai-role-chat
turso db show ai-role-chat --url     # → TURSO_DATABASE_URL
turso db tokens create ai-role-chat  # → TURSO_AUTH_TOKEN

# 2. 配置 Vercel 环境变量 (Dashboard → Settings → Environment Variables)
#    DEEPSEEK_API_KEY / JWT_SECRET / TURSO_DATABASE_URL / TURSO_AUTH_TOKEN

# 3. 部署
vercel --prod
```

迁移在 `npm run build` 时由 `scripts/migrate-turso.mjs` 自动执行。本地开发继续使用 SQLite，无需配置 Turso。

## 未完成功能 (TODO 中的高级功能)

- PNG 角色卡嵌入 (tEXt chunk)
- 精确 tokenizer (tiktoken / DeepSeek tokenizer)
- 世界书 sticky/cooldown/recursion
- Prompt 调试面板 (查看发送给 AI 的完整 Prompt)
- 多角色群聊
- 插件系统
- i18n 国际化
- PWA
