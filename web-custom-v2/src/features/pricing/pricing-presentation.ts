import {
  QUOTA_TYPE,
  inputPricePerMillion,
  isTieredBilling,
  outputPricePerMillion,
  parseTags,
  vendorName,
  type PricingModel,
  type PricingResponse,
  type PricingVendor,
} from '@/lib/api/pricing'

/** Twelve fills the three-column card grid exactly four rows deep. */
export const MODELS_PER_PAGE = 12
export const MODELS_PER_PAGE_OPTIONS = [12, 24, 48] as const

/**
 * Group names the operator never picks from a list: the empty group, and `auto`, which is the
 * routing pseudo-group described by `auto_groups` rather than a priced group of its own.
 * `web/src/features/pricing/constants.ts` excludes exactly these two.
 */
const NON_SELECTABLE_GROUPS = new Set(['', 'auto'])

/** The sentinel the group selector uses for "no group picked". */
export const ANY_GROUP = ''

/** How the gateway charges for one model. */
export type BillingShape = 'per-token' | 'per-request' | 'tiered'

/**
 * `billing_mode === 'tiered_expr'` outranks `quota_type`: on those rows the flat
 * `model_ratio` / `model_price` are fallbacks only — `service/tiered_settle.go` replaces the
 * ratio maths entirely whenever the expression applies — so no single rate may be printed.
 */
export function billingShape(model: PricingModel): BillingShape {
  if (isTieredBilling(model)) return 'tiered'
  return model.quota_type === QUOTA_TYPE.perRequest ? 'per-request' : 'per-token'
}

/** The token price rows `/api/pricing` can carry, in the order they are shown. */
export type TokenPriceKind =
  | 'input'
  | 'output'
  | 'cache'
  | 'create_cache'
  | 'image'
  | 'audio_input'
  | 'audio_output'

export const TOKEN_PRICE_KINDS: readonly {
  kind: TokenPriceKind
  labelKey: string
  primary: boolean
}[] = [
  { kind: 'input', labelKey: 'Input', primary: true },
  { kind: 'output', labelKey: 'Output', primary: true },
  { kind: 'cache', labelKey: 'Cached input', primary: false },
  { kind: 'create_cache', labelKey: 'Cache write', primary: false },
  { kind: 'image', labelKey: 'Image input', primary: false },
  { kind: 'audio_input', labelKey: 'Audio input', primary: false },
  { kind: 'audio_output', labelKey: 'Audio output', primary: false },
]

