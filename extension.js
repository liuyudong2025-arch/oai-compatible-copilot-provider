'use strict';

const http = require('http');
const vscode = require('vscode');

const VENDOR = 'matrix-oai-compatible';
const CONFIG_SECTION = 'matrixOaiCopilot';
const GLOBAL_API_KEY = 'matrixOaiCopilot.globalApiKey';
const STATS_KEY = 'matrixOaiCopilot.usageStats';

const PRESET_MODELS = [
  preset('OpenAI: GPT-4o Mini', 'gpt-4o-mini', 'GPT-4o Mini', 'https://api.openai.com/v1', 'openai', 'gpt-4o', 128000, true, true),
  preset('OpenAI: GPT-4.1', 'gpt-4.1', 'GPT-4.1', 'https://api.openai.com/v1', 'openai', 'gpt-4.1', 1047576, true, true),
  preset('Ollama local: Qwen Coder', 'qwen2.5-coder:14b', 'Qwen Coder Local', 'http://localhost:11434/v1', 'ollama-local', 'qwen', 32768, true, false),
  preset('LM Studio local', 'local-model', 'LM Studio Local', 'http://localhost:1234/v1', 'lm-studio-local', 'local', 32768, false, false),
  preset('DeepSeek: Chat', 'deepseek-chat', 'DeepSeek Chat', 'https://api.deepseek.com/v1', 'deepseek', 'deepseek', 64000, true, false),
  preset('DeepSeek: Reasoner', 'deepseek-reasoner', 'DeepSeek Reasoner', 'https://api.deepseek.com/v1', 'deepseek', 'deepseek', 64000, false, false),
  preset('Qwen DashScope: Qwen Plus', 'qwen-plus', 'Qwen Plus', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'dashscope', 'qwen', 128000, true, false),
  preset('Moonshot Kimi', 'moonshot-v1-8k', 'Kimi Moonshot', 'https://api.moonshot.cn/v1', 'moonshot', 'moonshot', 8192, true, false),
  preset('Zhipu GLM', 'glm-4-plus', 'GLM-4 Plus', 'https://open.bigmodel.cn/api/paas/v4', 'zhipu', 'glm', 128000, true, false),
  preset('OpenRouter: Custom Model', 'openai/gpt-4o-mini', 'OpenRouter Custom', 'https://openrouter.ai/api/v1', 'openrouter', 'openrouter', 128000, true, false),
  preset('Groq: Llama', 'llama-3.3-70b-versatile', 'Groq Llama', 'https://api.groq.com/openai/v1', 'groq', 'llama', 128000, true, false),
  preset('Custom OpenAI-compatible endpoint', 'custom-model', 'Custom Model', 'https://example.com/v1', 'custom', 'oai-compatible', 128000, true, false)
];

let extensionContext;
let providerDisposable;
let statusBar;
let output;
let proxyServer;
let proxyPanel;
let sessionStats;

function preset(label, id, name, baseUrl, providerId, family, maxInputTokens, supportsTools, supportsImages) {
  return {
    label,
    model: {
      id,
      name,
      baseUrl,
      providerId,
      family,
      version: id,
      maxInputTokens,
      supportsTools,
      supportsImages
    }
  };
}

function activate(context) {
  extensionContext = context;
  sessionStats = createStats();
  output = vscode.window.createOutputChannel('Matrix OAI Gateway');

  if (!vscode.lm?.registerLanguageModelChatProvider) {
    vscode.window.showErrorMessage('Matrix OAI Gateway requires a VS Code build with LanguageModelChatProvider support.');
    return;
  }

  registerProvider(context);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80);
  statusBar.command = 'matrixOaiCopilot.showConfig';
  statusBar.show();
  context.subscriptions.push(statusBar, output);

  context.subscriptions.push(
    vscode.commands.registerCommand('matrixOaiCopilot.addModel', () => addModelCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.addProvider', () => addProviderCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.addPresetModel', () => addPresetModelCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.setApiKey', () => setApiKeyCommand(context)),
    vscode.commands.registerCommand('matrixOaiCopilot.clearApiKey', () => clearApiKeyCommand(context)),
    vscode.commands.registerCommand('matrixOaiCopilot.refreshModels', () => refreshProvider()),
    vscode.commands.registerCommand('matrixOaiCopilot.startProxy', () => startProxy()),
    vscode.commands.registerCommand('matrixOaiCopilot.stopProxy', () => stopProxy()),
    vscode.commands.registerCommand('matrixOaiCopilot.restartProxy', async () => {
      await stopProxy();
      await startProxy();
    }),
    vscode.commands.registerCommand('matrixOaiCopilot.showConfig', () => showConfigPanel()),
    vscode.commands.registerCommand('matrixOaiCopilot.showOutput', () => output?.show()),
    vscode.commands.registerCommand('matrixOaiCopilot.openSettings', () => openSettingsCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.resetUsage', () => resetUsageStats())
  );

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration(CONFIG_SECTION)) {
      return;
    }
    logInfo('Configuration changed; refreshing provider and status.');
    refreshProvider();
    updateStatusBar();
    refreshConfigPanel();
  }));

  updateStatusBar();
  logInfo(`Activated. Registered ${getModels().length} OAI-compatible model(s).`);

  if (getConfig().get('proxy.autoStart', true)) {
    startProxy().catch((error) => logError('Proxy auto-start failed', error));
  }
}

function deactivate() {
  providerDisposable?.dispose();
  statusBar?.dispose();
  output?.dispose();
  proxyPanel?.dispose();
  if (proxyServer) {
    proxyServer.close();
  }
}

class OaiCompatibleChatProvider {
  constructor(context) {
    this.context = context;
  }

  async provideLanguageModelChatInformation(options, token) {
    if (token?.isCancellationRequested) {
      return [];
    }

    return getModels().map((model) => ({
      id: publicModelId(model),
      name: model.name || model.id,
      family: model.family || 'oai-compatible',
      version: model.version || model.id,
      maxInputTokens: Number(model.maxInputTokens || 128000),
      isDefault: Boolean(model.isDefault),
      capabilities: {
        toolCalling: model.supportsTools !== false,
        imageInput: Boolean(model.supportsImages)
      }
    }));
  }

