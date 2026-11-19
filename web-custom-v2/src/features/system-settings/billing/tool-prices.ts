/**
 * Per-call prices of built-in tools (`tool_price_setting.prices`,
 * `setting/operation_setting/tools.go`), in USD per 1,000 calls.
 *
 * The option holds the operator's overrides only. The server always starts from its own
 * built-in prices and lays the stored ones on top, so writing a built-in back unchanged
 * would freeze today's built-in price and hide every later server update. This editor
 * therefore shows the built-ins for reference and stores only what the operator changed
 * or added.
 *
 * A key is `tool` — the price for every model — or `tool:model-prefix*`, which wins for
 * models starting with that prefix (the longest prefix first). 0 is a valid price and makes
 * the calls free.
 */

/** Mirrors `seedHardcodedToolPrices`; keep in step with the server. */
export const BUILT_IN_TOOL_PRICES: Readonly<Record<string, number>> = {
  bing_web_search: 14,
  deepseek_fetch: 0.75,
  deepseek_search: 0.75,
  file_search: 2.5,
  google_search: 14,
  'google_search:gemini-1.5*': 0,
  'google_search:gemini-2.0*': 0,
  'google_search:gemini-2.5*': 0,
  'google_search_grounded_prompt:gemini-1.5*': 35,
  'google_search_grounded_prompt:gemini-2.0*': 35,
  'google_search_grounded_prompt:gemini-2.5*': 35,
  image_generation: 150,
  search_pro: 30,
  search_pro_quark: 50,
  search_pro_sogou: 50,
  search_std: 10,
  search_strategy_agent: 4,
  search_strategy_agent_max: 4,
  search_strategy_max: 4,
  search_strategy_turbo: 3,
  web_search: 10,
  'web_search:grok*': 5,
  web_search_preview: 10,
  'web_search_preview:gpt-4.1*': 25,
  'web_search_preview:gpt-4.1-mini*': 25,
  'web_search_preview:gpt-4o*': 25,
  'web_search_preview:gpt-4o-mini*': 25,
  x_search_posts: 5,
  x_search_profiles: 10,
}

export type ToolPriceRow = {
  /** Stable across edits, for React keys and issue lookups. */
  id: number
  tool: string
  /** The model part after `:`, as written (usually ending in `*`); empty for every model. */
  model: string
  price: string
  /** The built-in price for this key, if the server has one. */
  builtIn?: number
  /** True when the price is stored as an override; a built-in row without it uses the built-in price. */
  overridden: boolean
}

export function toolPriceKey(row: Pick<ToolPriceRow, 'tool' | 'model'>): string {
  const tool = row.tool.trim()
  const model = row.model.trim()
  return model === '' ? tool : `${tool}:${model}`
}

function splitKey(key: string): { tool: string; model: string } {
  const at = key.indexOf(':')
  return at < 0 ? { model: '', tool: key } : { model: key.slice(at + 1), tool: key.slice(0, at) }
}

/** The stored overrides, or null when the stored text is not a JSON object of prices. */
export function parseStoredToolPrices(text: string): Record<string, number> | null {
  if (text.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const prices: Record<string, number> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
      prices[key] = value
    }
    return prices
  } catch {
    return null
  }
}

/** Built-ins first, in key order, then the operator's own keys in stored order. */
export function rowsFromStored(stored: Readonly<Record<string, number>>): ToolPriceRow[] {
  let id = 0
  const rows: ToolPriceRow[] = []
  for (const key of Object.keys(BUILT_IN_TOOL_PRICES).sort()) {
    const overridden = Object.hasOwn(stored, key)
    rows.push({ ...splitKey(key), builtIn: BUILT_IN_TOOL_PRICES[key], id: ++id, overridden, price: String(overridden ? stored[key] : BUILT_IN_TOOL_PRICES[key]) })
  }
  for (const [key, price] of Object.entries(stored)) {
    if (Object.hasOwn(BUILT_IN_TOOL_PRICES, key)) continue
    rows.push({ ...splitKey(key), id: ++id, overridden: true, price: String(price) })
  }
  return rows
}

/** `id:field` for a cell, where field is `tool`, `model` or `price`. */
export type ToolPriceIssue = { id: number; field: 'tool' | 'model' | 'price'; message: string }

/** The overrides to store, or the cells that stop them being written. */
export function writeToolPrices(rows: readonly ToolPriceRow[]): { prices: Record<string, number>; issues: [] } | { prices?: undefined; issues: ToolPriceIssue[] } {
  const issues: ToolPriceIssue[] = []
  const prices: Record<string, number> = {}
  const seen = new Map<string, number>()
  for (const row of rows) {
    if (!row.overridden) continue
    const key = toolPriceKey(row)
    if (row.tool.trim() === '' || row.tool.includes(':')) {
      issues.push({ field: 'tool', id: row.id, message: 'Enter a tool name without “:”.' })
    } else if (row.model.trim() !== '' && row.model.includes(':')) {
      issues.push({ field: 'model', id: row.id, message: 'A model prefix cannot contain “:”.' })
    } else if (seen.has(key)) {
      issues.push({ field: 'tool', id: row.id, message: 'This tool and model prefix are already priced.' })
    }
    seen.set(key, row.id)
    const text = row.price.trim()
    const price = Number(text)
    if (text === '' || !Number.isFinite(price) || price < 0) {
      issues.push({ field: 'price', id: row.id, message: 'Enter a finite, non-negative price (0 makes it free).' })
      continue
    }
    prices[key] = price
  }
  return issues.length > 0 ? { issues } : { issues: [], prices }
}
