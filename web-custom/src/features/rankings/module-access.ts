import type { ServerStatus } from '@/lib/api/status'

/**
 * Whether the public rankings surface is reachable, and by whom.
 *
 * `GET /api/rankings` sits behind `middleware.HeaderNavModuleAuth("rankings")`, which reads the
 * `HeaderNavModules` option and, per `middleware/header_nav.go`:
 *
 * - answers `403 {"success":false,"message":"rankings is disabled"}` when the module is off;
 * - runs `UserAuth()` (so anonymous visitors get 401) when `requireAuth` is on;
 * - runs `TryUserAuth()` — fully public — otherwise.
 *
 * `/api/status` republishes the raw option verbatim (`controller/misc.go`), and the seeded
 * instance really does answer `HeaderNavModules: ''`. An empty or unparseable value means
 * "enabled and public", exactly like the Go fallback; otherwise it is a JSON object whose
 * `rankings` entry is either a boolean-ish value or `{ enabled, requireAuth }`.
 *
 * Mirroring the server's own fallbacks keeps the page from requesting a leaderboard that can
 * only answer 403, and lets it explain the 401 it will get.
 *
 * NOTE FOR THE INTEGRATOR: `features/pricing/module-access.ts` is this same function with
 * `'pricing'` hardcoded. The two want to collapse into one `navModuleAccess(status, module)`
 * in `src/lib/`; the lane rules forbid this agent from creating it.
 */
export type RankingsModuleAccess = {
  enabled: boolean
  requireAuth: boolean
}

/** What `getHeaderNavAccess` falls back to when the option is unset or unparseable. */
export const DEFAULT_RANKINGS_ACCESS: RankingsModuleAccess = { enabled: true, requireAuth: false }

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

export function rankingsModuleAccess(status: ServerStatus | undefined): RankingsModuleAccess {
  if (status === undefined) return DEFAULT_RANKINGS_ACCESS

  const modules = readModuleRecord(status.HeaderNavModules)
  if (modules === undefined || !Object.hasOwn(modules, 'rankings')) return DEFAULT_RANKINGS_ACCESS

  const entry = modules.rankings
  if (typeof entry === 'object' && entry !== null) {
    const record = entry as Record<string, unknown>
    return {
      enabled: readFlag(record.enabled, DEFAULT_RANKINGS_ACCESS.enabled),
      requireAuth: readFlag(record.requireAuth, DEFAULT_RANKINGS_ACCESS.requireAuth),
    }
  }

  // A bare boolean/number/string only toggles `enabled`; requireAuth keeps its default.
  return {
    enabled: readFlag(entry, DEFAULT_RANKINGS_ACCESS.enabled),
    requireAuth: DEFAULT_RANKINGS_ACCESS.requireAuth,
  }
}
