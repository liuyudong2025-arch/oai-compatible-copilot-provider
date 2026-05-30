# Changelog

## 0.3.2 - 2026-05-30

### English

- **Unmapped Claude models follow current upstream**: When Claude Code sends a model name not in the mapping (e.g. Explore agent's `claude-haiku-4-5-20251001`), it automatically uses the last successfully mapped upstream model. This way sub-agents always follow whichever upstream the main model is using — no need to map every Claude model name.

### 中文

- **未映射的 Claude 模型自动跟随当前上游**：Claude Code 发送映射表里没有的模型名（如 Explore agent 的 `claude-haiku-4-5-20251001`）时，自动使用最近一次成功映射的上游模型。子 agent 始终跟随主模型的上游，无需逐个映射所有 Claude 模型名。

## 0.3.1 - 2026-05-30

### English

- **Fixed `anthropicMessagesUrl()` path bug**: URL like `https://api.deepseek.com/anthropic` now correctly appends `/v1/messages` instead of `/messages`, fixing "empty or malformed response" errors from Claude Code.
- **Fixed `writeClaudeCodeConfigFiles()` format**: Now writes `env.ANTHROPIC_BASE_URL` (base URL without path) instead of incorrect `apiConfiguration.customApiUrl`, matching Claude Code's actual settings format.

### 中文

- **修复 `anthropicMessagesUrl()` 路径 bug**：`https://api.deepseek.com/anthropic` 现在正确拼接 `/v1/messages` 而非 `/messages`，修复 Claude Code "empty or malformed response" 错误。
- **修复 `writeClaudeCodeConfigFiles()` 配置格式**：现在写入 `env.ANTHROPIC_BASE_URL`（不含路径的 base URL），而非错误的 `apiConfiguration.customApiUrl`，匹配 Claude Code 实际的配置格式。

## 0.3.0 - 2026-05-30

### English

- **Anthropic API passthrough proxy**: Claude Code can now use non-Claude models (DeepSeek V4 Pro, GLM-5.1, etc.) through the local `/v1/messages` endpoint with transparent model name substitution.
- **New preset models**: DeepSeek V4 Pro (Anthropic API), DeepSeek V4 Flash (Anthropic API), Zhipu GLM-5.1 (Anthropic API) — one-click setup for Claude Code third-party inference.
- **`anthropicPassthrough()`**: SSE passthrough with model name replacement in responses, so Claude Code believes it's talking to real Claude.
- **`sendAnthropicFromOpenAi()`**: OpenAI format → Anthropic format conversion for `/v1/chat/completions` routing to Anthropic providers.
- **`anthropicViaNonAnthropicProvider()`**: Format bridge for routing Anthropic requests to non-Anthropic (OpenAI-compatible) providers.
- **`inferApiMode()`**: Auto-detect `apiMode: 'anthropic'` from URL patterns containing `/anthropic`.
- **New command `writeClaudeCodeConfig`**: Writes Claude Code configuration to `~/.claude/settings.json`.
- **New command `setAnthropicModelMapping`**: Interactive UI to configure model name mapping (e.g. `claude-sonnet-4-20250514` → `deepseek-v4-pro-anthr`).
- **New setting `proxy.anthropicModelMapping`**: Maps Claude model names to upstream model IDs for response substitution.
- **Codex/OpenAI model mapping**: New `proxy.codexModelMapping` setting and `setCodexModelMapping` command let Codex use alias model names (e.g. `o3` → `deepseek-v4-pro`) that route to any configured model.
- **`upstreamModelId` support**: Models can specify `upstreamModelId` to send a different model name to the upstream API (e.g. model id `deepseek-v4-pro-anthr` sends `deepseek-v4-pro` upstream).
- **`findSiblingApiKey()`**: Automatically shares API keys across providers with the same domain (e.g. `deepseek-anthropic` uses key from `deepseek`).
- **`/v1/models` includes mapped models**: Model discovery now returns both Anthropic-mapped and Codex-mapped model aliases so clients can validate them.
- Updated `apiMode` description to document the `anthropic` option.
- Updated `preset()` function to accept optional `apiMode` parameter.

### 中文

- **Anthropic API 透传代理**：Claude Code 现在可通过本地 `/v1/messages` 端点使用非 Claude 模型（DeepSeek V4 Pro、GLM-5.1 等），响应中自动替换模型名。
- **新增预设模型**：DeepSeek V4 Pro（Anthropic API）、DeepSeek V4 Flash（Anthropic API）、Zhipu GLM-5.1（Anthropic API）—— 一键配置 Claude Code 第三方推理。
- **`anthropicPassthrough()`**：SSE 透传并在响应中替换模型名，使 Claude Code 认为在与真正的 Claude 对话。
- **`sendAnthropicFromOpenAi()`**：OpenAI 格式转 Anthropic 格式，用于 `/v1/chat/completions` 到 Anthropic provider 的路由。
- **`anthropicViaNonAnthropicProvider()`**：格式桥接，将 Anthropic 请求路由到非 Anthropic（OpenAI 兼容）provider。
- **`inferApiMode()`**：从 URL 模式自动推断 `apiMode: 'anthropic'`（URL 含 `/anthropic` 时）。
- **新增命令 `writeClaudeCodeConfig`**：将 Claude Code 配置写入 `~/.claude/settings.json`。
- **新增命令 `setAnthropicModelMapping`**：交互式配置模型名映射（如 `claude-sonnet-4-20250514` → `deepseek-v4-pro-anthr`）。
- **新增设置 `proxy.anthropicModelMapping`**：将 Claude 模型名映射到上游模型 ID，用于响应替换。
- **Codex/OpenAI 模型映射**：新增 `proxy.codexModelMapping` 设置和 `setCodexModelMapping` 命令，让 Codex 使用别名模型名（如 `o3` → `deepseek-v4-pro`）路由到任意配置模型。
- **`upstreamModelId` 支持**：模型可指定 `upstreamModelId` 以向上游发送不同的模型名（如模型 id `deepseek-v4-pro-anthr` 上游发 `deepseek-v4-pro`）。
- **`findSiblingApiKey()`**：自动在同域名 provider 间共享 API Key（如 `deepseek-anthropic` 使用 `deepseek` 的 key）。
- **`/v1/models` 包含映射模型**：模型发现现在返回 Anthropic 映射和 Codex 映射的别名模型，客户端可校验。
- 更新 `apiMode` 描述以文档化 `anthropic` 选项。
- 更新 `preset()` 函数支持可选的 `apiMode` 参数。

## 0.2.40 - 2026-05-29

### English

- Updated README.md version badge to match package version.

### 中文

- 更新 README.md 版本徽章与实际包版本同步。

## 0.2.39 - 2026-05-29

### English

- **Tool definitions sorted alphabetically** by name for deterministic JSON serialization, improving DeepSeek prefix cache hit rate across sessions when the same MCP tools are registered.
- **Vision description cache persisted** to `globalState` so the same image gets the identical description text across VS Code restarts, further improving prefix cache consistency.
- **JSON body key ordering optimized**: `tools` placed before `messages` in the request body so stable content precedes variable content.
- Tool definitions and message payload size logging changed from `INFO` to `DEBUG` level to reduce log noise.

### 中文

- **工具定义按名称字母排序**，确保 JSON 序列化结果确定一致，提升 DeepSeek prefix cache 在相同 MCP 工具集下的跨会话命中率。
- **视觉描述缓存持久化**到 `globalState`，同一张图片跨 VS Code 重启返回完全相同的描述文本，进一步提升 prefix cache 一致性。
- **JSON body 键顺序优化**：`tools` 放在 `messages` 前面，稳定内容排在可变内容之前。
- 工具定义和消息载荷大小的日志从 `INFO` 级别改为 `DEBUG` 级别，减少日志噪音。

## 0.2.38 - 2026-05-29

### English

- Added Prompt Cache monitoring: DeepSeek's `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens` (also `prompt_tokens_details.cached_tokens` for OpenAI-compatible) are now extracted, logged, and shown in the status bar tooltip with hit rate percentage.
- Status bar tooltip now shows per-request and session-level cache statistics.

### 中文

- 新增 Prompt Cache 监控：提取 DeepSeek 的 `prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens`（也支持 OpenAI 兼容的 `prompt_tokens_details.cached_tokens`），输出日志并在状态栏 tooltip 展示命中率。
- 状态栏 tooltip 现在展示每次请求和会话级别的缓存统计。

## 0.2.37 - 2026-05-29

### English

- Added image description cache for the vision proxy. Previously, the same image was re-described on every Copilot turn because VS Code sends the full message history (including all prior images) on each request. Now a SHA-256–keyed LRU cache (max 100 entries) stores descriptions after the first call, so repeated images are served from cache.
- This eliminates redundant vision proxy calls and significantly reduces latency and token cost in multi-turn conversations with images.

### 中文

- 为视觉代理增加图片描述缓存。之前每轮 Copilot 对话都会重新描述所有历史图片（因为 VS Code 每轮都会发送完整消息历史），现在使用基于 SHA-256 的 LRU 缓存（上限 100 条），同一张图片只在首次遇到时调用视觉代理。
- 消除了重复的视觉代理请求，大幅降低包含图片的多轮对话的延迟和 token 开销。

## 0.2.36 - 2026-05-28

### English

- Revamped Marketplace Overview README with badges, feature cards, screenshots, quick-start guide, and structured configuration tables.
- Added `homepage`, `repository`, and `bugs` fields to `package.json` linking to GitHub.
- Added 4 screenshots (model picker, config panel, status bar, balance check).

### 中文

- 全面重写 Marketplace Overview README：徽章、特性卡片、截图、快速上手指南、结构化配置表格。
- `package.json` 新增 `homepage`、`repository`、`bugs` 字段，指向 GitHub 仓库。
- 新增 4 张截图（模型选择器、配置面板、状态栏、余额查询）。

## 0.2.35 - 2026-05-28

### English

- Auto balance refresh now prioritizes the provider used by the most recent model request.
- Usage stats remember the provider id for the last request, so GLM requests refresh GLM quota instead of being overwritten by DeepSeek balance.
- The status bar balance label now includes a short provider prefix such as `GLM:` or `DS:`.

### 中文

- 自动余额刷新现在优先刷新最近一次模型请求对应的 provider。
- 用量统计会记录最近请求的 provider id，因此 GLM 请求后会优先刷新 GLM 配额，不会马上被 DeepSeek 余额覆盖。
- 状态栏余额增加短 provider 前缀，例如 `GLM:` 或 `DS:`，避免看不出是哪家的值。

## 0.2.34 - 2026-05-28

### English

- Updated the Zhipu GLM quota parser for the actual `data.limits[]` response shape.
- The primary GLM display now prefers `TOKENS_LIMIT`, shows remaining percentage when exact remaining tokens are not returned, and includes reset time.
- The balance detail view lists every returned GLM limit entry, including `TOKENS_LIMIT` and `TIME_LIMIT`.

### 中文

- 按智谱 GLM 实际返回的 `data.limits[]` 结构更新配额解析。
- 主显示优先使用 `TOKENS_LIMIT`；接口没有返回精确剩余 tokens 时，显示剩余百分比，并展示重置时间。
- 余额详情里会列出所有 GLM limit 项，包括 `TOKENS_LIMIT` 和 `TIME_LIMIT`。

## 0.2.33 - 2026-05-28

### English

- Added Zhipu GLM / BigModel balance and quota checking.
- Providers whose id, name, or base URL contains `zhipu`, `glm`, or `bigmodel` are now recognized by **Check Balance** and auto-refresh.
- GLM quota requests use the root-relative endpoint `/api/monitor/usage/quota/limit`, so a chat base URL such as `https://open.bigmodel.cn/api/paas/v4` works correctly.
- The balance result displays remaining tokens, used tokens, quota limit, used percentage, and reset time when the API returns those fields.

### 中文

- 增加智谱 GLM / BigModel 的余额和配额查询支持。
- provider 的 id、name 或 base URL 包含 `zhipu`、`glm`、`bigmodel` 时，`Check Balance` 和自动刷新都会识别。
- GLM 配额查询会使用根路径接口 `/api/monitor/usage/quota/limit`，所以聊天 base URL 配成 `https://open.bigmodel.cn/api/paas/v4` 也能正确查询。
- 查询结果会尽量显示剩余 tokens、已用 tokens、额度上限、使用百分比和重置时间。

## 0.2.32 - 2026-05-27

### English

- Reduced routine log noise: provider model mapping, request start/finish, tool call reporting, and empty streaming retry logs are now `debug` level instead of `info`.
- Set `matrixOaiCopilot.logLevel` to `debug` to restore the detailed per-request logs.

### 中文

- 降低常规日志噪音：provider 模型映射、请求开始/结束、工具调用上报、空流重试等日志从 `info` 降为 `debug` 级别。
- 如需查看详细请求日志，将 `matrixOaiCopilot.logLevel` 设为 `debug`。

## 0.2.31 - 2026-05-27

### English

- Reduced routine log noise after the Ollama native debugging pass.
- `Ollama tool mode` now logs only the mode and tool count at info level; the full tool-name list is debug-only.
- Successful `Ollama response: 200`, auto balance refreshes, and converted tool-result previews are debug-only.
- Error responses and high-level provider request start/finish logs remain visible at info level.

### 中文

- 在 Ollama native 链路调通后降低常规日志噪音。
- `Ollama tool mode` 在 info 级别只输出模式和工具数量，完整工具名列表改为 debug 级别。
- 成功的 `Ollama response: 200`、自动余额刷新、tool-result preview 都改为 debug 级别。
- 错误响应以及 provider 请求开始/结束日志仍保留在 info 级别。

## 0.2.30 - 2026-05-27

### English

- Fixed Matrix OAI vision proxy requests for Ollama thinking models.
- Configured-image proxy requests now send `think: false` to Ollama native `/api/chat`, preventing Qwen from spending the whole small vision budget on `message.thinking` and returning empty `message.content`.
- Increased the default vision proxy output budget to 1200 tokens.
- Captures Ollama native `message.thinking` as reasoning text for non-streaming and streaming responses.

### 中文

- 修复 Ollama thinking 模型作为 Matrix OAI 视觉代理时容易返回空图片描述的问题。
- 配置模型做图片代理时，现在会向 Ollama native `/api/chat` 发送 `think: false`，避免 Qwen 把较小的视觉代理预算全部花在 `message.thinking` 里，导致 `message.content` 为空。
- 将默认视觉代理输出预算提高到 1200 tokens。
- 非流式和流式响应都会把 Ollama native 的 `message.thinking` 记录为 reasoning 文本。

## 0.2.29 - 2026-05-27

### English

- Strengthened the Ollama native-mode hint for directory listings.
- Tells Qwen to preserve every returned directory/file entry exactly, including hidden entries, Chinese names, and other non-ASCII paths.
- This addresses cases where `list_dir` returned `规划/` correctly but the model omitted it while summarizing the tool result.

### 中文

- 加强 Ollama native 模式下目录列表结果的提示。
- 明确要求 Qwen 原样保留工具返回的每一项，包括隐藏目录、中文名称和其他非 ASCII 路径。
- 修复 `list_dir` 已正确返回 `规划/`，但模型总结时漏掉中文目录的问题。

## 0.2.28 - 2026-05-27

### English

- Kept Ollama on the native `/api/chat` path and improved VS Code tool argument coercion.
- Resolves relative `path` / `filePath` arguments against the current workspace root before reporting tool calls back to VS Code.
- Adds a default `startLine: 1` for tools such as `read_file` when the exposed schema requires line-based reads.
- Preserves the original tool name for tool-result messages by remembering the previous `callId -> toolName` mapping.

### 中文

- 保持 Ollama 继续走 native `/api/chat`，只加强 VS Code 工具参数规整。
- 将相对 `path` / `filePath` 参数按当前 workspace 根目录转成绝对路径后再回报给 VS Code。
- 对 `read_file` 这类需要行号的工具，缺少 `startLine` 时默认补 `startLine: 1`。
- 通过记录上一轮 `callId -> toolName`，让 tool-result 消息保留真实工具名，不再轻易变成 `unknown`。

## 0.2.27 - 2026-05-27

### English

- Added the extension version to activation and provider-refresh logs so it is clear which installed build VS Code is running.
- Keeps the 0.2.26 Ollama/Qwen fix: native-mode tool-name guidance plus `file({"path": ...})` fallback normalization.

### 中文

- 在激活和刷新 Provider 的日志中输出扩展版本号，方便确认 VS Code 当前实际运行的是哪一个安装包。
- 继续包含 0.2.26 的 Ollama/Qwen 修复：native 模式工具名提示，以及 `file({"path": ...})` 的兜底归一化。

## 0.2.26 - 2026-05-27

### English

- Added an Ollama native-mode system hint that tells Qwen to use only the exact VS Code tool names supplied in the `tools` field.
- Normalized Qwen's generic `file({"path": ...})` tool call: directory paths now map to `list_dir`, while file-looking paths map to `read_file`.
- This prevents `Dropping unavailable tool call: file(...)` from causing an empty Copilot response when Qwen invents a generic file tool.

### 中文

- 在 Ollama native 模式下增加一条简短 system 提示，明确要求 Qwen 只能调用 `tools` 字段里真实存在的 VS Code 工具名。
- 归一化 Qwen 生成的泛化 `file({"path": ...})` 工具调用：目录路径映射到 `list_dir`，看起来像文件的路径映射到 `read_file`。
- 避免 `Dropping unavailable tool call: file(...)` 导致 Copilot 返回空响应。

## 0.2.25 - 2026-05-27

### English

- Fixed the provider start log for Ollama models so it shows the real native endpoint (`/api/chat`) instead of the OpenAI-compatible `/chat/completions` helper URL.
- Matched the reference provider's tool-result extraction more closely: non-text structured tool result parts are now JSON-stringified instead of being dropped.
- Added a compact tool-result conversion log with call id, tool name, character count, and preview.
- Preserved `toolName` / `name` on converted tool-result messages when VS Code provides it.

### 中文

- 修正 Ollama 模型的请求开始日志，现在显示真实 native endpoint（`/api/chat`），不再显示误导性的 OpenAI `/chat/completions` 辅助 URL。
- 对齐参考插件的 tool result 提取逻辑：非文本结构化工具结果现在会 `JSON.stringify` 后传给模型，不再被丢弃。
- 新增简短 tool result 转换日志，包含 call id、工具名、字符数和预览。
- VS Code 如果提供了 `toolName` / `name`，转换 tool-result 消息时会保留下来。

## 0.2.24 - 2026-05-27

### English

- Converts plain-text tool invocations from Qwen/Ollama into VS Code tool calls.
- Handles bare tool-name outputs such as `list_files`, plus simple invocation text such as `read_file "path"` and `read_file(path="path")`.
- These parsed calls still pass through the current-request alias normalizer, so `list_files` becomes the real `list_dir` tool when that is what VS Code exposed.

### 中文

- 将 Qwen/Ollama 输出的纯文本工具调用转换成 VS Code tool call。
- 支持 `list_files` 这类单独工具名，以及 `read_file "path"`、`read_file(path="path")` 这类简单调用文本。
- 解析出的调用仍会走当前请求工具别名归一化，所以 `list_files` 会继续映射到 VS Code 实际暴露的 `list_dir`。

## 0.2.23 - 2026-05-27

### English

- Normalize model-emitted tool aliases against the actual VS Code tools available in the current request.
- Maps common Qwen/Copilot aliases such as `list_files`, `list_directory`, and `file(action=list)` to the real `list_dir` tool when that is the tool exposed by VS Code.
- Drops unknown unavailable tool calls instead of reporting invalid tool names back to VS Code.
- Adds logs for alias normalization, for example `Normalized tool call: list_files -> list_dir`.

### 中文

- 按当前请求里 VS Code 实际提供的工具列表归一化模型输出的工具别名。
- 将 Qwen/Copilot 常见别名 `list_files`、`list_directory`、`file(action=list)` 映射到真实存在的 `list_dir` 工具。
- 未知且当前不存在的工具调用不再回报给 VS Code，避免继续触发“工具不存在”。
- 新增别名归一化日志，例如 `Normalized tool call: list_files -> list_dir`。

## 0.2.22 - 2026-05-27

### English

- Matched the installed `OAI Compatible Provider for Copilot` Ollama flow more closely: Ollama tool requests now keep streaming enabled by default.
- Fixed Ollama streaming tool-call handling by collecting `message.tool_calls` from every NDJSON chunk, not only the final `done` chunk.
- Stopped simplifying Ollama tool schemas by default; VS Code tool schemas are forwarded in the same OpenAI-style function shape used by the reference provider.
- Added info logs for forwarded Ollama tool names and for each `LanguageModelToolCallPart` reported back to VS Code.

### 中文

- 按本机已安装的 `OAI Compatible Provider for Copilot` 实现对齐 Ollama 流程：Ollama 工具请求默认保持 streaming。
- 修复 Ollama streaming 工具调用收集逻辑：现在每个 NDJSON chunk 里的 `message.tool_calls` 都会收集，不再只看最终 `done` chunk。
- 默认不再简化 Ollama tool schema；按参考插件一样，把 VS Code 工具 schema 以 OpenAI function tools 形态直接转发。
- 新增 info 日志，记录转发给 Ollama 的工具名，以及每次回报给 VS Code 的 `LanguageModelToolCallPart`。

## 0.2.21 - 2026-05-27

### English

- Restored Ollama/Qwen tool calls to Ollama's official native `/api/chat` `tools` path by default.
- Changed the default Ollama provider URL to `http://localhost:11434`; `/v1` is still tolerated and stripped internally for native Ollama requests.
- Kept `prompt` tool mode only as an explicit manual fallback through `matrixOaiCopilot.ollamaToolMode`.
- Added `vision` as a compatibility alias for `supportsImages` in model configuration.

### 中文

- Ollama/Qwen 工具调用默认改回 Ollama 官方 native `/api/chat` + `tools` 路径。
- 默认 Ollama provider 地址改成 `http://localhost:11434`；如果用户配置了 `/v1`，native Ollama 请求里仍会自动剥掉。
- `prompt` 工具模式只保留为 `matrixOaiCopilot.ollamaToolMode` 的手动兜底选项。
- 模型配置新增兼容字段 `vision`，等价于 `supportsImages`。

## 0.2.20 - 2026-05-27

### English

- Reworked Ollama/Qwen tool calling against Qwen's tool-call format and Ollama's `/api/chat` message rules.
- Qwen-family Ollama models now default to prompt-mode tools instead of Ollama native parser tools, avoiding `Value looks like object, but can't find closing '}' symbol` renderer/parser failures.
- Converted Copilot/OpenAI tool history into Qwen/Ollama-compatible history: assistant tool calls are replayed as JSON tool-call objects, and tool results are replayed as named text blocks in prompt mode.
- Improved fallback parsing for `<tool_call>{...}</tool_call>`, fenced JSON, balanced JSON objects, and command-only outputs such as `ls`/`dir`.
- Added `matrixOaiCopilot.ollamaToolMode` (`auto`, `prompt`, `native`) plus a per-model override for troubleshooting.

### 中文

- 按 Qwen 工具调用格式和 Ollama `/api/chat` 消息规则重做 Ollama/Qwen 工具调用链路。
- Qwen 系列 Ollama 模型默认走 prompt-mode 工具调用，不再默认依赖 Ollama 原生 parser，避免 `Value looks like object, but can't find closing '}' symbol` 这类解析失败。
- Copilot/OpenAI 的工具历史现在会转换成 Qwen/Ollama 能理解的历史：assistant 工具调用回放为 JSON 工具调用对象，工具结果回放为带名字的文本块。
- 增强 `<tool_call>{...}</tool_call>`、代码块 JSON、平衡 JSON 对象，以及只输出 `ls`/`dir` 这类命令时的兜底解析。
- 新增 `matrixOaiCopilot.ollamaToolMode`（`auto`、`prompt`、`native`）和单模型覆盖项，方便排查。

## 0.2.19 - 2026-05-27

### English

- Hardened Ollama native tool calls for Qwen renderer compatibility: tool descriptions and enum strings now strip `{}` characters, nested parameter objects are flattened to strings, and assistant history tool-call arguments are converted back to objects.
- Writes a sanitized `ollama-last-failed-request.json` dump on Ollama 4xx/5xx responses so request-shape issues can be diagnosed from the exact payload.

### 中文

- 加固 Ollama 原生工具调用对 Qwen renderer 的兼容：工具描述和 enum 字符串会移除 `{}`，嵌套参数对象会降级成字符串，历史 assistant tool-call 的 arguments 会转回对象。
- Ollama 返回 4xx/5xx 时会写出脱敏后的 `ollama-last-failed-request.json`，方便直接查看实际请求体定位问题。

## 0.2.18 - 2026-05-26

### English

- Simplified Copilot tool JSON schemas before sending them to Ollama native `/api/chat`.
- This avoids Qwen/Ollama template failures when Copilot supplies complex schemas with nested objects, unions, defaults, or unsupported metadata.

### 中文

- 在发送到 Ollama 原生 `/api/chat` 前，先简化 Copilot 工具的 JSON Schema。
- 避免 Copilot 提供复杂 schema（嵌套对象、union、默认值、额外元数据等）时触发 Qwen/Ollama 模板解析失败。

## 0.2.17 - 2026-05-26

### English

- Fixed Ollama native `/api/chat` requests for image-capable models by converting OpenAI-style multimodal content arrays into Ollama's `{ content: string, images: [...] }` message format.
- This avoids Ollama template errors such as `Value looks like object, but can't find closing '}' symbol` when Copilot sends image parts.

### 中文

- 修复 Ollama 原生 `/api/chat` 的多模态请求格式：把 OpenAI 风格的 content 数组转换成 Ollama 需要的 `{ content: string, images: [...] }` 消息格式。
- 避免 Copilot 传入图片片段时触发 Ollama 模板错误，例如 `Value looks like object, but can't find closing '}' symbol`。

## 0.2.16 - 2026-05-26

### English

- Added Ollama native API (`/api/chat`) support. Models with `apiMode: "ollama"` now route requests through Ollama's native API instead of the OpenAI-compatible endpoint, enabling tool/function calling for Ollama models (e.g. Qwen3.5 9B).

### 中文

- 新增 Ollama 原生 API（`/api/chat`）支持。配置了 `apiMode: "ollama"` 的模型现在会走 Ollama 原生接口而不是 OpenAI 兼容接口，使 Ollama 模型（如 Qwen3.5 9B）的工具调用正常可用。

## 0.2.15 - 2026-05-26

### English

- Kept provider-declared image-capable models selectable for the vision proxy; image requests now rely on the short proxy timeout instead of hard-coded model exclusions.
- Added `matrixOaiCopilot.copilot.visionProxyTimeoutSeconds` so image-description requests fail quickly instead of making Copilot appear stuck.
- Vision proxy failures now return a clear text fallback to the main text model and write an error to the Matrix OAI Gateway output channel.
- Added request model-mapping logs to show the Copilot model id and the Matrix OAI model selected for each provider request.

### 中文

- 保留 provider 声明支持图片的模型作为视觉代理候选；图片请求现在靠独立短超时防卡死，不再硬编码排除具体模型。
- 新增 `matrixOaiCopilot.copilot.visionProxyTimeoutSeconds`，图片描述请求会单独短超时，避免 Copilot 看起来一直卡死。
- 视觉代理失败时会把明确的失败说明作为文本回退给主模型，并在 Matrix OAI Gateway 输出里记录错误。
- 新增请求模型映射日志，每次 provider 调用都会显示 Copilot 传入的模型 id 和最终匹配到的 Matrix OAI 模型。

## 0.2.14 - 2026-05-26

### English

- Centralized image-capability detection for Matrix OAI and VS Code models.
- Vision support now recognizes `supportsImages`, `supportsImageInput`, `supportsVision`, `capabilities.imageInput`, `supports_image_detail_original`, and `input_modalities` / `inputModalities` / `modalities` containing `image`.

### 中文

- 统一 Matrix OAI 和 VS Code 模型的视觉能力判断逻辑。
- 视觉支持现在会识别 `supportsImages`、`supportsImageInput`、`supportsVision`、`capabilities.imageInput`、`supports_image_detail_original`，以及包含 `image` 的 `input_modalities` / `inputModalities` / `modalities`。

## 0.2.13 - 2026-05-26

### English

- Vision proxy selection now includes Matrix OAI configured provider models with `supportsImages: true`.
- `Auto` vision proxy now prefers Matrix OAI image-capable models before falling back to VS Code/Copilot image-capable models.
- Vision proxy setting values can use `matrix:<model-id>` for Matrix OAI provider models or `vscode:<model-id>` for VS Code language models.

### 中文

- 视觉代理候选现在会包含 Matrix OAI 配置里标记了 `supportsImages: true` 的 provider 模型。
- `Auto` 视觉代理会优先使用 Matrix OAI 自己配置的视觉模型，找不到再退到 VS Code/Copilot 的视觉模型。
- 视觉代理配置值支持 `matrix:<模型ID>` 指向 Matrix OAI provider 模型，也支持 `vscode:<模型ID>` 指向 VS Code 语言模型。

## 0.2.12 - 2026-05-26

### English

- Added Copilot model-picker configuration schema for Matrix OAI thinking effort, so supported models can expose None / High / Max from the model row settings.
- Added `Matrix OAI Gateway: Set Vision Proxy Model` and a configuration-panel button for selecting the VS Code model used to describe image inputs for text-only Matrix OAI models.
- The configuration panel now shows the current Copilot thinking mode and vision proxy model.

### 中文

- 按 GitHub Copilot 模型选择器的方式补上模型行配置：支持的 Matrix OAI 模型可以在模型设置里选择 None / High / Max 思考深度。
- 新增 `Matrix OAI Gateway: Set Vision Proxy Model` 命令和配置页按钮，用来选择纯文本 Matrix OAI 模型处理截图时使用的视觉代理模型。
- 配置页现在会显示当前 Copilot 思考模式和视觉代理模型。

## 0.2.11 - 2026-05-26

### English

- Added `Matrix OAI Gateway: Write Codex Config` to generate Codex CLI configuration for the local Matrix OAI Responses proxy.
- Writes `~/.codex/config.toml` with `model_provider = "matrix-oai"` and `wire_api = "responses"`, preserving unrelated settings and backing up the old config first.
- Writes or merges `~/.codex/models_catalog.json` entries for configured Matrix OAI models so Codex can list DeepSeek and other routed models.
- Added Copilot-facing thinking-effort selection and a vision proxy path that describes image inputs before sending them to text-only routed models.

### 中文

- 新增 `Matrix OAI Gateway: Write Codex Config` 命令，可以自动生成 Codex CLI 使用 Matrix OAI 本地 Responses 代理所需的配置。
- 写入 `~/.codex/config.toml` 时会设置 `model_provider = "matrix-oai"` 和 `wire_api = "responses"`，保留其他无关配置，并先备份旧配置。
- 写入或合并 `~/.codex/models_catalog.json`，让 Codex 能列出通过 Matrix OAI 路由的 DeepSeek 和其他模型。
- 补齐 GitHub Copilot 接入体验：新增 Copilot 思考深度选择，并为纯文本模型增加图片转文字代理。

## 0.2.10 - 2026-05-26

### English

- Hardened tool-result and Responses API content conversion so only explicit text fields are forwarded to upstream models.
- Removed the remaining `JSON.stringify` fallback paths that could leak VS Code internal metadata such as `cache_control` data parts into prompts.

### 中文

- 加固工具结果和 Responses API 内容转换逻辑：只把明确的文本字段转发给上游模型。
- 移除剩余可能把 VS Code 内部 `cache_control` 等元数据 stringify 进 prompt 的兜底路径。

## 0.2.9 - 2026-05-26

### English

- Retry provider requests once without streaming when the upstream stream completes with no text and no tool calls.
- Report a clear empty-assistant-response error instead of letting VS Code show only "Sorry, no response was returned."
- Log provider response shape at info level (`text`, `tool_calls`, `reasoning`) to make intermittent empty responses easier to diagnose.

### 中文

- 当上游流式响应结束后没有正文也没有工具调用时，自动改用非流式请求重试一次。
- 如果重试后仍为空，抛出明确的空 assistant 响应错误，避免 VS Code 只显示 “Sorry, no response was returned.”
- 在 info 日志记录响应形态（`text`、`tool_calls`、`reasoning`），方便排查偶发空响应。

## 0.2.8 - 2026-05-26

### English

- Fixed additional content-to-text conversion paths that could leak non-text data into conversation context.
- `openAiContentToText`: filter `reasoning_content`/`reasoning` types and return empty string for unknown content types instead of `JSON.stringify`-ing them.
- `anthropicContentToText`: filter `tool_use`/`tool_result` types and return empty string for unknown content types instead of `JSON.stringify`-ing them.
- `responsesToChatCompletions`: tool_result sub-items without `.text` no longer fall back to `JSON.stringify`.

### 中文

- 修复额外三处 content-to-text 转换路径中非文本数据泄漏到对话上下文的问题。
- `openAiContentToText`：过滤 `reasoning_content`/`reasoning` 类型，对未知内容类型返回空字符串而非 `JSON.stringify`。
- `anthropicContentToText`：过滤 `tool_use`/`tool_result` 类型，对未知内容类型返回空字符串而非 `JSON.stringify`。
- `responsesToChatCompletions`：tool_result 的子项若无 `.text` 不再回退到 `JSON.stringify`。

## 0.2.7 - 2026-05-25

### English

- Fixed tool-result conversion leaking VS Code internal non-text data parts into upstream prompts.
- Filtered `cache_control` and other non-image data parts before serializing tool results, preventing payloads such as `{"$mid":24,"mimeType":"cache_control","data":"ZXBoZW1lcmFs"}` from being sent to DeepSeek as visible text.
- This avoids false "dirty data" diagnoses when files only contain normal UTF-8 text, including Chinese comments or descriptions.

### 中文

- 修复工具结果转换时把 VS Code 内部非文本 DataPart 泄漏进上游 prompt 的问题。
- 在序列化工具结果前过滤 `cache_control` 和其他非图片 DataPart，避免 `{"$mid":24,"mimeType":"cache_control","data":"ZXBoZW1lcmFs"}` 这类内部元数据被当作正文发给 DeepSeek。
- 避免模型把正常 UTF-8 文件，特别是带中文注释或描述的文件，误判成有“脏数据”。

## 0.2.5 - 2026-05-23

### English

- **OpenAI Responses API proxy**: Added `/v1/responses` endpoint to the local proxy. Translates OpenAI Responses protocol (`response.created`, `response.output_text.delta`, `response.completed` events) to standard Chat Completions (`/v1/chat/completions`) and back. This enables OpenAI Codex CLI (Responses API) to work with any OAI-compatible provider configured in Matrix OAI Gateway.
- Both streaming (real-time SSE event translation) and non-streaming modes supported.
- Tool call responses are translated between the two protocols automatically.

### 中文

- **OpenAI Responses API 代理**：本地代理新增 `/v1/responses` 接口，自动将 OpenAI Responses 协议翻译成标准 Chat Completions，并将结果翻译回 Responses 格式。这使得使用 Responses API 的 OpenAI Codex CLI 可以直接使用 Matrix OAI Gateway 中配置的任何 OAI 兼容模型。
- 支持流式（SSE 事件实时翻译）和非流式两种模式。
- 工具调用响应在两个协议之间自动翻译。

## 0.2.1 - 0.2.4 - 2026-05-22

### English

- **0.2.4**: Auto-refresh balance on startup (30s delay) and every 5 minutes (configurable via `matrixOaiCopilot.balanceRefreshMinutes`). Status bar shows balance after first successful query.
- **0.2.3**: Balance now displayed in the VS Code status bar after querying.
- **0.2.2**: Balance check reuses stored API keys (provider-scoped first, then global). No more repetitive key entry.
- **0.2.1**: Fixed `SyntaxError: Unexpected token '}'` caused by missing `function showConfigPanel()` header. Restored status bar and output log functionality.

### 中文

- **0.2.4**: 启动 30 秒后自动查询余额，之后每 5 分钟自动刷新（可在设置 `matrixOaiCopilot.balanceRefreshMinutes` 调整）。查到的余额直接显示在状态栏。
- **0.2.3**: 查询余额后，结果直接显示在 VS Code 右下角状态栏上。
- **0.2.2**: 余额查询自动使用已保存的 API Key（先查 provider 专属 key，再查全局 key），不再反复要求输入。
- **0.2.1**: 修复 `SyntaxError: Unexpected token '}'`（`showConfigPanel()` 缺少 `function` 声明头导致）。状态栏和输出日志恢复。

## 0.1.9 - 2026-05-20

### English

- Added VS Code configuration defaults for Copilot Explore subagents:
  - `chat.exploreAgent.defaultModel`: `DeepSeek V4 Pro (matrix-oai-compatible)`
  - `chat.customAgentInSubagent.enabled`: `true`
- Documented how to keep Copilot Agent Explore tasks on the OAI provider model instead of falling back to built-in Copilot models.

### 中文

- 新增 VS Code 默认配置，让 Copilot Explore 子代理默认使用 DeepSeek V4 Pro：
  - `chat.exploreAgent.defaultModel`: `DeepSeek V4 Pro (matrix-oai-compatible)`
  - `chat.customAgentInSubagent.enabled`: `true`
- 补充文档，说明如何避免 Agent/Explore 子任务自动切回 Copilot 内置模型。

## 0.1.8 - 2026-05-20

### English

- Aligned DeepSeek V4 defaults with the official API limits: 1M context and 384K advertised maximum output.
- Added model-level `stream_options` passthrough and enabled `include_usage` for DeepSeek streaming requests.
- Set DeepSeek V4 Pro to official maximum reasoning effort with `reasoning_effort: "max"`.
- Removed non-official DeepSeek request flags from the workspace configuration.

### 中文

- 按 DeepSeek 官方参数更新 V4 默认配置：1M 上下文、384K 最大输出能力声明。
- 新增模型级 `stream_options` 透传，并为 DeepSeek 流式请求开启 `include_usage`。
- DeepSeek V4 Pro 使用官方最高推理强度 `reasoning_effort: "max"`。
- 清理工作区配置里的非官方 DeepSeek 请求字段。

## 0.1.7 - 2026-05-20

### English

- Stabilized model IDs shown to VS Code/Copilot by exposing simple IDs such as `deepseek-v4-pro` instead of dotted provider-qualified IDs.
- Kept backwards-compatible matching for legacy IDs such as `deepseek.deepseek-v4-pro`.
- Reduced Copilot local model-cache misses that could cause the selected OAI model to fall back to another model.

### 中文

- 暴露给 VS Code/Copilot 的模型 ID 改为更稳定的简单形式，例如 `deepseek-v4-pro`，不再默认使用带点的 provider 前缀。
- 继续兼容旧 ID，例如 `deepseek.deepseek-v4-pro`。
- 降低 Copilot 本地模型缓存找不到自定义模型，从而自动切回其他模型的概率。

## 0.1.6 - 2026-05-20

### English

- Fixed intermittent Copilot `LanguageModelError: matrix-oai-compatible/...` failures during tool-calling loops.
- Kept the VS Code language model provider registered for the lifetime of the extension instead of disposing and re-registering it on configuration refresh.
- Accepted both provider-local model IDs and VS Code fully qualified IDs such as `matrix-oai-compatible/deepseek.deepseek-v4-pro`.

### 中文

- 修复工具调用循环中偶发的 `LanguageModelError: matrix-oai-compatible/...` 空红叉问题。
- 配置刷新时不再 dispose/re-register language model provider，避免 Copilot 中途拿到失效模型句柄。
- 同时兼容 provider 内部模型 ID 和 VS Code 完整模型 ID，例如 `matrix-oai-compatible/deepseek.deepseek-v4-pro`。

## 0.1.5 - 2026-05-20

### English

- Fixed slow upstream requests surfacing as raw `AbortError` stack traces.
- Added clearer timeout errors with the configured timeout value.
- Added per-model `requestTimeoutSeconds` and `stream` settings.
- Increased the default upstream timeout to 300 seconds for slow reasoning models.
- Applied model-level `stream: false` overrides before sending upstream requests.

### 中文

- 修复慢请求超时只显示原始 `AbortError` 堆栈的问题。
- 超时报错现在会显示具体超时时间和处理建议。
- 新增模型级 `requestTimeoutSeconds` 和 `stream` 配置。
- 默认上游超时时间提升到 300 秒，适配慢思考模型。
- 模型里的 `stream: false` 现在会真正生效。

## 0.1.4 - 2026-05-20

### English

- Fixed DeepSeek-compatible thinking-mode tool-call failures by caching upstream `reasoning_content` and replaying it on matching assistant history.
- Added a safe fallback that sends empty `reasoning_content` on assistant tool-call turns when VS Code does not expose the original hidden reasoning text.
- Improved upstream error formatting and secret redaction.
- Added status bar telemetry: proxy port, latest context usage, total requests, and total errors.
- Expanded the configuration page with last request context, model context/output limits, reasoning replay state, formatted token totals, and redacted provider headers.
- Persisted error counts alongside usage statistics.
- Added bilingual README content and marketplace description details.

### 中文

- 修复 DeepSeek 兼容思考模式下工具调用多轮对话可能报 `reasoning_content` 缺失的问题。
- 在 VS Code 不返回隐藏思考内容时，对 assistant 工具调用历史补空 `reasoning_content` 兜底。
- 优化上游错误展示，并对密钥类内容做脱敏。
- 底部状态栏新增代理端口、最近上下文用量、请求数、错误数。
- 配置页新增最近请求上下文、模型上下文/输出上限、思考回放状态、格式化 token 用量和 header 脱敏。
- 错误统计现在会和用量一起持久化。
- 补充中英文 README 和扩展描述。

## 0.1.3 - 2026-05-20

- Added model default parameter passthrough for sampling and thinking options.
- Added built-in Ollama Qwen and DeepSeek model defaults.
- Restored packaged icon and fixed marketplace manifest packaging.

## 0.1.0 - 2026-05-20

- Initial Matrix OAI Gateway provider and proxy implementation.
