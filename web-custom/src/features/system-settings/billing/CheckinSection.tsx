import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { NumberInput, SwitchRow } from '@/components/form'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { formatQuota } from '@/lib/format'

/**
 * `/system-settings/billing/checkin`
 *
 * Three keys, all confirmed present in `GET /api/option/`:
 *
 *   checkin_setting.enabled    'false'
 *   checkin_setting.min_quota  '1000'
 *   checkin_setting.max_quota  '10000'
 *
 * A daily check-in awards a random amount between the two bounds. The server does NOT
 * police them: `PUT {"key":"checkin_setting.min_quota","value":"abc"}` answers
 * `success:true` (verified live) and the stored text is parsed with the error discarded.
 * An inverted range — minimum above maximum — is likewise accepted. Both are rejected
 * here, because the operator is the only check there is.
 *
 * The bounds stay editable while the feature is switched off, so a range can be set up
 * before it is turned on; the legacy console hid them entirely, which meant the reward an
 * operator was about to enable was invisible until it was enabled.
 */

type CheckinDraft = {
  'checkin_setting.enabled': boolean
  'checkin_setting.min_quota': number
  'checkin_setting.max_quota': number
}

function toDraft(options: SystemOptionMap | undefined): CheckinDraft {
  return {
    'checkin_setting.enabled': readOptionBoolean(options, 'checkin_setting.enabled', false),
    'checkin_setting.max_quota': readOptionNumber(options, 'checkin_setting.max_quota', 0),
    'checkin_setting.min_quota': readOptionNumber(options, 'checkin_setting.min_quota', 0),
  }
}

export function CheckinSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())
  const quotaPerUnit = useQuotaPerUnit()

  const form = useOptionSectionForm<CheckinDraft>({
    saved: toDraft(optionsQuery.data),
    validate: (values) => {
      const errors: Partial<Record<keyof CheckinDraft, string>> = {}
      const min = values['checkin_setting.min_quota']
      const max = values['checkin_setting.max_quota']

      if (min < 0) errors['checkin_setting.min_quota'] = t('Enter zero or more.')
      if (max < 0) errors['checkin_setting.max_quota'] = t('Enter zero or more.')
      else if (max < min) {
        errors['checkin_setting.max_quota'] = t('The maximum cannot be below the minimum.')
      }

      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const enabled = form.values['checkin_setting.enabled']

  return (
    <SettingsSection
      description={t('A once-a-day reward users can claim for themselves.')}
      form={form}
      note={t('Each claim draws a random amount between the two bounds. Set them equal for a fixed reward.')}
      saveMode="section"
      title={t('Check-in rewards')}
    >
      <SwitchRow
        checked={enabled}
        description={t('Adds a daily claim to the console. Turning it off leaves the amounts below untouched.')}
        disabled={disabled}
        label={t('Allow daily check-in')}
        onCheckedChange={(checked) => form.setField('checkin_setting.enabled', checked)}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <NumberInput
          description={t('Worth {{amount}} at the current quota divisor.', {
            amount: formatQuota(
              Number.isFinite(form.values['checkin_setting.min_quota'])
                ? form.values['checkin_setting.min_quota']
                : 0,
              quotaPerUnit,
            ),
          })}
          disabled={disabled}
          error={form.errors['checkin_setting.min_quota']}
          label={t('Smallest reward')}
          min={0}
          onValueChange={(value) =>
            form.setField('checkin_setting.min_quota', value ?? Number.NaN)}
          step="any"
          value={form.values['checkin_setting.min_quota']}
        />

        <NumberInput
          description={t('Worth {{amount}} at the current quota divisor.', {
            amount: formatQuota(
              Number.isFinite(form.values['checkin_setting.max_quota'])
                ? form.values['checkin_setting.max_quota']
                : 0,
              quotaPerUnit,
            ),
          })}
          disabled={disabled}
          error={form.errors['checkin_setting.max_quota']}
          label={t('Largest reward')}
          min={0}
          onValueChange={(value) =>
            form.setField('checkin_setting.max_quota', value ?? Number.NaN)}
          step="any"
          value={form.values['checkin_setting.max_quota']}
        />
      </div>

      {enabled ? null : (
        <p className="text-xs leading-5 text-muted">
          {t('Check-in is currently switched off, so nobody can claim these amounts.')}
        </p>
      )}
    </SettingsSection>
  )
}
