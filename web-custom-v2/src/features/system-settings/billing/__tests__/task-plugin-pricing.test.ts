import { describe, expect, it } from 'vitest'

import {
  blankPriceTable,
  modelPriceChargesPlugin,
  readPriceTable,
  writePriceTable,
  type PriceTable,
} from '@/features/system-settings/billing/task-plugin-pricing'
import { evaluateBillingExpression } from '@/lib/billing-expression/runtime'
import type { BillingUsageSchema } from '@/lib/billing-expression/usage-schema'

/** A video plugin: seconds of output, priced by resolution. */
const VIDEO: BillingUsageSchema = {
  resolution: { enum: ['720p', '1080p'], type: 'number' },
  seconds: { type: 'number', unit: 'second' },
}
const TOKENS: BillingUsageSchema = { output_tokens: { type: 'number', unit: 'token' } }

function costOf(expression: string, usage: Record<string, unknown>): number {
  const result = evaluateBillingExpression(expression, { usage })
  if (result.status !== 'success') throw new Error(`${result.status}: ${expression}`)
  return result.cost
}

/** Fills each row: `constant` is the per-task price, every other key a unit price. */
function filled(table: PriceTable, prices: Array<Record<string, string>>): PriceTable {
  return {
    rows: table.rows.map((row, index) => {
      const { constant = row.constant, ...unitPrices } = prices[index]
      return { ...row, constant, unitPrices: { ...row.unitPrices, ...unitPrices } }
    }),
  }
}

describe('a task plugin’s price table', () => {
  it('starts empty, one row per enum combination, and refuses to save until every price is typed', () => {
    const table = blankPriceTable(VIDEO)
    expect(table.rows.map((row) => row.combination)).toEqual([{ resolution: '720p' }, { resolution: '1080p' }])
    expect(writePriceTable(table, VIDEO).issues).toEqual(['0:seconds', '1:seconds'])
  })

  it('charges each combination its own price per unit', () => {
    const table = filled(blankPriceTable(VIDEO), [{ seconds: '0.1' }, { seconds: '0.25' }])
    const { expression } = writePriceTable(table, VIDEO)
    expect(costOf(expression!, { resolution: '720p', seconds: 8 })).toBeCloseTo(0.8)
    expect(costOf(expression!, { resolution: '1080p', seconds: 8 })).toBeCloseTo(2)
  })

  it('collapses a table with one price for every row into a single tier', () => {
    const table = filled(blankPriceTable(VIDEO), [{ seconds: '0.1' }, { seconds: '0.1' }])
    expect(writePriceTable(table, VIDEO).expression).toBe('tier("base", u("seconds") * 0.1)')
  })

  it('adds a per-task price on top of the usage price', () => {
    const table: PriceTable = { rows: [{ combination: {}, constant: '0.5', unitPrices: { seconds: '0.1' } }] }
    const { expression } = writePriceTable(table, { seconds: { type: 'number', unit: 'second' } })
    expect(costOf(expression!, { seconds: 10 })).toBeCloseTo(1.5)
  })

  it('prices token fields per 1M tokens', () => {
    const table: PriceTable = { rows: [{ combination: {}, constant: '', unitPrices: { output_tokens: '10' } }] }
    const { expression } = writePriceTable(table, TOKENS)
    expect(costOf(expression!, { output_tokens: 1_000_000 })).toBeCloseTo(10)
  })

  it('refuses a negative or non-numeric price, never turning it into 0', () => {
    const table: PriceTable = { rows: [{ combination: {}, constant: '-1', unitPrices: { output_tokens: 'abc' } }] }
    expect(writePriceTable(table, TOKENS).issues).toEqual(['0:constant', '0:output_tokens'])
  })

  it('reads back the table it wrote', () => {
    const table = filled(blankPriceTable(VIDEO), [{ seconds: '0.1' }, { constant: '1', seconds: '0.25' }])
    const { expression } = writePriceTable(table, VIDEO)
    expect(readPriceTable(expression!, VIDEO)).toEqual(table)
  })

  it('leaves an expression it cannot show as a table to the text editor', () => {
    expect(readPriceTable('max(u("seconds") * 0.1, 1)', VIDEO)).toBeNull()
    // A plugin that reports no numbers has nothing to put in a table.
    expect(readPriceTable('', { quality: { enum: ['hd'] } })).toBeNull()
  })
})

describe('whether the model price charges a plugin’s tasks', () => {
  const plugin = { relay: false, usage_schema: VIDEO }

  it('accepts an expression that reads only the plugin’s usage', () => {
    expect(modelPriceChargesPlugin(plugin, { expression: 'tier("base", u("seconds") * 0.1)', mode: 'expression' })).toBe(true)
  })

  it('rejects a chat token price, and usage the plugin does not report', () => {
    expect(modelPriceChargesPlugin(plugin, { expression: 'tier("base", p * 2 + c * 8)', mode: 'expression' })).toBe(false)
    expect(modelPriceChargesPlugin(plugin, { expression: 'tier("base", u("frames") * 0.1)', mode: 'expression' })).toBe(false)
  })

  it('lets a relaying plugin use a legacy price only per request', () => {
    expect(modelPriceChargesPlugin({ ...plugin, relay: true }, { expression: '', mode: 'per-token' })).toBe(false)
    expect(modelPriceChargesPlugin({ ...plugin, relay: true }, { expression: '', mode: 'per-request' })).toBe(true)
    expect(modelPriceChargesPlugin(plugin, { expression: '', mode: 'per-token' })).toBe(true)
  })
})
