import { isTieredBilling, type PricingModel } from '@/lib/api/pricing'

/**
 * Reading of `billing_mode: 'tiered_expr'` rows.
 *
 * For these models `model_ratio` / `model_price` are only fallbacks — the charged rate lives
 * in `billing_expr`, an expression of the shape
 * `v2:len > 200000 ? tier("long", p * 2.5 + c * 20) : tier("base", p * 1.25 + c * 10)`.
 * The coefficients are USD per 1M tokens, the same scale `inputPricePerMillion` returns
 * (`web/src/features/pricing/lib/dynamic-price.ts` formats them straight as currency).
 *
 * Ported from the legacy `features/pricing/lib/billing-expr.ts` tier parser, with one
 * deliberate omission: the legacy estimator evaluates the expression with `new Function`.
 * Nothing here executes operator-authored text — the expression is only ever read. Anything
 * the parser cannot read is reported as unparsed so the page shows the raw expression instead
 * of a number that would be wrong.
 */

/** One priced variable in the expression, in the order prices are listed. */
export type TierPriceVariable = {
  /** Variable name inside the expression. */
  key: string
  /** English source string for the label; goes through `t()` at the call site. */
  labelKey: string
  /** Input-side prices are listed before output-side ones. */
  primary: boolean
}

export const TIER_PRICE_VARIABLES: readonly TierPriceVariable[] = [
  { key: 'p', labelKey: 'Input', primary: true },
  { key: 'c', labelKey: 'Output', primary: true },
  { key: 'cr', labelKey: 'Cached input', primary: false },
  { key: 'cc', labelKey: 'Cache write', primary: false },
  { key: 'cc1h', labelKey: 'Cache write (1h)', primary: false },
  { key: 'img', labelKey: 'Image input', primary: false },
  { key: 'img_o', labelKey: 'Image output', primary: false },
  { key: 'ai', labelKey: 'Audio input', primary: false },
  { key: 'ao', labelKey: 'Audio output', primary: false },
]

export type TierCondition = {
  /** `p` prompt tokens, `c` completion tokens, `len` total input length. */
  variable: 'p' | 'c' | 'len'
  operator: '<' | '<=' | '>' | '>='
  value: number
}

export type TierPrice = {
  variable: TierPriceVariable
  /** USD per 1M tokens, before the group ratio. */
  perMillion: number
}

export type ParsedTier = {
  /** Operator-written tier name, e.g. "base" or "long". Can be empty. */
  label: string
  conditions: readonly TierCondition[]
  prices: readonly TierPrice[]
}

export type TieredBilling = {
  rawExpression: string
  tiers: readonly ParsedTier[]
  /**
   * False when the expression carries no readable `tier(...)` call. The raw expression is then
   * the only honest thing to show.
   */
  parsed: boolean
  /**
   * The expression multiplies the tier price by a request-dependent factor
   * (`(<condition> ? 1.5 : 1)`), so even a parsed tier is not the final rate.
   */
  hasConditionalMultipliers: boolean
}

/** `v2:<body>` — the version prefix carries no price information. */
function stripVersionPrefix(expression: string): string {
  const match = expression.match(/^v(\d+):([\s\S]*)$/)
  return match ? match[2] : expression
}

const PRICE_KEYS = TIER_PRICE_VARIABLES.map((variable) => variable.key).join('|')
const CONDITION_GROUP =
  '((?:(?:p|c|len)\\s*(?:<|<=|>|>=)\\s*[\\d.eE+]+)(?:\\s*&&\\s*(?:p|c|len)\\s*(?:<|<=|>|>=)\\s*[\\d.eE+]+)*)'
const TIER_PATTERN = `(?:${CONDITION_GROUP}\\s*\\?\\s*)?tier\\("([^"]*)",\\s*([^)]+)\\)`
/** `(<anything> ? <number> : 1)` — a request-rule multiplier factor. */
const CONDITIONAL_MULTIPLIER_PATTERN = /\?\s*[\d.eE+-]+\s*:\s*1\s*\)/

function parseConditions(raw: string): TierCondition[] {
  if (raw === '') return []
  const conditions: TierCondition[] = []
  for (const part of raw.split(/\s*&&\s*/)) {
    const match = part.trim().match(/^(p|c|len)\s*(<|<=|>|>=)\s*([\d.eE+]+)$/)
    if (match === null) continue
    conditions.push({
      variable: match[1] as TierCondition['variable'],
      operator: match[2] as TierCondition['operator'],
      value: Number(match[3]),
    })
  }
  return conditions
}

/** `p * 1.25 + c * 10 + cr * 0.125` — the first coefficient per variable wins. */
function parsePrices(body: string): TierPrice[] {
  const coefficients = new Map<string, number>()
  const matcher = new RegExp(`\\b(${PRICE_KEYS})\\s*\\*\\s*([\\d.eE+-]+)`, 'g')
  let match = matcher.exec(body)
  while (match !== null) {
    const value = Number(match[2])
    if (!coefficients.has(match[1]) && Number.isFinite(value)) coefficients.set(match[1], value)
    match = matcher.exec(body)
  }

  const prices: TierPrice[] = []
  for (const variable of TIER_PRICE_VARIABLES) {
    const perMillion = coefficients.get(variable.key)
    // A zero coefficient means the variable is not charged, so it is not listed.
    if (perMillion === undefined || perMillion <= 0) continue
    prices.push({ variable, perMillion })
  }
  return prices
}

export function parseTieredBilling(model: PricingModel): TieredBilling | undefined {
  if (!isTieredBilling(model)) return undefined

  const rawExpression = (model.billing_expr ?? '').trim()
  const body = stripVersionPrefix(rawExpression)
  const tiers: ParsedTier[] = []

  const matcher = new RegExp(TIER_PATTERN, 'g')
  let match = matcher.exec(body)
  while (match !== null) {
    tiers.push({
      label: match[2],
      conditions: parseConditions(match[1] ?? ''),
      prices: parsePrices(match[3]),
    })
    match = matcher.exec(body)
  }

  return {
    rawExpression,
    tiers,
    parsed: tiers.length > 0,
    hasConditionalMultipliers: CONDITIONAL_MULTIPLIER_PATTERN.test(body),
  }
}

/** `len > 200000` — rendered next to a tier so the reader knows when it applies. */
export function formatTierCondition(condition: TierCondition): string {
  return `${condition.variable} ${condition.operator} ${condition.value.toLocaleString('en-US')}`
}
