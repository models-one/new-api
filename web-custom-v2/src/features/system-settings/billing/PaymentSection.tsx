import { useQuery } from '@tanstack/react-query'
import CircleCheckIcon from 'lucide-react/dist/esm/icons/circle-check'
import CircleSlashIcon from 'lucide-react/dist/esm/icons/circle-slash'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NumberInput, SwitchRow, Textarea } from '@/components/form'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Tabs } from '@/components/disclosure'
import { Alert, Badge, Button, Panel } from '@/components/ui'
import { SaveBlockedNotice } from '@/features/system-settings/billing/components/SaveBlockedNotice'
import { SecretField } from '@/features/system-settings/billing/components/SecretField'
import {
  readPaymentCompliance,
  useConfirmPaymentCompliance,
  CURRENT_COMPLIANCE_TERMS_VERSION,
} from '@/features/system-settings/billing/compliance'
import { checkJsonShape } from '@/features/system-settings/billing/option-json'
import {
  checkAmountDiscount,
  checkAmountOptions,
  checkPayMethods,
  parsePayMethods,
  PROVIDER_PAY_METHOD_TYPES,
} from '@/features/system-settings/billing/pay-methods'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  systemOptionsQuery,
  useSystemOptionMutation,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import { topUpInfoQuery, type TopUpInfo } from '@/lib/api/topup'

/**
 * `/system-settings/billing/payment` — the seven gateway tabs.
 *
 * FORTY-ONE KEYS, split into three kinds, every one verified against the live server:
 *
 *   READ AND WRITTEN — present in `GET /api/option/`:
 *     PayAddress EpayId Price MinTopUp CustomCallbackAddress PayMethods
 *     payment_setting.amount_options payment_setting.amount_discount
 *     StripePriceId StripeUnitPrice StripeMinTopUp StripePromotionCodesEnabled
 *     NowPaymentsUnitPrice NowPaymentsMinTopUp NowPaymentsFeePaidByUser
 *     CreemTestMode CreemProducts
 *     WaffoEnabled WaffoSandbox WaffoMerchantId WaffoCurrency WaffoUnitPrice
 *     WaffoMinTopUp WaffoNotifyUrl WaffoReturnUrl WaffoSubscriptionReturnUrl
 *     WaffoPublicCert WaffoSandboxPublicCert WaffoPayMethods
 *     WaffoPancakeMerchantID WaffoPancakeReturnURL WaffoPancakeStoreID
 *     WaffoPancakeProductID WaffoPancakeUnitPrice WaffoPancakeMinTopUp
 *
 *   WRITE-ONLY — stripped from the read payload by `controller.GetOptions` because the key
 *   name ends in Key/Secret, so they are ABSENT rather than masked:
 *     EpayKey StripeApiSecret StripeWebhookSecret NowPaymentsAPIKey NowPaymentsIPNSecret
 *     CreemApiKey CreemWebhookSecret WaffoApiKey WaffoPrivateKey WaffoSandboxApiKey
 *     WaffoSandboxPrivateKey WaffoPancakePrivateKey
 *
 *   READ-ONLY — refused by `PUT /api/option/` outright:
 *     payment_setting.compliance_* (five keys)
 *
 * WHY READINESS IS READ FROM THE SERVER RATHER THAN COMPUTED HERE. Whether a gateway can
 * take money depends on credentials this page is not allowed to read back, so no honest
 * "configured" badge can be derived from the form. `GET /api/user/topup/info` answers the
 * question authoritatively — its `enable_*_topup` flags are exactly the predicates in
 * `controller/payment_webhook_availability.go` — so that is what is shown.
 *
 * EVERY NUMBER IS PARSED WITH THE ERROR DISCARDED SERVER-SIDE. `model/option.go` reads the
 * *MinTopUp keys with `strconv.Atoi` and the *UnitPrice keys with `strconv.ParseFloat`,
 * assigning the zero value when the parse fails and reporting success either way. A
 * fractional minimum silently becomes a minimum of zero. The integer checks below are the
 * only place that is caught.
 */

const SECRET_KEYS = [
  'EpayKey',
  'StripeApiSecret',
  'StripeWebhookSecret',
  'NowPaymentsAPIKey',
  'NowPaymentsIPNSecret',
  'CreemApiKey',
  'CreemWebhookSecret',
  'WaffoApiKey',
  'WaffoPrivateKey',
  'WaffoSandboxApiKey',
  'WaffoSandboxPrivateKey',
  'WaffoPancakePrivateKey',
] as const

type SecretKey = (typeof SECRET_KEYS)[number]

type PaymentDraft = Record<SecretKey, string> & {
  PayAddress: string
  EpayId: string
  Price: number
  MinTopUp: number
  CustomCallbackAddress: string
  PayMethods: string
  'payment_setting.amount_options': string
  'payment_setting.amount_discount': string
  StripePriceId: string
  StripeUnitPrice: number
  StripeMinTopUp: number
  StripePromotionCodesEnabled: boolean
  NowPaymentsUnitPrice: number
  NowPaymentsMinTopUp: number
  NowPaymentsFeePaidByUser: boolean
  CreemTestMode: boolean
  CreemProducts: string
  WaffoEnabled: boolean
  WaffoSandbox: boolean
  WaffoMerchantId: string
  WaffoCurrency: string
  WaffoUnitPrice: number
  WaffoMinTopUp: number
  WaffoNotifyUrl: string
  WaffoReturnUrl: string
  WaffoSubscriptionReturnUrl: string
  WaffoPublicCert: string
  WaffoSandboxPublicCert: string
  WaffoPayMethods: string
  WaffoPancakeMerchantID: string
  WaffoPancakeReturnURL: string
  WaffoPancakeStoreID: string
  WaffoPancakeProductID: string
  WaffoPancakeUnitPrice: number
  WaffoPancakeMinTopUp: number
}

