import {
  QUOTA_TYPE,
  inputPricePerMillion,
  isTieredBilling,
  outputPricePerMillion,
  parseTags,
  perRequestPrice,
  vendorName,
  type PricingModel,
  type PricingVendor,
} from '@/lib/api/pricing'
import { formatCurrency } from '@/lib/format'

/** Nine keeps the three-column card grid square on desktop. */
export const MODELS_PER_PAGE = 9
export const MODELS_PER_PAGE_OPTIONS = [9, 18, 36] as const

/** Two is the width of the comparison panel; selecting a third drops the oldest. */
export const MAX_COMPARED_MODELS = 2

/** How the gateway charges for one model. */
export type BillingKind = 'per-token' | 'per-request' | 'tiered'

/**
 * `billing_mode === 'tiered_expr'` wins over `quota_type`: for those rows the flat
 * `model_ratio` / `model_price` are only fallbacks and the real price lives in
 * `billing_expr`, so no single number can be shown.
 */
export function billingKind(model: PricingModel): BillingKind {
  if (isTieredBilling(model)) return 'tiered'
  return model.quota_type === QUOTA_TYPE.perRequest ? 'per-request' : 'per-token'
}

/**
 * Prices below this cutoff are rendered with more decimals, so a cheap model reads
 * as "$0.0075" rather than a misleading "$0.00".
 */
const SMALL_PRICE_CUTOFF = 0.01
const SMALL_PRICE_DIGITS = 4

export function formatModelPrice(amount: number): string {
  const digits = amount > 0 && amount < SMALL_PRICE_CUTOFF ? SMALL_PRICE_DIGITS : 2
  return formatCurrency(amount, { digits })
}

/** Billing ratios are multipliers, not money, so they never go through formatCurrency. */
export function formatMultiplier(value: number): string {
  return `×${value.toLocaleString('en-US', { maximumFractionDigits: 4 })}`
}

/**
 * The multiplier for a pricing group, or undefined when `group_ratio` does not
 * publish one — in that case no price can be shown for that group.
 */
export function groupMultiplier(
  ratios: Record<string, number>,
  group: string,
): number | undefined {
  if (group === '' || !Object.hasOwn(ratios, group)) return undefined
  const ratio = ratios[group]
  return typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : undefined
}

export type ModelPricing =
  | { kind: 'per-token'; input: string; output: string }
  | { kind: 'per-request'; perRequest: string }
  | { kind: 'tiered' }
  /** The selected group has no published multiplier, so the price is unknown. */
  | { kind: 'unpriced' }

export function modelPricing(model: PricingModel, groupRatio: number | undefined): ModelPricing {
  const kind = billingKind(model)
  if (kind === 'tiered') return { kind: 'tiered' }
  if (groupRatio === undefined) return { kind: 'unpriced' }
  if (kind === 'per-request') {
    return { kind: 'per-request', perRequest: formatModelPrice(perRequestPrice(model, groupRatio)) }
  }
  return {
    kind: 'per-token',
    input: formatModelPrice(inputPricePerMillion(model, groupRatio)),
    output: formatModelPrice(outputPricePerMillion(model, groupRatio)),
  }
}

export type ModelMultiplier = { id: string; labelKey: string; ratio: number }

/** The optional ratio columns `/api/pricing` can carry, in the order they are shown. */
const MULTIPLIER_FIELDS: readonly {
  id: string
  labelKey: string
  read: (model: PricingModel) => number | null | undefined
}[] = [
  { id: 'cache', labelKey: 'Cached input', read: (model) => model.cache_ratio },
  { id: 'create_cache', labelKey: 'Cache write', read: (model) => model.create_cache_ratio },
  { id: 'image', labelKey: 'Image tokens', read: (model) => model.image_ratio },
  { id: 'audio', labelKey: 'Audio input', read: (model) => model.audio_ratio },
  { id: 'audio_completion', labelKey: 'Audio output', read: (model) => model.audio_completion_ratio },
]

export function modelMultipliers(model: PricingModel): ModelMultiplier[] {
  const entries: ModelMultiplier[] = []
  for (const field of MULTIPLIER_FIELDS) {
    const ratio = field.read(model)
    if (typeof ratio === 'number' && Number.isFinite(ratio)) {
      entries.push({ id: field.id, labelKey: field.labelKey, ratio })
    }
  }
  return entries
}

/**
 * The route behind an endpoint type, from the payload's top-level `supported_endpoint`
 * map. Its values are untyped, so every field is checked before it is shown.
 */
export function endpointRoute(
  catalog: Record<string, unknown>,
  endpointType: string,
): string | undefined {
  if (!Object.hasOwn(catalog, endpointType)) return undefined
  const entry = catalog[endpointType]
  if (typeof entry !== 'object' || entry === null) return undefined
  const record = entry as Record<string, unknown>
  const path = typeof record.path === 'string' ? record.path : ''
  if (path === '') return undefined
  const method = typeof record.method === 'string' ? record.method : ''
  return method === '' ? path : `${method} ${path}`
}

/** `/api/pricing` takes no query parameters, so the search box filters in the browser. */
export function modelMatchesSearch(
  model: PricingModel,
  vendors: PricingVendor[],
  term: string,
): boolean {
  const needle = term.trim().toLowerCase()
  if (needle === '') return true
  if (model.model_name.toLowerCase().includes(needle)) return true
  if (vendorName(model, vendors).toLowerCase().includes(needle)) return true
  return parseTags(model).some((tag) => tag.toLowerCase().includes(needle))
}

export function modelEndpointTypes(model: PricingModel): string[] {
  return model.supported_endpoint_types ?? []
}

export function modelGroups(model: PricingModel): string[] {
  return model.enable_groups ?? []
}

/** Every endpoint type any published model supports, for the endpoint filter. */
export function endpointTypeOptions(models: PricingModel[]): string[] {
  const types = new Set<string>()
  for (const model of models) {
    for (const type of modelEndpointTypes(model)) types.add(type)
  }
  return [...types].sort((left, right) => left.localeCompare(right))
}

export function countProviders(models: PricingModel[], vendors: PricingVendor[]): number {
  const names = new Set<string>()
  for (const model of models) {
    const name = vendorName(model, vendors)
    if (name !== '') names.add(name)
  }
  return names.size
}
