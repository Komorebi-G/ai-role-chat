# AI Role Chat 功能文档

轻量版 SillyTavern 风格的 AI 角色聊天网站。

技术栈：Next.js 15 (App Router) + React 19 + TypeScript + SQLite/Turso + Prisma + DeepSeek API

---

## 一、用户认证

### 注册
- 用户名 + 密码注册，创建后自动登录
- 密码规则：8~16 位，必须同时包含字母和数字
- 后端独立校验（不依赖前端），不符合规则返回清晰错误提示
- 新用户默认角色为 `user`
- 密码使用 bcrypt（10轮加盐）哈希存储

### 登录
- 用户名 + 密码登录，登录态保持 7 天
- JWT 令牌存储在 httpOnly cookie（`token`），前端 JS 不可读取
- 内置两个快捷账号（在登录逻辑中优先匹配，不走数据库）：

| 账号 | 密码 | 角色 | 数据存储 |
|------|------|------|----------|
| `123` | `123` | user（演示账号） | 内存数组（重启丢失、多人共享） |
| `lbh` | `lbh` | admin（管理员） | 数据库（首次登录自动创建） |

### 登出
- 清除 `token` cookie，跳转回登录页

### 当前用户信息
- `GET /api/auth/me` 返回当前用户 ID 和角色，用于前端判断是否显示管理入口

---

## 二、角色卡系统

### 角色卡格式

在 `characters/` 目录下创建 JSON 文件：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一标识 |
| `name` | 是 | 角色名称 |
| `description` | 否 | 角色描述 |
| `personality` | 否 | 性格设定 |
| `scenario` | 否 | 对话场景 |
| `first_mes` | 否 | 开场白（支持 `firstMessage` 别名，优先 `first_mes`） |
| `mes_example` | 否 | 示例对话，格式为 `说话人：内容` 每行一条 |
| `system_prompt` | 否 | 角色专属系统提示词 |
| `creator_notes` | 否 | 作者备注（不影响对话） |
| `tags` | 否 | 标签数组（不影响对话） |

### 容错设计
- 所有非必填字段缺失时使用空字符串 fallback，不会崩溃
- 角色卡目录为空时，自动使用内置默认角色（"Assistant"）
- `id` 缺失时从文件名自动推导

### 示例角色
- `alice.json`：温柔、真诚的大学朋友，配有完整的系统提示词和示例对话

---

## 三、AI 聊天

### Prompt 构建（SillyTavern 风格分层架构）

发给 AI 的消息分为五层，使用 messages 数组格式而非拼接大字符串：

1. **系统层** — 全局角色扮演规则 + 角色专属 `system_prompt`
2. **角色信息层** — 角色名、描述、性格、场景设定
3. **示例对话层** — `mes_example` 解析为 user/assistant 交替消息，教授模型对话风格
4. **历史层** — 最近聊天记录
5. **用户输入** — 当前发送的消息

### 上下文裁剪

- 保留最近 20 条消息（可配置）
- 总字符数预算 8000 字符（约 2000 tokens），超出时从最旧消息开始丢弃（FIFO）
- 裁剪仅在 Prompt 组装时进行，数据库中保留完整历史
- 当前使用字符数估算 token，留有 TODO 后续替换为 tiktoken 精确计算

### DeepSeek API 配置
- 模型：`deepseek-v4-flash`
- 温度：0.8
- 最大输出：1024 tokens
- API Key 通过环境变量 `DEEPSEEK_API_KEY` 配置，仅存储在服务端

### 速率限制与超时
- 全局限流：每 60 秒最多 30 次请求（内存滑动窗口）
- 单次请求超时：30 秒
- 超限返回友好错误信息

---

## 四、聊天界面

### 布局
- 左侧 260px 角色列表侧边栏 + 右侧聊天主区域
- 点击角色切换对话，高亮当前选中角色
- 侧边栏底部：管理员可见"用户管理"按钮

### 消息显示
- 用户消息：右对齐，靛蓝色气泡
- AI 消息：左对齐，白色气泡
- 新消息带有淡入 + 上滑动画（`fadeInUp`, 0.25s）
- 新消息自动滚动到底部
- AI 回复中显示 "Thinking..." 加载动画

### 开场白
- 首次进入角色对话（无历史消息）时，自动显示角色的 `first_mes` 作为开场白
- 开场白仅前端展示，不存入数据库

### 用户体验
- 用户消息乐观更新（先显示，发送失败回滚）
- 内联错误提示
- 发送中禁用输入框，防止重复发送
- 401 自动跳转登录页

---

## 五、管理员功能

### 权限控制
- 用户表新增 `role` 字段：`user`（默认）/ `admin`
- 管理员权限在数据库层面设置，无内置晋升接口
- 后端强制校验：非 admin 调用管理接口返回 403
- 前端根据角色判断是否显示管理入口

