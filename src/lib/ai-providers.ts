/**
 * AI 供应商目录 + 提示词预设（v0.2.0 侧边 AI 聊天面板）。
 *
 * `PROVIDERS` 定义用户在设置中可选的供应商；每家携带默认模型与默认
 * base URL。API 密钥存 OS keychain（Rust ai_keystore），绝不进 localStorage。
 *
 * 大部分厂商遵循 OpenAI Chat Completions wire format，单独列条只为让用户
 * 按品牌选择而无需手动填 base URL。
 */

export type ProviderId =
  // US
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'xai'
  | 'mistral'
  | 'groq'
  // CN
  | 'deepseek'
  | 'qwen'
  | 'glm'
  | 'kimi'
  | 'volcengine'
  | 'siliconflow'
  | 'minimax'
  | 'mimo'
  | 'longcat'
  // Aggregator
  | 'openrouter'
  | 'opencode-go'
  // Local
  | 'ollama'
  | 'custom';

/** Rust 侧使用的 wire format。 */
export type ApiFormat = 'openai' | 'anthropic' | 'ollama';

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  i18nKey?: string;
  apiFormat: ApiFormat;
  defaultModel: string;
  defaultBaseUrl?: string;
  modelHint?: string;
  signupUrl?: string;
  /** 无需账户的本地端点（Ollama / 自建 OpenAI 兼容服务），密钥变为可选。 */
  keyless?: boolean;
}

