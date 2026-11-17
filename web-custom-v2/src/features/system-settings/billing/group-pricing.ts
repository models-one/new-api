import {
  parseJson,
  parseNumberMap,
  stringifyMap,
  type NumberMap,
} from '@/features/system-settings/billing/option-json'

/**
 * THE GROUP PRICING MODEL
 * =======================
 * A group is not a record either. It exists because one of three option keys names it, and
 * each key answers a different question about it.
 *
 *   GroupRatio        the multiplier applied to every charge for that group
 *   TopupGroupRatio   the multiplier applied to what a top-up in that group costs
 *   UserUsableGroups  the groups a user may select, mapped to the label they see
 *
 * Three more keys refer to those groups by name:
 *
 *   AutoGroups        the groups the `auto` token group tries, IN THIS ORDER
 *                     (`service.GetUserAutoGroup` walks the list front to back)
 *   GroupGroupRatio   `{userGroup: {billingGroup: ratio}}` — when a user of the outer
 *                     group is billed as the inner one, this ratio replaces the inner
 *                     group's own (`ratio_setting.GetGroupGroupRatio`)
 *   group_ratio_setting.group_special_usable_group
 *                     `{userGroup: {"+:group": label, "-:group": label, "group": label}}`
 *                     — groups shown to, or hidden from, users of the outer group on top
 *                     of UserUsableGroups (`service.GetUserUsableGroups`)
 *
 * All are confirmed present in `GET /api/option/`.
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

export const GROUP_GROUP_RATIO_KEY = 'GroupGroupRatio'
export const GROUP_VISIBILITY_KEY = 'group_ratio_setting.group_special_usable_group'

/** The three raw JSON strings the pricing table reads from and writes back to. */
export type GroupPricingMaps = {
  [GROUP_RATIO_KEY]: string
  [TOPUP_GROUP_RATIO_KEY]: string
  [USER_USABLE_GROUPS_KEY]: string
}

export const GROUP_PRICING_KEYS = [GROUP_RATIO_KEY, TOPUP_GROUP_RATIO_KEY, USER_USABLE_GROUPS_KEY] as const

