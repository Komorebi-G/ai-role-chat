# SillyTavern 核心功能深度分析

> 分析日期：2026-05-10
> 源码版本：release 分支 (SillyTavern 1.12.x)
> 分析范围：角色卡、聊天体验、上下文构建、提示词组织、世界书/记忆、移动端交互、设置系统、消息管理

---

## 1. SillyTavern 核心体验总结

SillyTavern 是一个"AI 角色扮演聊天前端"——它本身不做推理，而是作为用户与各种 AI 后端之间的中间层。其核心竞争力在于**将角色扮演的每一个环节都做成了可配置、可扩展的模块**。

**设计哲学：**

- **一切皆可配置**：从模型参数到 Prompt 模板、从上下文构建顺序到 CSS 颜色变量，用户几乎可以调整任何东西。这不是为了复杂度，而是因为角色扮演本身就是高度个人化的体验——不同用户、不同角色、不同模型需要完全不同的 Prompt 策略。
- **PNG 即角色卡**：角色数据直接嵌入 PNG 图片的元数据中（tEXt chunk），这使得角色分享极其简单——一张图片就是一个完整的角色。这是 SillyTavern 生态系统能够繁荣的核心设计。
- **Token 预算驱动**：上下文管理不是简单的"超出就裁剪"，而是一套精心设计的预算系统——每个 Prompt 组件（角色描述、世界书、历史消息等）都有自己独立的 Token 配额，超出预算时按优先级降级而非粗暴截断。
- **滑动切换（Swipe）是一等公民**：每条 AI 回复天生支持多个变体（swipe），用户可以在不同版本之间滑动切换。这不是插件功能，而是消息系统的核心数据结构。
- **扩展优先**：核心保持精简，功能通过扩展（前端 JS 插件 + 服务端 Node.js 插件）注入。Prompt 注入点、事件系统、设置持久化都是为扩展设计的。

---

## 2. 角色卡系统

### 2.1 整体架构

角色卡经历了 V1 → V2 → V3 三个版本的演进。当前 SillyTavern 内部使用 V2 格式，同时兼容读取所有版本。

**V1 格式**（扁平结构）：
```
name, description, personality, scenario, first_mes, mes_example
```

**V2 格式**（引入 `data` 命名空间）：
```
spec: "chara_card_v2"
spec_version: "2.0"
data:
  name, description, personality, scenario, first_mes, mes_example
  creator_notes, system_prompt, post_history_instructions
  tags[], alternate_greetings[], creator, character_version
  extensions: { talkativeness, fav, world, depth_prompt, ... }
  character_book (可选嵌入的世界书)
```

**为什么引入 `data` 命名空间？** V1 时代，所有字段平铺在顶层，不同工具（Chub、RisuAI、Pygmalion 等）各自往顶层添加字段，冲突不断。V2 将角色核心数据放在 `data` 下，SillyTavern 自己的扩展字段放在 `data.extensions` 下，第三方工具的字段也可以保留在 `data` 下的独立命名空间中。服务端在格式化时会保留未知字段（`charaFormatData` 从 `tryParse(data.json_data) || {}` 出发，只覆盖已知路径）。

**V3 格式**：结构同 V2，仅 `spec` 和 `spec_version` 不同。写入 PNG 时同时写入 V2 chunk（`chara`）和 V3 chunk（`ccv3`），读取时 V3 优先。这是一种优雅的向后兼容策略。

### 2.2 各字段详解

| 字段 | 存储位置 | 作用 | 设计要点 |
|------|---------|------|---------|
| **name** | `data.name` | 角色名称，也是文件名（sanitized） | 作为角色的唯一标识，文件名 = `{name}.png` |
| **description** | `data.description` | 角色外观、背景等描述 | 作为 system prompt 注入到 `charDescription` 位置，无额外格式化包装 |
| **personality** | `data.personality` | 性格特征文本 | 独立于 description 的注入位置（`charPersonality`），可通过 `personality_format` 模板包装。**为什么分开？** 因为很多模型对 description + personality 放在一起效果差，分开放置让用户可以独立控制两者在 Prompt 中的位置和格式 |
| **scenario** | `data.scenario` | 当前场景/情境描述 | 可通过 `scenario_format` 模板包装。支持 per-chat 覆盖（`chat_metadata.scenario` 优先）——这意味着同一角色在不同对话中可以有不同场景 |
| **first_mes** | `data.first_mes` | 角色的开场白/问候语 | 作为第一条 AI 消息渲染在聊天界面中。设计为纯字符串而非消息对象——在加载聊天时由 `getFirstMessage()` 动态构造为消息 |
| **mes_example** | `data.mes_example` | 示例对话，用 `<START>` 分隔多轮 | 从 Pygmalion 生态继承的格式。`parseMesExamples()` 按 `<START>` 切分后，交替渲染为 user/assistant 消息对。**为什么用 `<START>` 而非 JSON 数组？** 因为示例对话是纯文本，用户可以直接复制粘贴，不需要学习 JSON 格式 |
| **alternate_greetings** | `data.alternate_greetings[]` | 替代开场白列表 | V2 新增。与 `first_mes` 合并成 swipe 数组，让用户可以在不同开场白之间滑动选择 |
| **system_prompt** | `data.system_prompt` | 角色级别的系统提示词覆盖 | 当 `prefer_character_prompt` 开启时，替换全局系统提示词的 `main` Prompt。**为什么需要这个？** 某些角色需要特殊的行为指令（如"始终用诗意的语言回复"），这些应该随角色卡一起分发 |
| **post_history_instructions** | `data.post_history_instructions` | 对话后指令（Jailbreak 覆盖） | 原理同上，覆盖全局的 jailbreak Prompt。**位置关键**：放在 chat history 之后，因为这是"看到对话历史后给出最终指令"的最佳位置 |
| **creator_notes** | `data.creator_notes` | 创作者备注 | 显示在角色卡 UI 上，也可以参与 World Info 的扫描匹配 |
| **tags** | `data.tags[]` | 标签数组 | 用于过滤、排序、文件夹组织。SillyTavern 构建了一个完整的标签系统：支持隐藏标签、标签即文件夹（bogus folder）、标签元数据管理 |
| **extensions** | `data.extensions` | SillyTavern 扩展数据 | 包含 `talkativeness`（群聊中的发言权重）、`fav`（收藏）、`world`（关联的世界书文件名）、`depth_prompt`（深度提示词）等 |

