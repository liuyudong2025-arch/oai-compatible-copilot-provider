'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

const VENDOR = 'matrix-oai-compatible';
const EXTENSION_VERSION = require('./package.json').version;
const CONFIG_SECTION = 'matrixOaiCopilot';
const GLOBAL_API_KEY = 'matrixOaiCopilot.globalApiKey';
const STATS_KEY = 'matrixOaiCopilot.usageStats';
const LAST_UPSTREAM_REQUEST_NOTE = 'Authorization is redacted. Request body may contain prompt, code, paths, and tool schemas.';
const MAX_REASONING_CACHE_ENTRIES = 200;
const MODEL_DEFAULT_PARAMETER_KEYS = [
  'temperature',
  'top_p',
  'top_k',
  'min_p',
  'presence_penalty',
  'frequency_penalty',
  'repeat_penalty',
  'seed',
  'enable_thinking',
  'thinking_budget',
  'thinking',
  'reasoning_effort',
  'response_format',
  'stream_options'
];

// Balance query endpoints for supported API providers.
// Each entry provides: url (relative to baseUrl), method, and a parser function name.
const BALANCE_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    url: '/user/balance',
    method: 'GET',
    parse: (json) => {
      if (!json?.balance_infos?.length) return null;
      const info = json.balance_infos[0];
      return {
        balance: info.total_balance,
        currency: info.currency || 'CNY',
        granted: info.granted_balance || '0.00',
        toppedUp: info.topped_up_balance || '0.00',
        available: json.is_available !== false,
        raw: json
      };
    }
  },
  openai: {
    name: 'OpenAI',
    url: '/v1/organization/balance',
    method: 'GET',
    parse: (json) => {
      // Also try /v1/dashboard/billing/credit_grants if available
      return {
        balance: json.total_available?.toString() || json.balance?.toString() || '0',
        currency: 'USD',
        granted: json.granted?.toString() || '0',
        toppedUp: json.approved_limit?.toString() || '0',
        available: true,
        raw: json
      };
    }
  },
  openrouter: {
    name: 'OpenRouter',
    url: '/v1/auth/key',
    method: 'GET',
    parse: (json) => {
      const data = json?.data;
      if (!data) return null;
      const used = data.usage || 0;
      const limit = data.limit || 0;
      return {
        balance: limit > 0 ? (limit - used).toFixed(2) : 'N/A (pay-as-you-go)',
        currency: 'USD',
        granted: '0',
        toppedUp: limit > 0 ? limit.toFixed(2) : 'unlimited',
        available: true,
        used: used.toFixed(2),
        limit: limit > 0 ? limit.toFixed(2) : 'unlimited',
        raw: json
      };
    }
  },
  groq: {
    name: 'Groq',
    url: '/v1/dashboard/usage',
    method: 'GET',
    parse: (json) => {
      // Groq provides usage-based info
      return {
        balance: 'See Groq dashboard',
        currency: 'USD',
        available: true,
        raw: json
      };
    }
  },
  dashscope: {
    name: 'Alibaba DashScope',
    url: '/v1/token/query',
    method: 'GET',
    parse: (json) => {
      return {
        balance: json?.remainingAmount?.toString() || 'N/A',
        currency: 'CNY',
        available: true,
        raw: json
      };
    }
  },
  zhipu: {
    name: 'Zhipu GLM',
    aliases: ['glm', 'bigmodel', 'zhipuai', '智谱'],
    url: '/api/monitor/usage/quota/limit',
    rootRelative: true,
    method: 'GET',
    parse: (json) => {
      const data = json?.data || json?.result || json || {};
      const primaryLimit = primaryZhipuLimit(data);
      const limit = pickNumeric(primaryLimit?.limit, primaryLimit?.number, data.limit, data.quota, data.total, data.totalValue, data.totalTokens, data.total_amount);
      const used = pickNumeric(primaryLimit?.used, primaryLimit?.currentValue, primaryLimit?.usage, data.currentValue, data.used, data.usage, data.usedValue, data.current, data.totalUsed);
      const remainingFromResponse = pickNumeric(primaryLimit?.remaining, data.remaining, data.remain, data.remainingValue, data.available, data.left);
      const percentage = pickNumeric(primaryLimit?.percentage, data.percentage, data.percent, data.usedPercent);
      const remaining = remainingFromResponse !== undefined
        ? remainingFromResponse
        : (limit !== undefined && used !== undefined ? Math.max(limit - used, 0) : undefined);
      const remainingPercent = remaining === undefined && percentage !== undefined ? Math.max(100 - percentage, 0) : undefined;
      return {
        balance: remaining !== undefined ? formatCompactNumber(remaining) : (
          remainingPercent !== undefined ? `${remainingPercent}%` : (
            limit !== undefined ? formatCompactNumber(limit) : 'N/A'
          )
        ),
        currency: remaining !== undefined ? 'tokens' : (
          remainingPercent !== undefined ? 'remaining' : 'quota'
        ),
        available: json?.success === false ? false : (json?.code === undefined || Number(json.code) === 200),
        used: used !== undefined ? formatNumber(used) : undefined,
        limit: limit !== undefined ? formatNumber(limit) : undefined,
        percentage: percentage !== undefined ? `${percentage}%` : (
          limit && used !== undefined ? `${((used / limit) * 100).toFixed(2)}%` : undefined
        ),
        resetTime: formatZhipuResetTime(primaryLimit?.nextResetTime || data.resetTime || data.reset_time || data.expireTime || data.expire_time),
        detail: zhipuLimitsSummary(data.limits),
        raw: json
      };
    }
  }
};

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
  preset('Google Gemini: Gemini 2.5 Pro', 'gemini-2.5-pro-exp-03-25', 'Gemini 2.5 Pro', 'https://generativelanguage.googleapis.com/v1beta/openai', 'google-gemini', 'gemini', 1048576, true, true),
  preset('Google Gemini: Gemini 2.5 Flash', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 'https://generativelanguage.googleapis.com/v1beta/openai', 'google-gemini', 'gemini', 1048576, true, true),
  preset('Anthropic: Claude Sonnet 4', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 'https://api.anthropic.com/v1', 'anthropic', 'claude', 200000, true, true),
  preset('Anthropic: Claude Haiku 3.5', 'claude-3-5-haiku-20241022', 'Claude Haiku 3.5', 'https://api.anthropic.com/v1', 'anthropic', 'claude', 200000, true, true),
  preset('DeepSeek: V4 Pro (Anthropic API)', 'deepseek-v4-pro', 'DeepSeek V4 Pro (Anthropic)', 'https://api.deepseek.com/anthropic', 'deepseek-anthropic', 'deepseek', 64000, true, false, 'anthropic'),
  preset('DeepSeek: V4 Flash (Anthropic API)', 'deepseek-v4-flash', 'DeepSeek V4 Flash (Anthropic)', 'https://api.deepseek.com/anthropic', 'deepseek-anthropic', 'deepseek', 64000, true, false, 'anthropic'),
  preset('Zhipu: GLM-5.1 (Anthropic API)', 'glm-5.1', 'GLM-5.1 (Anthropic)', 'https://open.bigmodel.cn/api/anthropic', 'zhipu-anthropic', 'glm', 128000, true, false, 'anthropic'),
  preset('Mistral: Mistral Large', 'mistral-large-latest', 'Mistral Large', 'https://api.mistral.ai/v1', 'mistral', 'mistral', 128000, true, true),
  preset('Together AI: Meta Llama', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Together Llama', 'https://api.together.xyz/v1', 'together', 'llama', 128000, true, false),
  preset('Perplexity: Sonar Pro', 'sonar-pro', 'Perplexity Sonar Pro', 'https://api.perplexity.ai', 'perplexity', 'perplexity', 127000, true, false),
  preset('SiliconFlow: DeepSeek V3', 'deepseek-ai/DeepSeek-V3', 'SiliconFlow DeepSeek V3', 'https://api.siliconflow.cn/v1', 'siliconflow', 'deepseek', 65536, true, false),
  preset('01.AI: Yi Lightning', 'yi-lightning', '01.AI Yi Lightning', 'https://api.lingyiwanwu.com/v1', 'lingyiwanwu', 'yi', 16000, true, false),
  preset('Custom OpenAI-compatible endpoint', 'custom-model', 'Custom Model', 'https://example.com/v1', 'custom', 'oai-compatible', 128000, true, false)
];

let extensionContext;
let providerDisposable;
let chatProvider;
let statusBar;
let output;
let proxyServer;
let proxyPanel;
let sessionStats;
let cachedBalance = null;
let balanceTimer;
let lastUpstreamRequestSnapshot;
const reasoningCache = new Map();
// Remembers the last upstream model used by Anthropic passthrough, so sub-agent requests
// (e.g. Explore using claude-haiku-*) follow the same upstream as the parent request's mapped model.
let lastAnthropicUpstreamModel = '';
const MAX_IMAGE_DESC_CACHE_ENTRIES = 100;
const VISION_CACHE_KEY = 'matrixOaiCopilot.visionCache';
const imageDescriptionCache = new Map();

function loadVisionCache() {
  try {
    const stored = extensionContext?.globalState?.get(VISION_CACHE_KEY, {});
    if (stored && typeof stored === 'object') {
      const entries = Object.entries(stored);
      // Keep only the most recent MAX entries (last N by insertion order)
      const recent = entries.slice(-MAX_IMAGE_DESC_CACHE_ENTRIES);
      let loadedCount = 0;
      let prunedCount = 0;
      const clean = {};
      for (const [key, value] of recent) {
        if (isVisionErrorFallback(value)) {
          prunedCount++;
          continue; // Skip stale error fallbacks from previous versions
        }
        imageDescriptionCache.set(key, value);
        clean[key] = value;
        loadedCount++;
      }
      if (prunedCount > 0) {
        // Rewrite globalState without the stale entries
        extensionContext?.globalState?.update(VISION_CACHE_KEY, clean);
        logInfo(`Vision cache: loaded ${loadedCount} descriptions, pruned ${prunedCount} stale error fallbacks.`);
      } else if (entries.length > 0) {
        logInfo(`Vision cache: loaded ${loadedCount} persisted descriptions.`);
      }
    }
  } catch (e) {
    logDebug('Failed to load vision cache from globalState', e);
  }
} 

function isVisionErrorFallback(description) {
  return !description
    || description.startsWith('The configured Matrix OAI vision proxy returned')
    || description.startsWith('The vision proxy returned')
    || description.startsWith('Image input was provided');
}

function persistVisionCache() {
  try {
    const obj = {};
    // Keep only last MAX entries
    const entries = [...imageDescriptionCache.entries()];
    const recent = entries.slice(-MAX_IMAGE_DESC_CACHE_ENTRIES);
    for (const [key, value] of recent) {
      obj[key] = value;
    }
    extensionContext?.globalState?.update(VISION_CACHE_KEY, obj);
  } catch (e) {
    logDebug('Failed to persist vision cache', e);
  }
}