/**
 * The write-only credentials, all empty.
 *
 * Built from the `SECRET_KEYS` tuple rather than written out again, so a credential can
 * never be listed in one place and forgotten in the other. This is the ONLY assertion in
 * `toDraft`: the rest of the draft is a plain literal precisely so that TypeScript
 * reports a key that the draft type declares and `toDraft` forgets to read. It did not,
 * once — `WaffoUnitPrice` was declared, validated and bound to an input while `toDraft`
 * never read it, so the field showed blank instead of the stored price.
 */
function emptySecrets(): Record<SecretKey, string> {
  const secrets = {} as Record<SecretKey, string>
  for (const key of SECRET_KEYS) secrets[key] = ''
  return secrets
}

function toDraft(options: SystemOptionMap | undefined): PaymentDraft {
  return {
    // Write-only credentials are never in the payload, so their baseline is always empty.
    // That is what makes "untouched" mean "leave the stored value alone".
    ...emptySecrets(),
    CreemProducts: readOptionString(options, 'CreemProducts', '[]'),
    CreemTestMode: readOptionBoolean(options, 'CreemTestMode', false),
    CustomCallbackAddress: readOptionString(options, 'CustomCallbackAddress'),
    EpayId: readOptionString(options, 'EpayId'),
    MinTopUp: readOptionNumber(options, 'MinTopUp', 1),
    NowPaymentsFeePaidByUser: readOptionBoolean(options, 'NowPaymentsFeePaidByUser', false),
    NowPaymentsMinTopUp: readOptionNumber(options, 'NowPaymentsMinTopUp', 1),
    NowPaymentsUnitPrice: readOptionNumber(options, 'NowPaymentsUnitPrice', 1),
    PayAddress: readOptionString(options, 'PayAddress'),
    'payment_setting.amount_discount': readOptionString(
      options,
      'payment_setting.amount_discount',
      '{}',
    ),
    'payment_setting.amount_options': readOptionString(
      options,
      'payment_setting.amount_options',
      '[]',
    ),
    PayMethods: readOptionString(options, 'PayMethods', '[]'),
    Price: readOptionNumber(options, 'Price', 1),
    StripeMinTopUp: readOptionNumber(options, 'StripeMinTopUp', 1),
    StripePriceId: readOptionString(options, 'StripePriceId'),
    StripePromotionCodesEnabled: readOptionBoolean(options, 'StripePromotionCodesEnabled', false),
    StripeUnitPrice: readOptionNumber(options, 'StripeUnitPrice', 1),
    WaffoCurrency: readOptionString(options, 'WaffoCurrency', 'USD'),
    WaffoEnabled: readOptionBoolean(options, 'WaffoEnabled', false),
    WaffoMerchantId: readOptionString(options, 'WaffoMerchantId'),
    WaffoMinTopUp: readOptionNumber(options, 'WaffoMinTopUp', 1),
    WaffoNotifyUrl: readOptionString(options, 'WaffoNotifyUrl'),
    WaffoPancakeMerchantID: readOptionString(options, 'WaffoPancakeMerchantID'),
    WaffoPancakeMinTopUp: readOptionNumber(options, 'WaffoPancakeMinTopUp', 1),
    WaffoPancakeProductID: readOptionString(options, 'WaffoPancakeProductID'),
    WaffoPancakeReturnURL: readOptionString(options, 'WaffoPancakeReturnURL'),
    WaffoPancakeStoreID: readOptionString(options, 'WaffoPancakeStoreID'),
    WaffoPancakeUnitPrice: readOptionNumber(options, 'WaffoPancakeUnitPrice', 1),
    WaffoPayMethods: readOptionString(options, 'WaffoPayMethods', '[]'),
    WaffoPublicCert: readOptionString(options, 'WaffoPublicCert'),
    WaffoReturnUrl: readOptionString(options, 'WaffoReturnUrl'),
    WaffoSandbox: readOptionBoolean(options, 'WaffoSandbox', false),
    WaffoSandboxPublicCert: readOptionString(options, 'WaffoSandboxPublicCert'),
    WaffoSubscriptionReturnUrl: readOptionString(options, 'WaffoSubscriptionReturnUrl'),
    WaffoUnitPrice: readOptionNumber(options, 'WaffoUnitPrice', 1),
  }
}

function trimmed(value: string | number | boolean): string {
  return String(value).trim()
}

function withoutTrailingSlash(value: string | number | boolean): string {
  return String(value).trim().replace(/\/+$/, '')
}

const serializePayment: Partial<Record<keyof PaymentDraft, (value: string | number | boolean) => string>> = {
  CustomCallbackAddress: withoutTrailingSlash,
  EpayId: trimmed,
  PayAddress: withoutTrailingSlash,
  StripePriceId: trimmed,
  WaffoMerchantId: trimmed,
  WaffoNotifyUrl: trimmed,
  WaffoPancakeMerchantID: trimmed,
  WaffoPancakeProductID: trimmed,
  WaffoPancakeReturnURL: withoutTrailingSlash,
  WaffoPancakeStoreID: trimmed,
  WaffoReturnUrl: trimmed,
  WaffoSubscriptionReturnUrl: trimmed,
}

