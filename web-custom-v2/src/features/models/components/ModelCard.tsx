import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, Panel } from '@/components/ui'
import { CopyButton } from '@/components/ui/CopyButton'
import {
  ModelDetails,
  type ModelPresentationProps,
} from '@/features/models/components/ModelDetails'
import { modelGroups, modelPricing } from '@/features/models/model-presentation'
import { parseTags, vendorName } from '@/lib/api/pricing'

export function ModelCard(props: ModelPresentationProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const provider = vendorName(props.model, props.vendors)
  const pricing = modelPricing(props.model, props.groupRatio)
  const available =
    props.selectedGroup === '' || modelGroups(props.model).includes(props.selectedGroup)

  return (
    <Panel
      as="article"
      className="flex flex-col overflow-hidden border-t-2 border-t-primary/40 transition-colors hover:border-primary/40"
    >
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded border border-border bg-surface-high text-[10px] font-bold text-foreground"
          >
            {provider.slice(0, 2).toUpperCase() || '—'}
          </span>
          <span>{provider || t('Not published')}</span>
        </div>
        <h2 className="min-w-0 break-words text-sm font-semibold text-foreground">
          {props.model.model_name}
        </h2>
        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted">
          {props.model.description || t('Description not published')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {parseTags(props.model).map((tag) => (
            <Badge key={tag} size="sm" tone="muted">
              {tag}
            </Badge>
          ))}
          {!available ? (
            <Badge size="sm" tone="warning">
              {t('Not available in this group')}
            </Badge>
          ) : null}
        </div>
        <div className="mt-auto border-t border-border pt-4">
          {pricing.kind === 'per-token' ? (
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-[11px] text-muted">{t('Input per 1M')}</dt>
                <dd className="mono mt-1 text-base text-foreground">{pricing.input}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">{t('Output per 1M')}</dt>
                <dd className="mono mt-1 text-base text-foreground">{pricing.output}</dd>
              </div>
            </dl>
          ) : null}
          {pricing.kind === 'per-request' ? (
            <div>
              <p className="text-[11px] text-muted">{t('Per request')}</p>
              <p className="mono mt-1 text-base">{pricing.perRequest}</p>
            </div>
          ) : null}
          {pricing.kind === 'tiered' ? <Badge tone="info">{t('Tiered pricing')}</Badge> : null}
          {pricing.kind === 'unpriced' ? (
            <span className="text-sm text-muted">{t('Not published')}</span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            aria-controls={detailsId}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            size="sm"
            variant="quiet"
          >
            {t('Details')}
            <ChevronDownIcon aria-hidden="true" className={expanded ? 'rotate-180' : ''} />
          </Button>
          <Button
            aria-pressed={props.compared}
            onClick={() => props.onToggleCompare(props.model.model_name)}
            size="sm"
            variant={props.compared ? 'primary' : 'outline'}
          >
            {props.compared ? t('Comparing') : t('Compare')}
          </Button>
        </div>
        <div hidden={!expanded} id={detailsId}>
          {expanded ? <ModelDetails {...props} /> : null}
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border bg-sunken px-4 py-1.5">
        <code className="truncate text-[11px] text-muted">{props.model.model_name}</code>
        <CopyButton label={t('Copy model ID')} size="icon-xs" value={props.model.model_name} />
      </div>
    </Panel>
  )
}