### 2.3 Avatar（头像）

**PNG 即角色卡** 是 SillyTavern 最核心的设计决策之一：

- 角色卡 JSON 编码为 Base64，写入 PNG 文件的 tEXt chunk（V2 用关键字 `chara`，V3 用 `ccv3`）
- 头像图片同时就是角色数据文件——分享一张 PNG 就分享了整个角色
- 服务端用 Jimp 将上传的图片裁剪/缩放为 512×768，然后写入元数据
- 缩略图按需生成为 96×144，缓存在 `thumbnails/avatar/` 目录

**为什么不用数据库？** 对于角色扮演工具，角色卡经常需要在社区中分享。PNG 格式让分享变得无摩擦——Discord、Twitter、任何图片托管服务都可以承载角色卡。这是 SillyTavern 生态繁荣的基础。

### 2.4 导入导出逻辑

SillyTavern 支持 6 种导入格式，全部通过 `formatImportFunctions` 分发：

| 格式 | 来源 | 处理方式 |
|------|------|---------|
| **PNG** | 其他 ST 用户/Chub | 读取 tEXt chunk → 检测 V1/V2/V3 → 转换为内部 V2 → 写入新 PNG |
| **JSON (V2)** | ST 导出 | 直接读取，写入 PNG |
| **JSON (V1/扁平)** | 旧格式 | 字段映射到 V2，写入 PNG |
| **JSON (Pygmalion/Gradio)** | Pygmalion/TavernAI | 特殊映射：`char_name → name`, `char_persona → description`, `char_greeting → first_mes`, `world_scenario → scenario`, `example_dialogue → mes_example` |
| **YAML** | 简单文本格式 | 最精简的映射：`name`, `context → description`, `greeting → first_mes` |
| **CharX (ZIP)** | RisuAI 生态 | 解压 ZIP → 解析 `card.json` → 提取 sprite/背景 → 转换为 V2 |
| **BYAF (ZIP)** | Backyard AI | 解压 ZIP → 解析 `manifest.json` → 映射 persona/narrative → 创建对话文件 |

**设计要点：** 所有格式最终都归一化到 PNG 存储。这意味着导入一次后，后续的操作（读取、编辑、导出）都在统一的数据模型上进行。`unsetPrivateFields()` 在导出时剥离 `fav`、`chat` 等私有字段，保证分享出去的角色卡是干净的。

---

## 3. Prompt 构建流程

这是 SillyTavern 最复杂的子系统。理解它需要先理解两个核心概念：

### 3.1 PromptManager：Prompt 的顺序与配置中心

`PromptManager`（`public/scripts/PromptManager.js`）维护一个 `PromptCollection`——有序的 Prompt 列表，每个 Prompt 定义：
- **角色**（system/user/assistant）
- **内容**（可以是固定文本或占位标记 `marker`）
- **注入位置**（相对顺序位置 或 绝对聊天深度）
- **启用状态**

默认的 Prompt 顺序（可被用户完全重排）：

```
1. main            → 主系统提示词（"Write {{char}}'s next reply..."）
2. worldInfoBefore → 角色描述之前的世界书内容
3. personaDescription → 用户人设描述
4. charDescription → 角色描述
5. charPersonality → 角色性格
6. scenario        → 场景描述
7. enhanceDefinitions → 可选：要求模型丰富角色设定
8. nsfw            → 辅助系统提示词（默认为空）
9. worldInfoAfter  → 角色描述之后的世界书内容
10. dialogueExamples → 示例对话
11. chatHistory    → 实际聊天记录（占位标记）
12. jailbreak      → 对话后指令（post-history）
```

**为什么这个顺序？** 从模型注意力机制的角度看，prompt 中越靠后的内容对生成影响越大。这个默认顺序的意图是：
- 角色定义（description/personality/scenario）放在前面，作为模型的"知识"
- 示例对话紧随其后，作为"风格参考"
- 聊天历史放在后面，提供"当前上下文"
- jailbreak 放在最后，作为"最终指令"强制执行

### 3.2 ChatCompletion 类：Token 预算管理

这是 SillyTavern 上下文管理的核心。`ChatCompletion` 对象维护一个 Token 预算：

```
预算 = context_tokens - max_response_tokens
```

