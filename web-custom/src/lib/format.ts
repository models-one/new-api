import { DEFAULT_QUOTA_PER_UNIT } from '@/lib/api/status'

/**
 * Quota is stored as an integer; dividing by quota_per_unit (from `/api/status`)
 * yields the currency amount. Every money value in the console goes through here.
 */
export function quotaToCurrency(quota: number, quotaPerUnit = DEFAULT_QUOTA_PER_UNIT): number {
  if (!Number.isFinite(quota)) return 0
  const divisor = quotaPerUnit > 0 ? quotaPerUnit : DEFAULT_QUOTA_PER_UNIT
  return quota / divisor
}

export function formatCurrency(amount: number, options: { symbol?: string; digits?: number } = {}): string {
  const { symbol = '$', digits = 2 } = options
  const safe = Number.isFinite(amount) ? amount : 0
  return `${safe < 0 ? '-' : ''}${symbol}${Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

export function formatQuota(quota: number, quotaPerUnit?: number, digits = 2): string {
  return formatCurrency(quotaToCurrency(quota, quotaPerUnit), { digits })
}

/** Splits a formatted amount so a page can render the cents smaller than the dollars. */
export function splitCurrency(amount: number, symbol = '$'): { whole: string; fraction: string } {
  const [whole = '0', fraction = '00'] = formatCurrency(amount, { symbol }).split('.')
  return { whole, fraction: `.${fraction}` }
}

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${(value / 1_000).toFixed(0)}K`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(Math.round(value))
}

export function formatNumber(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '0'
}

export function formatTokens(tokens: number): string {
  return formatCompactNumber(tokens)
}

/** Latency arrives in milliseconds from the log `use_time` field (seconds) or a raw ms value. */
export function formatLatencyMs(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '—'
  if (milliseconds >= 1000) return `${(milliseconds / 1000).toFixed(2)}s`
  return `${Math.round(milliseconds)}ms`
}

export function formatPercent(value: number, digits = 1): string {
  return Number.isFinite(value) ? `${value.toFixed(digits)}%` : '—'
}

/** Backend timestamps are unix SECONDS everywhere in this API. */
export function fromUnixSeconds(seconds: number): Date {
  return new Date(seconds * 1000)
}

export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

export function formatDate(seconds: number, locale?: string): string {
  if (!seconds || seconds < 0) return '—'
  return fromUnixSeconds(seconds).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

export function formatDateTime(seconds: number, locale?: string): string {
  if (!seconds || seconds < 0) return '—'
  return fromUnixSeconds(seconds).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function formatTime(seconds: number, locale?: string): string {
  if (!seconds || seconds < 0) return '—'
  return fromUnixSeconds(seconds).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
