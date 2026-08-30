import { authGroup } from '@/features/system-settings/groups/auth'
import { billingGroup } from '@/features/system-settings/groups/billing'
import { contentGroup } from '@/features/system-settings/groups/content'
import { modelsGroup } from '@/features/system-settings/groups/models'
import { operationsGroup } from '@/features/system-settings/groups/operations'
import { securityGroup } from '@/features/system-settings/groups/security'
import { siteGroup } from '@/features/system-settings/groups/site'
import type {
  SettingsGroupDefinition,
  SettingsSectionDefinition,
} from '@/features/system-settings/groups/types'

/**
 * The seven groups and their 41 leaf sections, in the order the legacy console lists
 * them. This file is written once and never needs editing again — a section is filled in
 * by adding its `Component` inside its own group file.
 */
export const SETTINGS_GROUPS: readonly [SettingsGroupDefinition, ...SettingsGroupDefinition[]] = [
  siteGroup,
  authGroup,
  contentGroup,
  modelsGroup,
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
export function resolveSettingsLocation(
  groupId: string | undefined,
  sectionId: string | undefined,
): ResolvedSettingsLocation {
  const group = findSettingsGroup(groupId) ?? SETTINGS_GROUPS[0]
  const section = group.sections.find((candidate) => candidate.id === sectionId) ?? group.sections[0]

  return {
    group,
    redirected: group.id !== groupId || section.id !== sectionId,
    section,
  }
}

/** `/system-settings/<group>/<section>`. */
export function settingsSectionPath(groupId: string, sectionId: string): string {
  return `${SYSTEM_SETTINGS_BASE_PATH}/${groupId}/${sectionId}`
}