function finiteRatio(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * USD per 1M tokens for one price row, or undefined when the model publishes no ratio for it.
 *
 * The base is the legacy formula `model_ratio * 2 * groupRatio`; every optional row multiplies
 * that base by its own ratio, exactly as `web/src/features/pricing/lib/price.ts` does. A row
 * whose ratio is null/absent returns undefined rather than 0, so the UI can leave it out
 * instead of advertising a free rate the gateway never offered.
 */
export function tokenPricePerMillion(
  model: PricingModel,
  kind: TokenPriceKind,
  groupRatio: number,
): number | undefined {
  if (billingShape(model) !== 'per-token') return undefined
  const base = inputPricePerMillion(model, groupRatio)

  if (kind === 'input') return base
  if (kind === 'output') return outputPricePerMillion(model, groupRatio)

  if (kind === 'cache') {
    const ratio = finiteRatio(model.cache_ratio)
    return ratio === undefined ? undefined : base * ratio
  }
  if (kind === 'create_cache') {
    const ratio = finiteRatio(model.create_cache_ratio)
    return ratio === undefined ? undefined : base * ratio
  }
  if (kind === 'image') {
    const ratio = finiteRatio(model.image_ratio)
    return ratio === undefined ? undefined : base * ratio
  }
  if (kind === 'audio_input') {
    const ratio = finiteRatio(model.audio_ratio)
    return ratio === undefined ? undefined : base * ratio
  }

  const audioRatio = finiteRatio(model.audio_ratio)
  const audioCompletionRatio = finiteRatio(model.audio_completion_ratio)
  if (audioRatio === undefined || audioCompletionRatio === undefined) return undefined
  return base * audioRatio * audioCompletionRatio
}

/**
 * Two decimals as a floor so a rate reads like money, up to six as a ceiling so a cheap model
 * reads as "$0.075" rather than a rounded-off "$0.08" or a misleading "$0.00". A per-1M token
 * rate routinely carries more precision than a dollar amount, which is why this does not go
 * through the shared `formatCurrency`'s single fixed digit count.
 */
const MIN_PRICE_DIGITS = 2
const MAX_PRICE_DIGITS = 6

export function formatModelPrice(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0
  return `${safe < 0 ? '-' : ''}$${Math.abs(safe).toLocaleString('en-US', {
    maximumFractionDigits: MAX_PRICE_DIGITS,
    minimumFractionDigits: MIN_PRICE_DIGITS,
  })}`
}

/** Ratios are multipliers, not money, so they never go through a currency formatter. */
export function formatMultiplier(value: number): string {
  return `×${value.toLocaleString('en-US', { maximumFractionDigits: 4 })}`
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export type PricingGroup = {
  name: string
  /** Operator-written label from `usable_group`, in the server's own language. */
  description: string
  /** The multiplier from `group_ratio`, or undefined when the server publishes none. */
  ratio: number | undefined
}

/** The groups a visitor may price against, from the payload's `usable_group` map. */
export function selectableGroups(payload: PricingResponse | undefined): PricingGroup[] {
  if (payload === undefined) return []
  return Object.keys(payload.usable_group)
    .filter((name) => !NON_SELECTABLE_GROUPS.has(name))
    .map((name) => ({
      name,
      description: payload.usable_group[name] ?? '',
      ratio: finiteRatio(payload.group_ratio[name]),
    }))
}

export type ResolvedGroupRatio = {
  ratio: number
  /** The group the ratio came from. */
  group: string
  /** True when no group was picked and this is the cheapest the model is offered at. */
  isBest: boolean
}

/**
 * Which multiplier a price is quoted at.
 *
 * With a group selected, that group's ratio — but only if the model is actually enabled for
 * it. With no group selected the square quotes the cheapest group the model is enabled for,
 * the way `getDisplayGroupRatio` in the legacy square does, and says so on the card.
 */
export function resolveGroupRatio(
  model: PricingModel,
  selectedGroup: string,
  groupRatio: Record<string, number>,
): ResolvedGroupRatio | undefined {
  const enabled = model.enable_groups ?? []

  if (selectedGroup !== ANY_GROUP) {
    if (!enabled.includes(selectedGroup)) return undefined
    const ratio = finiteRatio(groupRatio[selectedGroup])
    return ratio === undefined ? undefined : { ratio, group: selectedGroup, isBest: false }
  }

  let best: ResolvedGroupRatio | undefined
  for (const group of enabled) {
    const ratio = finiteRatio(groupRatio[group])
    if (ratio === undefined) continue
    if (best === undefined || ratio < best.ratio) best = { ratio, group, isBest: true }
  }
  return best
}

// ---------------------------------------------------------------------------
// Filtering and sorting
// ---------------------------------------------------------------------------

export type QuotaTypeFilter = 'all' | 'token' | 'request'
export type SortOrder = 'name' | 'price-asc' | 'price-desc'

export type PricingFilters = {
  search: string
  vendor: string
  endpointType: string
  tag: string
  quotaType: QuotaTypeFilter
  group: string
  sort: SortOrder
}

export const EMPTY_FILTERS: PricingFilters = {
  search: '',
  vendor: '',
  endpointType: '',
  tag: '',
  quotaType: 'all',
  group: ANY_GROUP,
  sort: 'name',
}

/** How many of the catalogue filters are narrowing the list right now. */
export function activeFilterCount(filters: PricingFilters): number {
  let count = 0
  if (filters.vendor !== '') count += 1
  if (filters.endpointType !== '') count += 1
  if (filters.tag !== '') count += 1
  if (filters.quotaType !== 'all') count += 1
  if (filters.group !== ANY_GROUP) count += 1
  return count
}

/** `/api/pricing` takes no query parameters, so every filter runs in the browser. */
export function matchesSearch(model: PricingModel, vendors: PricingVendor[], term: string): boolean {
  const needle = term.trim().toLowerCase()
  if (needle === '') return true
  if (model.model_name.toLowerCase().includes(needle)) return true
  if ((model.description ?? '').toLowerCase().includes(needle)) return true
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
export function endpointTypeOptions(models: readonly PricingModel[]): string[] {
  const types = new Set<string>()
  for (const model of models) {
    for (const type of modelEndpointTypes(model)) types.add(type)
  }
  return [...types].sort((left, right) => left.localeCompare(right))
}

/** Every tag any published model carries, lower-cased, for the tag filter. */
export function tagOptions(models: readonly PricingModel[]): string[] {
  const tags = new Set<string>()
  for (const model of models) {
    for (const tag of parseTags(model)) tags.add(tag.toLowerCase())
  }
  return [...tags].sort((left, right) => left.localeCompare(right))
}

/** Only vendors that actually own a published model become filter options. */
export function vendorOptions(
  models: readonly PricingModel[],
  vendors: PricingVendor[],
): PricingVendor[] {
  const used = new Set(models.map((model) => model.vendor_id))
  return vendors.filter((vendor) => used.has(vendor.id))
}

/**
 * The number the price sort compares: input per 1M for token models. Per-request and tiered
 * rows have no comparable per-1M rate, so they sort last rather than being ranked on a number
 * that means something else.
 */
function sortablePrice(
  model: PricingModel,
  selectedGroup: string,
  groupRatio: Record<string, number>,
): number | undefined {
  if (billingShape(model) !== 'per-token') return undefined
  const resolved = resolveGroupRatio(model, selectedGroup, groupRatio)
  if (resolved === undefined) return undefined
  return inputPricePerMillion(model, resolved.ratio)
}

export function filterAndSortModels(
  models: readonly PricingModel[],
  vendors: PricingVendor[],
  groupRatio: Record<string, number>,
  filters: PricingFilters,
): PricingModel[] {
  const matched = models.filter((model) => {
    if (!matchesSearch(model, vendors, filters.search)) return false
    if (filters.vendor !== '' && String(model.vendor_id ?? '') !== filters.vendor) return false
    if (filters.endpointType !== '' && !modelEndpointTypes(model).includes(filters.endpointType)) {
      return false
    }
    if (filters.tag !== '') {
      const tags = parseTags(model).map((tag) => tag.toLowerCase())
      if (!tags.includes(filters.tag)) return false
    }
    if (filters.quotaType === 'token' && model.quota_type !== QUOTA_TYPE.tokenBased) return false
    if (filters.quotaType === 'request' && model.quota_type !== QUOTA_TYPE.perRequest) return false
    if (filters.group !== ANY_GROUP && !modelGroups(model).includes(filters.group)) return false
    return true
  })

  const byName = (left: PricingModel, right: PricingModel) =>
    left.model_name.localeCompare(right.model_name)

  if (filters.sort === 'name') return [...matched].sort(byName)

  const direction = filters.sort === 'price-asc' ? 1 : -1
  return [...matched].sort((left, right) => {
    const leftPrice = sortablePrice(left, filters.group, groupRatio)
    const rightPrice = sortablePrice(right, filters.group, groupRatio)
    if (leftPrice === undefined && rightPrice === undefined) return byName(left, right)
    if (leftPrice === undefined) return 1
    if (rightPrice === undefined) return -1
    if (leftPrice === rightPrice) return byName(left, right)
    return (leftPrice - rightPrice) * direction
  })
}

// ---------------------------------------------------------------------------
// Model attributes
// ---------------------------------------------------------------------------

export type ModelMultiplier = { id: string; labelKey: string; ratio: number }

/** Every billing multiplier a row can publish, in the order they are shown. */
const MULTIPLIER_FIELDS: readonly {
  id: string
  labelKey: string
  read: (model: PricingModel) => number | null | undefined
}[] = [
  { id: 'model', labelKey: 'Model ratio', read: (model) => model.model_ratio },
  { id: 'completion', labelKey: 'Completion ratio', read: (model) => model.completion_ratio },
  { id: 'cache', labelKey: 'Cached input ratio', read: (model) => model.cache_ratio },
  { id: 'create_cache', labelKey: 'Cache write ratio', read: (model) => model.create_cache_ratio },
  { id: 'image', labelKey: 'Image ratio', read: (model) => model.image_ratio },
  { id: 'audio', labelKey: 'Audio input ratio', read: (model) => model.audio_ratio },
  {
    id: 'audio_completion',
    labelKey: 'Audio output ratio',
    read: (model) => model.audio_completion_ratio,
  },
]

function readMultipliers(model: PricingModel): ModelMultiplier[] {
  const entries: ModelMultiplier[] = []
  for (const field of MULTIPLIER_FIELDS) {
    const ratio = finiteRatio(field.read(model))
    if (ratio === undefined) continue
    entries.push({ id: field.id, labelKey: field.labelKey, ratio })
  }
  return entries
}

/**
 * The multipliers that actually price the model.
 *
 * Only token-based rows have any: `quota_type 1` bills a flat `model_price` and leaves
 * `model_ratio` / `completion_ratio` at whatever the operator last saved, and a tiered row
 * prices from its expression instead — those ratios are reported by `fallbackMultipliers`,
 * labelled as the fallbacks they are.
 */
export function modelMultipliers(model: PricingModel): ModelMultiplier[] {
  return billingShape(model) === 'per-token' ? readMultipliers(model) : []
}

/**
 * The ratios a tiered row still carries. `service/tiered_settle.go` only falls back to them
 * when the expression fails to evaluate, so they are published as context, never as the rate.
 * Empty for the other two shapes, where the ratios mean nothing at all.
 */
export function fallbackMultipliers(model: PricingModel): ModelMultiplier[] {
  return billingShape(model) === 'tiered' ? readMultipliers(model) : []
}

/**
 * The route behind an endpoint type, from the payload's top-level `supported_endpoint` map.
 * Its values are untyped, so every field is checked before it is shown.
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

/**
 * The order the gateway walks groups for a request that targets the `auto` group, narrowed to
 * the groups this model is actually enabled for.
 */
export function autoGroupChain(model: PricingModel, autoGroups: readonly string[]): string[] {
  const enabled = new Set(modelGroups(model))
  return autoGroups.filter((group) => enabled.has(group))
}

/** Model names can contain `/`, so the detail link always carries an encoded segment. */
export function modelDetailParam(modelName: string): string {
  return encodeURIComponent(modelName)
}
