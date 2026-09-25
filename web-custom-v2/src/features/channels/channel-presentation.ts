import type { Tone } from '@/components/ui'
import type { Channel, ChannelWritePayload } from '@/features/channels/api'

/**
 * README — what this page deliberately does NOT do.
 *
 * · Channel keys are never read back. `POST /api/channel/:id/key` is the only endpoint
 *   that returns one; it is root-only AND gated by `SecureVerificationRequired`, which
 *   answers `{"code":"SECURITY_PROOF_REQUIRED"}` until a 2FA proof is presented. That
 *   flow does not exist in this console, so the drawer never shows a stored key at all.
 * · Tag mode (`tag_mode=true`, `PUT /api/channel/tag`, `POST /api/channel/tag/enabled`
 *   and `/tag/disabled`) groups channels by tag and edits a whole tag at once. Not built.
 * · Multi-key management (`POST /api/channel/multi_key/manage`), Ollama model pulls,
 *   Codex credential refresh/usage and the upstream-model-update detector are separate
 *   sub-consoles in the legacy UI and are not built here.
 * · `GET /api/channel/test` (test every channel) enqueues a background system task
 *   rather than testing inline; it belongs with the system-task console, not here.
 */

// ---------------------------------------------------------------------------
// Channel types
// ---------------------------------------------------------------------------

/**
 * `constant.ChannelTypeNames` (constant/channel.go), verbatim. These are provider brand
 * names, not translatable copy, so they are NOT passed through `t()`.
 */
export const CHANNEL_TYPE_NAMES: Record<number, string> = {
  0: 'Unknown',
  1: 'OpenAI',
  2: 'Midjourney',
  3: 'Azure',
  4: 'Ollama',
  5: 'MidjourneyPlus',
  6: 'OpenAIMax',
  7: 'OhMyGPT',
  8: 'Custom',
  9: 'AILS',
  10: 'AIProxy',
  11: 'PaLM',
  12: 'API2GPT',
  13: 'AIGC2D',
  14: 'Anthropic',
  15: 'Baidu',
  16: 'Zhipu',
  17: 'Ali',
  18: 'Xunfei',
  19: '360',
  20: 'OpenRouter',
  21: 'AIProxyLibrary',
  22: 'FastGPT',
  23: 'Tencent',
  24: 'Gemini',
  25: 'Moonshot',
  26: 'ZhipuV4',
  27: 'Perplexity',
  31: 'LingYiWanWu',
  33: 'AWS',
  34: 'Cohere',
  35: 'MiniMax',
  36: 'SunoAPI',
  37: 'Dify',
  38: 'Jina',
  39: 'Cloudflare',
  40: 'SiliconFlow',
  41: 'VertexAI',
  42: 'Mistral',
  43: 'DeepSeek',
  44: 'MokaAI',
  45: 'VolcEngine',
  46: 'BaiduV2',
  47: 'Xinference',
  48: 'xAI',
  49: 'Coze',
  50: 'Kling',
  51: 'Jimeng',
  52: 'Vidu',
  53: 'Submodel',
  54: 'DoubaoVideo',
  55: 'Sora',
  56: 'Replicate',
  57: 'ChatGPT Subscription (Codex)',
  58: 'Advanced Custom',
  59: 'Sub2API',
  60: 'New API',
}

export function channelTypeName(type: number): string {
  return CHANNEL_TYPE_NAMES[type] ?? `#${type}`
}

/**
 * `constant.ChannelBaseURLs` (constant/channel.go), for the types this console offers.
 * An empty entry means the provider has no built-in address and the field is required.
 */
