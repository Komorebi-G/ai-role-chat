// English translations — source of truth for all UI text keys
// Each key maps to a string or a function (for dynamic values).

const en = {
  // Common
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.delete": "Delete",
  "common.create": "Create",
  "common.edit": "Edit",
  "common.copy": "Copy",
  "common.copied": "Copied!",
  "common.search": "Search",
  "common.loading": "Loading...",
  "common.error": "Error",
  "common.networkError": "Network error",
  "common.back": "Back",
  "common.logout": "Logout",
  "common.export": "Export",
  "common.import": "Import",
  "common.confirm": "Confirm",
  "common.yes": "Yes",
  "common.no": "No",

  // Auth
  "auth.login": "Login",
  "auth.loggingIn": "Logging in...",
  "auth.register": "Register",
  "auth.registering": "Registering...",
  "auth.username": "Username",
  "auth.password": "Password",
  "auth.noAccount": "Don't have an account?",
  "auth.hasAccount": "Already have an account?",
  "auth.loginFailed": "Login failed",
  "auth.registerFailed": "Registration failed",
  "auth.passwordHint": "8-16 characters, must include both letters and numbers",
  "auth.unauthorized": "Unauthorized",

  // Chat — nav & header
  "chat.title": "Chat",
  "chat.more": "More",
  "chat.characterInfo": "Character Info",
  "chat.selectCharacter": "Select a character",
  "chat.messages": "messages",

  // Chat — input
  "chat.inputPlaceholder": "Type a message...",
  "chat.send": "Send",
  "chat.thinking": "Thinking...",

  // Chat — actions
  "chat.newChat": "New Chat",
  "chat.clearChat": "Clear Chat",
  "chat.clearConfirm": "Clear all messages in this chat?",
  "chat.regenerate": "Regenerate",
  "chat.regenerating": "Regenerating...",
  "chat.copyMessage": "Copy message",
  "chat.copiedMessage": "Copied!",
  "chat.searchChat": "Search chat",
  "chat.noResults": "No results",
  "chat.searchPlaceholder": "Search messages...",
  "chat.sendFailed": "Send failed",
  "chat.streamNotSupported": "Streaming not supported",
  "chat.clearFailed": "Clear failed",
  "chat.createChatFailed": "Failed to create new chat",
  "chat.importFailed": "Import failed",
  "chat.noValidMessages": "No valid messages found in file",
  "chat.importSuccess": "imported successfully",

  // Chat — swipe
  "chat.swipeOf": "of",

  // Chat — time labels
  "chat.timeNow": "Just now",
  "chat.timeMinutesAgo": "{n}m ago",
  "chat.timeToday": "Today",
  "chat.timeYesterday": "Yesterday",

  // Chat — empty states
  "chat.emptyTitle": "AI Role Chat",
  "chat.emptyHint": "Select a character to start chatting",
  "chat.emptyConversation": "No conversations yet. Start a new chat!",
  "chat.emptyMessages": "No messages yet. Say hello!",
  "chat.loadingConversations": "Loading conversations...",
  "chat.loadingMessages": "Loading messages...",

  // Chat — conversations
  "conversation.title": "Conversations",
  "conversation.newChat": "New Chat (Default)",
  "conversation.rename": "Rename",
  "conversation.renamePlaceholder": "Enter title...",

  // Group chat
  "group.title": "Group Chat",
  "group.selectCharacters": "Select characters for group chat",
  "group.start": "Start Group Chat",
  "group.addCharacter": "Add to Group",
  "group.removeCharacter": "Remove",
  "group.selectedCount": "{n} character(s) selected",

  // Chat — settings
  "settings.title": "Settings",
  "settings.temperature": "Temperature",
  "settings.maxTokens": "Max Tokens",
  "settings.persona": "Persona",
  "settings.personaHint": "Tell the AI who you are. Leave empty to disable.",
  "settings.language": "Language",
  "settings.theme": "Theme",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.resetDefaults": "Reset to Defaults",

  // Chat — character management
  "char.create": "Create Character",
  "char.edit": "Edit Character",
  "char.createTitle": "Create Character",
  "char.editTitle": "Edit Character",
  "char.id": "ID",
  "char.avatar": "Avatar",
  "char.removeAvatar": "Remove",
  "char.name": "Name",
  "char.description": "Description",
  "char.personality": "Personality",
  "char.scenario": "Scenario",
  "char.firstMes": "First Message",
  "char.mesExample": "Example Dialogue",
  "char.systemPrompt": "System Prompt",
  "char.postHistory": "Post-History Instructions",
  "char.altGreetings": "Alternate Greetings (one per line)",
  "char.creator": "Creator",
  "char.version": "Version",
  "char.creatorNotes": "Creator Notes",
  "char.tags": "Tags (comma-separated)",
  "char.saving": "Saving...",
  "char.createBtn": "Create Character",
  "char.updateBtn": "Update Character",
  "char.idRequired": "ID and Name are required",
  "char.createFailed": "Create failed",
  "char.updateFailed": "Update failed",
  "char.exportFailed": "Export failed",
  "char.importChar": "Import Character",
  "char.exportChar": "Export Character",
  "char.importBtn": "Import",
  "char.importFileHint": "Select a JSON or PNG file",
  "char.importCardFailed": "Failed to import character card",
  "char.cardImported": "Character card imported",

  // Chat — character info modal
  "charInfo.title": "Character Info",
  "charInfo.id": "ID",
  "charInfo.name": "Name",
  "charInfo.description": "Description",
  "charInfo.personality": "Personality",
  "charInfo.scenario": "Scenario",
  "charInfo.firstMes": "First Message",
  "charInfo.mesExample": "Example Dialogue",
  "charInfo.systemPrompt": "System Prompt",
  "charInfo.postHistory": "Post-History Instructions",
  "charInfo.altGreetings": "Alternate Greetings",
  "charInfo.creator": "Creator",
  "charInfo.version": "Version",
  "charInfo.creatorNotes": "Creator Notes",
  "charInfo.tags": "Tags",

  // Admin
  "admin.title": "Admin Panel",
  "admin.users": "Users",
  "admin.userId": "ID",
  "admin.username": "Username",
  "admin.role": "Role",
  "admin.createdAt": "Created",
  "admin.loadFailed": "Failed to load users",
  "admin.deleteFailed": "Delete failed",
  "admin.deleteConfirm": "Delete this user?",

  // World Info
  "world.activeEntries": "Active World Entries",
  "world.manage": "World Info",
  "world.title": "World Books",
  "world.create": "Create World Book",
  "world.edit": "Edit World Book",
  "world.name": "Name",
  "world.description": "Description",
  "world.entries": "Entries",
  "world.entryKey": "Keywords (comma-separated)",
  "world.entryContent": "Content",
  "world.entryPosition": "Position",
  "world.entryPositionBefore": "Before Character",
  "world.entryPositionAfter": "After Character",
  "world.entryOrder": "Order",
  "world.entryEnabled": "Enabled",
  "world.addEntry": "Add Entry",
  "world.editEntry": "Edit Entry",
  "world.noEntries": "No entries yet",
  "world.noBooks": "No world books yet",
  "world.deleteConfirm": "Delete this world book?",
  "world.saveFailed": "Save failed",
  "world.deleteFailed": "Delete failed",
  "world.loadFailed": "Load failed",

  // Prompt debug
  "promptDebug.title": "Prompt Debug",
  "promptDebug.copyFull": "Copy Full Prompt",
  "promptDebug.show": "Prompt Debug",

  // Token budget
  "token.budget": "Context",

  // Error messages (frontend display)
  "error.forbidden": "Forbidden: admin only",
  "error.notFound": "Not found",
  "error.internal": "Internal server error",
  "error.idExists": "Character ID already exists",

  // Language names
  "lang.en": "English",
  "lang.zhCN": "中文",
} as const;

export default en;
