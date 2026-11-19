import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { adjustPrice, importedPricing } from '@/features/system-settings/billing/price-sync'
import {
  BUILT_IN_TOOL_PRICES,
  parseStoredToolPrices,
  rowsFromStored,
  writeToolPrices,
  type ToolPriceRow,
} from '@/features/system-settings/billing/tool-prices'
import { evaluateBillingExpression } from '@/lib/billing-expression/runtime'

describe('tool prices', () => {
  it('mirrors every built-in price the server seeds', () => {
    const go = readFileSync(resolve(process.cwd(), '../setting/operation_setting/tools.go'), 'utf8')
    const constants = Object.fromEntries([...go.matchAll(/(default\w+)\s*=\s*([\d.]+)/g)].map((match) => [match[1], Number(match[2])]))
    const seeded: Record<string, number> = {}
    for (const match of go.matchAll(/prices\["([^"]+)"\]\s*=\s*([\w.]+)/g)) {
      seeded[match[1]] = match[2] in constants ? constants[match[2]] : Number(match[2])
    }
    expect(Object.keys(seeded).length).toBeGreaterThan(20)
    expect(BUILT_IN_TOOL_PRICES).toEqual(seeded)
  })

  it('stores only overrides and additions, never an untouched built-in', () => {
    const rows = rowsFromStored({ custom_tool: 3, web_search: 8 })
    expect(writeToolPrices(rows).prices).toEqual({ custom_tool: 3, web_search: 8 })
    expect(writeToolPrices(rowsFromStored({})).prices).toEqual({})
  })

  it('turns an edited built-in into an override, and drops it again when reset', () => {
    const rows = rowsFromStored({})
    const edited = rows.map((row): ToolPriceRow => (row.tool === 'file_search' ? { ...row, overridden: true, price: '0' } : row))
    expect(writeToolPrices(edited).prices).toEqual({ file_search: 0 })
    const reset = edited.map((row) => (row.tool === 'file_search' ? { ...row, overridden: false } : row))
    expect(writeToolPrices(reset).prices).toEqual({})
  })

  it('writes a model prefix as tool:prefix', () => {
    const rows: ToolPriceRow[] = [{ id: 1, model: 'gpt-5*', overridden: true, price: '12', tool: 'web_search' }]
    expect(writeToolPrices(rows).prices).toEqual({ 'web_search:gpt-5*': 12 })
  })

  it('refuses an empty, negative or duplicate price rather than dropping it', () => {
    const rows: ToolPriceRow[] = [
      { id: 1, model: '', overridden: true, price: '', tool: 'a' },
      { id: 2, model: '', overridden: true, price: '-1', tool: 'b' },
      { id: 3, model: '', overridden: true, price: '1', tool: 'c' },
      { id: 4, model: '', overridden: true, price: '2', tool: 'c' },
      { id: 5, model: '', overridden: true, price: '2', tool: '' },
    ]
    expect(writeToolPrices(rows).issues.map((issue) => `${issue.id}:${issue.field}`)).toEqual(['1:price', '2:price', '4:tool', '5:tool'])
  })

  it('reads only a JSON object of non-negative numbers', () => {
    expect(parseStoredToolPrices('')).toEqual({})
    expect(parseStoredToolPrices('{"a":1}')).toEqual({ a: 1 })
    expect(parseStoredToolPrices('{"a":-1}')).toBeNull()
    expect(parseStoredToolPrices('[1]')).toBeNull()
    expect(parseStoredToolPrices('nope')).toBeNull()
  })
})

describe('importing a source’s price', () => {
  it('replaces the model’s own price and keeps its plugin prices', () => {
    const configured = { 'billing_setting.plugin_billing_expr': { kling: 'tier("base", u("seconds") * 0.1)' }, CacheRatio: 0.1, ModelRatio: 1 }
    expect(importedPricing({ completion_ratio: 4, model_ratio: 2.5 }, configured).values).toEqual({
      'billing_setting.billing_mode': 'ratio',
      'billing_setting.plugin_billing_expr': { kling: 'tier("base", u("seconds") * 0.1)' },
      CompletionRatio: 4,
      ModelRatio: 2.5,
    })
  })

  it('imports an expression verbatim, without the legacy ratios beside it', () => {
    const expr = 'tier("base", p * 3 + c * 15)'
    expect(importedPricing({ billing_expr: expr, billing_mode: 'tiered_expr', model_ratio: 1.5 }, { ModelRatio: 9 }).values).toEqual({
      'billing_setting.billing_expr': expr,
      'billing_setting.billing_mode': 'tiered_expr',
    })
  })

  it('keeps only the fixed price of a per-request source', () => {
    expect(importedPricing({ model_price: 0.04, model_ratio: 2 }, {}).values).toEqual({ 'billing_setting.billing_mode': 'ratio', ModelPrice: 0.04 })
  })

  it('refuses a negative price and a source with no base price', () => {
    expect(importedPricing({ model_ratio: -1 }, {}).error).toBeDefined()
    expect(importedPricing({ completion_ratio: 2 }, {}).error).toBeDefined()
    expect(importedPricing({ billing_expr: 'tier(', billing_mode: 'tiered_expr' }, {}).error).toBeDefined()
  })
})

describe('converting a source’s price by the exchange rate', () => {
  it('divides a ratio or a fixed price, and never rewrites from an earlier result', () => {
    expect(adjustPrice({ completion_ratio: 4, model_ratio: 7.3 }, 'divide', 7.3).values).toEqual({ completion_ratio: 4, model_ratio: 1 })
    expect(adjustPrice({ model_price: 1 }, 'multiply', 7.3).values).toEqual({ model_price: 7.3 })
    expect(adjustPrice({ model_ratio: 7.3 }, 'keep', null).values).toEqual({ model_ratio: 7.3 })
  })

  it('converts every tier of an expression and leaves request multipliers alone', () => {
    const expr = '(len <= 1000 ? tier("short", p * 7.3 + c * 14.6) : tier("long", p * 14.6)) * (param("service_tier") == "priority" ? 2 : 1)'
    const converted = adjustPrice({ billing_expr: expr, billing_mode: 'tiered_expr' }, 'divide', 7.3).values!.billing_expr!
    const cost = (len: number, tier?: string) => {
      const result = evaluateBillingExpression(converted, { request: { body: tier ? { service_tier: tier } : {} }, tokens: { c: 0, len, p: 1_000_000 } })
      return result.status === 'success' ? result.cost : Number.NaN
    }
    expect(cost(500)).toBeCloseTo(1_000_000)
    expect(cost(5000)).toBeCloseTo(2_000_000)
    expect(cost(500, 'priority')).toBeCloseTo(2_000_000)
  })

  it('refuses what it cannot convert safely', () => {
    expect(adjustPrice({ billing_expr: 'max(p * 2, 1)', billing_mode: 'tiered_expr' }, 'divide', 7.3).error).toBeDefined()
    expect(adjustPrice({ model_ratio: 1 }, 'divide', 0).error).toBeDefined()
    expect(adjustPrice({ model_ratio: 1e-320 }, 'divide', 1e10).error).toBeDefined()
  })
})