然后按照 Prompt 顺序逐一添加内容，每个组件添加前检查 `canAfford()`：
- **强制性 Prompt**（main, jailbreak, worldInfo 等）：如果不能负担，抛出 `TokenBudgetExceededError`，拒绝生成
- **可选 Prompt**（extension prompts, dialogue examples）：不能负担则跳过
- **chatHistory**：从最新到最旧遍历消息，预算不够时停止添加更旧的消息 → **FIFO 从开头裁剪**

这不是简单的"超出就截断"。而是一个精心设计的分层预算系统——每个 Prompt 类别有独立的计数，UI 中显示剩余 Token 数，带警告阈值（1500 token 黄色，500 token 红色）。

### 3.3 完整的 Prompt 构建流程（Chat Completions 路径）

```
Generate() 触发
  │
  ├─ getCharacterCardFields()     ← 提取角色卡字段
  │   └─ 返回: description, personality, scenario, mesExamples,
  │            system, jailbreak, depthPrompt, creatorNotes, persona
  │
  ├─ getWorldInfoPrompt()         ← 世界书扫描与激活
  │   └─ 返回: worldInfoBefore, worldInfoAfter, worldInfoDepth,
  │            worldInfoExamples, outletEntries
  │
  └─ prepareOpenAIMessages()
      │
      ├─ preparePromptsForChatCompletion()
      │   ├─ 用角色字段构建 system prompt
      │   │   ├─ main ← system_prompt 覆盖（如果 prefer_character_prompt）
      │   │   ├─ charDescription ← description
      │   │   ├─ charPersonality ← personality_format(personality)
      │   │   ├─ scenario ← scenario_format(scenario)
      │   │   └─ jailbreak ← post_history_instructions 覆盖
      │   ├─ 合并扩展 Prompt（summary, AN, vectors, smart context）
      │   └─ 与 PromptManager 的用户定义 Prompt 合并
      │
      └─ populateChatCompletion()
          ├─ 1) 添加各 system prompt（main, WI before, persona, char defs, WI after）
          ├─ 2) populationInjectionPrompts() ← 深度注入（WI depth entries）
          ├─ 3) populateDialogueExamples() ← 如果 pin_examples（在历史前）
          ├─ 4) populateChatHistory() ← 消息从新到旧添加
          ├─ 5) populateDialogueExamples() ← 如果不 pin_examples（在历史后）
          └─ 6) controlPrompts（impersonate/quiet）最后添加
```

### 3.4 示例对话的处理

`mes_example` 中的示例对话按 `<START>` 切分后，被渲染为交替的 user/assistant 消息对。有两个关键配置：

- **`pin_examples`**：如果为 true，示例对话放在聊天历史**之前**——这意味着示例对话优先占用 Token 预算，聊天历史可能被裁剪。适用于示例对话比长聊天历史更重要的场景。
- **不 pin**：示例对话放在聊天历史**之后**——意味着聊天历史优先，示例能塞多少塞多少。

**为什么这样设计？** 示例对话既是"角色风格参考"也是"历史上下文"。不同模型对示例位置敏感——有些模型如果把示例放在远离生成位置的地方就忽略它，有些则把示例放在后面会把后续对话带偏。

### 3.5 上下文裁剪策略

**Chat Completions 路径**（精确 Token 预算）：

1. 先预留强制 Prompt 的 Token
2. 聊天历史从最新消息开始遍历，每条消息检查 Token 预算
3. 预算不够时，更旧的消息被裁剪
4. 每个 Prompt 类别可以单独监控 UI 中的剩余 Token

**Text Completions 路径**（传统方式）：

1. 深度注入内容先占位
2. 剩余消息从旧到新添加，直到达到上下文限制
3. 示例对话最后添加（如果不 pin），剩余空间不够就跳过

**关键区别**：Chat Completions 路径是**预算驱动的降级系统**；Text Completions 路径是**线性的空间填充**。

### 3.6 Token 计数

三层 Token 计数器：

1. **tiktoken**（OpenAI 模型）：客户端和服务端都可用
2. **SentencePiece**（LLaMA, Mistral, Yi, Gemma, Jamba）：加载对应模型的 tokenizer.model
3. **Web Tokenizers**（Claude, LLaMA 3, Command-R, Qwen2, DeepSeek）：使用 `@agnai/web-tokenizers`
4. **Fallback**：`Math.ceil(byteLength / 3.35)` —— 基于字节长度的粗略估算

计数结果缓存在 IndexedDB 中，避免重复计算。

---

## 4. 聊天 UI 体验

### 4.1 整体架构

**UI 框架**：jQuery + jQuery UI（无 React/Vue/Svelte）。所有 DOM 操作都是直接操作（`innerHTML`、clone template、class toggle）。这在 2026 年看起来"过时"，但有几个合理性：
- ST 从 2022 年开始开发，当时 jQuery 是主流
- ST 的 UI 极其自由——每个元素都可以拖拽、缩放、自定义颜色。jQuery UI 的 sortable/draggable/resizable 开箱即用
- 数十个第三方扩展直接操作 DOM，换成 React 会严重限制扩展能力

**消息气泡结构**（模板克隆）：
```
.mes (flex 容器)
  ├─ .mesAvatarWrapper (头像 + 消息编号 + 计时器 + token 计数)
  ├─ .swipe_left (左滑箭头)
  ├─ .mes_block
  │   ├─ .ch_name (角色名 + 时间戳)
  │   ├─ .mes_buttons (悬停显示操作按钮)
  │   ├─ .mes_reasoning (可折叠的思考过程)
  │   ├─ .mes_text (渲染后的消息 HTML)
  │   └─ .mes_media_wrapper / .mes_file_wrapper
  └─ .swipeRightBlock (右滑箭头 + swipe 计数)
```

