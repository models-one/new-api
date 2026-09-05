import type { Tone } from '@/components/ui'
import { LOG_TYPE, parseLogOther, type UserLog } from '@/lib/api/logs'

/**
 * Presentation helpers for `/api/log/self` and its admin twin `/api/log/`.
 *
 * Everything here maps a field the backend actually returns. Nothing is derived
 * beyond unit conversion, and no value is synthesised when the backend is silent.
 */

/**
 * `common.RoleAdminUser` in common/constants.go — the floor `middleware.AdminAuth()`
 * enforces on `GET /api/log/` and `GET /api/log/stat`. Root is 100, but 10 is the
 * gate these two routes actually check.
 */
export const ADMIN_ROLE = 10

/**
 * English source strings (which double as the i18n keys) for the log types the
 * backend writes. `model/log.go` also defines type 6 (refund); it is deliberately
 * absent from the shared `LOG_TYPE` map, so a refund row falls through to the
 * generic "Type {{type}}" label instead of being mislabelled.
 */
export const LOG_TYPE_LABEL_KEYS: Readonly<Partial<Record<number, string>>> = {
  [LOG_TYPE.topup]: 'Top up',
  [LOG_TYPE.consume]: 'Usage',
  [LOG_TYPE.manage]: 'Management',
  [LOG_TYPE.system]: 'System',
  [LOG_TYPE.error]: 'Error',
  [LOG_TYPE.login]: 'Sign-in',
}

const LOG_TYPE_TONES: Readonly<Partial<Record<number, Tone>>> = {
  [LOG_TYPE.topup]: 'success',
  [LOG_TYPE.consume]: 'primary',
  [LOG_TYPE.manage]: 'info',
  [LOG_TYPE.system]: 'muted',
  [LOG_TYPE.error]: 'destructive',
  [LOG_TYPE.login]: 'muted',
}

export function logTypeTone(type: number): Tone {
  return LOG_TYPE_TONES[type] ?? 'muted'
}

/** The selector order; `LOG_TYPE.all` is the unfiltered sentinel the API treats as "any". */
export const LOG_TYPE_FILTER_VALUES: readonly number[] = [
  LOG_TYPE.consume,
  LOG_TYPE.error,
  LOG_TYPE.topup,
  LOG_TYPE.manage,
  LOG_TYPE.system,
  LOG_TYPE.login,
]

/**
 * `Log.UseTime` is `now.Unix() - start.Unix()` — a count of WHOLE SECONDS, never
 * milliseconds. Anything under a second is stored as 0, so sub-second precision
 * does not exist and must not be fabricated.
 */
const SUB_SECOND_USE_TIME = 0

export function useTimeIsSubSecond(useTime: number): boolean {
  return !Number.isFinite(useTime) || useTime <= SUB_SECOND_USE_TIME
}

/**
 * `other.frt` is `FirstResponseTime - StartTime` in milliseconds. When the upstream
 * never produced a first response the backend leaves `FirstResponseTime` at Go's zero
 * time, which stores a nonsense epoch-scale negative number; one relay path even seeds
 * it to `start - 1s`. Only a strictly positive value is a real measurement.
 */
const MIN_VALID_FIRST_RESPONSE_MS = 1

/**
 * Keys inside the `other` blob that get a human label. The English string doubles
 * as the i18n key. Every key listed here was read off `service/log_info_generate.go`
 * and `model/log.go`; anything else the backend adds is rendered under its raw key
 * rather than being dropped or guessed at.
 */
export const LOG_OTHER_LABEL_KEYS: Readonly<Record<string, string>> = {
  'op.action': 'Operation',
  billing_source: 'Billing source',
  cache_ratio: 'Cache ratio',
  cache_tokens: 'Cached tokens',
  completion_ratio: 'Completion ratio',
  frt: 'First response',
  group_ratio: 'Group ratio',
  is_model_mapped: 'Model mapped',
  is_system_prompt_overwritten: 'System prompt overridden',
  login_method: 'Sign-in method',
  model_price: 'Model price',
  model_ratio: 'Model ratio',
  reasoning_effort: 'Reasoning effort',
  request_path: 'Request path',
  upstream_model_name: 'Upstream model',
  user_agent: 'User agent',
  user_group_ratio: 'User group ratio',
}

/** Reading order for the labelled keys; unlabelled keys follow, sorted by name. */
const LOG_OTHER_KEY_ORDER: readonly string[] = [
  'op.action',
  'request_path',
  'upstream_model_name',
  'is_model_mapped',
  'frt',
  'model_ratio',
  'completion_ratio',
  'group_ratio',
  'user_group_ratio',
  'model_price',
  'cache_tokens',
  'cache_ratio',
  'billing_source',
  'reasoning_effort',
  'is_system_prompt_overwritten',
  'login_method',
  'user_agent',
]

/** Whole-number counts inside `other`, formatted with thousands separators. */
export const LOG_OTHER_COUNT_KEYS: ReadonlySet<string> = new Set(['cache_tokens'])

export type LogOtherEntry = {
  /** Unique path within the blob (`user_agent`, `op.action`, `op.params.method`). */
  rawKey: string
  /** Shown as the term when `labelKey` is undefined — the leaf name, not the full path. */
  displayKey: string
  /** English source string to translate, or undefined when only the raw key is known. */
  labelKey: string | undefined
  value: unknown
}

