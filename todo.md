# TODO — AI Role Chat

## 2026-05-10: Conversation table 错误修复（第二次分析）

**问题**: 发送消息时仍然报 `no such table: main.Conversation`

**排查过程**:
1. 确认数据库表 `Conversation` 存在（sqlite3 验证 schema 正确）
2. 确认迁移全部应用（3 migrations, Database schema is up to date）
3. curl 直接测试 API — 返回 500，错误信息为 `Cannot find module './331.js'`
4. 根因定位: **`.next` 构建缓存损坏** — webpack chunk manifest 引用了不存在的模块 `./331.js`

**为什么表现为 "no such table" 而不是 "Cannot find module"？**
- Next.js 500 错误页面的内容被前端作为 API 响应解析
- 旧 dev server 进程持有的 `.next` 缓存是在 schema 变更前生成的，其中 Prisma client 编译产物已过时
- webpack HMR 在文件变更后增量编译时产生了不一致的 chunk 引用

**修复**:
1. 杀掉 dev server
2. 删除整个 `.next` 目录（清除所有构建缓存）
3. 重新生成 Prisma client (`npx prisma generate`)
4. 创建 `.env` 文件（含 `DATABASE_URL`，确保 Prisma CLI 正常工作）
5. 重启 dev server

**验证结果**:
- curl: 登录 → GET /api/chat (findFirst) → POST /api/chat (create) → GET /api/conversations → 全部 200 ✅
- typecheck: 无错误 ✅
- lint: 无错误 ✅
- test: 14 tests passed ✅

---

## 已有功能

- JWT 认证（登录/注册/登出），httpOnly cookie
- 双账户：demo (123/123, 内存存储) + admin (lbh/lbh, DB 存储)
- 角色卡系统：JSON 文件 CRUD，导入/导出
- AI 对话：DeepSeek v4-flash，SSE 流式输出
- 多会话管理：每个角色可创建多个对话
- WeChat 风格 UI：移动端优先，480px 居中，抽屉侧栏
- 深色模式：CSS 变量 + localStorage
- Markdown 渲染 + 代码高亮
- 消息操作：复制、重新生成
- 管理员面板：用户列表、删除用户
- 设置面板：temperature、maxTokens
- 速率限制：30 req/min

## 可扩展方向

- 真正的 tokenizer
- 用户修改密码
- 角色卡头像上传
- 对话搜索/导出
- i18n
