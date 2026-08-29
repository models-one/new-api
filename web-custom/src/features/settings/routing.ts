import type { GroupRoute } from '@/features/settings/types'
import { TOKEN_STATUS, parseAutoGroups, type ApiToken } from '@/lib/api/tokens'
import type { UserGroupMap } from '@/lib/api/user'

/**
 * `model.Token.AutoGroups` is a comma-separated priority list that the relay reads only
 * while `group` is exactly this sentinel (see the backend's NormalizeAutoGroups and
 * CacheGetRandomSatisfiedChannel). Any other `group` value routes to that one group.
 */
export const AUTO_GROUP = 'auto'

/** The groups a key routes through, in the stored priority order. */
export function tokenGroupNames(token: ApiToken): string[] {
  if (token.group === AUTO_GROUP) return parseAutoGroups(token)
  const single = token.group.trim()
  return single === '' ? [] : [single]
}

/** Joins stored group names with what `/api/user/self/groups` knows about them. */
export function toGroupRoutes(names: string[], groups: UserGroupMap | undefined): GroupRoute[] {
  return names.map((name) => {
    const group: UserGroupMap[string] | undefined = groups?.[name]
    return { name, desc: group?.desc ?? '', ratio: group ? group.ratio : null }
  })
}

/**
 * A single group is stored as the key's own `group`; two or more require the `auto`
 * sentinel, because that is the only mode in which the backend reads `auto_groups`.
 */
export function groupFieldsFor(groupNames: string[]): { group: string; auto_groups: string } {
  if (groupNames.length <= 1) return { group: groupNames[0] ?? '', auto_groups: '' }
  return { group: AUTO_GROUP, auto_groups: groupNames.join(',') }
}

/** Cross-group retry only has an effect once a key routes through more than one group. */
export function usesAutoRouting(groupNames: string[]): boolean {
  return groupNames.length > 1
}

/** `-1` is the backend's "never expires" marker for `expired_time`. */
export const NEVER_EXPIRES = -1

export function isEnabled(token: ApiToken): boolean {
  return token.status === TOKEN_STATUS.enabled
}
