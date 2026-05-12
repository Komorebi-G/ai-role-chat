现在不要添加新功能。

请进入“Vercel 上线验收模式”。

目标：确认当前瘦身后的 MVP 是否真的可以稳定部署到 Vercel。

你需要完成：

1. 检查所有生产环境必需环境变量：

   * JWT_SECRET
   * DEEPSEEK_API_KEY
   * TURSO_DATABASE_URL
   * TURSO_AUTH_TOKEN

2. 检查 Prisma / Turso 配置：

   * schema 是否适合 Turso；
   * migration 是否完整；
   * Vercel build 时是否会生成 Prisma Client；
   * 生产环境是否不会误用 SQLite；
   * 是否存在 Prisma 7 / adapter / datasource 不兼容问题。

3. 创建一个 `DEPLOY_CHECKLIST.md`：
   内容包括：

   * Vercel 必填环境变量；
   * Turso 初始化步骤；
   * 数据库迁移步骤；
   * 部署后手动验收步骤；
   * 常见错误与排查方式。

4. 创建或完善一个生产环境健康检查 API：

   * `/api/health`
   * 返回数据库连接状态；
   * 返回环境变量是否存在，但不要泄露具体值；
   * 返回当前 runtime 信息；
   * 出错时返回明确错误。

5. 执行完整验证：

   * npm run typecheck
   * npm run lint
   * npm run test
   * npm run build

6. 最后输出：

   * 当前是否可以部署；
   * 还缺哪些 Vercel 配置；
   * 生产环境最可能失败在哪里；
   * 部署后应该如何手动测试。

禁止添加新业务功能。
禁止继续扩展聊天系统。
这轮只做上线验收和云端稳定性检查。