function preset(label, id, name, baseUrl, providerId, family, maxInputTokens, supportsTools, supportsImages, apiMode) {
  const result = {
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
  if (apiMode) { result.model.apiMode = apiMode; }
  return result;
}

function activate(context) {
  extensionContext = context;
  sessionStats = createStats();
  output = vscode.window.createOutputChannel('Matrix OAI Gateway');
  loadVisionCache();

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
    vscode.commands.registerCommand('matrixOaiCopilot.copyLastUpstreamRequest', () => copyLastUpstreamRequestCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.openSettings', () => openSettingsCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.writeCodexConfig', () => writeCodexConfigCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.setThinkingEffort', () => setThinkingEffortCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.setVisionProxyModel', () => setVisionProxyModelCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.resetUsage', () => resetUsageStats()),
    vscode.commands.registerCommand('matrixOaiCopilot.checkBalance', () => checkBalanceCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.writeClaudeCodeConfig', () => writeClaudeCodeConfigCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.setAnthropicModelMapping', () => setAnthropicModelMappingCommand()),
    vscode.commands.registerCommand('matrixOaiCopilot.setCodexModelMapping', () => setCodexModelMappingCommand())
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
  startBalanceRefresh();
  logInfo(`Activated v${EXTENSION_VERSION}. Registered ${getModels().length} OAI-compatible model(s).`);

  if (getConfig().get('proxy.autoStart', false)) {
    startProxy().catch((error) => logError('Proxy auto-start failed', error));
  }
}

function deactivate() {
  providerDisposable?.dispose();
  statusBar?.dispose();
  output?.dispose();
  proxyPanel?.dispose();
  if (balanceTimer) {
    clearInterval(balanceTimer);
    balanceTimer = null;
  }
  if (proxyServer) {
    proxyServer.close();
  }
}

class OaiCompatibleChatProvider {
  constructor(context) {
    this.context = context;
    this.onDidChangeLanguageModelChatInformationEmitter = new vscode.EventEmitter();
    this.onDidChangeLanguageModelChatInformation = this.onDidChangeLanguageModelChatInformationEmitter.event;
    context.subscriptions.push(this.onDidChangeLanguageModelChatInformationEmitter);
  }

  refreshModelPicker() {
    this.onDidChangeLanguageModelChatInformationEmitter.fire();
  }

  async provideLanguageModelChatInformation(options, token) {
    if (token?.isCancellationRequested) {
      return [];
    }

    return getModels().filter(modelVisibleInPicker).map((model) => {
      const resolved = resolveModel(model);
      return {
        id: publicModelId(resolved),
        name: resolved.name || resolved.id,
        detail: modelPickerDetail(resolved),
        tooltip: resolved.providerId ? `${resolved.providerId} (Matrix OAI Gateway)` : 'Matrix OAI Gateway',
        family: resolved.family || 'oai-compatible',
        version: resolved.version || resolved.id,
        maxInputTokens: Number(resolved.maxInputTokens || Math.max(1, Number(resolved.context_length || 128000) - Number(resolved.max_tokens || resolved.maxTokens || 4096))),
        maxOutputTokens: Number(resolved.maxOutputTokens || resolved.max_tokens || resolved.maxTokens || 4096),
        isDefault: Boolean(resolved.isDefault),
        capabilities: {
          toolCalling: resolved.supportsTools !== false,
          imageInput: Boolean(modelSupportsImages(resolved) || getConfig().get('copilot.enableVisionProxy', true))
        },
        ...(supportsCopilotThinkingPicker(resolved) ? { configurationSchema: copilotThinkingConfigurationSchema(resolved) } : {})
      };
    });
  }

  async provideLanguageModelChatResponse(model, messages, options, progress, token) {
    const config = findConfiguredModel(model.id);
    if (!config) {
      throw new Error(`Unknown OAI-compatible model: ${model.id}`);
    }
    logDebug(`Provider model mapping: requested=${model.id}, configured=${config.id}, public=${publicModelId(config)}, name=${config.name || config.id}.`);

    const apiKey = await getApiKey(this.context, config, false);
    if (apiKey === undefined) {
      throw new Error('API key prompt was cancelled.');
    }

    const preparedMessages = await prepareCopilotMessages(config, messages);
    const request = buildChatRequest(config, preparedMessages, options);
    const toolContext = buildToolContext(options?.tools);
    const startedAt = Date.now();
    logDebug(`Provider request started: ${config.name || config.id} -> ${upstreamDisplayUrl(config)}`);
    logDebug('Provider request shape', {
      model: request.model,
      stream: request.stream,
      messages: request.messages.length,
      tools: Array.isArray(request.tools) ? request.tools.length : 0
    });
    if (Array.isArray(request.tools) && request.tools.length > 0) {
      const toolSizes = request.tools.map(t => `${t.function?.name || '?'}(${JSON.stringify(t).length}ch)`).join(', ');
      const totalChars = request.tools.reduce((s, t) => s + JSON.stringify(t).length, 0);
      logDebug(`Tool definitions: ${request.tools.length} tools, ${formatNumber(totalChars)} chars total. Sizes: ${toolSizes}`);
    }
    const msgChars = request.messages.reduce((s, m) => s + JSON.stringify(m).length, 0);
    logDebug(`Message payload: ${request.messages.length} messages, ${formatNumber(msgChars)} chars total.`);

    try {
      let result = await sendOaiUpstream(config, apiKey, request, {
        onText: (text) => progress.report(new vscode.LanguageModelTextPart(text)),
        onToolCall: (call) => reportToolCall(progress, call, toolContext)
      }, token);
      if (isEmptyAssistantResult(result) && request.stream) {
        logDebug(`Provider request returned an empty streaming response for ${config.name || config.id}; retrying once without streaming.`);
        const retryRequest = { ...request, stream: false };
        delete retryRequest.stream_options;
        result = await sendOaiUpstream(config, apiKey, retryRequest, {
          onText: (text) => progress.report(new vscode.LanguageModelTextPart(text)),
          onToolCall: (call) => reportToolCall(progress, call, toolContext)
        }, token);
      }

      if (isEmptyAssistantResult(result)) {
        const reasoningChars = String(result.assistantMessage?.reasoning_content || '').length;
        throw new Error(`Upstream returned an empty assistant response (text=0, tool_calls=0, reasoning=${reasoningChars}).`);
      }

      recordUsage(config.id, 'oai-provider', result.usage, result.completionText.length, Date.now() - startedAt, config.providerId);
      logCacheMetrics(result.usage, config.name || config.id, Date.now() - startedAt);
      logDebug(`Provider request finished: ${config.name || config.id} in ${Date.now() - startedAt}ms. ${formatResultShape(result)}`);
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
  if (providerDisposable) {
    return;
  }
  chatProvider = new OaiCompatibleChatProvider(context);
  providerDisposable = vscode.lm.registerLanguageModelChatProvider(VENDOR, chatProvider);
  context.subscriptions.push(providerDisposable);
}

async function refreshProvider() {
  if (!extensionContext || !vscode.lm?.registerLanguageModelChatProvider) {
    return;
  }

  vscode.commands.executeCommand('workbench.action.chat.refreshModels').then(undefined, () => undefined);
  chatProvider?.refreshModelPicker();
  logInfo(`Provider refreshed v${EXTENSION_VERSION}. Registered ${getModels().length} OAI-compatible model(s).`);
}

function getConfig() {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

function getModels() {
  return getConfig().get('models', []).filter((model) => model && model.id && (model.providerId || model.baseUrl));
}

function modelVisibleInPicker(model) {
  return model?.showInModelPicker !== false
    && model?.isUserSelectable !== false
    && model?.visible !== false
    && model?.hidden !== true;
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
      apiMode: model.apiMode || inferApiMode(model.baseUrl) || 'openai',
      headers: model.headers || {}
    });
  }

  return [...configured, ...derived];
}

function findConfiguredModel(modelId) {
  const normalizedId = normalizeIncomingModelId(modelId);
  const model = getModels().find((item) => {
    const rawId = normalizeIncomingModelId(item.id);
    const publicId = normalizeIncomingModelId(publicModelId(item));
    const legacyId = normalizeIncomingModelId(legacyPublicModelId(item));
    const name = normalizeIncomingModelId(item.name);
    return publicId === normalizedId || legacyId === normalizedId || rawId === normalizedId || name === normalizedId;
  });
  return model ? resolveModel(model) : undefined;
}

function normalizeIncomingModelId(modelId) {
  return String(modelId || '').replace(new RegExp(`^${escapeRegExp(VENDOR)}/`), '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function modelPickerDetail(model) {
  const parts = ['Matrix OAI Compatible'];
  if (supportsCopilotThinkingPicker(model)) {
    parts.push(copilotThinkingEffortLabel(getConfiguredCopilotThinkingEffort()));
  }
  return parts.join('  ');
}

function supportsCopilotThinkingPicker(model) {
  return isDeepSeekModel(model) || Boolean(model?.thinking || model?.reasoning_effort || model?.enable_thinking !== undefined);
}

function copilotThinkingConfigurationSchema(model) {
  const defaultValue = getConfiguredCopilotThinkingEffort() === 'model'
    ? copilotReasoningEffortForModel(model)
    : getConfiguredCopilotThinkingEffort();
  return {
    type: 'object',
    properties: {
      reasoningEffort: {
        type: 'string',
        title: 'Thinking Effort',
        description: 'Select reasoning depth for this Matrix OAI model.',
        default: defaultValue,
        enum: ['none', 'high', 'max'],
        enumItemLabels: ['None', 'High', 'Max']
      }
    }
  };
}

function copilotReasoningEffortForModel(model) {
  const raw = String(model?.reasoning_effort || model?.reasoningEffort || 'high').toLowerCase();
  if (raw === 'max' || raw === 'xhigh') return 'max';
  if (raw === 'none' || raw === 'off' || raw === 'disabled' || raw === 'minimal') return 'none';
  return 'high';
}

function copilotThinkingEffortLabel(value) {
  const effort = String(value || 'model').toLowerCase();
  if (effort === 'none') return 'None';
  if (effort === 'max') return 'Max';
  if (effort === 'high') return 'High';
  return 'Model';
}

function getConfiguredCopilotThinkingEffort(options) {
  const local = options?.modelConfiguration?.reasoningEffort
    || options?.configuration?.reasoningEffort
    || options?.modelOptions?.reasoningEffort;
  if (local) {
    return String(local).toLowerCase();
  }
  return String(getConfig().get('copilot.thinkingEffort', 'model') || 'model').toLowerCase();
}

function publicModelId(model) {
  return stableModelId(model);
}

function stableModelId(model) {
  const modelPart = safeId(model.id);
  const models = getConfig().get('models', []).filter((item) => item && item.id);
  const sameIdCount = models.filter((item) => safeId(item.id) === modelPart).length;
  if (sameIdCount <= 1) {
    return modelPart;
  }
  const providerPart = safeId(model.providerId || (model.baseUrl ? safeId(model.baseUrl) : 'default'));
  return `${providerPart}-${modelPart}`;
}

function legacyPublicModelId(model) {
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

function upstreamDisplayUrl(config) {
  if (isOllamaApi(config)) {
    return ollamaApiUrl(config.baseUrl);
  }
  return chatCompletionsUrl(config.baseUrl);
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

async function findSiblingApiKey(configured) {
  // Try to find an API key from a provider sharing the same base domain
  // e.g. "deepseek-anthropic" (no key) can fall back to "deepseek" (has key) since both are api.deepseek.com
  try {
    const url = new URL(configured.baseUrl || '');
    const domain = url.hostname;
    const providers = getProviders();
    for (const provider of providers) {
      if (provider.id === (configured.providerId || configured.id)) continue;
      try {
        const pUrl = new URL(provider.baseUrl || '');
        if (pUrl.hostname === domain) {
          const key = await extensionContext.secrets.get(secretKeyFor(provider));
          if (key) {
            logInfo(`Found sibling API key from provider "${provider.id}" (same domain: ${domain})`);
            return key;
          }
        }
      } catch { /* skip invalid URL */ }
    }
    // Also try global key
    const global = await extensionContext.secrets.get(GLOBAL_API_KEY);
    if (global) {
      logInfo(`Using global API key as fallback for ${configured.providerId || configured.id}`);
      return global;
    }
  } catch { /* skip */ }
  return undefined;
}

function buildChatRequest(config, messages, options) {
  // Build body with stable keys (model, tools) BEFORE variable keys (messages)
  // so that tools become part of the JSON prefix that DeepSeek can cache across turns.
  const body = {
    model: config.upstreamModelId || config.id,
    stream: getConfig().get('stream', true)
  };

  const tools = convertTools(options?.tools);
  if (tools.length > 0 && config.supportsTools !== false) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  // Messages go LAST — they change every turn, so anything after them would miss cache.
  body.messages = convertVsCodeMessagesToOpenAi(messages, config);
  const upstreamImageParts = countOpenAiImageParts(body.messages);
  if (upstreamImageParts > 0) {
    logInfo(`Provider request still contains ${upstreamImageParts} OpenAI image part(s) for ${config.name || config.id}.`);
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

  return prepareUpstreamRequest(config, body, options);
}

function prepareUpstreamRequest(config, body, options) {
  const requested = { ...body };
  if (config.upstreamModelId) {
    requested.model = config.upstreamModelId;
  }
  if (typeof config.stream === 'boolean') {
    requested.stream = config.stream;
  }
  if (config.omitUnsupportedParameters) {
    const minimal = {
      model: requested.model,
      stream: requested.stream,
      messages: requested.messages
    };
    if (requested.tools !== undefined) {
      minimal.tools = requested.tools;
    }
    if (requested.tool_choice !== undefined) {
      minimal.tool_choice = requested.tool_choice;
    }
    return minimal;
  }
  const withDefaults = applyModelDefaultParameters(config, requested, options);
  return {
    ...withDefaults,
    messages: enrichMessagesForReasoningReplay(config, withDefaults.messages)
  };
}

function applyModelDefaultParameters(config, body, options) {
  const next = { ...body };
  const configuredMaxTokens = config.max_tokens ?? config.maxTokens;
  if (next.max_tokens === undefined && typeof configuredMaxTokens === 'number') {
    next.max_tokens = configuredMaxTokens;
  }

  for (const key of MODEL_DEFAULT_PARAMETER_KEYS) {
    if (next[key] === undefined && config[key] !== undefined && config[key] !== null) {
      next[key] = config[key];
    }
  }

  applyCopilotThinkingEffort(config, next, options);
  return next;
}

function applyCopilotThinkingEffort(config, body, options) {
  if (!supportsCopilotThinkingPicker(config)) {
    return;
  }

  const effort = getConfiguredCopilotThinkingEffort(options);
  if (effort === 'model') {
    return;
  }

  if (effort === 'none') {
    delete body.reasoning_effort;
    body.enable_thinking = false;
    body.thinking = { type: 'disabled' };
    return;
  }

  if (effort === 'max') {
    body.reasoning_effort = 'max';
    body.enable_thinking = true;
    body.thinking = { type: 'enabled' };
    return;
  }

  body.reasoning_effort = 'high';
  body.enable_thinking = true;
  body.thinking = { type: 'enabled' };
}

function isDeepSeekModel(config) {
  return [config?.id, config?.name, config?.family, config?.providerId]
    .some((value) => String(value || '').toLowerCase().includes('deepseek'));
}

async function prepareCopilotMessages(config, messages) {
  const imageParts = countVsCodeImageParts(messages);
  const supportsImages = modelSupportsImages(config);
  const visionProxyEnabled = getConfig().get('copilot.enableVisionProxy', true);

  if (imageParts > 0) {
    logInfo(`Provider request has ${imageParts} VS Code image part(s) for ${config.name || config.id}; supportsImages=${supportsImages}; visionProxy=${visionProxyEnabled}.`);
  }

  if (supportsImages || !visionProxyEnabled || imageParts === 0) {
    return messages;
  }

  logInfo(`Vision proxy will describe ${imageParts} image part(s) before sending to ${config.name || config.id}.`);
  return describeImagesForTextModel(messages);
}

function messagesContainImages(messages) {
  return countVsCodeImageParts(messages) > 0;
}

function countVsCodeImageParts(messages) {
  let count = 0;
  for (const message of messages || []) {
    for (const part of message.content || []) {
      if (isImageDataPart(part)) {
        count++;
      }
    }
  }
  return count;
}

function isImageDataPart(part) {
  return Boolean(part?.data && String(part.mimeType || '').startsWith('image/'));
}

function modelSupportsImages(model) {
  if (!model) {
    return false;
  }
  if (model.supportsImages === true || model.supportsImageInput === true || model.supportsVision === true || model.vision === true) {
    return true;
  }
  if (model.capabilities?.imageInput === true || model.capabilities?.vision === true) {
    return true;
  }
  if (model.supports_image_detail_original === true) {
    return true;
  }
  const modalities = [
    ...(Array.isArray(model.input_modalities) ? model.input_modalities : []),
    ...(Array.isArray(model.inputModalities) ? model.inputModalities : []),
    ...(Array.isArray(model.modalities) ? model.modalities : [])
  ];
  return modalities.some((value) => String(value || '').toLowerCase() === 'image');
}

async function describeImagesForTextModel(messages) {
  const result = [];
  for (const message of messages || []) {
    const content = [];
    for (const part of message.content || []) {
      if (!isImageDataPart(part)) {
        content.push(part);
        continue;
      }
      const description = await describeImagePart(part);
      content.push(new vscode.LanguageModelTextPart(`\n[Image description]\n${description}\n[/Image description]\n`));
    }
    result.push(new vscode.LanguageModelChatMessage(message.role, content));
  }
  return result;
}

async function describeImagePart(part) {
  const cacheKey = imageDescriptionCacheKey(part);
  const cached = imageDescriptionCache.get(cacheKey);
  if (cached !== undefined) {
    logDebug(`Vision proxy cache hit for image (${cacheKey.slice(0, 12)}...).`);
    return cached;
  }

  const target = await selectVisionProxyTarget();
  if (!target) {
    logInfo('Vision proxy requested, but no image-capable Matrix OAI or VS Code model is available.');
    return 'Image input was provided, but no vision proxy model is available to describe it.';
  }
  logInfo(`Vision proxy target selected: ${target.value} (${target.label}).`);

  // Retry up to 3 times when the vision model returns an empty/error result
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 800;
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logInfo(`Vision proxy describing image with ${target.value} (${target.label}) attempt ${attempt}/${MAX_RETRIES}.`);
      let description;
      if (target.kind === 'configured-oai') {
        description = await describeImageWithConfiguredModel(target.model, part);
      } else {
        description = await describeImageWithVsCodeModel(target.model, part);
      }

      if (isVisionErrorFallback(description)) {
        if (attempt < MAX_RETRIES) {
          logInfo(`Vision proxy attempt ${attempt} returned empty, retrying after ${RETRY_DELAY_MS}ms...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        logInfo(`Vision proxy all ${MAX_RETRIES} attempts returned empty, giving up.`);
        return description;
      }

      // Successful description — cache and return
      imageDescriptionCache.set(cacheKey, description);
      while (imageDescriptionCache.size > MAX_IMAGE_DESC_CACHE_ENTRIES) {
        const firstKey = imageDescriptionCache.keys().next().value;
        imageDescriptionCache.delete(firstKey);
      }
      persistVisionCache();

      logInfo(`Vision proxy description result (${cacheKey.slice(0, 12)}..., ${description.length} chars, cached): ${description.slice(0, 500)}`);
      return description;
    } catch (error) {
      lastError = error;
      logError(`Vision proxy attempt ${attempt}/${MAX_RETRIES} failed with ${target.value}`, error);
      if (attempt < MAX_RETRIES) {
        logInfo(`Retrying after ${RETRY_DELAY_MS}ms...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  // All attempts exhausted
  return `Image input was provided, but the configured vision proxy failed: ${lastError?.message || String(lastError)}`;
}

function imageDescriptionCacheKey(part) {
  const bytes = part.data instanceof Uint8Array ? part.data : new Uint8Array(part.data);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function describeImageWithVsCodeModel(model, part) {
  let text = '';
  const timeoutSeconds = getConfig().get('copilot.visionProxyTimeoutSeconds', 45);
  const message = new vscode.LanguageModelChatMessage(vscode.LanguageModelChatMessageRole.User, [
    new vscode.LanguageModelTextPart('Describe concisely for a coding assistant: text, UI state, errors, filenames, code.'),
    part
  ]);
  await withTimeout(
    sendVsCodeModelRequest(model, [message], { modelOptions: { max_tokens: 800 } }, {
      onText: (chunk) => { text += chunk; },
      onToolCall: () => {}
    }),
    timeoutSeconds,
    `VS Code vision proxy timed out after ${timeoutSeconds}s`
  );
  return text.trim() || 'The vision proxy returned an empty image description.';
}

async function describeImageWithConfiguredModel(model, part) {
  const image = dataPartToImageContent(part);
  if (!image) {
    return 'Image input could not be converted for the configured vision proxy model.';
  }

  const apiKey = await getApiKey(extensionContext, model, false);
  if (apiKey === undefined) {
    return 'Vision proxy API key prompt was cancelled.';
  }

  let text = '';
  const body = prepareUpstreamRequest(model, {
    model: model.id,
    stream: false,
    think: false,
    max_tokens: Number(model.visionProxyMaxTokens || 1200),
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Describe concisely for a coding assistant: text, UI state, errors, filenames, code.'
        },
        image
      ]
    }]
  });

  const timeoutSeconds = getConfig().get('copilot.visionProxyTimeoutSeconds', 45);
  const proxyModel = {
    ...model,
    requestTimeoutSeconds: timeoutSeconds
  };
  const result = await sendOaiUpstream(proxyModel, apiKey || '', body, {
    onText: (chunk) => { text += chunk; },
    onToolCall: () => {}
  });
  return (text || result.completionText || '').trim() || 'The configured Matrix OAI vision proxy returned an empty image description.';
}

async function selectVisionProxyTarget() {
  const wanted = String(getConfig().get('copilot.visionProxyModel', '') || '').trim().toLowerCase();
  const candidates = [
    ...configuredVisionProxyTargets(),
    ...await vscodeVisionProxyTargets()
  ];

  if (wanted) {
    const matched = candidates.find((target) => visionProxyTargetMatches(target, wanted));
    if (matched) {
      return matched;
    }
    logInfo(`Configured vision proxy "${wanted}" was not found; falling back to Auto.`);
  }

  return candidates[0];
}

function configuredVisionProxyTargets() {
  return getModels()
    .map((model) => resolveModel(model))
    .filter((model) => modelSupportsImages(model))
    .map((model) => {
      const publicId = publicModelId(model);
      return {
        kind: 'configured-oai',
        value: `matrix:${publicId}`,
        label: model.name || model.id,
        description: `${model.providerId || 'provider'} Matrix OAI provider`,
        detail: model.id,
        model
      };
    });
}

async function vscodeVisionProxyTargets() {
  const models = await vscode.lm.selectChatModels();
  return models
    .filter((model) => String(model.vendor || '').toLowerCase() !== VENDOR)
    .filter((model) => modelSupportsImages(model))
    .map((model) => ({
      kind: 'vscode-lm',
      value: `vscode:${model.id}`,
      label: model.name || model.id,
      description: `${model.vendor || 'vscode-lm'} ${model.family || ''}`.trim(),
      detail: model.id,
      model
    }));
}

function visionProxyTargetMatches(target, wanted) {
  const values = [
    target.value,
    target.detail,
    target.label,
    target.model?.id,
    target.model?.name,
    target.model?.family,
    target.model?.version
  ];
  if (target.kind === 'configured-oai') {
    values.push(publicModelId(target.model), `matrix:${publicModelId(target.model)}`);
  }
  return values.some((value) => {
    const text = String(value || '').toLowerCase();
    return text === wanted || text.includes(wanted);
  });
}

function countOpenAiImageParts(messages) {
  let count = 0;
  for (const message of messages || []) {
    if (!Array.isArray(message?.content)) {
      continue;
    }
    for (const part of message.content) {
      if (part?.type === 'image_url' || part?.type === 'input_image' || part?.type === 'image') {
        count++;
      }
    }
  }
  return count;
}

function withTimeout(promise, timeoutSeconds, message) {
  let timeoutId;
  const timeout = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), Math.max(Number(timeoutSeconds || 45), 5) * 1000);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function convertVsCodeMessagesToOpenAi(messages, config) {
  const converted = [];
  const toolCallNamesById = new Map();

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
        toolCallNamesById.set(part.callId, part.name);
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
        const content = toolResultToText(part);
        const toolName = part.toolName || part.name || toolCallNamesById.get(part.callId) || 'unknown';
        logDebug(`Converted tool result: callId=${part.callId}, tool=${toolName}, chars=${content.length}, preview=${JSON.stringify(content.slice(0, 500))}.`);
        converted.push({
          role: 'tool',
          tool_call_id: part.callId,
          name: toolName,
          tool_name: toolName,
          content
        });
        continue;
      }

      const image = dataPartToImageContent(part);
      if (image) {
        contentParts.push(image);
      }
    }

    if (role === 'assistant' && toolCalls.length > 0) {
      converted.push(enrichAssistantMessageForReasoningReplay(config, {
        role,
        content: textParts.join('') || null,
        tool_calls: toolCalls
      }));
      continue;
    }

    if (textParts.length > 0 || contentParts.length > 0) {
      converted.push(enrichAssistantMessageForReasoningReplay(config, {
        role,
        content: contentParts.some((part) => part.type !== 'text') ? contentParts : textParts.join('')
      }));
    }
  }

  return converted;
}

function enrichMessagesForReasoningReplay(config, messages) {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map((message) => enrichAssistantMessageForReasoningReplay(config, message));
}

function enrichAssistantMessageForReasoningReplay(config, message) {
  if (!message || message.role !== 'assistant' || !shouldReplayReasoningContent(config)) {
    return message;
  }

  if (Object.prototype.hasOwnProperty.call(message, 'reasoning_content')) {
    return message;
  }

  const remembered = reasoningCache.get(reasoningCacheKey(config, message));
  if (remembered !== undefined) {
    return {
      ...message,
      reasoning_content: remembered
    };
  }

  if (shouldUseEmptyReasoningFallback(config, message)) {
    return {
      ...message,
      reasoning_content: ''
    };
  }

  return message;
}

function shouldReplayReasoningContent(config) {
  const mode = String(config.thinkingFormat || config.reasoningContentMode || 'auto').toLowerCase();
  if (mode === 'none' || mode === 'off' || mode === 'disabled') {
    return false;
  }
  if (mode === 'deepseek' || mode === 'always') {
    return true;
  }

  const provider = String(config.providerId || config.provider?.id || '').toLowerCase();
  const baseUrl = String(config.baseUrl || '').toLowerCase();
  const modelId = String(config.id || '').toLowerCase();
  return provider.includes('deepseek') || baseUrl.includes('api.deepseek.com') || modelId.includes('deepseek');
}

function shouldUseEmptyReasoningFallback(config, message) {
  if (config.reasoningContentFallback === false) {
    return false;
  }
  return Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
}

function rememberReasoningTurn(config, assistantMessage) {
  if (!assistantMessage || !shouldReplayReasoningContent(config)) {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(assistantMessage, 'reasoning_content')) {
    return;
  }

  reasoningCache.set(reasoningCacheKey(config, assistantMessage), assistantMessage.reasoning_content || '');
  while (reasoningCache.size > MAX_REASONING_CACHE_ENTRIES) {
    const firstKey = reasoningCache.keys().next().value;
    reasoningCache.delete(firstKey);
  }
}

function reasoningCacheKey(config, message) {
  const payload = {
    providerId: config.providerId || config.provider?.id || '',
    model: config.id || '',
    content: normalizeMessageContentForCache(message.content),
    toolCalls: normalizeToolCallsForCache(message.tool_calls)
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function normalizeMessageContentForCache(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (content === null || content === undefined) {
    return '';
  }
  return JSON.stringify(content);
}

function normalizeToolCallsForCache(toolCalls) {
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  return toolCalls.map((call) => ({
    id: call?.id || '',
    type: call?.type || '',
    name: call?.function?.name || '',
    arguments: call?.function?.arguments || ''
  }));
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
  return part && typeof part.callId === 'string' && 'content' in part && !('input' in part);
}

function isCacheControlPart(part) {
  return part && String(part.mimeType || part.type || '').toLowerCase() === 'cache_control';
}

function isNonImageDataPart(part) {
  return part && part.data && part.mimeType && !String(part.mimeType || '').startsWith('image/');
}

function toolResultToText(part) {
  const content = Array.isArray(part.content) ? part.content : [part.content];
  return content.map((item) => safeContentToText(item)).join('');
}

function safeContentToText(item) {
  if (typeof item === 'string') {
    return item;
  }
  if (isTextPart(item)) {
    return item.value || '';
  }
  if (isCacheControlPart(item) || isNonImageDataPart(item)) {
    return '';
  }
  if (item?.type === 'text' || item?.type === 'input_text' || item?.type === 'output_text') {
    return item.text || '';
  }
  if (typeof item?.text === 'string' && !item.data && !item.mimeType) {
    return item.text;
  }
  if (Array.isArray(item?.content)) {
    return item.content.map((part) => safeContentToText(part)).join('');
  }
  if (typeof item?.content === 'string') {
    return item.content;
  }
  try {
    return JSON.stringify(item);
  } catch {
    return '';
  }
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

  // Sort by name so the JSON serialization is deterministic across sessions,
  // improving DeepSeek prefix cache hit rate when the same tools are registered
  // but in a different order.
  return tools
    .filter((tool) => tool && tool.name)
    .sort((a, b) => a.name.localeCompare(b.name))
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

function isOllamaApi(config) {
  return String(config.apiMode || config.provider?.apiMode || '').toLowerCase() === 'ollama';
}

function isAnthropicApi(config) {
  return String(config.apiMode || config.provider?.apiMode || '').toLowerCase() === 'anthropic';
}

function inferApiMode(baseUrl) {
  const url = String(baseUrl || '').toLowerCase();
  if (url.includes('/anthropic')) return 'anthropic';
  return undefined;
}

function anthropicMessagesUrl(baseUrl) {
  const clean = String(baseUrl || '').replace(/\/+$/, '');
  if (clean.endsWith('/v1/messages')) return clean;
  if (clean.endsWith('/messages')) return clean;
  if (clean.endsWith('/v1')) return `${clean}/messages`;
  // For Anthropic-style base URLs (e.g. https://api.deepseek.com/anthropic),
  // the SDK appends /v1/messages — so we do the same
  return `${clean}/v1/messages`;
}

function buildAnthropicHeaders(config, apiKey) {
  const defaultHeaders = getConfig().get('defaultHeaders', {});
  const headers = {
    'content-type': 'application/json',
    accept: 'text/event-stream, application/json',
    'anthropic-version': '2023-06-01',
    ...defaultHeaders,
    ...(config.headers || {})
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  return headers;
}

function ollamaApiUrl(baseUrl) {
  // Strip /v1 or /v1/ suffix if present (common OpenAI-compatible base URLs)
  const clean = String(baseUrl || '').replace(/\/+$/, '').replace(/\/v1\/?$/, '');
  if (clean.endsWith('/api/chat')) return clean;
  if (clean.endsWith('/api')) return `${clean}/chat`;
  return `${clean}/api/chat`;
}

function openAiMessageContentToOllama(content) {
  if (typeof content === 'string') {
    return { content, images: [] };
  }
  if (!Array.isArray(content)) {
    if (content && typeof content === 'object') {
      const safeText = safeContentToText(content);
      if (safeText) {
        return { content: safeText, images: [] };
      }
      try {
        return { content: JSON.stringify(content), images: [] };
      } catch {
        return { content: '', images: [] };
      }
    }
    return { content: String(content || ''), images: [] };
  }

  const text = [];
  const images = [];
  for (const part of content) {
    if (typeof part === 'string') {
      text.push(part);
      continue;
    }
    if (part?.type === 'text' || part?.type === 'input_text') {
      if (part.text) text.push(part.text);
      continue;
    }
    const image = extractOllamaImage(part);
    if (image) {
      images.push(image);
    }
  }

  return { content: text.join('\n'), images };
}

function extractOllamaImage(part) {
  const url = part?.image_url?.url || part?.url || '';
  if (typeof url !== 'string' || !url.startsWith('data:image/')) {
    return '';
  }
  const comma = url.indexOf(',');
  return comma >= 0 ? url.slice(comma + 1) : '';
}

function normalizeOllamaTools(tools) {
  return (tools || [])
    .filter((tool) => tool?.function?.name || tool?.name)
    .map((tool) => {
      const fn = tool.function || tool;
      return {
        type: 'function',
        function: {
          name: sanitizeOllamaToolName(fn.name),
          description: typeof fn.description === 'string' ? fn.description : '',
          parameters: fn.parameters || fn.inputSchema || {
            type: 'object',
            properties: {}
          }
        }
      };
    });
}

function normalizeOllamaMessageToolCalls(toolCalls) {
  return (toolCalls || []).map((call, index) => {
    const fn = call.function || call;
    return {
      id: call.id || `call_${index}`,
      function: {
        index,
        name: sanitizeOllamaToolName(fn.name),
        arguments: parseOllamaToolArguments(fn.arguments)
      }
    };
  });
}

function parseOllamaToolArguments(value) {
  if (value && typeof value === 'object') {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function buildOllamaMessages(messages, promptToolMode) {
  const cleanMessages = [];
  const toolCallNamesById = new Map();

  for (const msg of messages || []) {
    const converted = openAiMessageContentToOllama(msg.content);
    const role = normalizeOllamaRole(msg.role);
    const clean = { role, content: converted.content };

    if (converted.images.length > 0) {
      clean.images = converted.images;
    }

    if (role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const calls = normalizeOllamaMessageToolCalls(msg.tool_calls);
      for (let i = 0; i < calls.length; i++) {
        const raw = msg.tool_calls[i] || {};
        const call = calls[i];
        const id = raw.id || call.id;
        if (id && call.function?.name) {
          toolCallNamesById.set(id, call.function.name);
        }
      }

      if (promptToolMode) {
        clean.content = appendPromptToolCalls(clean.content, calls);
      } else {
        clean.tool_calls = calls;
      }
    }

    if (role === 'tool') {
      const name = sanitizeOllamaToolName(
        msg.tool_name || msg.name || toolCallNamesById.get(msg.tool_call_id) || 'tool_result'
      );
      if (promptToolMode) {
        clean.role = 'user';
        clean.content = formatPromptToolResult(name, clean.content);
      } else {
        clean.tool_name = name;
      }
    }

    cleanMessages.push(clean);
  }

  return cleanMessages;
}

function normalizeOllamaRole(role) {
  const value = String(role || 'user').toLowerCase();
  if (value === 'function') return 'tool';
  if (value === 'assistant' || value === 'system' || value === 'tool') return value;
  return 'user';
}

function sanitizeOllamaToolName(value) {
  return String(value || 'tool_result').replace(/[^A-Za-z0-9_-]/g, '_') || 'tool_result';
}

function appendPromptToolCalls(content, calls) {
  const rendered = (calls || []).map((call) => formatPromptToolCall(call)).filter(Boolean);
  if (!rendered.length) {
    return content || '';
  }
  return [content || '', ...rendered].filter(Boolean).join('\n');
}

function formatPromptToolCall(call) {
  const name = sanitizeOllamaToolName(call?.function?.name);
  if (!name) {
    return '';
  }
  return JSON.stringify({
    name,
    arguments: call.function?.arguments && typeof call.function.arguments === 'object'
      ? call.function.arguments
      : {}
  });
}

function formatPromptToolResult(name, content) {
  return `Tool result from ${sanitizeOllamaToolName(name)}:\n${String(content || '')}`;
}

function shouldUseOllamaPromptToolMode(config) {
  const configured = String(config.ollamaToolMode || getConfig().get('ollamaToolMode', 'auto') || 'auto').toLowerCase();
  if (configured === 'native') return false;
  if (configured === 'prompt' || configured === 'manual') return true;
  return false;
}

function isQwenModel(config) {
  const text = [
    config?.id,
    config?.name,
    config?.family,
    config?.version
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  return text.includes('qwen');
}

function buildOllamaToolPrompt(tools) {
  const definitions = (tools || []).map((tool) => ({
    name: sanitizeOllamaToolName(tool?.function?.name || tool?.name),
    description: sanitizeOllamaTemplateText(tool?.function?.description || tool?.description || ''),
    parameters: tool?.function?.parameters || tool?.inputSchema || { type: 'object', properties: {} }
  })).filter((tool) => tool.name);

  return [
    'You are connected to VS Code tools.',
    'When a tool is needed, reply with exactly one JSON object and no prose:',
    '{"name":"tool_name","arguments":{"key":"value"}}',
    'Do not answer with shell commands such as ls, dir, cat, or PowerShell when a matching tool exists.',
    'If no tool is needed, answer normally.',
    'Available tools:',
    JSON.stringify(definitions, null, 2)
  ].join('\n');
}

function buildOllamaNativeToolHint(tools) {
  const names = new Set((tools || [])
    .map((tool) => sanitizeOllamaToolName(tool?.function?.name || tool?.name))
    .filter(Boolean));
  const fileHints = [];
  if (names.has('list_dir')) fileHints.push('list_dir for listing directories');
  if (names.has('read_file')) fileHints.push('read_file for reading files');
  if (names.has('create_file')) fileHints.push('create_file for creating files');
  if (names.has('replace_string_in_file')) fileHints.push('replace_string_in_file for editing existing text');
  if (names.has('run_in_terminal')) fileHints.push('run_in_terminal for shell commands');

  return [
    'Use only the exact VS Code tool names supplied in the tools field.',
    'Do not invent generic tools such as file, list_files, list_file, shell, or run_subprocess.',
    fileHints.length > 0 ? `Common filesystem tools: ${fileHints.join('; ')}.` : '',
    'When a tool is needed, call one supplied tool with JSON arguments matching its schema.',
    'When answering from directory or file-list tool results, preserve every returned entry exactly.',
    'Do not omit hidden entries, Chinese names, or other non-ASCII paths from tool results.'
  ].filter(Boolean).join('\n');
}

function simplifyOllamaSchema(schema) {
  const properties = {};
  for (const [key, value] of Object.entries(schema?.properties || {})) {
    properties[key] = simplifyOllamaParameter(value);
  }

  const result = { type: 'object', properties };
  if (Array.isArray(schema?.required)) {
    result.required = schema.required.filter((key) => Object.prototype.hasOwnProperty.call(properties, key));
  }
  return result;
}

function simplifyOllamaParameter(schema) {
  const type = normalizeJsonSchemaType(schema?.type, schema);
  const simple = ['string', 'number', 'integer', 'boolean'].includes(type) ? type : 'string';
  const result = { type: simple };
  if (schema?.description) {
    result.description = sanitizeOllamaTemplateText(schema.description).slice(0, 200);
  }
  if (Array.isArray(schema?.enum) && schema.enum.every((value) => ['string', 'number', 'boolean'].includes(typeof value))) {
    result.enum = schema.enum.map((value) => typeof value === 'string' ? sanitizeOllamaTemplateText(value) : value).slice(0, 30);
  }
  return result;
}

function normalizeJsonSchemaType(type, schema) {
  const value = Array.isArray(type) ? type.find((item) => item && item !== 'null') : type;
  if (['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(value)) {
    return value;
  }
  if (schema?.properties && typeof schema.properties === 'object') {
    return 'object';
  }
  if (schema?.items) {
    return 'array';
  }
  return 'string';
}

function sanitizeOllamaTemplateText(value) {
  return String(value || '')
    .replace(/[{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function writeOllamaFailureDump(body, status, responseText) {
  try {
    const dir = extensionContext?.globalStorageUri?.fsPath || path.join(os.homedir(), '.matrix-oai-copilot');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'ollama-last-failed-request.json');
    fs.writeFileSync(file, JSON.stringify({
      status,
      response: String(responseText || '').slice(0, 4000),
      request: redactLargeOllamaPayload(body)
    }, null, 2), 'utf8');
    logInfo(`Ollama failed request dump written: ${file}`);
  } catch (error) {
    logError('Failed to write Ollama request dump', error);
  }
}

function redactLargeOllamaPayload(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactLargeOllamaPayload(item));
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'images' && Array.isArray(item)) {
        result[key] = item.map((image) => `[image:${String(image || '').length}]`);
      } else {
        result[key] = redactLargeOllamaPayload(item);
      }
    }
    return result;
  }
  if (typeof value === 'string' && value.length > 2000) {
    return `${value.slice(0, 2000)}...[${value.length} chars]`;
  }
  return value;
}

async function sendOllamaUpstream(config, apiKey, body, sink, token) {
  const controller = new AbortController();
  const disposables = [];
  let timeoutId;
  let timedOut = false;

  if (token) {
    disposables.push(token.onCancellationRequested(() => controller.abort()));
  }

  const timeoutSeconds = upstreamTimeoutSeconds(config);
  timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(timeoutSeconds, 10) * 1000);

  // Build clean Ollama native /api/chat request body
  // Strip any reasoning/thinking fields from messages — Ollama's PARSER qwen3.5 handles tool templates
  const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
  const promptToolMode = hasTools && shouldUseOllamaPromptToolMode(config);
  const normalizedTools = hasTools ? normalizeOllamaTools(body.tools) : [];
  const cleanMessages = buildOllamaMessages(body.messages || [], promptToolMode);
  if (promptToolMode && normalizedTools.length > 0) {
    cleanMessages.unshift({
      role: 'system',
      content: buildOllamaToolPrompt(normalizedTools)
    });
  } else if (normalizedTools.length > 0) {
    cleanMessages.unshift({
      role: 'system',
      content: buildOllamaNativeToolHint(normalizedTools)
    });
  }

  const ollamaBody = {
    model: body.model,
    messages: cleanMessages,
    stream: body.stream !== false,
    options: {}
  };

  // When tools are available, disable streaming so the full response text can be
  // inspected — qwen3.5 may emit tool calls as text JSON rather than structured tool_calls
  // Only copy safe numeric options, skip thinking/stream/response_format
  if (body.temperature !== undefined) ollamaBody.options.temperature = body.temperature;
  if (body.top_p !== undefined) ollamaBody.options.top_p = body.top_p;
  if (body.top_k !== undefined) ollamaBody.options.top_k = body.top_k;
  if (body.max_tokens !== undefined) ollamaBody.options.num_predict = body.max_tokens;
  if (body.think !== undefined) ollamaBody.think = Boolean(body.think);

  // Pass tools through as-is — Ollama RENDERER qwen3.5 handles the template internally
  if (!promptToolMode && normalizedTools.length > 0) {
    ollamaBody.tools = normalizedTools;
  }

  if (hasTools) {
    const toolNames = normalizedTools.map((tool) => tool.function?.name).filter(Boolean).join(', ');
    logInfo(`Ollama tool mode: ${promptToolMode ? 'prompt' : 'native'} for ${config.name || config.id}; tools=${normalizedTools.length}.`);
    logDebug(`Ollama tools for ${config.name || config.id}: ${toolNames || '(none)'}.`);
  }

  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  logDebug('Sending Ollama native request', {
    model: ollamaBody.model,
    stream: ollamaBody.stream,
    messages: (ollamaBody.messages || []).length,
    tools: normalizedTools.length,
    toolMode: promptToolMode ? 'prompt' : 'native'
  });

  try {
    const response = await fetch(ollamaApiUrl(config.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(ollamaBody),
      signal: controller.signal
    });

    if (response.ok) {
      logDebug(`Ollama response: ${response.status}`);
    } else {
      logInfo(`Ollama response: ${response.status}`);
    }
    if (!response.ok) {
      const text = await response.text();
      writeOllamaFailureDump(ollamaBody, response.status, text);
      throw new Error(formatUpstreamError(response.status, text));
    }

    const contentType = response.headers.get('content-type') || '';

    // Ollama streaming: SSE with complete JSON per line (not "data: ..." format)
    if (ollamaBody.stream && (contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson'))) {
      return await consumeOllamaSse(response, sink, token);
    }

    const json = await response.json();
    return convertOllamaResponse(json, sink);
  } catch (error) {
    if (timedOut) {
      throw new Error(`Ollama request timed out after ${timeoutSeconds}s.`);
    }
    if (error?.name === 'AbortError') {
      const reason = token?.isCancellationRequested ? 'cancelled by VS Code' : 'aborted before the Ollama response completed';
      throw new Error(`Ollama request ${reason}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    for (const disposable of disposables) {
      disposable.dispose();
    }
  }
}

function convertOllamaResponse(json, sink) {
  const msg = json?.message || {};
  const content = String(msg.content || '');
  const ollamaToolCalls = msg.tool_calls || [];

  // Normalize Ollama tool_calls to OpenAI format
  let toolCalls = ollamaToolCalls.map((tc, idx) => ({
    id: tc.id || `call_ollama_${idx}`,
    type: tc.type || 'function',
    function: {
      name: tc.function?.name || '',
      arguments: typeof tc.function?.arguments === 'object'
        ? JSON.stringify(tc.function.arguments)
        : String(tc.function?.arguments || '{}')
    }
  }));

  // Fallback: if no structured tool_calls but content is JSON with tool/name, parse it
  if (toolCalls.length === 0 && content) {
    const parsed = tryParseTextToolCall(content);
    if (parsed) {
      toolCalls = [parsed];
    }
  }

  // Fallback: map common shell commands to tool calls (e.g. "Get-ChildItem -Force")
  if (toolCalls.length === 0 && content) {
    const mapped = tryMapCommandToToolCall(content);
    if (mapped) {
      toolCalls = [mapped];
    }
  }

  if (toolCalls.length > 0) {
    for (const call of toolCalls) sink.onToolCall(call);
  } else if (content) {
    sink.onText(content);
  }

  const usage = {
    prompt_tokens: json.prompt_eval_count || 0,
    completion_tokens: json.eval_count || 0,
    total_tokens: (json.prompt_eval_count || 0) + (json.eval_count || 0)
  };

  return {
    completionText: toolCalls.length ? '' : content,
    usage,
    assistantMessage: {
      role: 'assistant',
      content: toolCalls.length ? null : (content || null),
      reasoning_content: msg.reasoning || msg.reasoning_content || msg.thinking || '',
      tool_calls: toolCalls
    }
  };
}

function legacyOldTryParseTextToolCall(text) {
  // Try to locate and parse a JSON object in the text
  const trimmed = text.trim();
  
  // Try parsing entire content as JSON
  let obj;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    // Try extracting JSON from code block
    const blockMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (blockMatch) {
      try { obj = JSON.parse(blockMatch[1]); } catch { return null; }
    } else {
      // Try finding any JSON object in text
      const jsonMatch = trimmed.match(/\{(?:[^{}]|(\{[^{}]*\}))*\}/);
      if (jsonMatch) {
        try { obj = JSON.parse(jsonMatch[0]); } catch { return null; }
      }
    }
  }
  
  if (!obj || typeof obj !== 'object') return null;
  
  // Extract function name — check multiple possible keys
  const name = obj.tool || obj.name || obj.function_name || obj.action || obj.command
    || obj.function?.name || '';
  if (!name) return null;
  
  // Build arguments from remaining fields
  const nameKeys = new Set(['tool', 'name', 'function', 'type', 'id', 'callId',
    'tool_call_id', 'index', 'function_name', 'action', 'command', 'arguments',
    'parameters', 'params', 'args']);
  const args = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!nameKeys.has(key)) {
      args[key] = value;
    }
  }
  
  return {
    id: `call_parsed_${Date.now()}`,
    type: 'function',
    function: {
      name: String(name),
      arguments: JSON.stringify(args)
    }
  };
}

// Map common shell commands to tool call objects
// Used when the model outputs a command string instead of a structured tool call
const COMMAND_TO_TOOL = [
  {
    // PowerShell: Get-ChildItem -Force, Get-ChildItem -Recurse, etc.
    regex: /^Get-ChildItem\s/i,
    tool: 'list_files',
    args: (text) => {
      const args = { path: '.', recursive: false };
      if (/-(?:R|Recurse|Recurse\b)/i.test(text)) args.recursive = true;
      const pathMatch = text.match(/(?:-Path\s+['\"]?|['\"]?)([A-Za-z]:\\[^\s'"]+)/);
      if (pathMatch) args.path = pathMatch[1];
      return args;
    }
  },
  {
    // ls, ls -la, ls -R, ls /path
    regex: /^ls\b/i,
    tool: 'list_files',
    args: (text) => {
      const args = { path: '.', recursive: false };
      if (/-R/i.test(text)) args.recursive = true;
      const parts = text.trim().split(/\s+/);
      const nonFlag = parts.find((p) => !p.startsWith('-') && !/^ls$/i.test(p));
      if (nonFlag) args.path = nonFlag;
      return args;
    }
  },
  {
    // dir /s, dir /b
    regex: /^dir\b/i,
    tool: 'list_files',
    args: (text) => {
      const args = { path: '.', recursive: false };
      if (/\/s/i.test(text)) args.recursive = true;
      const parts = text.trim().split(/\s+/);
      const nonFlag = parts.find((p) => !p.startsWith('/') && !/^dir$/i.test(p));
      if (nonFlag) args.path = nonFlag;
      return args;
    }
  },
  {
    // tree
    regex: /^tree\b/i,
    tool: 'list_files',
    args: () => ({ path: '.', recursive: true })
  },
  {
    // pwd
    regex: /^pwd\b/i,
    tool: 'run_in_terminal',
    args: () => ({ command: 'pwd' })
  },
  {
    // cd path
    regex: /^cd\s/i,
    tool: 'run_in_terminal',
    args: (text) => ({ command: text.trim() })
  },
  {
    // cat, type, more
    regex: /^(cat|type|more|Get-Content)\s/i,
    tool: 'read_file',
    args: (text) => {
      const parts = text.trim().split(/\s+/);
      return { filePath: parts.slice(1).join(' ') || '.' };
    }
  }
];

function legacyOldTryMapCommandToToolCall(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const entry of COMMAND_TO_TOOL) {
    if (entry.regex.test(trimmed)) {
      return {
        id: `call_cmd_${Date.now()}`,
        type: 'function',
        function: {
          name: entry.tool,
          arguments: JSON.stringify(entry.args(trimmed))
        }
      };
    }
  }
  return null;
}

function parseJsonCandidate(text) {
  try {
    return JSON.parse(String(text || '').trim());
  } catch {
    return null;
  }
}

function extractBalancedJsonObjects(text) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = inString;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === '{') {
      if (depth === 0) {
        start = i;
      }
      depth++;
      continue;
    }
    if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function parseToolArgumentsObject(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return { value };
    }
  }
  return {};
}

function normalizeParsedToolCall(obj) {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const call = normalizeParsedToolCall(item);
      if (call) return call;
    }
    return null;
  }

  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj.tool_calls)) {
    return normalizeParsedToolCall(obj.tool_calls);
  }
  if (Array.isArray(obj.calls)) {
    return normalizeParsedToolCall(obj.calls);
  }

  const fn = obj.function && typeof obj.function === 'object' ? obj.function : {};
  const name = obj.tool || obj.name || obj.function_name || obj.action || fn.name || '';
  if (!name && obj.command) {
    return {
      id: `call_parsed_${Date.now()}`,
      type: 'function',
      function: {
        name: 'run_in_terminal',
        arguments: JSON.stringify({ command: String(obj.command) })
      }
    };
  }
  if (!name) return null;

  let args = parseToolArgumentsObject(obj.arguments ?? obj.parameters ?? obj.params ?? obj.args ?? fn.arguments);
  if (!args) {
    const nameKeys = new Set(['tool', 'name', 'function', 'type', 'id', 'callId',
      'tool_call_id', 'index', 'function_name', 'action', 'command', 'arguments',
      'parameters', 'params', 'args']);
    args = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!nameKeys.has(key)) {
        args[key] = value;
      }
    }
  }

  return {
    id: String(obj.id || obj.callId || obj.tool_call_id || `call_parsed_${Date.now()}`),
    type: 'function',
    function: {
      name: sanitizeOllamaToolName(name),
      arguments: JSON.stringify(args)
    }
  };
}

function commandCandidates(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  const candidates = [trimmed];
  for (const match of trimmed.matchAll(/```[^\n`]*\s*([\s\S]*?)\s*```/gi)) {
    candidates.push(match[1].trim());
  }
  for (const line of trimmed.split(/\r?\n/)) {
    const clean = line.trim().replace(/^[$>]\s*/, '');
    if (clean) candidates.push(clean);
  }
  return [...new Set(candidates)];
}

function tryParseTextToolCall(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  for (const match of trimmed.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi)) {
    candidates.unshift(match[1].trim());
  }
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)) {
    candidates.push(match[1].trim());
  }
  candidates.push(...extractBalancedJsonObjects(trimmed));

  for (const candidate of candidates) {
    const call = normalizeParsedToolCall(parseJsonCandidate(candidate));
    if (call) {
      return call;
    }
  }

  return tryParseToolInvocationText(trimmed);
}

function tryParseToolInvocationText(text) {
  for (const candidate of commandCandidates(text)) {
    const clean = candidate.trim().replace(/[。；;]+$/g, '');
    if (!clean) continue;

    const fnCall = clean.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*\(([\s\S]*)\)$/);
    if (fnCall) {
      return makeTextToolCall(fnCall[1], parseLooseToolArguments(fnCall[2], fnCall[1]));
    }

    const quotedArg = clean.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s+["']([^"']+)["']$/);
    if (quotedArg) {
      return makeTextToolCall(quotedArg[1], defaultToolArgumentsForName(quotedArg[1], quotedArg[2]));
    }

    if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(clean) && isLikelyBareToolName(clean)) {
      return makeTextToolCall(clean, defaultToolArgumentsForName(clean));
    }
  }
  return null;
}

function makeTextToolCall(name, args) {
  return {
    id: `call_text_${Date.now()}`,
    type: 'function',
    function: {
      name: sanitizeOllamaToolName(name),
      arguments: JSON.stringify(args || {})
    }
  };
}

function isLikelyBareToolName(name) {
  const lower = String(name || '').toLowerCase();
  return [
    'list_files',
    'list_file',
    'list_directory',
    'list_dir'
  ].includes(lower);
}

function defaultToolArgumentsForName(name, value) {
  const lower = String(name || '').toLowerCase();
  if (['list_files', 'list_file', 'list_directory', 'list_dir'].includes(lower)) {
    return { path: value || '.', recursive: false };
  }
  if (lower === 'read_file') {
    return { path: value || '.' };
  }
  if (['file_search', 'search_files'].includes(lower)) {
    return { query: value || '' };
  }
  return value ? { path: value } : {};
}

function parseLooseToolArguments(text, toolName) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return defaultToolArgumentsForName(toolName);
  }
  const quotedOnly = trimmed.match(/^["']([^"']+)["']$/);
  if (quotedOnly) {
    return defaultToolArgumentsForName(toolName, quotedOnly[1]);
  }

  const args = {};
  const re = /([A-Za-z_][A-Za-z0-9_-]*)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^,\s)]+))/g;
  let match;
  while ((match = re.exec(trimmed)) !== null) {
    args[match[1]] = parseLooseValue(match[2] ?? match[3] ?? match[4]);
  }
  if (Object.keys(args).length > 0) {
    return args;
  }
  return defaultToolArgumentsForName(toolName, trimmed);
}

