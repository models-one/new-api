import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui'
import { CopyButton } from '@/components/ui/CopyButton'
import {
  endpointRoute,
  formatMultiplier,
  modelEndpointTypes,
  modelGroups,
  modelMultipliers,
} from '@/features/models/model-presentation'
import type { PricingModel, PricingVendor } from '@/lib/api/pricing'

export type ModelPresentationProps = {
  model: PricingModel
  vendors: PricingVendor[]
  endpointCatalog: Record<string, unknown>
  groupRatio: number | undefined
  selectedGroup: string
  compared: boolean
  onToggleCompare: (modelName: string) => void
}

export function ModelDetails(
  props: Pick<ModelPresentationProps, 'model' | 'endpointCatalog' | 'selectedGroup'>,
) {
  const { t } = useTranslation()
  const endpoints = modelEndpointTypes(props.model)
  const multipliers = modelMultipliers(props.model)
  const groups = modelGroups(props.model)

  return (
    <div className="flex flex-col gap-4">
      {props.model.description ? (
        <p className="max-w-3xl text-sm leading-6 text-muted">{props.model.description}</p>
      ) : null}
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="eyebrow mb-2">{t('Endpoints')}</p>
          <ul className="space-y-2">
            {endpoints.map((endpoint) => {
              const route = endpointRoute(props.endpointCatalog, endpoint)
              return (
                <li className="flex flex-wrap items-center gap-2 text-xs" key={endpoint}>
                  <Badge size="sm" tone="muted">
                    {endpoint}
                  </Badge>
                  <code className="break-all text-muted">{route ?? t('Not published')}</code>
                </li>
              )
            })}
          </ul>
          {endpoints.length === 0 ? (
            <p className="text-xs text-muted">{t('Not published')}</p>
          ) : null}
        </div>
        <div className="space-y-4">
          <div>
            <p className="eyebrow mb-2">{t('Available groups')}</p>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((group) => (
                <Badge
                  className="mono"
                  key={group}
                  size="sm"
                  tone={group === props.selectedGroup ? 'primary' : 'muted'}
                >
                  {group}
                </Badge>
              ))}
              {groups.length === 0 ? (
                <span className="text-xs text-muted">{t('Not published')}</span>
              ) : null}
            </div>
          </div>
          {multipliers.length > 0 ? (
            <div>
              <p className="eyebrow mb-2">{t('Billing multipliers')}</p>
              <div className="flex flex-wrap gap-1.5">
                {multipliers.map((item) => (
                  <Badge key={item.id} size="sm" tone="muted">
                    {t(item.labelKey)} <span className="mono">{formatMultiplier(item.ratio)}</span>
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted">{t('Model ID')}</span>
        <code className="min-w-0 truncate text-xs">{props.model.model_name}</code>
        <CopyButton label={t('Copy model ID')} size="icon-xs" value={props.model.model_name} />
      </div>
    </div>
  )
}
