import LayersIcon from 'lucide-react/dist/esm/icons/layers'
import { useTranslation } from 'react-i18next'

import { Alert, Badge, Panel } from '@/components/ui'
import {
  TOKEN_PRICE_KINDS,
  billingShape,
  formatModelPrice,
  formatMultiplier,
  tokenPricePerMillion,
  type ResolvedGroupRatio,
} from '@/features/pricing/pricing-presentation'
import { formatTierCondition, parseTieredBilling } from '@/features/pricing/tiered-billing'
import { perRequestPrice, type PricingModel } from '@/lib/api/pricing'
import { cn } from '@/lib/utils'

type BillingPanelProps = {
  model: PricingModel
  /** The group the headline rate is quoted at, or undefined when none can be resolved. */
  resolved: ResolvedGroupRatio | undefined
}

function PriceTile(props: {
  label: string
  value: string
  unit?: string
  tone: 'primary' | 'secondary'
}) {
  return (
    <div className="field flex flex-col gap-1 p-4">
      <span className="eyebrow">{props.label}</span>
      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            'mono text-xl font-semibold',
            props.tone === 'primary' ? 'text-primary' : 'text-secondary',
          )}
        >
          {props.value}
        </span>
        {props.unit === undefined ? null : <span className="text-xs text-muted">{props.unit}</span>}
      </span>
    </div>
  )
}

/**
 * The headline rate, told honestly for each of the three billing shapes the backend supports.
 *
 * quota_type 0 charges per token; quota_type 1 charges a flat amount per request and leaves
 * `model_ratio` meaningless; and `billing_mode: 'tiered_expr'` puts the real rate in an
 * expression that no single number can stand in for.
 */
export function BillingPanel(props: BillingPanelProps) {
  const { t } = useTranslation()
  const { model, resolved } = props
  const shape = billingShape(model)
  const tiered = parseTieredBilling(model)
  const perMillion = t('per 1M tokens')

  const quotedAt =
    resolved === undefined
      ? t('No group ratio is published, so no rate can be shown.')
      : t('Quoted for group {{group}} (ratio {{ratio}}).', {
          group: resolved.group,
          ratio: formatMultiplier(resolved.ratio),
        })

  const secondaryKinds =
    resolved === undefined
      ? []
      : TOKEN_PRICE_KINDS.filter(
          (entry) =>
            !entry.primary && tokenPricePerMillion(model, entry.kind, resolved.ratio) !== undefined,
        )

  return (
    <Panel>
      <Panel.Header description={quotedAt} headingLevel={2} title={t('Rate')} />
      <Panel.Body className="flex flex-col gap-5">
        {shape === 'tiered' && tiered !== undefined ? (
          <>
            <Alert icon={<LayersIcon aria-hidden="true" />} title={t('Tiered pricing')} tone="info">
              {tiered.parsed
                ? t(
                    'This model bills from an expression: which tier applies depends on the request, so there is no single rate.',
                  )
                : t(
                    'This model bills from an expression this page cannot read. The raw expression is shown below; the flat ratios on this row are only fallbacks.',
                  )}
            </Alert>

            {tiered.hasConditionalMultipliers ? (
              <Alert tone="warning">
                {t('The expression also applies request-dependent multipliers on top of the tier.')}
              </Alert>
            ) : null}

            {tiered.parsed && resolved !== undefined
              ? tiered.tiers.map((tier, index) => (
                  <div className="flex flex-col gap-3" key={`${tier.label}-${index}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">{tier.label === '' ? t('Tier') : tier.label}</Badge>
                      {tier.conditions.length === 0 ? (
                        <span className="text-xs text-muted">
                          {t('Applies when no other tier does')}
                        </span>
                      ) : (
                        tier.conditions.map((condition) => (
                          <Badge className="mono" key={formatTierCondition(condition)} tone="muted">
                            {formatTierCondition(condition)}
                          </Badge>
                        ))
                      )}
                    </div>
                    {tier.prices.length === 0 ? (
                      <p className="text-sm text-muted">
                        {t('This tier publishes no priced variable.')}
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {tier.prices.map((price) => (
                          <PriceTile
                            key={price.variable.key}
                            label={t(price.variable.labelKey)}
                            tone={price.variable.primary ? 'primary' : 'secondary'}
                            unit={perMillion}
                            value={formatModelPrice(price.perMillion * resolved.ratio)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))
              : null}

            {tiered.rawExpression === '' ? null : (
              <div>
                <p className="eyebrow">{t('Billing expression')}</p>
                <code className="mono mt-2 block max-h-40 overflow-auto rounded-[4px] border border-border bg-canvas px-3 py-2 text-xs break-all text-muted">
                  {tiered.rawExpression}
                </code>
              </div>
            )}
          </>
        ) : null}

        {shape === 'per-request' ? (
          <>
            <p className="text-sm leading-6 text-muted">
              {t(
                'This model charges a flat amount per request; token counts do not affect the price.',
              )}
            </p>
            {resolved === undefined ? null : (
              <div className="grid gap-3 sm:grid-cols-2">
                <PriceTile
                  label={t('Per request')}
                  tone="primary"
                  value={formatModelPrice(perRequestPrice(model, resolved.ratio))}
                />
              </div>
            )}
          </>
        ) : null}

        {shape === 'per-token' && resolved !== undefined ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {TOKEN_PRICE_KINDS.filter((entry) => entry.primary).map((entry) => {
                const price = tokenPricePerMillion(model, entry.kind, resolved.ratio)
                return price === undefined ? null : (
                  <PriceTile
                    key={entry.kind}
                    label={t(entry.labelKey)}
                    tone={entry.kind === 'input' ? 'primary' : 'secondary'}
                    unit={perMillion}
                    value={formatModelPrice(price)}
                  />
                )
              })}
            </div>

            {secondaryKinds.length === 0 ? null : (
              <dl className="divide-y divide-border border-y border-border text-sm">
                {secondaryKinds.map((entry) => {
                  const price = tokenPricePerMillion(model, entry.kind, resolved.ratio)
                  return price === undefined ? null : (
                    <div className="flex items-center justify-between gap-4 py-3" key={entry.kind}>
                      <dt className="eyebrow shrink-0">{t(entry.labelKey)}</dt>
                      <dd className="flex items-baseline gap-1 text-foreground">
                        <span className="mono">{formatModelPrice(price)}</span>
                        <span className="text-xs text-muted">{perMillion}</span>
                      </dd>
                    </div>
                  )
                })}
              </dl>
            )}
          </>
        ) : null}

        {shape !== 'tiered' && resolved === undefined ? (
          <p className="text-sm leading-6 text-muted">
            {t('No multiplier is published for any group this model is enabled for.')}
          </p>
        ) : null}
      </Panel.Body>
    </Panel>
  )
}