  async provideLanguageModelChatResponse(model, messages, options, progress, token) {
    const config = findConfiguredModel(model.id);
    if (!config) {
      throw new Error(`Unknown OAI-compatible model: ${model.id}`);
    }

    const apiKey = await getApiKey(this.context, config, false);
    if (apiKey === undefined) {
      throw new Error('API key prompt was cancelled.');
    }

    const request = buildChatRequest(config, messages, options);
    const startedAt = Date.now();
    logInfo(`Provider request started: ${config.name || config.id} -> ${chatCompletionsUrl(config.baseUrl)}`);
    logDebug('Provider request shape', {
      model: request.model,
      stream: request.stream,
      messages: request.messages.length,
      tools: Array.isArray(request.tools) ? request.tools.length : 0
    });

    try {
      const result = await sendOaiUpstream(config, apiKey, request, {
        onText: (text) => progress.report(new vscode.LanguageModelTextPart(text)),
        onToolCall: (call) => reportToolCall(progress, call)
      }, token);

      recordUsage(config.id, 'oai-provider', result.usage, result.completionText.length, Date.now() - startedAt);
      logInfo(`Provider request finished: ${config.name || config.id} in ${Date.now() - startedAt}ms.`);
    } catch (error) {
      recordError(config.id, 'oai-provider');
      logError(`Provider request failed: ${config.name || config.id}`, error);
      throw error;
    }
  }

  provideTokenCount(model, text, token) {
    if (token?.isCancellationRequested) {
      return 0;
    }
    return estimateTokens(typeof text === 'string' ? text : JSON.stringify(text));
  }
}

function registerProvider(context) {
  providerDisposable?.dispose();
  providerDisposable = vscode.lm.registerLanguageModelChatProvider(VENDOR, new OaiCompatibleChatProvider(context));
  context.subscriptions.push(providerDisposable);
}

async function refreshProvider() {
  if (!extensionContext || !vscode.lm?.registerLanguageModelChatProvider) {
    return;
  }

  registerProvider(extensionContext);
  vscode.commands.executeCommand('workbench.action.chat.refreshModels').then(undefined, () => undefined);
  logInfo(`Provider refreshed. Registered ${getModels().length} OAI-compatible model(s).`);
}

function getConfig() {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

function getModels() {
  return getConfig().get('models', []).filter((model) => model && model.id && (model.providerId || model.baseUrl));
}

function getProviders() {
  const configured = getConfig().get('providers', []).filter((provider) => provider && provider.id && provider.baseUrl);
  const derived = [];
  const seen = new Set(configured.map((provider) => provider.id));

  for (const model of getConfig().get('models', [])) {
    if (!model?.id || !model.baseUrl) {
      continue;
    }
    const id = model.providerId || safeId(model.baseUrl);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    derived.push({
      id,
      name: model.providerName || id,
      baseUrl: model.baseUrl,
      apiMode: model.apiMode || 'openai',
      headers: model.headers || {}
    });
  }

  return [...configured, ...derived];
}

function findConfiguredModel(modelId) {
  const model = getModels().find((item) => publicModelId(item) === modelId || item.id === modelId || item.name === modelId);
  return model ? resolveModel(model) : undefined;
}

function resolveModel(model) {
  const provider = findProvider(model.providerId || (model.baseUrl ? safeId(model.baseUrl) : ''));
  return {
    ...(provider || {}),
    ...model,
    provider,
    providerId: model.providerId || provider?.id || (model.baseUrl ? safeId(model.baseUrl) : 'default'),
    baseUrl: model.baseUrl || provider?.baseUrl,
    headers: {
      ...(provider?.headers || {}),
      ...(model.headers || {})
    },
    apiMode: model.apiMode || provider?.apiMode || 'openai'
  };
}

function findProvider(providerId) {
  return getProviders().find((provider) => provider.id === providerId);
}

function publicModelId(model) {
  const providerPart = safeId(model.providerId || (model.baseUrl ? safeId(model.baseUrl) : 'default'));
  const modelPart = safeId(model.id);
  return `${providerPart}.${modelPart}`;
}

function safeId(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
}

function chatCompletionsUrl(baseUrl) {
  const clean = String(baseUrl || '').replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) {
    return clean;
  }
  return `${clean}/chat/completions`;
}

async function getApiKey(context, model, silent) {
  const providerKey = secretKeyFor(model);
  const scoped = await context.secrets.get(providerKey);
  if (scoped) {
    return scoped;
  }

  const global = await context.secrets.get(GLOBAL_API_KEY);
  if (global) {
    return global;
  }

  if (silent) {
    return undefined;
  }

  const label = model.name || model.id;
  const value = await vscode.window.showInputBox({
    title: `API key for ${label}`,
    prompt: 'Stored in VS Code Secret Storage. Leave empty for local endpoints that do not require auth.',
    password: true,
    ignoreFocusOut: true
  });

  if (value === undefined) {
    return undefined;
  }

  if (value.trim()) {
    await context.secrets.store(providerKey, value.trim());
    return value.trim();
  }

  return '';
}

function secretKeyFor(model) {
  const provider = model.providerId || model.provider?.id || model.baseUrl || 'default';
  return `matrixOaiCopilot.apiKey.${Buffer.from(provider).toString('base64url')}`;
}

function buildChatRequest(config, messages, options) {
  const body = {
    model: config.id,
    messages: convertVsCodeMessagesToOpenAi(messages),
    stream: getConfig().get('stream', true)
  };

  const tools = convertTools(options?.tools);
  if (tools.length > 0 && config.supportsTools !== false) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  if (!config.omitUnsupportedParameters) {
    const temperature = options?.modelOptions?.temperature ?? getConfig().get('temperature', null);
    if (typeof temperature === 'number') {
      body.temperature = temperature;
    }

    const maxTokens = options?.modelOptions?.max_tokens || options?.modelOptions?.maxTokens;
    if (typeof maxTokens === 'number') {
      body.max_tokens = maxTokens;
    }
  }

  return body;
}

function convertVsCodeMessagesToOpenAi(messages) {
  const converted = [];

  for (const message of messages || []) {
    const role = roleToOpenAi(message.role);
    const textParts = [];
    const contentParts = [];
    const toolCalls = [];

    for (const part of message.content || []) {
      if (isTextPart(part)) {
        if (part.value) {
          textParts.push(part.value);
          contentParts.push({ type: 'text', text: part.value });
        }
        continue;
      }

      if (isToolCallPart(part)) {
        toolCalls.push({
          id: part.callId,
          type: 'function',
          function: {
            name: part.name,
            arguments: JSON.stringify(part.input || {})
          }
        });
        continue;
      }

      if (isToolResultPart(part)) {
        converted.push({
          role: 'tool',
          tool_call_id: part.callId,
          content: toolResultToText(part)
        });
        continue;
      }

      const image = dataPartToImageContent(part);
      if (image) {
        contentParts.push(image);
      }
    }

    if (role === 'assistant' && toolCalls.length > 0) {
      converted.push({
        role,
        content: textParts.join('') || null,
        tool_calls: toolCalls
      });
      continue;
    }

    if (textParts.length > 0 || contentParts.length > 0) {
      converted.push({
        role,
        content: contentParts.some((part) => part.type !== 'text') ? contentParts : textParts.join('')
      });
    }
  }

  return converted;
}

