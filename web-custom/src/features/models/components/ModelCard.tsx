import BoxesIcon from 'lucide-react/dist/esm/icons/boxes'
import ImageIcon from 'lucide-react/dist/esm/icons/image'
import MessageSquareIcon from 'lucide-react/dist/esm/icons/message-square'
import { useTranslation } from 'react-i18next'

import { Badge, Button, IconBadge, Panel } from '@/components/ui'
import {
  endpointRoute,
  formatMultiplier,
  modelEndpointTypes,
  modelGroups,
  modelMultipliers,
  modelPricing,
} from '@/features/models/model-presentation'
import { parseTags, vendorName, type PricingModel, type PricingVendor } from '@/lib/api/pricing'

/**
 * Decorative only: the card mark is picked from the model's first supported endpoint
 * type. It carries no information the badges below do not already state in text.
 */
const ENDPOINT_ICONS: Record<string, typeof BoxesIcon> = {
  'image-generation': ImageIcon,
  openai: MessageSquareIcon,
}

type ModelCardProps = {
  model: PricingModel
  vendors: PricingVendor[]
  /** The payload's top-level `supported_endpoint` map, used for endpoint routes. */
  endpointCatalog: Record<string, unknown>
  /** The selected group's multiplier, or undefined when the server publishes none. */
  groupRatio: number | undefined
  selectedGroup: string
  compared: boolean
  onToggleCompare: (modelName: string) => void
}

export function ModelCard(props: ModelCardProps) {
  const { t } = useTranslation()
  const { model, vendors, endpointCatalog, groupRatio, selectedGroup, compared } = props

  const provider = vendorName(model, vendors)
  const endpoints = modelEndpointTypes(model)
  const groups = modelGroups(model)
  const tags = parseTags(model)
  const multipliers = modelMultipliers(model)
  const pricing = modelPricing(model, groupRatio)
  const availableHere = selectedGroup === '' || groups.includes(selectedGroup)
  const Icon = ENDPOINT_ICONS[endpoints[0] ?? ''] ?? BoxesIcon

  return (
    <Panel as="article" className="flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconBadge icon={<Icon />} tone="primary" />
          <div className="min-w-0">
            <h2 className="mono truncate text-base font-bold" title={model.model_name}>
              {model.model_name}
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted">
              {provider === '' ? t('Not published') : provider}
            </p>
          </div>
        </div>
        {availableHere ? null : (
          <Badge tone="warning">{t('Not available in this group')}</Badge>
        )}
      </div>

      {model.description === undefined || model.description === '' ? null : (
        <p className="text-sm leading-6 text-muted">{model.description}</p>
      )}

      {pricing.kind === 'per-token' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="field flex flex-col gap-1 p-3">
            <span className="eyebrow">{t('Input per 1M')}</span>
            <span className="mono text-lg font-semibold text-primary">{pricing.input}</span>
          </div>
          <div className="field flex flex-col gap-1 p-3">
            <span className="eyebrow">{t('Output per 1M')}</span>
            <span className="mono text-lg font-semibold text-secondary">{pricing.output}</span>
          </div>
        </div>
      ) : null}

      {pricing.kind === 'per-request' ? (
        <div className="field flex flex-col gap-1 p-3">
          <span className="eyebrow">{t('Per request')}</span>
          <span className="mono text-lg font-semibold text-primary">{pricing.perRequest}</span>
        </div>
      ) : null}

      {pricing.kind === 'tiered' ? (
        <div className="field flex flex-col gap-2 p-3">
          <Badge tone="info">{t('Tiered pricing')}</Badge>
          <span className="text-xs leading-5 text-muted">
            {t('Priced by a billing expression, so there is no single published rate.')}
          </span>
        </div>
      ) : null}

      {pricing.kind === 'unpriced' ? (
        <div className="field flex flex-col gap-1 p-3">
          <span className="eyebrow">{t('Price')}</span>
          <span className="text-sm text-muted">{t('Not published')}</span>
        </div>
      ) : null}

      {multipliers.length === 0 ? null : (
        <div>
          <p className="eyebrow">{t('Billing multipliers')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {multipliers.map((multiplier) => (
              <li key={multiplier.id}>
                <Badge tone="muted">
                  {t(multiplier.labelKey)}
                  <span className="mono">{formatMultiplier(multiplier.ratio)}</span>
                </Badge>
              </li>
            ))}
          </ul>
        </div>
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

      {groups.length === 0 ? null : (
        <div>
          <p className="eyebrow">{t('Available groups')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {groups.map((group) => (
              <li key={group}>
                <Badge className="mono" tone={group === selectedGroup ? 'primary' : 'muted'}>
                  {group}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tags.length === 0 ? null : (
        <div>
          <p className="eyebrow">{t('Capabilities')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag}>
                <Badge tone="muted">{tag}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button
        aria-pressed={compared}
        className="mt-auto w-full"
        onClick={() => props.onToggleCompare(model.model_name)}
        variant={compared ? 'primary' : 'outline'}
      >
        {compared ? t('Comparing') : t('Compare')}
      </Button>
    </Panel>
  )
}