function parseLooseValue(value) {
  const text = String(value || '');
  if (/^(true|false)$/i.test(text)) {
    return text.toLowerCase() === 'true';
  }
  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    return Number(text);
  }
  return text;
}

function tryMapCommandToToolCall(text) {
  for (const trimmed of commandCandidates(text)) {
    for (const entry of COMMAND_TO_TOOL) {
      if (entry.regex.test(trimmed)) {
        return {
          id: `call_cmd_${Date.now()}`,
          type: 'function',
          function: {
            name: entry.tool,
            arguments: JSON.stringify(entry.args(trimmed))
          }
        };
      }
    }
  }
  return null;
}

async function consumeOllamaSse(response, sink, token) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completionText = '';
  let reasoningText = '';
  let usage;
  let chunks = 0;
  const toolCalls = new Map();

  while (!token?.isCancellationRequested) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      // Handle both "data: {...}" and bare JSON lines (Ollama uses bare JSON)
      let data = line.trim();
      if (data.startsWith('data:')) data = data.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const chunk = JSON.parse(data);
        chunks++;
        const msg = chunk.message || {};
        const currentToolCalls = msg.tool_calls || chunk.tool_calls || [];
        appendOllamaToolCalls(toolCalls, currentToolCalls);

        if (chunk.done) {
          if (chunk.prompt_eval_count || chunk.eval_count) {
            usage = {
              prompt_tokens: chunk.prompt_eval_count || 0,
              completion_tokens: chunk.eval_count || 0,
              total_tokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0)
            };
          }
          continue;
        }

        if (msg.content) {
          completionText += msg.content;
          // Don't emit text yet — it might be a JSON tool call
        }
        if (msg.reasoning || msg.reasoning_content || msg.thinking) {
          const r = msg.reasoning || msg.reasoning_content || msg.thinking || '';
          reasoningText += r;
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  const toolCallList = [...toolCalls.values()];

  // After streaming finishes, try to parse accumulated text as a tool call JSON
  if (toolCallList.length === 0 && completionText) {
    let parsed = tryParseTextToolCall(completionText);
    if (!parsed) parsed = tryMapCommandToToolCall(completionText);
    if (parsed) {
      toolCallList.push(parsed);
    } else {
      // Not a tool call — emit as text now
      sink.onText(completionText);
    }
  }

  for (const call of toolCallList) {
    sink.onToolCall(call);
  }

  logDebug('Consumed Ollama SSE response', {
    chunks,
    reasoning: reasoningText.length > 0,
    toolCalls: toolCalls.size,
    usage
  });

  return {
    completionText,
    usage,
    assistantMessage: {
      role: 'assistant',
      content: completionText || null,
      reasoning_content: reasoningText,
      tool_calls: toolCallList
    }
  };
}

