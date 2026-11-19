import { postJson, getJson } from '@/lib/api/client'
import type { ApiRequestConfig } from '@/lib/http-client'
import {
  BILLING_EXPR_KEY,
  BILLING_MODE_KEY,
  EXPRESSION_MODE,
  PLUGIN_BILLING_EXPR_KEY,
  type PricingValues,
} from '@/features/system-settings/billing/model-pricing-api'
import { compileBillingExpression } from '@/lib/billing-expression/parser'
import { expressionDependencies, type ExpressionNode } from '@/lib/billing-expression/types'
import { parseVisualBillingDocument, serializeVisualBillingDocument } from '@/lib/billing-expression/visual'

/**
 * Comparing and importing prices from upstream sources (`controller/ratio_sync.go`).
 *
 *   GET  /api/ratio_sync/channels   channels with a base URL, plus three presets (negative ids)
 *   POST /api/ratio_sync/fetch      reads every source server-side and returns, per model, the
 *                                   local price and each source's price
 *
 * Nothing is written by a fetch. An import goes through the per-model pricing API like any
 * other edit, against the versions read when the comparison was made.
 */

const silent: ApiRequestConfig = { skipBusinessError: true, skipErrorHandler: true }

export const OFFICIAL_PRESET_ID = -100
export const MODELS_DEV_PRESET_ID = -101
export const LITELLM_PRESET_ID = -102
const OPENROUTER_CHANNEL_TYPE = 20

/** The endpoints the server knows how to read; anything starting with http is fetched as is. */
export const PRICING_ENDPOINT = '/api/pricing'
export const RATIO_CONFIG_ENDPOINT = '/api/ratio_config'
export const OPENROUTER_ENDPOINT = 'openrouter'
const PRESET_ENDPOINTS: Record<number, string> = {
  [LITELLM_PRESET_ID]: '/Wei-Shaw/model-price-repo/refs/heads/main/model_prices_and_context_window.json',
  [MODELS_DEV_PRESET_ID]: 'https://models.dev/api.json',
  [OFFICIAL_PRESET_ID]: '/llm-metadata/api/newapi/ratio_config-v1-base.json',
}

export type SyncableChannel = { id: number; name: string; base_url: string; status: number; type: number }

export function isPreset(channel: Pick<SyncableChannel, 'id'>): boolean {
  return channel.id < 0
}

export function defaultEndpoint(channel: Pick<SyncableChannel, 'id' | 'type'>): string {
  return PRESET_ENDPOINTS[channel.id] ?? (channel.type === OPENROUTER_CHANNEL_TYPE ? OPENROUTER_ENDPOINT : PRICING_ENDPOINT)
}

/** One model's price as the sync API reports it: snake_case legacy fields, or an expression. */
export type SyncValues = {
  model_ratio?: number
  completion_ratio?: number
  cache_ratio?: number
  create_cache_ratio?: number
  image_ratio?: number
  audio_ratio?: number
  audio_completion_ratio?: number
  model_price?: number
  billing_mode?: string
  billing_expr?: string
}

export type SyncModelPrices = { current: SyncValues; upstreams: Record<string, SyncValues> }

export type SyncResult = {
  /** Models whose price differs from at least one source. */
  differences: Record<string, unknown>
  prices: Record<string, SyncModelPrices>
  test_results: Array<{ name: string; status: 'success' | 'error'; error?: string }>
}

export const syncKeys = { channels: ['system-settings', 'price-sync', 'channels'] as const }

export async function fetchSyncableChannels(): Promise<SyncableChannel[]> {
  return (await getJson<SyncableChannel[] | null>('/api/ratio_sync/channels', silent)) ?? []
}

export type SyncSource = { id: number; name: string; base_url: string; endpoint: string }

export async function fetchUpstreamPrices(sources: readonly SyncSource[]): Promise<SyncResult> {
  const result = await postJson<SyncResult>('/api/ratio_sync/fetch', { include_unchanged: true, timeout: 10, upstreams: sources }, silent)
  return { differences: result.differences ?? {}, prices: result.prices ?? {}, test_results: result.test_results ?? [] }
}

/** The preset names are wire identifiers; the console shows its own label for them. */
export function sourceLabel(name: string, t: (key: string) => string): string {
  if (name.startsWith('官方倍率预设')) return t('Official pricing preset')
  if (name.startsWith('models.dev 价格预设')) return t('models.dev pricing preset')
  if (name.startsWith('LiteLLM 官方价格表')) return t('LiteLLM pricing preset')
  return name
}

// ---------------------------------------------------------------------------
// From a source's price to the values stored for the model
// ---------------------------------------------------------------------------

const RATIO_FIELDS: Array<[keyof SyncValues, keyof PricingValues]> = [
  ['model_ratio', 'ModelRatio'],
  ['completion_ratio', 'CompletionRatio'],
  ['cache_ratio', 'CacheRatio'],
  ['create_cache_ratio', 'CreateCacheRatio'],
  ['image_ratio', 'ImageRatio'],
  ['audio_ratio', 'AudioRatio'],
  ['audio_completion_ratio', 'AudioCompletionRatio'],
]

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function hasExpression(values: SyncValues): boolean {
  return values.billing_mode === EXPRESSION_MODE && typeof values.billing_expr === 'string' && values.billing_expr.trim() !== ''
}

/**
 * The model's complete stored pricing after importing a source's price. An import replaces
 * the model's own price — a legacy ratio left beside an imported expression would be a
 * price nobody chose — and keeps its task plugin prices, which no source supplies.
 * Refused when the source's numbers are not finite and non-negative.
 */
