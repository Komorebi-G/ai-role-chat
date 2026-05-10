# AI Role Chat

SillyTavern 风格的轻量级 AI 角色扮演聊天平台，支持角色卡 JSON、世界书（World Info）、Swipe 回复变体、用户人设（Persona）、流式输出、多会话管理。

> GitHub: https://github.com/Komorebi-G/ai-role-chat

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 App Router (React 19) |
| 语言 | TypeScript |
| 数据库 | SQLite (本地) / Turso (Vercel 云端) |
| ORM | Prisma + @prisma/adapter-libsql |
| 认证 | bcryptjs + jose (JWT) |
| AI 模型 | DeepSeek (deepseek-v4-flash) |
| 渲染 | react-markdown |
| 测试 | vitest |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 DEEPSEEK_API_KEY

# 3. 初始化数据库
npx prisma migrate dev

# 4. 启动开发服务器
npm run dev
```

打开 http://localhost:3000，使用以下账户登录：

| 账户 | 用户名 | 密码 | 说明 |
|------|--------|------|------|
| Demo | `123` | `123` | 数据存内存，重启消失 |
| Admin | `lbh` | `lbh` | 完整功能，数据持久化 |

## 项目命令

```bash
npm run dev        # 开发服务器（端口 3000）
npm run build      # 生产构建（含 Turso 数据库迁移）
npm run lint       # ESLint 代码检查
npm run typecheck  # TypeScript 类型检查
npm run test       # vitest 运行测试（25 个测试，3 个文件）
npx vitest         # 测试监听模式
```

## 项目架构

### 整体分层

```
┌──────────────────────────────────────┐
│  浏览器（移动端优先，480px 居中）      │
├──────────────────────────────────────┤
│  Next.js App Router (app/)           │
│  ├── page.tsx       认证网关          │
│  ├── chat/          聊天 SPA          │
│  ├── login/         登录页            │
│  └── register/      注册页            │
├──────────────────────────────────────┤
│  API Routes (app/api/)               │
│  ├── auth/          登录/注册/登出     │
│  ├── chat/          聊天接口           │
│  ├── chat/import/   JSONL 导入        │
│  ├── characters/    角色卡 CRUD        │
│  ├── conversations/ 会话管理           │
│  ├── worlds/        世界书 CRUD        │
│  └── admin/         用户管理（管理员）  │
├──────────────────────────────────────┤
│  业务逻辑层 (lib/)                    │
│  ├── auth.ts        JWT 认证          │
│  ├── db.ts          数据库双模式       │
│  ├── character.ts   角色卡加载/缓存    │
│  ├── ai.ts          AI 请求封装        │
│  ├── deepseek.ts    DeepSeek API      │
│  ├── prompt/        Prompt 分层构建    │
│  ├── world/         世界书匹配         │
│  ├── chat/          上下文裁剪         │
│  └── demo-store.ts  Demo 内存存储     │
├──────────────────────────────────────┤
│  数据层                                │
│  ├── SQLite (本地开发)                 │
│  └── Turso (Vercel 生产)              │
└──────────────────────────────────────┘
```

### 数据库模型

```
User
  ├── id, username, passwordHash, role, createdAt
  ├── has many Message (级联删除)
  └── has many Conversation (级联删除)

Conversation
  ├── id, userId, characterId, title, createdAt
  └── has many Message (级联删除)

Message
  ├── id, userId, characterId, conversationId
  ├── role (user / assistant / system)
  ├── content, createdAt
  ├── swipes (JSON 字符串数组，存储回复变体)
  └── swipeId (当前显示的变体下标)
```

本地开发使用文件 SQLite（`prisma/dev.db`），Vercel 部署使用 Turso 云端 SQLite。`lib/db.ts` 根据环境变量自动切换：

- **本地**：`TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN` 未设置 → 使用 `DATABASE_URL`（文件 SQLite）
- **云端**：两个 Turso 变量均已设置 → 使用 `@prisma/adapter-libsql` 连接 Turso

### AI 调用链路

```
客户端 POST /api/chat
  └── buildPrompt()        分层组装 Prompt
      ├── System Rules      全局系统规则
      ├── User Persona      用户人设（可选）
      ├── World Info Before 世界书条目（角色描述前）
      ├── Character Prompt  角色 System Prompt + 角色卡信息
      ├── World Info After  世界书条目（角色描述后）
      ├── Example Dialogue  示例对话（来自 mes_example）
      ├── Chat History      裁剪后的聊天历史
      └── Post-History      对话后指令
  └── trimHistory()        上下文裁剪（FIFO）
  └── aiChat() / aiChatStream()   速率限制 + 超时控制
  └── chatWithDeepSeek()          原生 fetch 调用 DeepSeek API
