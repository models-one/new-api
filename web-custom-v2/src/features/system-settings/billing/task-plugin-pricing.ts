import type { ModelPricingPluginVariant } from '@/features/system-settings/billing/model-pricing-api'
import type { PricingDraft } from '@/features/system-settings/billing/model-pricing-draft'
import { taskExpressionCompatible } from '@/lib/billing-expression/plugin-pricing'
import {
  generateTaskExprFromConfig,
  getTaskEnumCombinations,
  getTaskNumberFields,
  taskMatrixToTiers,
  tryParseTaskMatrixConfig,
} from '@/lib/billing-expression/task-expr'
import type { BillingUsageSchema } from '@/lib/billing-expression/usage-schema'

/**
 * A task plugin's own price for one model (`billing_setting.plugin_billing_expr`).
 *
 * A plugin reports usage facts for each task — numbers such as seconds or images, and
 * enums such as resolution — declared in its usage schema and read with `u("field")`. The
 * price table has one row per combination of enum values and, per row, an optional fixed
 * price per task plus a price for each unit of every number field (per 1M for tokens).
 * Prices are USD. Anything the table cannot express is edited as text.
 */

export type PriceTableRow = {
  combination: Record<string, string>
  /** USD per task, on top of the usage prices. Empty means none. */
  constant: string
  /** Number field → USD per unit (per 1M tokens for token fields). */
  unitPrices: Record<string, string>
}

export type PriceTable = { rows: PriceTableRow[] }

/** Whether the plugin reports any number the table can price. */
export function canUsePriceTable(schema: BillingUsageSchema): boolean {
  return getTaskNumberFields(schema).length > 0
}

/** A table nobody has filled in: every unit price empty, so saving is refused until set. */
export function blankPriceTable(schema: BillingUsageSchema): PriceTable {
  const fields = getTaskNumberFields(schema).map(([field]) => field)
  return {
    rows: getTaskEnumCombinations(schema).map((combination) => ({
      combination,
      constant: '',
      unitPrices: Object.fromEntries(fields.map((field) => [field, ''])),
    })),
  }
}

/** The table view of an expression, or null when the expression is not of that shape. */
export function readPriceTable(expression: string, schema: BillingUsageSchema): PriceTable | null {
  if (!canUsePriceTable(schema)) return null
  if (expression.trim() === '') return blankPriceTable(schema)
  const matrix = tryParseTaskMatrixConfig(expression, schema)
  if (matrix === null) return null
  return {
    rows: matrix.rows.map((row) => ({
      combination: row.combination,
      constant: row.constant === 0 ? '' : String(row.constant),
      unitPrices: Object.fromEntries(Object.entries(row.unitPrices).map(([field, price]) => [field, String(price)])),
    })),
  }
}

/** `row:field` for a unit price, `row:constant` for the per-task price. */
export type PriceTableIssue = string

/**
 * The expression for a table, or the cells that stop one being written. Every unit price
 * must be typed — free is written as 0 — and none may be negative or non-finite.
 */
export function writePriceTable(
  table: PriceTable,
  schema: BillingUsageSchema,
): { expression: string; issues: [] } | { expression?: undefined; issues: PriceTableIssue[] } {
  const issues: PriceTableIssue[] = []
  const read = (text: string, cell: string, required: boolean): number => {
    const trimmed = text.trim()
    if (trimmed === '') {
      if (required) issues.push(cell)
      return 0
    }
    const value = Number(trimmed)
    if (!Number.isFinite(value) || value < 0) issues.push(cell)
    return value
  }
  const rows = table.rows.map((row, index) => ({
    combination: row.combination,
    constant: read(row.constant, `${index}:constant`, false),
    unitPrices: Object.fromEntries(
      Object.entries(row.unitPrices).map(([field, price]) => [field, read(price, `${index}:${field}`, true)]),
    ),
  }))
  if (issues.length > 0) return { issues }
  const expression = generateTaskExprFromConfig({ tiers: taskMatrixToTiers({ rows }, schema) }, schema)
  if (expression === '') return { issues: ['table'] }
  return { expression, issues: [] }
}

/**
 * Whether the model's own price can charge this plugin's tasks, as the server decides it:
 * an expression must read only the plugin's usage (and, for a plugin that also relays the
 * model, read some); a legacy price works for a relaying plugin only as a per-request price.
 * Undefined when the expression does not compile here; the server checks it on save.
 */
export function modelPriceChargesPlugin(
  variant: Pick<ModelPricingPluginVariant, 'relay' | 'usage_schema'>,
  draft: Pick<PricingDraft, 'mode' | 'expression'>,
): boolean | undefined {
  if (draft.mode !== 'expression') return !variant.relay || draft.mode === 'per-request'
  return taskExpressionCompatible(draft.expression, variant.usage_schema ?? {}, variant.relay)
}
