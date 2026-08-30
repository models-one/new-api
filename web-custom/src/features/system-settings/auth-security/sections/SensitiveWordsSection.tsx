import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { SwitchRow, Textarea } from '@/components/form'
import { splitLines } from '@/features/system-settings/auth-security/validation'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/security/sensitive-words` — prompt content filtering.
 *
 * Four keys, all verified present in `GET /api/option/`:
 *
 *   CheckSensitiveEnabled          'true'
 *   CheckSensitiveOnPromptEnabled  'true'
 *   StopOnSensitiveEnabled         'true'
 *   SensitiveWords                 'test_sensitive'
 *
 * `StopOnSensitiveEnabled` is REAL and the legacy console never offered it — the section
 * registry there had only the first two switches and the word list. `setting/sensitive.go`
 * documents it as "if a sensitive word is detected, stop generating immediately, otherwise
 * replace the word", so it is the difference between refusing a request and rewriting it.
 *
 * `SensitiveWords` is NEWLINE-separated, not JSON and not comma-separated:
 * `SensitiveWordsToString` joins with `"\n"` and `SensitiveWordsFromString` splits on it,
 * trimming each entry and dropping the blanks. A word containing a comma is therefore
 * legitimate, which is why the list is edited one per line here.
 *
 * The two prompt switches are ANDed at request time: `ShouldCheckPromptSensitive` returns
 * `CheckSensitiveEnabled && CheckSensitiveOnPromptEnabled`, so the second one does nothing
 * while the first is off. The section says that rather than letting an operator flip a
 * switch that has no effect.
 */

type SensitiveWordsDraft = {
  CheckSensitiveEnabled: boolean
  CheckSensitiveOnPromptEnabled: boolean
  StopOnSensitiveEnabled: boolean
  SensitiveWords: string
}

function toDraft(options: SystemOptionMap | undefined): SensitiveWordsDraft {
  return {
    CheckSensitiveEnabled: readOptionBoolean(options, 'CheckSensitiveEnabled', true),
    CheckSensitiveOnPromptEnabled: readOptionBoolean(options, 'CheckSensitiveOnPromptEnabled', true),
    SensitiveWords: readOptionString(options, 'SensitiveWords'),
    StopOnSensitiveEnabled: readOptionBoolean(options, 'StopOnSensitiveEnabled', true),
  }
}

/** The backend trims and drops blanks on read; doing it on write keeps the two in step. */
const serializeSensitiveWords = {
  SensitiveWords: (value: string | number | boolean) => splitLines(String(value)).join('\n'),
}

export function SensitiveWordsSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<SensitiveWordsDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializeSensitiveWords,
    validate: (values) => {
      const errors: Partial<Record<keyof SensitiveWordsDraft & string, string>> = {}
      if (values.CheckSensitiveEnabled && splitLines(values.SensitiveWords).length === 0) {
        // On both keys, so that turning filtering on with an already-empty list is blocked
        // too: the form only refuses a save when a key it is writing carries an error, and
        // in that case the switch is the sole dirty key.
        const message = t('Filtering is on but the list is empty, so nothing is ever matched. Add a word or turn filtering off.')
        errors.SensitiveWords = message
        errors.CheckSensitiveEnabled = message
      }
      return errors
    },
  })

  const values = form.values
  const disabled = optionsQuery.isPending || form.isSaving
  const wordCount = splitLines(values.SensitiveWords).length

  return (
    <SettingsSection
      description={t('Words that make the gateway refuse or rewrite a request before it reaches a model.')}
      form={form}
      note={t('Matching is done against the words as written, one per line. Leading and trailing spaces are removed and blank lines are dropped when saved.')}
      saveMode="section"
      title={t('Sensitive words')}
    >
      <div className="flex flex-col">
        <SwitchRow
          checked={values.CheckSensitiveEnabled}
          description={t('The master switch. With this off, neither of the settings below has any effect.')}
          disabled={disabled}
          label={t('Filter sensitive words')}
          onCheckedChange={(checked) => form.setField('CheckSensitiveEnabled', checked)}
        />
        <SwitchRow
          checked={values.CheckSensitiveOnPromptEnabled}
          description={
            values.CheckSensitiveEnabled
              ? t('Scan the text the user sends before it is forwarded to the model.')
              : t('Scan the text the user sends. Not consulted while filtering is off.')
          }
          disabled={disabled || !values.CheckSensitiveEnabled}
          label={t('Scan prompts')}
          onCheckedChange={(checked) => form.setField('CheckSensitiveOnPromptEnabled', checked)}
        />
        <SwitchRow
          checked={values.StopOnSensitiveEnabled}
          description={
            values.CheckSensitiveEnabled
              ? t('On a match, refuse the request outright. With this off the matched word is replaced and the request continues.')
              : t('On a match, refuse the request outright. Not consulted while filtering is off.')
          }
          disabled={disabled || !values.CheckSensitiveEnabled}
          label={t('Refuse instead of rewriting')}
          onCheckedChange={(checked) => form.setField('StopOnSensitiveEnabled', checked)}
        />
      </div>

      <Textarea
        description={t('One word or phrase per line. {{count}} entries currently.', { count: wordCount })}
        disabled={disabled}
        error={form.errors.SensitiveWords}
        invalid={form.errors.SensitiveWords !== undefined}
        label={t('Blocked words')}
        onChange={(event) => form.setField('SensitiveWords', event.target.value)}
        rows={8}
        value={values.SensitiveWords}
      />
    </SettingsSection>
  )
}
