import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Textarea } from '@/components/form'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/site/notice` — the banner shown to every signed-in user.
 *
 * ONE key, `Notice`, verified present in `GET /api/option/` and holding `''` on the dev
 * server. `model.InitOptionMap` seeds it empty and `controller.UpdateOption` stores
 * whatever is sent: there is no validation, no length limit and no markup filter on this
 * value anywhere in the backend. Whatever is typed here reaches every signed-in user's
 * browser, which is worth knowing before pasting anything into it.
 *
 * Empty is the off switch — there is no separate flag.
 */

type NoticeDraft = {
  Notice: string
}

function toDraft(options: SystemOptionMap | undefined): NoticeDraft {
  return { Notice: readOptionString(options, 'Notice') }
}

export function NoticeSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<NoticeDraft>({ saved: toDraft(optionsQuery.data) })

  return (
    <SettingsSection
      description={t('The banner shown to every signed-in user.')}
      form={form}
      note={t('The server stores this text exactly as written and applies no length limit or filtering of its own.')}
      saveMode="section"
      title={t('System notice')}
    >
      <Textarea
        description={t('Leave this empty to show no banner at all. The server returns the text verbatim on its notice endpoint, and the console that displays it renders Markdown.')}
        disabled={optionsQuery.isPending || form.isSaving}
        label={t('Notice')}
        onChange={(event) => form.setField('Notice', event.target.value)}
        placeholder={t('Planned maintenance on Friday at 22:00 UTC.')}
        rows={8}
        value={form.values.Notice}
      />
    </SettingsSection>
  )
}
