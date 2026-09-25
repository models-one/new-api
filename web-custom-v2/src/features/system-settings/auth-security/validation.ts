/**
 * Client-side validators for the settings whose values the server stores WITHOUT checking.
 *
 * Verified live on the dev server, and this is the whole reason the file exists:
 *
 *   PUT /api/option/  {"key":"fetch_setting.allowed_ports","value":"nope"}
 *   → {"success":true}
 *
 * `model.validateOptionValue` only guards `tool_price_setting.prices`; every other dotted
 * key is written verbatim. The value then reaches `config.updateConfigFromMap`, whose
 * slice branch is
 *
 *   case reflect.Slice, reflect.Struct:
 *       if err := json.Unmarshal([]byte(strValue), field.Addr().Interface()); err != nil {
 *           continue        // <- silently keeps the previous value
 *       }
 *
 * so a malformed blob is persisted to the DB, echoed back by `GET /api/option/`, and NEVER
 * applied to the running config. The console shows one thing and the gateway enforces
 * another, with no error anywhere. `LoadFromDB` takes the same path on restart.
 *
 * A concrete instance of that bug in the legacy console: it writes `allowed_ports` as a
 * JSON array of NUMBERS (`[80,443]`), but `FetchSetting.AllowedPorts` is `[]string`, so
 * the unmarshal fails and the port list is quietly ignored. Verified live — the write is
 * accepted and reads back as `[80,443]`. Everything here serialises STRING arrays.
 *
 * Every function returns `undefined` when the value is fine and a message key otherwise;
 * the section turns the key into a translated sentence. Returning keys rather than text
 * keeps these pure and testable without an i18n instance.
 */

export type ValidationCode =
  | 'invalid-json'
  | 'not-an-object'
  | 'bad-limit-shape'
  | 'negative-total'
  | 'success-below-one'
  | 'limit-too-large'
  | 'bad-port'
  | 'bad-port-range'
  | 'bad-cidr'
  | 'bad-domain'

/** `math.MaxInt32`, the ceiling `setting.CheckModelRequestRateLimitGroup` enforces. */
export const MAX_RATE_LIMIT = 2147483647

/**
 * Mirrors `setting.CheckModelRequestRateLimitGroup`: a JSON object of
 * `group -> [totalCount, successCount]`, `totalCount >= 0`, `successCount >= 1`, both
 * within int32. The server DOES validate this one and refuses with its own sentence —
 * this runs first so the operator sees the problem before the round trip.
 */
export function validateRateLimitGroups(raw: string): ValidationCode | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return 'invalid-json'
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 'not-an-object'

  for (const value of Object.values(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value) || value.length !== 2) return 'bad-limit-shape'
    const [total, success] = value
    if (typeof total !== 'number' || typeof success !== 'number') return 'bad-limit-shape'
    if (!Number.isInteger(total) || !Number.isInteger(success)) return 'bad-limit-shape'
    if (total < 0) return 'negative-total'
    if (success < 1) return 'success-below-one'
    if (total > MAX_RATE_LIMIT || success > MAX_RATE_LIMIT) return 'limit-too-large'
  }

  return undefined
}

/**
 * Mirrors `common.parsePortRanges`: entries are either `"443"` or `"8000-9000"`, every
 * port within 1–65535, and a range's start may not exceed its end. An empty list is legal
 * and means "no port restriction" (`isAllowedPort` returns true when the list is empty).
 */
export function validatePortEntries(entries: readonly string[]): ValidationCode | undefined {
  for (const entry of entries) {
    const trimmed = entry.trim()
    if (trimmed === '') continue

    if (trimmed.includes('-')) {
      const parts = trimmed.split('-')
      if (parts.length !== 2) return 'bad-port-range'
      const start = Number(parts[0].trim())
      const end = Number(parts[1].trim())
      if (!Number.isInteger(start) || !Number.isInteger(end)) return 'bad-port-range'
      if (start < 1 || start > 65535 || end < 1 || end > 65535) return 'bad-port-range'
      if (start > end) return 'bad-port-range'
      continue
    }

    const port = Number(trimmed)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 'bad-port'
  }

  return undefined
}

/**
 * `fetch_setting.ip_list` entries are matched with `net.ParseCIDR` / `net.ParseIP`
 * (`common.isIPListed`), so a bare address and a CIDR block are both legal. This checks
 * the shape well enough to catch a typo without re-implementing an IP parser: an IPv4
 * dotted quad or anything containing a colon (IPv6), with an optional `/prefix`.
 */
export function validateIpEntries(entries: readonly string[]): ValidationCode | undefined {
  for (const entry of entries) {
    const trimmed = entry.trim()
    if (trimmed === '') continue

    const [address, prefix, ...rest] = trimmed.split('/')
    if (rest.length > 0) return 'bad-cidr'

    const isIpv6 = address.includes(':')
    if (!isIpv6) {
      const octets = address.split('.')
      if (octets.length !== 4) return 'bad-cidr'
      for (const octet of octets) {
        if (!/^\d{1,3}$/.test(octet)) return 'bad-cidr'
        if (Number(octet) > 255) return 'bad-cidr'
      }
    } else if (!/^[0-9a-fA-F:.]+$/.test(address)) {
      return 'bad-cidr'
    }

    if (prefix !== undefined) {
      if (!/^\d{1,3}$/.test(prefix)) return 'bad-cidr'
      const bits = Number(prefix)
      if (bits > (isIpv6 ? 128 : 32)) return 'bad-cidr'
    }
  }

  return undefined
}

/**
 * `fetch_setting.domain_list` entries are compared case-insensitively, with `*.example.com`
 * meaning "that domain and anything under it" (`common.isDomainListed`). A scheme, a path
 * or a port is never stripped by the backend, so an entry that carries one can never match
 * and is rejected here.
 */
export function validateDomainEntries(entries: readonly string[]): ValidationCode | undefined {
  for (const entry of entries) {
    const trimmed = entry.trim()
    if (trimmed === '') continue
    if (!/^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(trimmed)) {
      return 'bad-domain'
    }
  }

  return undefined
}

/** Splits a textarea into trimmed, non-empty entries. */
export function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/** Splits a comma-separated field into trimmed, non-empty entries. */
export function splitCommas(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/**
 * The way every list in this feature reaches the server: a JSON array of STRINGS, which is
 * what `[]string` fields unmarshal into. See the file header for why the number form the
 * legacy console sends is silently dropped.
 */
export function serializeStringList(value: string, separator: 'line' | 'comma' = 'line'): string {
  const entries = separator === 'line' ? splitLines(value) : splitCommas(value)
  return JSON.stringify(entries)
}