function appendOllamaToolCalls(toolCalls, incomingCalls) {
  for (let i = 0; i < (incomingCalls || []).length; i++) {
    const tc = incomingCalls[i];
    const fn = tc?.function || {};
    const key = tc.index ?? fn.index ?? tc.id ?? i;
    const existing = toolCalls.get(key) || {
      id: tc.id || `call_ollama_${key}`,
      type: 'function',
      function: { name: '', arguments: '' }
    };

    if (fn.name && !existing.function.name.includes(fn.name)) {
      existing.function.name += fn.name;
    }
    if (fn.arguments !== undefined) {
      existing.function.arguments = typeof fn.arguments === 'object'
        ? JSON.stringify(fn.arguments)
        : `${existing.function.arguments || ''}${String(fn.arguments || '')}`;
    }
    toolCalls.set(key, existing);
  }
}

async function sendOaiUpstream(config, apiKey, body, sink, token) {
  // Route to Ollama native API when configured
  if (isOllamaApi(config)) {
    return sendOllamaUpstream(config, apiKey, body, sink, token);
  }

  // Route to Anthropic native API (converts OpenAI format to Anthropic Messages format)
  if (isAnthropicApi(config)) {
    return sendAnthropicFromOpenAi(config, apiKey, body, sink, token);
  }

  const controller = new AbortController();
  const disposables = [];
  let timeoutId;
  let timedOut = false;
  let completionText = '';
  let usage;
  let assistantMessage;

  if (token) {
    disposables.push(token.onCancellationRequested(() => controller.abort()));
  }

  const timeoutSeconds = upstreamTimeoutSeconds(config);
  timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(timeoutSeconds, 10) * 1000);

  try {
    const headers = buildHeaders(config, apiKey);
    const upstreamUrl = chatCompletionsUrl(config.baseUrl);
    captureLastUpstreamRequest({
      kind: 'openai-chat-completions',
      url: upstreamUrl,
      method: 'POST',
      headers,
      body,
      modelConfig: {
        id: config.id,
        name: config.name,
        providerId: config.providerId,
        apiMode: config.apiMode || config.provider?.apiMode,
        upstreamModelId: config.upstreamModelId,
        omitUnsupportedParameters: Boolean(config.omitUnsupportedParameters)
      }
    });
    logDebug('Sending upstream OAI request', {
      model: body.model,
      stream: body.stream,
      hasApiKey: Boolean(apiKey),
      headers: Object.keys(headers).filter((key) => key.toLowerCase() !== 'authorization')
    });

    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    logInfo(`Upstream response: ${response.status} ${response.statusText || ''}`.trim());
    if (!response.ok) {
      const text = await response.text();
      updateLastUpstreamResponse(response, text);
      throw new Error(formatUpstreamError(response.status, text));
    }
    updateLastUpstreamResponse(response);

    const contentType = response.headers.get('content-type') || '';
    if (body.stream && contentType.includes('text/event-stream')) {
      const streamed = await consumeOaiSse(response, sink, token);
      completionText = streamed.completionText;
      usage = streamed.usage;
      assistantMessage = streamed.assistantMessage;
      rememberReasoningTurn(config, streamed.assistantMessage);
    } else {
      const jsonResult = await consumeOaiJson(response, sink);
      completionText = jsonResult.completionText;
      usage = jsonResult.usage;
      assistantMessage = jsonResult.assistantMessage;
      rememberReasoningTurn(config, jsonResult.assistantMessage);
    }

    return { completionText, usage, assistantMessage };
  } catch (error) {
    if (timedOut) {
      throw new Error(`Upstream request timed out after ${timeoutSeconds}s. Increase matrixOaiCopilot.requestTimeoutSeconds or the model's requestTimeoutSeconds for slow thinking models.`);
    }
    if (error?.name === 'AbortError') {
      const reason = token?.isCancellationRequested ? 'cancelled by VS Code' : 'aborted before the upstream response completed';
      throw new Error(`Upstream request ${reason}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    for (const disposable of disposables) {
      disposable.dispose();
    }
  }
}

// --- Anthropic upstream for /v1/chat/completions → Anthropic native API ---
function openAiToAnthropicBody(body, config) {
  const messages = [];
  let system = '';
  for (const msg of body.messages || []) {
    const content = openAiContentToText(msg.content);
    if (msg.role === 'system') { system += (system ? '\n\n' : '') + content; continue; }
    messages.push({ role: msg.role, content });
  }
  const result = { model: body.model || config.id, messages, max_tokens: body.max_tokens || 4096, stream: body.stream || false };
  if (system) { result.system = system; }
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    result.tools = body.tools.filter((t) => t.type === 'function' && t.function?.name).map((t) => ({
      name: t.function.name, description: t.function.description || '',
      input_schema: t.function.parameters || { type: 'object', properties: {} }
    }));
  }
  return result;
}

async function sendAnthropicFromOpenAi(config, apiKey, body, sink, token) {
  const anthropicBody = openAiToAnthropicBody(body, config);
  const upstreamUrl = anthropicMessagesUrl(config.baseUrl);
  const headers = buildAnthropicHeaders(config, apiKey);
  const controller = new AbortController();
  const timeoutSeconds = upstreamTimeoutSeconds(config);
  const timeoutId = setTimeout(() => controller.abort(), Math.max(timeoutSeconds, 10) * 1000);
  let timedOut = false;
  let completionText = '';
  let usage;

  try {
    if (token) { token.onCancellationRequested(() => controller.abort()); }
    const upstreamResponse = await fetch(upstreamUrl, { method: 'POST', headers, body: JSON.stringify(anthropicBody), signal: controller.signal });
    if (!upstreamResponse.ok) { const text = await upstreamResponse.text(); throw new Error(formatUpstreamError(upstreamResponse.status, text)); }
    const contentType = upstreamResponse.headers.get('content-type') || '';
    if (body.stream && contentType.includes('text/event-stream')) {
      const reader = upstreamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') { completionText += event.delta.text; sink.onText(event.delta.text); }
            if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') { /* accumulate tool */ }
            if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
              sink.onToolCall({ id: event.content_block.id, type: 'function', function: { name: event.content_block.name, arguments: '{}' } });
            }
            if (event.type === 'message_start' && event.message?.usage) { usage = { prompt_tokens: event.message.usage.input_tokens || 0, completion_tokens: event.message.usage.output_tokens || 0, total_tokens: (event.message.usage.input_tokens || 0) + (event.message.usage.output_tokens || 0) }; }
            if (event.type === 'message_delta' && event.usage) { usage = usage || {}; usage.completion_tokens = event.usage.output_tokens || usage.completion_tokens; usage.total_tokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0); }
          } catch { /* skip */ }
        }
      }
    } else {
      const json = await upstreamResponse.json();
      const textBlocks = (json.content || []).filter((b) => b.type === 'text');
      completionText = textBlocks.map((b) => b.text || '').join('');
      if (completionText) sink.onText(completionText);
      usage = json.usage ? { prompt_tokens: json.usage.input_tokens || 0, completion_tokens: json.usage.output_tokens || 0, total_tokens: (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0) } : undefined;
    }
    return { completionText, usage, assistantMessage: { role: 'assistant', content: completionText || null, reasoning_content: '', tool_calls: [] } };
  } catch (error) {
    if (timedOut) throw new Error(`Anthropic upstream timed out after ${timeoutSeconds}s.`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isEmptyAssistantResult(result) {
  return !String(result?.completionText || '').trim() && assistantToolCallCount(result) === 0;
}

function assistantToolCallCount(result) {
  return Array.isArray(result?.assistantMessage?.tool_calls) ? result.assistantMessage.tool_calls.length : 0;
}

function formatResultShape(result) {
  const textChars = String(result?.completionText || '').length;
  const toolCalls = assistantToolCallCount(result);
  const reasoningChars = String(result?.assistantMessage?.reasoning_content || '').length;
  return `text=${textChars}, tool_calls=${toolCalls}, reasoning=${reasoningChars}`;
}

function upstreamTimeoutSeconds(config) {
  return Number(config.requestTimeoutSeconds || getConfig().get('requestTimeoutSeconds', 120));
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

function captureLastUpstreamRequest(snapshot) {
  const bodyText = safeJsonStringify(snapshot.body);
  lastUpstreamRequestSnapshot = {
    capturedAt: new Date().toISOString(),
    extensionVersion: EXTENSION_VERSION,
    note: LAST_UPSTREAM_REQUEST_NOTE,
    kind: snapshot.kind,
    method: snapshot.method,
    url: snapshot.url,
    modelConfig: snapshot.modelConfig,
    headers: redactHeaders(snapshot.headers),
    body: safeJsonParse(redactSecrets(bodyText)) ?? redactSecrets(bodyText),
    bodyBytes: Buffer.byteLength(bodyText, 'utf8'),
    response: undefined
  };
}

function updateLastUpstreamResponse(response, text) {
  if (!lastUpstreamRequestSnapshot) {
    return;
  }

  lastUpstreamRequestSnapshot.response = {
    capturedAt: new Date().toISOString(),
    status: response.status,
    statusText: response.statusText || '',
    headers: redactHeaders(Object.fromEntries(response.headers.entries())),
    body: text === undefined ? undefined : redactSecrets(String(text)).slice(0, 5000)
  };
}

async function copyLastUpstreamRequestCommand() {
  if (!lastUpstreamRequestSnapshot) {
    vscode.window.showWarningMessage('No Matrix OAI upstream request has been captured yet. Reproduce the request once, then run this command again.');
    return;
  }

  const text = JSON.stringify(lastUpstreamRequestSnapshot, null, 2);
  await vscode.env.clipboard.writeText(text);
  output?.appendLine(`[${new Date().toISOString()}] [INFO] Last upstream request copied to clipboard (${Buffer.byteLength(text, 'utf8')} bytes).`);
  vscode.window.showInformationMessage('Matrix OAI: copied last upstream request to clipboard. Authorization is redacted.');
}

function redactHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    if (lower === 'authorization' || lower === 'x-api-key' || lower.includes('token') || lower.includes('secret')) {
      result[key] = '***REDACTED***';
    } else {
      result[key] = redactSecrets(String(value));
    }
  }
  return result;
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function formatUpstreamError(status, text) {
  const message = extractUpstreamErrorMessage(text) || String(text || '').trim();
  const clean = redactSecrets(message).replace(/\s+/g, ' ').slice(0, 1000);
  return `Upstream API returned ${status}${clean ? `: ${clean}` : ''}`;
}

function extractUpstreamErrorMessage(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message || parsed?.message || parsed?.detail || undefined;
  } catch {
    return undefined;
  }
}

function redactSecrets(value) {
  return String(value || '').replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***');
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
    hasReasoningContent: Object.prototype.hasOwnProperty.call(message, 'reasoning_content'),
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls.length : 0,
    usage: json.usage
  });

  return {
    completionText,
    usage: json.usage,
    assistantMessage: {
      role: 'assistant',
      content: message.content || null,
      reasoning_content: message.reasoning_content || '',
      tool_calls: message.tool_calls || []
    }
  };
}

async function consumeOaiSse(response, sink, token) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completionText = '';
  let reasoningText = '';
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
        const consumed = consumeOaiDelta(chunk, sink, toolCalls);
        completionText += consumed.text;
        reasoningText += consumed.reasoning;
      }
    }
  }

  const toolCallList = [...toolCalls.values()];
  for (const call of toolCallList) {
    sink.onToolCall(call);
  }

  logDebug('Consumed SSE response', {
    chunks,
    hasReasoningContent: reasoningText.length > 0,
    toolCalls: toolCalls.size,
    usage
  });
  return {
    completionText,
    usage,
    assistantMessage: {
      role: 'assistant',
      content: completionText || null,
      reasoning_content: reasoningText,
      tool_calls: toolCallList
    }
  };
}

function consumeOaiDelta(chunk, sink, toolCalls) {
  let text = '';
  let reasoning = '';
  for (const choice of chunk.choices || []) {
    const delta = choice.delta || {};

    if (delta.content) {
      text += delta.content;
      sink.onText(delta.content);
    }

    if (delta.reasoning_content) {
      reasoning += delta.reasoning_content;
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
  return { text, reasoning };
}

function reportToolCall(progress, call, toolContext) {
  let name = call?.function?.name;
  if (!name) {
    return;
  }

  let input = {};
  const rawArgs = call.function.arguments || '{}';
  if (rawArgs && typeof rawArgs === 'object') {
    input = rawArgs;
  } else {
    try {
      input = JSON.parse(rawArgs);
    } catch {
      input = { _raw: rawArgs };
    }
  }

  const normalized = normalizeToolCallForVsCode(name, input, toolContext);
  if (!normalized) {
    logInfo(`Dropping unavailable tool call: ${name}(${JSON.stringify(input).slice(0, 500)}).`);
    return;
  }
  if (normalized.name !== name) {
    logInfo(`Normalized tool call: ${name} -> ${normalized.name}.`);
  }
  name = normalized.name;
  input = normalized.input;

  logDebug(`Reporting tool call to VS Code: ${name}(${JSON.stringify(input).slice(0, 500)}).`);
  progress.report(new vscode.LanguageModelToolCallPart(call.id || `${name}-${Date.now()}`, name, input));
}

function buildToolContext(tools) {
  const names = new Set();
  const namesByLower = new Map();
  const schemaByName = new Map();
  for (const tool of tools || []) {
    if (!tool?.name) {
      continue;
    }
    names.add(tool.name);
    namesByLower.set(String(tool.name).toLowerCase(), tool.name);
    schemaByName.set(tool.name, tool.inputSchema || {});
  }
  return { names, namesByLower, schemaByName };
}

function normalizeToolCallForVsCode(name, input, context) {
  if (!context?.names?.size) {
    return { name, input };
  }

  const exact = context.namesByLower.get(String(name || '').toLowerCase());
  if (exact) {
    return { name: exact, input: coerceToolInput(exact, input, context) };
  }

  const alias = resolveToolAlias(name, input, context);
  if (!alias) {
    return null;
  }

  return {
    name: alias,
    input: coerceAliasedToolInput(name, alias, input, context)
  };
}

function resolveToolAlias(name, input, context) {
  const lower = String(name || '').toLowerCase();
  if (lower === 'file') {
    const action = String(input?.action || input?.operation || '').toLowerCase();
    if (['list', 'ls', 'dir', 'directory'].includes(action)) {
      return firstAvailableTool(context, ['list_dir', 'list_directory', 'read_dir']);
    }
    if (['read', 'cat', 'get'].includes(action)) {
      return firstAvailableTool(context, ['read_file']);
    }
    if (['write', 'create'].includes(action)) {
      return firstAvailableTool(context, ['create_file', 'write_workspace_file']);
    }
    if (['search', 'find'].includes(action)) {
      return firstAvailableTool(context, ['file_search', 'search_files', 'grep_search']);
    }
    const path = toolPathFromInput(input);
    if (!action && path) {
      if (input?.content !== undefined) {
        return firstAvailableTool(context, ['create_file', 'write_workspace_file']);
      }
      if (looksLikeFilePath(path)) {
        return firstAvailableTool(context, ['read_file']);
      }
      return firstAvailableTool(context, ['list_dir', 'list_directory', 'read_dir']);
    }
  }

  const aliases = {
    list_files: ['list_dir', 'list_directory'],
    list_file: ['list_dir', 'list_directory'],
    list_directory: ['list_dir'],
    search_files: ['file_search', 'grep_search'],
    read: ['read_file'],
    write_file: ['create_file', 'write_workspace_file'],
    write_to_file: ['create_file', 'write_workspace_file'],
    run_subprocess: ['run_in_terminal', 'run_terminal_command'],
    shell: ['run_in_terminal', 'run_terminal_command'],
    terminal: ['run_in_terminal', 'run_terminal_command']
  };

  return firstAvailableTool(context, aliases[lower] || []);
}

function toolPathFromInput(input) {
  return input?.path || input?.filePath || input?.file || input?.directory || '';
}

function looksLikeFilePath(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }
  const last = text.split(/[\\/]/).pop() || text;
  return /\.[A-Za-z0-9_+-]{1,12}$/.test(last);
}

function firstAvailableTool(context, candidates) {
  for (const candidate of candidates || []) {
    const match = context.namesByLower.get(String(candidate).toLowerCase());
    if (match) {
      return match;
    }
  }
  return '';
}

function coerceAliasedToolInput(sourceName, targetName, input, context) {
  const source = String(sourceName || '').toLowerCase();
  const next = { ...(input || {}) };
  delete next.action;
  delete next.operation;

  if (source === 'file') {
    if (input?.content !== undefined) {
      next.content = input.content;
    }
    const path = input?.path || input?.filePath || input?.file || input?.directory || '.';
    setPreferredPath(next, targetName, path, context);
  }

  if (['list_files', 'list_file', 'list_directory'].includes(source)) {
    const path = input?.path || input?.filePath || input?.directory || '.';
    setPreferredPath(next, targetName, path, context);
  }

  if (['write_file', 'write_to_file'].includes(source)) {
    const path = input?.path || input?.filePath || input?.file_path || input?.filename || input?.file || input?.uri || '.';
    const content = input?.content ?? input?.text ?? input?.contents ?? input?.file_content ?? input?.newContent ?? input?.data;
    setPreferredPath(next, targetName, path, context);
    if (content !== undefined) {
      next.content = content;
    }
    delete next.file_path;
    delete next.filename;
    delete next.file;
    delete next.uri;
    delete next.text;
    delete next.contents;
    delete next.file_content;
    delete next.newContent;
    delete next.data;
  }

  if (['run_subprocess', 'shell', 'terminal'].includes(source)) {
    next.command = input?.command || input?.cmd || input?.script || input?._raw || '';
  }

  return coerceToolInput(targetName, next, context);
}

function coerceToolInput(toolName, input, context) {
  const next = { ...(input || {}) };
  const schema = context?.schemaByName?.get(toolName) || {};
  const properties = schema.properties || {};
  if (next.path !== undefined && properties.filePath && !properties.path && next.filePath === undefined) {
    next.filePath = next.path;
    delete next.path;
  }
  if (next.filePath !== undefined && properties.path && !properties.filePath && next.path === undefined) {
    next.path = next.filePath;
    delete next.filePath;
  }
  normalizeToolPath(next, properties);
  fillRequiredToolDefaults(next, properties);
  return next;
}

function normalizeToolPath(input, properties) {
  for (const key of ['path', 'filePath']) {
    if (!properties[key] || typeof input[key] !== 'string') {
      continue;
    }
    const resolved = resolveWorkspacePath(input[key]);
    if (resolved) {
      input[key] = resolved;
    }
  }
}

function resolveWorkspacePath(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (path.isAbsolute(text)) {
    return text;
  }
  const root = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (!root) {
    return text;
  }
  return path.resolve(root, text);
}

function fillRequiredToolDefaults(input, properties) {
  if (properties.startLine && input.startLine === undefined) {
    input.startLine = 1;
  }
  if (properties.endLine && input.endLine === undefined && input.startLine !== undefined) {
    input.endLine = input.startLine + 200;
  }
}

function setPreferredPath(input, toolName, value, context) {
  const schema = context?.schemaByName?.get(toolName) || {};
  const properties = schema.properties || {};
  if (properties.filePath && !properties.path) {
    input.filePath = value;
    delete input.path;
    return;
  }
  input.path = value;
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
  logInfo(`OpenAI Responses endpoint: http://${host}:${port}/v1/responses`);
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

  if (request.method === 'POST' && url.pathname === '/v1/responses') {
    await handleOpenAiResponses(request, response);
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
  const modelId = resolveProxyModelId(body.model || getConfig().get('proxy.defaultModel', ''));
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
  const upstreamBody = prepareUpstreamRequest(configured, {
    ...body,
    model: configured.id
  });

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
    recordUsage(configured.id, 'proxy-oai-provider', usage, completion.length, Date.now() - startedAt, configured.providerId);
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
  recordUsage(configured.id, 'proxy-oai-provider', usage, completion.length, Date.now() - startedAt, configured.providerId);
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

async function handleOpenAiResponses(request, response) {
  const body = await readJsonBody(request);
  const startedAt = Date.now();
  const modelId = resolveProxyModelId(body.model || getConfig().get('proxy.defaultModel', ''));
  const configured = findConfiguredModel(modelId);

  logInfo(`Proxy Responses request: ${modelId || '(default)'}, stream=${Boolean(body.stream)}`);

  // Convert Responses API request to Chat Completions format
  const chatBody = responsesToChatCompletions(body, configured);

  if (configured) {
    await handleResponsesViaConfiguredProvider(configured, body, chatBody, response, startedAt);
  } else {
    await handleResponsesViaVsCodeLm(modelId, body, chatBody, response, startedAt);
  }
}

function responsesToChatCompletions(respBody, configured) {
  // Convert Responses API 'input' to Chat Completions 'messages'
  let messages = [];
  if (typeof respBody.input === 'string') {
    messages = [{ role: 'user', content: respBody.input }];
  } else if (Array.isArray(respBody.input)) {
    for (const item of respBody.input) {
      if (item.role && item.content !== undefined) {
        // It's already a message-like object
        messages.push({
          role: item.role,
          content: safeContentToText({ content: item.content })
        });
      } else if (typeof item === 'string') {
        messages.push({ role: 'user', content: item });
      }
    }
  }

  // If previous_items exist, restore assistant messages from them
  if (Array.isArray(respBody.previous_items)) {
    for (const item of respBody.previous_items) {
      if (item.type === 'message' && item.role === 'assistant') {
        const text = item.content?.map((c) => c.type === 'output_text' ? c.text : '').join('') || '';
        messages.push({ role: 'assistant', content: text || null });

        // Add tool_calls if present
        const toolCalls = item.content?.filter((c) => c.type === 'tool_call') || [];
        if (toolCalls.length > 0) {
          messages[messages.length - 1].tool_calls = toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) }
          }));
        }
      }
      if (item.type === 'message' && item.role === 'user') {
        const text = item.content?.map((c) => c.type === 'input_text' ? c.text : '').join('') || '';
        messages.push({ role: 'user', content: text });
      }
    }
  }

  // Convert tool_results (from tool calls) to tool role messages
  if (Array.from(respBody.input || []).some((i) => i.type === 'tool_result')) {
    for (const item of respBody.input || []) {
      if (item.type === 'tool_result') {
        const content = item.content?.map((c) => c.text || (c.type === 'input_text' ? c.text : '') || '').join('') || '';
        messages.push({
          role: 'tool',
          tool_call_id: item.tool_call_id || item.id,
          content
        });
      }
    }
  }

  return {
    model: configured?.id || respBody.model,
    messages,
    stream: respBody.stream !== false,
    tools: respBody.tools || [],
    temperature: respBody.temperature,
    max_tokens: respBody.max_output_tokens || respBody.max_tokens,
    stream_options: respBody.stream !== false ? { include_usage: true } : undefined
  };
}

