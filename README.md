# Matrix OAI Gateway for Copilot

Matrix OAI Gateway turns VS Code into a small OpenAI-compatible AI gateway.

It has two directions:

- OAI Provider: expose OpenAI-compatible upstream models inside VS Code Chat and GitHub Copilot Chat.
- Local Proxy: expose VS Code language models through local OpenAI-compatible and Anthropic-compatible HTTP APIs.

中文：Matrix OAI Gateway 可以把 OpenAI 兼容模型接入 VS Code / Copilot Chat，同时把 VS Code 里的语言模型反向暴露成本地 OpenAI / Anthropic 兼容接口。

## Highlights

- Provider-based model config: define one provider, attach multiple models.
- DeepSeek thinking-mode replay: preserves `reasoning_content` internally for tool-calling conversations.
- Local proxy endpoints for OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, and model listing.
- Status bar telemetry with proxy port, latest context usage, requests, and errors.
- Configuration webview with providers, models, endpoints, usage, latency, and context details.
- Secret handling: API keys can be stored in VS Code Secret Storage; header display is redacted.
- **Balance checking**: Query API key balance for supported providers (DeepSeek, OpenAI, OpenRouter, etc.). Balance appears in the status bar and auto-refreshes on startup and every 5 minutes.

中文功能：

- 支持 provider/model 分离配置。
- 支持 DeepSeek 思考模式工具调用所需的 `reasoning_content` 内部回放。
- 支持本地 `/v1/chat/completions`、`/v1/responses`、`/v1/messages`、`/v1/models` 代理接口。
- 底部状态栏显示端口、最近上下文用量、请求数和错误数。
- 配置页显示模型、接口、用量、延迟、上下文等信息。
- API Key 可存入 VS Code Secret Storage，配置页会隐藏敏感 header。
- **余额查询**：支持 DeepSeek、OpenAI、OpenRouter 等供应商的 API Key 余额查询。余额自动显示在状态栏，启动 30 秒后自动刷新，之后每 5 分钟刷新一次。

## Providers And Models

Providers are reusable endpoints. Models reference providers by `providerId`, so one provider can host many models.

```json
"matrixOaiCopilot.providers": [
  {
    "id": "ollama",
    "name": "Ollama Local",
    "baseUrl": "http://localhost:11434/v1",
    "apiMode": "ollama",
    "headers": {}
  },
  {
    "id": "deepseek",
    "name": "DeepSeek",
    "baseUrl": "https://api.deepseek.com/v1",
    "apiMode": "openai",
    "headers": {}
  }
],
"matrixOaiCopilot.models": [
  {
    "id": "qwen3.5:9b",
    "name": "Qwen3.5 9B",
    "providerId": "ollama",
    "family": "qwen",
    "maxInputTokens": 131072,
    "max_tokens": 32768,
    "supportsTools": true,
    "supportsImages": true,
    "temperature": 0.2,
    "top_p": 0.95,
    "top_k": 20,
    "enable_thinking": true,
    "thinking_budget": 8192
  },
  {
    "id": "deepseek-chat",
    "name": "DeepSeek Chat",
    "providerId": "deepseek",
    "family": "deepseek",
    "maxInputTokens": 64000,
    "supportsTools": true,
    "supportsImages": false
  }
]
```

## OpenAI Responses API Proxy

The local proxy now supports the OpenAI Responses protocol (`/v1/responses`) used by OpenAI Codex CLI. When Codex CLI sends Responses API requests, the proxy translates them to standard Chat Completions (`/v1/chat/completions`) for any configured OAI-compatible provider, then translates the response back to the Responses format.

**Use case**: Point Codex CLI's custom provider to the Matrix OAI Gateway proxy:

```toml
# ~/.codex/config.toml
[model_providers.deepseek]
name = "DeepSeek"
base_url = "http://127.0.0.1:8080/v1"
experimental_bearer_token = "codex-deepseek-local"
wire_api = "responses"

[profiles.deepseek-v4-pro]
model_provider = "deepseek"
model = "deepseek-v4-pro"
```

中文：本地代理现已支持 OpenAI Responses 协议（`/v1/responses`），Codex CLI 发起的 Responses 请求会被自动翻译为标准 Chat Completions 请求转发到上游 OAI 兼容模型，并将响应翻译回 Responses 格式。

Legacy model-level `baseUrl` still works, but new configs should use `providers`.

## DeepSeek Thinking Mode

Some DeepSeek-compatible thinking models require the assistant `reasoning_content` to be passed back in later tool-calling turns. VS Code does not expose that hidden field as visible text, so this extension stores it in memory and reattaches it to matching assistant messages before calling the upstream API.

中文：DeepSeek 思考模式在工具调用多轮对话里可能要求把上一轮 assistant 的 `reasoning_content` 回传。本扩展会把这个隐藏字段保存在内存里，并在后续请求里自动补回，避免 `invalid_request_error`。

Model options:

- `thinkingFormat`: `auto`, `deepseek`, `always`, or `none`.
- `reasoningContentFallback`: send empty `reasoning_content` for assistant tool-call turns when the exact hidden reasoning text cannot be recovered.

## Copilot Explore Subagents

