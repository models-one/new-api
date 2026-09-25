import {
  parseNumberMap,
  parseStringMap,
  stringifyMap,
  type NumberMap,
  type StringMap,
} from '@/features/system-settings/billing/option-json'

/**
 * THE MODEL PRICING MODEL
 * =======================
 * A model's price is not stored as a record. It is scattered across ten independent
 * option keys, each a `{ "model-name": value }` map, and a model "exists" purely because
 * some key mentions it. This module joins those maps into one row per model and splits an
 * edited row back out again.
 *
 * All ten keys were confirmed present in `GET /api/option/` on the running dev server.
 *
 * THE THREE BILLING MODES, exactly as `setting/billing_setting/tiered_billing.go` and
 * `relay/helper/price.go` resolve them:
 *
 *   tiered_expr   `billing_setting.billing_mode[model] === 'tiered_expr'`. The expression
 *                 in `billing_setting.billing_expr[model]` is then the WHOLE billing
 *                 contract — the ratio keys are ignored for that model.
 *   per-request   No tiered mode, but `ModelPrice[model]` is set: a flat charge per call,
 *                 and every ratio is ignored.
 *   per-token     Everything else. `ModelRatio` is the base, the other six ratios are
 *                 multipliers on top of it.
 *
 * `hasConflict` marks the ambiguous middle: a fixed `ModelPrice` set at the same time as
 * per-token ratios. The backend silently prefers the fixed price; the operator usually
 * did not mean to leave both.
 */

/** The eight `{model: number}` keys, in the order the table shows them. */
export const RATIO_OPTION_KEYS = [
  'ModelPrice',
  'ModelRatio',
  'CompletionRatio',
  'CacheRatio',
  'CreateCacheRatio',
  'ImageRatio',
  'AudioRatio',
  'AudioCompletionRatio',
] as const

export type RatioOptionKey = (typeof RATIO_OPTION_KEYS)[number]

export const BILLING_MODE_OPTION_KEY = 'billing_setting.billing_mode'
export const BILLING_EXPR_OPTION_KEY = 'billing_setting.billing_expr'

/** `billing_setting.billing_mode` only ever holds this one non-default value. */
export const TIERED_BILLING_MODE = 'tiered_expr'

export type BillingMode = 'per-token' | 'per-request' | 'tiered_expr'

/** The ten raw JSON strings a pricing edit reads from and writes back to. */
export type ModelPricingMaps = Record<RatioOptionKey, string> & {
  [BILLING_MODE_OPTION_KEY]: string
  [BILLING_EXPR_OPTION_KEY]: string
}

export type ModelPricingRow = {
  name: string
  mode: BillingMode
  /** `null` means "this key has no entry for this model", which is not the same as 0. */
  price: number | null
  ratio: number | null
  completionRatio: number | null
  cacheRatio: number | null
  createCacheRatio: number | null
  imageRatio: number | null
  audioRatio: number | null
  audioCompletionRatio: number | null
  /** The stored expression, verbatim. Empty unless `mode` is 'tiered_expr'. */
  expr: string
  /** Occurrences of `tier(` in the expression — a hint, not a parse. */
  tierCount: number
  /** A fixed price and per-token ratios are both set; the fixed price wins upstream. */
  hasConflict: boolean
}

/** The editable half of a row. `null` clears that model's entry in that key. */
export type ModelPricingEdit = {
  name: string
  mode: BillingMode
  price: number | null
  ratio: number | null
  completionRatio: number | null
  cacheRatio: number | null
  createCacheRatio: number | null
  imageRatio: number | null
  audioRatio: number | null
  audioCompletionRatio: number | null
  expr: string
}

type ParsedMaps = {
  ratios: Record<RatioOptionKey, NumberMap>
  modes: StringMap
  exprs: StringMap
}

function parseMaps(maps: ModelPricingMaps): ParsedMaps {
  const ratios = {} as Record<RatioOptionKey, NumberMap>
  for (const key of RATIO_OPTION_KEYS) ratios[key] = parseNumberMap(maps[key])

  return {
    exprs: parseStringMap(maps[BILLING_EXPR_OPTION_KEY]),
    modes: parseStringMap(maps[BILLING_MODE_OPTION_KEY]),
    ratios,
  }
}

