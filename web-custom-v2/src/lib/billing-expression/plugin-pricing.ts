/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { compileBillingExpression } from './parser'
import { BILLING_VARIABLES, visitExpression } from './types'
import type { BillingUsageSchema } from './usage-schema'

export function usesChatQuantities(variables: ReadonlySet<string>): boolean {
  return BILLING_VARIABLES.some((name) => variables.has(name))
}

/**
 * Whether a task plugin can charge with this expression, as
 * `billing_setting.TaskExprCompatible` / `TaskPriceExpr` decide on the server: no
 * per-call `fixed()`, no chat token quantities, every `u()` field in the plugin's usage
 * schema, and — for a plugin that also relays the model — at least one `u()`.
 * Undefined when the expression does not compile here; the server decides on save.
 */
export function taskExpressionCompatible(
  expression: string,
  schema: BillingUsageSchema,
  relaysModel = false
): boolean | undefined {
  if (!expression.trim()) return false
  const compiled = compileBillingExpression(expression)
  if (compiled.status !== 'ready') return undefined
  let compatible =
    !compiled.functions.has('fixed') &&
    !usesChatQuantities(compiled.variables) &&
    (!relaysModel || compiled.functions.has('u'))
  visitExpression(compiled.ast, (node) => {
    if (node.kind !== 'call' || node.name !== 'u') return
    const key = node.args[0]
    if (
      key?.kind === 'literal' &&
      typeof key.value === 'string' &&
      !Object.hasOwn(schema, key.value)
    ) {
      compatible = false
    }
  })
  return compatible
}