GitHub Copilot Agent can start an internal Explore subagent for code search and file review. VS Code exposes a setting for that model, and this extension contributes defaults so Explore keeps using the OAI model instead of falling back to a Copilot built-in model:

```json
"chat.exploreAgent.defaultModel": "DeepSeek V4 Pro (matrix-oai-compatible)",
"chat.customAgentInSubagent.enabled": true
```

中文：Copilot Agent 在搜索和阅读代码时会启动内置 Explore 子代理。本扩展会默认把 Explore 子代理模型设置为 DeepSeek V4 Pro，避免子任务自动切回 GPT-4.1。

## Local Proxy

When the proxy is running:

- OpenAI Chat Completions: `http://127.0.0.1:8080/v1/chat/completions`
- OpenAI Responses: `http://127.0.0.1:8080/v1/responses`
- Anthropic Messages: `http://127.0.0.1:8080/v1/messages`
- Models: `http://127.0.0.1:8080/v1/models`
- Health: `http://127.0.0.1:8080/health`

If the requested `model` matches a configured OAI model, the proxy routes to that upstream provider. Otherwise it tries to route to an available VS Code language model, such as Copilot models.

中文：如果请求里的 `model` 命中已配置的 OAI 模型，会转发到对应上游；否则会尝试匹配 VS Code 中可用的语言模型。

## Commands

- `Matrix OAI Gateway: Configuration`
- `Matrix OAI Gateway: Add Provider`
- `Matrix OAI Gateway: Add Preset Model`
- `Matrix OAI Gateway: Add Model`
- `Matrix OAI Gateway: Set API Key`
- `Matrix OAI Gateway: Clear API Key`
- `Matrix OAI Gateway: Refresh Models`
- `Matrix OAI Gateway: Start Proxy`
- `Matrix OAI Gateway: Stop Proxy`
- `Matrix OAI Gateway: Restart Proxy`
- `Matrix OAI Gateway: Show Output`
- `Matrix OAI Gateway: Open Settings`
- `Matrix OAI Gateway: Reset Usage`
- `Matrix OAI Gateway: Check API Balance`

## Balance Checking

Query your API key balance for supported providers directly from VS Code.

**Supported providers:**

| Provider | Balance Endpoint | Currency |
|---|---|---|
| DeepSeek | `GET /user/balance` | CNY |
| OpenAI | `GET /v1/organization/balance` | USD |
| OpenRouter | `GET /v1/auth/key` | USD |
| Zhipu GLM / BigModel | `GET /api/monitor/usage/quota/limit` | tokens |

**How to use:**

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run `Matrix OAI Gateway: Check API Balance`
3. Select a supported provider
4. Enter your API key if not stored yet

You can also click the **Check Balance** button on the configuration panel.

**Auto-refresh**: The extension automatically checks balance 30 seconds after startup and every 5 minutes thereafter. The balance appears in the status bar. Configure the interval with `matrixOaiCopilot.balanceRefreshMinutes` (default: 5, minimum: 1).

中文：扩展启动 30 秒后自动查询余额，之后每 5 分钟刷新一次，结果直接显示在状态栏。可在设置 `matrixOaiCopilot.balanceRefreshMinutes` 调整刷新间隔（默认 5 分钟）。

The result shows:
- ✅ Account active or ❌ unavailable
- Total balance and currency
- Granted vs topped-up amounts (when applicable)

中文：在 VS Code 中直接查询支持的供应商 API Key 余额。

支持：DeepSeek、OpenAI、OpenRouter。可以通过命令面板或配置页的「Check Balance」按钮使用。

The status bar shows:

- proxy state and port
- **API balance** (after first successful query, auto-refreshed every 5 minutes)
- latest request context usage
- total request count
- total error count

The configuration webview shows request count, errors, reported or estimated input/output tokens, context usage, and average latency per model.

Logs go to the `Matrix OAI Gateway` Output channel. Set `matrixOaiCopilot.logLevel` to `off`, `error`, `info`, or `debug`.

中文：底部状态栏会显示代理端口、最近上下文占用、请求数和错误数。配置页会显示模型级用量、错误、上下文、延迟等细节。

## Timeouts And Streaming

Slow thinking models can take longer than normal chat models. The global upstream timeout is controlled by `matrixOaiCopilot.requestTimeoutSeconds`; an individual model can override it with `requestTimeoutSeconds`.

Set model-level `stream: false` when a provider is more stable with JSON responses than SSE streaming.

中文：慢思考模型可能超过普通聊天模型的等待时间。可以用 `matrixOaiCopilot.requestTimeoutSeconds` 设置全局超时，也可以在单个模型里用 `requestTimeoutSeconds` 覆盖。若某个供应商非流式更稳定，可以在模型里设置 `stream: false`。

## Compatibility

This extension supports:

- upstream models reachable through OpenAI-compatible `/chat/completions`
- VS Code language models available through `vscode.lm`
- OpenAI-compatible proxy clients
- basic Anthropic Messages clients

Tool calling, image input, reasoning options, and token usage depend on the upstream model and gateway.

中文：工具调用、图片输入、思考模式参数和真实 token 用量取决于具体上游模型和网关。
