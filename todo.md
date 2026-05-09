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
- 聊天 UI：角色侧边栏、多对话、消息动画、开场白、对话清空
- AI 流式输出、Markdown 渲染、复制/重新生成
- 深色模式（CSS 变量）、移动端响应式
- ESLint + typecheck + vitest 测试（14 tests）

## 二、已完成（1-10 轮）

详见 [CHANGELOG.md](./CHANGELOG.md)

## 三、当前 TODO

**把聊天前端改成手机微信聊天界面风格（mobile-first）**

### 视觉要求
- 类似微信聊天页，而不是桌面 Web 聊天
- 背景使用浅灰色
- 用户消息在右侧，绿色气泡
- AI/角色消息在左侧，白色气泡
- 每条消息显示头像
- 顶部固定导航栏：返回/菜单按钮、角色名、更多按钮
- 底部固定输入栏：输入框、发送按钮，可预留语音/表情/加号位置
- 消息区域在顶部栏和底部输入栏之间滚动
- 手机上侧边栏不要常驻，改成抽屉或角色列表页
- 保留现有功能：角色切换、多对话、新聊天、流式输出、Markdown 渲染、复制、重新生成、深色模式

### 实现要求
- 不要改后端 API
- 优先改 UI 结构和 CSS
- 移动端宽度 390px 左右要像微信
- 桌面端可以居中显示一个手机宽度容器，或者左右分栏
- 不要引入复杂 UI 库，除非必要

## 五、迭代记录

### 第 11 轮 — WeChat 风格 UI 重构 ✅
- **修改**：`app/chat/page.tsx` 完全重写为两个视图：角色列表页（WeChat 聊天列表）+ 聊天页（WeChat 聊天界面）
  - 顶部固定导航栏（返回键、角色名、更多菜单⋯）
  - 底部固定输入栏（🎤 😊 输入框 Send/⊕）
  - 消息气泡：用户绿色右侧、AI 白色左侧、带箭头、带圆形头像
  - 抽屉式侧边栏（slide-in）替代常驻侧边栏
  - 更多菜单（Conversations、New Chat、Settings、Dark Mode、Edit/Clear、Logout）
  - 桌面端居中 480px 容器
- **修改**：`app/globals.css` 完全重写为 WeChat 风格
  - CSS 变量保留亮/暗主题
  - 微信绿气泡 `#95ec69`、用户头像绿色 `#07c160`
  - 浅灰背景 `#ededed`、消息区域滚动
  - 登录/注册页样式保留
- **结果**：lint ✅ typecheck ✅ test (14) ✅ build ✅
- **使用**：进入后看到角色聊天列表，点击进入 WeChat 风格聊天页，左上角 ← 返回列表，右上角 ⋯ 打开菜单

- Token 精确计算（tiktoken）
- CSRF 保护
- 多实例速率限制同步