function roleToOpenAi(role) {
  if (role === vscode.LanguageModelChatMessageRole.Assistant) {
    return 'assistant';
  }
  if (vscode.LanguageModelChatMessageRole.System !== undefined && role === vscode.LanguageModelChatMessageRole.System) {
    return 'system';
  }
  return 'user';
}

function isTextPart(part) {
  return part && (part instanceof vscode.LanguageModelTextPart || typeof part.value === 'string');
}

function isToolCallPart(part) {
  return part && typeof part.callId === 'string' && typeof part.name === 'string' && 'input' in part;
}

function isToolResultPart(part) {
  return part && typeof part.callId === 'string' && Array.isArray(part.content) && !('input' in part);
}

function toolResultToText(part) {
  return part.content.map((item) => {
    if (isTextPart(item)) {
      return item.value;
    }
    return JSON.stringify(item);
  }).join('');
}

function dataPartToImageContent(part) {
  if (!part || !part.data || !String(part.mimeType || '').startsWith('image/')) {
    return undefined;
  }

  const bytes = part.data instanceof Uint8Array ? part.data : new Uint8Array(part.data);
  const base64 = Buffer.from(bytes).toString('base64');
  return {
    type: 'image_url',
    image_url: {
      url: `data:${part.mimeType};base64,${base64}`
    }
  };
}

function convertTools(tools) {
  if (!Array.isArray(tools)) {
    return [];
  }

  return tools
    .filter((tool) => tool && tool.name)
    .map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || {
          type: 'object',
          properties: {}
        }
      }
    }));
}

async function sendOaiUpstream(config, apiKey, body, sink, token) {
  const controller = new AbortController();
  const disposables = [];
  let timeoutId;
  let completionText = '';
  let usage;

  if (token) {
    disposables.push(token.onCancellationRequested(() => controller.abort()));
  }

  const timeoutSeconds = getConfig().get('requestTimeoutSeconds', 120);
  timeoutId = setTimeout(() => controller.abort(), Math.max(timeoutSeconds, 10) * 1000);

  try {
    const headers = buildHeaders(config, apiKey);
    logDebug('Sending upstream OAI request', {
      model: body.model,
      stream: body.stream,
      hasApiKey: Boolean(apiKey),
      headers: Object.keys(headers).filter((key) => key.toLowerCase() !== 'authorization')
    });

    const response = await fetch(chatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    logInfo(`Upstream response: ${response.status} ${response.statusText || ''}`.trim());
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upstream API returned ${response.status}: ${text.slice(0, 1000)}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (body.stream && contentType.includes('text/event-stream')) {
      const streamed = await consumeOaiSse(response, sink, token);
      completionText = streamed.completionText;
      usage = streamed.usage;
    } else {
      const jsonResult = await consumeOaiJson(response, sink);
      completionText = jsonResult.completionText;
      usage = jsonResult.usage;
    }

    return { completionText, usage };
  } finally {
    clearTimeout(timeoutId);
    for (const disposable of disposables) {
      disposable.dispose();
    }
  }
}

function buildHeaders(config, apiKey) {
  const defaultHeaders = getConfig().get('defaultHeaders', {});
  const headers = {
    'content-type': 'application/json',
    accept: 'text/event-stream, application/json',
    ...defaultHeaders,
    ...(config.headers || {})
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

async function consumeOaiJson(response, sink) {
  const json = await response.json();
  const message = json?.choices?.[0]?.message || {};
  const completionText = typeof message.content === 'string' ? message.content : '';

  if (completionText) {
    sink.onText(completionText);
  }

  for (const call of message.tool_calls || []) {
    sink.onToolCall(call);
  }

  logDebug('Consumed JSON response', {
    hasContent: Boolean(message.content),
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls.length : 0,
    usage: json.usage
  });

  return { completionText, usage: json.usage };
}

async function consumeOaiSse(response, sink, token) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completionText = '';
  let usage;
  let chunks = 0;
  const toolCalls = new Map();

  while (!token?.isCancellationRequested) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';

    for (const event of events) {
      const dataLines = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());

      for (const data of dataLines) {
        if (!data || data === '[DONE]') {
          continue;
        }

        const chunk = JSON.parse(data);
        chunks += 1;
        if (chunk.usage) {
          usage = chunk.usage;
        }
        completionText += consumeOaiDelta(chunk, sink, toolCalls);
      }
    }
  }

  for (const call of toolCalls.values()) {
    sink.onToolCall(call);
  }

  logDebug('Consumed SSE response', { chunks, toolCalls: toolCalls.size, usage });
  return { completionText, usage };
}

function consumeOaiDelta(chunk, sink, toolCalls) {
  let text = '';
  for (const choice of chunk.choices || []) {
    const delta = choice.delta || {};

    if (delta.content) {
      text += delta.content;
      sink.onText(delta.content);
    }

    for (const incoming of delta.tool_calls || []) {
      const key = incoming.index ?? incoming.id ?? toolCalls.size;
      const existing = toolCalls.get(key) || {
        id: incoming.id,
        type: incoming.type || 'function',
        function: {
          name: '',
          arguments: ''
        }
      };

      if (incoming.id) {
        existing.id = incoming.id;
      }
      if (incoming.function?.name) {
        existing.function.name += incoming.function.name;
      }
      if (incoming.function?.arguments) {
        existing.function.arguments += incoming.function.arguments;
      }

      toolCalls.set(key, existing);
    }
  }
  return text;
}

function reportToolCall(progress, call) {
  const name = call?.function?.name;
  if (!name) {
    return;
  }

  let input = {};
  const rawArgs = call.function.arguments || '{}';
  try {
    input = JSON.parse(rawArgs);
  } catch {
    input = { _raw: rawArgs };
  }

  progress.report(new vscode.LanguageModelToolCallPart(call.id || `${name}-${Date.now()}`, name, input));
}

async function startProxy() {
  if (proxyServer) {
    updateStatusBar();
    return;
  }

  const host = getConfig().get('proxy.host', '127.0.0.1');
  const port = getConfig().get('proxy.port', 8080);

  proxyServer = http.createServer((request, response) => {
    handleProxyRequest(request, response).catch((error) => {
      recordError('proxy', 'proxy');
      logError('Proxy request failed', error);
      sendJson(response, 500, {
        error: {
          message: error.message || String(error),
          type: 'proxy_error'
        }
      });
    });
  });

  await new Promise((resolve, reject) => {
    proxyServer.once('error', reject);
    proxyServer.listen(port, host, resolve);
  });

  proxyServer.on('close', () => {
    proxyServer = undefined;
    updateStatusBar();
    refreshConfigPanel();
  });

  logInfo('=== Matrix OAI Gateway Proxy Started ===');
  logInfo(`OpenAI endpoint: http://${host}:${port}/v1/chat/completions`);
  logInfo(`Anthropic endpoint: http://${host}:${port}/v1/messages`);
  logInfo(`Models endpoint: http://${host}:${port}/v1/models`);
  updateStatusBar();
  refreshConfigPanel();
}

