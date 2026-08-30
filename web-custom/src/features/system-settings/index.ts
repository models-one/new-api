/**
 * The public surface of the system settings foundation. Sections built by other agents
 * import from here (or from the module paths directly); nothing outside this feature
 * needs anything that is not listed.
 */
export { SystemSettingsPage } from '@/features/system-settings/SystemSettingsPage'
export { SYSTEM_SETTINGS_ROLE, useSystemSettingsAccess } from '@/features/system-settings/access'
export type { SystemSettingsAccess, SystemSettingsAccessState } from '@/features/system-settings/access'

export { SettingsSection } from '@/features/system-settings/components/SettingsSection'
export { SectionPlaceholder } from '@/features/system-settings/components/SectionPlaceholder'

export {
  DEFAULT_SETTINGS_GROUP_ID,
  SETTINGS_GROUPS,
  SYSTEM_SETTINGS_BASE_PATH,
  findSettingsGroup,
  resolveSettingsLocation,
  settingsSectionPath,
} from '@/features/system-settings/groups/registry'
export type { ResolvedSettingsLocation } from '@/features/system-settings/groups/registry'
export type {
  SettingsGroupDefinition,
  SettingsSectionDefinition,
} from '@/features/system-settings/groups/types'

export {
  SYSTEM_OPTIONS_QUERY_KEY,
  hasOption,
  readOptionBoolean,
  readOptionJson,
  readOptionNumber,
  readOptionString,
  readOptionStringList,
  serializeOptionValue,
  systemOptionsQuery,
  toSystemOptionMap,
  useInvalidateSystemOptions,
  useSystemOptionMutation,
  writeSystemOption,
} from '@/features/system-settings/options-store'
export type {
  StringListFormat,
  SystemOption,
  SystemOptionMap,
  SystemOptionWrite,
} from '@/features/system-settings/options-store'

export { collectOptionErrors, useOptionSectionForm } from '@/features/system-settings/section-form'
export type {
  OptionDraft,
  OptionDraftValue,
  OptionSaveFailure,
  OptionSaveMode,
  OptionSectionForm,
  OptionSectionFormState,
  UseOptionSectionFormOptions,
} from '@/features/system-settings/section-form'