**视觉区分**：用户消息 vs 角色消息通过 CSS 自定义属性区分（`--SmartThemeUserMesBlurTintColor` vs `--SmartThemeBotMesBlurTintColor`），系统消息降低头像透明度。

### 4.2 输入框设计

- 使用 CSS `field-sizing: content` 自动调整高度（最大 `50dvh`）
- `send_on_enter` 三种模式：禁用（-1）、自动检测单行/多行（0）、始终发送（1, Shift+Enter 换行）
- 进度条通过 CSS `clip-path` 动画显示在输入框顶部边框
- Slash 命令（`/` 开头）在输入框内通过 `processCommands()` 解析，支持 Fuse.js 模糊搜索自动补全

### 4.3 Regenerate / Swipe（滑动切换）

这是 SillyTavern 最具特色的交互设计：

- **数据模型**：每条 AI 消息有 `swipes[]`（文本数组）+ `swipe_info[]`（元数据数组）+ `swipe_id`（当前显示的索引）
- **左右箭头导航**：消息气泡两侧的箭头按钮
- **Overswipe 行为**：在最后一条消息的最后一个 swipe 上继续右滑 → 自动触发生成新回复
- **动画**：消息沿滑动方向滑出屏幕，滑动速度随连续滑动次数逐渐加快（sigmoid 函数）
- **Swipe Picker**：弹出面板显示所有 swipe 的预览、token 数、时间戳，支持跳转/分支/删除
- **Auto-swipe**：如果生成的文本被正则过滤器拦截，自动触发右滑生成新回复

**为什么把 Swipe 做成核心功能而非扩展？** 因为"重新生成"是 AI 角色扮演最高频的操作。把 swipes 数组直接嵌入消息数据结构，意味着无需额外的存储、无需特殊的 UI 流程——它就是消息的一部分。

### 4.4 编辑/复制/删除

- **编辑**：点击铅笔按钮，消息的 `innerHTML` 替换为 `<textarea>`，`field-sizing: content` 自动调整高度。编辑操作与 swipe 状态联动（编辑最后一条 AI 消息的当前 swipe 时，会进入特殊的 `SWIPE_STATE.EDITING` 模式）
- **复制**：直接复制消息文本，代码块有单独的复制按钮
- **删除**：可删除单条 swipe 或整条消息。删除 swipe 后自动跳转到相邻 swipe

### 4.5 Markdown 渲染

- **引擎**：Showdown.js，配置了 emoji、表格、下划线、删除线、简单换行
- **自定义扩展**：下划线处理扩展、排除区域扩展（`showdown-exclusion.js`）
- **预处理**：正则替换 → 智能引号 → LaTeX → DOMPurify 净化
- **后处理**：自动修复 Markdown（`fixMarkdown()`）、标签编码

### 4.6 Streaming（流式传输）

**服务端**：透明代理——`forwardFetchResponse()` 直接将上游 SSE 流通过 `body.pipe(response)` 转发给客户端。不缓冲、不解析。

**客户端**：三段式处理：

1. **SSE 解析**（`EventSourceStream`）：用 `TextDecoderStream` + `TransformStream` 解析 SSE 事件
2. **平滑流式输出**（`SmoothEventSourceStream`）：将 API 响应分解为逐字输出，根据标点符号调整延迟（`.`/`!`/`?` 停顿更长），实现打字机效果
3. **StreamingDisplay 面板**：浮动面板显示实时生成进度，带脉冲动画的 LED 指示器、可折叠的推理/思考内容区域、最小化/停止/关闭按钮

### 4.7 Mobile 布局

**断点**：`@media screen and (max-width: 1000px)`，单一断点覆盖所有移动设备。

**关键设计决策**：
- 抽屉面板变为 `100dvw` 全屏覆盖，不再 pinned
- 所有 hover 交互改为 tap-to-toggle
- `touch-action: none; overflow: hidden; position: fixed;` 防止原生 overscroll
- iOS 适配：`env(safe-area-inset-*)` 处理刘海/Home Indicator
- Avatar 缩放居中，表情图隐藏
- 拖拽抓手隐藏（拖拽在触屏上不实用）

**不是 Mobile-First**：设计上先有桌面版，再通过 CSS media query 适配移动端。移动端的体验更像是"桌面版的缩小+面板重组"，而非独立设计的移动端 UI。

---

## 5. 设置系统

### 5.1 多层配置架构

```
config.yaml (服务端不可变)
  ↓ merge 缺失键
settings.json (用户可变，前端所有设置的单一 blob)
  ↓ 引用
preset 文件 (命名的生成参数快照)
  ↓ 隔离
secrets.json (API 密钥独立存储)
```

**为什么 settings.json 是单一 blob？** 对于前端的数十个模块（kobold、novel、openai、textgen、power_user、extensions 等），每个模块维护自己的设置状态。但在持久化层面，所有设置被打包成一个巨大的 POST 请求发送给服务端。这避免了数十个独立的文件读写——对于需要频繁保存的设置（如对话状态），减少 I/O 很重要。

**为什么 secrets 独立？** API 密钥需要不同的访问控制（mask 显示、不导出、不出现在预设分享中）。

### 5.2 Preset 系统

