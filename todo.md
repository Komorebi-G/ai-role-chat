# AI Role Chat — 维护 todo

## 一、已有功能总结

- Next.js 15 (App Router) + React 19 + TypeScript + SQLite/Turso + Prisma + DeepSeek API
- JWT 认证（jose）：注册/登录/登出，httpOnly cookie，7 天有效期
- 双模式数据库：本地 SQLite / Turso 云端 SQLite
- 角色卡系统：JSON 文件加载，字段 fallback 容错
- 分层 Prompt 构建 + 上下文裁剪
- per-user 速率限制 + 30 秒超时
- 内置账号：演示 123/123（内存隔离会话）、管理员 lbh/lbh
- 管理员面板：查看/删除用户
- 聊天 UI：角色侧边栏、消息动画、开场白、对话清空
- ESLint + typecheck + vitest 测试（14 tests）

## 二、用户可见功能 TODO（按优先级）

| # | 任务 | 难度 | 说明 |
|---|------|------|------|
| 1 | 设置面板（温度/Token数） | 低 | 用户可调 AI 参数，存 localStorage，请求时带上 |
| 2 | Markdown 消息渲染 | 低 | 消息支持加粗/列表/代码块等富文本 |
| 3 | 创建角色卡 UI | 中 | 表单创建角色卡，存为 JSON 文件到 characters/ |
| 4 | AI 流式输出 | 中 | 逐字显示 AI 回复，大提升体验 |
| 5 | 多对话/新聊天 | 中 | 每个角色可开多个对话，可切换 |
| 6 | 移动端适配 | 低 | 响应式布局，手机上可用 |
| 7 | 消息操作（复制/重新生成） | 低 | 每条消息可以复制、重新生成 AI 回复 |
| 8 | 深色模式 | 低 | 亮/暗主题切换 |
| 9 | 角色卡编辑 | 中 | 在 UI 上编辑已有角色卡 |
| 10 | 角色卡导入导出 | 低 | 上传/下载 JSON 角色卡文件 |

## 三、底层优化（用户不可见，暂缓）

- Token 精确计算（tiktoken）
- CSRF 保护
- 多实例速率限制同步

## 四、迭代记录

*（从第 1 轮重新开始，聚焦用户可见功能）*

### 第 1 轮 — 设置面板（温度/Token数） ✅
- **修改**：`app/chat/page.tsx` 添加 SettingsModal、localStorage 持久化
- **修改**：`app/globals.css` 添加 settings 相关样式
- **修改**：`app/api/chat/route.ts` POST 接受 `temperature`、`maxTokens` 并传给 AI
- **修改**：`lib/ai.ts` 的 `aiChat` 函数签名接受 `ModelOptions`
- **结果**：lint ✅ typecheck ✅ test ✅ build ✅
- **使用**：点击侧边栏齿轮图标打开设置面板，调整温度(0.1-2.0)和最大Token数(256-4096)，设置自动保存到浏览器

### 第 2 轮 — Markdown 消息渲染 ✅
- **修改**：`app/chat/page.tsx` 使用 `react-markdown` 渲染消息内容
- **修改**：`app/globals.css` 添加 markdown 样式（p, ul, ol, code, pre, blockquote, strong, em, hr, a）
- **结果**：lint ✅ typecheck ✅ test ✅ build ✅
- **使用**：AI 回复自动渲染 Markdown，支持加粗、斜体、列表、代码块、引用等

### 第 3 轮 — 创建角色卡 UI ✅
- **修改**：`app/chat/page.tsx` 添加 CreateCharacter modal 表单
- **修改**：`app/globals.css` 添加 form-input, form-textarea 样式
- **修改**：`app/api/characters/route.ts` 添加 POST（admin-only，写入 JSON 文件）
- **修改**：`lib/character.ts` 添加 `reloadCharacters()` 缓存刷新
- **修改**：`lib/prompt/buildPrompt.ts` 支持 `system_prompt`、`mes_example` 字段
- **结果**：lint ✅ typecheck ✅ test ✅ build ✅
- **使用**：管理员点击侧边栏 "+ Create Character"，填写 ID/名称/描述/性格/场景/开场白/示例对话/系统提示

### 第 4 轮 — AI 流式输出 ✅
- **修改**：`lib/deepseek.ts` 添加 `chatWithDeepSeekStream` async generator（SSE 流式解析）
- **修改**：`lib/ai.ts` 添加 `aiChatStream` async generator（限流+超时包装）
- **修改**：`app/api/chat/route.ts` POST 检测 `stream: true` → 返回 `ReadableStream` 响应，流式发送并异步保存完整回复
- **修改**：`app/chat/page.tsx` `handleSend` 发送 `stream: true`，用 `reader.read()` 逐块追加到 assistant 消息气泡
- **结果**：lint ✅ typecheck ✅ test ✅ build ✅
- **使用**：发送消息后 AI 回复会逐字显示，无需等待完整生成

