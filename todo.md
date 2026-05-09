# TODO — AI Role Chat

## 2026-05-10: Conversation table error 已修复

**问题**: 发送消息时报 `no such table: main.Conversation`。

**根因**: dev server 在 Conversation 迁移执行之前就已启动，进程中缓存的 Prisma client 不包含 Conversation 模型。虽然数据库表已存在，但 Prisma client 在生成时 schema 里还没有 Conversation。

**修复**:
1. 杀掉旧的 dev server 进程
2. 重新生成 Prisma client (`npx prisma generate`)
3. 创建 `.env` 文件写入 `DATABASE_URL="file:./dev.db"`（便于 Prisma CLI 读取）
4. 重新启动 dev server

**验证**: curl 测试登录 → 列出角色 → 发送消息 → 列出会话，全部通过。`npm run build` 成功。

---

## 已有功能总结

- JWT 认证（登录/注册/登出），httpOnly cookie
- 双账户：demo (123/123, 内存存储) + admin (lbh/lbh, DB 存储)
- 角色卡系统：JSON 文件存储，CRUD，导入/导出
- AI 对话：DeepSeek v4-flash，支持 SSE 流式输出
- 多会话管理：每个角色可创建多个对话
- WeChat 风格 UI：移动端优先，480px 居中容器，抽屉侧栏
- 深色模式：CSS 变量 + localStorage 持久化
- Markdown 渲染 + 代码高亮
- 消息操作：复制、重新生成
- 管理员面板：用户列表、删除用户
- 设置面板：temperature、maxTokens 可调
- 速率限制：内存滑动窗口 30 req/min

## 可扩展方向

- 真正的 tokenizer（替换字符估算）
- 用户自助修改密码
- 角色卡图片/头像上传
- 对话搜索
- 对话导出
- 国际化 (i18n)
- 更好的错误提示（当前对用户不够友好）
