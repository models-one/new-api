/**
 * The chat-preset catalogue and the one safe way to turn a preset into a URL.
 *
 * A preset is OPERATOR configuration. It reaches the console on `GET /api/status` as the
 * `chats` key — verified against the dev server, where it is an array of single-key
 * objects, `{ "<display name>": "<url template>" }` — and it is editable only from the
 * admin chat settings. That provenance is the whole security story of this feature: the
 * templates below get interpolated with the signed-in user's API key, so the ONLY thing
 * this module ever accepts from the address bar is a numeric index into the operator's
 * list. No template, no fragment of one, and no destination ever comes from a route
 * parameter, a query string, or anything else the visitor controls.
 *
 * Behaviour is ported from `web/src/features/chat/lib/chat-links.ts`; the parsing rules
 * and every placeholder are reproduced, and `buildChatUrl` adds the checks the legacy
 * console did not perform.
 */

/**
 * `web` embeds; `fluent` is the 流畅阅读 browser-extension bridge; `custom-protocol` is a
 * desktop app launcher such as `cherrystudio://`. Only `web` is ever opened by this console.
 */
export type ChatPresetKind = 'web' | 'fluent' | 'custom-protocol'

export type ChatPreset = {
  /** Position in the operator's `chats` array — this is the `$chatId` route parameter. */
  index: number
  name: string
  /** Operator-configured template, verbatim. Never user input, never rendered. */
  template: string
  kind: ChatPresetKind
}

/** Placeholder tokens the legacy resolver understands. Named so the UI can show them. */
export const KEY_PLACEHOLDER = '{key}'
export const ADDRESS_PLACEHOLDER = '{address}'
export const CHERRY_CONFIG_PLACEHOLDER = '{cherryConfig}'
export const AIONUI_CONFIG_PLACEHOLDER = '{aionuiConfig}'
export const DEEPCHAT_CONFIG_PLACEHOLDER = '{deepchatConfig}'

/** Every token `resolveChatTemplate` substitutes, most specific first. */
export const CHAT_PLACEHOLDERS = [
  CHERRY_CONFIG_PLACEHOLDER,
  AIONUI_CONFIG_PLACEHOLDER,
  DEEPCHAT_CONFIG_PLACEHOLDER,
  ADDRESS_PLACEHOLDER,
  KEY_PLACEHOLDER,
] as const

/** The subset that carries the user's secret; presence of one means a key must be fetched. */
const KEY_BEARING_PLACEHOLDERS = [
  KEY_PLACEHOLDER,
  CHERRY_CONFIG_PLACEHOLDER,
  AIONUI_CONFIG_PLACEHOLDER,
  DEEPCHAT_CONFIG_PLACEHOLDER,
] as const

/** The only schemes this console will embed or navigate to. */
export const EMBEDDABLE_PROTOCOLS: readonly string[] = ['http:', 'https:']

const HTTP_TEMPLATE = /^https?:\/\//i
const SCHEME = /^([a-z][a-z0-9+.-]*):/i
const NON_NEGATIVE_INTEGER = /^\d+$/

export function detectChatPresetKind(template: string): ChatPresetKind {
  if (HTTP_TEMPLATE.test(template)) return 'web'
  if (template.toLowerCase().startsWith('fluent')) return 'fluent'
  return 'custom-protocol'
}

/** The scheme of a non-web preset, for telling the user which app would have been launched. */
export function presetScheme(template: string): string | null {
  const match = SCHEME.exec(template)
  if (match === null) return null
  return match[1].toLowerCase()
}

export function presetRequiresApiKey(template: string): boolean {
  return KEY_BEARING_PLACEHOLDERS.some((token) => template.includes(token))
}

/**
 * Which placeholders `resolveChatTemplate` will actually replace in this template.
 * The three `*Config` tokens short-circuit the resolver, so at most one of them applies
 * and `{address}`/`{key}` are then left alone — the UI states exactly that.
 */
export function substitutedPlaceholders(template: string): string[] {
  const shortCircuit = [
    CHERRY_CONFIG_PLACEHOLDER,
    AIONUI_CONFIG_PLACEHOLDER,
    DEEPCHAT_CONFIG_PLACEHOLDER,
  ].find((token) => template.includes(token))
  if (shortCircuit !== undefined) return [shortCircuit]

  const used: string[] = []
  if (template.includes(ADDRESS_PLACEHOLDER)) used.push(ADDRESS_PLACEHOLDER)
  if (template.includes(KEY_PLACEHOLDER)) used.push(KEY_PLACEHOLDER)
  return used
}

/** `$chatId` is an index, nothing else: no negatives, no `1e3`, no `0x10`, no whitespace. */
export function parseChatIndex(raw: string): number | null {
  if (!NON_NEGATIVE_INTEGER.test(raw)) return null
  const index = Number(raw)
  return Number.isSafeInteger(index) ? index : null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A preset entry is a one-key object whose single value is a string; anything else is skipped. */
function readEntry(entry: unknown): [string, string] | null {
  if (!isPlainObject(entry)) return null
  const pairs = Object.entries(entry)
  if (pairs.length !== 1) return null
  const [name, value] = pairs[0]
  if (typeof value !== 'string') return null
  return [name, value]
}

function coerceList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw
  // The legacy console also accepted the whole block as a JSON string; some older
  // deployments store it that way. Still operator data either way.
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

/**
 * Invalid entries are dropped but do NOT renumber the survivors: `index` stays the
 * position in the operator's raw array, so a bookmarked `/chat/4` keeps pointing at the
 * fifth configured preset even after a malformed neighbour is removed from the list.
 */
export function parseChatPresets(raw: unknown): ChatPreset[] {
  const list = coerceList(raw)
  if (list === null) return []

  const presets: ChatPreset[] = []
  list.forEach((entry, index) => {
    const pair = readEntry(entry)
    if (pair === null) return
    const template = pair[1].trim()
    if (template === '') return
    presets.push({ index, kind: detectChatPresetKind(template), name: pair[0], template })
  })
  return presets
}

export function findChatPreset(presets: readonly ChatPreset[], index: number): ChatPreset | undefined {
  return presets.find((preset) => preset.index === index)
}

/** `sk-` is what the gateway expects; the reveal endpoint returns the bare value. */
export function normalizeApiKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (trimmed === '') return ''
  return trimmed.startsWith('sk-') ? trimmed : `sk-${trimmed}`
}

