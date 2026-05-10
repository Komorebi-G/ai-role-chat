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