async function handleResponsesViaConfiguredProvider(configured, originalBody, chatBody, response, startedAt) {
  const apiKey = await getApiKey(extensionContext, configured, true);
  const upstreamBody = prepareUpstreamRequest(configured, chatBody);

  if (chatBody.stream) {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });

    const responseId = `resp_${Date.now()}`;
    let fullText = '';
    let toolCalls = [];

    // Send response.created event
    writeResponsesSse(response, 'response.created', {
      type: 'response.created',
      response: {
        id: responseId,
        object: 'response',
        status: 'in_progress',
        model: configured.id,
        output: [],
        usage: null
      }
    });

    // Send output_item.added + content_part.added
    writeResponsesSse(response, 'response.output_item.added', {
      type: 'response.output_item.added',
      output_index: 0,
      item: { id: `item_${Date.now()}`, type: 'message', role: 'assistant', content: [] }
    });
    writeResponsesSse(response, 'response.content_part.added', {
      type: 'response.content_part.added',
      part_index: 0,
      part: { type: 'output_text', text: '' }
    });

    await sendOaiUpstream(configured, apiKey || '', upstreamBody, {
      onText: (text) => {
        fullText += text;
        writeResponsesSse(response, 'response.output_text.delta', {
          type: 'response.output_text.delta',
          delta: text
        });
      },
      onToolCall: (call) => {
        toolCalls.push(call);
      }
    });

    if (fullText) {
      writeResponsesSse(response, 'response.output_text.done', {
        type: 'response.output_text.done',
        text: fullText
      });
    }

    writeResponsesSse(response, 'response.content_part.done', {
      type: 'response.content_part.done',
      part: { type: 'output_text', text: fullText }
    });

    // Build output array
    const outputContent = [];
    if (fullText) {
      outputContent.push({ type: 'output_text', text: fullText, annotations: [] });
    }
    for (const call of toolCalls) {
      outputContent.push({
        type: 'tool_call',
        id: call.id || call.callId || `call_${Date.now()}`,
        name: call.function?.name || call.name,
        arguments: (() => { try { return JSON.parse(call.function?.arguments || '{}'); } catch { return {}; } })()
      });
    }

    writeResponsesSse(response, 'response.output_item.done', {
      type: 'response.output_item.done',
      item: { id: `item_${Date.now()}`, type: 'message', role: 'assistant', content: outputContent }
    });

    const usage = estimatedOpenAiUsage(chatBody.messages, fullText);
    writeResponsesSse(response, 'response.completed', {
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'response',
        status: 'completed',
        model: configured.id,
        output: [{ id: `item_${Date.now()}`, type: 'message', role: 'assistant', content: outputContent }],
        usage: { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens, total_tokens: usage.total_tokens }
      }
    });

    response.write('data: [DONE]\n\n');
    response.end();
    recordUsage(configured.id, 'proxy-responses-oai', usage, fullText.length, Date.now() - startedAt, configured.providerId);
    return;
  }

  // Non-streaming
  const result = await sendOaiUpstream(configured, apiKey || '', upstreamBody, {
    onText: () => {},
    onToolCall: () => {}
  });

  const usage = result.usage || estimatedOpenAiUsage(chatBody.messages, result.completionText);
  recordUsage(configured.id, 'proxy-responses-oai', usage, result.completionText.length, Date.now() - startedAt, configured.providerId);

  const outputContent = result.completionText
    ? [{ type: 'output_text', text: result.completionText, annotations: [] }]
    : [];

  sendJson(response, 200, {
    id: `resp_${Date.now()}`,
    object: 'response',
    status: 'completed',
    model: configured.id,
    output: [{ id: `item_${Date.now()}`, type: 'message', role: 'assistant', content: outputContent }],
    usage: { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens, total_tokens: usage.total_tokens }
  });
}

