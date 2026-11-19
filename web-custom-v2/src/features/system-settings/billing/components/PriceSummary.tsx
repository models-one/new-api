import { useTranslation } from 'react-i18next'

import { formatTierCondition, parseTieredBilling } from '@/features/pricing/tiered-billing'
import { BILLING_EXPR_KEY, type PricingValues } from '@/features/system-settings/billing/model-pricing-api'
import { formatPrice, pricingModeOf, ratioToUsdPerMillion } from '@/features/system-settings/billing/model-pricing-draft'

/** The price a model is charged, in one line of USD figures. */
export function PriceSummary(props: { values: PricingValues; quotaPerUnit: number }) {
  const { t } = useTranslation()
  const values = props.values
  const mode = pricingModeOf(values)

  if (mode === 'per-request') {
    return <span className="text-sm">{t('${{price}} per request', { price: formatPrice(values.ModelPrice ?? 0) })}</span>
  }

  if (mode === 'per-token') {
    const ratio = values.ModelRatio
    if (ratio === undefined) return <span className="text-sm text-muted">{t('Not priced')}</span>
    const input = ratioToUsdPerMillion(ratio, props.quotaPerUnit)
    // Without a completion ratio the server applies the model's built-in default, which
    // is not known here; it is never assumed to equal the input price.
    if (values.CompletionRatio === undefined) {
      return <span className="text-sm">{t('Input ${{input}} per 1M tokens · output at the default ratio', { input: formatPrice(input) })}</span>
    }
    const output = input * values.CompletionRatio
    return (
      <span className="text-sm">
        {t('Input ${{input}} · Output ${{output}} per 1M tokens', { input: formatPrice(input), output: formatPrice(output) })}
      </span>
    )
  }

  const billing = parseTieredBilling({ billing_expr: values[BILLING_EXPR_KEY] ?? '', billing_mode: 'tiered_expr' } as Parameters<typeof parseTieredBilling>[0])
  const first = billing?.tiers[0]
  if (billing === undefined || first === undefined) {
    return <span className="mono text-xs text-muted">{t('Custom expression')}</span>
  }
  return (
    <span className="flex flex-col gap-0.5 text-sm">
      <span>
        {first.prices.map((price) => `${t(price.variable.labelKey)} $${formatPrice(price.perMillion)}`).join(' · ')}
        {first.prices.length > 0 ? ` ${t('per 1M tokens')}` : ''}
      </span>
      {billing.tiers.length > 1 ? (
        <span className="text-xs text-muted">
          {t('{{count}} tiers', { count: billing.tiers.length })}
          {first.conditions.length > 0 ? ` · ${t('first when {{condition}}', { condition: first.conditions.map(formatTierCondition).join(' && ') })}` : ''}
        </span>
      ) : null}
      {billing.hasConditionalMultipliers ? <span className="text-xs text-muted">{t('With request rules')}</span> : null}
    </span>
  )
}
