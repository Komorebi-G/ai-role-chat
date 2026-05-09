# TODO — AI Role Chat

## 2026-05-10: 修复多角色文件名与 ID 不匹配的编辑失败 ✅

**发现**: 导入 `ben.json` 后分析多角色支持。大部分功能正常，但发现一个问题：
- `ben.json` 内部 `id` 为 `"lbh_system_architect"`，与文件名不一致
- 后端 PUT 接口直接用 `{characterId}.json` 查找文件，导致编辑这种角色时报 404

**多角色其他方面均正常**:
- 角色列表展示、切换 ✅
- 会话/消息完全隔离（按 characterId + conversationId）✅
- Prompt 构建各角色独立 ✅
- firstMessage 各角色独立 ✅

**修复**:
1. `lib/character.ts` — 新增 `getCharacterFilePath(id)` 函数，扫描目录逐个读取 JSON 匹配 id，替代简单的 `{id}.json` 假设
2. `app/api/characters/route.ts` PUT — 改用 `getCharacterFilePath()` 查找文件

**验证**: curl 测试 PUT alice (文件名匹配) + PUT lbh_system_architect (文件名不匹配) 均成功 ✅

---

## 2026-05-10: 修复发送消息时双气泡显示问题 ✅

- 新增 `thinking` 状态与 `loading` 解耦
- 发送后只显示用户气泡 + "Thinking..." 指示器
- 首个 chunk 到达时：消除 Thinking + 添加 assistant 气泡
- `app/chat/page.tsx`

---

## 已有功能

- JWT 认证，httpOnly cookie，双账户体系
- 角色卡系统：JSON 文件 CRUD，导入/导出，多角色支持
- AI 对话：DeepSeek v4-flash，SSE 流式输出
- 多会话管理：每个角色可创建多个对话
- WeChat 风格 UI：移动端优先，480px 居中，抽屉侧栏
- 深色模式、Markdown 渲染、消息操作（复制/重新生成）
- 管理员面板、设置面板、速率限制
- 自动 Turso 迁移（Vercel 构建时）

## 可扩展方向

- Tokenizer、用户修改密码、角色卡头像、对话搜索/导出、i18n
