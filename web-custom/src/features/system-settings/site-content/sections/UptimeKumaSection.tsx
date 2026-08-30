import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SwitchRow } from '@/components/form'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import { OptionListEditor } from '@/features/system-settings/site-content/list-editor/OptionListEditor'
import type { ListEditorSpec } from '@/features/system-settings/site-content/list-editor/list-model'
import { useListSection } from '@/features/system-settings/site-content/list-editor/use-list-section'
import {
  hasDangerousContent,
  isConsoleUrl,
  isUptimeSlug,
} from '@/features/system-settings/site-content/option-json'

/**
 * `/system-settings/content/uptime-kuma` — the uptime monitor embedded on the status panel.
 *
 *   console_setting.uptime_kuma_groups   ''      the list, serialised
 *   console_setting.uptime_kuma_enabled  'true'  whether the panel is shown
 *
 * Unlike the other three console lists this one has REAL side effects.
 * `controller.GetUptimeKumaStatus` walks these groups and makes a server-side HTTP request
 * to each `url` + `slug` pair, in parallel, on every call. A wrong address here is an
 * outbound request from the gateway, not a broken link, which is why the URL rule is the
 * server's own pattern and not a lenient one.
 *
 * `validateUptimeKumaGroups` mirrored: at most 20 groups; `categoryName` required, ≤ 50
 * bytes, UNIQUE across the list, markup-checked; `url` required, ≤ 500 bytes, matching the
 * URL pattern; `slug` required, ≤ 100 bytes, `[A-Za-z0-9_-]+`; `description` optional,
 * ≤ 200 bytes, markup-checked.
 *
 * `description` is validated by the server but had no control in the previous console, so
 * an operator could not set or repair it there. It has one here.
 */
export function UptimeKumaSection() {
  const { t } = useTranslation()

  const spec = useMemo<ListEditorSpec>(
    () => ({
      emptyValue: '[]',
      fields: [
        {
          check: (value) => !hasDangerousContent(value),
          checkMessage: t('The server refuses this text because it contains markup or a script URL.'),
          column: { header: t('Category'), className: 'w-44' },
          description: t('Shown as the heading for this group of monitors. No two groups may share it.'),
          kind: 'text',
          label: t('Category name'),
          maxBytes: 50,
          name: 'categoryName',
          required: true,
        },
        {
          check: isConsoleUrl,
          checkMessage: t('The address must be a plain http:// or https:// URL. The server rejects credentials in the host and non-ASCII host names.'),
          column: { header: t('Uptime Kuma URL'), mono: true },
          description: t('The base address of the Uptime Kuma instance. The gateway itself calls this address, so it must be reachable from the server rather than from your browser.'),
          kind: 'text',
          label: t('Uptime Kuma URL'),
          maxBytes: 500,
          name: 'url',
          placeholder: 'https://status.example.com',
          required: true,
        },
        {
          check: isUptimeSlug,
          checkMessage: t('A slug may contain only letters, numbers, hyphens and underscores.'),
          column: { header: t('Status page'), className: 'w-40', mono: true },
          description: t('The slug of the Uptime Kuma status page to read, taken from its own URL.'),
          kind: 'text',
          label: t('Status page slug'),
          maxBytes: 100,
          name: 'slug',
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
        },
      ],
      maxItems: 20,
      optionKey: 'console_setting.uptime_kuma_groups',
      uniqueField: 'categoryName',
    }),
    [t],
  )

  const section = useListSection({ enabledKey: 'console_setting.uptime_kuma_enabled', spec })

  return (
    <SettingsSection
      description={t('The uptime monitor embedded on the status panel.')}
      form={section.form}
      note={t('Every group here becomes an outbound request from the gateway each time the status panel is loaded. The server accepts at most 20.')}
      saveMode="section"
      title={t('Uptime Kuma')}
    >
      <SwitchRow
        checked={section.enabled}
        description={t('Turning the panel off leaves the groups stored and stops the console asking for them.')}
        disabled={section.disabled}
        label={t('Show the uptime panel')}
        onCheckedChange={section.setEnabled}
      />

      <OptionListEditor
        addLabel={t('Add a group')}
        disabled={section.disabled}
        emptyDescription={t('The status panel has nothing to poll until a group is added here.')}
        emptyTitle={t('No monitor groups configured')}
        itemNoun={t('monitor group')}
        jsonDescription={t('The value exactly as the server stores it. Editing here is the way to repair a list the table cannot show, or to keep a field this editor does not model.')}
        onChange={section.setBlob}
        spec={spec}
        tableLabel={t('Uptime Kuma groups')}
        value={section.blob}
      />
    </SettingsSection>
  )
}
