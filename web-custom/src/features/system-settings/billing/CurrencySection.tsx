import { useQuery } from '@tanstack/react-query'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useTranslation } from 'react-i18next'

import { Input, NativeSelect, NumberInput, SwitchRow } from '@/components/form'
import { Alert } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import { formatCurrency, formatNumber, quotaToCurrency } from '@/lib/format'

/**
 * `/system-settings/billing/currency`
 *
 * Seven keys, all confirmed present in `GET /api/option/`:
 *
 *   QuotaPerUnit                                '500000'
 *   USDExchangeRate                             '7.3'
 *   DisplayInCurrencyEnabled                    'true'
 *   DisplayTokenStatEnabled                     'true'
 *   general_setting.quota_display_type          'USD'
 *   general_setting.custom_currency_symbol      '¤'
 *   general_setting.custom_currency_exchange_rate '1'
 *
 * WHY `QuotaPerUnit` IS GUARDED THE WAY IT IS.
 * It is the divisor every money figure in this console is produced with — balances,
 * log costs, token prices, top-up quotes, the pricing table. Changing it does not move
 * any money: it changes what every existing number MEANS. A balance of 100,000 quota
 * reads as $0.20 at 500000 and as $1.00 at 100000, with nothing having been credited.
 *
 * And the server will not stop a bad one. `model/option.go`:
 *
 *   case "QuotaPerUnit":
 *       common.QuotaPerUnit, _ = strconv.ParseFloat(value, 64)
 *
 * The parse error is DISCARDED. Verified live: `PUT {"key":"QuotaPerUnit","value":"abc"}`
 * answers `success:true`, and so does `"0"` — either one leaves the divisor at zero and
 * every currency figure in the deployment divides by zero. This form therefore refuses a
 * non-positive or non-numeric divisor itself, and shows the repricing that a legal change
 * would cause before it is saved.
 *
 * WHAT THE DISPLAY KEYS DO — stated honestly. `general_setting.quota_display_type`,
 * `custom_currency_symbol`, `custom_currency_exchange_rate` and `DisplayInCurrencyEnabled`
 * are served on `/api/status` and drive the previous console and the public pricing page.
 * This console formats every amount in USD and does not read them yet, so changing them
 * here will not change what you see on these pages. Saying otherwise would be a lie.
 */

const DISPLAY_TYPES = ['USD', 'CNY', 'CUSTOM', 'TOKENS'] as const
type DisplayType = (typeof DISPLAY_TYPES)[number]

function readDisplayType(options: SystemOptionMap | undefined): DisplayType {
  const raw = readOptionString(options, 'general_setting.quota_display_type', 'USD')
  return (DISPLAY_TYPES as readonly string[]).includes(raw) ? (raw as DisplayType) : 'USD'
}

/** A round number an operator can hold in their head while reading the preview. */
const PREVIEW_QUOTA = 100_000

type CurrencyDraft = {
  QuotaPerUnit: number
  USDExchangeRate: number
  DisplayInCurrencyEnabled: boolean
  DisplayTokenStatEnabled: boolean
  'general_setting.quota_display_type': string
  'general_setting.custom_currency_symbol': string
  'general_setting.custom_currency_exchange_rate': number
}

function toDraft(options: SystemOptionMap | undefined): CurrencyDraft {
  return {
    DisplayInCurrencyEnabled: readOptionBoolean(options, 'DisplayInCurrencyEnabled', true),
    DisplayTokenStatEnabled: readOptionBoolean(options, 'DisplayTokenStatEnabled', true),
    'general_setting.custom_currency_exchange_rate': readOptionNumber(
      options,
      'general_setting.custom_currency_exchange_rate',
      1,
    ),
    'general_setting.custom_currency_symbol': readOptionString(
      options,
      'general_setting.custom_currency_symbol',
      '¤',
    ),
    'general_setting.quota_display_type': readDisplayType(options),
    QuotaPerUnit: readOptionNumber(options, 'QuotaPerUnit', 500_000),
    USDExchangeRate: readOptionNumber(options, 'USDExchangeRate', 1),
  }
}