async function handleResponsesViaVsCodeLm(modelId, originalBody, chatBody, response, startedAt) {
  const model = await selectVsCodeModel(modelId);
  const messages = openAiMessagesToVsCode(chatBody.messages || []);
  const tools = openAiToolsToVsCode(chatBody.tools);

  if (chatBody.stream) {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });

    const responseId = `resp_${Date.now()}`;
    writeResponsesSse(response, 'response.created', {
      type: 'response.created',
      response: { id: responseId, object: 'response', status: 'in_progress', model: model.id, output: [], usage: null }
    });
    writeResponsesSse(response, 'response.output_item.added', {
      type: 'response.output_item.added',
      output_index: 0,
      item: { id: `item_${Date.now()}`, type: 'message', role: 'assistant', content: [] }
    });
    writeResponsesSse(response, 'response.content_part.added', {
      type: 'response.content_part.added',
      part_index: 0,
      part: { type: 'output_text', text: '' }
    });

    let fullText = '';
    const options = {};
    if (tools.length > 0) options.tools = tools;

    await sendVsCodeModelRequest(model, messages, options, {
      onText: (text) => {
        fullText += text;
        writeResponsesSse(response, 'response.output_text.delta', { type: 'response.output_text.delta', delta: text });
      },
      onToolCall: () => {}
    });

    if (fullText) {
      writeResponsesSse(response, 'response.output_text.done', { type: 'response.output_text.done', text: fullText });
    }
    writeResponsesSse(response, 'response.content_part.done', { type: 'response.content_part.done', part: { type: 'output_text', text: fullText } });

    const usage = estimatedOpenAiUsage(chatBody.messages, fullText);
    writeResponsesSse(response, 'response.completed', {
      type: 'response.completed',
      response: {
        id: responseId, object: 'response', status: 'completed', model: model.id,
        output: [{ id: `item_${Date.now()}`, type: 'message', role: 'assistant', content: [{ type: 'output_text', text: fullText, annotations: [] }] }],
        usage: { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens, total_tokens: usage.total_tokens }
      }
    });

    response.write('data: [DONE]\n\n');
    response.end();
    recordUsage(model.id, 'proxy-responses-vscode', usage, fullText.length, Date.now() - startedAt);
    return;
  }

  let fullText = '';
  await sendVsCodeModelRequest(model, messages, {}, {
    onText: (text) => { fullText += text; },
    onToolCall: () => {}
  });

  const usage = estimatedOpenAiUsage(chatBody.messages, fullText);
  recordUsage(model.id, 'proxy-responses-vscode', usage, fullText.length, Date.now() - startedAt);

  sendJson(response, 200, {
    id: `resp_${Date.now()}`, object: 'response', status: 'completed', model: model.id,
    output: [{ id: `item_${Date.now()}`, type: 'message', role: 'assistant', content: [{ type: 'output_text', text: fullText, annotations: [] }] }],
    usage: { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens, total_tokens: usage.total_tokens }
  });
}

function writeResponsesSse(response, event, value) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

// Resolve model ID through optional model mapping (e.g. "o3" → "deepseek-v4-pro")
function resolveProxyModelId(requestedId) {
  if (!requestedId) return requestedId;
  // Try OpenAI/Codex model mapping first
  const codexMapping = getConfig().get('proxy.codexModelMapping', {});
  if (codexMapping[requestedId]) {
    logInfo(`Codex model mapping: ${requestedId} → ${codexMapping[requestedId]}`);
    return codexMapping[requestedId];
  }
  // Try Anthropic model mapping
  const anthropicMapping = getConfig().get('proxy.anthropicModelMapping', {});
  if (anthropicMapping[requestedId]) {
    return anthropicMapping[requestedId];
  }
  return requestedId;
}

async function handleAnthropicMessages(request, response) {
  const body = await readJsonBody(request);
  const startedAt = Date.now();
  const requestedModel = body.model || '';
  const config = getConfig();
  const mapping = config.get('proxy.anthropicModelMapping', {});

  // requestedModel is what Claude Code sends (e.g. "claude-sonnet-4-5-20250514" or "claude-haiku-4-5-20251001")
  // mapping maps Claude model name → upstream model ID, e.g. {"claude-sonnet-4-20250514": "deepseek-v4-pro-anthr", "claude-sonnet-4-5-20250514": "glm-5.1-anthr"}
  // Unmapped Claude models (e.g. Explore agent's claude-haiku-*) follow the last successfully mapped upstream,
  // which is the current session's active upstream model.
  let mappedUpstreamModel = mapping[requestedModel] || '';
  if (!mappedUpstreamModel && lastAnthropicUpstreamModel) {
    mappedUpstreamModel = lastAnthropicUpstreamModel;
  }
  if (mappedUpstreamModel) {
    lastAnthropicUpstreamModel = mappedUpstreamModel;
  }
  const lookupModel = mappedUpstreamModel || requestedModel;
  const configured = findConfiguredModel(lookupModel);

  // --- Try configured Anthropic provider passthrough ---
  if (configured && isAnthropicApi(configured)) {
    let apiKey = await getApiKey(extensionContext, configured, true);
    // Fallback: try to find API key from a sibling provider sharing the same base domain
    if (!apiKey) {
      apiKey = await findSiblingApiKey(configured);
    }
    if (apiKey) {
      logInfo(`Anthropic passthrough: Claude=${requestedModel}, upstream=${configured.id} @ ${configured.baseUrl}`);
      return anthropicPassthrough(request, response, body, configured, apiKey, startedAt, requestedModel);
    }
    logInfo(`Anthropic passthrough skipped for ${requestedModel}: no API key for provider ${configured.providerId}`);
  }

  // --- Try any configured non-Anthropic provider (format bridge) ---
  if (configured && !isAnthropicApi(configured)) {
    const apiKey = await getApiKey(extensionContext, configured, true);
    if (apiKey) {
      logInfo(`Anthropic→OpenAI bridge: Claude=${requestedModel}, upstream=${configured.id} @ ${configured.baseUrl}`);
      return anthropicViaNonAnthropicProvider(response, body, configured, apiKey, startedAt, requestedModel);
    }
  }

  // --- Fallback to VS Code LM ---
  logInfo(`Anthropic fallback to VS Code LM: requestedModel=${requestedModel}, mappedUpstreamModel=${mappedUpstreamModel || '(none)'}, configured=${configured ? configured.id : '(none)'}`);
  const model = await selectVsCodeModel(requestedModel || config.get('proxy.defaultModel', ''));
  const messages = anthropicMessagesToVsCode(body);
  const maxTokens = Number(body.max_tokens || 4096);

  logInfo(`Proxy Anthropic request (VS Code LM): ${model.id}, messages=${Array.isArray(body.messages) ? body.messages.length : 0}, stream=${Boolean(body.stream)}`);

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

// --- Anthropic SSE passthrough with model name replacement ---
// claudeModel = what Claude Code sent (e.g. "claude-sonnet-4-20250514")
// configured.id = upstream model id (e.g. "deepseek-v4-pro")
// Flow: replace model in outgoing request with configured.id, replace model in response with claudeModel
async function anthropicPassthrough(request, response, body, configured, apiKey, startedAt, claudeModel) {
  // Replace model in outgoing request with the upstream provider model id (or upstreamModelId if set)
  const upstreamModelId = configured.upstreamModelId || configured.id;
  const upstreamBody = { ...body, model: upstreamModelId };

  const upstreamUrl = anthropicMessagesUrl(configured.baseUrl);
  const headers = buildAnthropicHeaders(configured, apiKey);
  const controller = new AbortController();
  const timeoutSeconds = upstreamTimeoutSeconds(configured);
  const timeoutId = setTimeout(() => controller.abort(), Math.max(timeoutSeconds, 10) * 1000);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST', headers, body: JSON.stringify(upstreamBody), signal: controller.signal
    });

    if (!upstreamResponse.ok) {
      const text = await upstreamResponse.text();
      logInfo(`Anthropic upstream error: ${upstreamResponse.status} ${text}`);
      sendJson(response, upstreamResponse.status, { type: 'error', error: { type: 'upstream_error', message: `Upstream returned ${upstreamResponse.status}: ${text}` } });
      return;
    }

    const contentType = upstreamResponse.headers.get('content-type') || '';
    const isSse = contentType.includes('text/event-stream');

    if (body.stream && isSse) {
      // Streaming: SSE passthrough with model name replacement
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      });

      const reader = upstreamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let completionChars = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('event:')) {
            // Forward event type line as-is
            response.write(line + '\n');
          } else if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) {
              response.write(line + '\n\n');
              continue;
            }
            try {
              const event = JSON.parse(jsonStr);
              // Replace model name in response: upstream model id → claudeModel
              if (event.type === 'message_start' && event.message) {
                event.message.model = claudeModel;
                if (event.message.usage) {
                  totalInputTokens = event.message.usage.input_tokens || 0;
                }
              }
              if (event.type === 'message_delta' && event.usage) {
                totalOutputTokens = event.usage.output_tokens || 0;
                // Count text content for completion chars
              }
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                completionChars += (event.delta.text || '').length;
              }
              response.write(`data: ${JSON.stringify(event)}\n\n`);
            } catch {
              response.write(line + '\n\n');
            }
          } else {
            response.write(line + '\n');
          }
        }
      }
      // Flush remaining buffer
      if (buffer.trim()) {
        response.write(buffer + '\n');
      }
      response.end();

      recordUsage(claudeModel, 'anthropic-passthrough', {
        prompt_tokens: totalInputTokens,
        completion_tokens: totalOutputTokens,
        total_tokens: totalInputTokens + totalOutputTokens
      }, completionChars, Date.now() - startedAt, configured.providerId);
    } else {
      // Non-streaming: parse JSON, replace model, forward
      const json = await upstreamResponse.json();
      if (json.model) { json.model = claudeModel; }
      const inputTokens = json.usage?.input_tokens || 0;
      const outputTokens = json.usage?.output_tokens || 0;
      const completionChars = (json.content || []).filter((b) => b.type === 'text').reduce((s, b) => s + (b.text || '').length, 0);
      recordUsage(claudeModel, 'anthropic-passthrough', {
        prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens
      }, completionChars, Date.now() - startedAt, configured.providerId);
      sendJson(response, 200, json);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      logInfo(`Anthropic upstream timed out after ${timeoutSeconds}s`);
      sendJson(response, 504, { type: 'error', error: { type: 'timeout', message: `Upstream timed out after ${timeoutSeconds}s` } });
    } else {
      logInfo(`Anthropic upstream error: ${error.message}`);
      sendJson(response, 502, { type: 'error', error: { type: 'upstream_error', message: error.message } });
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Anthropic format via non-Anthropic provider (format bridge) ---
async function anthropicViaNonAnthropicProvider(response, body, configured, apiKey, startedAt, claudeModel) {
  // Convert Anthropic messages → OpenAI messages, send via sendOaiUpstream, then convert back
  const oaiMessages = anthropicToOpenAiBody(body, configured);
  const sink = {
    texts: [],
    toolCalls: [],
    onText(text) { this.texts.push(text); },
    onToolCall(tc) { this.toolCalls.push(tc); }
  };

  const result = await sendOaiUpstream(configured, apiKey, oaiMessages, sink, undefined);
  const completionText = result?.completionText || sink.texts.join('');
  const usage = result?.usage;
  const responseModel = claudeModel || body.model || configured.id;

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
        id: messageId, type: 'message', role: 'assistant',
        model: responseModel, content: [], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: usage?.prompt_tokens || 0, output_tokens: 0 }
      }
    });
    writeAnthropicEvent(response, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    if (completionText) {
      writeAnthropicEvent(response, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: completionText } });
    }
    writeAnthropicEvent(response, 'content_block_stop', { type: 'content_block_stop', index: 0 });
    writeAnthropicEvent(response, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usage?.completion_tokens || estimateTokens(completionText) } });
    writeAnthropicEvent(response, 'message_stop', { type: 'message_stop' });
    response.end();
  } else {
    sendJson(response, 200, {
      id: `msg_${Date.now()}`, type: 'message', role: 'assistant',
      model: responseModel,
      content: [{ type: 'text', text: completionText }],
      stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: usage?.prompt_tokens || 0, output_tokens: usage?.completion_tokens || estimateTokens(completionText) }
    });
  }

  recordUsage(responseModel, 'anthropic-bridge', {
    prompt_tokens: usage?.prompt_tokens || 0, completion_tokens: usage?.completion_tokens || 0,
    total_tokens: usage?.total_tokens || 0
  }, completionText.length, Date.now() - startedAt, configured.providerId);
}

function anthropicToOpenAiBody(body, configured) {
  const messages = [];
  if (body.system) {
    messages.push({ role: 'system', content: typeof body.system === 'string' ? body.system : body.system.map((b) => b.text || '').join('\n') });
  }
  for (const msg of body.messages || []) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      const text = typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content.map((b) => b.text || '').join('') : '');
      messages.push({ role: msg.role, content: text });
    }
  }
  return { model: configured.id, messages, max_tokens: body.max_tokens || 4096, stream: false };
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

  // Add mapped Claude model names from anthropicModelMapping so Claude Code can discover them
  const anthropicMapping = getConfig().get('proxy.anthropicModelMapping', {});
  const anthropicRows = Object.keys(anthropicMapping).map((claudeModel) => ({
    id: claudeModel,
    object: 'model',
    created: 0,
    owned_by: 'anthropic',
    source: 'anthropic-mapping',
    name: claudeModel,
    family: 'claude',
    version: claudeModel,
    max_input_tokens: 200000
  }));

  // Add mapped Codex/OpenAI model names from codexModelMapping
  const codexMapping = getConfig().get('proxy.codexModelMapping', {});
  const codexRows = Object.keys(codexMapping).map((alias) => {
    const target = findConfiguredModel(codexMapping[alias]);
    return {
      id: alias,
      object: 'model',
      created: 0,
      owned_by: target?.providerId || 'codex-mapping',
      source: 'codex-mapping',
      upstream_model: codexMapping[alias],
      name: alias,
      family: target?.family || 'openai',
      version: alias,
      max_input_tokens: target?.maxInputTokens || 128000
    };
  });

  return [...lmRows, ...configuredRows, ...anthropicRows, ...codexRows];
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
      if (part?.type === 'reasoning_content' || part?.type === 'reasoning') {
        return '';
      }
      return '';
    }).join('\n');
  }

  return '';
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
      if (part?.type === 'tool_use' || part?.type === 'tool_result') {
        return '';
      }
      return '';
    }).join('\n');
  }

  return '';
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

// ── Balance checking ──────────────────────────────────────────────

async function setThinkingEffortCommand() {
  const current = getConfig().get('copilot.thinkingEffort', 'model');
  const picked = await vscode.window.showQuickPick([
    { label: 'Model Default', value: 'model', description: 'Use each model configuration.' },
    { label: 'None', value: 'none', description: 'Fastest; disable reasoning when supported.' },
    { label: 'High', value: 'high', description: 'Balanced reasoning depth.' },
    { label: 'Max', value: 'max', description: 'Deep reasoning for complex work.' }
  ], {
    placeHolder: `Select Copilot thinking effort (current: ${current})`,
    ignoreFocusOut: true
  });
  if (!picked) {
    return;
  }

  await getConfig().update('copilot.thinkingEffort', picked.value, vscode.ConfigurationTarget.Global);
  logInfo(`Copilot thinking effort set to ${picked.value}.`);
  vscode.window.showInformationMessage(`Matrix OAI Copilot thinking effort: ${picked.label}`);
  refreshConfigPanel();
}

async function setVisionProxyModelCommand() {
  const configuredTargets = configuredVisionProxyTargets();
  const vscodeTargets = await vscodeVisionProxyTargets();
  const items = [
    {
      label: 'Auto',
      description: 'Prefer Matrix OAI image-capable models, then VS Code image-capable models.',
      value: ''
    },
    ...configuredTargets.map((target) => ({
      label: target.label,
      description: target.description,
      detail: target.detail,
      value: target.value
    })),
    ...vscodeTargets.map((target) => ({
      label: target.label,
      description: target.description,
      detail: target.detail,
      value: target.value
    }))
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select the model used to describe images for text-only Matrix OAI models',
    ignoreFocusOut: true
  });
  if (!picked) {
    return;
  }

  await getConfig().update('copilot.visionProxyModel', picked.value, vscode.ConfigurationTarget.Global);
  logInfo(`Copilot vision proxy model set to ${picked.value || 'Auto'}.`);
  vscode.window.showInformationMessage(`Matrix OAI vision proxy: ${picked.label}`);
  refreshConfigPanel();
}