/**
 * The three keys `model.formatUserLogs` deletes from `other` before a non-admin ever
 * sees the row, and therefore the only extra payload the `everyone` scope carries:
 *
 *   admin_info    the operator behind a management or top-up row
 *                 (`{admin_id, admin_username, admin_role, auth_method}` from
 *                 controller/audit.go, a different set again for top-ups)
 *   audit_info    `{method, route, path, status, success, params?}`, the middleware
 *                 fallback written by middleware/audit.go
 *   stream_status `{status, end_reason, end_error?, error_count?, errors?}` from
 *                 `service.appendStreamStatus` — why a stream ended, which is often
 *                 the answer to "why was this charged that"
 *
 * Diffing one row across both endpoints on the dev server confirms the strip: the
 * `/api/log/` copy carried `admin_info` and `audit_info`, the `/api/log/self` copy
 * of the same row did not.
 */
export const ADMIN_ONLY_OTHER_KEYS: readonly string[] = ['admin_info', 'audit_info', 'stream_status']

/** Deep enough for `op.params.method` and `audit_info.params.id`; anything deeper stays a blob. */
const MAX_OTHER_FLATTEN_DEPTH = 3

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Expands a nested map into `parent.child` rows. Arrays are left whole — an array is
 * one value, and numbering its members would read as structure the backend never gave.
 */
function flattenOtherValue(path: string, value: unknown, depth: number): [string, unknown][] {
  if (depth >= MAX_OTHER_FLATTEN_DEPTH || !isPlainObject(value)) return [[path, value]]
  return Object.entries(value).flatMap(([name, child]) =>
    flattenOtherValue(`${path}.${name}`, child, depth + 1),
  )
}

/**
 * `other.op` is `{action, params?}`, written by `model.buildOpField` for login and
 * management rows. `model/log.go` documents it as the localisation-friendly operation
 * descriptor that survives the non-admin strip, so it is flattened into real rows
 * instead of being dumped as raw JSON under the bare key `op`.
 *
 * `action` is a backend identifier (`login`, `channel.create`) and is rendered as the
 * data it is — never translated, because the set is open-ended and inventing labels for
 * unseen actions would mislabel them. Params keep their own names for the same reason.
 */
function flattenOtherEntry(rawKey: string, value: unknown): [string, unknown][] {
  if (rawKey !== 'op') return [[rawKey, value]]
  return flattenOtherValue(rawKey, value, 0)
}

function isRenderableOtherEntry(key: string, value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false
  if (key === 'frt') {
    return typeof value === 'number'
      && Number.isFinite(value)
      && value >= MIN_VALID_FIRST_RESPONSE_MS
  }
  return true
}

function otherEntryRank(key: string): number {
  const index = LOG_OTHER_KEY_ORDER.indexOf(key)
  return index === -1 ? LOG_OTHER_KEY_ORDER.length : index
}

/**
 * The per-row detail payload, straight from the log's `other` blob.
 *
 * `model.formatUserLogs` unconditionally strips `admin_info`, `audit_info` and
 * `stream_status` before a non-admin caller ever sees the row, so the retry/route
 * chain and channel debug data simply are not available here.
 */
export function logOtherEntries(log: Pick<UserLog, 'other'>): LogOtherEntry[] {
  return Object.entries(parseLogOther(log))
    .filter(([rawKey]) => !ADMIN_ONLY_OTHER_KEYS.includes(rawKey))
    .flatMap(([rawKey, value]) => flattenOtherEntry(rawKey, value))
    .filter(([key, value]) => isRenderableOtherEntry(key, value))
    .map(([rawKey, value]) => ({
      rawKey,
      displayKey: rawKey.slice(rawKey.lastIndexOf('.') + 1),
      labelKey: LOG_OTHER_LABEL_KEYS[rawKey],
      value,
    }))
    .sort((left, right) => {
      const rankDelta = otherEntryRank(left.rawKey) - otherEntryRank(right.rawKey)
      return rankDelta === 0 ? left.rawKey.localeCompare(right.rawKey) : rankDelta
    })
}

/**
 * The admin-only half of `other`, split out of {@link logOtherEntries} so the row
 * detail can say plainly which rows only exist because the caller is an admin.
 *
 * Every term keeps its FULL dotted path (`admin_info.admin_username`,
 * `stream_status.end_reason`) rather than a translated label. `admin_info` alone is
 * written by three different producers with three different key sets, so a fixed
 * label table would mislabel the ones it has not seen — the same reasoning already
 * applied to `op.action`. Returned in root order, then alphabetically within a root.
 */
export function logAdminOtherEntries(log: Pick<UserLog, 'other'>): LogOtherEntry[] {
  const parsed = parseLogOther(log)
  return ADMIN_ONLY_OTHER_KEYS.flatMap((rootKey) =>
    (rootKey in parsed ? flattenOtherValue(rootKey, parsed[rootKey], 0) : [])
      .filter(([key, value]) => isRenderableOtherEntry(key, value))
      .map(([rawKey, value]) => ({
        rawKey,
        displayKey: rawKey,
        labelKey: undefined,
        value,
      }))
      .sort((left, right) => left.rawKey.localeCompare(right.rawKey)),
  )
}

/**
 * `Log.RequestId` is tagged `json:"request_id,omitempty"`, so a legacy row stored with
 * an empty id arrives with the field ABSENT rather than as `''`. The shared `UserLog`
 * type models it as a required string, so normalise before comparing or rendering.
 */
export function logRequestId(log: Pick<UserLog, 'request_id'>): string {
  const raw: string | undefined = log.request_id
  return raw ?? ''
}

/** Stable within a page: the backend rewrites `id` to the row's display index. */
export function logRowId(log: UserLog): string {
  const requestId = logRequestId(log)
  return requestId === '' ? `log-${log.id}` : requestId
}
