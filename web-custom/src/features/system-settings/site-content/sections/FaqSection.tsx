import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SwitchRow } from '@/components/form'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import { OptionListEditor } from '@/features/system-settings/site-content/list-editor/OptionListEditor'
import type { ListEditorSpec } from '@/features/system-settings/site-content/list-editor/list-model'
import { useListSection } from '@/features/system-settings/site-content/list-editor/use-list-section'

/**
 * `/system-settings/content/faq` — the questions and answers shown in the console.
 *
 *   console_setting.faq          ''      the list, serialised
 *   console_setting.faq_enabled  'true'  whether the panel is shown
 *
 * `validateFAQ` is the simplest of the four console validators: at most 100 entries,
 * `question` required and ≤ 200 bytes, `answer` required and ≤ 1000 bytes. It runs NO
 * markup check on either field, unlike the API-address and Uptime Kuma validators — an
 * asymmetry in the backend, not an omission here, and the reason no markup rule is
 * claimed on this form.
 */
export function FaqSection() {
  const { t } = useTranslation()

  const spec = useMemo<ListEditorSpec>(
    () => ({
      emptyValue: '[]',
      fields: [
        {
          column: { header: t('Question'), className: 'w-1/3' },
          kind: 'text',
          label: t('Question'),
          maxBytes: 200,
          name: 'question',
          required: true,
        },
        {
          column: { header: t('Answer') },
          kind: 'textarea',
          label: t('Answer'),
          maxBytes: 1000,
          name: 'answer',
          required: true,
          rows: 6,
        },
      ],
      maxItems: 100,
      optionKey: 'console_setting.faq',
    }),
    [t],
  )

  const section = useListSection({ enabledKey: 'console_setting.faq_enabled', spec })

  return (
    <SettingsSection
      description={t('The questions and answers shown in the console.')}
      form={section.form}
      note={t('Entries are shown in the order they appear here. Lengths are counted in bytes, the way the server counts them.')}
      saveMode="section"
      title={t('FAQ')}
    >
      <SwitchRow
        checked={section.enabled}
        description={t('Turning the panel off leaves the questions stored and simply stops showing them.')}
        disabled={section.disabled}
        label={t('Show the FAQ panel')}
        onCheckedChange={section.setEnabled}
      />

      <OptionListEditor
        addLabel={t('Add a question')}
        disabled={section.disabled}
        emptyDescription={t('The FAQ panel stays empty until a question is added here.')}
        emptyTitle={t('No questions yet')}
        itemNoun={t('question')}
        jsonDescription={t('The value exactly as the server stores it. Editing here is the way to repair a list the table cannot show, or to keep a field this editor does not model.')}
        onChange={section.setBlob}
        spec={spec}
        tableLabel={t('Frequently asked questions')}
        value={section.blob}
      />
    </SettingsSection>
  )
}