async function stopProxy() {
  if (!proxyServer) {
    updateStatusBar();
    return;
  }

  await new Promise((resolve) => proxyServer.close(resolve));
  proxyServer = undefined;
  logInfo('Proxy stopped.');
  updateStatusBar();
  refreshConfigPanel();
}

async function handleProxyRequest(request, response) {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || '/', 'http://127.0.0.1');
  logDebug('Proxy request', { method: request.method, pathname: url.pathname });

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    sendJson(response, 200, {
      ok: true,
      name: 'Matrix OAI Gateway',
      proxy: Boolean(proxyServer),
      endpoints: proxyEndpoints()
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/models') {
    sendJson(response, 200, {
      object: 'list',
      data: await listProxyModels()
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
    await handleOpenAiChatCompletion(request, response);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/messages') {
    await handleAnthropicMessages(request, response);
    return;
  }

  sendJson(response, 404, {
    error: {
      message: `Unknown endpoint: ${request.method} ${url.pathname}`,
      type: 'not_found'
    }
  });
}

function setCorsHeaders(response) {
  if (!getConfig().get('proxy.cors', true)) {
    return;
  }

  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  response.setHeader('access-control-allow-headers', 'authorization,content-type,x-api-key,anthropic-version');
}

async function handleOpenAiChatCompletion(request, response) {
  const body = await readJsonBody(request);
  const startedAt = Date.now();
  const modelId = body.model || getConfig().get('proxy.defaultModel', '');
  const configured = findConfiguredModel(modelId);

  logInfo(`Proxy OpenAI request: ${modelId || '(default)'}, messages=${Array.isArray(body.messages) ? body.messages.length : 0}, stream=${Boolean(body.stream)}`);

  if (configured) {
    await handleOpenAiViaConfiguredProvider(configured, body, response, startedAt);
    return;
  }

  await handleOpenAiViaVsCodeLm(modelId, body, response, startedAt);
}

async function handleOpenAiViaConfiguredProvider(configured, body, response, startedAt) {
  const apiKey = await getApiKey(extensionContext, configured, true);
  const upstreamBody = {
    ...body,
    model: configured.id
  };

  if (body.stream) {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });

    let completion = '';
    const result = await sendOaiUpstream(configured, apiKey || '', upstreamBody, {
      onText: (text) => {
        completion += text;
        writeSse(response, openAiTextChunk(configured.id, text));
      },
      onToolCall: () => {}
    });

    const usage = result.usage || estimatedOpenAiUsage(body.messages, completion);
    if (body.stream_options?.include_usage) {
      writeSse(response, {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: configured.id,
        choices: [],
        usage
      });
    }
    response.write('data: [DONE]\n\n');
    response.end();
    recordUsage(configured.id, 'proxy-oai-provider', usage, completion.length, Date.now() - startedAt);
    return;
  }

  let completion = '';
  const result = await sendOaiUpstream(configured, apiKey || '', upstreamBody, {
    onText: (text) => {
      completion += text;
    },
    onToolCall: () => {}
  });

  const usage = result.usage || estimatedOpenAiUsage(body.messages, completion);
  recordUsage(configured.id, 'proxy-oai-provider', usage, completion.length, Date.now() - startedAt);
  sendJson(response, 200, openAiCompletion(configured.id, completion, usage));
}

async function handleOpenAiViaVsCodeLm(modelId, body, response, startedAt) {
  const model = await selectVsCodeModel(modelId);
  const messages = openAiMessagesToVsCode(body.messages || []);
  const tools = openAiToolsToVsCode(body.tools);
  const options = {};
  if (tools.length > 0) {
    options.tools = tools;
    options.toolMode = vscode.LanguageModelChatToolMode?.Auto;
  }

  if (body.stream) {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });

    let completion = '';
    await sendVsCodeModelRequest(model, messages, options, {
      onText: (text) => {
        completion += text;
        writeSse(response, openAiTextChunk(model.id, text));
      },
      onToolCall: (call) => writeSse(response, openAiToolCallChunk(model.id, call))
    });

    const usage = estimatedOpenAiUsage(body.messages, completion);
    if (body.stream_options?.include_usage) {
      writeSse(response, {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model.id,
        choices: [],
        usage
      });
    }
    response.write('data: [DONE]\n\n');
    response.end();
    recordUsage(model.id, 'proxy-vscode-lm', usage, completion.length, Date.now() - startedAt);
    return;
  }

  let completion = '';
  const toolCalls = [];
  await sendVsCodeModelRequest(model, messages, options, {
    onText: (text) => {
      completion += text;
    },
    onToolCall: (call) => toolCalls.push(call)
  });

  const usage = estimatedOpenAiUsage(body.messages, completion);
  recordUsage(model.id, 'proxy-vscode-lm', usage, completion.length, Date.now() - startedAt);
  sendJson(response, 200, openAiCompletion(model.id, completion, usage, toolCalls));
}

async function handleAnthropicMessages(request, response) {
  const body = await readJsonBody(request);
  const startedAt = Date.now();
  const model = await selectVsCodeModel(body.model || getConfig().get('proxy.defaultModel', ''));
  const messages = anthropicMessagesToVsCode(body);
  const maxTokens = Number(body.max_tokens || 4096);

  logInfo(`Proxy Anthropic request: ${model.id}, messages=${Array.isArray(body.messages) ? body.messages.length : 0}, stream=${Boolean(body.stream)}`);

  if (body.stream) {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });

    const messageId = `msg_${Date.now()}`;
    writeAnthropicEvent(response, 'message_start', {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        model: model.id,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: estimateTokens(JSON.stringify(body.messages || [])), output_tokens: 0 }
      }
    });
    writeAnthropicEvent(response, 'content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' }
    });

    let completion = '';
    await sendVsCodeModelRequest(model, messages, { modelOptions: { max_tokens: maxTokens } }, {
      onText: (text) => {
        completion += text;
        writeAnthropicEvent(response, 'content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text }
        });
      },
      onToolCall: () => {}
    });

    const outputTokens = estimateTokens(completion);
    writeAnthropicEvent(response, 'content_block_stop', { type: 'content_block_stop', index: 0 });
    writeAnthropicEvent(response, 'message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: outputTokens }
    });
    writeAnthropicEvent(response, 'message_stop', { type: 'message_stop' });
    response.end();

    recordUsage(model.id, 'proxy-anthropic', {
      prompt_tokens: estimateTokens(JSON.stringify(body.messages || [])),
      completion_tokens: outputTokens,
      total_tokens: estimateTokens(JSON.stringify(body.messages || [])) + outputTokens
    }, completion.length, Date.now() - startedAt);
    return;
  }

  let completion = '';
  await sendVsCodeModelRequest(model, messages, { modelOptions: { max_tokens: maxTokens } }, {
    onText: (text) => {
      completion += text;
    },
    onToolCall: () => {}
  });

  const usage = {
    input_tokens: estimateTokens(JSON.stringify(body.messages || [])),
    output_tokens: estimateTokens(completion)
  };
  recordUsage(model.id, 'proxy-anthropic', {
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens,
    total_tokens: usage.input_tokens + usage.output_tokens
  }, completion.length, Date.now() - startedAt);

  sendJson(response, 200, {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: model.id,
    content: [{ type: 'text', text: completion }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage
  });
}