export type GroupRow = {
  name: string
  /** `null` means the key has no entry, and the group then bills at the server default. */
  billingRatio: number | null
  topUpRatio: number | null
  /** The label a user sees in the group picker; `null` when the group is not selectable. */
  label: string | null
  selectable: boolean
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

/**
 * `AutoGroups` is a JSON array of group names whose ORDER is the order they are tried in.
 * A repeated name is dropped, as the server does when it resolves the list.
 */
export function parseAutoGroups(raw: string): string[] {
  const parsed = parseJson(raw)
  if (!Array.isArray(parsed)) return []
  const names = parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
  return [...new Set(names)]
}

export function stringifyAutoGroups(groups: readonly string[]): string {
  return JSON.stringify(groups)
}

export function buildGroupRows(maps: GroupPricingMaps): GroupRow[] {
  const billing = parseNumberMap(maps[GROUP_RATIO_KEY])
  const topUp = parseNumberMap(maps[TOPUP_GROUP_RATIO_KEY])
  const usable = parseUsableGroups(maps[USER_USABLE_GROUPS_KEY])

  const names = new Set([...Object.keys(billing), ...Object.keys(topUp), ...Object.keys(usable)])

  return [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
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

/** Rewrites the three table keys from a full row list. Row order does not matter; keys are sorted. */
export function applyGroupRows(rows: readonly GroupRow[]): GroupPricingMaps {
  let billing: NumberMap = {}
  let topUp: NumberMap = {}
  const usable: Record<string, string> = {}

  for (const row of rows) {
    const name = row.name.trim()
    if (name === '') continue

    billing = withEntry(billing, name, row.billingRatio)
    topUp = withEntry(topUp, name, row.topUpRatio)
    if (row.selectable) usable[name] = row.label ?? name
  }

  return {
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
  return { billingRatio: 1, label: '', name: '', selectable: false, topUpRatio: 1 }
}

// ---------------------------------------------------------------------------
// Special ratio rules — GroupGroupRatio
// ---------------------------------------------------------------------------

export type GroupOverrideRule = {
  /** The group the call is billed as (the token's group). */
  group: string
  /** `null` while the box is empty or holds something that is not a number. */
  ratio: number | null
}

/** The ratios that replace a billing group's own, for users of one group. */
export type GroupOverride = {
  userGroup: string
  rules: GroupOverrideRule[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads `{userGroup: {billingGroup: ratio}}`, keeping the stored order of both levels. */
export function parseGroupOverrides(raw: string): GroupOverride[] {
  const parsed = parseJson(raw)
  if (!isRecord(parsed)) return []
  return Object.entries(parsed).map(([userGroup, inner]) => ({
    rules: isRecord(inner)
      ? Object.entries(inner).map(([group, ratio]) => ({
          group,
          ratio: typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : null,
        }))
      : [],
    userGroup,
  }))
}

export function stringifyGroupOverrides(overrides: readonly GroupOverride[]): string {
  const result: Record<string, Record<string, number | null>> = {}
  for (const override of overrides) {
    const inner: Record<string, number | null> = {}
    for (const rule of override.rules) inner[rule.group] = rule.ratio
    result[override.userGroup] = inner
  }
  return JSON.stringify(result)
}

/**
 * A ratio below zero would turn a charge into a credit, and the server stores this key
 * without checking it, so the rule is enforced here. A user group left without rules is
 * allowed while editing and dropped when the section is saved.
 */
export function findGroupOverrideProblem(overrides: readonly GroupOverride[]): { userGroup: string; group: string } | undefined {
  for (const override of overrides) {
    for (const rule of override.rules) {
      if (rule.group.trim() === '' || rule.ratio === null || !(rule.ratio >= 0)) {
        return { group: rule.group, userGroup: override.userGroup }
      }
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Group visibility — group_ratio_setting.group_special_usable_group
// ---------------------------------------------------------------------------

export type GroupVisibilityRule = {
  group: string
  /** True shows the group to these users on top of the selectable ones; false hides it. */
  visible: boolean
  /** The label these users see for a shown group. Unused for a hidden one. */
  description: string
  /** The stored key had no `+:` prefix. Kept so an untouched rule is written back as it was. */
  bare?: boolean
}

export type GroupVisibility = {
  userGroup: string
  rules: GroupVisibilityRule[]
}

/** Reads `{userGroup: {"+:group" | "-:group" | "group": label}}`; a bare key shows the group. */
export function parseGroupVisibility(raw: string): GroupVisibility[] {
  const parsed = parseJson(raw)
  if (!isRecord(parsed)) return []
  return Object.entries(parsed).map(([userGroup, inner]) => ({
    rules: isRecord(inner)
      ? Object.entries(inner).map(([key, label]) => {
          const description = typeof label === 'string' ? label : ''
          if (key.startsWith('-:')) return { description, group: key.slice(2), visible: false }
          if (key.startsWith('+:')) return { description, group: key.slice(2), visible: true }
          return { bare: true, description, group: key, visible: true }
        })
      : [],
    userGroup,
  }))
}

export function stringifyGroupVisibility(visibility: readonly GroupVisibility[]): string {
  const result: Record<string, Record<string, string>> = {}
  for (const entry of visibility) {
    const inner: Record<string, string> = {}
    for (const rule of entry.rules) {
      let key = `-:${rule.group}`
      if (rule.visible) key = rule.bare ? rule.group : `+:${rule.group}`
      inner[key] = rule.description
    }
    result[entry.userGroup] = inner
  }
  return JSON.stringify(result)
}

/** Drops the user groups of a `{userGroup: {...}}` blob that hold no rule. */
export function dropEmptyGroups(raw: string): string {
  const parsed = parseJson(raw)
  if (!isRecord(parsed)) return raw
  const kept = Object.fromEntries(Object.entries(parsed).filter(([, inner]) => !isRecord(inner) || Object.keys(inner).length > 0))
  return Object.keys(kept).length === Object.keys(parsed).length ? raw : JSON.stringify(kept)
}
