import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { getJson, putJson } from '@/lib/api/client'

/**
 * THE OPTION STORE
 * ================
 * One cached read of `GET /api/option/` for every settings section, plus the explicit
 * coercion the payload demands.
 *
 * Verified against the running dev server (root / role 100):
 *
 *   GET  /api/option/   → { success, message, data: [{ key, value }, …] }   230 pairs
 *   PUT  /api/option/   → { success, message }                              ONE key per call
 *
 * Three facts drive every decision in this file.
 *
 * 1. EVERY VALUE IS A STRING. `controller.GetOptions` runs `common.Interface2String`
 *    over the whole option map, so booleans arrive as `'true'` / `'false'`, numbers as
 *    `'401'`, and JSON blobs as serialised text. `'false'` is a truthy string — any code
 *    that branches on a raw value is wrong for every disabled setting on the deployment.
 *    Read through the coercion helpers below, never off the map directly.
 *
 * 2. KEYS CAN BE ABSENT. The map only holds what `model.InitOptionMap` seeded plus what
 *    has been written since. `HeaderNavModules` and `SidebarModulesAdmin`, for instance,
 *    are read by the backend (`middleware/header_nav.go`, `controller/misc.go`) but never
 *    seeded, so they are NOT among the 230 pairs on a fresh instance. Every reader here
 *    therefore takes an explicit fallback, and `hasOption` answers "was this ever set".
 *
 * 3. SECRETS ARE NOT IN THE PAYLOAD AT ALL. `controller.GetOptions` skips any key whose
 *    name ends in `Token`, `Secret`, `Key`, `secret` or `api_key` — they are not masked,
 *    they are absent. `GitHubClientSecret`, `TurnstileSiteKey`, `TurnstileSecretKey`,
 *    `SMTPToken`, `WorkerValidKey`, `StripeApiSecret`, `model_deployment.ionet.api_key`
 *    and friends can be WRITTEN through `PUT /api/option/` but can never be read back.
 *    A section offering one must present an empty write-only PasswordInput and say so —
 *    it must never claim the stored value is empty.
 */

/** One `{key, value}` pair exactly as `GET /api/option/` serialises it. */
export type SystemOption = {
  key: string
  value: string
}

/** The payload flattened for lookup. Values are still raw strings. */
export type SystemOptionMap = Readonly<Record<string, string>>

/**
 * The one cache key for the option payload. Every section reads through
 * `systemOptionsQuery()`; anything that writes invalidates this key.
 */
export const SYSTEM_OPTIONS_QUERY_KEY = ['system-settings', 'options'] as const

/** `GET /api/status`, whose payload is derived from these same options. */
const SERVER_STATUS_QUERY_KEY = ['server-status'] as const

/**
 * `data` is a Go slice that serialises to `null` when the option map is empty, so the
 * null case is real rather than defensive. It is the page's empty state.
 */
export function toSystemOptionMap(options: readonly SystemOption[] | null | undefined): SystemOptionMap {
  const map: Record<string, string> = {}
  if (!Array.isArray(options)) return map

  for (const option of options) {
    if (option === null || typeof option !== 'object') continue
    if (typeof option.key !== 'string' || option.key === '') continue
    map[option.key] = typeof option.value === 'string' ? option.value : String(option.value ?? '')
  }
  return map
}

/**
 * The single read. `skipBusinessError` / `skipErrorHandler` keep the global interceptor
 * quiet: this page renders its own error panel and must not also fire a toast.
 */
