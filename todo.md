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