`PresetManager` 类（`public/scripts/preset-manager.js`）为每种 API 类型提供统一的预设管理接口：

- **OpenAI Settings**：Chat Completions 预设
- **TextGen Settings**：Text Completions 预设（参数最多，50+ 个可配置项）
- **KoboldAI Settings** / **NovelAI Settings**：专用 API 预设
- **Instruct Templates**：指令模板（input/output/system sequence）
- **Context Templates**：上下文模板（Handlebars 格式）
- **System Prompts**：系统提示词模板
- **Reasoning Templates**：推理/思考内容渲染格式

**自动选择**：当切换角色时，如果存在与角色同名的预设，自动选择该预设（`autoSelectPreset()`）——即角色级别的预设绑定。

**主导入/导出**：可以将 instruct template + context template + system prompt + text completion preset + reasoning formatting + "Start Reply With" 打包成一个 JSON 文件导出/导入。

### 5.3 API 配置

**统一 Chat Completions API**（`public/scripts/openai.js`）是架构亮点：

一个 `main_api` 选择器（`openai`），一个 `chat_completion_source` 设置选择提供商。支持 25+ 个提供商（OpenAI、Claude、OpenRouter、Mistral、Google、Groq、xAI、DeepSeek 等），每个提供商有自己的模型列表、反向代理 URL、额外配置。

**为什么设计成统一 API？** OpenAI Chat Completions 格式已经成为行业标准。与其为每个提供商写独立的请求构建逻辑，不如让所有提供商走同一套代码路径，只在最终请求体构造时做提供商特定的字段映射。

### 5.4 设置持久化生命周期

```
加载：POST /api/settings/get
  → 服务端读取 settings.json + 所有 preset 文件
  → 返回 { settings, presets, themes, ... }
  → 前端分发到 loadKoboldSettings(), loadOpenAISettings(), ...
  → 触发事件: SETTINGS_LOADED_BEFORE → SETTINGS_LOADED_AFTER → SETTINGS_LOADED

保存：saveSettings()
  → 组装所有设置对象为一个 payload
  → POST /api/settings/save（可选 Gzip 压缩）
  → 服务端原子写入（write-file-atomic）
  → 10 分钟节流的自动备份
  → 触发事件: SETTINGS_UPDATED
```

**设置快照**：支持手动创建/恢复设置快照（`settings_{handle}_{timestamp}.json`），用于实验新配置后回滚。

---

## 6. 记忆/世界书系统

### 6.1 整体架构

世界书（World Info / Lorebook）系统是 SillyTavern 最复杂的功能之一。它是一个**条件性的 Prompt 注入系统**：根据对话内容（关键词/正则/语义匹配），动态决定是否在 Prompt 中插入特定的上下文信息。

**数据存储**：
- 世界书 = `{name}.json` 文件，存储在用户目录的 `worlds/` 下
- 文件结构：`{ name, entries: { "uid": {...}, "uid": {...} }, extensions: {} }`
- 条目存储为字典（不是数组）——UID 作为 key 方便按 ID 快速查找

**四层聚合**（扫描时按优先级合并）：
1. **全局世界书**（`selected_world_info`，用户手动选择激活）
2. **角色关联世界书**（主世界书 + 辅助世界书列表）
3. **对话世界书**（per-chat，存储在 `chat_metadata.world_info`）
4. **人设世界书**（`power_user.persona_description_lorebook`）

### 6.2 激活/触发方式（按检查顺序）

| 优先级 | 触发方式 | 说明 |
|--------|---------|------|
| 1 | **Decorators** | 条目内容中以 `@@activate` 或 `@@dont_activate` 开头 → 强制激活/抑制 |
| 2 | **外部激活** | 通过 `WORLDINFO_FORCE_ACTIVATE` 事件，扩展可以强行激活指定 UID 的条目 |
| 3 | **Constant** | `constant: true` → 无条件始终激活 |
| 4 | **Sticky** | 之前激活后，sticky 计时器还在有效期内 → 强制激活 |
| 5 | **关键字匹配** | 主关键字匹配扫描缓冲区（最近 N 条消息 + 可选的扫描源） |
| 6 | **辅助关键字逻辑** | AND_ANY / AND_ALL / NOT_ALL / NOT_ANY 四种逻辑组合 |
| 7 | **Inclusion Group 筛选** | 同组只保留一个（group scoring + groupWeight 加权随机） |
| 8 | **概率掷骰** | `probability` 字段（0-100），非 100% 触发时随机判定 |
| 9 | **Vector/Semantic** | 向量扩展：将对话文本转为 embedding，匹配语义相似的条目（替代关键字） |

**关键字支持两种模式**：
- **纯文本**：子字符串匹配或全词匹配
- **正则表达式**：以 `/` 开头和结尾的关键字自动识别为正则

### 6.3 插入位置

| 位置 | 值 | 含义 | 典型用途 |
|------|-----|------|---------|
| beforeChar | 0 | 角色定义之前 | 全局世界观设定 |
| afterChar | 1 | 角色定义之后 | 角色相关的背景知识 |
| ANTop | 2 | Author's Note 之前 | |
| ANBottom | 3 | Author's Note 之后 | |
| atDepth | 4 | 在指定聊天深度注入（需指定 role） | 在特定对话位置注入上下文 |
| EMTop | 5 | Example Messages 之前 | 示例对话的前置说明 |
| EMBottom | 6 | Example Messages 之后 | |
| outlet | 7 | 命名出口（通过 `{{outlet::Name}}` 宏引用） | 需要精确控制位置的高级注入 |