export function systemOptionsQuery() {
  return queryOptions({
    queryKey: SYSTEM_OPTIONS_QUERY_KEY,
    queryFn: async (): Promise<SystemOptionMap> => {
      const options = await getJson<SystemOption[] | null>('/api/option/', {
        skipBusinessError: true,
        skipErrorHandler: true,
      })
      return toSystemOptionMap(options)
    },
    // Settings change by deliberate admin action, never on their own. Long enough to
    // stop every section re-fetching, short enough that a second operator's write shows.
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ *
 * Coercion. Pure, total, and never throws.
 * ------------------------------------------------------------------ */

/** True when the server has this key at all — not "is it truthy". */
export function hasOption(options: SystemOptionMap | undefined, key: string): boolean {
  return options !== undefined && Object.hasOwn(options, key)
}

/** The raw string, or `fallback` when the key is absent. Trailing whitespace is kept. */
export function readOptionString(
  options: SystemOptionMap | undefined,
  key: string,
  fallback = '',
): string {
  const raw = options?.[key]
  return raw === undefined ? fallback : raw
}

/**
 * `'true'` / `'1'` → true, `'false'` / `'0'` / `''` → false, anything else → `fallback`.
 *
 * The server writes booleans with `strconv.FormatBool`, so `'true'` / `'false'` is what
 * actually arrives; `'1'` / `'0'` are accepted because a hand-edited row can hold them.
 * An unrecognised value falls back rather than silently reading as false — a malformed
 * row should not look like a deliberately disabled feature.
 */
export function readOptionBoolean(
  options: SystemOptionMap | undefined,
  key: string,
  fallback = false,
): boolean {
  const raw = options?.[key]
  if (raw === undefined) return fallback

  const normalized = raw.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0' || normalized === '') return false
  return fallback
}

/** A finite number, or `fallback` for an absent, empty, non-numeric or infinite value. */
export function readOptionNumber(
  options: SystemOptionMap | undefined,
  key: string,
  fallback = 0,
): number {
  const raw = options?.[key]
  if (raw === undefined) return fallback

  const trimmed = raw.trim()
  if (trimmed === '') return fallback

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Parses a serialised JSON blob. Malformed text, the wrong shape and an absent key all
 * return `fallback`; this never throws, because roughly forty of the 230 values are
 * operator-editable JSON and one bad blob must not blank the whole settings area.
 *
 * Pass `isValid` whenever the shape matters — without it the parsed value is returned
 * under the caller's type, which is a claim the payload has not earned.
 */
export function readOptionJson<T>(
  options: SystemOptionMap | undefined,
  key: string,
  fallback: T,
  isValid?: (value: unknown) => value is T,
): T {
  const raw = options?.[key]
  if (raw === undefined) return fallback

  const trimmed = raw.trim()
  if (trimmed === '') return fallback

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return fallback
  }

  if (isValid === undefined) return parsed as T
  return isValid(parsed) ? parsed : fallback
}

/**
 * The three list encodings the live payload actually uses. There is no sniffing here on
 * purpose — the caller knows which key it is reading:
 *   'json'    `fetch_setting.domain_list` → `[]`, `gemini.supported_imagine_models` → `["…"]`
 *   'comma'   `EmailDomainWhitelist` → `gmail.com,163.com,…`
 *   'newline' `AutomaticDisableKeywords` → one phrase per line
 */
export type StringListFormat = 'json' | 'comma' | 'newline'

/** Blank entries are dropped and every entry is trimmed. Never throws. */
export function readOptionStringList(
  options: SystemOptionMap | undefined,
  key: string,
  format: StringListFormat,
  fallback: readonly string[] = [],
): string[] {
  const raw = options?.[key]
  if (raw === undefined) return [...fallback]

  const trimmed = raw.trim()
  if (trimmed === '') return []

  if (format === 'json') {
    const parsed = readOptionJson<unknown>(options, key, undefined)
    if (!Array.isArray(parsed)) return [...fallback]
    return parsed
      .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry ?? '').trim()))
      .filter((entry) => entry !== '')
  }

  return trimmed
    .split(format === 'comma' ? ',' : '\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/* ------------------------------------------------------------------ *
 * Writing. One key per request.
 * ------------------------------------------------------------------ */

export type SystemOptionWrite = {
  key: string
  /**
   * `controller.UpdateOption` stringifies bool / float64 / int server-side, so a real
   * boolean or number is accepted — but what comes back on the next read is still a
   * string. Sending the string form keeps the round trip obvious.
   */
  value: string | number | boolean
}

/** Booleans → `'true'` / `'false'`, numbers → decimal, strings unchanged. */
export function serializeOptionValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return value
}

/**
 * The single write.
 *
 * `PUT /api/option/` answers HTTP 200 with `{success:false, message}` for a REFUSAL, not
 * a 4xx, so the failure arrives through `putJson`'s envelope check as an `ApiError`
 * carrying the server's own sentence. Refusals verified on the dev server:
 *
 *   payment_setting.compliance_*  always refused through this endpoint
 *   QuotaForInviter / QuotaForInvitee  refused for a positive value until payment
 *                                      compliance has been confirmed
 *   GitHubOAuthEnabled / discord.enabled / oidc.enabled / LinuxDOOAuthEnabled /
 *   WeChatAuthEnabled / TelegramOAuthEnabled / TurnstileCheckEnabled
 *                                 refused for `'true'` while the matching credential is
 *                                 still empty
 *   EmailDomainRestrictionEnabled refused for `'true'` with an empty whitelist
 *   GroupRatio / gemini.safety_settings / claude.default_max_tokens /
 *   tool_price_setting.prices / ImageRatio / AudioRatio / AudioCompletionRatio /
 *   CreateCacheRatio              refused when the JSON fails the server's validator
 *
 * A caller must therefore treat a rejected promise as normal traffic and show the
 * message, and must re-read the store rather than keeping an optimistic value.
 * Unknown keys are ACCEPTED and stored, so a typo silently creates a dead row.
 */
export async function writeSystemOption(write: SystemOptionWrite): Promise<void> {
  await putJson<unknown>(
    '/api/option/',
    { key: write.key, value: serializeOptionValue(write.value) },
    { skipBusinessError: true, skipErrorHandler: true },
  )
}

/**
 * Re-reads the option payload, and `/api/status` with it.
 *
 * `/api/status` is derived from this same option map (`controller.GetStatus`), and there
 * is no cheap way to know which of the 230 keys feed it — `system_name`, `logo`,
 * `footer_html`, `quota_per_unit`, every OAuth toggle and more do. Rather than keep a
 * hand-maintained key list that drifts, both are invalidated after any write. Settings
 * writes are rare, deliberate admin actions; two small refetches are the right price for
 * never showing a header, currency divisor or feature flag that no longer matches.
 */
export function useInvalidateSystemOptions(): () => Promise<void> {
  const queryClient = useQueryClient()

  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: SYSTEM_OPTIONS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: SERVER_STATUS_QUERY_KEY }),
    ])
  }, [queryClient])
}

/**
 * A single-key mutation that re-reads on success, for one-off controls that are not part
 * of a section form (a lone toggle, a reset button). A section form should use
 * `useOptionSectionForm` instead: it writes its dirty keys in sequence and invalidates
 * ONCE at the end rather than after each key.
 */
export function useSystemOptionMutation() {
  const invalidate = useInvalidateSystemOptions()

  return useMutation({
    mutationFn: (write: SystemOptionWrite) => writeSystemOption(write),
    onSuccess: () => invalidate(),
  })
}
