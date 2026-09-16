import type { ComponentType, ForwardRefExoticComponent, RefAttributes } from 'react'
import type { LucideProps } from 'lucide-react'

export type SettingsGroupIcon = ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
>

/**
 * One leaf section. `id` is the URL segment and matches the legacy console's own section
 * id, so an operator's bookmark of `/system-settings/site/system-info` still lands here.
 *
 * `title` and `description` are ENGLISH SOURCE STRINGS, run through `t()` at render time
 * — the same convention as the rest of this console. Both must exist in all seven locale
 * files.
 *
 * `Component` is required: a section with no UI has nothing to show, and the compiler is
 * the right place to catch that rather than a placeholder that tells the reader this
 * console has not finished being built.
 */
export type SettingsSectionDefinition = {
  id: string
  title: string
  description: string
  Component: ComponentType
}

export type SettingsGroupDefinition = {
  id: string
  title: string
  description: string
  Icon: SettingsGroupIcon
  sections: readonly [SettingsSectionDefinition, ...SettingsSectionDefinition[]]
}