### 6.4 优先级/排序系统

条目按 `order`（默认 100，越高越靠前）排序。附加控制：

- **Character strategy**（角色策略）：`evenly`（混合排序）、`character_first`（角色条目优先）、`global_first`（全局条目优先）
- **最终排序顺序**：chat lore → persona lore → character/global mix（按角色策略）
- **Inclusion Groups**：同 `group` 标签的条目只激活一个，胜出规则：sticky > group scoring > groupOverride + order > weighted random
- **Sticky 条目**优先于非 sticky

### 6.5 Token 预算控制

```
实际预算 = min(
    world_info_budget% × maxContext,    # 百分比预算
    world_info_budget_cap               # 硬上限（0 = 禁用）
)
```

超出预算时，后续条目被跳过（除非 `ignoreBudget: true`）。支持溢出警告 toast。

### 6.6 扫描深度与递归

- **扫描深度**（`world_info_depth`，默认 2，最高 1000）：控制扫描最近几条消息
- **递归扫描**（`world_info_recursive`）：激活条目的内容会被添加到"递归缓冲区"，在新的扫描迭代中检查是否触发更多条目 → 级联激活
- **最大递归步数** vs **最小激活数**：互斥选项——前者限制递归深度，后者在激活条目不够时自动扩大扫描深度
- **延迟到特定递归层级**：`delayUntilRecursion` 控制条目在递归的第几层才开始被检查

### 6.7 计时效果

三个互相配合的计时器：

- **Sticky**：激活后持续 N 条消息保持激活，过期后自动进入 cooldown
- **Cooldown**：停用后 N 条消息内不能重新激活
- **Delay**：对话要有 N 条消息后才允许激活

这些状态持久化在 `chat_metadata.timedWorldInfo` 中，在 chat swipe/删除时有 protected 标志防止误删。

### 6.8 角色卡嵌入世界书

V2 角色卡可以在 `data.character_book` 中嵌入一个完整的世界书。导入角色时，系统检测嵌入的世界书并提示用户导入为独立文件。导出角色时，可以选择将关联的世界书重新嵌入角色卡。

**设计意图**：对于内容创作者来说，角色 + 配套的世界观设定是一个整体。嵌入机制允许创作者将一个完整的体验打包在一张 PNG 中分发。

---

## 7. 消息管理系统

### 7.1 消息数据模型

```javascript
{
  mes: string,              // 消息文本
  name: string,             // 发送者名称
  is_user: boolean,         // 是否为用户消息
  is_system: boolean,       // 是否为隐藏/系统消息
  send_date: string,        // ISO 时间戳
  swipe_id: number,         // 当前显示的 swipe 索引
  swipes: string[],         // 所有 swipe 变体的文本数组
  swipe_info: object[],     // 每个 swipe 的元数据数组
  extra: {                  // 万能扩展槽
    api, model,             //   来源 API/模型
    token_count,            //   缓存的 Token 数
    display_text,           //   翻译覆盖文本
    reasoning,              //   思考/推理内容
    media: [],              //   媒体附件
    files: [],              //   文件附件
    branches: [],           //   分支聊天名称
    bookmark_link,          //   检查点链接
    // ... 任何扩展数据
  }
}
```

**核心设计模式：`extra` 是万能扩展槽**。翻译、媒体、文件、时间戳、模型信息、工具调用——所有不在核心消息结构中的东西都放在 `extra` 中。这意味着核心代码不依赖任何扩展字段，扩展可以自由添加数据而不会冲突。

### 7.2 聊天文件格式

**JSONL（JSON Lines）**：每行一个 JSON 对象。第一行是聊天头（`chat_metadata`），后续行是消息。

为什么是 JSONL？
- **可追加**：不需要重写整个文件
- **可逐行读取**：预览/搜索时可以只读前 N 行
- **可 diff**：Git 友好的格式
- **更健壮**：单行损坏不影响后续行

**存储路径**：
- 单人聊天：`{userDir}/chats/{characterName}/`
- 群组聊天：`{userDir}/group chats/{chatId}.jsonl`

### 7.3 完整性保护

每个聊天的 `chat_metadata.integrity` 包含一个 UUID。保存时比对加载时的 UUID——如果不同（可能被另一个会话覆盖），保存被拒绝。用户可以选择"强制覆盖"确认。

### 7.4 Swipe 机制深入

Swipe 的数据设计巧妙之处：
- `swipes[]` 和 `swipe_info[]` 是**并行数组**（parallel arrays），通过索引关联
- `mes` 字段始终与当前激活的 swipe 内容同步（`syncSwipeToMes()` / `syncMesToSwipe()`）
- 这保证了消息对象始终有一个"当前"的文本表示，而所有历史变体也完整保留

### 7.5 分支/检查点

**没有 DAG 或 Multi-Parent Branching**。SillyTavern 的分支是**线性快照**：

1. `createBranch(mesId)` → 将 `chat[0..mesId]` 深拷贝 → 保存为新聊天文件 → 切换到新聊天
2. `createCheckpoint(mesId)` → 将当前聊天保存为快照文件 → 通过 `message.extra.bookmark_link` 关联
3. 原消息的 `extra.branches` 记录分支聊天名称（仅作信息）

这意味着分支是完全独立的聊天文件——简单、可靠、不需要复杂的图数据结构。

