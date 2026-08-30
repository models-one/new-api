/**
 * JSON-VALUED OPTION HELPERS
 * ==========================
 * A third of the billing group's option keys hold a serialised JSON map. `GET /api/option/`
 * hands them back as raw strings, and the server's tolerance for a malformed one is NOT
 * uniform — which is the single most important thing to know before writing one.
 *
 * Verified live against the dev server (root, `PUT /api/option/` one key at a time):
 *
 *   PRE-VALIDATED — refused before anything is stored, the option map is untouched:
 *     GroupRatio                    "invalid character 'g' looking for beginning of value"
 *     ImageRatio                    "图片倍率设置失败: …"
 *     AudioRatio                    "音频倍率设置失败: …"
 *     AudioCompletionRatio          "音频补全倍率设置失败: …"
 *     CreateCacheRatio              "缓存创建倍率设置失败: …"
 *     tool_price_setting.prices     "工具价格必须是 JSON 对象"
 *
 *   POST-VALIDATED — the refusal arrives AFTER the raw string has already replaced the
 *   value in the option map, so a rejected write CORRUPTS the stored setting:
 *     ModelPrice  ModelRatio  CompletionRatio  CacheRatio  PayMethods
 *     UserUsableGroups  TopupGroupRatio  GroupGroupRatio  AutoGroups
 *
 *   NOT VALIDATED AT ALL — any string is accepted and stored verbatim:
 *     billing_setting.billing_mode      billing_setting.billing_expr
 *     payment_setting.amount_options    payment_setting.amount_discount
 *     CreemProducts                     WaffoPayMethods
 *
 * Those three tiers collapse into one rule for this console: NEVER send a JSON-valued key
 * unless it has already parsed here, into the shape the key is documented to hold. The
 * form's own validator is the only thing standing between an operator's typo and a
 * mispriced deployment.
 */

/** A `{ "model": 1.5 }` style map — the shape of every ratio and price key. */
export type NumberMap = Record<string, number>

/** A `{ "model": "tier(\"base\", p * 3)" }` style map — billing mode and expression. */
export type StringMap = Record<string, string>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `JSON.parse` that answers `undefined` instead of throwing. */
export function parseJson(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
}

/**
 * A number map, or `{}` for anything else. Entries whose value is not a finite number are
 * dropped rather than coerced: `{"gpt-4": "cheap"}` is a broken row, not a price of NaN.
 */
export function parseNumberMap(raw: string): NumberMap {
  const parsed = parseJson(raw)
  if (!isPlainObject(parsed)) return {}

  const map: NumberMap = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'number' && Number.isFinite(value)) map[key] = value
  }
  return map
}

/** A string map, or `{}` for anything else. Non-string values are dropped. */
export function parseStringMap(raw: string): StringMap {
  const parsed = parseJson(raw)
  if (!isPlainObject(parsed)) return {}

  const map: StringMap = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') map[key] = value
  }
  return map
}

/** Sorted keys, so a rewritten blob keeps a stable diff instead of shuffling on every save. */
export function stringifyMap(map: NumberMap | StringMap): string {
  const sorted: Record<string, number | string> = {}
  for (const key of Object.keys(map).sort()) sorted[key] = map[key] as number | string
  return JSON.stringify(sorted)
}

/** Pretty-prints a valid blob for a textarea; leaves an invalid one exactly as typed. */
export function formatJsonForEditor(raw: string): string {
  const parsed = parseJson(raw)
  if (parsed === undefined) return raw
  return JSON.stringify(parsed, null, 2)
}

/** Ignores key order and whitespace, so re-formatting a blob does not mark it dirty. */
export function isSameJson(left: string, right: string): boolean {
  const leftParsed = parseJson(left)
  const rightParsed = parseJson(right)
  if (leftParsed === undefined || rightParsed === undefined) return left.trim() === right.trim()
  return canonicalJson(leftParsed) === canonicalJson(rightParsed)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export type JsonShape = 'object' | 'array' | 'number-map' | 'string-map'

/**
 * The shape check a JSON-valued option must pass before it is allowed near the server.
 * Returns the offending detail, or `undefined` when the blob is acceptable.
 */
export function checkJsonShape(raw: string, shape: JsonShape): 'syntax' | 'shape' | undefined {
  const trimmed = raw.trim()
  // An empty blob is never sent as empty: callers normalise it to '{}' or '[]' first.
  if (trimmed === '') return 'syntax'

  const parsed = parseJson(trimmed)
  if (parsed === undefined) return 'syntax'

  if (shape === 'array') return Array.isArray(parsed) ? undefined : 'shape'
  if (!isPlainObject(parsed)) return 'shape'
  if (shape === 'object') return undefined

  const wanted = shape === 'number-map' ? 'number' : 'string'
  for (const value of Object.values(parsed)) {
    if (typeof value !== wanted) return 'shape'
    if (wanted === 'number' && !Number.isFinite(value)) return 'shape'
  }
  return undefined
}
