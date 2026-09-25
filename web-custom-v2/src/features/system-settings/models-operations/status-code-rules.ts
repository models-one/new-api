/**
 * HTTP status-code rule parsing, ported from the legacy console's
 * `web/src/lib/http-status-code-rules.ts` and kept in step with the SERVER's own
 * `setting/operation_setting/status_code_ranges.go`, which is the authority.
 *
 * `AutomaticDisableStatusCodes` and `AutomaticRetryStatusCodes` are validated server-side
 * — `controller.UpdateOption` runs `ParseHTTPStatusCodeRanges` on both and answers
 * HTTP 200 `{success:false, message:"invalid http status code rules: 999-abc"}` for a bad
 * value (verified live). This parser exists so the operator sees the problem before the
 * round trip, and so the section can show the normalised form it is about to write.
 */

export type StatusCodeRange = {
  start: number
  end: number
}

export type ParsedStatusCodeRules = {
  ok: boolean
  ranges: StatusCodeRange[]
  /** Merged, sorted and re-joined: `401,403,500-599`. Empty for an empty input. */
  normalized: string
  /** The segments that could not be read, for naming them in the error. */
  invalidTokens: string[]
}

const STATUS_CODE_MIN = 100
const STATUS_CODE_MAX = 599

function isDigits(value: string): boolean {
  return /^\d+$/.test(value)
}

function isStatusCode(code: number): boolean {
  return Number.isFinite(code) && code >= STATUS_CODE_MIN && code <= STATUS_CODE_MAX
}

function parseToken(token: string): StatusCodeRange | null {
  const cleaned = token.replace(/\s/g, '')
  if (cleaned === '') return null

  if (cleaned.includes('-')) {
    const parts = cleaned.split('-')
    if (parts.length !== 2) return null
    const [rawStart, rawEnd] = parts
    if (!isDigits(rawStart) || !isDigits(rawEnd)) return null

    const start = Number.parseInt(rawStart, 10)
    const end = Number.parseInt(rawEnd, 10)
    if (!isStatusCode(start) || !isStatusCode(end) || start > end) return null
    return { end, start }
  }

  if (!isDigits(cleaned)) return null
  const code = Number.parseInt(cleaned, 10)
  if (!isStatusCode(code)) return null
  return { end: code, start: code }
}

function mergeRanges(ranges: readonly StatusCodeRange[]): StatusCodeRange[] {
  const sorted = [...ranges].sort((left, right) =>
    left.start !== right.start ? left.start - right.start : left.end - right.end,
  )

  const merged: StatusCodeRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    // `+ 1` so `401,402` collapses to `401-402` the way the server's own merge does.
    if (last === undefined || range.start > last.end + 1) {
      merged.push({ ...range })
      continue
    }
    last.end = Math.max(last.end, range.end)
  }
  return merged
}

/** Total: never throws. An empty input is valid and normalises to an empty string. */
export function parseStatusCodeRules(input: string): ParsedStatusCodeRules {
  const raw = input.trim()
  if (raw === '') return { invalidTokens: [], normalized: '', ok: true, ranges: [] }

  // The backend accepts the full-width comma an operator pastes from a Chinese doc.
  const segments = raw
    .replace(/，/g, ',')
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '')

  const ranges: StatusCodeRange[] = []
  const invalidTokens: string[] = []

  for (const segment of segments) {
    const parsed = parseToken(segment)
    if (parsed === null) invalidTokens.push(segment)
    else ranges.push(parsed)
  }

  if (invalidTokens.length > 0) {
    return { invalidTokens, normalized: raw, ok: false, ranges: [] }
  }

  const merged = mergeRanges(ranges)
  const normalized = merged
    .map((range) => (range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`))
    .join(',')

  return { invalidTokens: [], normalized, ok: true, ranges: merged }
}

/** How many distinct status codes a rule string covers — the blast radius, in one number. */
export function countStatusCodes(ranges: readonly StatusCodeRange[]): number {
  return ranges.reduce((total, range) => total + (range.end - range.start + 1), 0)
}
