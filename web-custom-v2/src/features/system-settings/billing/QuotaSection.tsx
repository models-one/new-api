import { useQuery } from '@tanstack/react-query'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import { useTranslation } from 'react-i18next'

import { Input, NumberInput, SwitchRow } from '@/components/form'
import { Alert } from '@/components/ui'
import { readPaymentCompliance } from '@/features/system-settings/billing/compliance'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { formatQuota } from '@/lib/format'

/**
 * `/system-settings/billing/quota`
 *
 * Eight keys, every one confirmed present in `GET /api/option/` on the dev server:
 *
 *   QuotaForNewUser                            '0'
 *   QuotaForInviter                            '0'
 *   QuotaForInvitee                            '0'
 *   TopUpLink                                  ''
 *   general_setting.docs_link                  'https://docs.newapi.pro'
 *   quota_setting.enable_free_model_pre_consume 'true'
 *   quota_setting.trust_quota_usd              '10'
 *   quota_setting.pre_consume_multiplier       '1'
 *
 * The last two shape the RESERVATION a request holds before it runs, never the final
 * charge (`pkg/billingexpr/expr.md`, "Pre-consume"). `trust_quota_usd` is a wallet balance
 * in US dollars above which a request skips the reservation; 0 turns the bypass off.
 * `pre_consume_multiplier` scales the reserved estimate of the input cost.
 * `operation_setting.ValidateQuotaOption` refuses a negative or non-finite value for
 * either and a zero multiplier; the same rules are checked here first.
 *
 * THE REFUSAL THIS SECTION EXISTS TO HANDLE. `controller/option.go`:
 *
 *   case "QuotaForInviter", "QuotaForInvitee":
 *       if isPositiveOptionValue(value) && !IsPaymentComplianceConfirmed() { refuse }
 *
 * A positive invitation reward is refused — HTTP 200 with `success:false` — until the
 * payment compliance terms have been accepted. Zero always lands. Rather than fire a
 * write that is certain to come back refused, this section reads the compliance state
 * from the same option payload and turns the impossible value into a validation message
 * naming the section that unblocks it. If the gate is closed underneath us anyway
 * (another operator, a stale read), the server's own sentence still surfaces through
 * `SettingsSection`'s refusal alert.
 *
 * Amounts are QUOTA UNITS, not currency. Each field shows what its number is worth at the
 * deployment's own `quota_per_unit`, read from `/api/status` — never a hardcoded 500000.
 */

type QuotaDraft = {
  QuotaForNewUser: number
  QuotaForInviter: number
  QuotaForInvitee: number
  TopUpLink: string
  'general_setting.docs_link': string
  'quota_setting.enable_free_model_pre_consume': boolean
  'quota_setting.trust_quota_usd': number
  'quota_setting.pre_consume_multiplier': number
}

