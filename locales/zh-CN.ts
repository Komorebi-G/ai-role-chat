// 简体中文 translations — mirrors en.ts key-for-key

const zhCN = {
  // Common
  "common.save": "保存",
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.delete": "删除",
  "common.create": "创建",
  "common.edit": "编辑",
  "common.copy": "复制",
  "common.copied": "已复制！",
  "common.search": "搜索",
  "common.loading": "加载中...",
  "common.error": "错误",
  "common.networkError": "网络错误",
  "common.back": "返回",
  "common.logout": "退出登录",
  "common.export": "导出",
  "common.import": "导入",
  "common.confirm": "确认",
  "common.yes": "是",
  "common.no": "否",

  // Auth
  "auth.login": "登录",
  "auth.loggingIn": "登录中...",
  "auth.register": "注册",
  "auth.registering": "注册中...",
  "auth.username": "用户名",
  "auth.password": "密码",
  "auth.noAccount": "还没有账户？",
  "auth.hasAccount": "已有账户？",
  "auth.loginFailed": "登录失败",
  "auth.registerFailed": "注册失败",
  "auth.passwordHint": "8-16位字符，必须同时包含字母和数字",
  "auth.unauthorized": "未登录",

  // Chat — nav & header
  "chat.title": "聊天",
  "chat.more": "更多",
  "chat.characterInfo": "角色信息",
  "chat.selectCharacter": "选择一个角色",
  "chat.messages": "条消息",

  // Chat — input
  "chat.inputPlaceholder": "输入消息...",
  "chat.send": "发送",
  "chat.thinking": "思考中...",

  // Chat — actions
  "chat.newChat": "新对话",
  "chat.clearChat": "清除聊天",
  "chat.clearConfirm": "确认清除当前对话的所有消息？",
  "chat.regenerate": "重新生成",
  "chat.regenerating": "重新生成中...",
  "chat.copyMessage": "复制消息",
  "chat.copiedMessage": "已复制！",
  "chat.searchChat": "搜索聊天记录",
  "chat.noResults": "无结果",
  "chat.searchPlaceholder": "搜索消息...",
  "chat.sendFailed": "发送失败",
  "chat.streamNotSupported": "不支持流式传输",
  "chat.clearFailed": "清除失败",
  "chat.createChatFailed": "创建新对话失败",
  "chat.importFailed": "导入失败",
  "chat.noValidMessages": "文件中没有有效消息",
  "chat.importSuccess": "条导入成功",

  // Chat — swipe
  "chat.swipeOf": "/",

  // Chat — empty states
  "chat.emptyTitle": "AI 角色聊天",
  "chat.emptyHint": "选择一个角色开始聊天",
  "chat.emptyConversation": "还没有对话记录，开始新聊天吧！",

  // Chat — conversations
  "conversation.title": "会话列表",
  "conversation.newChat": "新对话（默认）",
  "conversation.rename": "重命名",
  "conversation.renamePlaceholder": "输入标题...",

  // Chat — settings
  "settings.title": "设置",
  "settings.temperature": "随机性",
  "settings.maxTokens": "最大 Token 数",
  "settings.persona": "用户人设",
  "settings.personaHint": "告诉 AI 你是谁。留空则禁用。",
  "settings.language": "语言",
  "settings.theme": "主题",
  "settings.themeLight": "浅色",
  "settings.themeDark": "深色",
  "settings.resetDefaults": "恢复默认设置",

  // Chat — character management
  "char.create": "创建角色",
  "char.edit": "编辑角色",
  "char.createTitle": "创建角色",
  "char.editTitle": "编辑角色",
  "char.id": "ID",
  "char.name": "名称",
  "char.description": "描述",
  "char.personality": "性格",
  "char.scenario": "场景",
  "char.firstMes": "开场白",
  "char.mesExample": "示例对话",
  "char.systemPrompt": "系统提示词",
  "char.postHistory": "对话后指令",
  "char.altGreetings": "替代开场白（每行一个）",
  "char.creator": "创作者",
  "char.version": "版本",
  "char.creatorNotes": "创作者备注",
  "char.tags": "标签（逗号分隔）",
  "char.saving": "保存中...",
  "char.createBtn": "创建角色",
  "char.updateBtn": "更新角色",
  "char.idRequired": "ID 和名称为必填项",
  "char.createFailed": "创建失败",
  "char.updateFailed": "更新失败",
  "char.exportFailed": "导出失败",
  "char.importChar": "导入角色",
  "char.exportChar": "导出角色",
  "char.importBtn": "导入",
  "char.importFileHint": "选择一个 JSON 文件",

  // Chat — character info modal
  "charInfo.title": "角色信息",
  "charInfo.id": "ID",
  "charInfo.name": "名称",
  "charInfo.description": "描述",
  "charInfo.personality": "性格",
  "charInfo.scenario": "场景",
  "charInfo.firstMes": "开场白",
  "charInfo.mesExample": "示例对话",
  "charInfo.systemPrompt": "系统提示词",
  "charInfo.postHistory": "对话后指令",
  "charInfo.altGreetings": "替代开场白",
  "charInfo.creator": "创作者",
  "charInfo.version": "版本",
  "charInfo.creatorNotes": "创作者备注",
  "charInfo.tags": "标签",

  // Admin
  "admin.title": "管理面板",
  "admin.users": "用户管理",
  "admin.userId": "ID",
  "admin.username": "用户名",
  "admin.role": "角色",
  "admin.createdAt": "注册时间",
  "admin.loadFailed": "加载用户失败",
  "admin.deleteFailed": "删除失败",
  "admin.deleteConfirm": "确认删除此用户？",

  // World Info
  "world.title": "世界信息",
  "world.activeEntries": "已激活世界书条目",
  "world.name": "名称",
  "world.description": "描述",
  "world.entries": "条目",
  "world.entryId": "条目 ID",
  "world.entryKeys": "关键词（逗号分隔）",
  "world.entryContent": "内容",
  "world.entryPosition": "位置",
  "world.entryBefore": "角色信息前",
  "world.entryAfter": "角色信息后",
  "world.entryOrder": "排序",
  "world.entryEnabled": "启用",
  "world.addEntry": "添加条目",
  "world.deleteEntry": "删除",
  "world.noEntries": "暂无条目，添加一个以激活世界信息。",
  "world.saveFailed": "保存失败",
  "world.loadFailed": "加载失败",

  // Token budget
  "token.budget": "上下文",

  // Error messages (frontend display)
  "error.forbidden": "无权限：仅限管理员",
  "error.notFound": "未找到",
  "error.internal": "服务器内部错误",
  "error.idExists": "角色 ID 已存在",

  // Language names
  "lang.en": "English",
  "lang.zhCN": "中文",
} as const;

export default zhCN;