async function readJsonBody(request) {
  const maxBytes = getConfig().get('proxy.maxBodyBytes', 10 * 1024 * 1024);
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes} bytes.`);
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text);
}

async function listProxyModels() {
  const vscodeModels = await vscode.lm.selectChatModels();
  const lmRows = vscodeModels.map((model) => ({
    id: model.id,
    object: 'model',
    created: 0,
    owned_by: model.vendor || 'vscode-lm',
    source: 'vscode-lm',
    name: model.name,
    family: model.family,
    version: model.version,
    max_input_tokens: model.maxInputTokens
  }));

  const configuredRows = getModels().map((model) => resolveModel(model)).map((model) => ({
    id: publicModelId(model),
    object: 'model',
    created: 0,
    owned_by: model.providerId || 'oai-compatible',
    source: 'configured-oai',
    upstream_model: model.id,
    name: model.name || model.id,
    family: model.family,
    version: model.version || model.id,
    max_input_tokens: model.maxInputTokens
  }));

  return [...lmRows, ...configuredRows];
}

async function selectVsCodeModel(requestedId) {
  const all = await vscode.lm.selectChatModels();
  if (!all.length) {
    throw new Error('No VS Code language models are available. Sign in to GitHub Copilot or install a language model provider.');
  }

  const defaultModel = getConfig().get('proxy.defaultModel', '');
  const wanted = String(requestedId || defaultModel || '').toLowerCase();
  if (!wanted) {
    return all[0];
  }

  const exact = all.find((model) => [model.id, model.name, model.family, model.version].some((value) => String(value || '').toLowerCase() === wanted));
  if (exact) {
    return exact;
  }

  const partial = all.find((model) => [model.id, model.name, model.family, model.version].some((value) => String(value || '').toLowerCase().includes(wanted)));
  if (partial) {
    return partial;
  }

  throw new Error(`No VS Code language model matches "${requestedId}".`);
}

function openAiMessagesToVsCode(messages) {
  const result = [];
  for (const message of messages || []) {
    const text = openAiContentToText(message.content);
    if (!text && message.role !== 'assistant') {
      continue;
    }
    result.push(createVsCodeChatMessage(message.role, text));
  }
  return result;
}

function anthropicMessagesToVsCode(body) {
  const messages = [];
  if (body.system) {
    messages.push(createVsCodeChatMessage('system', String(body.system)));
  }

  for (const message of body.messages || []) {
    messages.push(createVsCodeChatMessage(message.role, anthropicContentToText(message.content)));
  }

  return messages;
}

function createVsCodeChatMessage(role, text) {
  if (role === 'assistant' && vscode.LanguageModelChatMessage?.Assistant) {
    return vscode.LanguageModelChatMessage.Assistant(text);
  }

  if (role === 'system' && vscode.LanguageModelChatMessage?.User) {
    return vscode.LanguageModelChatMessage.User(`System:\n${text}`);
  }

  if (vscode.LanguageModelChatMessage?.User) {
    return vscode.LanguageModelChatMessage.User(text);
  }

  const lmRole = role === 'assistant' ? vscode.LanguageModelChatMessageRole.Assistant : vscode.LanguageModelChatMessageRole.User;
  return new vscode.LanguageModelChatMessage(lmRole, [new vscode.LanguageModelTextPart(text)]);
}

function openAiContentToText(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (part?.type === 'text') {
        return part.text || '';
      }
      if (part?.type === 'image_url') {
        return '[image]';
      }
      return JSON.stringify(part);
    }).join('\n');
  }

  return content ? JSON.stringify(content) : '';
}

function anthropicContentToText(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part?.type === 'text') {
        return part.text || '';
      }
      if (part?.type === 'image') {
        return '[image]';
      }
      return JSON.stringify(part);
    }).join('\n');
  }

  return content ? JSON.stringify(content) : '';
}

function openAiToolsToVsCode(tools) {
  if (!Array.isArray(tools)) {
    return [];
  }

  return tools
    .filter((tool) => tool?.type === 'function' && tool.function?.name)
    .map((tool) => ({
      name: tool.function.name,
      description: tool.function.description || '',
      inputSchema: tool.function.parameters || { type: 'object', properties: {} }
    }));
}

async function sendVsCodeModelRequest(model, messages, options, sink) {
  const cts = new vscode.CancellationTokenSource();
  const timeoutSeconds = getConfig().get('proxy.requestTimeoutSeconds', 120);
  const timeoutId = setTimeout(() => cts.cancel(), Math.max(timeoutSeconds, 10) * 1000);

  try {
    const response = await model.sendRequest(messages, options || {}, cts.token);
    if (response.stream) {
      for await (const part of response.stream) {
        consumeVsCodeResponsePart(part, sink);
      }
      return;
    }

    for await (const text of response.text) {
      sink.onText(String(text));
    }
  } finally {
    clearTimeout(timeoutId);
    cts.dispose();
  }
}

function consumeVsCodeResponsePart(part, sink) {
  if (typeof part === 'string') {
    sink.onText(part);
    return;
  }

  if (isTextPart(part)) {
    sink.onText(part.value || '');
    return;
  }

  if (isToolCallPart(part)) {
    sink.onToolCall({
      id: part.callId,
      type: 'function',
      function: {
        name: part.name,
        arguments: JSON.stringify(part.input || {})
      }
    });
  }
}

function openAiCompletion(model, text, usage, toolCalls) {
  const message = {
    role: 'assistant',
    content: text || null
  };

  if (toolCalls?.length) {
    message.tool_calls = toolCalls.map((call) => ({
      id: call.id || call.callId || `call_${Date.now()}`,
      type: 'function',
      function: {
        name: call.function?.name || call.name,
        arguments: call.function?.arguments || JSON.stringify(call.input || {})
      }
    }));
  }

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: toolCalls?.length ? 'tool_calls' : 'stop'
    }],
    usage
  };
}

function openAiTextChunk(model, text) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: { content: text },
      finish_reason: null
    }]
  };
}

function openAiToolCallChunk(model, call) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: 0,
          id: call.id || call.callId || `call_${Date.now()}`,
          type: 'function',
          function: {
            name: call.function?.name || call.name,
            arguments: call.function?.arguments || JSON.stringify(call.input || {})
          }
        }]
      },
      finish_reason: null
    }]
  };
}

function estimatedOpenAiUsage(messages, completion) {
  const promptTokens = estimateTokens(JSON.stringify(messages || []));
  const completionTokens = estimateTokens(completion || '');
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens
  };
}

function sendJson(response, status, body) {
  if (response.headersSent) {
    return;
  }
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body, null, 2));
}

function writeSse(response, value) {
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

function writeAnthropicEvent(response, event, value) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

async function addModelCommand() {
  const provider = await pickOrCreateProvider();
  if (!provider) {
    return;
  }

  const id = await vscode.window.showInputBox({
    title: 'Add OAI-compatible model',
    prompt: 'Model id sent to the upstream API',
    value: 'qwen2.5-coder:14b',
    ignoreFocusOut: true
  });
  if (!id) {
    return;
  }

  const name = await vscode.window.showInputBox({
    title: 'Add OAI-compatible model',
    prompt: 'Display name',
    value: id,
    ignoreFocusOut: true
  });

  const supportsTools = await yesNoQuickPick('Does this model support OpenAI tool/function calling?', true);
  if (supportsTools === undefined) {
    return;
  }

  const supportsImages = await yesNoQuickPick('Does this model support image input?', false);
  if (supportsImages === undefined) {
    return;
  }

  const models = getModels();
  models.push({
    id,
    name: name || id,
    providerId: provider.id,
    family: 'oai-compatible',
    version: id,
    maxInputTokens: 128000,
    supportsTools,
    supportsImages
  });

  await getConfig().update('models', models, vscode.ConfigurationTarget.Global);
  await refreshProvider();
  logInfo(`Added custom model: ${name || id} (${provider.id}).`);
  vscode.window.showInformationMessage(`Added OAI-compatible model: ${name || id}`);
}

async function addPresetModelCommand() {
  const picked = await vscode.window.showQuickPick(PRESET_MODELS.map((presetItem) => ({
    label: presetItem.label,
    description: presetItem.model.baseUrl,
    preset: presetItem
  })), {
    placeHolder: 'Choose a preset, then edit the model id/name if needed',
    ignoreFocusOut: true
  });

  if (!picked) {
    return;
  }

  const draft = { ...picked.preset.model };
  const id = await vscode.window.showInputBox({
    title: 'Add preset OAI-compatible model',
    prompt: 'Model id sent to the upstream API. Change this if your provider uses a different id.',
    value: draft.id,
    ignoreFocusOut: true
  });
  if (!id) {
    return;
  }

  const baseUrl = await vscode.window.showInputBox({
    title: 'Add preset OAI-compatible model',
    prompt: 'Base URL',
    value: draft.baseUrl,
    ignoreFocusOut: true
  });
  if (!baseUrl) {
    return;
  }

  const name = await vscode.window.showInputBox({
    title: 'Add preset OAI-compatible model',
    prompt: 'Display name',
    value: draft.name || id,
    ignoreFocusOut: true
  });

  const model = {
    ...draft,
    id,
    providerId: draft.providerId || safeId(baseUrl),
    name: name || id,
    version: id
  };

  await ensureProvider({
    id: model.providerId,
    name: draft.providerName || model.providerId,
    baseUrl,
    apiMode: draft.apiMode || 'openai',
    headers: draft.headers || {}
  });

  delete model.baseUrl;
  const models = getModels();
  models.push(model);

  await getConfig().update('models', models, vscode.ConfigurationTarget.Global);
  await refreshProvider();
  logInfo(`Added preset model: ${model.name} (${model.providerId}).`);
  vscode.window.showInformationMessage(`Added preset OAI-compatible model: ${model.name}`);
}

async function pickOrCreateProvider() {
  const providers = getProviders();
  const picked = await vscode.window.showQuickPick([
    { label: 'Add new provider', add: true },
    ...providers.map((provider) => ({
      label: provider.name || provider.id,
      description: provider.baseUrl,
      provider
    }))
  ], {
    placeHolder: 'Choose a provider for this model',
    ignoreFocusOut: true
  });

  if (!picked) {
    return undefined;
  }

  if (!picked.add) {
    return picked.provider;
  }

  return addProviderCommand();
}

async function addProviderCommand() {
  const id = await vscode.window.showInputBox({
    title: 'Add Provider',
    prompt: 'Provider ID, for example ollama, openai, deepseek, lm-studio',
    value: 'ollama',
    ignoreFocusOut: true
  });
  if (!id) {
    return undefined;
  }

  const baseUrl = await vscode.window.showInputBox({
    title: 'Add Provider',
    prompt: 'Base URL, for example http://localhost:11434/v1',
    value: 'http://localhost:11434/v1',
    ignoreFocusOut: true
  });
  if (!baseUrl) {
    return undefined;
  }

  const apiMode = await vscode.window.showQuickPick([
    { label: 'openai', description: 'OpenAI-compatible /chat/completions' },
    { label: 'ollama', description: 'Ollama OpenAI-compatible mode' },
    { label: 'anthropic', description: 'Reserved for Anthropic-compatible routing' }
  ], {
    placeHolder: 'API mode',
    ignoreFocusOut: true
  });
  if (!apiMode) {
    return undefined;
  }

  const provider = {
    id: safeId(id),
    name: id,
    baseUrl,
    apiMode: apiMode.label,
    headers: {}
  };

  await ensureProvider(provider);
  logInfo(`Added provider: ${provider.id} (${provider.baseUrl}).`);
  refreshConfigPanel();
  vscode.window.showInformationMessage(`Added provider: ${provider.id}`);
  return provider;
}

async function ensureProvider(provider) {
  const providers = getConfig().get('providers', []).filter((item) => item && item.id);
  const index = providers.findIndex((item) => item.id === provider.id);

  if (index >= 0) {
    providers[index] = {
      ...providers[index],
      ...provider,
      headers: {
        ...(providers[index].headers || {}),
        ...(provider.headers || {})
      }
    };
  } else {
    providers.push(provider);
  }

  await getConfig().update('providers', providers, vscode.ConfigurationTarget.Global);
}

async function yesNoQuickPick(placeHolder, defaultValue) {
  const picked = await vscode.window.showQuickPick([
    { label: 'Yes', value: true },
    { label: 'No', value: false }
  ], {
    placeHolder,
    ignoreFocusOut: true
  });

  if (!picked) {
    return undefined;
  }

  return picked.value ?? defaultValue;
}

async function setApiKeyCommand(context) {
  const models = getModels();
  const target = await pickModelOrGlobal(models);
  if (!target) {
    return;
  }

  const value = await vscode.window.showInputBox({
    title: 'Set OAI-compatible API key',
    prompt: 'Stored in VS Code Secret Storage',
    password: true,
    ignoreFocusOut: true
  });
  if (value === undefined) {
    return;
  }

  if (target.global) {
    await context.secrets.store(GLOBAL_API_KEY, value.trim());
  } else {
    await context.secrets.store(secretKeyFor(target.model), value.trim());
  }

  logInfo(target.global ? 'Global API key saved.' : `API key saved for ${target.model.name || target.model.id}.`);
  vscode.window.showInformationMessage('OAI-compatible API key saved.');
}

async function clearApiKeyCommand(context) {
  const models = getModels();
  const target = await pickModelOrGlobal(models);
  if (!target) {
    return;
  }

  if (target.global) {
    await context.secrets.delete(GLOBAL_API_KEY);
  } else {
    await context.secrets.delete(secretKeyFor(target.model));
  }

  logInfo(target.global ? 'Global API key cleared.' : `API key cleared for ${target.model.name || target.model.id}.`);
  vscode.window.showInformationMessage('OAI-compatible API key cleared.');
}

async function pickModelOrGlobal(models) {
  const items = [
    { label: 'Global key', description: 'Used when a model-specific key is not set', global: true },
    ...models.map((model) => ({
      label: model.name || model.id,
      description: model.baseUrl,
      model
    }))
  ];

  return vscode.window.showQuickPick(items, {
    placeHolder: 'Choose where to store the API key',
    ignoreFocusOut: true
  });
}

async function openSettingsCommand() {
  await vscode.commands.executeCommand('workbench.action.openSettings', CONFIG_SECTION);
}

async function showConfigPanel() {
  if (proxyPanel) {
    proxyPanel.reveal(vscode.ViewColumn.One);
    refreshConfigPanel();
    return;
  }

  proxyPanel = vscode.window.createWebviewPanel(
    'matrixOaiCopilotConfig',
    'OAI Copilot Configuration',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  proxyPanel.onDidDispose(() => {
    proxyPanel = undefined;
  });

  proxyPanel.webview.onDidReceiveMessage(async (message) => {
    if (message.command === 'startProxy') {
      await startProxy();
    } else if (message.command === 'stopProxy') {
      await stopProxy();
    } else if (message.command === 'restartProxy') {
      await stopProxy();
      await startProxy();
    } else if (message.command === 'addPreset') {
      await addPresetModelCommand();
    } else if (message.command === 'addProvider') {
      await addProviderCommand();
    } else if (message.command === 'addModel') {
      await addModelCommand();
    } else if (message.command === 'settings') {
      await openSettingsCommand();
    } else if (message.command === 'output') {
      output?.show();
    } else if (message.command === 'resetUsage') {
      await resetUsageStats();
    }
    refreshConfigPanel();
  });

  refreshConfigPanel();
}

function refreshConfigPanel() {
  if (!proxyPanel) {
    return;
  }
  proxyPanel.webview.html = renderConfigHtml();
}

function renderConfigHtml() {
  const cfg = getConfig();
  const host = cfg.get('proxy.host', '127.0.0.1');
  const port = cfg.get('proxy.port', 8080);
  const endpoints = proxyEndpoints();
  const models = getModels();
  const providers = getProviders();
  const persisted = getPersistedStats();
  const stats = mergeStats(persisted, sessionStats);

  const providerRows = providers.map((provider) => `
    <tr>
      <td><code>${escapeHtml(provider.id)}</code></td>
      <td>${escapeHtml(provider.name || provider.id)}</td>
      <td>${escapeHtml(provider.baseUrl)}</td>
      <td>${escapeHtml(provider.apiMode || 'openai')}</td>
      <td><code>${escapeHtml(JSON.stringify(provider.headers || {}))}</code></td>
    </tr>
  `).join('');

  const modelRows = models.map((rawModel) => resolveModel(rawModel)).map((model) => `
    <tr>
      <td>${escapeHtml(model.name || model.id)}</td>
      <td><code>${escapeHtml(publicModelId(model))}</code></td>
      <td><code>${escapeHtml(model.providerId || '')}</code></td>
      <td>${escapeHtml(model.baseUrl)}</td>
      <td>${model.supportsTools !== false ? 'Yes' : 'No'}</td>
      <td>${model.supportsImages ? 'Yes' : 'No'}</td>
    </tr>
  `).join('');

  const usageRows = Object.entries(stats.byModel || {}).map(([model, row]) => `
    <tr>
      <td>${escapeHtml(model)}</td>
      <td>${escapeHtml(row.source || '')}</td>
      <td>${row.requests || 0}</td>
      <td>${row.errors || 0}</td>
      <td>${row.promptTokens || 0}</td>
      <td>${row.completionTokens || 0}</td>
      <td>${row.totalTokens || 0}</td>
      <td>${Math.round(row.totalLatencyMs / Math.max(row.requests || 1, 1))}ms</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
    h1 { font-size: 22px; margin: 0 0 16px; }
    h2 { font-size: 15px; margin: 22px 0 10px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; background: var(--vscode-editor-background); }
    .label { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .value { font-size: 18px; margin-top: 4px; }
    button { margin: 4px 6px 4px 0; padding: 6px 10px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 4px; cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; border-bottom: 1px solid var(--vscode-panel-border); padding: 7px 6px; vertical-align: top; }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; }
    code { user-select: all; }
    .ok { color: var(--vscode-testing-iconPassed); }
    .off { color: var(--vscode-testing-iconSkipped); }
  </style>