function toDraft(options: SystemOptionMap | undefined): QuotaDraft {
  return {
    'general_setting.docs_link': readOptionString(options, 'general_setting.docs_link'),
    QuotaForInvitee: readOptionNumber(options, 'QuotaForInvitee', 0),
    QuotaForInviter: readOptionNumber(options, 'QuotaForInviter', 0),
    QuotaForNewUser: readOptionNumber(options, 'QuotaForNewUser', 0),
    'quota_setting.enable_free_model_pre_consume': readOptionBoolean(
      options,
      'quota_setting.enable_free_model_pre_consume',
      true,
    ),
    'quota_setting.pre_consume_multiplier': readOptionNumber(options, 'quota_setting.pre_consume_multiplier', 1),
    'quota_setting.trust_quota_usd': readOptionNumber(options, 'quota_setting.trust_quota_usd', 10),
    TopUpLink: readOptionString(options, 'TopUpLink'),
  }
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const serializeQuota = {
  'general_setting.docs_link': (value: string | number | boolean) => String(value).trim(),
  TopUpLink: (value: string | number | boolean) => String(value).trim(),
}

export function QuotaSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())
  const quotaPerUnit = useQuotaPerUnit()
  const compliance = readPaymentCompliance(optionsQuery.data)

  const form = useOptionSectionForm<QuotaDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializeQuota,
    validate: (values) => {
      const errors: Partial<Record<keyof QuotaDraft, string>> = {}
      const gateMessage = t(
        'The server refuses a reward above zero until the payment compliance terms are accepted, under Billing → Payment gateway.',
      )

      if (values.QuotaForNewUser < 0) errors.QuotaForNewUser = t('Enter zero or more.')

      if (values.QuotaForInviter < 0) errors.QuotaForInviter = t('Enter zero or more.')
      else if (values.QuotaForInviter > 0 && !compliance.confirmed) errors.QuotaForInviter = gateMessage

      if (values.QuotaForInvitee < 0) errors.QuotaForInvitee = t('Enter zero or more.')
      else if (values.QuotaForInvitee > 0 && !compliance.confirmed) errors.QuotaForInvitee = gateMessage

      if (values.TopUpLink.trim() !== '' && !isAbsoluteHttpUrl(values.TopUpLink.trim())) {
        errors.TopUpLink = t('Enter a full http:// or https:// address, or leave this empty.')
      }
      if (
        values['general_setting.docs_link'].trim() !== ''
        && !isAbsoluteHttpUrl(values['general_setting.docs_link'].trim())
      ) {
        errors['general_setting.docs_link'] = t(
          'Enter a full http:// or https:// address, or leave this empty.',
        )
      }

      if (values['quota_setting.trust_quota_usd'] < 0) {
        errors['quota_setting.trust_quota_usd'] = t('Enter zero or more.')
      }
      if (!(values['quota_setting.pre_consume_multiplier'] > 0)) {
        errors['quota_setting.pre_consume_multiplier'] = t('Enter a number greater than zero.')
      }

      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving

  const worth = (quota: number) =>
    t('Worth {{amount}} at the current quota divisor.', {
      amount: formatQuota(Number.isFinite(quota) ? quota : 0, quotaPerUnit),
    })

  return (
    <SettingsSection
      description={t('What a new account starts with, what is held back during a request, and what an invitation pays out.')}
      form={form}
      note={t('The balance and reward amounts are quota units. Their currency equivalents are calculated with this deployment’s own quota divisor, not a fixed one.')}
      saveMode="section"
      title={t('Quota settings')}
    >
      {compliance.confirmed ? null : (
        <Alert
          icon={<ShieldAlertIcon aria-hidden="true" />}
          title={t('Invitation rewards are locked')}
          tone="warning"
        >
          <p>
            {t('Until the payment compliance terms are accepted, the server refuses any invitation reward above zero and keeps every top-up gateway switched off. The two reward fields below stay editable so you can see what is configured, but a positive value cannot be saved yet.')}
          </p>
        </Alert>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <NumberInput
          description={worth(form.values.QuotaForNewUser)}
          disabled={disabled}
          error={form.errors.QuotaForNewUser}
          label={t('New account balance')}
          min={0}
          onValueChange={(value) => form.setField('QuotaForNewUser', value ?? Number.NaN)}
          step="any"
          value={form.values.QuotaForNewUser}
        />

        <NumberInput
          description={
            compliance.confirmed
              ? worth(form.values.QuotaForInviter)
              : t('Locked at zero until the compliance terms are accepted.')
          }
          disabled={disabled}
          error={form.errors.QuotaForInviter}
          label={t('Reward for the inviter')}
          min={0}
          onValueChange={(value) => form.setField('QuotaForInviter', value ?? Number.NaN)}
          step="any"
          value={form.values.QuotaForInviter}
        />

        <NumberInput
          description={
            compliance.confirmed
              ? worth(form.values.QuotaForInvitee)
              : t('Locked at zero until the compliance terms are accepted.')
          }
          disabled={disabled}
          error={form.errors.QuotaForInvitee}
          label={t('Reward for the invited account')}
          min={0}
          onValueChange={(value) => form.setField('QuotaForInvitee', value ?? Number.NaN)}
          step="any"
          value={form.values.QuotaForInvitee}
        />

        <Input
          description={t('Where the console sends a user who wants to add balance. Leave empty to use this deployment’s own top-up page.')}
          disabled={disabled}
          error={form.errors.TopUpLink}
          label={t('Top-up link')}
          onChange={(event) => form.setField('TopUpLink', event.target.value)}
          placeholder="https://example.com/topup"
          value={form.values.TopUpLink}
        />

        <Input
          description={t('Linked from the console header and the API onboarding panels.')}
          disabled={disabled}
          error={form.errors['general_setting.docs_link']}
          label={t('Documentation link')}
          onChange={(event) => form.setField('general_setting.docs_link', event.target.value)}
          placeholder="https://docs.example.com"
          value={form.values['general_setting.docs_link']}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <NumberInput
          description={t('Skip pre-consumption when the wallet balance and limited API key balance both exceed this amount. Set to 0 to always pre-consume. Subscriptions and asynchronous tasks always reserve quota.')}
          disabled={disabled}
          error={form.errors['quota_setting.trust_quota_usd']}
          label={t('Wallet pre-consume bypass threshold (USD)')}
          min={0}
          onValueChange={(value) => form.setField('quota_setting.trust_quota_usd', value ?? Number.NaN)}
          step="any"
          value={form.values['quota_setting.trust_quota_usd']}
        />

        <NumberInput
          description={t('Reserve the estimated input cost multiplied by this value, without estimating output tokens. Defaults to 1; positive decimals such as 0.5 and 1.5 are supported. Final charges use actual usage. Per-request and task prices are unaffected.')}
          disabled={disabled}
          error={form.errors['quota_setting.pre_consume_multiplier']}
          label={t('Input pre-consume multiplier')}
          min={0}
          onValueChange={(value) => form.setField('quota_setting.pre_consume_multiplier', value ?? Number.NaN)}
          step="any"
          value={form.values['quota_setting.pre_consume_multiplier']}
        />
      </div>

      <SwitchRow
        checked={form.values['quota_setting.enable_free_model_pre_consume']}
        description={t('Hold quota up front even for models priced at zero. Off means a free model never touches the balance, which also means a mispriced model bills nothing until it is corrected.')}
        disabled={disabled}
        label={t('Pre-consume quota for free models')}
        onCheckedChange={(checked) =>
          form.setField('quota_setting.enable_free_model_pre_consume', checked)}
      />
    </SettingsSection>
  )
}
