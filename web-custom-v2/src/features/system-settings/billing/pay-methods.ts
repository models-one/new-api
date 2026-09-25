import { parseJson } from '@/features/system-settings/billing/option-json'

/**
 * THE PAY-METHOD CONTRACT
 * =======================
 * `PayMethods` is the list of tiles a user sees on the top-up page. Its Go type is
 * `[]map[string]string` (`setting/operation_setting/payment_setting_old.go`), so EVERY
 * value in every entry must be a JSON string — including `min_topup`.
 *
 * Verified live:
 *   PUT PayMethods = [{"name":"probe","type":"alipay","min_topup":50}]
 *   → {"success":false,"message":"json: cannot unmarshal number into Go value of type string"}
 *
 * And `PayMethods` is one of the keys whose refusal arrives only AFTER the raw text has
 * replaced the stored value, so that rejected write also destroyed the previous method
 * list. A numeric `min_topup` is therefore not a warning here; it blocks the save.
 *
 * WHAT THE WALLET DOES WITH IT. `src/features/wallet/pay-methods.ts` routes each entry by
 * its `type`: `stripe`, `nowpayments`, `waffo` and `waffo_pancake` are provider tiles and
 * are hidden unless that provider's own `enable_*_topup` flag is true; every other type is
 * sent to Epay as its `type` parameter and needs Epay configured. `min_topup` is parsed
 * with `Number(...)` and ignored unless it is finite and positive. An entry this editor
 * produces that the wallet cannot render is a bug in this editor.
 */

export type PayMethodEntry = {
  type: string
  name: string
  icon?: string
  color?: string
  /** A STRING on the wire. Never a number — the Go map is map[string]string. */
  min_topup?: string
}

/** `type` values the wallet routes to a dedicated provider rather than to Epay. */
export const PROVIDER_PAY_METHOD_TYPES = ['stripe', 'nowpayments', 'waffo', 'waffo_pancake'] as const

export type PayMethodProblem =
  | 'syntax'
  | 'not-array'
  | 'not-object'
  | 'missing-type'
  | 'missing-name'
  | 'non-string-value'
  | 'duplicate-type'

/** Best-effort read for display. Entries that are not objects are skipped. */
export function parsePayMethods(raw: string): PayMethodEntry[] {
  const parsed = parseJson(raw)
  if (!Array.isArray(parsed)) return []

  const entries: PayMethodEntry[] = []
  for (const candidate of parsed) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) continue
    const record = candidate as Record<string, unknown>
    if (typeof record.type !== 'string' || typeof record.name !== 'string') continue

    const entry: PayMethodEntry = { name: record.name, type: record.type }
    if (typeof record.icon === 'string') entry.icon = record.icon
    if (typeof record.color === 'string') entry.color = record.color
    if (typeof record.min_topup === 'string') entry.min_topup = record.min_topup
    entries.push(entry)
  }
  return entries
}

/** The check that must pass before `PayMethods` is allowed anywhere near the server. */
export function checkPayMethods(raw: string): PayMethodProblem | undefined {
  const parsed = parseJson(raw)
  if (parsed === undefined) return 'syntax'
  if (!Array.isArray(parsed)) return 'not-array'

  const seen = new Set<string>()

  for (const candidate of parsed) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      return 'not-object'
    }
    const record = candidate as Record<string, unknown>

    for (const value of Object.values(record)) {
      if (typeof value !== 'string') return 'non-string-value'
    }

    if (typeof record.type !== 'string' || record.type.trim() === '') return 'missing-type'
    if (typeof record.name !== 'string' || record.name.trim() === '') return 'missing-name'

    if (seen.has(record.type)) return 'duplicate-type'
    seen.add(record.type)
  }

  return undefined
}

/**
 * `payment_setting.amount_options` is `[]int` in Go, so a fractional amount is refused.
 * The key itself is stored without validation — verified live, the literal text "garbage"
 * was accepted — which means nothing but this check stands between a typo and a top-up
 * page with no amounts on it.
 */
export function checkAmountOptions(raw: string): 'syntax' | 'not-array' | 'not-integer' | undefined {
  const parsed = parseJson(raw)
  if (parsed === undefined) return 'syntax'
  if (!Array.isArray(parsed)) return 'not-array'

  for (const value of parsed) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return 'not-integer'
  }
  return undefined
}

/** `payment_setting.amount_discount` is `map[int]float64`: integer keys, numeric values. */
export function checkAmountDiscount(
  raw: string,
): 'syntax' | 'not-object' | 'bad-key' | 'bad-value' | undefined {
  const parsed = parseJson(raw)
  if (parsed === undefined) return 'syntax'
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 'not-object'

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^-?\d+$/.test(key)) return 'bad-key'
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 'bad-value'
  }
  return undefined
}
