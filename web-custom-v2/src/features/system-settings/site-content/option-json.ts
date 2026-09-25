/**
 * THE RULES THE SERVER ACTUALLY APPLIES TO THESE BLOBS
 * ====================================================
 * Seven of the eleven sections in the Site and Content groups store their whole
 * configuration in a SINGLE option value that happens to hold serialised JSON. Five are
 * arrays edited as lists; two are objects that decide what appears in the navigation.
 *
 * Half of them are validated server-side and half are not, and the difference matters:
 *
 *   VALIDATED  `console_setting.api_info`, `console_setting.announcements`,
 *              `console_setting.faq`, `console_setting.uptime_kuma_groups` all run
 *              through `console_setting.ValidateConsoleSettings` in `controller.UpdateOption`
 *              before they are stored. A bad blob comes back as HTTP 200 with
 *              `{success:false, message:"第1个API信息的颜色值不合法"}` — verified live.
 *   VALIDATED  `Chats` is unmarshalled into Go's `[]map[string]string`, so a non-string
 *              value or malformed text is refused with the raw Go error
 *              ("json: cannot unmarshal number into Go value of type string"), and the
 *              EMPTY STRING is refused too ("unexpected end of JSON input") — the empty
 *              list must be written as `[]`. All verified live.
 *              BUT ITS REFUSAL COMES TOO LATE TO UNDO ANYTHING. `model.UpdateOption`
 *              saves the row to the database and only THEN calls `updateOptionMap`,
 *              whose error is what the client is handed — so a refused `Chats` write has
 *              already replaced the stored list. Verified live: writing `[{"a":1}]`
 *              answered `{success:false}` and `GET /api/option/` then returned
 *              `[{"a":1}]`. The four `console_setting.*` keys are the opposite case,
 *              validated in `controller.UpdateOption` BEFORE the write, so their
 *              refusals really do leave the stored value untouched.
 *   NOT        `HeaderNavModules` and `SidebarModulesAdmin` have no validation whatsoever.
 *              The literal text `garbage{` was accepted and stored on the dev server.
 *              `middleware/header_nav.go` then fails to parse it and silently falls back
 *              to "everything enabled", and the console reads the same broken value off
 *              `/api/status`. Nothing warns anyone. That is why the two navigation
 *              editors in this directory validate before every write.
 *
 * The helpers below reproduce the server's checks EXACTLY, so the form can refuse a value
 * with the same reasoning the server would rather than sending a write that bounces.
 * Where the server has no check, they are the only check there is.
 */

/**
 * Go's `len(string)` counts BYTES, and every length limit in
 * `setting/console_setting/validation.go` is written against it. A 200-character limit is
 * a 200-BYTE limit, which is about 66 Chinese characters. Counting UTF-16 code units here
 * would let the form accept values the server then rejects.
 */
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/**
 * `dangerousChars` from `setting/console_setting/validation.go`, matched
 * case-insensitively against the whole field exactly as `checkDangerousContent` does.
 * Applied by the server to the API-address route and description, and to the Uptime Kuma
 * category name and description.
 */
const DANGEROUS_FRAGMENTS = [
  '<script',
  '<iframe',
  'javascript:',
  'onload=',
  'onerror=',
  'onclick=',
] as const

export function hasDangerousContent(value: string): boolean {
  const lowered = value.toLowerCase()
  return DANGEROUS_FRAGMENTS.some((fragment) => lowered.includes(fragment))
}

/**
 * `urlRegex` from the same file, ported character for character. It is stricter than
 * `new URL()`: no credentials, no unicode host, http(s) only, and the host must be a
 * dotted label sequence or a dotted-quad IPv4 address. A URL this rejects is a URL the
 * server rejects.
 */
const CONSOLE_URL = /^https?:\/\/(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?|(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))(?::[0-9]{1,5})?(?:\/.*)?$/

export function isConsoleUrl(value: string): boolean {
  return CONSOLE_URL.test(value)
}

/** `slugRegex`: the Uptime Kuma status-page slug. */
const SLUG = /^[a-zA-Z0-9_-]+$/

export function isUptimeSlug(value: string): boolean {
  return SLUG.test(value)
}

/**
 * The announcement publish date is parsed with Go's `time.Parse(time.RFC3339, …)`, which
 * wants `2026-01-02T03:04:05Z` or the same with a numeric offset. `Date.toISOString()`
 * produces exactly that shape; a bare `2026-01-02` is refused, verified live.
 */
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export function isRfc3339(value: string): boolean {
  if (!RFC3339.test(value)) return false
  return !Number.isNaN(Date.parse(value))
}

/** Only `{}`-shaped values; arrays and `null` are objects to `typeof` and are not wanted. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/* ------------------------------------------------------------------ *
 * The stored string ⇄ editor text conversions.
 * ------------------------------------------------------------------ */

/**
 * What the server holds is a compact JSON string, so that is what gets written back: a
 * blob that only differs from the stored one by whitespace is not a change worth making.
 * Text that does not parse is passed through untouched — the form's validator refuses it
 * before it can reach the server, and mangling it would lose the operator's work.
 */
export function compactJson(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  try {
    return JSON.stringify(JSON.parse(trimmed))
  } catch {
    return trimmed
  }
}

/** Two-space indentation for the raw-JSON escape hatch. Unparseable text is left alone. */
export function formatJson(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return fallback
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return value
  }
}
