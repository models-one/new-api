import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SwitchRow } from '@/components/form'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import { nowRfc3339 } from '@/features/system-settings/site-content/datetime'
import { OptionListEditor } from '@/features/system-settings/site-content/list-editor/OptionListEditor'
import type { ListEditorSpec } from '@/features/system-settings/site-content/list-editor/list-model'
import { useListSection } from '@/features/system-settings/site-content/list-editor/use-list-section'
import { isRfc3339 } from '@/features/system-settings/site-content/option-json'

/**
 * `/system-settings/content/announcements` — the announcement list on the console home.
 *
 * Two keys, both verified present in `GET /api/option/` on the running dev server:
 *
 *   console_setting.announcements          ''      the list, serialised
 *   console_setting.announcements_enabled  'true'  whether the panel is shown at all
 *
 * `controller.UpdateOption` runs `console_setting.ValidateConsoleSettings(value,
 * "Announcements")` before storing, and every rule below is that validator, mirrored so
 * the form refuses what the server would refuse instead of sending a write that bounces:
 * at most 100 entries; `content` required and at most 500 bytes; `publishDate` required
 * and parseable by `time.Parse(time.RFC3339, …)`; `type`, when present, one of five
 * values; `extra` at most 200 bytes.
 *
 * `type` is REQUIRED here even though the Go validator treats it as optional, and that is
 * deliberate rather than sloppy: the validator's check is "if the key exists it must be
 * valid", and an entry written from this editor always carries the key. An empty string is
 * not one of the five values, so leaving it blank is refused by the server — verified live
 * ("第1个公告的类型值不合法"). Requiring a choice is the honest way to say that.
 */
export function AnnouncementsSection() {
  const { t } = useTranslation()

  const spec = useMemo<ListEditorSpec>(
    () => ({
      emptyValue: '[]',
      fields: [
        {
          column: { header: t('Announcement') },
          kind: 'textarea',
          label: t('Content'),
          maxBytes: 500,
          name: 'content',
          required: true,
          rows: 4,
        },
        {
          column: { header: t('Published'), className: 'w-52' },
          defaultValue: nowRfc3339,
          description: t('Announcements are listed newest first, by this date. A future date does not hide the announcement — the server sorts by it, it does not schedule on it.'),
          kind: 'datetime',
          label: t('Publish date'),
          name: 'publishDate',
          required: true,
          check: isRfc3339,
          checkMessage: t('The publish date must be a full date and time.'),
        },
        {
          column: { header: t('Type'), className: 'w-32' },
          defaultValue: 'default',
          kind: 'select',
          label: t('Type'),
          name: 'type',
          options: [
            { label: t('Default'), value: 'default' },
            { label: t('Ongoing'), value: 'ongoing' },
            { label: t('Success'), value: 'success' },
            { label: t('Warning'), value: 'warning' },
            { label: t('Error'), value: 'error' },
          ],
          required: true,
        },
        {
          column: { header: t('Note'), className: 'w-40' },
          description: t('A short label shown beside the announcement.'),
          kind: 'text',
          label: t('Note'),
          maxBytes: 200,
          name: 'extra',
        },
      ],
      maxItems: 100,
      optionKey: 'console_setting.announcements',
    }),
    [t],
  )

  const section = useListSection({ enabledKey: 'console_setting.announcements_enabled', spec })

  return (
    <SettingsSection
      description={t('The announcement list on the console home.')}
      form={section.form}
      note={t('Lengths are counted in bytes, the way the server counts them: 500 bytes is about 165 Chinese characters. The server keeps at most 100 announcements.')}
      saveMode="section"
      title={t('Announcements')}
    >
      <SwitchRow
        checked={section.enabled}
        description={t('Turning the panel off leaves the announcements stored and simply stops showing them.')}
        disabled={section.disabled}
        label={t('Show the announcements panel')}
        onCheckedChange={section.setEnabled}
      />

      <OptionListEditor
        addLabel={t('Add an announcement')}
        disabled={section.disabled}
        emptyDescription={t('Nothing is published on the console home until an announcement is added here.')}
        emptyTitle={t('No announcements yet')}
        itemNoun={t('announcement')}
        jsonDescription={t('The value exactly as the server stores it. Editing here is the way to repair a list the table cannot show, or to keep a field this editor does not model.')}
        onChange={section.setBlob}
        spec={spec}
        tableLabel={t('Announcements')}
        value={section.blob}
      />
    </SettingsSection>
  )
}
