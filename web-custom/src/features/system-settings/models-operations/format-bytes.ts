/**
 * Byte formatting for the performance and log panels.
 *
 * `src/lib/format.ts` has no byte formatter and is off limits to this agent, so it lives
 * here. It is binary (1024) because every producer of these numbers is a Go
 * `os.FileInfo.Size()` or `runtime.MemStats` value that operators read against `du -h`.
 */
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes === 0) return '0 B'
  if (bytes < 0) return `-${formatBytes(-bytes, digits)}`

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const scaled = bytes / 1024 ** exponent
  // Whole bytes never get a decimal point; a "1.0 B" file size reads as a bug.
  const formatted = exponent === 0 ? String(Math.round(scaled)) : scaled.toFixed(digits)
  return `${formatted} ${UNITS[exponent]}`
}
