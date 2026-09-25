import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button } from '@/components/ui'
import {
  ModelDetails,
  type ModelPresentationProps,
} from '@/features/models/components/ModelDetails'
import { modelEndpointTypes, modelGroups, modelPricing } from '@/features/models/model-presentation'
import { parseTags, vendorName, type PricingModel } from '@/lib/api/pricing'

function ModelRow(props: ModelPresentationProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const provider = vendorName(props.model, props.vendors)
  const pricing = modelPricing(props.model, props.groupRatio)
  const available =
    props.selectedGroup === '' || modelGroups(props.model).includes(props.selectedGroup)
  const tags = parseTags(props.model)

  return (
    <>
      <tr className={expanded ? 'bg-primary/5' : 'hover:bg-surface-raised/70'}>
        <td className="min-w-64 max-w-96 py-2.5 pr-4 pl-3">
          <button
            aria-controls={detailsId}
            aria-expanded={expanded}
            aria-label={t('Model details: {{model}}', { model: props.model.model_name })}
            className="flex w-full cursor-pointer items-center gap-2 text-left"
            onClick={() => setExpanded(!expanded)}
            type="button"
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={`size-3.5 shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">
                {props.model.model_name}
              </span>
              <span className="mt-1 block truncate text-[11px] text-muted">
                {modelEndpointTypes(props.model).join(' · ') || t('Not published')}
              </span>
              {!available ? (
                <span className="mt-1 block text-[10px] text-warning">
                  {t('Not available in this group')}
                </span>
              ) : null}
            </span>
          </button>
        </td>
        <td className="px-3 py-3 text-xs text-muted">{provider || '—'}</td>
        {pricing.kind === 'per-token' ? (
          <>
            <td className="mono px-3 py-3 text-right text-xs">{pricing.input}</td>
            <td className="mono px-3 py-3 text-right text-xs">{pricing.output}</td>
          </>
        ) : (
          <td className="px-3 py-3 text-center text-xs" colSpan={2}>
            {pricing.kind === 'per-request' ? (
              <span>
                <span className="mono">{pricing.perRequest}</span>
                <span className="ml-2 text-muted">{t('Per request')}</span>
              </span>
            ) : null}
            {pricing.kind === 'tiered' ? (
              <Badge size="sm" tone="info">
                {t('Tiered pricing')}
              </Badge>
            ) : null}
            {pricing.kind === 'unpriced' ? (
              <span className="text-muted">{t('Not published')}</span>
            ) : null}
          </td>
        )}
        <td className="max-w-52 px-3 py-3">
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 2).map((tag) => (
              <Badge key={tag} size="sm" tone="muted">
                {tag}
              </Badge>
            ))}
            {tags.length > 2 ? (
              <span className="text-[11px] text-muted" title={tags.slice(2).join(', ')}>
                +{tags.length - 2}
              </span>
            ) : null}
            {tags.length === 0 ? <span className="text-muted">—</span> : null}
          </div>
        </td>
        <td className="px-3 py-3 text-right">
          <Button
            aria-pressed={props.compared}
            onClick={() => props.onToggleCompare(props.model.model_name)}
            size="sm"
            variant={props.compared ? 'primary' : 'quiet'}
          >
            {props.compared ? t('Comparing') : t('Compare')}
          </Button>
        </td>
      </tr>
      <tr hidden={!expanded} id={detailsId}>
        <td className="border-t border-primary/10 bg-sunken p-5" colSpan={6}>
          {expanded ? <ModelDetails {...props} /> : null}
        </td>
      </tr>
    </>
  )
}

export function ModelTable(
  props: Omit<ModelPresentationProps, 'model' | 'compared'> & {
    models: PricingModel[]
    compared: string[]
  },
) {
  const { t } = useTranslation()
  return (
    <div className="scroll-x-hint relative rounded-panel border border-border bg-surface">
      <table
        aria-label={t('Model catalogue')}
        className="w-full min-w-[840px] border-collapse text-left"
      >
        <thead className="border-b border-border bg-sunken text-[11px] font-medium text-muted">
          <tr>
            <th className="py-3 pr-4 pl-8" scope="col">
              {t('Model')}
            </th>
            <th className="px-3 py-3" scope="col">
              {t('Provider')}
            </th>
            <th className="px-3 py-3 text-right" scope="col">
              {t('Input per 1M')}
            </th>
            <th className="px-3 py-3 text-right" scope="col">
              {t('Output per 1M')}
            </th>
            <th className="px-3 py-3" scope="col">
              {t('Capabilities')}
            </th>
            <th className="px-3 py-3" scope="col">
              <span className="sr-only">{t('Actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {props.models.map((model) => (
            <ModelRow
              {...props}
              compared={props.compared.includes(model.model_name)}
              key={model.model_name}
              model={model}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
