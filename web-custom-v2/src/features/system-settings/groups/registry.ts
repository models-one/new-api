import { authGroup } from '@/features/system-settings/groups/auth'
import { billingGroup } from '@/features/system-settings/groups/billing'
import { contentGroup } from '@/features/system-settings/groups/content'
import { modelsGroup } from '@/features/system-settings/groups/models'
import { operationsGroup } from '@/features/system-settings/groups/operations'
import { requestPoliciesGroup } from '@/features/system-settings/groups/request-policies'
import { securityGroup } from '@/features/system-settings/groups/security'
import { siteGroup } from '@/features/system-settings/groups/site'
import type {
  SettingsGroupDefinition,
  SettingsSectionDefinition,
} from '@/features/system-settings/groups/types'

/**
 * The eight groups and their leaf sections, in the order the legacy console lists
 * them. This file is written once and never needs editing again — a section is filled in
 * by adding its `Component` inside its own group file.
 */
export const SETTINGS_GROUPS: readonly [SettingsGroupDefinition, ...SettingsGroupDefinition[]] = [
  siteGroup,
  authGroup,
  contentGroup,
  modelsGroup,
  requestPoliciesGroup,
  billingGroup,
  operationsGroup,
  securityGroup,
]

/** Where `/system-settings` lands, matching the legacy redirect to `/system-settings/site`. */
export const DEFAULT_SETTINGS_GROUP_ID = siteGroup.id

export const SYSTEM_SETTINGS_BASE_PATH = '/system-settings'

export type ResolvedSettingsLocation = {
  group: SettingsGroupDefinition
  section: SettingsSectionDefinition
  /** True when the requested group or section id did not exist and a default was used. */
  redirected: boolean
}

export function findSettingsGroup(groupId: string | undefined): SettingsGroupDefinition | undefined {
  return SETTINGS_GROUPS.find((group) => group.id === groupId)
}

/**
 * Resolves the two URL segments to a group and a section, falling back rather than
 * throwing: a stale bookmark pointing at a section id that no longer exists should land
 * on that group's first section, not on an error page.
 */
/** Sections that moved to another group, so a bookmark of the old address still lands on them. */
const MOVED_SECTIONS: Readonly<Record<string, readonly [string, string]>> = {
  'models/channel-affinity': ['request-policies', 'routing'],
  'models/routing-reliability': ['request-policies', 'health'],
}

export function resolveSettingsLocation(
  requestedGroupId: string | undefined,
  requestedSectionId: string | undefined,
): ResolvedSettingsLocation {
  const moved = MOVED_SECTIONS[`${requestedGroupId}/${requestedSectionId}`]
  const groupId = moved?.[0] ?? requestedGroupId
  const sectionId = moved?.[1] ?? requestedSectionId
  const group = findSettingsGroup(groupId) ?? SETTINGS_GROUPS[0]
  const section = group.sections.find((candidate) => candidate.id === sectionId) ?? group.sections[0]

  return {
    group,
    redirected: group.id !== requestedGroupId || section.id !== requestedSectionId,
    section,
  }
}

/** `/system-settings/<group>/<section>`. */
export function settingsSectionPath(groupId: string, sectionId: string): string {
  return `${SYSTEM_SETTINGS_BASE_PATH}/${groupId}/${sectionId}`
}