export const PROVIDERS: ProviderConfig[] = [
  // ---- US providers --------------------------------------------------
  {
    id: 'openai',
    label: 'OpenAI',
    i18nKey: 'providerOpenAI',
    apiFormat: 'openai',
    defaultModel: 'gpt-5.6',
    defaultBaseUrl: 'https://api.openai.com/v1',
    modelHint: 'gpt-5.6 · gpt-5.6-sol · gpt-5.6-terra · gpt-5.6-luna · gpt-5.4-mini',
    signupUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    i18nKey: 'providerAnthropic',
    apiFormat: 'anthropic',
    defaultModel: 'claude-sonnet-4-6',
    defaultBaseUrl: 'https://api.anthropic.com',
    modelHint: 'claude-fable-5 · claude-opus-4-8 · claude-sonnet-4-6 · claude-haiku-4-5',
    signupUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    i18nKey: 'providerGemini',
    apiFormat: 'openai',
    defaultModel: 'gemini-3.1-pro-preview',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelHint:
      'gemini-3.1-pro-preview · gemini-3.6-flash · gemini-3.5-flash · gemini-3.5-flash-lite',
    signupUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    i18nKey: 'providerXai',
    apiFormat: 'openai',
    defaultModel: 'grok-4.5',
    defaultBaseUrl: 'https://api.x.ai/v1',
    modelHint: 'grok-4.5 · grok-4.3 · grok-build-0.1 · grok-4.20-0309-reasoning',
    signupUrl: 'https://console.x.ai',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    i18nKey: 'providerMistral',
    apiFormat: 'openai',
    defaultModel: 'mistral-large-3',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    modelHint: 'mistral-large-3 · mistral-medium-3.1 · mistral-small-4 · devstral-2 · codestral',
    signupUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'groq',
    label: 'Groq (fast inference)',
    i18nKey: 'providerGroq',
    apiFormat: 'openai',
    defaultModel: 'llama-3.3-70b-versatile',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    modelHint:
      'llama-3.3-70b-versatile · meta-llama/llama-4-scout-17b-16e-instruct · openai/gpt-oss-120b · qwen/qwen3-32b',
    signupUrl: 'https://console.groq.com/keys',
  },
  // ---- CN providers --------------------------------------------------
  {
    id: 'deepseek',
    label: 'DeepSeek',
    i18nKey: 'providerDeepseek',
    apiFormat: 'openai',
    defaultModel: 'deepseek-v4-flash',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    modelHint: 'deepseek-v4-pro · deepseek-v4-flash',
    signupUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'qwen',
    label: '通义千问 Qwen (DashScope)',
    i18nKey: 'providerQwen',
    apiFormat: 'openai',
    defaultModel: 'qwen-plus',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelHint:
      'qwen3-max · qwen3.5-plus · qwen-plus · qwen-flash · qwen3-coder-plus · qwen3-coder-flash · qwq-plus · qwen3-vl-plus',
    signupUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
  },
  {
    id: 'glm',
    label: '智谱 GLM',
    i18nKey: 'providerGlm',
    apiFormat: 'openai',
    defaultModel: 'glm-5.2',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelHint: 'glm-5.2 · glm-5.1 · glm-5 · glm-4.7 · glm-4.5-air · glm-5v-turbo',
    signupUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
  },
  {
    id: 'kimi',
    label: 'Moonshot Kimi',
    i18nKey: 'providerKimi',
    apiFormat: 'openai',
    defaultModel: 'kimi-k3',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    modelHint: 'kimi-k3 · kimi-k2-thinking · kimi-k2-turbo-preview · kimi-latest',
    signupUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'volcengine',
    label: '火山方舟 / 豆包 (Volcengine ARK)',
    i18nKey: 'providerVolcengine',
    apiFormat: 'openai',
    defaultModel: 'doubao-seed-2.1-pro',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    modelHint:
      'doubao-seed-2.1-pro · doubao-seed-2.1-turbo · doubao-seed-2.0-lite · doubao-seed-2.0-mini',
    signupUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    i18nKey: 'providerSiliconflow',
    apiFormat: 'openai',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    modelHint:
      'deepseek-ai/DeepSeek-V3 · Qwen/Qwen2.5-Coder-32B-Instruct · moonshotai/Kimi-K2-Instruct',
    signupUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    i18nKey: 'providerMinimax',
    apiFormat: 'openai',
    defaultModel: 'MiniMax-M3',
    defaultBaseUrl: 'https://api.minimax.io/v1',
    modelHint: 'MiniMax-M3 · MiniMax-M2.7',
    signupUrl: 'https://platform.minimax.io/',
  },
  {
    id: 'mimo',
    label: 'Xiaomi MiMo',
    i18nKey: 'providerMimo',
    apiFormat: 'openai',
    defaultModel: 'mimo-v2.5',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    modelHint: 'mimo-v2.5 · mimo-v2.5-pro',
    signupUrl: 'https://platform.xiaomimimo.com/#/console/api-keys',
  },
  {
    id: 'longcat',
    label: 'Meituan LongCat',
    i18nKey: 'providerLongcat',
    apiFormat: 'openai',
    defaultModel: 'LongCat-2.0',
    defaultBaseUrl: 'https://api.longcat.chat/openai',
    modelHint: 'LongCat-2.0',
    signupUrl: 'https://longcat.chat/platform/api_keys',
  },
  // ---- Aggregator ----------------------------------------------------
  {
    id: 'openrouter',
    label: 'OpenRouter (聚合, 400+ 模型)',
    i18nKey: 'providerOpenrouter',
    apiFormat: 'openai',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    modelHint:
      'anthropic/claude-sonnet-4-6 · openai/gpt-5.5 · google/gemini-3.1-pro · deepseek/deepseek-v4 · x-ai/grok-4.20',
    signupUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'opencode-go',
    label: 'OpenCode Go (订阅聚合)',
    i18nKey: 'providerOpencodeGo',
    apiFormat: 'openai',
    defaultModel: 'deepseek-v4-flash',
    defaultBaseUrl: 'https://opencode.ai/zen/go/v1',
    modelHint:
      'deepseek-v4-flash · deepseek-v4-pro · mimo-v2.5 · mimo-v2.5-pro · qwen3.8-max · glm-5.2 · kimi-k3 · minimax-m3',
    signupUrl: 'https://opencode.ai/auth',
  },
  // ---- Local ---------------------------------------------------------
  {
    id: 'ollama',
    label: 'Ollama (本地 / local)',
    i18nKey: 'providerOllama',
    apiFormat: 'ollama',
    defaultModel: 'qwen2.5:7b',
    defaultBaseUrl: 'http://localhost:11434',
    modelHint: 'qwen2.5 · llama3.2 · deepseek-r1 · gemma3 · mistral · phi3',
    keyless: true,
  },
  {
    id: 'custom',
    label: '自定义服务 / Custom (OpenAI · Anthropic 兼容)',
    i18nKey: 'providerCustom',
    apiFormat: 'openai',
    defaultModel: '',
    defaultBaseUrl: '',
    modelHint: 'deepseek-chat · gpt-4o-mini · claude-sonnet-4-6 · glm-4.5 …（填供应商提供的模型 ID）',
  },
];

/** 解析 provider 别名（local → ollama；各类本地/自定义端点 → custom）。 */
const PROVIDER_ALIASES: Record<string, string> = {
  local: 'ollama',
  llama: 'custom',
  'llama-cpp': 'custom',
  llamacpp: 'custom',
  'llama.cpp': 'custom',
  lmstudio: 'custom',
  'lm-studio': 'custom',
  vllm: 'custom',
  custom: 'custom',
  'openai-compat': 'custom',
  'openai-compatible': 'custom',
};

export function resolveProvider(id: string): string {
  return PROVIDER_ALIASES[id] ?? id;
}

export function providerById(id: string): ProviderConfig | undefined {
  const canonical = resolveProvider(id);
  return PROVIDERS.find((p) => p.id === canonical);
}
