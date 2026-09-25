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

/**
 * `/system-settings/models/grok`
 *
 * Two keys, both present in `GET /api/option/`:
 *
 *   grok.violation_deduction_enabled 'true'
 *   grok.violation_deduction_amount  '0.05'
 *
 * xAI bills for a response its moderation refuses, so the gateway charges the caller for
 * it too. The amount is a BASE figure: the deduction actually taken is this number times
 * the group ratio in force, which is why the section shows that rather than presenting the
 * value as a final price.
 */

type GrokDraft = {
  'grok.violation_deduction_enabled': boolean
  'grok.violation_deduction_amount': number
}

function toDraft(options: SystemOptionMap | undefined): GrokDraft {
  return {
    'grok.violation_deduction_amount': readOptionNumber(
      options,
      'grok.violation_deduction_amount',
      0.05,
    ),
    'grok.violation_deduction_enabled': readOptionBoolean(
      options,
      'grok.violation_deduction_enabled',
      true,
    ),
  }
}

export function GrokSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<GrokDraft>({
    saved: toDraft(optionsQuery.data),
    validate: (values) =>
      values['grok.violation_deduction_amount'] < 0
        ? { 'grok.violation_deduction_amount': t('Enter zero or more.') }
        : {},
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const enabled = form.values['grok.violation_deduction_enabled']

  return (
    <SettingsSection
      description={t('What a caller is charged when xAI refuses a response on moderation grounds.')}
      form={form}
      note={t('With this off, a refused response costs the caller nothing while the upstream still bills this deployment for it.')}
      saveMode="section"
      title={t('Grok')}
    >
      <SwitchRow
        checked={enabled}
        description={t('xAI charges for a response its moderation blocks. When this is on, that cost is passed on to the caller instead of being absorbed here.')}
        disabled={disabled}
        label={t('Charge for a refused response')}
        onCheckedChange={(checked) => form.setField('grok.violation_deduction_enabled', checked)}
      />

      <NumberInput
        description={t('The base figure. What is actually deducted is this amount multiplied by the group ratio applied to the request, so a group on a higher ratio pays proportionally more.')}
        disabled={disabled || !enabled}
        error={form.errors['grok.violation_deduction_amount']}
        invalid={form.errors['grok.violation_deduction_amount'] !== undefined}
        label={t('Base deduction for a refused response')}
        min={0}
        onValueChange={(value) =>
          form.setField('grok.violation_deduction_amount', value ?? Number.NaN)
        }
        step="any"
        value={form.values['grok.violation_deduction_amount']}
      />
    </SettingsSection>
  )
}