</head>
<body>
  <h1>OAI Copilot Configuration</h1>
  <div class="grid">
    <div class="card">
      <div class="label">Proxy</div>
      <div class="value ${proxyServer ? 'ok' : 'off'}">${proxyServer ? 'Running' : 'Stopped'}</div>
      <div>${escapeHtml(host)}:${port}</div>
    </div>
    <div class="card">
      <div class="label">Providers</div>
      <div class="value">${providers.length}</div>
    </div>
    <div class="card">
      <div class="label">Configured OAI Models</div>
      <div class="value">${models.length}</div>
    </div>
    <div class="card">
      <div class="label">Requests</div>
      <div class="value">${stats.requests || 0}</div>
      <div>${stats.errors || 0} errors</div>
    </div>
    <div class="card">
      <div class="label">Estimated / Reported Tokens</div>
      <div class="value">${stats.totalTokens || 0}</div>
      <div>${stats.promptTokens || 0} in / ${stats.completionTokens || 0} out</div>
    </div>
  </div>

  <h2>Actions</h2>
  <button onclick="send('startProxy')">Start Proxy</button>
  <button onclick="send('stopProxy')" class="secondary">Stop Proxy</button>
  <button onclick="send('restartProxy')" class="secondary">Restart Proxy</button>
  <button onclick="send('addProvider')">Add Provider</button>
  <button onclick="send('addPreset')">Add Preset Model</button>
  <button onclick="send('addModel')" class="secondary">Add Custom Model</button>
  <button onclick="send('settings')" class="secondary">Open Settings</button>
  <button onclick="send('output')" class="secondary">Show Output</button>
  <button onclick="send('resetUsage')" class="secondary">Reset Usage</button>

  <h2>Local Proxy Endpoints</h2>
  <table>
    <tr><th>Kind</th><th>URL</th></tr>
    <tr><td>OpenAI Chat Completions</td><td><code>${escapeHtml(endpoints.openai)}</code></td></tr>
    <tr><td>Anthropic Messages</td><td><code>${escapeHtml(endpoints.anthropic)}</code></td></tr>
    <tr><td>Models</td><td><code>${escapeHtml(endpoints.models)}</code></td></tr>
  </table>

  <h2>Provider Management</h2>
  <table>
    <tr><th>Provider ID</th><th>Name</th><th>Base URL</th><th>API Mode</th><th>Headers</th></tr>
    ${providerRows || '<tr><td colspan="5">No providers.</td></tr>'}
  </table>

  <h2>OAI-Compatible Models</h2>
  <table>
    <tr><th>Name</th><th>Proxy Model ID</th><th>Provider ID</th><th>Base URL</th><th>Tools</th><th>Images</th></tr>
    ${modelRows || '<tr><td colspan="6">No configured models.</td></tr>'}
  </table>

  <h2>Usage</h2>
  <table>
    <tr><th>Model</th><th>Source</th><th>Requests</th><th>Errors</th><th>Input</th><th>Output</th><th>Total</th><th>Avg Latency</th></tr>
    ${usageRows || '<tr><td colspan="8">No requests yet.</td></tr>'}
  </table>

  <script>
    const vscode = acquireVsCodeApi();
    function send(command) { vscode.postMessage({ command }); }
  </script>
