/**
 * `ModelRequestRateLimitGroup` — the per-group override for the model request limiter.
 *
 * The option holds a JSON object of `group -> [totalCount, successCount]`, and the legacy
 * console edited it two ways: a table with an add/edit dialog (the default) and a raw JSON
 * box behind a toggle. This module is the parse/serialise half of that, kept pure so the
 * branching can be tested without rendering anything.
 *
 * WHAT THE SERVER ACCEPTS (`setting.CheckModelRequestRateLimitGroup`, verified live):
 *   - the value is unmarshalled into `map[string][2]int`, so a NON-INTEGER or a
 *     non-numeric entry is refused with Go's own parse error;
 *   - `limits[0] >= 0` and `limits[1] >= 1`, both `<= math.MaxInt32`;
 *   - a Go array absorbs whatever fits, so `{"vip":[1,2,3]}` is ACCEPTED and the third
 *     number is silently dropped (verified: `success:true`). The editor refuses that shape
 *     rather than storing a value whose extra element vanishes on the way in;
 *   - AN EMPTY STRING IS REFUSED — `json.Unmarshal("")` fails with "unexpected end of JSON
 *     input" (verified live). The section therefore sends `{}` for a cleared box; the
 *     legacy console sent `''` and ate the refusal.
 *
 * The parse is deliberately conservative. Anything the table cannot represent EXACTLY —
 * malformed JSON, a non-object, an entry that is not a pair of whole numbers — comes back
 * as `unsupported` so the editor can fall back to the JSON box instead of quietly dropping
 * rows on the next save. The legacy visual editor filtered non-conforming entries out of
 * its list and wrote the filtered set back, which erased them.
 */

export type RateLimitGroupEntry = {
  /** The group name, exactly as the group appears on a user. */
  group: string
  /** Every request in the window, failures included. 0 disables the total limit. */
  total: number
  /** Requests that returned a result. At least 1; there is no "unlimited" value. */
  success: number
}

/** Why a stored value cannot be shown as a table. */
export type RateLimitGroupUnsupported = 'invalid-json' | 'not-an-object' | 'unsupported-entry'

export type RateLimitGroupParse =
  | { kind: 'entries'; entries: RateLimitGroupEntry[] }
  | { kind: 'unsupported'; reason: RateLimitGroupUnsupported }

/** `math.MaxInt32` — the ceiling the server enforces on both numbers. */
export const MAX_RATE_LIMIT_VALUE = 2147483647

/**
 * Reads the stored blob into table rows, or says why it cannot.
 *
 * An empty box and `{}` both parse to zero rows: the section turns both into `{}` on the
 * way out, so an operator who selects-all-deletes gets "no overrides" rather than a
 * refusal from the server.
 */
export function parseRateLimitGroups(raw: string): RateLimitGroupParse {
  const trimmed = raw.trim()
  if (trimmed === '') return { entries: [], kind: 'entries' }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { kind: 'unsupported', reason: 'invalid-json' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'unsupported', reason: 'not-an-object' }
  }

  const entries: RateLimitGroupEntry[] = []
  for (const [group, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value) || value.length !== 2) {
      return { kind: 'unsupported', reason: 'unsupported-entry' }
    }
    const [total, success] = value
    if (typeof total !== 'number' || typeof success !== 'number') {
      return { kind: 'unsupported', reason: 'unsupported-entry' }
    }
    if (!Number.isInteger(total) || !Number.isInteger(success)) {
      return { kind: 'unsupported', reason: 'unsupported-entry' }
    }
    entries.push({ group, success, total })
  }

  entries.sort((left, right) => left.group.localeCompare(right.group))
  return { entries, kind: 'entries' }
}

/**
 * Rows back to the stored blob.
 *
 * Sorted by group name so that editing one row does not reshuffle the file and make the
 * whole option look changed, and pretty-printed because the JSON box shows the same string.
 * No rows serialises to `{}`, never `''` — see the header for why that matters.
 */
export function serializeRateLimitGroups(entries: readonly RateLimitGroupEntry[]): string {
  if (entries.length === 0) return '{}'

  const sorted = [...entries].sort((left, right) => left.group.localeCompare(right.group))
  const record: Record<string, [number, number]> = {}
  for (const entry of sorted) {
    record[entry.group] = [entry.total, entry.success]
  }
  return JSON.stringify(record, null, 2)
}

/** What is wrong with one row the operator is editing. */
export type RateLimitEntryErrorCode =
  | 'group-required'
  | 'group-duplicate'
  | 'total-range'
  | 'success-range'

export type RateLimitEntryDraft = {
  group: string
  total: number
  success: number
}

/**
 * Validates one row against the server's rules plus uniqueness, which JSON gives us for
 * free but a table does not: two rows named `vip` would silently collapse into one on
 * serialisation, and the operator would lose whichever they typed first.
 *
 * `existingGroups` is every OTHER row's name — the caller excludes the row being edited so
 * that saving it unchanged is not reported as a duplicate of itself.
 */
export function validateRateLimitEntry(
  draft: RateLimitEntryDraft,
  existingGroups: readonly string[],
): Partial<Record<'group' | 'total' | 'success', RateLimitEntryErrorCode>> {
  const errors: Partial<Record<'group' | 'total' | 'success', RateLimitEntryErrorCode>> = {}

  const group = draft.group.trim()
  if (group === '') {
    errors.group = 'group-required'
  } else if (existingGroups.some((existing) => existing === group)) {
    errors.group = 'group-duplicate'
  }

  if (!Number.isInteger(draft.total) || draft.total < 0 || draft.total > MAX_RATE_LIMIT_VALUE) {
    errors.total = 'total-range'
  }
  if (
    !Number.isInteger(draft.success) ||
    draft.success < 1 ||
    draft.success > MAX_RATE_LIMIT_VALUE
  ) {
    errors.success = 'success-range'
  }

  return errors
}

/**
 * Adds or replaces a row, keyed by group name.
 *
 * `originalGroup` is the name the row had before the edit, so renaming `vip` to `svip`
 * removes the old key instead of leaving both behind.
 */
export function upsertRateLimitEntry(
  entries: readonly RateLimitGroupEntry[],
  draft: RateLimitEntryDraft,
  originalGroup?: string,
): RateLimitGroupEntry[] {
  const group = draft.group.trim()
  const next = entries.filter(
    (entry) => entry.group !== group && entry.group !== (originalGroup ?? group),
  )
  next.push({ group, success: draft.success, total: draft.total })
  return next.sort((left, right) => left.group.localeCompare(right.group))
}

/** Removes one row by group name. */
export function removeRateLimitEntry(
  entries: readonly RateLimitGroupEntry[],
  group: string,
): RateLimitGroupEntry[] {
  return entries.filter((entry) => entry.group !== group)
}