/** UTF-8 safe base64. The legacy helper called `btoa` directly, which throws above U+00FF. */
function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function replaceToken(source: string, token: string, value: string): string {
  return source.split(token).join(value)
}

export type ResolveChatUrlParams = {
  template: string
  /** Omitted when the template carries no key-bearing placeholder. */
  apiKey?: string
  serverAddress: string
}

/**
 * Placeholder substitution, byte-for-byte the legacy rules:
 *
 *   {cherryConfig}   -> encodeURIComponent(base64({ id: 'new-api', baseUrl, apiKey }))
 *   {aionuiConfig}   -> encodeURIComponent(base64({ platform: 'new-api', baseUrl, apiKey }))
 *   {deepchatConfig} -> encodeURIComponent(base64({ id: 'new-api', baseUrl, apiKey }))
 *   {address}        -> encodeURIComponent(serverAddress)
 *   {key}            -> the `sk-` prefixed key, substituted raw
 *
 * The first three return immediately, so a template mixing one of them with `{key}` gets
 * only the config blob. `{key}` is NOT percent-encoded, matching the legacy resolver that
 * live operator templates were written against; gateway keys are `[A-Za-z0-9]` so this is
 * lossless. Callers must not use this directly — go through `buildChatUrl`.
 */
function resolveChatTemplate(params: ResolveChatUrlParams): string {
  const { template } = params
  const serverAddress = params.serverAddress
  const apiKey = normalizeApiKey(params.apiKey ?? '')

  const configs: [string, Record<string, string>][] = [
    [CHERRY_CONFIG_PLACEHOLDER, { apiKey, baseUrl: serverAddress, id: 'new-api' }],
    [AIONUI_CONFIG_PLACEHOLDER, { apiKey, baseUrl: serverAddress, platform: 'new-api' }],
    [DEEPCHAT_CONFIG_PLACEHOLDER, { apiKey, baseUrl: serverAddress, id: 'new-api' }],
  ]

  for (const [token, payload] of configs) {
    if (!template.includes(token)) continue
    const encoded = encodeURIComponent(toBase64(JSON.stringify(payload)))
    return replaceToken(template, token, encoded)
  }

  let url = template
  if (serverAddress !== '') {
    url = replaceToken(url, ADDRESS_PLACEHOLDER, encodeURIComponent(serverAddress))
  }
  if (apiKey !== '') {
    url = replaceToken(url, KEY_PLACEHOLDER, apiKey)
  }
  return url
}

export type ChatUrlRejection =
  | 'template-not-a-url'
  | 'unsupported-scheme'
  | 'resolved-not-a-url'
  | 'origin-not-literal'

export type ChatUrlResult =
  | { ok: true; url: string; origin: string }
  | { ok: false; reason: ChatUrlRejection }

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Replaces every placeholder with an inert token so the raw template can be parsed. */
function neutralizePlaceholders(template: string): string {
  return CHAT_PLACEHOLDERS.reduce<string>((url, token) => replaceToken(url, token, 'x'), template)
}

/**
 * Resolve a preset and prove the result is safe to hand a browser. Four gates:
 *
 * 1. the template must parse as a URL once its placeholders are neutralised;
 * 2. the template's scheme must be http or https — `cherrystudio://`, `fluentread` and
 *    anything else are refused rather than navigated to;
 * 3. the resolved URL must still parse, and still be http(s);
 * 4. the resolved ORIGIN must equal the neutralised template's origin.
 *
 * Gate 4 is the one that matters. It means the operator wrote the destination host
 * literally: a template like `https://{key}.example.com/` — which would smuggle the user's
 * secret out as a DNS lookup — resolves to a different origin than `https://x.example.com`
 * and is rejected. The key can therefore only ever land in a URL whose origin is
 * operator-authored, never one assembled from a value the console filled in.
 */
export function buildChatUrl(params: ResolveChatUrlParams): ChatUrlResult {
  const templateUrl = parseUrl(neutralizePlaceholders(params.template))
  if (templateUrl === null) return { ok: false, reason: 'template-not-a-url' }
  if (!EMBEDDABLE_PROTOCOLS.includes(templateUrl.protocol)) {
    return { ok: false, reason: 'unsupported-scheme' }
  }

  const resolvedUrl = parseUrl(resolveChatTemplate(params))
  if (resolvedUrl === null) return { ok: false, reason: 'resolved-not-a-url' }
  if (!EMBEDDABLE_PROTOCOLS.includes(resolvedUrl.protocol)) {
    return { ok: false, reason: 'unsupported-scheme' }
  }
  if (resolvedUrl.origin !== templateUrl.origin) {
    return { ok: false, reason: 'origin-not-literal' }
  }

  return { ok: true, origin: resolvedUrl.origin, url: resolvedUrl.href }
}