</body>
</html>`;
}

function proxyEndpoints() {
  const host = getConfig().get('proxy.host', '127.0.0.1');
  const port = getConfig().get('proxy.port', 8080);
  return {
    openai: `http://${host}:${port}/v1/chat/completions`,
    anthropic: `http://${host}:${port}/v1/messages`,
    models: `http://${host}:${port}/v1/models`
  };
}

function updateStatusBar() {
  if (!statusBar) {
    return;
  }

  const port = getConfig().get('proxy.port', 8080);
  statusBar.text = proxyServer ? `$(radio-tower) OAI Gateway: ${port}` : '$(hubot) OAI Gateway';
  statusBar.tooltip = proxyServer
    ? `Matrix OAI Gateway is running on 127.0.0.1:${port}`
    : 'Matrix OAI Gateway configuration';
}

function createStats() {
  return {
    startedAt: new Date().toISOString(),
    requests: 0,
    errors: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalLatencyMs: 0,
    byModel: {}
  };
}

function getPersistedStats() {
  return extensionContext?.globalState.get(STATS_KEY, createStats()) || createStats();
}

async function persistStats(stats) {
  await extensionContext?.globalState.update(STATS_KEY, stats);
}

function mergeStats(a, b) {
  const merged = createStats();
  merged.startedAt = a.startedAt || b.startedAt;
  for (const stats of [a, b]) {
    merged.requests += stats.requests || 0;
    merged.errors += stats.errors || 0;
    merged.promptTokens += stats.promptTokens || 0;
    merged.completionTokens += stats.completionTokens || 0;
    merged.totalTokens += stats.totalTokens || 0;
    merged.totalLatencyMs += stats.totalLatencyMs || 0;
    for (const [model, row] of Object.entries(stats.byModel || {})) {
      const target = merged.byModel[model] || emptyModelStats(row.source);
      target.requests += row.requests || 0;
      target.errors += row.errors || 0;
      target.promptTokens += row.promptTokens || 0;
      target.completionTokens += row.completionTokens || 0;
      target.totalTokens += row.totalTokens || 0;
      target.totalLatencyMs += row.totalLatencyMs || 0;
      target.source = row.source || target.source;
      merged.byModel[model] = target;
    }
  }
  return merged;
}

