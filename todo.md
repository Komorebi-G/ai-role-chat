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

## World Info 管理面板 ✅

- [✅] i18n 翻译键（15 个新键覆盖世界信息管理 UI）
- [✅] Admin 管理模态框（角色列表视图 + 聊天视图两处，仅管理员可见）
- [✅] 条目 CRUD：添加/编辑/删除世界书条目（id、关键词、内容、启用、位置、排序）
- [✅] 通过 PUT /api/worlds 持久化保存
- [✅] worlds/default.json 添加 3 个示例条目（大学校园、AI 实验室、天气季节）
- [✅] npm run build ✅ | npm run lint ✅ | npm run typecheck ✅ | npm run test ✅ (25 passed)

## 待完成 (P1-P2)

- [ ] Swipe 持久化验证：页面刷新后 swipe index 是否正确保留
- [ ] 真实 tokenizer 替换字符估算（lib/chat/context.ts）
- [ ] ben.json 文件名与 id 不一致（文件名为 ben.json 但 id 为 "lbh"）
- [ ] DeepSeek 模型名可配置化（env var 替代硬编码 deepseek-v4-flash）
- [ ] PNG 角色卡支持
- [ ] Prompt 调试面板
