import ScaleIcon from 'lucide-react/dist/esm/icons/scale'
import { useTranslation } from 'react-i18next'

import { DescriptionList, Panel, type DescriptionListItem } from '@/components/ui'
import {
  billingKind,
  modelEndpointTypes,
  modelGroups,
  modelPricing,
} from '@/features/models/model-presentation'
import { parseTags, vendorName, type PricingModel, type PricingVendor } from '@/lib/api/pricing'

type ModelComparePanelProps = {
  /** The selected models, in the order they were picked. */
  models: PricingModel[]
  vendors: PricingVendor[]
  groupRatio: number | undefined
}

export function ModelComparePanel(props: ModelComparePanelProps) {
  const { t } = useTranslation()
  const { models, vendors, groupRatio } = props

  const billingLabels: Record<ReturnType<typeof billingKind>, string> = {
    'per-token': t('Per token'),
    'per-request': t('Per request'),
    tiered: t('Tiered pricing'),
  }

  const buildItems = (model: PricingModel): DescriptionListItem[] => {
    const provider = vendorName(model, vendors)
    const pricing = modelPricing(model, groupRatio)
    const endpoints = modelEndpointTypes(model)
    const groups = modelGroups(model)
    const tags = parseTags(model)
    const notPublished = t('Not published')

    const items: DescriptionListItem[] = [
      { id: 'provider', term: t('Provider'), description: provider === '' ? notPublished : provider },
      { id: 'billing', term: t('Billing'), description: billingLabels[billingKind(model)] },
    ]

    if (pricing.kind === 'per-token') {
      items.push({
        id: 'input',
        term: t('Input per 1M'),
        description: <span className="mono">{pricing.input}</span>,
      })
      items.push({
        id: 'output',
        term: t('Output per 1M'),
        description: <span className="mono">{pricing.output}</span>,
      })
    } else if (pricing.kind === 'per-request') {
      items.push({
        id: 'per-request',
        term: t('Per request'),
        description: <span className="mono">{pricing.perRequest}</span>,
      })
    } else {
      items.push({ id: 'price', term: t('Price'), description: notPublished })
    }

    items.push({
      id: 'endpoints',
      term: t('Endpoints'),
      description: (
        <span className="mono">{endpoints.length === 0 ? notPublished : endpoints.join(', ')}</span>
      ),
    })
    items.push({
      id: 'groups',
      term: t('Available groups'),
      description: (
        <span className="mono">{groups.length === 0 ? notPublished : groups.join(', ')}</span>
      ),
    })

    if (tags.length > 0) {
      items.push({ id: 'tags', term: t('Capabilities'), description: tags.join(', ') })
    }

    return items
  }

  return (
    <Panel>
      <Panel.Header
        description={t('Pick up to two models to see their published attributes side by side.')}
        icon={<ScaleIcon aria-hidden="true" className="text-muted" />}
        title={t('Compare models')}
      />
      <Panel.Body>
        {models.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {t('Nothing selected yet. Use the Compare button on a model card.')}
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {models.map((model) => (
              <div className="min-w-0" key={model.model_name}>
                <h3 className="mono truncate text-sm font-bold" title={model.model_name}>
                  {model.model_name}
                </h3>
                <DescriptionList
                  className="mt-3"
                  items={buildItems(model)}
                  label={t('Attributes of {{model}}', { model: model.model_name })}
                  layout="stacked"
                />
              </div>
            ))}
          </div>
        )}
      </Panel.Body>
    </Panel>
  )
}