function emptyModelStats(source) {
  return {
    source,
    requests: 0,
    errors: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalLatencyMs: 0
  };
}

function recordUsage(modelId, source, usage, completionChars, latencyMs) {
  const normalized = normalizeUsage(usage, completionChars);
  applyUsage(sessionStats, modelId, source, normalized, latencyMs);
  const persisted = getPersistedStats();
  applyUsage(persisted, modelId, source, normalized, latencyMs);
  persistStats(persisted).then(undefined, (error) => logError('Persist usage failed', error));
  refreshConfigPanel();
}

function applyUsage(stats, modelId, source, usage, latencyMs) {
  stats.requests += 1;
  stats.promptTokens += usage.prompt_tokens;
  stats.completionTokens += usage.completion_tokens;
  stats.totalTokens += usage.total_tokens;
  stats.totalLatencyMs += latencyMs || 0;

  const row = stats.byModel[modelId] || emptyModelStats(source);
  row.source = source;
  row.requests += 1;
  row.promptTokens += usage.prompt_tokens;
  row.completionTokens += usage.completion_tokens;
  row.totalTokens += usage.total_tokens;
  row.totalLatencyMs += latencyMs || 0;
  stats.byModel[modelId] = row;
}

function recordError(modelId, source) {
  sessionStats.errors += 1;
  const row = sessionStats.byModel[modelId] || emptyModelStats(source);
  row.errors += 1;
  sessionStats.byModel[modelId] = row;
  refreshConfigPanel();
}

function normalizeUsage(usage, completionChars) {
  const prompt = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
  const completion = Number(usage?.completion_tokens ?? usage?.output_tokens ?? estimateTokens('x'.repeat(completionChars || 0)));
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: Number(usage?.total_tokens ?? prompt + completion)
  };
}

async function resetUsageStats() {
  sessionStats = createStats();
  await persistStats(createStats());
  logInfo('Usage stats reset.');
  refreshConfigPanel();
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function logInfo(message) {
  logAt('info', message);
}

function logDebug(message, value) {
  logAt('debug', value === undefined ? message : `${message}: ${JSON.stringify(value)}`);
}

function logError(message, error) {
  const detail = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
  logAt('error', `${message}: ${detail}`);
}

function logAt(level, message) {
  if (!shouldLog(level)) {
    return;
  }

  output?.appendLine(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
}

function shouldLog(level) {
  const order = { off: 0, error: 1, info: 2, debug: 3 };
  const configured = getConfig().get('logLevel', 'info');
  return order[configured] >= order[level];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  activate,
  deactivate
};