function entryOf(map: NumberMap, name: string): number | null {
  const value = map[name]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Occurrences of the `tier(` marker. Informational only — this is not an expression parser. */
export function countTiers(expr: string): number {
  return (expr.match(/tier\s*\(/g) ?? []).length
}

/**
 * One row per model named anywhere in the ten maps, sorted by name.
 *
 * Sorting is `localeCompare` so a model list that mixes scripts still reads in a stable,
 * human order rather than by code point.
 */
export function buildModelRows(maps: ModelPricingMaps): ModelPricingRow[] {
  const parsed = parseMaps(maps)

  const names = new Set<string>()
  for (const key of RATIO_OPTION_KEYS) for (const name of Object.keys(parsed.ratios[key])) names.add(name)
  for (const name of Object.keys(parsed.modes)) names.add(name)
  for (const name of Object.keys(parsed.exprs)) names.add(name)

  return [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => toRow(name, parsed))
}

/** The precedence the gateway itself applies: an expression beats a fixed price beats ratios. */
function resolveMode(isTiered: boolean, price: number | null): BillingMode {
  if (isTiered) return 'tiered_expr'
  if (price !== null) return 'per-request'
  return 'per-token'
}

function toRow(name: string, parsed: ParsedMaps): ModelPricingRow {
  const price = entryOf(parsed.ratios.ModelPrice, name)
  const ratio = entryOf(parsed.ratios.ModelRatio, name)
  const completionRatio = entryOf(parsed.ratios.CompletionRatio, name)
  const cacheRatio = entryOf(parsed.ratios.CacheRatio, name)
  const createCacheRatio = entryOf(parsed.ratios.CreateCacheRatio, name)
  const imageRatio = entryOf(parsed.ratios.ImageRatio, name)
  const audioRatio = entryOf(parsed.ratios.AudioRatio, name)
  const audioCompletionRatio = entryOf(parsed.ratios.AudioCompletionRatio, name)

  const isTiered = parsed.modes[name] === TIERED_BILLING_MODE
  const expr = isTiered ? (parsed.exprs[name] ?? '') : ''

  const perTokenSet = [
    ratio,
    completionRatio,
    cacheRatio,
    createCacheRatio,
    imageRatio,
    audioRatio,
    audioCompletionRatio,
  ].some((value) => value !== null)

  const mode = resolveMode(isTiered, price)

  return {
    audioCompletionRatio,
    audioRatio,
    cacheRatio,
    completionRatio,
    createCacheRatio,
    expr,
    hasConflict: !isTiered && price !== null && perTokenSet,
    imageRatio,
    mode,
    name,
    price,
    ratio,
    tierCount: countTiers(expr),
  }
}

function withEntry(map: NumberMap, name: string, value: number | null): NumberMap {
  const next = { ...map }
  if (value === null) delete next[name]
  else next[name] = value
  return next
}

function withStringEntry(map: StringMap, name: string, value: string): StringMap {
  const next = { ...map }
  if (value === '') delete next[name]
  else next[name] = value
  return next
}

/**
 * Folds one edited model back into the ten JSON strings.
 *
 * The mode decides which keys survive. Leaving a stale `ModelPrice` behind when the
 * operator switches a model to per-token would keep the model billed per request, because
 * that is how `relay/helper/price.go` resolves it — so the keys the chosen mode does not
 * use are CLEARED for that model rather than left in place.
 */
export function applyModelEdit(maps: ModelPricingMaps, edit: ModelPricingEdit): ModelPricingMaps {
  const parsed = parseMaps(maps)
  const name = edit.name.trim()
  if (name === '') return maps

  const isTiered = edit.mode === 'tiered_expr'
  const isPerRequest = edit.mode === 'per-request'
  const isPerToken = edit.mode === 'per-token'

  const nextRatios: Record<RatioOptionKey, NumberMap> = {
    AudioCompletionRatio: withEntry(
      parsed.ratios.AudioCompletionRatio,
      name,
      isPerToken ? edit.audioCompletionRatio : null,
    ),
    AudioRatio: withEntry(parsed.ratios.AudioRatio, name, isPerToken ? edit.audioRatio : null),
    CacheRatio: withEntry(parsed.ratios.CacheRatio, name, isPerToken ? edit.cacheRatio : null),
    CompletionRatio: withEntry(
      parsed.ratios.CompletionRatio,
      name,
      isPerToken ? edit.completionRatio : null,
    ),
    CreateCacheRatio: withEntry(
      parsed.ratios.CreateCacheRatio,
      name,
      isPerToken ? edit.createCacheRatio : null,
    ),
    ImageRatio: withEntry(parsed.ratios.ImageRatio, name, isPerToken ? edit.imageRatio : null),
    ModelPrice: withEntry(parsed.ratios.ModelPrice, name, isPerRequest ? edit.price : null),
    ModelRatio: withEntry(parsed.ratios.ModelRatio, name, isPerToken ? edit.ratio : null),
  }

  const next = { ...maps } as ModelPricingMaps
  for (const key of RATIO_OPTION_KEYS) next[key] = stringifyMap(nextRatios[key])

  next[BILLING_MODE_OPTION_KEY] = stringifyMap(
    withStringEntry(parsed.modes, name, isTiered ? TIERED_BILLING_MODE : ''),
  )
  next[BILLING_EXPR_OPTION_KEY] = stringifyMap(
    withStringEntry(parsed.exprs, name, isTiered ? edit.expr.trim() : ''),
  )

  return next
}

/** Drops every trace of the named models from all ten maps. */
export function removeModels(maps: ModelPricingMaps, names: readonly string[]): ModelPricingMaps {
  if (names.length === 0) return maps
  const parsed = parseMaps(maps)
  const doomed = new Set(names)

  const next = { ...maps } as ModelPricingMaps
  for (const key of RATIO_OPTION_KEYS) {
    const map = { ...parsed.ratios[key] }
    for (const name of doomed) delete map[name]
    next[key] = stringifyMap(map)
  }

  const modes = { ...parsed.modes }
  const exprs = { ...parsed.exprs }
  for (const name of doomed) {
    delete modes[name]
    delete exprs[name]
  }
  next[BILLING_MODE_OPTION_KEY] = stringifyMap(modes)
  next[BILLING_EXPR_OPTION_KEY] = stringifyMap(exprs)

  return next
}

/** A row prefilled for the "add a model" path. */
export function emptyEdit(): ModelPricingEdit {
  return {
    audioCompletionRatio: null,
    audioRatio: null,
    cacheRatio: null,
    completionRatio: null,
    createCacheRatio: null,
    expr: '',
    imageRatio: null,
    mode: 'per-token',
    name: '',
    price: null,
    ratio: null,
  }
}

export function toEdit(row: ModelPricingRow): ModelPricingEdit {
  return {
    audioCompletionRatio: row.audioCompletionRatio,
    audioRatio: row.audioRatio,
    cacheRatio: row.cacheRatio,
    completionRatio: row.completionRatio,
    createCacheRatio: row.createCacheRatio,
    expr: row.expr,
    imageRatio: row.imageRatio,
    mode: row.mode,
    name: row.name,
    price: row.price,
    ratio: row.ratio,
  }
}

/**
 * The shallow structural check the expression editor runs before a write is allowed.
 *
 * `PUT /api/option/` does NOT validate `billing_setting.billing_expr` — verified live: the
 * literal string "not json at all" was accepted and stored. The server only compiles and
 * smoke-tests an expression when a request is actually billed, which is far too late. This
 * is deliberately conservative: it catches the mistakes a person makes while typing, and
 * refuses to pretend it is the compiler in `pkg/billingexpr`.
 */
export type ExprProblem = 'empty' | 'unbalanced' | 'no-tier'

export function checkExpression(expr: string): ExprProblem | undefined {
  const trimmed = expr.trim()
  if (trimmed === '') return 'empty'
  if (!isBalanced(trimmed)) return 'unbalanced'
  if (countTiers(trimmed) === 0) return 'no-tier'
  return undefined
}

function isBalanced(expr: string): boolean {
  let depth = 0
  let quote: string | undefined

  for (let index = 0; index < expr.length; index += 1) {
    const character = expr[index]

    if (quote !== undefined) {
      if (character === '\\') index += 1
      else if (character === quote) quote = undefined
      continue
    }

    if (character === '"' || character === "'") quote = character
    else if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth < 0) return false
    }
  }

  return depth === 0 && quote === undefined
}
