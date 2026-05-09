# AI Role Chat

轻量版 SillyTavern 风格的 AI 角色聊天网站。

> GitHub: https://github.com/Komorebi-G/ai-role-chat

## 技术栈

- Next.js App Router
- TypeScript
- SQLite / Turso + Prisma
- bcryptjs + jose (auth)
- DeepSeek API (deepseek-v4-flash)

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入你的 DEEPSEEK_API_KEY

# 3. 初始化数据库
npx prisma migrate dev --name init

# 4. 启动开发服务器
npm run dev
```

## 添加角色卡

在 `characters/` 目录下创建 JSON 文件：

```json
{
  "id": "角色ID",
  "name": "角色名称",
  "description": "角色描述",
  "personality": "性格设定",
  "scenario": "对话场景",
  "first_mes": "开场白（首次进入时显示）",
  "mes_example": "用户：示例对话\n角色：示例回复",
  "system_prompt": "角色专属系统提示词",
  "creator_notes": "作者备注（可选）",
  "tags": ["标签1", "标签2"]
}
```

必填字段：`id`、`name`。其他字段缺失时使用空值 fallback，不会崩溃。
`first_mes` 和 `firstMessage` 均可使用（优先 `first_mes`）。

## 目录结构

```
ai-role-chat/
├── app/                  # Next.js App Router
│   ├── api/              # API routes
│   │   ├── auth/         # 注册/登录/登出
│   │   ├── characters/   # 角色列表
│   │   └── chat/         # 聊天消息
│   ├── login/            # 登录页
│   ├── register/         # 注册页
│   ├── chat/             # 聊天页
│   ├── layout.tsx        # 根布局
│   └── page.tsx          # 首页（自动跳转）
├── characters/           # 角色卡 JSON 文件
├── lib/                  # 工具库
│   ├── db.ts             # Prisma 客户端（SQLite/Turso 双模式）
│   ├── auth.ts           # JWT 认证
│   ├── character.ts      # 角色卡加载与 fallback
│   ├── deepseek.ts       # DeepSeek API 调用
│   ├── ai.ts             # AI 请求封装（超时/限流）
│   ├── prompt/
│   │   └── buildPrompt.ts  # 分层 Prompt 构建（SillyTavern 风格）
│   └── chat/
│       └── context.ts    # 上下文裁剪（FIFO + 字符预算估算）
├── prisma/               # 数据库 Schema
└── .env.example          # 环境变量示例
```

## 安全

- 密码使用 bcrypt 哈希存储
- 登录态使用 httpOnly cookie
- API Key 仅存储在服务端 `.env.local`
- 所有 API 接口校验登录状态
- 用户只能看到自己的聊天记录

## Vercel 部署

Vercel 无文件系统，需要改用 Turso（云端 SQLite）作为数据库。

### 1. 创建 Turso 数据库

```bash
# 安装 Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# 注册并创建数据库
turso auth signup
turso db create ai-role-chat

# 获取连接信息
turso db show ai-role-chat --url     # → TURSO_DATABASE_URL
turso db tokens create ai-role-chat  # → TURSO_AUTH_TOKEN

# 推送表结构到 Turso
turso db shell ai-role-chat < prisma/migrations/*/migration.sql
```

### 2. 配置 Vercel 环境变量

在 Vercel Dashboard → Settings → Environment Variables 添加：

| 变量名 | 值 |
|--------|-----|
| `DEEPSEEK_API_KEY` | `sk-you-key` |
| `JWT_SECRET` | 随机字符串（如 `openssl rand -hex 32`） |
| `TURSO_DATABASE_URL` | `libsql://your-db.turso.io` |
| `TURSO_AUTH_TOKEN` | Turso 生成的 auth token |

### 3. 部署

```bash
npm i -g vercel
vercel        # 预览部署
vercel --prod # 生产部署
```

> 本地开发继续使用 SQLite，无需配置 Turso 环境变量。

### 环境变量

| 变量名 | 说明 | 本地 | Vercel |
|--------|------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | `.env.local` | 必需 |
| `JWT_SECRET` | JWT 签名密钥 | 默认值可用 | 必需（更换为随机串） |
| `DATABASE_URL` | SQLite 文件路径 | `file:./dev.db` | 不需要 |
| `TURSO_DATABASE_URL` | Turso 数据库地址 | 不需要 | 必需 |
| `TURSO_AUTH_TOKEN` | Turso 认证令牌 | 不需要 | 必需 |
