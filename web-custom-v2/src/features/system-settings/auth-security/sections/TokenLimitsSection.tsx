import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { NumberInput } from '@/components/form'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionNumber,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/security/token-limits` — how many API keys one account may hold.
 *
 * ONE key, verified present in `GET /api/option/`:
 *
 *   token_setting.max_user_tokens  '1000'
 *
 * The dotted name is a FLAT map key, not a path. `operation_setting.GetMaxUserTokens` is
 * read in `controller.AddToken` and `model.Token.Insert`, so the limit is checked when a
 * key is created and never afterwards: lowering it below the number of keys an account
 * already holds does not delete anything, it only stops the next one being made.
 *
 * `MaxUserTokens` is a plain `int` on the Go side and `config.updateConfigFromMap` parses
 * it with `strconv.ParseInt`, falling back to a float parse. A non-integer value would be
 * truncated rather than rejected, so the form insists on a whole number.
 *
 * There is no "unlimited" sentinel in the backend — `len(tokens) >= maxTokens` is compared
 * directly — so 0 means "nobody may create a key", not "no limit". The form allows it and
 * the description says what it does.
 */

type TokenLimitsDraft = {
  'token_setting.max_user_tokens': number
}

function toDraft(options: SystemOptionMap | undefined): TokenLimitsDraft {
  return {
    'token_setting.max_user_tokens': readOptionNumber(options, 'token_setting.max_user_tokens', 1000),
  }
}

export function TokenLimitsSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<TokenLimitsDraft>({
    saved: toDraft(optionsQuery.data),
    validate: (values) => {
      const value = values['token_setting.max_user_tokens']
      if (!Number.isInteger(value) || value < 0) {
        return { 'token_setting.max_user_tokens': t('Enter a whole number of 0 or more.') }
      }
      return {}
    },
  })

  const value = form.values['token_setting.max_user_tokens']
  const disabled = optionsQuery.isPending || form.isSaving

  return (
    <SettingsSection
      description={t('A ceiling on the number of API keys a single account can create.')}
      form={form}
      note={t('The limit is checked only when a key is created. Lowering it never removes keys an account already has — it just stops the next one.')}
      saveMode="section"
      title={t('API key limits')}
    >
      <NumberInput
        className="max-w-sm"
        description={
          value === 0
            ? t('At 0, no account can create an API key at all — there is no “unlimited” value.')
            : t('The account is refused once it already holds this many keys. There is no “unlimited” value; use a high number instead.')
        }
        disabled={disabled}
        error={form.errors['token_setting.max_user_tokens']}
        invalid={form.errors['token_setting.max_user_tokens'] !== undefined}
        label={t('Maximum API keys per account')}
        min={0}
        onValueChange={(next) => form.setField('token_setting.max_user_tokens', next ?? Number.NaN)}
        step={1}
        value={value}
      />
    </SettingsSection>
  )
}