async function checkBalanceCommand() {
  const providers = getProviders();
  if (providers.length === 0) {
    vscode.window.showInformationMessage('No providers configured. Add a provider first.');
    return;
  }

  // Find which providers have balance check support
  const checkable = providers.filter((p) => findBalanceDef(p));

  if (checkable.length === 0) {
    vscode.window.showInformationMessage('No supported balance-check providers found. Supported: ' + supportedBalanceProviderNames().join(', '));
    return;
  }

  // Pick one provider to check
  const picked = await vscode.window.showQuickPick(
    checkable.map((p) => ({
      label: p.name || p.id,
      description: p.baseUrl,
      provider: p
    })),
    { placeHolder: 'Select a provider to check balance', ignoreFocusOut: true }
  );
  if (!picked) return;

  const provider = picked.provider;
  const balanceDef = findBalanceDef(provider);
  if (!balanceDef) {
    vscode.window.showErrorMessage(`No balance endpoint known for provider "${provider.id}".`);
    return;
  }

  vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Checking ${balanceDef.name} balance...` }, async () => {
    try {
      const result = await checkBalanceForProvider(provider, balanceDef);
      if (!result) {
        vscode.window.showWarningMessage(`Could not retrieve balance for ${balanceDef.name}. The endpoint may require authentication or is not accessible.`);
        return;
      }
      showBalanceResult(balanceDef, result);
    } catch (error) {
      vscode.window.showErrorMessage(`Balance check failed: ${error.message}`);
    }
  });
}

function findBalanceDef(provider) {
  for (const [key, def] of Object.entries(BALANCE_PROVIDERS)) {
    if (providerMatchesBalanceDef(provider, key, def)) return def;
  }
  return undefined;
}

function providerMatchesBalanceDef(provider, key, def) {
  const text = [
    provider?.id,
    provider?.name,
    provider?.providerId,
    provider?.baseUrl
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  if (text.includes(String(key).toLowerCase())) {
    return true;
  }
  return (def.aliases || []).some((alias) => text.includes(String(alias).toLowerCase()));
}

function supportedBalanceProviderNames() {
  return Array.from(new Set(Object.values(BALANCE_PROVIDERS).map((def) => def.name)));
}

async function checkBalanceForProvider(provider, balanceDef) {
  const url = balanceUrlForProvider(provider, balanceDef);

  // Try provider-scoped key, then global key, then ask user
  let apiKey = '';
  try {
    const providerKey = secretKeyFor(provider);
    apiKey = (await extensionContext?.secrets.get(providerKey)) || '';
    if (!apiKey) {
      apiKey = (await extensionContext?.secrets.get(GLOBAL_API_KEY)) || '';
    }
  } catch { /* ignore */ }

  if (!apiKey) {
    const input = await vscode.window.showInputBox({
      title: `API Key for ${balanceDef.name}`,
      prompt: `Enter your ${balanceDef.name} API key to check balance (stored automatically)`,
      password: true,
      ignoreFocusOut: true
    });
    if (input === undefined) return null; // cancelled
    apiKey = input.trim();
    // Save for next time
    if (apiKey) {
      try { await extensionContext?.secrets.store(secretKeyFor(provider), apiKey); } catch { /* ignore */ }
    }
  }

  logInfo(`Checking balance for ${balanceDef.name} at ${url}`);

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  const response = await fetch(url, { method: balanceDef.method || 'GET', headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${balanceDef.name} returned ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = await response.json();
  return balanceDef.parse(json);
}

async function autoRefreshBalance() {
  for (const provider of balanceRefreshProviderOrder()) {
    const balanceDef = findBalanceDef(provider);
    if (!balanceDef) continue;
    try {
      const providerKey = `matrixOaiCopilot.apiKey.${Buffer.from(provider.id || provider.baseUrl || 'default').toString('base64url')}`;
      let apiKey = '';
      try {
        apiKey = (await extensionContext?.secrets.get(providerKey)) || (await extensionContext?.secrets.get(GLOBAL_API_KEY)) || '';
      } catch {}
      if (!apiKey) continue;
      const response = await fetch(balanceUrlForProvider(provider, balanceDef), {
        method: balanceDef.method || 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      if (!response.ok) continue;
      const json = await response.json();
      const result = balanceDef.parse(json);
      if (result) {
        cachedBalance = {
          providerId: provider.id,
          name: balanceDef.name,
          balance: result.balance,
          currency: result.currency,
          status: result.available !== false
        };
        updateStatusBar();
        logDebug(`Auto-refreshed balance for ${provider.id}: ${result.balance} ${result.currency}`);
        break;
      }
    } catch { /* try next provider */ }
  }
}

function balanceRefreshProviderOrder() {
  const providers = getProviders();
  const lastProvider = lastRequestProvider();
  if (!lastProvider) {
    return providers;
  }

  const ordered = [];
  const seen = new Set();
  for (const provider of providers) {
    if (providerMatchesId(provider, lastProvider)) {
      ordered.push(provider);
      seen.add(provider.id);
    }
  }
  for (const provider of providers) {
    if (!seen.has(provider.id)) {
      ordered.push(provider);
    }
  }
  return ordered;
}

function lastRequestProvider() {
  const stats = mergeStats(getPersistedStats(), sessionStats);
  const last = stats.lastRequest;
  if (last?.providerId) {
    return last.providerId;
  }
  if (last?.modelId) {
    return findConfiguredModel(last.modelId)?.providerId;
  }
  return '';
}

function providerMatchesId(provider, id) {
  const wanted = String(id || '').toLowerCase();
  if (!wanted) {
    return false;
  }
  return [
    provider?.id,
    provider?.providerId,
    provider?.name
  ].some((value) => String(value || '').toLowerCase() === wanted);
}

function balanceUrlForProvider(provider, balanceDef) {
  const endpoint = String(balanceDef.url || '');
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  const baseUrl = String(provider.baseUrl || '').replace(/\/+$/, '');
  if (balanceDef.rootRelative) {
    try {
      return `${new URL(baseUrl).origin}${endpoint}`;
    } catch {
      return `${baseUrl}${endpoint}`;
    }
  }
  return `${baseUrl}${endpoint}`;
}

function pickNumeric(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const normalized = String(value).replace(/,/g, '').trim();
    if (!normalized) {
      continue;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function primaryZhipuLimit(data) {
  const limits = Array.isArray(data?.limits) ? data.limits : [];
  return limits.find((item) => String(item?.type || '').toUpperCase().includes('TOKENS'))
    || limits.find((item) => item && typeof item === 'object')
    || data;
}

function zhipuLimitsSummary(limits) {
  if (!Array.isArray(limits) || limits.length === 0) {
    return undefined;
  }
  return limits.map((item) => {
    const parts = [String(item?.type || 'LIMIT')];
    const number = pickNumeric(item?.number, item?.limit, item?.quota);
    const usage = pickNumeric(item?.usage, item?.currentValue, item?.used);
    const remaining = pickNumeric(item?.remaining);
    const percentage = pickNumeric(item?.percentage);
    if (number !== undefined) parts.push(`number=${formatNumber(number)}`);
    if (usage !== undefined) parts.push(`usage=${formatNumber(usage)}`);
    if (remaining !== undefined) parts.push(`remaining=${formatNumber(remaining)}`);
    if (percentage !== undefined) parts.push(`used=${percentage}%`);
    if (item?.unit !== undefined) parts.push(`unit=${item.unit}`);
    if (item?.nextResetTime !== undefined) parts.push(`reset=${formatZhipuResetTime(item.nextResetTime)}`);
    return parts.join(' ');
  }).join('\n');
}

function formatZhipuResetTime(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const ms = numeric > 100000000000 ? numeric : numeric * 1000;
    return new Date(ms).toLocaleString();
  }
  return String(value);
}

function startBalanceRefresh() {
  // Initial delay 30s to let VS Code settle, then every 5 minutes
  const intervalMinutes = vscode.workspace.getConfiguration(CONFIG_SECTION).get('balanceRefreshMinutes', 5);
  const initialDelayMs = 30000;
  const intervalMs = Math.max(intervalMinutes, 1) * 60000;
  setTimeout(() => {
    autoRefreshBalance();
    balanceTimer = setInterval(autoRefreshBalance, intervalMs);
  }, initialDelayMs);
}

function showBalanceResult(def, result) {
  if (!result) {
    vscode.window.showWarningMessage(`${def.name}: balance data not available.`);
    return;
  }

  const parts = [`${result.balance} ${result.currency}`];
  if (result.granted && result.granted !== '0.00') {
    parts.push(`(granted: ${result.granted})`);
  }
  if (result.toppedUp && result.toppedUp !== '0.00') {
    parts.push(`(topped-up: ${result.toppedUp})`);
  }
  if (result.used !== undefined) {
    parts.push(`| used: ${result.used}`);
  }
  if (result.limit !== undefined) {
    parts.push(`| limit: ${result.limit}`);
  }
  if (result.percentage !== undefined) {
    parts.push(`| used: ${result.percentage}`);
  }
  if (result.resetTime !== undefined) {
    parts.push(`| reset: ${result.resetTime}`);
  }
  if (result.detail !== undefined) {
    parts.push('| details available');
  }
  cachedBalance = { name: def.name, balance: result.balance, currency: result.currency, status: result.available !== false };
  updateStatusBar();
  const status = result.available !== false ? '✅ Active' : '❌ Unavailable';
  vscode.window.showInformationMessage(`${def.name}: ${status} — ${parts.join(' ')}`, 'Show Details').then((action) => {
    if (action === 'Show Details') {
      output?.clear();
      logInfo(`=== Balance: ${def.name} ===`);
      logInfo(`Status: ${status}`);
      logInfo(`Balance: ${result.balance} ${result.currency}`);
      if (result.granted) logInfo(`Granted: ${result.granted}`);
      if (result.toppedUp) logInfo(`Topped-up: ${result.toppedUp}`);
      if (result.used !== undefined) logInfo(`Used: ${result.used}`);
      if (result.limit !== undefined) logInfo(`Limit: ${result.limit}`);
      if (result.percentage !== undefined) logInfo(`Used percentage: ${result.percentage}`);
      if (result.resetTime !== undefined) logInfo(`Reset time: ${result.resetTime}`);
      if (result.detail !== undefined) logInfo(`Details:\n${result.detail}`);
      logInfo(`Raw response:\n${JSON.stringify(result.raw, null, 2)}`);
      output?.show();
    }
  });
}

// ── Configuration Panel ───────────────────────────────────────────
async function writeCodexConfigCommand() {
  try {
    await startProxy();
    const result = writeCodexConfigFiles();
    logInfo('=== Codex configuration written ===');
    logInfo(`Config: ${result.configPath}`);
    logInfo(`Models catalog: ${result.catalogPath}`);
    if (result.backupPath) {
      logInfo(`Backup: ${result.backupPath}`);
    }
    output?.show();
    vscode.window.showInformationMessage(
      `Codex now points to Matrix OAI (${result.modelId}). Set MATRIX_OAI_API_KEY to any non-empty value if Codex asks for it.`,
      'Show Output'
    ).then((action) => {
      if (action === 'Show Output') output?.show();
    });
  } catch (error) {
    logError('Write Codex config failed', error);
    vscode.window.showErrorMessage(`Write Codex config failed: ${error.message}`);
  }
}

function writeCodexConfigFiles() {
  const codexDir = path.join(os.homedir(), '.codex');
  fs.mkdirSync(codexDir, { recursive: true });

  const configPath = path.join(codexDir, 'config.toml');
  const catalogPath = path.join(codexDir, 'models_catalog.json');
  const modelId = preferredCodexModelId();
  const reasoning = codexReasoningEffort(findConfiguredModel(modelId));
  const endpoints = proxyEndpoints();
  const baseUrl = endpoints['openai-responses'].replace(/\/responses$/, '');

  let existing = '';
  if (fs.existsSync(configPath)) {
    existing = fs.readFileSync(configPath, 'utf8');
  }

  const backupPath = fs.existsSync(configPath)
    ? path.join(codexDir, `config.toml.matrix-oai-backup-${timestampForFile()}`)
    : '';
  if (backupPath) {
    fs.copyFileSync(configPath, backupPath);
  }

  const updatedConfig = buildCodexConfig(existing, {
    modelId,
    reasoning,
    providerId: 'matrix-oai',
    baseUrl
  });
  fs.writeFileSync(configPath, updatedConfig, 'utf8');

  writeCodexModelsCatalog(catalogPath);

  return { configPath, catalogPath, backupPath, modelId };
}

function buildCodexConfig(existing, options) {
  let text = String(existing || '').replace(/\r\n/g, '\n');
  text = text.replace(/\n?# BEGIN MATRIX OAI GATEWAY[\s\S]*?# END MATRIX OAI GATEWAY\n?/g, '\n');
  text = removeTomlTable(text, 'model_providers.matrix-oai');
  text = removeTopLevelTomlKeys(text, ['model', 'model_provider', 'model_reasoning_effort']);
  text = text.trim();

  const header = [
    `model = ${tomlString(options.modelId)}`,
    `model_provider = ${tomlString(options.providerId)}`,
    `model_reasoning_effort = ${tomlString(options.reasoning)}`
  ].join('\n');

  const provider = [
    '# BEGIN MATRIX OAI GATEWAY',
    '[model_providers.matrix-oai]',
    'name = "Matrix OAI Gateway"',
    `base_url = ${tomlString(options.baseUrl)}`,
    'env_key = "MATRIX_OAI_API_KEY"',
    'wire_api = "responses"',
    '# END MATRIX OAI GATEWAY'
  ].join('\n');

  return `${header}\n\n${text ? `${text}\n\n` : ''}${provider}\n`;
}

function removeTopLevelTomlKeys(text, keys) {
  const wanted = new Set(keys);
  const lines = String(text || '').split('\n');
  const kept = [];
  let inTopLevel = true;

  for (const line of lines) {
    if (/^\s*\[/.test(line)) {
      inTopLevel = false;
    }
    const match = inTopLevel ? line.match(/^\s*([A-Za-z0-9_-]+)\s*=/) : null;
    if (match && wanted.has(match[1])) {
      continue;
    }
    kept.push(line);
  }

  return kept.join('\n');
}

function removeTomlTable(text, tableName) {
  const escaped = escapeRegExp(tableName);
  const re = new RegExp(`(^|\\n)\\[${escaped}\\][\\s\\S]*?(?=\\n\\[[^\\]]+\\]|\\s*$)`, 'g');
  return String(text || '').replace(re, '\n');
}

function preferredCodexModelId() {
  const models = getModels().map((model) => resolveModel(model));
  const preferred = models.find((model) => publicModelId(model) === 'deepseek-v4-pro')
    || models.find((model) => publicModelId(model) === 'deepseek-v4-flash')
    || models.find((model) => String(model.family || '').toLowerCase().includes('deepseek'))
    || models[0];
  if (!preferred) {
    throw new Error('No Matrix OAI models are configured.');
  }
  return publicModelId(preferred);
}

function writeCodexModelsCatalog(catalogPath) {
  let catalog = { models: [] };
  if (fs.existsSync(catalogPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      if (Array.isArray(parsed?.models)) {
        catalog = parsed;
      }
    } catch (error) {
      const backup = `${catalogPath}.matrix-oai-backup-${timestampForFile()}`;
      fs.copyFileSync(catalogPath, backup);
      logInfo(`Existing models_catalog.json was not valid JSON; backed up to ${backup}`);
    }
  }

  const bySlug = new Map((catalog.models || []).map((model) => [model.slug, model]));
  for (const model of getModels().map((item) => resolveModel(item))) {
    const slug = publicModelId(model);
    bySlug.set(slug, codexCatalogModel(model, slug));
  }
  catalog.models = Array.from(bySlug.values());
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

function codexCatalogModel(model, slug) {
  const contextWindow = Number(model.maxInputTokens || model.context_length || 0) || undefined;
  const maxContextWindow = Number(model.context_length || model.maxInputTokens || 0) || contextWindow;
  const reasoning = codexReasoningEffort(model);
  return {
    slug,
    display_name: model.name || model.id || slug,
    description: `Matrix OAI Gateway model routed to ${model.providerId || 'configured provider'}.`,
    default_reasoning_level: reasoning,
    supported_reasoning_levels: codexReasoningLevels(),
    shell_type: 'shell_command',
    visibility: 'list',
    supported_in_api: true,
    priority: slug === 'deepseek-v4-pro' ? 10 : slug === 'deepseek-v4-flash' ? 11 : 50,
    supports_reasoning_summaries: true,
    default_reasoning_summary: 'none',
    support_verbosity: true,
    default_verbosity: 'low',
    supports_parallel_tool_calls: model.supportsTools !== false,
    supports_image_detail_original: modelSupportsImages(model),
    context_window: contextWindow,
    max_context_window: maxContextWindow,
    effective_context_window_percent: 95,
    input_modalities: modelSupportsImages(model) ? ['text', 'image'] : ['text']
  };
}

function codexReasoningEffort(model) {
  const raw = String(model?.reasoning_effort || model?.reasoningEffort || 'high').toLowerCase();
  if (raw === 'max' || raw === 'xhigh' || raw === 'extra_high') return 'xhigh';
  if (raw === 'minimal' || raw === 'none') return 'low';
  if (['low', 'medium', 'high'].includes(raw)) return raw;
  return 'high';
}

function codexReasoningLevels() {
  return [
    { effort: 'low', description: 'Fast responses with lighter reasoning' },
    { effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
    { effort: 'high', description: 'Greater reasoning depth for complex coding tasks' },
    { effort: 'xhigh', description: 'Extra high reasoning depth for complex tasks' }
  ];
}

function tomlString(value) {
  return JSON.stringify(String(value ?? ''));
}

function timestampForFile() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function showConfigPanel() {
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
    } else if (message.command === 'writeCodexConfig') {
      await writeCodexConfigCommand();
    } else if (message.command === 'setThinkingEffort') {
      await setThinkingEffortCommand();
    } else if (message.command === 'setVisionProxyModel') {
      await setVisionProxyModelCommand();
    } else if (message.command === 'output') {
      output?.show();
    } else if (message.command === 'resetUsage') {
      await resetUsageStats();
    } else if (message.command === 'checkBalance') {
      await checkBalanceCommand();
    } else if (message.command === 'toggleModelPickerVisibility') {
      await toggleModelPickerVisibility(message.index);
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

async function toggleModelPickerVisibility(index) {
  const modelIndex = Number(index);
  const models = getConfig().get('models', []);
  if (!Number.isInteger(modelIndex) || modelIndex < 0 || modelIndex >= models.length) {
    vscode.window.showWarningMessage('Matrix OAI model visibility toggle failed: invalid model index.');
    return;
  }

  const model = { ...models[modelIndex] };
  const visible = modelVisibleInPicker(model);
  model.showInModelPicker = !visible;
  model.hidden = visible;
  model.isUserSelectable = !visible;
  model.visible = !visible;
  models[modelIndex] = model;

  await getConfig().update('models', models, vscode.ConfigurationTarget.Global);
  chatProvider?.refreshModelPicker();
  vscode.commands.executeCommand('workbench.action.chat.refreshModels').then(undefined, () => undefined);
  logInfo(`Model picker visibility changed: ${model.name || model.id} -> ${!visible ? 'visible' : 'hidden'}.`);
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
  const thinkingEffort = cfg.get('copilot.thinkingEffort', 'model');
  const visionProxy = cfg.get('copilot.visionProxyModel', '') || 'Auto';
  const visionProxyEnabled = cfg.get('copilot.enableVisionProxy', true);

  const providerRows = providers.map((provider) => `
    <tr>
      <td><code>${escapeHtml(provider.id)}</code></td>
      <td>${escapeHtml(provider.name || provider.id)}</td>
      <td>${escapeHtml(provider.baseUrl)}</td>
      <td>${escapeHtml(provider.apiMode || 'openai')}</td>
      <td><code>${escapeHtml(JSON.stringify(redactHeaders(provider.headers || {})))}</code></td>
    </tr>
  `).join('');

  const modelRows = models.map((rawModel, index) => {
    const model = resolveModel(rawModel);
    const pickerVisible = modelVisibleInPicker(rawModel);
    return `
      <tr>
        <td>${escapeHtml(model.name || model.id)}</td>
        <td><code>${escapeHtml(publicModelId(model))}</code></td>
        <td><code>${escapeHtml(model.providerId || '')}</code></td>
        <td>${escapeHtml(model.baseUrl)}</td>
        <td>${escapeHtml(formatCompactNumber(contextLimitForModel(publicModelId(model)) || model.maxInputTokens || model.context_length || 0))}</td>
        <td>${escapeHtml(formatCompactNumber(model.maxOutputTokens || model.max_tokens || model.maxTokens || 0))}</td>
        <td>${model.supportsTools !== false ? 'Yes' : 'No'}</td>
        <td>${modelSupportsImages(model) ? 'Yes' : 'No'}</td>
        <td>${shouldReplayReasoningContent(model) ? 'Auto' : 'Off'}</td>
        <td><span class="${pickerVisible ? 'ok' : 'off'}">${pickerVisible ? 'Visible' : 'Hidden'}</span></td>
        <td><button class="icon-button" title="${pickerVisible ? 'Hide from model picker' : 'Show in model picker'}" aria-label="${pickerVisible ? 'Hide from model picker' : 'Show in model picker'}" onclick="toggleModel(${index})">${pickerVisible ? eyeOffIcon() : eyeIcon()}</button></td>
      </tr>
    `;
  }).join('');

  const usageRows = Object.entries(stats.byModel || {}).map(([model, row]) => `
    <tr>
      <td>${escapeHtml(model)}</td>
      <td>${escapeHtml(row.source || '')}</td>
      <td>${row.requests || 0}</td>
      <td>${row.errors || 0}</td>
      <td>${formatNumber(row.promptTokens || 0)}</td>
      <td>${formatNumber(row.completionTokens || 0)}</td>
      <td>${formatNumber(row.totalTokens || 0)}</td>
      <td>${Math.round(row.totalLatencyMs / Math.max(row.requests || 1, 1))}ms</td>
    </tr>
  `).join('');
  const last = stats.lastRequest;
  const lastContext = last ? formatContextUsage(last.totalTokens, last.contextLimit) : 'No requests yet';

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
    button.small { padding: 3px 8px; margin: 0; }
    .icon-button { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 24px; padding: 0; margin: 0; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .icon-button svg { width: 16px; height: 16px; stroke: currentColor; }
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
      <div class="label">Copilot Thinking</div>
      <div class="value">${escapeHtml(copilotThinkingEffortLabel(thinkingEffort))}</div>
    </div>
    <div class="card">
      <div class="label">Vision Proxy</div>
      <div class="value">${visionProxyEnabled ? escapeHtml(visionProxy) : 'Off'}</div>
    </div>
    <div class="card">
      <div class="label">Requests</div>
      <div class="value">${formatNumber(stats.requests || 0)}</div>
      <div>${stats.errors || 0} errors</div>
    </div>
    <div class="card">
      <div class="label">Estimated / Reported Tokens</div>
      <div class="value">${formatNumber(stats.totalTokens || 0)}</div>
      <div>${formatNumber(stats.promptTokens || 0)} in / ${formatNumber(stats.completionTokens || 0)} out</div>
    </div>
    <div class="card">
      <div class="label">Last Context</div>
      <div class="value">${escapeHtml(lastContext)}</div>
      <div>${last ? `${escapeHtml(last.modelId)} / ${Math.round(last.latencyMs || 0)}ms` : ''}</div>
    </div>
  </div>

  <h2>Actions</h2>
  <button onclick="send('startProxy')">Start Proxy</button>
  <button onclick="send('stopProxy')" class="secondary">Stop Proxy</button>
  <button onclick="send('restartProxy')" class="secondary">Restart Proxy</button>
  <button onclick="send('addProvider')">Add Provider</button>
  <button onclick="send('addPreset')">Add Preset Model</button>
  <button onclick="send('addModel')" class="secondary">Add Custom Model</button>
  <button onclick="send('writeCodexConfig')">Write Codex Config</button>
  <button onclick="send('setThinkingEffort')">Set Thinking Effort</button>
  <button onclick="send('setVisionProxyModel')">Set Vision Proxy</button>
  <button onclick="send('settings')" class="secondary">Open Settings</button>
  <button onclick="send('output')" class="secondary">Show Output</button>
  <button onclick="send('resetUsage')" class="secondary">Reset Usage</button>
  <button onclick="send('checkBalance')" class="secondary">Check Balance</button>

  <h2>Local Proxy Endpoints</h2>
  <table>
    <tr><th>Kind</th><th>URL</th></tr>
    <tr><td>OpenAI Chat Completions</td><td><code>${escapeHtml(endpoints.openai)}</code></td></tr>
    <tr><td>OpenAI Responses</td><td><code>${escapeHtml(endpoints['openai-responses'])}</code></td></tr>
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
    <tr><th>Name</th><th>Proxy Model ID</th><th>Provider ID</th><th>Base URL</th><th>Context</th><th>Max Out</th><th>Tools</th><th>Images</th><th>Reasoning Replay</th><th>Picker</th><th>Action</th></tr>
    ${modelRows || '<tr><td colspan="11">No configured models.</td></tr>'}
  </table>

  <h2>Usage</h2>
  <table>
    <tr><th>Model</th><th>Source</th><th>Requests</th><th>Errors</th><th>Input</th><th>Output</th><th>Total</th><th>Avg Latency</th></tr>
    ${usageRows || '<tr><td colspan="8">No requests yet.</td></tr>'}
  </table>

  <script>
    const vscode = acquireVsCodeApi();
    function send(command) { vscode.postMessage({ command }); }
    function toggleModel(index) { vscode.postMessage({ command: 'toggleModelPickerVisibility', index }); }
  </script>
</body>
</html>`;
}

