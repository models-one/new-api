import {
  BILLING_EXPR_KEY,
  BILLING_MODE_KEY,
  EXPRESSION_MODE,
  LEGACY_RATIO_KEYS,
  PLUGIN_BILLING_EXPR_KEY,
  type LegacyRatioKey,
  type ModelPricingEntry,
  type PricingValues,
} from '@/features/system-settings/billing/model-pricing-api'

/**
 * How one model's pricing is edited (`pkg/billingexpr/expr.md`).
 *
 * An expression is the billing contract: its coefficients are USD per 1M tokens and it is
 * evaluated as written. The two legacy modes — per-token ratios and a fixed price per
 * request — still run, but new prices default to an expression and a legacy price can be
 * converted to one. Legacy fields are kept when a model switches to an expression, so it
 * can be switched back.
 */

export type PricingMode = 'expression' | 'per-token' | 'per-request'

export function pricingModeOf(values: PricingValues | undefined): PricingMode {
  if (values?.[BILLING_MODE_KEY] === EXPRESSION_MODE) return 'expression'
  if (values?.ModelPrice !== undefined) return 'per-request'
  return 'per-token'
}

function hasBasePrice(values: PricingValues): boolean {
  return values[BILLING_MODE_KEY] !== undefined || values.ModelPrice !== undefined || values.ModelRatio !== undefined
}

/** The editor's state. Numbers are kept as typed until the draft is turned into values. */
export type PricingDraft = {
  mode: PricingMode
  expression: string
  modelPrice: string
  ratios: Record<LegacyRatioKey, string>
}

function typed(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

/**
 * The draft an editor opens with. Stored values come first. A model with no stored
 * expression that bills by a built-in one opens on that expression, so the operator edits
 * the price actually charged; it is only stored if it is changed.
 */
export function draftFromEntry(entry: Pick<ModelPricingEntry, 'configured' | 'effective'> | undefined): PricingDraft {
  const configured = entry?.configured ?? {}
  const effective = entry?.effective ?? configured
  // Nothing stored: open on the built-in price, or on an expression for a new price.
  let mode: PricingMode = 'expression'
  if (hasBasePrice(configured)) mode = pricingModeOf(configured)
  else if (hasBasePrice(effective)) mode = pricingModeOf(effective)
  const ratios = {} as Record<LegacyRatioKey, string>
  for (const key of LEGACY_RATIO_KEYS) ratios[key] = typed(configured[key])
  return {
    expression: configured[BILLING_EXPR_KEY] ?? (mode === 'expression' ? (effective[BILLING_EXPR_KEY] ?? '') : ''),
    mode,
    modelPrice: typed(configured.ModelPrice),
    ratios,
  }
}

export type DraftProblem =
  | { field: 'expression'; reason: 'empty' }
  | { field: 'modelPrice'; reason: 'empty' | 'invalid' }
  | { field: LegacyRatioKey; reason: 'empty' | 'invalid' }

/** A typed number the server would accept: finite and not negative. */
function readNumber(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const number = Number(trimmed)
  return Number.isFinite(number) && number >= 0 ? number : 'invalid'
}

/**
 * The complete values to store for the model, or the first problem. The server replaces a
 * model's stored pricing as a whole, so the plugin prices this editor does not change are
 * carried over from what is stored.
 */
export function pricingFromDraft(
  draft: PricingDraft,
  configured: PricingValues,
): { values: PricingValues; problem?: undefined } | { values?: undefined; problem: DraftProblem } {
  const values: PricingValues = {}
  const plugins = configured[PLUGIN_BILLING_EXPR_KEY]
  if (plugins !== undefined && Object.keys(plugins).length > 0) values[PLUGIN_BILLING_EXPR_KEY] = plugins

  const price = readNumber(draft.modelPrice)
  if (price === 'invalid') return { problem: { field: 'modelPrice', reason: 'invalid' } }
  for (const key of LEGACY_RATIO_KEYS) {
    const ratio = readNumber(draft.ratios[key])
    if (ratio === 'invalid') return { problem: { field: key, reason: 'invalid' } }
    // A legacy ratio is stored with a per-token or an expression price, never beside a
    // fixed price per request, which ignores it.
    if (ratio !== null && draft.mode !== 'per-request') values[key] = ratio
  }

  if (draft.mode === 'expression') {
    const expression = draft.expression.trim()
    if (expression === '') return { problem: { field: 'expression', reason: 'empty' } }
    values[BILLING_MODE_KEY] = EXPRESSION_MODE
    values[BILLING_EXPR_KEY] = expression
    if (price !== null) values.ModelPrice = price
    return { values }
  }

  values[BILLING_MODE_KEY] = 'ratio'
  if (draft.mode === 'per-request') {
    if (price === null) return { problem: { field: 'modelPrice', reason: 'empty' } }
    values.ModelPrice = price
    return { values }
  }
  if (values.ModelRatio === undefined) return { problem: { field: 'ModelRatio', reason: 'empty' } }
  return { values }
}

/** Compares two value sets the way the server versions them: by content, not key order. */
export function samePricing(left: PricingValues, right: PricingValues): boolean {
  return canonical(left) === canonical(right)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

// ---------------------------------------------------------------------------
// Flat token prices — the expression most models need
// ---------------------------------------------------------------------------

/** USD per 1M tokens. `cacheRead` is optional; empty leaves cached input in the input price. */
export type FlatPrices = { input: string; output: string; cacheRead: string }

const FLAT_TERMS: Array<[keyof FlatPrices, string]> = [
  ['input', 'p'],
  ['output', 'c'],
  ['cacheRead', 'cr'],
]

/** `tier("base", p * 2.5 + c * 15 + cr * 0.25)`, or null when a price is missing or invalid. */
export function flatExpression(prices: FlatPrices): string | null {
  const terms: string[] = []
  for (const [field, variable] of FLAT_TERMS) {
    const value = readNumber(prices[field])
    if (value === 'invalid') return null
    if (value === null) {
      if (field !== 'cacheRead') return null
      continue
    }
    terms.push(`${variable} * ${value}`)
  }
  return `tier("base", ${terms.join(' + ')})`
}

/**
 * The flat prices of an expression of exactly that shape, or null for anything else —
 * tiers, conditions, request rules or other variables are edited as text.
 */
export function parseFlatExpression(expression: string): FlatPrices | null {
  const match = expression.trim().match(/^(?:v1:)?tier\(\s*"[^"]*"\s*,\s*(.+)\)$/)
  if (match === null) return null
  const prices: FlatPrices = { cacheRead: '', input: '', output: '' }
  for (const term of match[1].split('+')) {
    const part = term.trim().match(/^(p|c|cr)\s*\*\s*([\d.]+(?:[eE][+-]?\d+)?)$/)
    if (part === null) return null
    const field = FLAT_TERMS.find(([, variable]) => variable === part[1])?.[0]
    if (field === undefined || prices[field] !== '') return null
    prices[field] = String(Number(part[2]))
  }
  return prices.input !== '' && prices.output !== '' ? prices : null
}

/**
 * A legacy ratio in USD per 1M tokens: `ModelRatio * 1,000,000 / QuotaPerUnit` for the
 * input price, then times a completion or cache ratio for the others.
 */
export function ratioToUsdPerMillion(ratio: number, quotaPerUnit: number): number {
  return (ratio * 1_000_000) / quotaPerUnit
}

/**
 * A price for display, to six significant digits: `2.5`, `0.0375`, `0.547945`, never
 * `2.4999999999999996`. Ratios converted from other currencies are long decimals.
 */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return String(Number(value.toPrecision(6)))
}
