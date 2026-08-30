import { useTranslation } from 'react-i18next'

import { DonutChart } from '@/components/chart'
import { EmptyState } from '@/components/system/EmptyState'
import { Panel, Skeleton } from '@/components/ui'
import {
  AnalyticsErrorAlert,
  DerivationNote,
} from '@/features/dashboard-analytics/components/AnalyticsControls'
import { metricProjection, type AnalyticsMetric } from '@/features/dashboard-analytics/presentation'
import { MODEL_SLICE_LIMIT, foldRemainingModels, type ModelTotals } from '@/features/dashboard-analytics/users'

const CHART_HEIGHT = 260

type ModelMixPanelProps = {
  models: readonly ModelTotals[]
  metric: AnalyticsMetric
  quotaPerUnit: number
  isPending: boolean
  isFetching: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
}

/**
 * The platform-wide model split from `GET /api/data/`.
 *
 * It is a companion to the per-user panels, not a per-user breakdown: that
 * endpoint groups by model and hour with an EMPTY username, so no model can be
 * attributed to a user from this response, and none is claimed here.
 */
export function ModelMixPanel(props: ModelMixPanelProps) {
  const { t } = useTranslation()
  const projection = metricProjection(props.metric, props.quotaPerUnit, t)

  const head = props.models.slice(0, MODEL_SLICE_LIMIT)
  const rest = foldRemainingModels(props.models)
  const segments = [
    ...head.map((model) => ({
      name: model.model === '' ? t('Unattributed') : model.model,
      value: projection.toValue(model),
    })),
    ...(rest ? [{ name: t('{{count}} more models', { count: props.models.length - head.length }), value: projection.toValue(rest) }] : []),
  ].filter((segment) => segment.value > 0)

  return (
    <Panel>
      <Panel.Header
        description={t('Every user together, from /api/data/. This endpoint reports no username, so it cannot be split per user.')}
        title={t('Platform model mix')}
      />
      <Panel.Body>
        {props.isError ? (
          <AnalyticsErrorAlert
            error={props.error}
            isRetrying={props.isFetching}
            onRetry={props.onRetry}
            title={t('The platform model mix could not be loaded')}
          />
        ) : null}

        {!props.isError && props.isPending ? (
          <Skeleton height={CHART_HEIGHT} label={t('Loading the platform model mix')} variant="block" />
        ) : null}

        {!props.isError && !props.isPending && segments.length === 0 ? (
          <EmptyState
            description={t('No model recorded any traffic across the platform in this range.')}
            headingLevel={3}
            title={t('No model traffic')}
          />
        ) : null}

        {!props.isError && !props.isPending && segments.length > 0 ? (
          <div aria-busy={props.isFetching} className="flex flex-col gap-4">
            <DonutChart
              categoryHeader={t('Model')}
              centerLabel={projection.label}
              formatValue={projection.format}
              height={CHART_HEIGHT}
              label={t('{{measure}} by model across the platform', { measure: projection.label })}
              segments={segments}
              valueHeader={projection.label}
            />
            <DerivationNote>
              {t(
                'Summed in this console per model name. The MODEL_SLICE_LIMIT = {{limit}} largest get their own slice; the rest are added into one "more models" slice rather than dropped.',
                { limit: MODEL_SLICE_LIMIT },
              )}
            </DerivationNote>
          </div>
        ) : null}
      </Panel.Body>
    </Panel>
  )
}
