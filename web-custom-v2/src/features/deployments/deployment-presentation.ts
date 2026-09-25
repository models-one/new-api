import type { Tone } from '@/components/ui'
import { formatCurrency, formatNumber } from '@/lib/format'

/**
 * The six statuses `controller.computeStatusCounts` seeds its map with, in the order it
 * lists them. They are the only values the facet can offer without guessing; any other
 * string io.net returns still renders, it just has no pre-seeded count.
 */
export const DEPLOYMENT_STATUSES = [
  'running',
  'completed',
  'failed',
  'deployment requested',
  'termination requested',
  'destroyed',
] as const

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number]

/** `mapIoNetDeployment` lowercases every status before it leaves the server. */
export function normalizeDeploymentStatus(status: string): string {
  return status.trim().toLowerCase()
}

/**
 * English source strings for `t()`. The raw enum is an upstream identifier, not UI copy;
 * an unknown status is echoed verbatim rather than relabelled, because inventing a
 * friendly name for a value this console has never seen would misreport it.
 */
export function deploymentStatusLabel(status: string): string {
  switch (normalizeDeploymentStatus(status)) {
    case 'running':
      return 'Running'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'error':
      return 'Failed'
    case 'deployment requested':
      return 'Deployment requested'
    case 'termination requested':
      return 'Termination requested'
    case 'destroyed':
      return 'Destroyed'
    default:
      return ''
  }
}

/**
 * The translated label, falling back to io.net's own word when this console has no copy
 * for it. An unrecognised status is shown verbatim rather than flattened to "Unknown",
 * which would hide a real upstream state.
 */
export function deploymentStatusText(status: string, t: (key: string) => string): string {
  const label = deploymentStatusLabel(status)
  if (label !== '') return t(label)
  return status.trim() === '' ? t('Unknown') : status.trim()
}

export function deploymentStatusTone(status: string): Tone {
  switch (normalizeDeploymentStatus(status)) {
    case 'running':
      return 'success'
    case 'completed':
      return 'info'
    case 'failed':
    case 'error':
    case 'destroyed':
      return 'destructive'
    case 'deployment requested':
    case 'termination requested':
      return 'warning'
    default:
      return 'muted'
  }
}

/** Minutes in an hour. Named so the conversions below can cite it. */
export const MINUTES_PER_HOUR = 60
/** Minutes in a day: MINUTES_PER_HOUR × 24. */
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * 24
/** A completed_percent of 100 means the paid compute window is fully consumed. */
export const COMPLETED_PERCENT_MAX = 100

/**
 * `compute_minutes_remaining` is a whole number of minutes. This is a pure unit
 * conversion — days = ⌊m / MINUTES_PER_DAY⌋, hours = ⌊(m mod MINUTES_PER_DAY) /
 * MINUTES_PER_HOUR⌋, minutes = m mod MINUTES_PER_HOUR — and returns null when the value
 * is not a finite number, so the caller can fall back to the server's own phrasing.
 */
export function formatRemainingMinutes(minutes: number): string | null {
  if (!Number.isFinite(minutes)) return null
  const total = Math.max(0, Math.round(minutes))
  const days = Math.floor(total / MINUTES_PER_DAY)
  const hours = Math.floor((total % MINUTES_PER_DAY) / MINUTES_PER_HOUR)
  const mins = total % MINUTES_PER_HOUR

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (parts.length === 0 || mins > 0) parts.push(`${mins}m`)
  return parts.join(' ')
}

/**
 * Share of the paid window still unspent, derived in the browser as
 * COMPLETED_PERCENT_MAX − completed_percent and clamped into [0, 100]. The server sends
 * only the consumed side; every caller labels this as a derived value.
 */
export function remainingPercent(completedPercent: number): number | null {
  if (!Number.isFinite(completedPercent)) return null
  const consumed = Math.min(COMPLETED_PERCENT_MAX, Math.max(0, completedPercent))
  return COMPLETED_PERCENT_MAX - consumed
}

/**
 * io.net prices in its own settlement currency (`usdc` by default in
 * `Client.GetPriceEstimation`). This is NOT gateway quota, so it never goes through
 * `quotaToCurrency`; the code is printed beside the number instead of a `$`.
 */
export const IONET_PRICE_DIGITS = 4

export function formatIoNetAmount(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase()
  const value = formatCurrency(amount, { digits: IONET_PRICE_DIGITS, symbol: '' })
  return code === '' ? value : `${value} ${code}`
}

/** "NVIDIA A100 x8" — assembled by `mapIoNetDeployment`, echoed here when non-empty. */
export function hardwareSummary(brand: string, name: string, quantity: number): string {
  const parts = [brand.trim(), name.trim()].filter((part) => part !== '')
  const label = parts.join(' ')
  if (label === '') return ''
  return `${label} ×${formatNumber(quantity)}`
}

/**
 * Splits a whitespace-separated command line into argv, the same way the legacy drawer
 * did. There is no shell quoting here: io.net takes `entrypoint` and `args` as plain
 * string arrays and this console does not pretend to parse quotes.
 */
export function splitCommandTokens(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token !== '')
}

export type EnvParseResult =
  | { ok: true; value: Record<string, string> | undefined }
  | { ok: false; reason: 'invalid-json' | 'not-an-object' }

/**
 * `ContainerConfig.EnvVariables` is `map[string]string` in Go, so a JSON object whose
 * values are numbers or booleans is stringified rather than refused. Anything that is not
 * a JSON object (an array, a bare scalar) is rejected before the request is built.
 */
export function parseEnvObject(input: string): EnvParseResult {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: true, value: undefined }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'not-an-object' }
  }

  const entries = Object.entries(parsed as Record<string, unknown>).map(
    ([key, value]) =>
      [key, typeof value === 'string' ? value : (JSON.stringify(value) ?? '')] as const,
  )
  return { ok: true, value: Object.fromEntries(entries) }
}

/** io.net cluster names: what `CheckClusterNameAvailability` will not even be asked about. */
export function isBlankName(name: string): boolean {
  return name.trim() === ''
}
