# AI Role Chat

轻量版 SillyTavern 风格的 AI 角色聊天网站。

> GitHub: https://github.com/Komorebi-G/ai-role-chat

## 技术栈

- Next.js App Router
- TypeScript
- SQLite + Prisma
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
  "firstMessage": "角色第一句话"
}
```

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
│   ├── db.ts             # Prisma 客户端
│   ├── auth.ts           # JWT 认证
│   ├── character.ts      # 角色加载
│   ├── deepseek.ts       # DeepSeek API 调用
│   └── ai.ts             # AI 请求封装（超时/限流）
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

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 部署
vercel

# 3. 配置环境变量
# 在 Vercel Dashboard → Settings → Environment Variables 添加：
#   DEEPSEEK_API_KEY = sk-you-key

# 4. 生产部署
vercel --prod
```

### 环境变量

| 变量名 | 说明 | 位置 |
|--------|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | `.env.local`（本地）/ Vercel 环境变量（生产） |
| `JWT_SECRET` | JWT 签名密钥 | 生产环境务必更换为随机字符串 |
| `DATABASE_URL` | SQLite 数据库路径 | 仅本地开发使用 |