### 用户管理面板
- 管理员在侧边栏看到"User Management"按钮
- 点击弹出用户列表弹窗（表格形式）

| 列 | 内容 |
|----|------|
| Username | 用户名 |
| Role | 角色（admin 高亮显示） |
| Registered | 注册日期 |
| Action | 删除按钮（需二次确认） |

### 删除用户
- 删除用户时级联删除其所有聊天记录（Prisma `onDelete: Cascade`）
- 管理员不能删除自己
- `demo` 账号删除按钮置灰不可用

---

## 六、数据库

### 双模式 SQLite
- **本地开发**：文件 SQLite（`prisma/dev.db`），无需外部服务
- **Vercel 生产**：自动切换到 Turso（云端 SQLite + HTTP API）
- 切换由环境变量 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` 是否配置决定

### 数据模型

**User（用户表）**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| username | String | 唯一用户名 |
| passwordHash | String | bcrypt 密码哈希 |
| role | String | `user` 或 `admin`，默认 `user` |
| createdAt | DateTime | 注册时间 |

**Message（消息表）**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| userId | String | 所属用户（外键，级联删除） |
| characterId | String | 角色 ID（对应角色卡文件名/ID） |
| role | String | `user` 或 `assistant` |
| content | String | 消息内容 |
| createdAt | DateTime | 发送时间 |

### 演示账号数据
- 演示账号（`123`）的聊天数据**完全不经过数据库**
- 存储在服务端内存数组 `demoMessages` 中
- 服务重启后丢失、所有演示会话共享

---

## 七、部署

### 本地运行

```bash
npm install                        # 安装依赖
cp .env.example .env.local        # 配置环境变量（填入 DEEPSEEK_API_KEY）
npx prisma migrate dev --name init # 初始化本地数据库
npm run dev                        # 启动开发服务器（端口 3000）
```

### Vercel 部署

```bash
# 1. 创建 Turso 数据库
turso db create ai-role-chat
turso db show ai-role-chat --url     # 获取 TURSO_DATABASE_URL
turso db tokens create ai-role-chat  # 获取 TURSO_AUTH_TOKEN
turso db shell ai-role-chat < prisma/migrations/*/migration.sql  # 推送表结构

# 2. 在 Vercel Dashboard 配置环境变量
#    DEEPSEEK_API_KEY / JWT_SECRET / TURSO_DATABASE_URL / TURSO_AUTH_TOKEN

# 3. 部署
npm i -g vercel
vercel        # 预览部署
vercel --prod # 生产部署
```

### 环境变量

| 变量名 | 本地 | Vercel |
|--------|------|--------|
| `DEEPSEEK_API_KEY` | 必需 | 必需 |
| `JWT_SECRET` | 可选（默认 `dev-secret-change-in-production`） | 必需（建议 `openssl rand -hex 32`） |
| `DATABASE_URL` | `file:./dev.db` | 不需要 |
| `TURSO_DATABASE_URL` | 不需要 | 必需 |
| `TURSO_AUTH_TOKEN` | 不需要 | 必需 |

---

## 八、API 接口汇总

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | 无 | 注册新用户 |
| POST | `/api/auth/login` | 无 | 用户登录 |
| POST | `/api/auth/logout` | 无 | 用户登出 |
| GET | `/api/auth/me` | 需要 | 获取当前用户信息（ID + 角色） |
| GET | `/api/characters` | 需要 | 获取角色列表或单个角色（`?id=xxx`） |
| GET | `/api/chat` | 需要 | 获取与某角色的聊天历史（`?characterId=xxx`） |
| POST | `/api/chat` | 需要 | 发送消息并获取 AI 回复 |
| GET | `/api/admin/users` | 需要 + admin | 查看所有注册用户 |
| DELETE | `/api/admin/users/[id]` | 需要 + admin | 删除用户 |

---

## 九、安全措施

- 密码 bcrypt 哈希存储，不可逆
- JWT 令牌存储在 httpOnly cookie，防止 XSS 窃取
- API Key 仅存储在服务端环境变量，前端不可见
- 生产环境 Cookie 启用 `secure` 标志
- 所有聊天 API 必须登录后才能调用
- 管理接口双重校验（认证 + 角色）
- 用户只能查看自己的聊天记录
- 删除用户时级联删除所有关联消息

---

## 十、当前局限与后续规划

- 无测试套件
- 无 ESLint 配置
- Token 计数使用字符估算，需替换为 tiktoken 精确计算
- 速率限制基于进程内存，多实例部署时不准确
- 演示账号数据多人共享，无隔离
- AI 回复为整段返回，不支持流式输出（streaming）
- 无 CSRF 保护
- 角色卡仅支持文件加载，无在线编辑/导入功能
- 无对话分支/删除/导出功能