export function CurrencySection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const saved = toDraft(optionsQuery.data)

  const form = useOptionSectionForm<CurrencyDraft>({
    saved,
    serialize: {
      'general_setting.custom_currency_symbol': (value) => String(value).trim(),
    },
    validate: (values) => {
      const errors: Partial<Record<keyof CurrencyDraft, string>> = {}

      if (!(values.QuotaPerUnit > 0)) {
        errors.QuotaPerUnit = t('The divisor must be greater than zero. The server accepts zero without complaint and every currency figure then divides by it.')
      }
      if (!(values.USDExchangeRate > 0)) {
        errors.USDExchangeRate = t('Enter a rate greater than zero.')
      }
      if (values['general_setting.quota_display_type'] === 'CUSTOM') {
        if (values['general_setting.custom_currency_symbol'].trim() === '') {
          errors['general_setting.custom_currency_symbol'] = t('A custom display needs a symbol.')
        }
        if (!(values['general_setting.custom_currency_exchange_rate'] > 0)) {
          errors['general_setting.custom_currency_exchange_rate'] = t('Enter a rate greater than zero.')
        }
      }

      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const displayType = form.values['general_setting.quota_display_type']
  const divisorDirty = form.isFieldDirty('QuotaPerUnit')
  const divisorValid = form.values.QuotaPerUnit > 0

  return (
    <SettingsSection
      description={t('The quota divisor every amount in this deployment is expressed with, and how balances are presented.')}
      form={form}
      note={t('The divisor is not a price. Changing it re-expresses balances that already exist; nobody is credited or charged by saving this page.')}
      saveMode="section"
      title={t('Currency and display')}
    >
      {divisorDirty ? (
        <Alert
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('This reprices every figure in the console')}
          tone="destructive"
        >
          <p>
            {t('A balance of {{quota}} quota reads as {{before}} today. Saving this divisor makes the same balance read as {{after}} — no quota is added or removed.', {
              after: divisorValid
                ? formatCurrency(quotaToCurrency(PREVIEW_QUOTA, form.values.QuotaPerUnit))
                : t('an error'),
              before: formatCurrency(quotaToCurrency(PREVIEW_QUOTA, saved.QuotaPerUnit)),
              quota: formatNumber(PREVIEW_QUOTA),
            })}
          </p>
          <p className="mt-2">
            {t('Balances, request-log costs, model prices and top-up quotes all move together. Change it only on a deployment that has not sold anything yet, or alongside a matching migration of stored quota.')}
          </p>
        </Alert>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <NumberInput
          description={t('Quota units per one unit of currency. The stock value is 500000. Currently {{quota}} quota reads as {{amount}}.', {
            amount: formatCurrency(quotaToCurrency(PREVIEW_QUOTA, saved.QuotaPerUnit)),
            quota: formatNumber(PREVIEW_QUOTA),
          })}
          disabled={disabled}
          error={form.errors.QuotaPerUnit}
          label={t('Quota divisor')}
          min={1}
          onValueChange={(value) => form.setField('QuotaPerUnit', value ?? Number.NaN)}
          step="any"
          value={form.values.QuotaPerUnit}
        />

        <NumberInput
          description={t('How many units of local currency one US dollar is worth. Used to convert prices for the payment gateways and the legacy console’s CNY display.')}
          disabled={disabled}
          error={form.errors.USDExchangeRate}
          label={t('Local currency per US dollar')}
          min={0}
          onValueChange={(value) => form.setField('USDExchangeRate', value ?? Number.NaN)}
          step="any"
          value={form.values.USDExchangeRate}
        />

        <NativeSelect
          description={t('Served on /api/status and applied by the previous console and the public pricing page. This console always formats in US dollars and does not read this key yet.')}
          disabled={disabled}
          label={t('Balance display')}
          onChange={(event) =>
            form.setField('general_setting.quota_display_type', event.target.value)}
          options={[
            { label: t('US dollars'), value: 'USD' },
            { label: t('Chinese yuan'), value: 'CNY' },
            { label: t('A custom currency'), value: 'CUSTOM' },
            { label: t('Raw quota units'), value: 'TOKENS' },
          ]}
          value={displayType}
        />

        {displayType === 'CUSTOM' ? (
          <>
            <Input
              description={t('Prefixed to every amount, for example ¥ or HK$.')}
              disabled={disabled}
              error={form.errors['general_setting.custom_currency_symbol']}
              label={t('Custom currency symbol')}
              maxLength={8}
              onChange={(event) =>
                form.setField('general_setting.custom_currency_symbol', event.target.value)}
              value={form.values['general_setting.custom_currency_symbol']}
            />
            <NumberInput
              description={t('Units of the custom currency one US dollar buys.')}
              disabled={disabled}
              error={form.errors['general_setting.custom_currency_exchange_rate']}
              label={t('Custom units per US dollar')}
              min={0}
              onValueChange={(value) =>
                form.setField('general_setting.custom_currency_exchange_rate', value ?? Number.NaN)}
              step="any"
              value={form.values['general_setting.custom_currency_exchange_rate']}
            />
          </>
        ) : null}
      </div>

      <SwitchRow
        checked={form.values.DisplayInCurrencyEnabled}
        description={t('Off shows raw quota units instead of an amount. Read from /api/status by the previous console; this console always shows an amount.')}
        disabled={disabled}
        label={t('Show balances as money')}
        onCheckedChange={(checked) => form.setField('DisplayInCurrencyEnabled', checked)}
      />

      <SwitchRow
        checked={form.values.DisplayTokenStatEnabled}
        description={t('Adds token counts alongside costs in the usage views.')}
        disabled={disabled}
        label={t('Show token statistics')}
        onCheckedChange={(checked) => form.setField('DisplayTokenStatEnabled', checked)}
      />
    </SettingsSection>
  )
}