### 第 5 轮 — 多对话/新聊天 ✅
- **修改**：`prisma/schema.prisma` 添加 Conversation 模型，Message 表添加 conversationId 外键
- **修改**：`app/api/conversations/route.ts` 新建，GET 列表、POST 创建对话
- **修改**：`app/api/chat/route.ts` GET/POST/DELETE 全部支持 conversationId，自动创建默认对话
- **修改**：`app/chat/page.tsx` 侧边栏显示对话子列表、"New Chat" 按钮、对话切换
- **修改**：`app/globals.css` 添加 conversation-sublist、conv-item、new-chat-btn 样式
- **结果**：lint ✅ typecheck ✅ test ✅ build ✅
- **使用**：选择角色后在侧边栏显示该角色的所有对话，可点击 "+ New Chat" 创建新对话，在不同对话之间切换，每个对话独立存储消息

### 第 6 轮 — 移动端适配 ✅
- **修改**：`app/chat/page.tsx` 添加 `sidebarOpen` 状态、hamburger 按钮、sidebar-overlay 遮罩层
- **修改**：`app/globals.css` 添加 `@media (max-width: 768px)` 响应式样式：
  - 侧边栏变为抽屉式（slide-in），点击遮罩关闭
  - 消息气泡占 85% 宽度
  - Modal 模态框自适应
  - 用户表格紧凑化
  - 顶部留出 hamburger 按钮位置
- **结果**：lint ✅ typecheck ✅ test ✅ build ✅
- **使用**：在手机上访问时，侧边栏自动收起，点击左上角 ☰ 按钮打开侧边栏，点击遮罩或选择内容后关闭

### 第 7 轮 — 消息操作（复制/重新生成） ✅
- **修改**：`app/chat/page.tsx` 添加 `copiedId` 状态、`handleCopy`（clipboard API）、`handleRegenerate`（重发最后一条用户消息并流式接收新回复）
- **修改**：`app/globals.css` 添加 `.message-actions`（hover 显示）、`.msg-action-btn` 样式，支持用户消息和 AI 消息两种配色
- **结果**：lint ✅ typecheck ✅ test ✅ build ✅
- **使用**：鼠标悬停在任何消息上会显示 Copy 按钮（点击复制到剪贴板），最后一条 AI 回复会额外显示 Regenerate 按钮（重新生成回复）

### 第 8 轮 — 深色模式 ✅
- **修改**：`app/globals.css` 重构为 CSS 变量（`:root` 亮色 + `[data-theme="dark"]` 暗色），所有颜色引用替换为 `var(--xxx)`
- **修改**：`app/layout.tsx` 添加 inline script 在页面加载前应用主题，避免 FOUC
- **修改**：`app/chat/page.tsx` 添加 `theme` 状态、`loadTheme`（读 localStorage/prefers-color-scheme）、`toggleTheme` 函数、侧边栏 ☽/☀ 切换按钮
- **结果**：lint ✅ typecheck ✅ test ✅ build ✅
- **使用**：点击侧边栏月亮/太阳图标切换亮暗主题，自动保存到 localStorage，支持系统偏好自动检测

### 第 9 轮 — 角色卡编辑 ✅
- **修改**：`app/api/characters/route.ts` 添加 PUT handler（admin-only，更新已有角色 JSON 文件）
- **修改**：`app/chat/page.tsx` 添加 `editingCharId` 状态、`startEditChar` 函数（获取完整角色数据填充表单）、编辑模式判断、ID 字段禁用（编辑时）、按钮文案适配
- **修改**：`app/globals.css` 添加 `.char-edit-btn`（hover 显示编辑按钮）样式
- **结果**：lint ✅ typecheck ✅ test ✅ build ✅
- **使用**：管理员鼠标悬停在角色上会显示 ✎ 编辑按钮，点击打开预填好的编辑表单，ID 不可修改，修改后点击 "Update Character" 保存

### 第 10 轮 — 角色卡导入导出 ✅
- **修改**：`app/chat/page.tsx` 添加 `handleExportChar`（下载 JSON）、`handleImportChar`（读取文件并 POST 创建）
- **修改**：`app/globals.css` 添加 `.char-admin-actions`、`.import-label`、`.import-input` 样式
- **结果**：lint ✅ typecheck ✅ test ✅ build ✅
- **使用**：管理员鼠标悬停角色显示导出按钮(↕)下载 JSON 文件，侧边栏底部的 "Import Character" 按钮可上传 `.json` 角色卡文件导入角色