function isHttpUrl(value: string): boolean {
  const candidate = value.trim()
  if (candidate === '') return true
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** The seven tab ids, which are also what `Tabs` is controlled by. */
type PaymentTabId = 'general' | 'epay' | 'stripe' | 'nowpayments' | 'creem' | 'waffo-pancake' | 'waffo'

/**
 * Where each validated field lives.
 *
 * `Tabs.Panel` unmounts the panel that is not showing, so a blocked save can be caused by
 * a field that is not rendered at all. This map is what lets `SaveBlockedNotice` name the
 * tab and switch to it. Only keys that have a validator need an entry; a key without one
 * can never block a save.
 */
const FIELD_LOCATIONS: Partial<Record<keyof PaymentDraft, { tab: PaymentTabId; label: string }>> = {
  CreemProducts: { label: 'Creem products', tab: 'creem' },
  CustomCallbackAddress: { label: 'Callback address', tab: 'epay' },
  MinTopUp: { label: 'Minimum top-up', tab: 'general' },
  NowPaymentsMinTopUp: { label: 'NOWPayments minimum top-up', tab: 'nowpayments' },
  NowPaymentsUnitPrice: { label: 'NOWPayments unit price', tab: 'nowpayments' },
  PayAddress: { label: 'Epay address', tab: 'epay' },
  'payment_setting.amount_discount': { label: 'Amount discounts', tab: 'general' },
  'payment_setting.amount_options': { label: 'Top-up amounts', tab: 'general' },
  PayMethods: { label: 'Payment methods', tab: 'general' },
  Price: { label: 'Price per unit of balance', tab: 'general' },
  StripeMinTopUp: { label: 'Stripe minimum top-up', tab: 'stripe' },
  StripeUnitPrice: { label: 'Stripe unit price', tab: 'stripe' },
  WaffoMinTopUp: { label: 'Waffo minimum top-up', tab: 'waffo' },
  WaffoNotifyUrl: { label: 'Waffo notification address', tab: 'waffo' },
  WaffoPancakeMinTopUp: { label: 'Pancake minimum top-up', tab: 'waffo-pancake' },
  WaffoPancakeReturnURL: { label: 'Pancake return address', tab: 'waffo-pancake' },
  WaffoPancakeUnitPrice: { label: 'Pancake unit price', tab: 'waffo-pancake' },
  WaffoPayMethods: { label: 'Waffo payment methods', tab: 'waffo' },
  WaffoReturnUrl: { label: 'Waffo return address', tab: 'waffo' },
  WaffoSubscriptionReturnUrl: { label: 'Waffo subscription return address', tab: 'waffo' },
  WaffoUnitPrice: { label: 'Waffo unit price', tab: 'waffo' },
}

function isPaymentTabId(value: string): value is PaymentTabId {
  return Object.hasOwn(TAB_NAMES, value)
}

/** Brand names are not translated; only 'General' is an English source string. */
const TAB_NAMES: Record<PaymentTabId, string> = {
  creem: 'Creem',
  epay: 'Epay',
  general: 'General',
  nowpayments: 'NOWPayments',
  stripe: 'Stripe',
  waffo: 'Waffo',
  'waffo-pancake': 'Waffo Pancake',
}

type GatewayStatus = { id: string; label: string; ready: boolean }

function gatewayStatuses(info: TopUpInfo | undefined): GatewayStatus[] {
  if (info === undefined) return []
  return [
    { id: 'epay', label: 'Epay', ready: info.enable_online_topup },
    { id: 'stripe', label: 'Stripe', ready: info.enable_stripe_topup },
    { id: 'nowpayments', label: 'NOWPayments', ready: info.enable_nowpayments_topup },
    { id: 'creem', label: 'Creem', ready: info.enable_creem_topup },
    { id: 'waffo-pancake', label: 'Waffo Pancake', ready: info.enable_waffo_pancake_topup },
    { id: 'waffo', label: 'Waffo', ready: info.enable_waffo_topup },
  ]
}

export function PaymentSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())
  const topUpQuery = useQuery(topUpInfoQuery())
  const compliance = readPaymentCompliance(optionsQuery.data)
  const confirmCompliance = useConfirmPaymentCompliance()
  const clearSecret = useSystemOptionMutation()

  const [complianceOpen, setComplianceOpen] = useState(false)
  const [tab, setTab] = useState<PaymentTabId>('general')
  const [pendingClear, setPendingClear] = useState<{ key: SecretKey; label: string } | undefined>(
    undefined,
  )

  const form = useOptionSectionForm<PaymentDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializePayment,
    validate: (values) => {
      const errors: Partial<Record<keyof PaymentDraft, string>> = {}
      const notAnInteger = t('This must be a whole number. The server stores a fractional value as zero without saying so.')
      const notPositive = t('Enter a value above zero.')
      const badUrl = t('Enter a full http:// or https:// address, or leave this empty.')

      const integerFields = [
        'MinTopUp',
        'StripeMinTopUp',
        'NowPaymentsMinTopUp',
        'WaffoMinTopUp',
        'WaffoPancakeMinTopUp',
      ] as const
      for (const key of integerFields) {
        if (!Number.isInteger(values[key]) || values[key] < 0) errors[key] = notAnInteger
      }

      const positiveFields = [
        'Price',
        'StripeUnitPrice',
        'NowPaymentsUnitPrice',
        'WaffoUnitPrice',
        'WaffoPancakeUnitPrice',
      ] as const
      for (const key of positiveFields) {
        if (!(values[key] > 0)) errors[key] = notPositive
      }

      for (const key of ['PayAddress', 'CustomCallbackAddress', 'WaffoNotifyUrl', 'WaffoReturnUrl', 'WaffoSubscriptionReturnUrl', 'WaffoPancakeReturnURL'] as const) {
        if (!isHttpUrl(values[key])) errors[key] = badUrl
      }

      const payMethods = checkPayMethods(values.PayMethods)
      if (payMethods !== undefined) errors.PayMethods = payMethodMessage(payMethods, t)

      const amountOptions = checkAmountOptions(values['payment_setting.amount_options'])
      if (amountOptions !== undefined) {
        errors['payment_setting.amount_options'] = amountOptionsMessage(amountOptions, t)
      }

      const discount = checkAmountDiscount(values['payment_setting.amount_discount'])
      if (discount !== undefined) {
        errors['payment_setting.amount_discount'] = amountDiscountMessage(discount, t)
      }

      const creem = checkJsonShape(values.CreemProducts, 'array')
      if (creem !== undefined) {
        errors.CreemProducts = creem === 'syntax'
          ? t('This is not valid JSON.')
          : t('This must be a JSON array.')
      }

      const waffoMethods = checkJsonShape(values.WaffoPayMethods, 'array')
      if (waffoMethods !== undefined) {
        errors.WaffoPayMethods = waffoMethods === 'syntax'
          ? t('This is not valid JSON.')
          : t('This must be a JSON array.')
      }

      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const statuses = gatewayStatuses(topUpQuery.data)
  const methods = parsePayMethods(form.values.PayMethods)

  const clearStoredSecret = async () => {
    if (pendingClear === undefined) return
    try {
      await clearSecret.mutateAsync({ key: pendingClear.key, value: '' })
      toast.success(t('Stored credential cleared'))
      setPendingClear(undefined)
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  /** "Stripe · Stripe unit price", or the bare option key if the map has no entry. */
  const locateField = (key: string): string => {
    const location = FIELD_LOCATIONS[key as keyof PaymentDraft]
    if (location === undefined) return key
    const tabName = location.tab === 'general' ? t('General') : TAB_NAMES[location.tab]
    return `${tabName} · ${t(location.label)}`
  }

  const revealField = (key: string) => {
    const location = FIELD_LOCATIONS[key as keyof PaymentDraft]
    if (location !== undefined) setTab(location.tab)
  }

  const secretProps = (key: SecretKey, label: string) => ({
    clearLabel: t('Clear the stored {{credential}}', { credential: label }),
    disabled,
    label,
    onChange: (value: string) => form.setField(key, value),
    onClear: () => setPendingClear({ key, label }),
    value: form.values[key],
  })

  return (
    <div className="flex flex-col gap-6">
      <Panel as="section">
        <Panel.Header
          description={t('Payment, redemption codes and invitation rewards stay switched off until these terms are accepted.')}
          title={t('Compliance')}
        />
        <Panel.Body className="flex flex-col gap-4">
          {compliance.confirmed ? (
            <Alert
              icon={<CircleCheckIcon aria-hidden="true" />}
              title={t('Accepted')}
              tone="success"
            >
              <p>
                {t('Terms version {{version}}, accepted by account {{account}} from {{ip}}.', {
                  account: compliance.confirmedBy,
                  ip: compliance.confirmedIp === '' ? t('an unrecorded address') : compliance.confirmedIp,
                  version: compliance.termsVersion,
                })}
              </p>
              <p className="mt-2">
                {t('These five keys are an audit record, not a setting: the server refuses to change them through the settings endpoint at all.')}
              </p>
            </Alert>
          ) : (
            <Alert
              icon={<ShieldAlertIcon aria-hidden="true" />}
              title={
                compliance.flagged
                  ? t('Accepted terms are out of date')
                  : t('Terms have not been accepted')
              }
              tone="warning"
            >
              <p>
                {compliance.flagged
                  ? t('Version {{stored}} was accepted, but the server now requires {{current}}. Every gateway stays off until the current terms are accepted.', {
                      current: CURRENT_COMPLIANCE_TERMS_VERSION,
                      stored: compliance.termsVersion === '' ? t('none') : compliance.termsVersion,
                    })
                  : t('Credentials can be saved now, but no gateway will take money and no invitation reward above zero can be set.')}
              </p>
            </Alert>
          )}
        </Panel.Body>
        {compliance.confirmed ? null : (
          <Panel.Footer align="end">
            <Button
              aria-busy={confirmCompliance.isPending}
              disabled={confirmCompliance.isPending || optionsQuery.isPending}
              onClick={() => setComplianceOpen(true)}
            >
              {t('Review and accept the terms')}
            </Button>
          </Panel.Footer>
        )}
      </Panel>

      <Panel as="section">
        <Panel.Header
          description={t('Read from the same endpoint the top-up page uses, so this is what a user would actually be offered.')}
          title={t('Gateway readiness')}
        />
        <Panel.Body>
          {topUpQuery.isPending ? (
            <p className="text-sm text-muted" role="status">{t('Checking which gateways are live…')}</p>
          ) : null}

          {!topUpQuery.isPending && topUpQuery.isError ? (
            <Alert tone="destructive">
              <p>{t('The readiness check could not be loaded: {{message}}', { message: toErrorMessage(topUpQuery.error) })}</p>
              <p className="mt-2">
                <Button
                  aria-busy={topUpQuery.isFetching}
                  disabled={topUpQuery.isFetching}
                  onClick={() => void topUpQuery.refetch()}
                  size="sm"
                  variant="outline"
                >
                  {t('Try again')}
                </Button>
              </p>
            </Alert>
          ) : null}

          {!topUpQuery.isPending && !topUpQuery.isError ? (
            <ul className="flex flex-wrap gap-2">
              {statuses.map((status) => (
                <li key={status.id}>
                  <Badge tone={status.ready ? 'success' : 'muted'}>
                    {status.ready ? (
                      <CircleCheckIcon aria-hidden="true" className="size-3" />
                    ) : (
                      <CircleSlashIcon aria-hidden="true" className="size-3" />
                    )}
                    {status.ready
                      ? t('{{gateway}} is live', { gateway: status.label })
                      : t('{{gateway}} is off', { gateway: status.label })}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel.Body>
      </Panel>

      <SettingsSection
        description={t('Credentials, prices and callbacks for each of the six gateways, plus the shared amounts every one of them uses.')}
        form={form}
        note={t('Credentials are write-only: the server strips them from the settings payload, so the boxes stay empty and typing into one replaces what is stored. Saving writes only the fields you changed.')}
        saveMode="section"
        title={t('Payment gateway')}
      >
        <SaveBlockedNotice
          dirtyKeys={form.dirtyKeys}
          errors={form.errors}
          locate={locateField}
          onReveal={revealField}
          revealLabel={(location) => t('Open {{location}}', { location })}
        />

        <Tabs
          onValueChange={(value) => {
            if (isPaymentTabId(value)) setTab(value)
          }}
          value={tab}
        >
          <Tabs.List label={t('Payment gateways')}>
            <Tabs.Tab value="general">{t('General')}</Tabs.Tab>
            <Tabs.Tab value="epay">Epay</Tabs.Tab>
            <Tabs.Tab value="stripe">Stripe</Tabs.Tab>
            <Tabs.Tab value="nowpayments">NOWPayments</Tabs.Tab>
            <Tabs.Tab value="creem">Creem</Tabs.Tab>
            <Tabs.Tab value="waffo-pancake">Waffo Pancake</Tabs.Tab>
            <Tabs.Tab value="waffo">Waffo</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel className="pt-5" value="general">
            <div className="flex flex-col gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <NumberInput
                  description={t('What one unit of balance costs in local currency, through Epay.')}
                  disabled={disabled}
                  error={form.errors.Price}
                  label={t('Price per unit of balance')}
                  min={0}
                  onValueChange={(value) => form.setField('Price', value ?? Number.NaN)}
                  step="any"
                  value={form.values.Price}
                />
                <NumberInput
                  description={t('The smallest Epay top-up a user may make. Whole numbers only.')}
                  disabled={disabled}
                  error={form.errors.MinTopUp}
                  label={t('Minimum top-up')}
                  min={0}
                  onValueChange={(value) => form.setField('MinTopUp', value ?? Number.NaN)}
                  step={1}
                  value={form.values.MinTopUp}
                />
              </div>

              <Textarea
                description={t('The tiles on the top-up page, as a JSON array. Every value must be text — a numeric min_topup is refused and destroys the stored list on the way. The type routes the payment: stripe, nowpayments, waffo and waffo_pancake go to those providers, anything else goes to Epay.')}
                disabled={disabled}
                error={form.errors.PayMethods}
                label={t('Payment methods')}
                onChange={(event) => form.setField('PayMethods', event.target.value)}
                rows={6}
                textareaClassName="mono text-xs"
                value={form.values.PayMethods}
              />

              {methods.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {methods.map((method) => (
                    <li key={method.type}>
                      <Badge
                        tone={
                          (PROVIDER_PAY_METHOD_TYPES as readonly string[]).includes(method.type)
                            ? 'info'
                            : 'muted'
                        }
                      >
                        {method.name}
                        <span className="mono text-[0.6875rem] opacity-70">{method.type}</span>
                        {method.min_topup === undefined ? null : (
                          <span className="text-[0.6875rem] opacity-70">
                            {t('min {{amount}}', { amount: method.min_topup })}
                          </span>
                        )}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs leading-5 text-muted">
                  {t('No payment method is configured, so the top-up page has nothing to offer even when a gateway is live.')}
                </p>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <Textarea
                  description={t('The preset amounts on the top-up page, as a JSON array of whole numbers.')}
                  disabled={disabled}
                  error={form.errors['payment_setting.amount_options']}
                  label={t('Top-up amounts')}
                  onChange={(event) =>
                    form.setField('payment_setting.amount_options', event.target.value)}
                  rows={3}
                  textareaClassName="mono text-xs"
                  value={form.values['payment_setting.amount_options']}
                />
                <Textarea
                  description={t('Discounts by amount, as {"100": 0.9} for ten percent off a hundred. Leave as {} for none.')}
                  disabled={disabled}
                  error={form.errors['payment_setting.amount_discount']}
                  label={t('Amount discounts')}
                  onChange={(event) =>
                    form.setField('payment_setting.amount_discount', event.target.value)}
                  rows={3}
                  textareaClassName="mono text-xs"
                  value={form.values['payment_setting.amount_discount']}
                />
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel className="pt-5" value="epay">
            <div className="flex flex-col gap-5">
              <p className="text-xs leading-5 text-muted">
                {t('Epay goes live once the address, the merchant id and the merchant key are all set and at least one payment method exists.')}
              </p>
              <div className="grid gap-5 md:grid-cols-2">
                <Input
                  description={t('The Epay endpoint this deployment posts to. A trailing slash is removed when saved.')}
                  disabled={disabled}
                  error={form.errors.PayAddress}
                  label={t('Epay address')}
                  onChange={(event) => form.setField('PayAddress', event.target.value)}
                  placeholder="https://pay.example.com"
                  value={form.values.PayAddress}
                />
                <Input
                  description={t('The merchant id issued by the Epay provider.')}
                  disabled={disabled}
                  label={t('Merchant id')}
                  onChange={(event) => form.setField('EpayId', event.target.value)}
                  value={form.values.EpayId}
                />
                <SecretField {...secretProps('EpayKey', t('Merchant key'))} />
                <Input
                  description={t('Where the provider sends its callback. A top-level address only, with no path. Leave empty to use the server address.')}
                  disabled={disabled}
                  error={form.errors.CustomCallbackAddress}
                  label={t('Callback address')}
                  onChange={(event) => form.setField('CustomCallbackAddress', event.target.value)}
                  placeholder="https://api.example.com"
                  value={form.values.CustomCallbackAddress}
                />
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel className="pt-5" value="stripe">
            <div className="flex flex-col gap-5">
              <p className="text-xs leading-5 text-muted">
                {t('Stripe goes live once the API secret, the webhook secret and the price id are all set.')}
              </p>
              <div className="grid gap-5 md:grid-cols-2">
                <SecretField {...secretProps('StripeApiSecret', t('Stripe API secret'))} />
                <SecretField {...secretProps('StripeWebhookSecret', t('Stripe webhook secret'))} />
                <Input
                  description={t('The Stripe price object the checkout session is built from.')}
                  disabled={disabled}
                  inputClassName="mono"
                  label={t('Stripe price id')}
                  onChange={(event) => form.setField('StripePriceId', event.target.value)}
                  placeholder="price_..."
                  value={form.values.StripePriceId}
                />
                <NumberInput
                  description={t('What one unit of balance costs through Stripe.')}
                  disabled={disabled}
                  error={form.errors.StripeUnitPrice}
                  label={t('Stripe unit price')}
                  min={0}
                  onValueChange={(value) => form.setField('StripeUnitPrice', value ?? Number.NaN)}
                  step="any"
                  value={form.values.StripeUnitPrice}
                />
                <NumberInput
                  description={t('Whole numbers only.')}
                  disabled={disabled}
                  error={form.errors.StripeMinTopUp}
                  label={t('Stripe minimum top-up')}
                  min={0}
                  onValueChange={(value) => form.setField('StripeMinTopUp', value ?? Number.NaN)}
                  step={1}
                  value={form.values.StripeMinTopUp}
                />
              </div>
              <SwitchRow
                checked={form.values.StripePromotionCodesEnabled}
                description={t('Lets a user enter a Stripe promotion code during checkout.')}
                disabled={disabled}
                label={t('Accept Stripe promotion codes')}
                onCheckedChange={(checked) => form.setField('StripePromotionCodesEnabled', checked)}
              />
            </div>
          </Tabs.Panel>

          <Tabs.Panel className="pt-5" value="nowpayments">
            <div className="flex flex-col gap-5">
              <p className="text-xs leading-5 text-muted">
                {t('NOWPayments goes live once the API key and the IPN secret are set and the unit price is above zero.')}
              </p>
              <div className="grid gap-5 md:grid-cols-2">
                <SecretField {...secretProps('NowPaymentsAPIKey', t('NOWPayments API key'))} />
                <SecretField {...secretProps('NowPaymentsIPNSecret', t('NOWPayments IPN secret'))} />
                <NumberInput
                  description={t('What one unit of balance costs in crypto terms.')}
                  disabled={disabled}
                  error={form.errors.NowPaymentsUnitPrice}
                  label={t('NOWPayments unit price')}
                  min={0}
                  onValueChange={(value) =>
                    form.setField('NowPaymentsUnitPrice', value ?? Number.NaN)}
                  step="any"
                  value={form.values.NowPaymentsUnitPrice}
                />
                <NumberInput
                  description={t('Whole numbers only.')}
                  disabled={disabled}
                  error={form.errors.NowPaymentsMinTopUp}
                  label={t('NOWPayments minimum top-up')}
                  min={0}
                  onValueChange={(value) =>
                    form.setField('NowPaymentsMinTopUp', value ?? Number.NaN)}
                  step={1}
                  value={form.values.NowPaymentsMinTopUp}
                />
              </div>
              <SwitchRow
                checked={form.values.NowPaymentsFeePaidByUser}
                description={t('On, the network fee is added to what the user pays. Off, it comes out of the credited amount.')}
                disabled={disabled}
                label={t('The user pays the network fee')}
                onCheckedChange={(checked) => form.setField('NowPaymentsFeePaidByUser', checked)}
              />
            </div>
          </Tabs.Panel>

          <Tabs.Panel className="pt-5" value="creem">
            <div className="flex flex-col gap-5">
              <p className="text-xs leading-5 text-muted">
                {t('Creem goes live once the API key is set and at least one product is listed.')}
              </p>
              <div className="grid gap-5 md:grid-cols-2">
                <SecretField {...secretProps('CreemApiKey', t('Creem API key'))} />
                <SecretField {...secretProps('CreemWebhookSecret', t('Creem webhook secret'))} />
              </div>
              <Textarea
                description={t('The Creem products users may buy, as a JSON array.')}
                disabled={disabled}
                error={form.errors.CreemProducts}
                label={t('Creem products')}
                onChange={(event) => form.setField('CreemProducts', event.target.value)}
                rows={5}
                textareaClassName="mono text-xs"
                value={form.values.CreemProducts}
              />
              <SwitchRow
                checked={form.values.CreemTestMode}
                description={t('Sends checkout to Creem’s test environment. No real money moves.')}
                disabled={disabled}
                label={t('Creem test mode')}
                onCheckedChange={(checked) => form.setField('CreemTestMode', checked)}
              />
            </div>
          </Tabs.Panel>

          <Tabs.Panel className="pt-5" value="waffo-pancake">
            <div className="flex flex-col gap-5">
              <p className="text-xs leading-5 text-muted">
                {t('Waffo Pancake goes live once the merchant id, the private key and a product id are all set. The store and product are normally minted by the provider’s pairing flow, which this console does not run — paste the ids it produced.')}
              </p>
              <div className="grid gap-5 md:grid-cols-2">
                <Input
                  disabled={disabled}
                  inputClassName="mono"
                  label={t('Pancake merchant id')}
                  onChange={(event) => form.setField('WaffoPancakeMerchantID', event.target.value)}
                  value={form.values.WaffoPancakeMerchantID}
                />
                <SecretField {...secretProps('WaffoPancakePrivateKey', t('Pancake private key'))} />
                <Input
                  description={t('Identifies the store the checkout belongs to.')}
                  disabled={disabled}
                  inputClassName="mono"
                  label={t('Pancake store id')}
                  onChange={(event) => form.setField('WaffoPancakeStoreID', event.target.value)}
                  value={form.values.WaffoPancakeStoreID}
                />
                <Input
                  description={t('Identifies the one-time product the top-up is charged against.')}
                  disabled={disabled}
                  inputClassName="mono"
                  label={t('Pancake product id')}
                  onChange={(event) => form.setField('WaffoPancakeProductID', event.target.value)}
                  value={form.values.WaffoPancakeProductID}
                />
                <Input
                  description={t('Where the user lands after paying. A trailing slash is removed when saved.')}
                  disabled={disabled}
                  error={form.errors.WaffoPancakeReturnURL}
                  label={t('Pancake return address')}
                  onChange={(event) => form.setField('WaffoPancakeReturnURL', event.target.value)}
                  placeholder="https://example.com/wallet"
                  value={form.values.WaffoPancakeReturnURL}
                />
                <NumberInput
                  disabled={disabled}
                  error={form.errors.WaffoPancakeUnitPrice}
                  label={t('Pancake unit price')}
                  min={0}
                  onValueChange={(value) =>
                    form.setField('WaffoPancakeUnitPrice', value ?? Number.NaN)}
                  step="any"
                  value={form.values.WaffoPancakeUnitPrice}
                />
                <NumberInput
                  description={t('Whole numbers only.')}
                  disabled={disabled}
                  error={form.errors.WaffoPancakeMinTopUp}
                  label={t('Pancake minimum top-up')}
                  min={0}
                  onValueChange={(value) =>
                    form.setField('WaffoPancakeMinTopUp', value ?? Number.NaN)}
                  step={1}
                  value={form.values.WaffoPancakeMinTopUp}
                />
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel className="pt-5" value="waffo">
            <div className="flex flex-col gap-5">
              <p className="text-xs leading-5 text-muted">
                {t('Waffo goes live once it is switched on and the three credentials for the selected environment are set. Sandbox and production have separate credentials; only the selected set is checked.')}
              </p>

              <SwitchRow
                checked={form.values.WaffoEnabled}
                description={t('Off keeps Waffo out of the top-up page whatever the credentials say.')}
                disabled={disabled}
                label={t('Enable Waffo')}
                onCheckedChange={(checked) => form.setField('WaffoEnabled', checked)}
              />
              <SwitchRow
                checked={form.values.WaffoSandbox}
                description={t('On uses the sandbox credentials and the sandbox certificate below.')}
                disabled={disabled}
                label={t('Use the Waffo sandbox')}
                onCheckedChange={(checked) => form.setField('WaffoSandbox', checked)}
              />

              <div className="grid gap-5 md:grid-cols-2">
                <Input
                  disabled={disabled}
                  inputClassName="mono"
                  label={t('Waffo merchant id')}
                  onChange={(event) => form.setField('WaffoMerchantId', event.target.value)}
                  value={form.values.WaffoMerchantId}
                />
                <Input
                  description={t('The three-letter currency Waffo charges in, for example USD.')}
                  disabled={disabled}
                  label={t('Waffo currency')}
                  maxLength={8}
                  onChange={(event) => form.setField('WaffoCurrency', event.target.value)}
                  placeholder="USD"
                  value={form.values.WaffoCurrency}
                />
                <NumberInput
                  disabled={disabled}
                  error={form.errors.WaffoUnitPrice}
                  label={t('Waffo unit price')}
                  min={0}
                  onValueChange={(value) => form.setField('WaffoUnitPrice', value ?? Number.NaN)}
                  step="any"
                  value={form.values.WaffoUnitPrice}
                />
                <NumberInput
                  description={t('Whole numbers only.')}
                  disabled={disabled}
                  error={form.errors.WaffoMinTopUp}
                  label={t('Waffo minimum top-up')}
                  min={0}
                  onValueChange={(value) => form.setField('WaffoMinTopUp', value ?? Number.NaN)}
                  step={1}
                  value={form.values.WaffoMinTopUp}
                />
                <Input
                  description={t('Where Waffo posts payment notifications.')}
                  disabled={disabled}
                  error={form.errors.WaffoNotifyUrl}
                  label={t('Waffo notification address')}
                  onChange={(event) => form.setField('WaffoNotifyUrl', event.target.value)}
                  placeholder="https://api.example.com/api/waffo/notify"
                  value={form.values.WaffoNotifyUrl}
                />
                <Input
                  description={t('Where the user lands after a top-up.')}
                  disabled={disabled}
                  error={form.errors.WaffoReturnUrl}
                  label={t('Waffo return address')}
                  onChange={(event) => form.setField('WaffoReturnUrl', event.target.value)}
                  placeholder="https://example.com/wallet"
                  value={form.values.WaffoReturnUrl}
                />
                <Input
                  description={t('Where the user lands after buying a subscription plan through Waffo.')}
                  disabled={disabled}
                  error={form.errors.WaffoSubscriptionReturnUrl}
                  label={t('Waffo subscription return address')}
                  onChange={(event) =>
                    form.setField('WaffoSubscriptionReturnUrl', event.target.value)}
                  placeholder="https://example.com/subscriptions"
                  value={form.values.WaffoSubscriptionReturnUrl}
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <SecretField {...secretProps('WaffoApiKey', t('Waffo API key'))} />
                <SecretField {...secretProps('WaffoPrivateKey', t('Waffo private key'))} />
                <SecretField {...secretProps('WaffoSandboxApiKey', t('Waffo sandbox API key'))} />
                <SecretField
                  {...secretProps('WaffoSandboxPrivateKey', t('Waffo sandbox private key'))}
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <Textarea
                  description={t('Waffo’s public certificate for verifying production callbacks. Not a secret — the server returns it.')}
                  disabled={disabled}
                  label={t('Waffo public certificate')}
                  onChange={(event) => form.setField('WaffoPublicCert', event.target.value)}
                  rows={4}
                  textareaClassName="mono text-xs"
                  value={form.values.WaffoPublicCert}
                />
                <Textarea
                  description={t('The same certificate for the sandbox environment.')}
                  disabled={disabled}
                  label={t('Waffo sandbox certificate')}
                  onChange={(event) => form.setField('WaffoSandboxPublicCert', event.target.value)}
                  rows={4}
                  textareaClassName="mono text-xs"
                  value={form.values.WaffoSandboxPublicCert}
                />
              </div>

              <Textarea
                description={t('The Waffo payment tiles, as a JSON array. Shown on the top-up page only while Waffo is live.')}
                disabled={disabled}
                error={form.errors.WaffoPayMethods}
                label={t('Waffo payment methods')}
                onChange={(event) => form.setField('WaffoPayMethods', event.target.value)}
                rows={5}
                textareaClassName="mono text-xs"
                value={form.values.WaffoPayMethods}
              />
            </div>
          </Tabs.Panel>
        </Tabs>
      </SettingsSection>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Accept the terms')}
        confirmPhrase={t('I ACCEPT')}
        description={t('Accepting is recorded with your account id, your address and the server’s clock. It cannot be undone from this console — the server refuses to change the record through the settings endpoint.')}
        isLoading={confirmCompliance.isPending}
        onConfirm={() => {
          confirmCompliance.mutate(undefined, {
            onError: (error) => toast.error(toErrorMessage(error)),
            onSuccess: () => {
              toast.success(t('Compliance terms accepted'))
              setComplianceOpen(false)
            },
          })
        }}
        onOpenChange={setComplianceOpen}
        open={complianceOpen}
        size="md"
        title={t('Accept the payment compliance terms')}
      >
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6 text-muted">
          <li>{t('You have lawful authorisation for the model APIs, accounts, keys and quotas this deployment resells.')}</li>
          <li>{t('You will meet the filing, assessment, content-safety, labelling, log-retention and personal-data obligations that apply where you operate.')}</li>
          <li>{t('You will not use this system to carry out or assist anything that breaks the law, a regulator’s rules, a platform’s rules or a third party’s rights.')}</li>
          <li>{t('You accept legal responsibility for how this deployment is run and what it charges.')}</li>
          <li>{t('This notice is a risk reminder, not legal advice, and not a review of your compliance.')}</li>
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Clear it')}
        description={t('The stored {{credential}} is replaced with an empty value straight away, without waiting for a save. Any gateway that needs it stops taking money until a new one is entered.', { credential: pendingClear?.label ?? '' })}
        destructive
        isLoading={clearSecret.isPending}
        onConfirm={() => void clearStoredSecret()}
        onOpenChange={(open) => {
          if (!open) setPendingClear(undefined)
        }}
        open={pendingClear !== undefined}
        title={t('Clear this stored credential?')}
      />
    </div>
  )
}

function amountOptionsMessage(
  problem: NonNullable<ReturnType<typeof checkAmountOptions>>,
  t: (key: string) => string,
): string {
  if (problem === 'syntax') return t('This is not valid JSON.')
  if (problem === 'not-array') return t('This must be a JSON array.')
  return t('Every amount must be a whole number above zero.')
}

function amountDiscountMessage(
  problem: NonNullable<ReturnType<typeof checkAmountDiscount>>,
  t: (key: string) => string,
): string {
  if (problem === 'syntax') return t('This is not valid JSON.')
  if (problem === 'not-object') return t('This must be a JSON object.')
  if (problem === 'bad-key') return t('Each key must be a whole-number amount.')
  return t('Each discount must be a number above zero.')
}

function payMethodMessage(
  problem: NonNullable<ReturnType<typeof checkPayMethods>>,
  t: (key: string) => string,
): string {
  if (problem === 'syntax') return t('This is not valid JSON.')
  if (problem === 'not-array') return t('This must be a JSON array.')
  if (problem === 'not-object') return t('Every entry must be an object.')
  if (problem === 'missing-type') return t('Every entry needs a non-empty type.')
  if (problem === 'missing-name') return t('Every entry needs a non-empty name.')
  if (problem === 'duplicate-type') return t('Two entries share the same type.')
  return t('Every value must be text, including min_topup. A number here is refused and destroys the stored list.')
}
