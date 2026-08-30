import {
  parseJson,
  parseNumberMap,
  stringifyMap,
  type NumberMap,
} from '@/features/system-settings/billing/option-json'

/**
 * THE GROUP PRICING MODEL
 * =======================
 * A group is not a record either. It exists because one of four option keys names it, and
 * each key answers a different question about it.
 *
 *   GroupRatio        the multiplier applied to every charge for that group
 *   TopupGroupRatio   the multiplier applied to what a top-up in that group costs
 *   UserUsableGroups  the groups a user may select, mapped to the label they see
 *   AutoGroups        the groups the automatic selector is allowed to pick from
 *
 * All four are confirmed present in `GET /api/option/`.
 *
 * TWO KEYS THAT LOOK LIKE THESE AND ARE NOT THEM. The payload also carries
 * `group_ratio_setting.group_ratio` and `group_ratio_setting.group_group_ratio`. They are
 * seeded from the same structs at start-up and then go STALE: writing `GroupRatio` updates
 * the live ratio map and the top-level key, and the dotted mirror keeps its old text until
 * the process restarts. Verified live — after writing `GroupRatio` with an extra group,
 * `GroupRatio` showed it and `group_ratio_setting.group_ratio` did not. Reading or writing
 * the mirrors would be wrong in both directions, so nothing in this console touches them.
 */

export const GROUP_RATIO_KEY = 'GroupRatio'
export const TOPUP_GROUP_RATIO_KEY = 'TopupGroupRatio'
export const USER_USABLE_GROUPS_KEY = 'UserUsableGroups'
export const AUTO_GROUPS_KEY = 'AutoGroups'

/** The four raw JSON strings a group edit reads from and writes back to. */
export type GroupPricingMaps = {
  [GROUP_RATIO_KEY]: string
  [TOPUP_GROUP_RATIO_KEY]: string
  [USER_USABLE_GROUPS_KEY]: string
  [AUTO_GROUPS_KEY]: string
}

export const GROUP_PRICING_KEYS = [
  GROUP_RATIO_KEY,
  TOPUP_GROUP_RATIO_KEY,
  USER_USABLE_GROUPS_KEY,
  AUTO_GROUPS_KEY,
] as const

export type GroupRow = {
  name: string
  /** `null` means the key has no entry, and the group then bills at the server default. */
  billingRatio: number | null
  topUpRatio: number | null
  /** The label a user sees in the group picker; `null` when the group is not selectable. */
  label: string | null
  selectable: boolean
  automatic: boolean
}

/** `UserUsableGroups` is `{group: label}`; anything non-string is ignored. */
function parseUsableGroups(raw: string): Record<string, string> {
  const parsed = parseJson(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

  const map: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string') map[key] = value
  }
  return map
}

/** `AutoGroups` is a JSON array of group names. */
function parseAutoGroups(raw: string): string[] {
  const parsed = parseJson(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
}

export function buildGroupRows(maps: GroupPricingMaps): GroupRow[] {
  const billing = parseNumberMap(maps[GROUP_RATIO_KEY])
  const topUp = parseNumberMap(maps[TOPUP_GROUP_RATIO_KEY])
  const usable = parseUsableGroups(maps[USER_USABLE_GROUPS_KEY])
  const automatic = new Set(parseAutoGroups(maps[AUTO_GROUPS_KEY]))

  const names = new Set([
    ...Object.keys(billing),
    ...Object.keys(topUp),
    ...Object.keys(usable),
    ...automatic,
  ])

  return [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      automatic: automatic.has(name),
      billingRatio: typeof billing[name] === 'number' ? billing[name] : null,
      label: Object.hasOwn(usable, name) ? usable[name] : null,
      name,
      selectable: Object.hasOwn(usable, name),
      topUpRatio: typeof topUp[name] === 'number' ? topUp[name] : null,
    }))
}

function withEntry(map: NumberMap, name: string, value: number | null): NumberMap {
  const next = { ...map }
  if (value === null) delete next[name]
  else next[name] = value
  return next
}

/** Rewrites all four keys from a full row list. Row order does not matter; keys are sorted. */
export function applyGroupRows(rows: readonly GroupRow[]): GroupPricingMaps {
  let billing: NumberMap = {}
  let topUp: NumberMap = {}
  const usable: Record<string, string> = {}
  const automatic: string[] = []

  for (const row of rows) {
    const name = row.name.trim()
    if (name === '') continue

    billing = withEntry(billing, name, row.billingRatio)
    topUp = withEntry(topUp, name, row.topUpRatio)
    if (row.selectable) usable[name] = row.label ?? name
    if (row.automatic) automatic.push(name)
  }

  return {
    [AUTO_GROUPS_KEY]: JSON.stringify([...automatic].sort()),
    [GROUP_RATIO_KEY]: stringifyMap(billing),
    [TOPUP_GROUP_RATIO_KEY]: stringifyMap(topUp),
    [USER_USABLE_GROUPS_KEY]: stringifyMap(usable),
  }
}

/**
 * `ratio_setting.CheckGroupRatio` is the server's own validator and it is run BEFORE the
 * value is stored, so a bad `GroupRatio` is refused cleanly. It rejects a negative ratio;
 * this mirrors that rule so the operator sees it against the offending row instead of as
 * one sentence about the whole blob.
 */
export function findGroupRowProblem(row: GroupRow): 'name' | 'billing' | 'topup' | undefined {
  if (row.name.trim() === '') return 'name'
  if (row.billingRatio !== null && !(row.billingRatio >= 0)) return 'billing'
  if (row.topUpRatio !== null && !(row.topUpRatio >= 0)) return 'topup'
  return undefined
}

export function emptyGroupRow(): GroupRow {
  return { automatic: false, billingRatio: 1, label: '', name: '', selectable: false, topUpRatio: 1 }
}
