import InfoIcon from 'lucide-react/dist/esm/icons/info'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/system/EmptyState'
import { Badge, Panel, Skeleton } from '@/components/ui'
import type { ModelSpend } from '@/features/usage/usage'
import { formatNumber, formatPercent, formatQuota, formatTokens } from '@/lib/format'

/** Models listed individually before the rest are folded into one honest remainder. */
const MODEL_ROW_LIMIT = 8

type ModelUsagePanelProps = {
  models: readonly ModelSpend[]
  quotaPerUnit: number
  isPending: boolean
  isFetching: boolean
}

export function ModelUsagePanel(props: ModelUsagePanelProps) {
  const { t } = useTranslation()

  const listed = props.models.slice(0, MODEL_ROW_LIMIT)
  const rest = props.models.slice(MODEL_ROW_LIMIT)
  const remainder = rest.reduce(
    (total, model) => ({
      quota: total.quota + model.quota,
      requests: total.requests + model.requests,
      share: total.share + model.share,
      tokens: total.tokens + model.tokens,
    }),
    { quota: 0, requests: 0, share: 0, tokens: 0 },
  )

  return (
    <Panel className="flex flex-col overflow-hidden">
      <Panel.Header
        description={t('Your own spend for the charted window.')}
        title={t('Usage by model')}
      />

      <Panel.Body aria-busy={props.isFetching} padded={false}>
        {props.isPending ? (
          <div className="flex flex-col gap-6 px-5 py-6" role="status">
            <span className="sr-only">{t('Loading usage by model')}</span>
            {[0, 1, 2, 3].map((slot) => (
              <div className="flex items-center justify-between gap-4" key={slot}>
                <div className="flex w-1/2 flex-col gap-2">
                  <Skeleton height={14} variant="block" width="60%" />
                  <Skeleton height={10} variant="block" width="80%" />
                </div>
                <Skeleton height={14} variant="block" width={72} />
              </div>
            ))}
          </div>
        ) : null}

        {!props.isPending && props.models.length === 0 ? (
          <EmptyState
            description={t('No requests were recorded for your account in this window.')}
            headingLevel={3}
            title={t('No usage in this period')}
          />
        ) : null}

        {props.isPending ? null : (
          <div className="divide-y divide-border">
            {listed.map((model) => (
              <div className="flex items-center justify-between gap-4 px-5 py-4" key={model.model}>
                <div className="min-w-0">
                  <p className="mono truncate font-semibold" title={model.model}>
                    {model.model}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t('{{requests}} requests · {{tokens}} tokens', {
                      requests: formatNumber(model.requests),
                      tokens: formatTokens(model.tokens),
                    })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="mono font-semibold">{formatQuota(model.quota, props.quotaPerUnit)}</p>
                  <Badge className="mt-1" tone="muted">
                    {formatPercent(model.share, 1)}
                  </Badge>
                </div>
              </div>
            ))}

            {rest.length === 0 ? null : (
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {t('Other models ({{models}})', { models: rest.length })}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t('{{requests}} requests · {{tokens}} tokens', {
                      requests: formatNumber(remainder.requests),
                      tokens: formatTokens(remainder.tokens),
                    })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="mono font-semibold">
                    {formatQuota(remainder.quota, props.quotaPerUnit)}
                  </p>
                  <Badge className="mt-1" tone="muted">
                    {formatPercent(remainder.share, 1)}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}
      </Panel.Body>

      <Panel.Footer align="start" className="mt-auto text-sm leading-6 text-muted">
        <InfoIcon aria-hidden="true" className="mt-1 size-4 shrink-0 self-start text-primary" />
        <p className="min-w-0 flex-1">
          {t(
            'Percentages are calculated in this console: the spend of each model divided by your total spend for the window.',
          )}
        </p>
      </Panel.Footer>
    </Panel>
  )
}
