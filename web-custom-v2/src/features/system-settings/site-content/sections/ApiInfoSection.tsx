import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SwitchRow } from '@/components/form'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import { OptionListEditor } from '@/features/system-settings/site-content/list-editor/OptionListEditor'
import type { ListEditorSpec } from '@/features/system-settings/site-content/list-editor/list-model'
import { useListSection } from '@/features/system-settings/site-content/list-editor/use-list-section'
import { hasDangerousContent, isConsoleUrl } from '@/features/system-settings/site-content/option-json'

/**
 * `/system-settings/content/api-info` — the base URLs users copy into their clients.
 *
 *   console_setting.api_info          ''      the list, serialised
 *   console_setting.api_info_enabled  'true'  whether the panel is shown
 *
 * `validateApiInfo` in `setting/console_setting/validation.go` is unusually strict and
 * every rule of it is mirrored here: at most 50 entries; `url`, `route`, `description` and
 * `color` all REQUIRED; url ≤ 500 bytes and matching the server's own URL pattern; route
 * ≤ 100 bytes; description ≤ 200 bytes; route and description scanned for markup; and
 * `color` restricted to a fixed list.
 *
 * THE COLOUR LIST BELOW IS THE SERVER'S, not the previous console's. `validColors` holds
 * seventeen names including `light-green`, `light-blue` and `grey`, which the legacy
 * picker omitted — so three perfectly valid colours were unreachable there. Sending an
 * unlisted colour is refused ("第1个API信息的颜色值不合法", verified live).
 */
export function ApiInfoSection() {
  const { t } = useTranslation()

  const spec = useMemo<ListEditorSpec>(
    () => ({
      emptyValue: '[]',
      fields: [
        {
          check: isConsoleUrl,
          checkMessage: t('The address must be a plain http:// or https:// URL. The server rejects credentials in the host and non-ASCII host names.'),
          column: { header: t('Base URL'), mono: true },
          kind: 'text',
          label: t('Base URL'),
          maxBytes: 500,
          name: 'url',
          placeholder: 'https://api.example.com',
          required: true,
        },
        {
          check: (value) => !hasDangerousContent(value),
          checkMessage: t('The server refuses this text because it contains markup or a script URL.'),
          column: { header: t('Route'), className: 'w-40' },
          description: t('A short name for the route, such as “Main” or “Backup”.'),
          kind: 'text',
          label: t('Route'),
          maxBytes: 100,
          name: 'route',
          required: true,
        },
        {
          check: (value) => !hasDangerousContent(value),
          checkMessage: t('The server refuses this text because it contains markup or a script URL.'),
          column: { header: t('Description') },
          kind: 'text',
          label: t('Description'),
          maxBytes: 200,
          name: 'description',
          required: true,
        },
        {
          column: { header: t('Colour'), className: 'w-32' },
          defaultValue: 'blue',
          description: t('Chooses the accent the console draws this address with.'),
          kind: 'select',
          label: t('Colour'),
          name: 'color',
          options: [
            { label: t('Blue'), value: 'blue' },
            { label: t('Light blue'), value: 'light-blue' },
            { label: t('Cyan'), value: 'cyan' },
            { label: t('Teal'), value: 'teal' },
            { label: t('Green'), value: 'green' },
            { label: t('Light green'), value: 'light-green' },
            { label: t('Lime'), value: 'lime' },
            { label: t('Yellow'), value: 'yellow' },
            { label: t('Amber'), value: 'amber' },
            { label: t('Orange'), value: 'orange' },
            { label: t('Red'), value: 'red' },
            { label: t('Pink'), value: 'pink' },
            { label: t('Purple'), value: 'purple' },
            { label: t('Violet'), value: 'violet' },
            { label: t('Indigo'), value: 'indigo' },
            { label: t('Slate'), value: 'slate' },
            { label: t('Grey'), value: 'grey' },
          ],
          required: true,
        },
      ],
      maxItems: 50,
      optionKey: 'console_setting.api_info',
    }),
    [t],
  )

  const section = useListSection({ enabledKey: 'console_setting.api_info_enabled', spec })

  return (
    <SettingsSection
      description={t('The published base URLs users copy into their clients.')}
      form={section.form}
      note={t('These are presentation only: publishing an address here does not route anything, and removing one does not stop it working. The server accepts at most 50.')}
      saveMode="section"
      title={t('API addresses')}
    >
      <SwitchRow
        checked={section.enabled}
        description={t('Turning the panel off leaves the addresses stored and simply stops showing them.')}
        disabled={section.disabled}
        label={t('Show the API address panel')}
        onCheckedChange={section.setEnabled}
      />

      <OptionListEditor
        addLabel={t('Add an address')}
        disabled={section.disabled}
        emptyDescription={t('Users have no address to copy until one is published here.')}
        emptyTitle={t('No API addresses published')}
        itemNoun={t('API address')}
        jsonDescription={t('The value exactly as the server stores it. Editing here is the way to repair a list the table cannot show, or to keep a field this editor does not model.')}
        onChange={section.setBlob}
        spec={spec}
        tableLabel={t('API addresses')}
        value={section.blob}
      />
    </SettingsSection>
  )
}
