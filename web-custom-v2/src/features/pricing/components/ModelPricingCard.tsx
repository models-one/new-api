import { Link } from '@tanstack/react-router'
import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import BoxesIcon from 'lucide-react/dist/esm/icons/boxes'
import ImageIcon from 'lucide-react/dist/esm/icons/image'
import LayersIcon from 'lucide-react/dist/esm/icons/layers'
import MessageSquareIcon from 'lucide-react/dist/esm/icons/message-square'
import { useTranslation } from 'react-i18next'

import { Badge, Button, IconBadge, Panel } from '@/components/ui'
import {
  billingShape,
  endpointRoute,
  formatModelPrice,
  modelDetailParam,
  modelEndpointTypes,
  tokenPricePerMillion,
  type ResolvedGroupRatio,
} from '@/features/pricing/pricing-presentation'
import { parseTieredBilling } from '@/features/pricing/tiered-billing'
import type { ModelPerfSummary } from '@/lib/api/metrics'
import {
  parseTags,
  perRequestPrice,
  vendorName,
  type PricingModel,
  type PricingVendor,
} from '@/lib/api/pricing'
import { formatLatencyMs, formatPercent } from '@/lib/format'

/**
 * Decorative only: the mark comes from the model's first supported endpoint type and states
 * nothing the badges below do not already say in text.
 */
const ENDPOINT_ICONS: Record<string, typeof BoxesIcon> = {
  'image-generation': ImageIcon,
  openai: MessageSquareIcon,
}

/** Tags are free text from the operator; a card shows a few and the detail page shows all. */
const MAX_CARD_TAGS = 4

type ModelPricingCardProps = {
  model: PricingModel
  vendors: PricingVendor[]
  /** The payload's top-level `supported_endpoint` map, used for endpoint routes. */
  endpointCatalog: Record<string, unknown>
  /** The multiplier this card quotes at, or undefined when no price can be shown. */
  resolved: ResolvedGroupRatio | undefined
  /** Service-wide performance for this model, when `/api/perf-metrics/summary` reports any. */
  perf: ModelPerfSummary | undefined
}

export function ModelPricingCard(props: ModelPricingCardProps) {
  const { t } = useTranslation()
  const { model, vendors, endpointCatalog, resolved, perf } = props

  const provider = vendorName(model, vendors)
  const endpoints = modelEndpointTypes(model)
  const tags = parseTags(model)
  const shape = billingShape(model)
  const tiered = parseTieredBilling(model)
  const Icon = ENDPOINT_ICONS[endpoints[0] ?? ''] ?? BoxesIcon

  const inputPrice = resolved && tokenPricePerMillion(model, 'input', resolved.ratio)
  const outputPrice = resolved && tokenPricePerMillion(model, 'output', resolved.ratio)

  return (
    <Panel as="article" className="flex flex-col gap-5 p-6">
      <div className="flex min-w-0 items-center gap-3">
        <IconBadge icon={<Icon />} tone="primary" />
        <div className="min-w-0">
          <h3 className="mono truncate text-base font-bold" title={model.model_name}>
            {model.model_name}
          </h3>
          <p className="mt-0.5 truncate text-sm text-muted">
            {provider === '' ? t('Provider not published') : provider}
          </p>
        </div>
      </div>

      {model.description === undefined || model.description === '' ? null : (
        <p className="line-clamp-3 text-sm leading-6 text-muted">{model.description}</p>
      )}

      {shape === 'tiered' ? (
        <div className="field flex flex-col gap-2 p-3">
          <Badge tone="info">
            <LayersIcon aria-hidden="true" className="size-3" />
            {t('Tiered pricing')}
          </Badge>
          <span className="text-xs leading-5 text-muted">
            {tiered !== undefined && tiered.parsed
              ? t('The rate changes with the request; {{count}} tiers are published.', {
                  count: tiered.tiers.length,
                })
              : t('Priced by a billing expression, so there is no single published rate.')}
          </span>
        </div>
      ) : null}

      {shape === 'per-token' && resolved !== undefined ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="field flex flex-col gap-1 p-3">
            <span className="eyebrow">{t('Input per 1M')}</span>
            <span className="mono text-lg font-semibold text-primary">
              {inputPrice === undefined ? '—' : formatModelPrice(inputPrice)}
            </span>
          </div>
          <div className="field flex flex-col gap-1 p-3">
            <span className="eyebrow">{t('Output per 1M')}</span>
            <span className="mono text-lg font-semibold text-secondary">
              {outputPrice === undefined ? '—' : formatModelPrice(outputPrice)}
            </span>
          </div>
        </div>
      ) : null}

      {shape === 'per-request' && resolved !== undefined ? (
        <div className="field flex flex-col gap-1 p-3">
          <span className="eyebrow">{t('Per request')}</span>
          <span className="mono text-lg font-semibold text-primary">
            {formatModelPrice(perRequestPrice(model, resolved.ratio))}
          </span>
        </div>
      ) : null}

      {shape !== 'tiered' && resolved === undefined ? (
        <div className="field flex flex-col gap-1 p-3">
          <span className="eyebrow">{t('Price')}</span>
          <span className="text-sm text-muted">
            {t('No multiplier is published for this group, so no price can be shown.')}
          </span>
        </div>
      ) : null}

      {resolved === undefined ? null : (
        <p className="text-xs text-muted">
          {resolved.isBest
            ? t('Best available group: {{group}}', { group: resolved.group })
            : t('Priced for group {{group}}', { group: resolved.group })}
        </p>
      )}

      {perf === undefined ? null : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <ActivityIcon aria-hidden="true" className="size-3.5" />
            {t('Service-wide, last 24h')}
          </span>
          <span className="mono">{formatLatencyMs(perf.avg_latency_ms)}</span>
          <span className="mono">{formatPercent(perf.success_rate, 2)}</span>
        </p>
      )}

      {endpoints.length === 0 ? null : (
        <div>
          <p className="eyebrow">{t('Endpoints')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {endpoints.map((endpoint) => (
              <li key={endpoint}>
                <Badge className="mono" title={endpointRoute(endpointCatalog, endpoint)} tone="info">
                  {endpoint}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tags.length === 0 ? null : (
        <div>
          <p className="eyebrow">{t('Tags')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {tags.slice(0, MAX_CARD_TAGS).map((tag) => (
              <li key={tag}>
                <Badge tone="muted">{tag}</Badge>
              </li>
            ))}
            {tags.length > MAX_CARD_TAGS ? (
              <li>
                <Badge tone="muted">
                  {t('+{{count}} more', { count: tags.length - MAX_CARD_TAGS })}
                </Badge>
              </li>
            ) : null}
          </ul>
        </div>
      )}

      <Button
        className="mt-auto w-full"
        render={
          <Link params={{ modelId: modelDetailParam(model.model_name) }} to="/pricing/$modelId" />
        }
        variant="outline"
      >
        {t('View pricing details')}
      </Button>
    </Panel>
  )
}