const DEFAULT_BASE_URLS: Record<number, string> = {
  1: 'https://api.openai.com',
  2: 'https://oa.api2d.net',
  4: 'http://localhost:11434',
  7: 'https://api.ohmygpt.com',
  10: 'https://api.aiproxy.io',
  12: 'https://api.api2gpt.com',
  13: 'https://api.aigc2d.com',
  14: 'https://api.anthropic.com',
  15: 'https://aip.baidubce.com',
  16: 'https://open.bigmodel.cn',
  17: 'https://dashscope.aliyuncs.com',
  19: 'https://api.360.cn',
  20: 'https://openrouter.ai/api',
  22: 'https://fastgpt.run/api/openapi',
  23: 'https://hunyuan.tencentcloudapi.com',
  24: 'https://generativelanguage.googleapis.com',
  25: 'https://api.moonshot.cn',
  26: 'https://open.bigmodel.cn',
  27: 'https://api.perplexity.ai',
  31: 'https://api.lingyiwanwu.com',
  34: 'https://api.cohere.ai',
  35: 'https://api.minimax.chat',
  37: 'https://api.dify.ai',
  38: 'https://api.jina.ai',
  39: 'https://api.cloudflare.com',
  40: 'https://api.siliconflow.cn',
  42: 'https://api.mistral.ai',
  43: 'https://api.deepseek.com',
  44: 'https://api.moka.ai',
  45: 'https://ark.cn-beijing.volces.com',
  46: 'https://qianfan.baidubce.com',
  48: 'https://api.x.ai',
  49: 'https://api.coze.cn',
  50: 'https://api.klingai.com',
  51: 'https://visual.volcengineapi.com',
  52: 'https://api.vidu.cn',
  53: 'https://llm.submodel.ai',
  54: 'https://ark.cn-beijing.volces.com',
  55: 'https://api.openai.com',
  56: 'https://api.replicate.com',
  57: 'https://chatgpt.com',
}

export function defaultBaseUrl(type: number): string {
  return DEFAULT_BASE_URLS[type] ?? ''
}

/**
 * `controller.updateChannelBalance` (controller/channel-billing.go) has a real
 * implementation only for these types; every other type answers "尚未实现". The row
 * action is disabled with that reason rather than firing a call that cannot work.
 */
export const SUPPORTS_BALANCE_TYPES = new Set([1, 8, 10, 12, 13, 20, 25, 40, 43])

/**
 * The client-side allowlist the legacy console uses for "fetch models from upstream".
 * The Go handler falls through to `GET {base_url}/v1/models` for anything else, which
 * predictably fails for providers that do not speak the OpenAI model API, so the button
 * is only offered for the types that are known to answer.
 */
export const SUPPORTS_MODEL_FETCH_TYPES = new Set([
  1, 4, 14, 17, 20, 23, 24, 25, 26, 27, 31, 34, 35, 40, 42, 43, 47, 48, 57, 58, 59, 60,
])

/**
 * `type 58` (Advanced Custom) is refused at creation unless `settings.advanced_custom`
 * describes at least one route (`model.Channel.ValidateSettings`). This console has no
 * route editor, so 58 is not offered as a NEW channel type; an existing 58 channel can
 * still be edited because unknown `settings` keys are preserved verbatim.
 */
export const CREATE_BLOCKED_TYPES = new Set([58])

/** The order the type picker offers, mirroring the legacy console's grouping. */
const TYPE_DISPLAY_ORDER = [
  1, 14, 33, 24, 43, 3, 41, 48, 60, 58, 42, 34, 20, 4, 40, 27, 25, 17, 26, 15, 46, 23, 18,
  45, 31, 35, 49, 19, 47, 37, 38, 39, 8, 57, 59, 22, 44, 2, 5, 36, 50, 51, 52, 53, 54, 55,
  56, 7, 10, 12, 13, 16, 21, 6, 9, 11,
]