function proxyEndpoints() {
  const host = getConfig().get('proxy.host', '127.0.0.1');
  const port = getConfig().get('proxy.port', 8080);
  return {
    openai: `http://${host}:${port}/v1/chat/completions`,
    'openai-responses': `http://${host}:${port}/v1/responses`,
    anthropic: `http://${host}:${port}/v1/messages`,
    models: `http://${host}:${port}/v1/models`
  };
}

function eyeIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
}

function eyeOffIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 10.6A2 2 0 0 0 13.4 13.4"></path><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-3.1 4.2"></path><path d="M6.4 6.4C3.6 8.3 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.1-.8"></path></svg>';
}

function updateStatusBar() {
  if (!statusBar) {
    return;
  }

  const port = getConfig().get('proxy.port', 8080);
  const stats = mergeStats(getPersistedStats(), sessionStats);
  const last = stats.lastRequest;
  const contextText = last ? formatContextUsage(last.totalTokens, last.contextLimit) : 'idle';
  const portText = proxyServer ? `:${port}` : '';
  const balText = cachedBalance ? ` ${balanceLabel(cachedBalance)}` : '';
  statusBar.text = `$(radio-tower) OAI${portText}${balText} ${contextText} ${stats.requests || 0}r/${stats.errors || 0}e`;
  statusBar.tooltip = statusBarTooltip(stats, port);
}

function statusBarTooltip(stats, port) {
  const last = stats.lastRequest;
  const lines = [
    'Matrix OAI Gateway',
    proxyServer ? `Proxy: running on 127.0.0.1:${port}` : 'Proxy: stopped',
    `Providers: ${getProviders().length}`,
    `Configured OAI models: ${getModels().length}`,
    `Requests: ${stats.requests || 0}`,
    `Errors: ${stats.errors || 0}`,
    `Tokens: ${formatNumber(stats.promptTokens || 0)} input / ${formatNumber(stats.completionTokens || 0)} output / ${formatNumber(stats.totalTokens || 0)} total`
  ];
  if (cachedBalance) {
    lines.push(`Balance: ${balanceLabel(cachedBalance)} (${cachedBalance.name || cachedBalance.providerId || 'provider'})`);
  }

  if (last) {
    const cacheHit = last.cacheHitTokens || 0;
    const cacheMiss = last.cacheMissTokens || 0;
    const totalCache = cacheHit + cacheMiss;
    const cacheLine = totalCache > 0
      ? `Last cache: ${formatNumber(cacheHit)} hit / ${formatNumber(cacheMiss)} miss (${Math.round((cacheHit / totalCache) * 100)}%)`
      : 'Last cache: N/A';
    lines.push(
      `Last model: ${last.modelId}`,
      `Last context: ${formatContextUsage(last.totalTokens, last.contextLimit)}`,
      cacheLine,
      `Last latency: ${Math.round(last.latencyMs || 0)}ms`
    );
  }

  const totalHit = stats.cacheHitTokens || 0;
  const totalMiss = stats.cacheMissTokens || 0;
  const totalCacheAll = totalHit + totalMiss;
  if (totalCacheAll > 0) {
    lines.push(`Session cache: ${formatNumber(totalHit)} hit / ${formatNumber(totalMiss)} miss (${Math.round((totalHit / totalCacheAll) * 100)}%)`);
  }

  lines.push('Click to open configuration.');
  return lines.join('\n');
}

function contextLimitForModel(modelId) {
  const configured = findConfiguredModel(modelId);
  if (configured) {
    return Number(configured.maxInputTokens || Math.max(1, Number(configured.context_length || 0) - Number(configured.max_tokens || configured.maxTokens || 0))) || undefined;
  }
  return undefined;
}

function formatContextUsage(tokens, limit) {
  const used = Number(tokens || 0);
  const max = Number(limit || 0);
  if (!max) {
    return `${formatCompactNumber(used)} ctx`;
  }
  const pct = Math.min(999, Math.round((used / max) * 100));
  return `${formatCompactNumber(used)}/${formatCompactNumber(max)} ctx ${pct}%`;
}

function balanceLabel(balance) {
  const provider = shortBalanceProviderName(balance);
  const value = `${balance.balance}${balance.currency || ''}`;
  return provider ? `${provider}:${value}` : value;
}

function shortBalanceProviderName(balance) {
  const raw = String(balance?.providerId || balance?.name || '').toLowerCase();
  if (!raw) return '';
  if (raw.includes('deepseek')) return 'DS';
  if (raw.includes('zhipu') || raw.includes('glm') || raw.includes('bigmodel')) return 'GLM';
  if (raw.includes('dashscope')) return 'Qwen';
  if (raw.includes('openrouter')) return 'OR';
  if (raw.includes('openai')) return 'OA';
  return raw.slice(0, 6).toUpperCase();
}

function formatCompactNumber(value) {
  const num = Number(value || 0);
  if (Math.abs(num) >= 1000000) {
    return `${(num / 1000000).toFixed(num >= 10000000 ? 0 : 1)}m`;
  }
  if (Math.abs(num) >= 1000) {
    return `${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}k`;
  }
  return String(Math.round(num));
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function redactHeaders(headers) {
  const redacted = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (/authorization|api[-_]?key|token|secret/i.test(key)) {
      redacted[key] = value ? '***' : value;
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
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
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    lastRequest: undefined,
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
    merged.cacheHitTokens += stats.cacheHitTokens || 0;
    merged.cacheMissTokens += stats.cacheMissTokens || 0;
    if (isNewerLastRequest(stats.lastRequest, merged.lastRequest)) {
      merged.lastRequest = stats.lastRequest;
    }
    for (const [model, row] of Object.entries(stats.byModel || {})) {
      const target = merged.byModel[model] || emptyModelStats(row.source);
      target.requests += row.requests || 0;
      target.errors += row.errors || 0;
      target.promptTokens += row.promptTokens || 0;
      target.completionTokens += row.completionTokens || 0;
      target.totalTokens += row.totalTokens || 0;
      target.totalLatencyMs += row.totalLatencyMs || 0;
      target.cacheHitTokens += row.cacheHitTokens || 0;
      target.cacheMissTokens += row.cacheMissTokens || 0;
      target.source = row.source || target.source;
      merged.byModel[model] = target;
    }
  }
  return merged;
}

function isNewerLastRequest(candidate, current) {
  if (!candidate?.at) {
    return false;
  }
  if (!current?.at) {
    return true;
  }
  return Date.parse(candidate.at) > Date.parse(current.at);
}

function emptyModelStats(source) {
  return {
    source,
    requests: 0,
    errors: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalLatencyMs: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0
  };
}

function recordUsage(modelId, source, usage, completionChars, latencyMs, providerId) {
  const normalized = normalizeUsage(usage, completionChars);
  applyUsage(sessionStats, modelId, source, normalized, latencyMs, providerId);
  const persisted = getPersistedStats();
  applyUsage(persisted, modelId, source, normalized, latencyMs, providerId);
  persistStats(persisted).then(undefined, (error) => logError('Persist usage failed', error));
  updateStatusBar();
  refreshConfigPanel();
}

function applyUsage(stats, modelId, source, usage, latencyMs, providerId) {
  const resolvedProviderId = providerId || findConfiguredModel(modelId)?.providerId || '';
  const cacheHit = usage.prompt_cache_hit_tokens || 0;
  const cacheMiss = usage.prompt_cache_miss_tokens || 0;
  stats.requests += 1;
  stats.promptTokens += usage.prompt_tokens;
  stats.completionTokens += usage.completion_tokens;
  stats.totalTokens += usage.total_tokens;
  stats.totalLatencyMs += latencyMs || 0;
  stats.cacheHitTokens += cacheHit;
  stats.cacheMissTokens += cacheMiss;
  stats.lastRequest = {
    at: new Date().toISOString(),
    modelId,
    providerId: resolvedProviderId,
    source,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    latencyMs: latencyMs || 0,
    contextLimit: contextLimitForModel(modelId),
    cacheHitTokens: cacheHit,
    cacheMissTokens: cacheMiss
  };

  const row = stats.byModel[modelId] || emptyModelStats(source);
  row.source = source;
  row.providerId = resolvedProviderId || row.providerId;
  row.requests += 1;
  row.promptTokens += usage.prompt_tokens;
  row.completionTokens += usage.completion_tokens;
  row.totalTokens += usage.total_tokens;
  row.totalLatencyMs += latencyMs || 0;
  row.cacheHitTokens += cacheHit;
  row.cacheMissTokens += cacheMiss;
  stats.byModel[modelId] = row;
}

function recordError(modelId, source) {
  applyError(sessionStats, modelId, source);
  const persisted = getPersistedStats();
  applyError(persisted, modelId, source);
  persistStats(persisted).then(undefined, (error) => logError('Persist error stats failed', error));
  updateStatusBar();
  refreshConfigPanel();
}

function applyError(stats, modelId, source) {
  stats.errors += 1;
  const row = stats.byModel[modelId] || emptyModelStats(source);
  row.source = source;
  row.errors += 1;
  stats.byModel[modelId] = row;
}

function normalizeUsage(usage, completionChars) {
  const prompt = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
  const completion = Number(usage?.completion_tokens ?? usage?.output_tokens ?? estimateTokens('x'.repeat(completionChars || 0)));
  const cacheHit = Number(usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? 0);
  const cacheMiss = Number(usage?.prompt_cache_miss_tokens ?? 0);
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: Number(usage?.total_tokens ?? prompt + completion),
    prompt_cache_hit_tokens: cacheHit,
    prompt_cache_miss_tokens: cacheMiss
  };
}

function logCacheMetrics(usage, modelLabel, latencyMs) {
  if (!usage) return;
  const cacheHit = Number(usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? 0);
  const cacheMiss = Number(usage?.prompt_cache_miss_tokens ?? 0);
  const totalPrompt = cacheHit + cacheMiss;
  if (totalPrompt > 0) {
    const hitRate = Math.round((cacheHit / totalPrompt) * 100);
    logInfo(`Cache metrics for ${modelLabel}: hit=${formatNumber(cacheHit)} miss=${formatNumber(cacheMiss)} rate=${hitRate}% latency=${latencyMs}ms`);
  }
  logInfo(`Usage detail for ${modelLabel}: ${JSON.stringify(usage)}`);
}

async function resetUsageStats() {
  sessionStats = createStats();
  await persistStats(createStats());
  logInfo('Usage stats reset.');
  refreshConfigPanel();
}

async function writeClaudeCodeConfigCommand() {
  try {
    await startProxy();
    const result = writeClaudeCodeConfigFiles();
    logInfo('=== Claude Code configuration written ===');
    logInfo(`Settings: ${result.settingsPath}`);
    output?.show();
    vscode.window.showInformationMessage(
      `Claude Code now points to Matrix OAI proxy (${result.proxyUrl}). ANTHROPIC_BASE_URL set in ~/.claude/settings.json`,
      'Show Output'
    ).then((action) => {
      if (action === 'Show Output') output?.show();
    });
  } catch (error) {
    logError('Write Claude Code config failed', error);
    vscode.window.showErrorMessage(`Write Claude Code config failed: ${error.message}`);
  }
}

function writeClaudeCodeConfigFiles() {
  const claudeDir = path.join(os.homedir(), '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const settingsPath = path.join(claudeDir, 'settings.json');
  const host = getConfig().get('proxy.host', '127.0.0.1');
  const port = getConfig().get('proxy.port', 8080);
  const baseUrl = `http://${host}:${port}`;

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { settings = {}; }
  }

  // Claude Code uses env vars: ANTHROPIC_BASE_URL (base URL, SDK appends /v1/messages)
  // and ANTHROPIC_AUTH_TOKEN (API key for the upstream provider)
  settings.env = settings.env || {};
  settings.env.ANTHROPIC_BASE_URL = baseUrl;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return { settingsPath, proxyUrl: baseUrl };
}

async function setAnthropicModelMappingCommand() {
  const config = getConfig();
  const currentMapping = config.get('proxy.anthropicModelMapping', {});

  const items = Object.entries(currentMapping).map(([from, to]) => ({
    label: from,
    description: `→ ${to}`
  }));
  if (items.length === 0) {
    items.push({ label: '(no mappings yet)', description: '' });
  }

  const action = await vscode.window.showQuickPick([
    { label: '$(add) Add new mapping', action: 'add' },
    { label: '$(trash) Remove a mapping', action: 'remove' },
    { label: '$(eye) View current mappings', action: 'view' }
  ], { placeHolder: 'Anthropic model mapping: Claude model name (key) → upstream model ID (value)' });

  if (!action) return;

  if (action.action === 'add') {
    const claudeName = await vscode.window.showInputBox({
      title: 'Add Anthropic model mapping',
      prompt: 'Claude model name (what Claude Code sends, e.g. claude-sonnet-4-20250514)',
      value: 'claude-sonnet-4-20250514',
      ignoreFocusOut: true
    });
    if (!claudeName) return;
    const upstreamId = await vscode.window.showInputBox({
      title: 'Add Anthropic model mapping',
      prompt: 'Upstream model ID (the model your provider uses, e.g. deepseek-v4-pro)',
      ignoreFocusOut: true
    });
    if (!upstreamId) return;
    currentMapping[claudeName] = upstreamId;
    await config.update('proxy.anthropicModelMapping', currentMapping, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Mapping added: ${claudeName} → ${upstreamId}`);
  } else if (action.action === 'remove') {
    const toRemove = await vscode.window.showQuickPick(
      Object.keys(currentMapping).map((k) => ({ label: k, description: `→ ${currentMapping[k]}` })),
      { placeHolder: 'Select mapping to remove' }
    );
    if (!toRemove) return;
    delete currentMapping[toRemove.label];
    await config.update('proxy.anthropicModelMapping', currentMapping, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Mapping removed: ${toRemove.label}`);
  } else if (action.action === 'view') {
    const msg = Object.entries(currentMapping).map(([k, v]) => `${k} → ${v}`).join('\n') || '(none)';
    vscode.window.showInformationMessage(`Current mappings:\n${msg}`, { modal: true });
  }
}

async function setCodexModelMappingCommand() {
  const config = getConfig();
  const currentMapping = config.get('proxy.codexModelMapping', {});

  const action = await vscode.window.showQuickPick([
    { label: '$(add) Add new mapping', action: 'add' },
    { label: '$(trash) Remove a mapping', action: 'remove' },
    { label: '$(eye) View current mappings', action: 'view' }
  ], { placeHolder: 'Codex/OpenAI model mapping: alias model name → configured model ID' });

  if (!action) return;

  if (action.action === 'add') {
    const alias = await vscode.window.showInputBox({
      title: 'Add Codex model mapping',
      prompt: 'Alias model name (what Codex sends, e.g. o3, gpt-4.1)',
      ignoreFocusOut: true
    });
    if (!alias) return;
    const target = await vscode.window.showInputBox({
      title: 'Add Codex model mapping',
      prompt: 'Configured model ID (e.g. deepseek-v4-pro, glm-5.1)',
      ignoreFocusOut: true
    });
    if (!target) return;
    currentMapping[alias] = target;
    await config.update('proxy.codexModelMapping', currentMapping, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Codex mapping added: ${alias} → ${target}`);
  } else if (action.action === 'remove') {
    const toRemove = await vscode.window.showQuickPick(
      Object.keys(currentMapping).map((k) => ({ label: k, description: `→ ${currentMapping[k]}` })),
      { placeHolder: 'Select mapping to remove' }
    );
    if (!toRemove) return;
    delete currentMapping[toRemove.label];
    await config.update('proxy.codexModelMapping', currentMapping, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Codex mapping removed: ${toRemove.label}`);
  } else if (action.action === 'view') {
    const msg = Object.entries(currentMapping).map(([k, v]) => `${k} → ${v}`).join('\n') || '(none)';
    vscode.window.showInformationMessage(`Current Codex mappings:\n${msg}`, { modal: true });
  }
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