```

### 认证流程

- JWT 令牌存储在 `token` httpOnly Cookie 中，7 天有效期
- `lib/auth.ts` 提供 `requireAuth()`（必须登录）和 `getSession()`（可选登录）
- Demo 账户（`123`/`123`）：完全内存存储，通过 `demo_sid` Cookie 隔离浏览器会话，服务器重启后数据丢失
- Admin 账户（`lbh`/`lbh`）：首次登录时自动在数据库中创建，`role` 字段为 `"admin"`
- 密码使用 bcrypt 哈希存储
- 管理员接口（角色卡/世界书写入、用户管理）检查 `role === "admin"`

## 功能详解

### 角色卡系统

角色卡是 `characters/` 目录下的 JSON 文件，描述一个 AI 角色的全部设定。

**支持的字段**：

| 字段 | 必需 | 说明 |
|------|------|------|
| `id` | 是 | 唯一标识符（可以与文件名不同） |
| `name` | 是 | 角色显示名称 |
| `description` | 否 | 角色外观/背景描述 |
| `personality` | 否 | 性格特征 |
| `scenario` | 否 | 对话场景/情境设定 |
| `first_mes` | 否 | 开场白（首次进入对话时显示），别名 `firstMessage` |
| `mes_example` | 否 | 示例对话，使用 `<START>` 分隔多轮对话 |
| `system_prompt` | 否 | 角色专属系统提示词（注入到角色信息之前） |
| `post_history_instructions` | 否 | 对话后指令（注入到聊天历史之后，用户输入之前） |
| `alternate_greetings` | 否 | 替代开场白列表（`string[]`） |
| `creator` | 否 | 角色创作者名称 |
| `character_version` | 否 | 角色卡版本号 |
| `creator_notes` | 否 | 创作者备注（仅展示用） |
| `tags` | 否 | 标签列表（`string[]`） |

**示例角色卡（alice.json）**：

```json
{
  "id": "alice",
  "name": "Alice",
  "description": "Alice 是你的大学朋友，有一头棕色长发，总是穿着休闲的毛衣。",
  "personality": "温柔、真诚、乐观、喜欢帮助别人",
  "scenario": "Alice 发现你最近有些孤独，决定多陪陪你。",
  "first_mes": "嘿，最近好像很少见到你了，你还好吗？",
  "mes_example": "用户：最近压力好大\nAlice：我理解你，不用给自己太大压力。你已经做得很好了\n<START>\n用户：谢谢你一直陪在我身边\nAlice：真的吗？太好了！我一直都在你这边哦",
  "system_prompt": "你正在与朋友进行轻松愉快的对话。保持自然、温暖的语气。",
  "post_history_instructions": "请以 Alice 的身份自然地继续对话，不要重复之前说过的内容。",
  "alternate_greetings": ["嗨，今天过得怎么样？", "好久不见！最近发生了什么有趣的事吗？"],
  "creator": "AliceCreator",
  "character_version": "1.0",
  "tags": ["friend", "comfort", "slice-of-life"]
}
```

**角色卡 API**：
- `GET /api/characters` — 列出所有角色
- `GET /api/characters?id=xxx` — 获取单个角色
- `POST /api/characters` — 创建角色（管理员）
- `PUT /api/characters?id=xxx` — 更新角色（管理员）

前端支持角色卡创建/编辑、JSON 导入/导出，以及角色信息查看模态框。

### 世界书（World Info）

世界书是一个条件性 Prompt 注入系统：当聊天内容匹配到条目的关键词时，条目内容会自动注入到系统 Prompt 中。这是从 SillyTavern 的 Lorebook 简化而来的设计。

世界书文件位于 `worlds/` 目录下，每个条目包含：

| 字段 | 说明 |
|------|------|
| `id` | 条目唯一标识 |
| `keys` | 触发关键词列表（`string[]`），匹配用户最近消息 |
| `content` | 匹配成功后注入的文本内容 |
| `enabled` | 是否启用（`true`/`false`） |
| `position` | 注入位置：`beforeCharacter`（角色描述之前）/ `afterCharacter`（角色描述之后） |
| `order` | 排序权重，值越小越靠前 |

**示例（worlds/default.json）**：

```json
{
  "id": "fantasy-world",
  "name": "奇幻世界",
  "description": "一个奇幻世界设定的世界书。",
  "entries": [
    {
      "id": "e1",
      "keys": ["dragon", "龙", "巨龙"],
      "content": "远古巨龙艾尔索里昂盘踞在北方的龙脊山脉，已经守护这片大陆千年。",
      "enabled": true,
      "position": "beforeCharacter",
      "order": 0
    },
    {
      "id": "e2",
      "keys": ["魔法", "咒语", "magic"],
      "content": "这个世界中的魔法需要消耗精神力，过于频繁地使用魔法会导致昏迷。",
      "enabled": true,
      "position": "afterCharacter",
      "order": 1
    }
  ]
}
```

当用户在消息中提到"龙"或"魔法"时，对应的世界设定会自动出现在系统 Prompt 中，让 AI 了解世界观。

前端聊天界面会在世界书被激活时显示一个状态栏，列出当前激活的条目名称。

**世界书 API**：
- `GET /api/worlds` — 列出所有世界书
- `POST /api/worlds` — 创建世界书（管理员）
- `PUT /api/worlds` — 更新世界书（管理员）
- `DELETE /api/worlds` — 删除世界书（管理员）

### Swipe 回复变体

每条 AI 回复支持多个变体，用户可以在不同版本之间切换。这是 SillyTavern 的核心交互模式之一。

**数据结构**：
- `swipes`：JSON 字符串数组，存储所有回复变体
- `swipeId`：当前显示的变体下标

**交互方式**：

| 操作 | 行为 |
|------|------|
| 发送消息 | AI 回复存为第 0 个 swipe |
| 重新生成 | 新回复追加到 swipes 数组末尾，自动切换到新变体 |
| 左右滑动 | 点击消息气泡上的 ◂ N/M ▸ 按钮切换变体 |
| 刷新页面 | swipeId 存储在数据库，刷新后保持当前选择 |

**实现细节**：
- `POST /api/chat` 带 `regenerate: true` → 追加新 swipe 而非覆盖
- `PATCH /api/chat` 带 `{ messageId, conversationId, swipeId }` → 切换当前显示
- JSONL 导出包含完整 swipes 数据

### 上下文裁剪

基于字符数的 FIFO（先进先出）策略，防止 Prompt 超出模型上下文窗口。

- 默认保留最近 20 条消息
- 默认最大 8000 字符
- 从最旧的消息开始丢弃，直到满足限制
- 使用字符数估算 Token（未来可替换为精确 tokenizer）
- 裁剪只影响聊天历史，核心 Prompt（系统规则、角色设定、世界书）不受影响

前端聊天界面底部有 Token 预算进度条，颜色变化表示使用情况：
- 绿色：预算充足
- 黄色：接近上限
- 红色：已达上限

### 用户人设（Persona）

用户可以在前端 Settings 面板中设置自己的角色描述（Persona），告诉 AI "你是谁"。例如：

> "我叫小明，是一名大学生，今年 22 岁。我喜欢编程和科幻小说。"

Persona 存储在浏览器的 localStorage 中，每次发送聊天请求时作为 `persona` 字段传递给后端，注入到系统 Prompt 的 `[User Persona]` 区域。关闭或清空 Persona 后不会注入。

### 多会话管理

支持为同一角色创建多个独立对话。

**会话 API**：
- `GET /api/conversations?characterId=X` — 获取当前用户与某角色的所有会话
- `POST /api/conversations` — 创建新会话（`{ characterId, title? }`）
- `PATCH /api/conversations` — 重命名会话（双击抽屉中的会话标题）
- `DELETE /api/chat?conversationId=X` — 清除指定会话的所有消息

每个会话独立存储消息，切换会话时聊天历史完全隔离。

### 聊天功能

**发送与接收**：
- 固定底部输入框（移动端友好），Enter 发送
- 支持 SSE 流式输出，逐字显示 AI 回复
- 流式输出时显示 "Thinking..." 动画指示器
- AI 回复支持 Markdown 渲染（react-markdown），包括代码块高亮

**消息操作**：
- 复制消息内容
- 重新生成 AI 回复（追加新 swipe）
- Swipe 左右切换（◂ N/M ▸）
- 前端消息搜索（在当前对话中搜索关键词）

**JSONL 导入/导出**：
- 导出：`GET /api/chat?characterId=X&format=jsonl` → 下载 JSONL 文件
- 导入：`POST /api/chat/import` → 上传 JSONL 文件，将消息写入当前会话
- 导出文件名格式：`chat-{characterId}-{date}.jsonl`

**设置面板**：
- Temperature（0.1 - 2.0，默认 0.8）
- Max Tokens（128 - 4096，默认 1024）
- Persona 文本输入
- 所有设置存储在 localStorage

### 前端界面

**布局（移动端优先）**：
- 480px 最大宽度，居中显示
- 固定顶部导航栏（返回按钮 + 角色名 + 更多菜单）
- 消息区域可滚动
- 固定底部输入栏

**视觉风格**：
- WeChat 风格聊天气泡（用户绿色/右侧，AI 白色/左侧）
- 气泡带有三角形箭头
- CSS 变量驱动，支持亮色/深色主题切换
- 深色模式通过 `<script>` 内联读取 localStorage，避免页面闪烁

**抽屉侧边栏**：
- 角色列表（头像 + 名称 + 最近消息预览）
- 会话列表（支持切换、新建、重命名）
- 消息计数显示

**更多菜单**：
- 会话列表
- 新建聊天
- 设置（Temperature / MaxTokens / Persona）
- 主题切换（深色/浅色）
- 编辑角色（管理员）
- 清除聊天
- 退出登录

**其他 UI 组件**：
- 角色创建/编辑模态框
- 角色信息查看模态框（显示全部字段）
- JSON 导入/导出文件选择器
- 世界书激活状态指示栏
- Token 预算进度条
- Admin 面板（用户管理）

## 环境变量

| 变量名 | 说明 | 本地开发 | Vercel 部署 |
|--------|------|----------|-------------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | `.env.local` | 必需 |
| `JWT_SECRET` | JWT 签名密钥 | 默认值可用 | 必需（换成随机字符串） |
| `DATABASE_URL` | SQLite 文件路径 | `file:./dev.db` | 不需要 |
| `TURSO_DATABASE_URL` | Turso 数据库地址 | 不需要 | 必需 |
| `TURSO_AUTH_TOKEN` | Turso 认证令牌 | 不需要 | 必需 |

- `.env` — Prisma CLI 使用（数据库连接）
- `.env.local` — Next.js 使用（应用配置、API Key）

## Vercel 部署

```bash
# 1. 创建 Turso 数据库
turso db create ai-role-chat
turso db show ai-role-chat --url     # → TURSO_DATABASE_URL
turso db tokens create ai-role-chat  # → TURSO_AUTH_TOKEN