export function channelTypeOptions(): { value: number; label: string }[] {
  const seen = new Set<number>()
  const ordered: { value: number; label: string }[] = []
  for (const id of TYPE_DISPLAY_ORDER) {
    const label = CHANNEL_TYPE_NAMES[id]
    if (label === undefined || seen.has(id)) continue
    seen.add(id)
    ordered.push({ label, value: id })
  }
  for (const [key, label] of Object.entries(CHANNEL_TYPE_NAMES)) {
    const id = Number(key)
    if (id === 0 || seen.has(id)) continue
    ordered.push({ label, value: id })
  }
  return ordered
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** `common.ChannelStatus*` (common/constants.go). */
export const CHANNEL_STATUS = {
  unknown: 0,
  enabled: 1,
  manuallyDisabled: 2,
  autoDisabled: 3,
} as const

export const CHANNEL_STATUS_LABEL: Record<number, string> = {
  0: 'Unknown',
  1: 'Enabled',
  2: 'Disabled',
  3: 'Auto-disabled',
}

export const CHANNEL_STATUS_TONE: Record<number, Tone> = {
  0: 'muted',
  1: 'success',
  2: 'destructive',
  3: 'warning',
}

export function channelStatusLabel(status: number): string {
  return CHANNEL_STATUS_LABEL[status] ?? 'Unknown'
}

export function channelStatusTone(status: number): Tone {
  return CHANNEL_STATUS_TONE[status] ?? 'muted'
}

/**
 * `other_info` is a server-written JSON blob. When the server auto-disables a channel it
 * records why, e.g. {"status_reason":"manual batch operation","status_time":1788052084}.
 * Anything unparseable is treated as "no reason recorded" rather than surfaced raw.
 */
export function channelStatusReason(channel: Channel): string | undefined {
  if (channel.other_info === '') return undefined
  try {
    const parsed: unknown = JSON.parse(channel.other_info)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const reason = (parsed as Record<string, unknown>).status_reason
    return typeof reason === 'string' && reason !== '' ? reason : undefined
  } catch {
    return undefined
  }
}

/** Response-time buckets, in milliseconds, as the legacy console grades them. */
export function responseTimeTone(milliseconds: number): Tone {
  if (milliseconds <= 0) return 'muted'
  if (milliseconds < 1000) return 'success'
  if (milliseconds < 3000) return 'warning'
  return 'destructive'
}

/** Splits a comma-separated server list into trimmed, non-empty entries. */
export function splitList(value: string | null): string[] {
  if (value === null || value === '') return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

// ---------------------------------------------------------------------------
// Per-type form shape
// ---------------------------------------------------------------------------

/** The extra `settings` / `setting` controls a given provider type needs. */
export type ChannelExtraField =
  | 'azure_responses_version'
  | 'vertex_key_type'
  | 'aws_key_type'
  | 'openrouter_enterprise'
  | 'claude_beta_query'
  | 'allow_service_tier'
  | 'allow_inference_geo'
  | 'allow_speed'
  | 'allow_safety_identifier'
  | 'disable_store'
  | 'allow_include_obfuscation'

export type ChannelTypeSpec = {
  /** Overrides the generic "Base URL" field copy; omit for the generic optional one. */
  baseUrl?: {
    label: string
    description: string
    placeholder: string
    required?: boolean
  }
  /** The `other` column, whose meaning is entirely per-type. Omit to hide the field. */
  other?: {
    label: string
    description: string
    placeholder: string
    required?: boolean
    multiline?: boolean
    /** Pre-filled on a new channel of this type. */
    initial?: string
  }
  /** Sits under the key field, describing the format the provider expects. */
  keyHint?: string
  /** Renders the key as a multi-line JSON credential rather than a password field. */
  keyIsJson?: boolean
  showOrganization?: boolean
  extras?: ChannelExtraField[]
  /** A caveat shown above the credential fields. */
  warning?: string
}

/**
 * Per-type field shape, ported from the legacy channel drawer. Only the types listed
 * here get bespoke fields; every other type falls back to the generic
 * name / key / optional base URL / models form, which is what the legacy console also
 * renders for them.
 */
export const CHANNEL_TYPE_SPECS: Record<number, ChannelTypeSpec> = {
  1: {
    extras: [
      'allow_service_tier',
      'disable_store',
      'allow_safety_identifier',
      'allow_include_obfuscation',
      'allow_inference_geo',
    ],
    keyHint: 'Usually starts with sk-. One key per line in batch or multi-key mode.',
    showOrganization: true,
  },
  3: {
    baseUrl: {
      description: 'The resource endpoint Azure issued, without a path.',
      label: 'Azure OpenAI endpoint',
      placeholder: 'https://example-resource.openai.azure.com',
      required: true,
    },
    other: {
      description: 'Sent as api-version on every request to this channel.',
      initial: '2024-12-01-preview',
      label: 'Default API version',
      placeholder: '2024-12-01-preview',
      required: true,
    },
    extras: ['azure_responses_version'],
    keyHint: 'One of the two keys from the Azure resource, not an OpenAI key.',
    warning: 'Model names are the deployment names configured in the Azure resource.',
  },
  8: {
    baseUrl: {
      description: 'The complete URL, including the path. The {model} placeholder is substituted per request.',
      label: 'Full request URL',
      placeholder: 'https://api.example.com/v1/chat/completions',
      required: true,
    },
    warning: 'To relay another One API or New API deployment, use the OpenAI type instead.',
  },
  14: {
    extras: ['claude_beta_query', 'allow_service_tier', 'allow_inference_geo', 'allow_speed'],
    keyHint: 'Usually starts with sk-ant-.',
  },
  18: {
    other: {
      description: 'The version segment of the Spark API URL.',
      initial: 'v2.1',
      label: 'Model version',
      placeholder: 'v2.1',
      required: true,
    },
    keyHint: 'Format: APPID|APISecret|APIKey',
  },
  15: { keyHint: 'Format: APIKey|SecretKey' },
  20: {
    extras: ['openrouter_enterprise'],
  },
  22: {
    baseUrl: {
      description: 'Only needed for a private FastGPT deployment.',
      label: 'Deployment URL',
      placeholder: 'https://fastgpt.run/api/openapi',
    },
    keyHint: 'Format: APIKey-AppId',
  },
  23: { keyHint: 'A TokenHub API key, or the legacy AppId|SecretId|SecretKey triple.' },
  33: {
    extras: ['aws_key_type'],
    keyHint: 'AK/SK mode: AccessKey|SecretAccessKey|Region. API key mode: APIKey|Region.',
    warning: 'Model names are Bedrock model ids, e.g. anthropic.claude-3-5-sonnet-20241022-v2:0.',
  },
  36: {
    baseUrl: {
      description: 'The prefix before /suno — usually just the host.',
      label: 'API base URL',
      placeholder: 'https://api.example.com',
      required: true,
    },
  },
  37: {
    warning: 'Dify channels support chatflow and agent only, and agent does not accept images.',
  },
  39: {
    other: {
      description: 'Found on the Cloudflare dashboard overview page.',
      label: 'Account ID',
      placeholder: 'd6b5da8hk1awo8nap34ube6gh',
      required: true,
    },
  },
  41: {
    extras: ['vertex_key_type'],
    keyHint: 'The service account JSON, or an API key when the key format is set to API key.',
    keyIsJson: true,
    other: {
      description: 'A JSON object that must contain a "default" entry; add per-model entries beside it.',
      initial: '{"default": "us-central1"}',
      label: 'Deployment regions',
      multiline: true,
      placeholder: '{"default": "us-central1", "claude-3-5-sonnet@20240620": "europe-west1"}',
      required: true,
    },
  },
  45: {
    baseUrl: {
      description: 'The Ark endpoint for the region this account belongs to.',
      label: 'API base URL',
      placeholder: 'https://ark.cn-beijing.volces.com',
    },
  },
  49: {
    other: {
      description: 'The bot this channel talks to.',
      label: 'Agent ID',
      placeholder: '7342866812345',
      required: true,
    },
  },
  50: { keyHint: 'Format: AccessKey|SecretKey, or a plain API key when the upstream is New API.' },
  51: { keyHint: 'Format: Access Key ID|Secret Access Key' },
  57: {
    keyHint: 'The Codex OAuth credential JSON. It must contain access_token and account_id.',
    keyIsJson: true,
    extras: [
      'allow_service_tier',
      'disable_store',
      'allow_safety_identifier',
      'allow_include_obfuscation',
      'allow_inference_geo',
    ],
    warning: 'Personal use only. Do not share these credentials or use them outside the Codex CLI flow.',
  },
  60: {
    baseUrl: {
      description: 'Required: a New API channel has no built-in address.',
      label: 'Upstream base URL',
      placeholder: 'https://gateway.example.com',
      required: true,
    },
  },
}

export function channelTypeSpec(type: number): ChannelTypeSpec {
  return CHANNEL_TYPE_SPECS[type] ?? {}
}

// ---------------------------------------------------------------------------
// Form values
// ---------------------------------------------------------------------------

export type ChannelFormValues = {
  name: string
  type: number
  key: string
  base_url: string
  other: string
  models: string
  groups: string[]
  model_mapping: string
  status_code_mapping: string
  param_override: string
  header_override: string
  openai_organization: string
  test_model: string
  priority: string
  weight: string
  auto_ban: boolean
  tag: string
  remark: string
  /** `setting` — dto.ChannelSettings */
  proxy: string
  force_format: boolean
  thinking_to_content: boolean
  pass_through_body_enabled: boolean
  system_prompt: string
  system_prompt_override: boolean
  /** '' | 'auto' | 'http1' — anything else is refused by ValidateHTTPTransport. */
  http_protocol: string
  /** 1–8; '' means unset (treated as 1). */
  http2_connection_shards: string
  /** `settings` — dto.ChannelOtherSettings */
  azure_responses_version: string
  vertex_key_type: string
  aws_key_type: string
  openrouter_enterprise: boolean
  claude_beta_query: boolean
  allow_service_tier: boolean
  allow_inference_geo: boolean
  allow_speed: boolean
  allow_safety_identifier: boolean
  disable_store: boolean
  allow_include_obfuscation: boolean
  /** Create-only */
  mode: 'single' | 'batch' | 'multi_to_single'
  multi_key_mode: 'random' | 'polling'
  batch_add_set_key_prefix_2_name: boolean
}

const BOOLEAN_SETTING_KEYS = [
  'force_format',
  'thinking_to_content',
  'pass_through_body_enabled',
  'system_prompt_override',
] as const

const BOOLEAN_OTHER_SETTING_KEYS = [
  'claude_beta_query',
  'allow_service_tier',
  'allow_inference_geo',
  'allow_speed',
  'allow_safety_identifier',
  'disable_store',
  'allow_include_obfuscation',
] as const

/** Parses a JSON string column into a plain record, tolerating '' and malformed data. */
export function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (value === null || value === undefined || value.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

export function emptyChannelForm(): ChannelFormValues {
  return {
    allow_include_obfuscation: false,
    allow_inference_geo: false,
    allow_safety_identifier: false,
    allow_service_tier: false,
    allow_speed: false,
    auto_ban: true,
    aws_key_type: 'ak_sk',
    azure_responses_version: '',
    base_url: '',
    batch_add_set_key_prefix_2_name: false,
    claude_beta_query: false,
    disable_store: false,
    force_format: false,
    groups: ['default'],
    header_override: '',
    http2_connection_shards: '',
    http_protocol: '',
    key: '',
    mode: 'single',
    model_mapping: '',
    models: '',
    multi_key_mode: 'random',
    name: '',
    openai_organization: '',
    openrouter_enterprise: false,
    other: '',
    param_override: '',
    pass_through_body_enabled: false,
    priority: '0',
    proxy: '',
    remark: '',
    status_code_mapping: '',
    system_prompt: '',
    system_prompt_override: false,
    tag: '',
    test_model: '',
    thinking_to_content: false,
    type: 1,
    vertex_key_type: 'json',
    weight: '0',
  }
}

/**
 * Applies the per-type defaults a freshly chosen provider type implies.
 *
 * `base_url` is deliberately left alone: it is a sensitive field, and blanking it on a
 * type change would quietly clear a stored address just because the admin looked at
 * another type. `other` means something different for every type, so it is cleared when
 * the new type has no use for it and seeded only when it is currently empty.
 */
export function applyTypeDefaults(values: ChannelFormValues, type: number): ChannelFormValues {
  const spec = channelTypeSpec(type)
  if (spec.other === undefined) return { ...values, other: '', type }
  return {
    ...values,
    other: values.other.trim() === '' ? spec.other.initial ?? '' : values.other,
    type,
  }
}

export function channelToForm(channel: Channel): ChannelFormValues {
  const setting = parseJsonRecord(channel.setting)
  const other = parseJsonRecord(channel.settings)
  const base = emptyChannelForm()
  // `http2_connection_shards` belongs to `setting` (dto.ChannelSettings), not `settings`.
  const shards = setting.http2_connection_shards

  return {
    ...base,
    allow_include_obfuscation: readBoolean(other, 'allow_include_obfuscation'),
    allow_inference_geo: readBoolean(other, 'allow_inference_geo'),
    allow_safety_identifier: readBoolean(other, 'allow_safety_identifier'),
    allow_service_tier: readBoolean(other, 'allow_service_tier'),
    allow_speed: readBoolean(other, 'allow_speed'),
    auto_ban: channel.auto_ban !== 0,
    aws_key_type: readString(other, 'aws_key_type') === 'api_key' ? 'api_key' : 'ak_sk',
    azure_responses_version: readString(other, 'azure_responses_version'),
    base_url: channel.base_url ?? '',
    claude_beta_query: readBoolean(other, 'claude_beta_query'),
    disable_store: readBoolean(other, 'disable_store'),
    force_format: readBoolean(setting, 'force_format'),
    groups: splitList(channel.group),
    header_override: channel.header_override ?? '',
    http2_connection_shards: typeof shards === 'number' && shards > 0 ? String(shards) : '',
    http_protocol: readString(setting, 'http_protocol'),
    key: '',
    model_mapping: channel.model_mapping ?? '',
    models: channel.models,
    name: channel.name,
    openai_organization: channel.openai_organization ?? '',
    openrouter_enterprise: readBoolean(other, 'openrouter_enterprise'),
    other: channel.other,
    param_override: channel.param_override ?? '',
    pass_through_body_enabled: readBoolean(setting, 'pass_through_body_enabled'),
    priority: String(channel.priority ?? 0),
    proxy: readString(setting, 'proxy'),
    remark: channel.remark ?? '',
    status_code_mapping: channel.status_code_mapping ?? '',
    system_prompt: readString(setting, 'system_prompt'),
    system_prompt_override: readBoolean(setting, 'system_prompt_override'),
    tag: channel.tag ?? '',
    test_model: channel.test_model ?? '',
    thinking_to_content: readBoolean(setting, 'thinking_to_content'),
    type: channel.type,
    vertex_key_type: readString(other, 'vertex_key_type') === 'api_key' ? 'api_key' : 'json',
    weight: String(channel.weight ?? 0),
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ChannelFormErrorCode =
  | 'name-required'
  | 'key-required'
  | 'models-required'
  | 'groups-required'
  | 'base-url-required'
  | 'other-required'
  | 'vertex-region-shape'
  | 'codex-key-shape'
  | 'json-invalid'
  | 'priority-invalid'
  | 'weight-invalid'
  | 'shards-invalid'
  | 'shards-with-http1'

export type ChannelFormError = {
  code: ChannelFormErrorCode
  /** The parser's own message, for the JSON fields. Never contains the field value. */
  detail?: string
}

export type ChannelFormErrors = Partial<Record<keyof ChannelFormValues, ChannelFormError>>

/**
 * Validates one JSON-shaped textarea. An empty field is always valid; a non-empty one
 * must parse AND be a plain object, because every consumer of these columns unmarshals
 * into a map. The parser's message is carried through so the admin sees *why* it failed
 * rather than a generic "invalid JSON".
 */
export function validateJsonObjectField(value: string): ChannelFormError | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    return {
      code: 'json-invalid',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { code: 'json-invalid', detail: 'Expected a JSON object.' }
  }
  return undefined
}

function validateIntegerField(
  value: string,
  code: ChannelFormErrorCode,
): ChannelFormError | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (!/^-?\d+$/.test(trimmed)) return { code }
  return undefined
}

export function validateChannelForm(
  values: ChannelFormValues,
  options: { isEdit: boolean },
): ChannelFormErrors {
  const errors: ChannelFormErrors = {}
  const spec = channelTypeSpec(values.type)

  if (values.name.trim() === '') errors.name = { code: 'name-required' }

  // `validateChannel(channel, isAdd=true)` refuses an empty key outright. On update the
  // key is optional and an empty one deliberately keeps the stored secret.
  if (!options.isEdit && values.key.trim() === '') errors.key = { code: 'key-required' }

  if (values.models.trim() === '') errors.models = { code: 'models-required' }
  if (values.groups.length === 0) errors.groups = { code: 'groups-required' }

  if (spec.baseUrl?.required === true && values.base_url.trim() === '') {
    errors.base_url = { code: 'base-url-required' }
  }

  if (spec.other?.required === true && values.other.trim() === '') {
    errors.other = { code: 'other-required' }
  }

  // `validateChannel`: Vertex AI requires `other` to be a JSON object carrying "default".
  if (values.type === 41 && values.other.trim() !== '') {
    const shape = validateJsonObjectField(values.other)
    if (shape !== undefined) {
      errors.other = shape
    } else {
      const parsed = parseJsonRecord(values.other)
      const fallback = parsed.default
      if (typeof fallback !== 'string' || fallback.trim() === '') {
        errors.other = { code: 'vertex-region-shape' }
      }
    }
  }

  // `validateChannel`: a Codex key must be a JSON object with access_token and account_id.
  const codexKeyProvided = values.key.trim() !== ''
  if (values.type === 57 && (codexKeyProvided || !options.isEdit)) {
    const parsed = parseJsonRecord(values.key)
    const accessToken = parsed.access_token
    const accountId = parsed.account_id
    const valid = typeof accessToken === 'string'
      && accessToken.trim() !== ''
      && typeof accountId === 'string'
      && accountId.trim() !== ''
    if (!valid) errors.key = { code: 'codex-key-shape' }
  }

  for (const field of ['model_mapping', 'param_override', 'header_override', 'status_code_mapping'] as const) {
    const error = validateJsonObjectField(values[field])
    if (error !== undefined) errors[field] = error
  }

  const priorityError = validateIntegerField(values.priority, 'priority-invalid')
  if (priorityError !== undefined) errors.priority = priorityError

  const weightError = validateIntegerField(values.weight, 'weight-invalid')
  if (weightError !== undefined) errors.weight = weightError

  // `dto.ChannelSettings.ValidateHTTPTransport`.
  const shards = values.http2_connection_shards.trim()
  if (shards !== '') {
    const parsed = Number(shards)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 8) {
      errors.http2_connection_shards = { code: 'shards-invalid' }
    } else if (values.http_protocol === 'http1' && parsed > 1) {
      errors.http2_connection_shards = { code: 'shards-with-http1' }
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Payload building
// ---------------------------------------------------------------------------

function numberOrZero(value: string): number {
  const trimmed = value.trim()
  if (trimmed === '') return 0
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

/**
 * Almost every field of `dto.ChannelSettings` and `dto.ChannelOtherSettings` carries
 * `omitempty`, so Go never writes a false, an empty string, a zero or an empty list.
 * Normalising the same way on this side means a re-serialised blob compares equal to the
 * stored one whenever nothing actually changed — which is what keeps a routing-only edit
 * from tripping the server's sensitive-write gate.
 *
 * `openrouter_enterprise` is the exception: it is a `*bool`, so an explicit `false` is a
 * real stored value rather than an absent one, and it is preserved.
 */
const MEANINGFUL_FALSE_KEYS = new Set(['openrouter_enterprise'])

function normalizeSettings(record: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    const value = record[key]
    if (value === null || value === undefined || value === '' || value === 0) continue
    if (value === false && !MEANINGFUL_FALSE_KEYS.has(key)) continue
    if (Array.isArray(value) && value.length === 0) continue
    normalized[key] = value
  }
  return normalized
}

/** '' when nothing is left — the same empty column the server starts a channel with. */
function serializeSettings(record: Record<string, unknown>): string {
  const normalized = normalizeSettings(record)
  return Object.keys(normalized).length === 0 ? '' : JSON.stringify(normalized)
}

/**
 * Rebuilds the `setting` JSON string, merging over whatever the server already stored so
 * keys this console has no control for survive the round trip untouched.
 */
export function buildSettingJson(
  values: ChannelFormValues,
  existing: Record<string, unknown>,
): string {
  const next: Record<string, unknown> = { ...existing }
  next.proxy = values.proxy.trim()
  for (const key of BOOLEAN_SETTING_KEYS) next[key] = values[key]
  next.system_prompt = values.system_prompt.trim()
  next.http_protocol = values.http_protocol
  const shards = values.http2_connection_shards.trim()
  next.http2_connection_shards = shards === '' ? 0 : Number(shards)
  return serializeSettings(next)
}

/**
 * Rebuilds the `settings` (dto.ChannelOtherSettings) JSON string. Only the extras the
 * chosen type actually exposes are written; everything else — including
 * `advanced_custom` and the upstream-model-update bookkeeping this console does not
 * edit — is carried over from the stored value.
 */
export function buildOtherSettingsJson(
  values: ChannelFormValues,
  existing: Record<string, unknown>,
): string {
  const spec = channelTypeSpec(values.type)
  const extras = new Set<ChannelExtraField>(spec.extras ?? [])
  const next: Record<string, unknown> = { ...existing }

  for (const key of BOOLEAN_OTHER_SETTING_KEYS) {
    if (!extras.has(key)) continue
    next[key] = values[key]
  }

  if (extras.has('azure_responses_version')) {
    next.azure_responses_version = values.azure_responses_version.trim()
  }
  if (extras.has('vertex_key_type')) next.vertex_key_type = values.vertex_key_type
  if (extras.has('aws_key_type')) next.aws_key_type = values.aws_key_type
  if (extras.has('openrouter_enterprise')) next.openrouter_enterprise = values.openrouter_enterprise

  return serializeSettings(next)
}

/** The fields that flow into every write, sensitive or not. */
function buildBasePayload(values: ChannelFormValues): ChannelWritePayload {
  const spec = channelTypeSpec(values.type)
  return {
    auto_ban: values.auto_ban ? 1 : 0,
    base_url: values.base_url.trim(),
    group: values.groups.join(','),
    header_override: values.header_override.trim(),
    model_mapping: values.model_mapping.trim(),
    models: values.models
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
      .join(','),
    name: values.name.trim(),
    openai_organization: spec.showOrganization === true ? values.openai_organization.trim() : '',
    other: values.other.trim(),
    param_override: values.param_override.trim(),
    priority: numberOrZero(values.priority),
    remark: values.remark.trim(),
    status_code_mapping: values.status_code_mapping.trim(),
    tag: values.tag.trim() === '' ? null : values.tag.trim(),
    test_model: values.test_model.trim(),
    type: values.type,
    weight: Math.max(0, numberOrZero(values.weight)),
  }
}

export function buildCreatePayload(values: ChannelFormValues): {
  mode: ChannelFormValues['mode']
  multi_key_mode?: 'random' | 'polling'
  batch_add_set_key_prefix_2_name?: boolean
  channel: ChannelWritePayload
} {
  const channel: ChannelWritePayload = {
    ...buildBasePayload(values),
    key: values.key.trim(),
    setting: buildSettingJson(values, {}),
    settings: buildOtherSettingsJson(values, {}),
  }
  return {
    channel,
    mode: values.mode,
    ...(values.mode === 'multi_to_single' ? { multi_key_mode: values.multi_key_mode } : {}),
    ...(values.mode === 'batch'
      ? { batch_add_set_key_prefix_2_name: values.batch_add_set_key_prefix_2_name }
      : {}),
  }
}

/**
 * The fields `controller.channelSensitiveFields` gates behind ChannelSensitiveWrite. A
 * `channel:write`-only administrator is refused outright when ANY of these is present in
 * the body AND differs from the stored row, so an unchanged one is dropped rather than
 * echoed back.
 */
const SENSITIVE_PAYLOAD_FIELDS = [
  'type',
  'base_url',
  'openai_organization',
  'header_override',
  'param_override',
  'setting',
  'other',
  'settings',
] as const

/**
 * Builds the `PUT /api/channel/` body.
 *
 * Two rules drive the shape:
 *  1. `key` is included ONLY when the admin typed one. An omitted key leaves the stored
 *     secret alone (GORM `Updates` skips the zero value) — verified on the dev server.
 *  2. Every sensitive field whose value equals the stored one is dropped, so editing
 *     models or priority alone never trips `channelHasSensitiveChanges`.
 */
export function buildUpdatePayload(
  values: ChannelFormValues,
  current: Channel,
): ChannelWritePayload & { id: number } {
  const base = buildBasePayload(values)
  const candidate: ChannelWritePayload & { id: number } = {
    ...base,
    id: current.id,
    setting: buildSettingJson(values, parseJsonRecord(current.setting)),
    settings: buildOtherSettingsJson(values, parseJsonRecord(current.settings)),
  }

  const stored: Record<string, string | number> = {
    base_url: current.base_url ?? '',
    header_override: current.header_override ?? '',
    openai_organization: current.openai_organization ?? '',
    other: current.other,
    param_override: current.param_override ?? '',
    setting: current.setting ?? '',
    settings: current.settings,
    type: current.type,
  }

  for (const field of SENSITIVE_PAYLOAD_FIELDS) {
    const next = candidate[field]
    const previous = stored[field]
    if (field === 'setting' || field === 'settings') {
      // Compare the normalised content, not the serialised text: Go's marshaller orders
      // keys by struct order and drops every empty value, so a byte comparison would
      // report a change on every save.
      const before = JSON.stringify(normalizeSettings(parseJsonRecord(String(previous))))
      const after = JSON.stringify(normalizeSettings(parseJsonRecord(String(next ?? ''))))
      if (before === after) delete candidate[field]
      continue
    }
    if (next === previous) delete candidate[field]
  }

  if (values.key.trim() !== '') candidate.key = values.key.trim()

  return candidate
}