### 7.6 备份

每次保存触发节流备份（默认 10 秒 leading+trailing 节流），备份文件命名 `chat_{name}_{timestamp}.jsonl`。可配置每个聊天的最大备份数和全局最大备份数。

---

## 8. 哪些功能适合迁移到我的项目

### 8.1 强烈建议迁移（高价值 + 相对独立）

1. **PNG 角色卡嵌入**：`character-card-parser.js` 的核心逻辑——将 JSON 写入 PNG tEXt chunk、读取解析。这是 SillyTavern 生态的基础，技术上独立、不耦合业务逻辑。约 200 行核心代码。

2. **世界书的激活系统**：关键字/正则匹配 + 分层聚合（全局/角色/对话/人设）+ 递归扫描。这是 ST 最成熟的"记忆"系统设计。核心逻辑在 `world-info.js` 的前 3000 行，与 UI 耦合不大。

3. **Swipe 消息模型**：`swipes[]` + `swipe_info[]` 并行数组 + `swipe_id` 索引。这是一个简单但强大的数据模型，可以独立于 UI 实现。

4. **PromptManager 的 Prompt 排序概念**：有序的 Prompt 列表 + marker 占位符 + 用户可重排。这个概念可以直接移植，不需要 ST 的具体实现。

5. **Token 预算驱动的上下文管理**：`ChatCompletion` 类的预算理念——不是"超出就截断"，而是"分层预算 + 按优先级降级"。

6. **JSONL 聊天存储**：比 JSON 数组更健壮的存储格式，技术独立。

### 8.2 建议参考思路（高价值但耦合深）

7. **分层设置架构**（config.yaml → settings.json → presets → secrets.json）：理念值得参考，但实现需要根据你的项目架构重写。

8. **扩展系统的注入点设计**：ST 的事件系统（`eventSource`/`event_types`）和 Prompt 注入 API（`getExtensionPrompt`/`setExtensionPrompt`）的**接口设计**值得学习。

9. **平滑 Streaming 显示**：逐字输出 + 标点延迟的打字机效果。`SmoothEventSourceStream` 的核心算法可以独立移植。

10. **角色卡 V2 规范**：字段设计（description/personality 分离、alternate_greetings、embedded lorebook）经过社区验证，可以作为你的角色卡 schema 参考。

### 8.3 不建议迁移（ST 历史包袱）

- **jQuery 驱动的 UI 架构**：这是技术选择，不是设计优势。你应该用现代框架（React/Vue/Svelte）。
- **Handlebars 模板系统**：功能可以保留，但实现可以替换为你选择的模板引擎。
- **Text Completions 路径**：这是 ST 的历史遗留（Kobold/Ooba/NovelAI），新项目只需支持 Chat Completions。

---

## 9. 哪些功能不适合现在做

1. **PNG 元数据嵌入**：虽然技术独立，但涉及 PNG chunk 解析/Jimp 图片处理，有平台兼容性问题（APNG、WebP 等格式），先不做。初期用 JSON 文件存储。

2. **向量/语义世界书匹配**（vectors extension）：需要嵌入模型（embedding） + 向量数据库（向量搜索），基础设施成本高。先用关键字匹配。

3. **多用户系统**（`src/users.js`）：除非你的项目定位是多用户 SaaS，否则单人体验做到极致后再考虑。ST 的多用户系统也是后来加上的，不是设计之初的考量。

4. **服务端插件系统**（`src/plugin-loader.js`）：插件生态需要时间培育。先做好扩展点（事件 + Prompt 注入 API），插件系统是后续的包装。

5. **CharX / BYAF / 多格式导入**：先支持 JSON 导入导出。社区的格式转换是后续的兼容性工作。

6. **翻译扩展**：如果你的目标用户是中文用户，内置翻译不如先做好中文用户体验。

7. **自定义主题/CSS 变量系统**：灰色主题用力做好即可。颜色选择器 + 数十个 CSS 变量的系统是后续的锦上添花。

8. **群聊（Group Chats）**：技术上是单人聊天的扩展，但 UX 复杂度大幅增加。先做好 1v1。

---

## 10. 分阶段路线图

### P0：手机体验（Sprint 1-2）

**目标**：在手机上能用的聊天机器人

- [ ] **响应式聊天界面**
  - 消息气泡（用户/AI 视觉区分）
  - 输入框 + 发送按钮（支持 Enter 发送 + Shift+Enter 换行）
  - 自动滚动到底部
  - Mobile-first 设计（不是桌面版缩小，而是从 375px 宽度出发设计）

- [ ] **基础消息功能**
  - 发送消息 → 接收回复（非流式即可）
  - 重新生成（regenerate）
  - Markdown 渲染（加粗、斜体、代码块、表格）
  - 消息复制

- [ ] **流式传输（SSE）**
  - 服务端透明代理 SSE
  - 客户端逐字渲染
  - 停止生成按钮

- [ ] **最少设置项**
  - 模型选择 + API Key 配置
  - Temperature / max_tokens
  - 浅色/深色主题

**设计原则**：这个阶段的目标是"能用"，不是"好用"。每个功能只要一个正确的工作方式，不要提供选项。

---

### P1：酒馆核心功能（Sprint 3-6）

**目标**：具备角色扮演核心体验——角色管理、记忆、上下文

