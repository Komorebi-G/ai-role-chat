# AI Role Chat — 维护 todo

## 一、已有功能总结

- Next.js 15 (App Router) + React 19 + TypeScript + SQLite/Turso + Prisma + DeepSeek API
- JWT 认证（jose）：注册/登录/登出，httpOnly cookie，7 天有效期
- 双模式数据库：本地 SQLite / Turso 云端 SQLite
- 角色卡系统：JSON 文件 CRUD + 导入导出，字段 fallback 容错
- 分层 Prompt 构建 + 上下文裁剪
- per-user 速率限制 + 30 秒超时
- 内置账号：演示 123/123（内存隔离会话）、管理员 lbh/lbh
- 管理员面板：查看/删除用户
- WeChat 风格 UI：聊天列表 + 聊天气泡（绿色/白色）+ 抽屉侧边栏 + 顶部导航 + 底部输入
- AI 流式输出、Markdown 渲染、复制/重新生成
- 深色模式（CSS 变量）、移动端响应式（桌面 480px 居中）
- ESLint + typecheck + vitest 测试（14 tests）

## 二、已完成

详见 [CHANGELOG.md](./CHANGELOG.md)

## 三、Bug 修复记录

### Conversation 表缺失 ✅
- **现象**：发送消息时 `no such table: main.Conversation`
- **原因**：迁移 `20260509150453_add_conversations` 未在当前数据库执行
- **修复**：运行 `DATABASE_URL="file:./dev.db" npx prisma migrate dev` 应用迁移
- **验证**：curl 测试登录 → 获取会话列表 → 发送消息 → AI 正常回复
- **结果**：lint ✅ typecheck ✅ test ✅ build ✅

## 四、底层优化（暂缓）

- Token 精确计算（tiktoken）
- CSRF 保护
- 多实例速率限制同步