export function importedPricing(values: SyncValues, configured: PricingValues): { values: PricingValues; error?: undefined } | { values?: undefined; error: string } {
  const next: PricingValues = {}
  const plugins = configured[PLUGIN_BILLING_EXPR_KEY]
  if (plugins !== undefined && Object.keys(plugins).length > 0) next[PLUGIN_BILLING_EXPR_KEY] = plugins

  if (hasExpression(values)) {
    if (compileBillingExpression(values.billing_expr!).status !== 'ready') return { error: 'The source’s expression is not valid.' }
    next[BILLING_MODE_KEY] = EXPRESSION_MODE
    // Imported verbatim, so the next comparison does not report a difference again.
    next[BILLING_EXPR_KEY] = values.billing_expr
    return { values: next }
  }
  next[BILLING_MODE_KEY] = 'ratio'
  if (values.model_price !== undefined) {
    if (!isPrice(values.model_price)) return { error: 'The source’s price is negative or not a number.' }
    next.ModelPrice = values.model_price
    return { values: next }
  }
  for (const [from, to] of RATIO_FIELDS) {
    const value = values[from]
    if (value === undefined) continue
    if (!isPrice(value)) return { error: 'The source’s price is negative or not a number.' }
    ;(next as Record<string, unknown>)[to] = value
  }
  if (next.ModelRatio === undefined) return { error: 'The source has no price for this model.' }
  return { values: next }
}

/** A source's price in the stored shape, for showing it the same way as the model list. */
export function displayValues(values: SyncValues): PricingValues {
  return importedPricing(values, {}).values ?? {}
}

// ---------------------------------------------------------------------------
// Exchange-rate conversion
// ---------------------------------------------------------------------------

/**
 * `keep` imports the number as published. A source that publishes in the site's display
 * currency instead of USD is converted with `divide`; `multiply` goes the other way.
 */
export type PriceAdjustment = 'keep' | 'divide' | 'multiply'
export type AdjustedPrice = { values: SyncValues; error?: undefined } | { values?: undefined; error: string }

const UNSUPPORTED = 'This expression cannot be converted automatically. Import it as published or edit it afterwards.'
const OUT_OF_RANGE = 'The converted price is out of range.'

function convert(amount: number, mode: PriceAdjustment, rate: number): number | null {
  const price = mode === 'divide' ? amount / rate : amount * rate
  if (!isPrice(amount) || !isPrice(price) || (amount > 0 && price === 0)) return null
  return price
}

/**
 * The source's price converted by the exchange rate. Always computed from the published
 * price, never from an earlier result. An expression is converted only when every price in
 * it is a plain tier the visual model can rewrite; anything else is refused, never guessed.
 */
export function adjustPrice(values: SyncValues, mode: PriceAdjustment, rate: number | null): AdjustedPrice {
  if (mode === 'keep') return { values }
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return { error: 'A valid exchange rate is required.' }
  if (!hasExpression(values)) {
    const field = values.model_price !== undefined ? 'model_price' : 'model_ratio'
    const amount = values[field]
    if (typeof amount !== 'number') return { error: 'The source has no price for this model.' }
    const price = convert(amount, mode, rate)
    return price === null ? { error: OUT_OF_RANGE } : { values: { ...values, [field]: price } }
  }

  const source = values.billing_expr!
  const compiled = compileBillingExpression(source)
  if (compiled.status !== 'ready') return { error: UNSUPPORTED }
  const stack: ExpressionNode[] = [compiled.ast]
  const patches: Array<{ start: number; end: number; text: string }> = []
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.kind === 'conditional') {
      const calls = expressionDependencies(node.condition).functions
      if (calls.has('tier') || calls.has('fixed')) return { error: UNSUPPORTED }
      stack.push(node.yes, node.no)
      continue
    }
    if (node.kind === 'binary' && node.operator === '*') {
      // Image count and request multipliers scale the price; they are not prices themselves.
      const factor = [node.left, node.right].find(
        (candidate) => (candidate.kind === 'variable' && candidate.name === 'image_count') || compiled.requestRules.some((rule) => rule.node === candidate),
      )
      if (factor === undefined) return { error: UNSUPPORTED }
      stack.push(factor === node.left ? node.right : node.left)
      continue
    }
    if (node.kind !== 'call' || node.name !== 'tier') return { error: UNSUPPORTED }
    const document = parseVisualBillingDocument(source.slice(node.start, node.end))
    if (document === null || document.root.kind !== 'tier') return { error: UNSUPPORTED }
    const tier = document.root
    if (tier.billingUnit === 'request') {
      const price = convert(Number(tier.fixedPrice), mode, rate)
      if (price === null) return { error: OUT_OF_RANGE }
      tier.fixedPrice = String(price)
    } else {
      for (const entry of tier.prices) {
        const price = convert(Number(entry.value), mode, rate)
        if (price === null) return { error: OUT_OF_RANGE }
        entry.value = String(price)
      }
    }
    const serialized = serializeVisualBillingDocument(document)
    if (!serialized.ok) return { error: OUT_OF_RANGE }
    patches.push({ end: node.end, start: node.start, text: serialized.source })
  }
  let expression = source
  for (const patch of patches.sort((a, b) => b.start - a.start)) {
    expression = expression.slice(0, patch.start) + patch.text + expression.slice(patch.end)
  }
  if (compileBillingExpression(expression).status !== 'ready') return { error: UNSUPPORTED }
  return { values: { ...values, billing_expr: expression } }
}