# 2. 配置 Vercel 环境变量
# Dashboard → Settings → Environment Variables
# 添加：DEEPSEEK_API_KEY、JWT_SECRET、TURSO_DATABASE_URL、TURSO_AUTH_TOKEN

# 3. 部署
vercel --prod
```

数据库迁移在 `npm run build` 时由 `scripts/migrate-turso.mjs` 自动执行：

1. 检查 `_prisma_migrations` 表是否存在，不存在则创建
2. 遍历 `prisma/migrations/` 下所有迁移目录（按时间排序）
3. 对每个迁移，先检查是否已记录在 `_prisma_migrations` 表中
4. 再检查迁移效果是否已体现在数据库 Schema 中（快照检测：查询 `sqlite_master` 和 `pragma_table_info`）
5. 若已生效则仅记录跳过，否则执行迁移 SQL 并记录
6. 整个流程有 60 秒超时保护，防止 Vercel 构建阶段无限挂起

本地开发不需要 Turso，继续使用文件 SQLite。

## 目录结构

```
ai-role-chat/
├── app/
│   ├── api/
│   │   ├── admin/users/      # 用户管理 API（管理员）
│   │   ├── auth/login/       # 登录
│   │   ├── auth/logout/      # 登出
│   │   ├── auth/me/          # 当前用户信息
│   │   ├── auth/register/    # 注册
│   │   ├── characters/       # 角色卡 CRUD
│   │   ├── chat/             # 聊天接口（GET/POST/PATCH/DELETE）
│   │   ├── chat/import/      # JSONL 导入
│   │   ├── conversations/    # 会话管理
│   │   └── worlds/           # 世界书 CRUD（管理员写入）
│   ├── chat/page.tsx         # 聊天页（单页应用）
│   ├── login/page.tsx        # 登录页
│   ├── register/page.tsx     # 注册页
│   ├── layout.tsx            # 根布局（含 FOUC 防止）
│   ├── globals.css           # 全局样式（CSS 变量 + 主题）
│   └── page.tsx              # 首页（认证网关）
├── characters/               # 角色卡 JSON 文件
│   ├── alice.json
│   └── ben.json
├── worlds/                   # 世界书 JSON 文件
│   └── default.json
├── lib/
│   ├── db.ts                 # Prisma 客户端（SQLite/Turso 双模式）
│   ├── auth.ts               # JWT 认证（jose）
│   ├── character.ts          # 角色卡加载、缓存、字段 fallback
│   ├── deepseek.ts           # DeepSeek API 原始调用（含 SSE 流）
│   ├── ai.ts                 # AI 请求封装（速率限制 + 超时）
│   ├── demo-store.ts         # Demo 账户内存存储
│   ├── prompt/
│   │   └── buildPrompt.ts    # 分层 Prompt 构建器
│   ├── world/
│   │   └── index.ts          # 世界书加载与关键词匹配
│   └── chat/
│       └── context.ts        # 上下文裁剪（FIFO）
├── prisma/
│   ├── schema.prisma         # 数据库 Schema 定义
│   └── migrations/           # 数据库迁移文件
├── scripts/
│   └── migrate-turso.mjs     # Vercel 构建时 Turso 自动迁移
├── TODO.md                   # 待办事项与功能清单
├── README.md                 # 项目说明（本文件）
└── package.json
```

## 安全措施

- 密码使用 bcrypt 哈希，不存储明文
- 登录态使用 httpOnly JWT Cookie（7 天过期），JavaScript 不可读取
- API Key 仅存储在服务端环境变量中，不暴露给前端
- 所有 API 接口校验登录状态
- 用户数据隔离：只能看到自己的聊天记录和会话
- 管理员接口检查 `role` 字段，普通用户无权访问
- Demo 账户通过 `demo_sid` Cookie 隔离不同浏览器的数据

## 设计理念

本项目借鉴 SillyTavern 的设计思想，但不复制其实现：

- **角色卡为第一公民**：JSON 文件包含分层 Prompt 字段，角色通过目录文件管理
- **分层 Prompt 组装**：每层（系统规则、角色设定、世界书、示例对话、历史记录）有独立的位置和优先级
- **Token 预算驱动**：不是"满了就截断"，而是按组件分配预算并按优先级降级
- **Swipe 为核心交互**：AI 回复支持多版本变体，用户可以自由切换
- **世界书条件注入**：通过关键词匹配触发 Prompt 注入，动态扩展世界观
- **移动端优先**：480px 居中容器、固定底部输入、抽屉侧边栏

## 未完成功能

以下功能已在计划中但尚未实现：

- PNG 角色卡嵌入（tEXt chunk 保存/读取角色信息）
- 精确 Tokenizer（tiktoken 或 DeepSeek tokenizer）
- 高级世界书功能（sticky 锁定、cooldown 冷却、recursion 递归）
- Prompt 调试面板（查看完整发送给 AI 的 Prompt）
- 多角色群聊
- 插件系统
- i18n 国际化
- PWA 离线支持
