import type { ServerStatus } from '@/lib/api/status'

/**
 * Whether the public pricing surface is reachable, and by whom.
 *
 * `GET /api/pricing` sits behind `middleware.HeaderNavModuleAuth("pricing")` and
 * `GET /api/perf-metrics*` behind `HeaderNavModulePublicOrUserAuth("pricing")`. Both read the
 * `HeaderNavModules` option, which `/api/status` republishes verbatim (it is `''` on the
 * seeded instance): an empty value means "enabled and public", otherwise it is a JSON object
 * whose `pricing` entry is either a boolean-ish value or `{ enabled, requireAuth }`. Mirroring
 * the server's own fallbacks from `middleware/header_nav.go` here keeps the page from
 * requesting a catalogue that can only answer 403, and lets it explain the 401 it will get.
 */
export type PricingModuleAccess = {
  enabled: boolean
  requireAuth: boolean
}

/** What `getHeaderNavAccess` falls back to when the option is unset or unparseable. */
export const DEFAULT_PRICING_ACCESS: PricingModuleAccess = { enabled: true, requireAuth: false }

/** The server accepts booleans, 0/1 numbers and "true"/"false"/"1"/"0" strings for these flags. */
function readFlag(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') {
    if (raw === 1) return true
    if (raw === 0) return false
    return fallback
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }
  return fallback
}

function readModuleRecord(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw === 'object' && raw !== null) return raw as Record<string, unknown>
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    return parsed as Record<string, unknown>
  } catch {
    // An unparseable option is exactly the case the server itself falls back on.
    return undefined
  }
}

export function pricingModuleAccess(status: ServerStatus | undefined): PricingModuleAccess {
  if (status === undefined) return DEFAULT_PRICING_ACCESS

  const modules = readModuleRecord(status.HeaderNavModules)
  if (modules === undefined || !Object.hasOwn(modules, 'pricing')) return DEFAULT_PRICING_ACCESS

  const entry = modules.pricing
  if (typeof entry === 'object' && entry !== null) {
    const record = entry as Record<string, unknown>
    return {
      enabled: readFlag(record.enabled, DEFAULT_PRICING_ACCESS.enabled),
      requireAuth: readFlag(record.requireAuth, DEFAULT_PRICING_ACCESS.requireAuth),
    }
  }

  // A bare boolean/number/string only toggles `enabled`; requireAuth keeps its default.
  return {
    enabled: readFlag(entry, DEFAULT_PRICING_ACCESS.enabled),
    requireAuth: DEFAULT_PRICING_ACCESS.requireAuth,
  }
}
