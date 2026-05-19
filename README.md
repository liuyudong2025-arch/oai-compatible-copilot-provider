# Matrix OAI Gateway for Copilot

This extension combines two directions in one place:

- OAI Provider: expose OpenAI-compatible upstream models inside VS Code Chat / GitHub Copilot Chat.
- Copilot Proxy: expose VS Code language models through local OpenAI-compatible and Anthropic-compatible HTTP APIs.

It is designed as a small AI gateway for VS Code.

## Providers And Models

Providers are reusable endpoints. Models reference providers by `providerId`, so one provider can host many models.

```json
"matrixOaiCopilot.providers": [
  {
    "id": "ollama",
    "name": "Ollama Local",
    "baseUrl": "http://localhost:11434/v1",
    "apiMode": "ollama",
    "headers": {
      "X-API-Version": "v1"
    }
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
    "id": "qwen2.5-coder:14b",
    "name": "Qwen Coder Local",
    "providerId": "ollama",
    "maxInputTokens": 32768,
    "supportsTools": true,
    "supportsImages": false
  },
  {
    "id": "deepseek-chat",
    "name": "DeepSeek Chat",
    "providerId": "deepseek",
    "maxInputTokens": 64000,
    "supportsTools": true,
    "supportsImages": false
  }
]
```

Legacy model-level `baseUrl` still works, but new configs should use `providers`.

## Local Proxy

When proxy is running:

- OpenAI Chat Completions: `http://127.0.0.1:8080/v1/chat/completions`
- Anthropic Messages: `http://127.0.0.1:8080/v1/messages`
- Models: `http://127.0.0.1:8080/v1/models`

If the requested `model` matches a configured OAI model, the proxy routes to that upstream provider. Otherwise it tries to route to an available VS Code language model, such as Copilot models.

## Commands

- `Matrix OAI Gateway: Configuration`
- `Matrix OAI Gateway: Add Provider`
- `Matrix OAI Gateway: Add Preset Model`
- `Matrix OAI Gateway: Add Model`
- `Matrix OAI Gateway: Set API Key`
- `Matrix OAI Gateway: Start Proxy`
- `Matrix OAI Gateway: Stop Proxy`
- `Matrix OAI Gateway: Show Output`
- `Matrix OAI Gateway: Reset Usage`

API keys are stored in VS Code Secret Storage per provider.

## Usage And Logs

Logs go to the `Matrix OAI Gateway` Output channel. Set `matrixOaiCopilot.logLevel` to `off`, `error`, `info`, or `debug`.

The configuration webview shows request count, errors, reported or estimated input/output tokens, and average latency per model. Provider APIs that return real `usage` are recorded directly; VS Code/Copilot proxy usage is estimated from text length.

## Compatibility

This does not support every AI model directly. It supports:

- upstream models reachable through OpenAI-compatible `/chat/completions`
- VS Code language models available through `vscode.lm`
- OpenAI-compatible proxy clients
- basic Anthropic Messages clients

Tool calling and image input depend on the upstream model and gateway.
