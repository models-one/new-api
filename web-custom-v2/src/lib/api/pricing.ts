import { queryOptions } from '@tanstack/react-query'

import { getRawJson } from '@/lib/api/client'

/** One model row from `GET /api/pricing` (model/pricing.go Pricing). */
export type PricingModel = {
  model_name: string
  description?: string
  icon?: string
  tags?: string
  vendor_id?: number
  /** 0 = token-based billing, 1 = flat price per request. */
  quota_type: number
  model_ratio: number
  model_price: number
  owner_by: string
  completion_ratio: number
  cache_ratio?: number | null
  create_cache_ratio?: number | null
  image_ratio?: number | null
  audio_ratio?: number | null
  audio_completion_ratio?: number | null
  enable_groups: string[]
  supported_endpoint_types: string[]
  /** 'tiered_expr' means the real price lives in billing_expr, not model_ratio. */
  billing_mode?: string
  billing_expr?: string
  pricing_version?: string
}

export type PricingVendor = {
  id: number
  name: string
  description?: string
  icon?: string
}

/**
 * `/api/pricing` is NOT enveloped the usual way: group_ratio, usable_group, vendors and
 * auto_groups sit at the TOP level next to `success`, not inside `data`.
 */
export type PricingResponse = {
  success: boolean
  data: PricingModel[]
  group_ratio: Record<string, number>
  usable_group: Record<string, string>
  auto_groups: string[]
  supported_endpoint: Record<string, unknown>
  vendors: PricingVendor[]
  pricing_version?: string
}

export const QUOTA_TYPE = { tokenBased: 0, perRequest: 1 } as const

export function pricingQuery() {
  return queryOptions({
    queryKey: ['pricing'],
    queryFn: () => getRawJson<PricingResponse>('/api/pricing'),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * USD per 1M input tokens, matching the legacy formula: model_ratio * 2 * groupRatio.
 * The factor 2 converts the ratio to dollars-per-million under the default quota scale.
 */
export function inputPricePerMillion(model: PricingModel, groupRatio = 1): number {
  return model.model_ratio * 2 * groupRatio
}

export function outputPricePerMillion(model: PricingModel, groupRatio = 1): number {
  return inputPricePerMillion(model, groupRatio) * model.completion_ratio
}

/** Flat per-request models bill `model_price` and carry a meaningless model_ratio. */
export function perRequestPrice(model: PricingModel, groupRatio = 1): number {
  return model.model_price * groupRatio
}

export function isTieredBilling(model: PricingModel): boolean {
  return model.billing_mode === 'tiered_expr'
}

export function parseTags(model: PricingModel): string[] {
  return (model.tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function vendorName(model: PricingModel, vendors: PricingVendor[]): string {
  const vendor = vendors.find((candidate) => candidate.id === model.vendor_id)
  return vendor?.name ?? ''
}
