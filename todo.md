## 国际化（i18n）与中文切换 ✅

- [✅] 创建 `/locales/en.ts` 和 `/locales/zh-CN.ts` —— 128 个翻译键，覆盖所有 UI 文本
- [✅] 创建 `/lib/i18n/index.tsx` —— I18nProvider (React Context) + useTranslation hook + t(key) 函数
- [✅] 语言检测：浏览器语言优先（中文浏览器 → zh-CN），回退 en
- [✅] 语言持久化：localStorage 存储，刷新后不丢失
- [✅] 设置面板添加语言下拉选择器（中文 / English），切换即时刷新 UI
- [✅] 登录页国际化
- [✅] 注册页国际化
- [✅] 聊天页全量国际化（导航、输入框、菜单、抽屉、模态框、角色表单、管理面板、角色信息）
- [✅] 错误信息国际化
- [✅] 角色表单国际化（创建/编辑所有字段标签）
- [✅] 角色信息模态框国际化
- [✅] npm run build ✅ | npm run lint ✅ (0 errors) | npm run typecheck ✅ | npm run test ✅ (25 passed)

实现方式：轻量级自建方案，无第三方 i18n 依赖。I18nProvider 包裹 app/layout.tsx，所有页面通过 useTranslation() hook 获取 t() 翻译函数。

## 提取共享 Modal 组件 ✅

- [✅] 创建 `components/CreateCharModal.tsx` —— 角色创建/编辑表单模态框（移除 page.tsx 中重复的 JSX）
- [✅] 创建 `components/SettingsModal.tsx` —— 设置面板模态框（Temperature、MaxTokens、Persona、Language）
- [✅] 创建 `components/AdminModal.tsx` —— 管理员用户管理模态框
- [✅] 修复 i18n 回归：Chat 视图中的角色编辑表单使用了硬编码英文标签（初始 i18n 改动时遗漏了第二份副本）
- [✅] page.tsx 从 1277 行缩减到 998 行（减少 22%）
- [✅] npm run build ✅ | npm run lint ✅ (0 errors) | npm run typecheck ✅ | npm run test ✅ (25 passed)

## P1 功能规划

- [ ] 真实 Tokenizer：将 `lib/chat/context.ts` 中的字符数估算替换为 tiktoken 或 @anthropic-ai/tokenizer 精确计算
- [ ] Prompt 调试面板：在开发者模式中显示组装后的完整 Prompt 消息数组
- [ ] 高级 World Info：递归深度、sticky 条目、冷却计时器
- [ ] 多角色群聊：同时与多个角色对话

## P2 功能规划

- [ ] PNG 角色卡：将角色信息嵌入 PNG 元数据
- [ ] 插件系统：可扩展的插件架构

## 代码质量

- [ ] 提取 `handleCreateChar` 提交逻辑到独立 helper
- [ ] 提取 settings/theme persistence（loadSettings、saveSettings 等）到 `lib/client-storage.ts`
- [ ] 提取 character 数据获取到自定义 hook（useCharacters、useMessages 等）
