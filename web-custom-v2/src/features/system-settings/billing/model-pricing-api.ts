import { queryOptions } from '@tanstack/react-query'
import axios from 'axios'

import { getJson, patchJson, postJson } from '@/lib/api/client'
import type { ApiRequestConfig } from '@/lib/http-client'

/**
 * The per-model pricing API (`controller/model_pricing_config.go`, root only).
 *
 *   GET   /api/option/model_pricing[?model=…]   one entry per model: what is stored
 *         (`configured`), what the gateway charges (`effective`, built-in prices and
 *         defaults resolved), and a `version` of the stored values
 *   PATCH /api/option/model_pricing             `{changes: [{model_name, expected_version,
 *         pricing, reset?}]}` replaces each model's stored pricing as a whole; a model
 *         whose stored values changed since its version was read is refused with 409
 *   POST  /api/option/model_pricing/preview     the effective pricing a draft would give
 *   POST  /api/option/model_pricing/convert     the expression equivalent to a legacy draft
 *
 * Only this API is used to change model prices. Writing the option maps whole through
 * `PUT /api/option/` would store every built-in price as an administrator override.
 */

const silent: ApiRequestConfig = { skipBusinessError: true, skipErrorHandler: true }

export const BILLING_MODE_KEY = 'billing_setting.billing_mode'
export const BILLING_EXPR_KEY = 'billing_setting.billing_expr'
export const PLUGIN_BILLING_EXPR_KEY = 'billing_setting.plugin_billing_expr'
export const EXPRESSION_MODE = 'tiered_expr'

/** The legacy number fields, in the order the editor lists them. */
export const LEGACY_RATIO_KEYS = [
  'ModelRatio',
  'CompletionRatio',
  'CacheRatio',
  'CreateCacheRatio',
  'ImageRatio',
  'AudioRatio',
  'AudioCompletionRatio',
] as const
export type LegacyRatioKey = (typeof LEGACY_RATIO_KEYS)[number]

/** One model's pricing fields, as stored or resolved. Absent means "not set". */
export type PricingValues = {
  ModelPrice?: number
  ModelRatio?: number
  CompletionRatio?: number
  CacheRatio?: number
  CreateCacheRatio?: number
  ImageRatio?: number
  AudioRatio?: number
  AudioCompletionRatio?: number
  [BILLING_MODE_KEY]?: string
  [BILLING_EXPR_KEY]?: string
  /** Plugin key → task usage expression, for the plugins serving this model. */
  [PLUGIN_BILLING_EXPR_KEY]?: Record<string, string>
}

/** How cache writes are priced for this model name (read only, for display). */
export type CacheWriteMode = 'none' | 'standard' | 'claude_ttl' | 'openai_ttl'

export type LegacyBillingDetails = {
  audio_input_price?: number
  audio_output_price?: number
  image_count?: boolean
  request_rules?: Array<{ condition: string; multiplier: number }>
  audio_text_branches?: boolean
}

export type ModelPricingPluginVariant = {
  plugin_key: string
  plugin_name: string
  icon?: string
  configured: string
  effective: string
  compatible: boolean
  relay?: boolean
  stale?: boolean
}

export type ModelPricingEntry = {
  model_name: string
  version: string
  configured: PricingValues
  effective?: PricingValues
  cache_write_mode?: CacheWriteMode
  billing_details?: LegacyBillingDetails
  plugin_variants?: ModelPricingPluginVariant[]
}

export type ModelPricingSnapshot = {
  entries: ModelPricingEntry[]
  /** The version of a model with nothing stored, for a model being priced for the first time. */
  empty_version: string
}

export type ModelPricingChange = {
  model_name: string
  expected_version: string
  pricing: PricingValues
  reset?: boolean
}

export type PricingPreview = {
  effective?: PricingValues
  cache_write_mode?: CacheWriteMode
  billing_details?: LegacyBillingDetails
}

export type PricingConversion = PricingPreview & {
  expression?: string
  /** An English sentence from the server; it is a key in the locale files. */
  unsupported_reason?: string
}

export const modelPricingKeys = {
  all: ['system-settings', 'model-pricing'] as const,
}

export function modelPricingQuery() {
  return queryOptions({
    queryFn: async (): Promise<ModelPricingSnapshot> => {
      const snapshot = await getJson<ModelPricingSnapshot>('/api/option/model_pricing', silent)
      return { empty_version: snapshot.empty_version, entries: snapshot.entries ?? [] }
    },
    queryKey: modelPricingKeys.all,
  })
}

/** Reads the current stored pricing of a few models, for a save based on fresh versions. */
export async function fetchModelPricingEntries(names: readonly string[]): Promise<ModelPricingSnapshot> {
  const query = new URLSearchParams(names.map((name) => ['model', name]))
  const snapshot = await getJson<ModelPricingSnapshot>(`/api/option/model_pricing?${query}`, silent)
  return { empty_version: snapshot.empty_version, entries: snapshot.entries ?? [] }
}

/** Someone else changed the model's stored pricing since it was read. */
export class ModelPricingConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelPricingConflictError'
  }
}

export async function saveModelPricingChanges(changes: readonly ModelPricingChange[]): Promise<void> {
  if (changes.length === 0) return
  try {
    await patchJson('/api/option/model_pricing', { changes }, silent)
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const message = (error.response.data as { message?: unknown } | undefined)?.message
      throw new ModelPricingConflictError(typeof message === 'string' ? message : 'model pricing changed; reload before saving')
    }
    throw error
  }
}

export function previewModelPricing(modelName: string, pricing: PricingValues): Promise<PricingPreview> {
  return postJson<PricingPreview>('/api/option/model_pricing/preview', { model_name: modelName, pricing }, silent)
}

export function convertModelPricing(modelName: string, pricing: PricingValues): Promise<PricingConversion> {
  return postJson<PricingConversion>('/api/option/model_pricing/convert', { model_name: modelName, pricing }, silent)
}