- [ ] **角色卡系统**
  - 创建/编辑角色（name, description, personality, scenario, first_message, example_dialogue）
  - 角色列表 + 搜索 + 标签过滤
  - 角色头像（上传图片, 本地存储）
  - JSON 导入/导出

- [ ] **聊天增强**
  - Swipe 机制（存储多个回复变体，左右滑动切换）
  - P0 的消息编辑、删除、分支（保存当前状态为新聊天）
  - 聊天管理（新建、重命名、删除、切换）
  - 聊天备份

- [ ] **Prompt 构建**
  - 系统提示词构造（角色 description + personality + scenario 注入）
  - 示例对话注入（`<START>` 分隔格式，支持 pin 选项）
  - 用户人设（persona）
  - Prompt 顺序可配置（至少提供 2-3 个预设模板）

- [ ] **上下文管理**
  - Token 计数
  - 基础 FIFO 裁剪（超出上下文窗口时从最早消息裁剪）
  - 上下文用量可视化（显示已用/总共 Token 比例）

- [ ] **世界书（简化版）**
  - 创建/编辑条目（关键字 + 内容）
  - 单层激活（匹配关键字 → 插入内容）
  - 插入位置选项（角色描述前/后）
  - Token 预算限制

- [ ] **模型支持**
  - OpenAI Chat Completions（兼容所有 OpenAI-format API）
  - Claude API（Anthropic）
  - 至少一个免费/本地模型选项（Ollama 或 OpenRouter 免费模型）

---

### P2：商用品质（Sprint 7-12）

**目标**：体验打磨到可以收费的水平

- [ ] **角色卡高级功能**
  - 角色版本管理
  - 备用开场白（alternate greetings）
  - 角色级别的系统提示词覆盖
  - 角色关联世界书

- [ ] **世界书高级功能**
  - 递归扫描（激活的条目触发更多条目）
  - 计时效果（sticky / cooldown / delay）
  - Inclusion Groups（互斥组）
  - 概率触发
  - 多层级聚合（全局 + 角色 + 对话 + 人设）
  - 向量/语义匹配（需要 embedding 基础设施）

- [ ] **上下文管理升级**
  - Token 预算系统（分层预算 + 各组件独立计数 + 超额警告 + 降级策略）
  - PromptManager 风格的可视化 Prompt 编排器

- [ ] **用户体验打磨**
  - 平滑流式输出（打字机效果 + 标点延迟）
  - Streaming 进度面板
  - 聊天搜索（全文搜索历史消息）
  - 快捷键
  - 离线缓存（Service Worker）

- [ ] **多媒体**
  - 消息中嵌入图片
  - 文件附件（PDF/文本解析）
  - 语音合成（TTS 集成）

- [ ] **多平台**
  - iOS Safari + Android Chrome 完美适配
  - PWA 支持（添加到主屏幕）
  - 安全区域适配（刘海/Home Indicator）

- [ ] **商业化准备**
  - 用户系统（注册、登录、数据隔离）
  - API Key 安全存储（加密）
  - 用量统计
  - 错误监控（Sentry 或类似）

---

### P3：高级玩法（Sprint 13+）

**目标**：社区生态 + 高级功能

- [ ] **PNG 角色卡**
  - PNG 元数据读写（JSON ↔ tEXt chunk）
  - PNG 导入/导出（与其他 ST 生态兼容）
  - 缩略图生成

- [ ] **扩展/插件系统**
  - 前端扩展加载（类似 ST 的 third-party extensions）
  - 事件系统 + Prompt 注入 API
  - 扩展设置持久化
  - 扩展市场/目录

- [ ] **群聊**
  - 多角色群组管理
  - 自动发言人选择（talkativeness 权重）
  - 群组上下文构建

- [ ] **高级 Prompt 功能**
  - Author's Note（浮动提示词，可配置插入深度和频率）
  - 深度提示词注入
  - In-Chat 注入系统（在特定对话位置插入内容）

- [ ] **开发者工具**
  - Prompt 调试面板（查看实际发送给 API 的完整 Prompt）
  - Token 分析（每个 Prompt 组件的 Token 消耗明细）
  - 预设分享/导入/导出

---

## 附录：设计摘要

| 维度 | SillyTavern 的做法 | 为什么这样设计 |
|------|-------------------|---------------|
| **角色存储** | PNG tEXt chunk 嵌入 JSON | 最大化可分享性——一张图片就是整个角色 |
| **Prompt 组织** | 有序的 Prompt 列表 + marker 占位符 | 给用户完全的 Prompt 编排自由，因为不同模型对不同 Prompt 顺序的敏感度差异巨大 |
| **上下文裁剪** | Token 预算驱动，分层降级 | 不是粗暴截断，而是保证核心内容完整 + 提示用户哪些内容被丢弃 |
| **回复变体** | Swipe 数组嵌入消息数据结构 | "重新生成"是最高频操作，应该是一等公民而非扩展 |
| **世界书** | 关键字/正则扫描 + 递归级联 + 分层聚合 | 模拟"人类 GM 根据对话动态引入设定"的过程 |
| **消息存储** | JSONL + integrity UUID | 逐行追加 + 行损坏隔离 + 并发写入检测 |
| **设置架构** | config.yaml → settings.json → presets → secrets 四层 | 不可变/可变/快照/密钥各自有不同的访问模式和安全需求 |
| **移动端** | 单一大断点 1000px，全屏抽屉面板 | 对角色扮演 App，移动端需要全神贯注的聊天视图，抽屉面板比侧边栏更合适 |
