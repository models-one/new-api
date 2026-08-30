import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { BarChart } from '@/components/chart'
import { NativeSelect, type NativeSelectOption } from '@/components/form'
import { EmptyState } from '@/components/system/EmptyState'
import { Panel, Skeleton } from '@/components/ui'
import { DerivationNote, MetricControl } from '@/features/dashboard-analytics/components/AnalyticsControls'
import {
  flowStageBreakdown,
  type FlowFilters,
  type FlowNodeTotals,
  type FlowStageKind,
} from '@/features/dashboard-analytics/flow'
import type { FlowQuotaRow } from '@/features/dashboard-analytics/api'
import {
  flowNodeLabel,
  flowStageLabel,
  metricProjection,
  type AnalyticsMetric,
} from '@/features/dashboard-analytics/presentation'

/** Bars drawn per stage before the remainder is folded into one aggregate bar. */
const STAGE_BAR_LIMIT = 8

const CHART_HEIGHT = 240

type FlowStagePanelProps = {
  rows: readonly FlowQuotaRow[]
  stages: readonly FlowStageKind[]
  filters: FlowFilters
  onFilterChange: (kind: FlowStageKind, nodeId: string) => void
  metric: AnalyticsMetric
  onMetricChange: (metric: AnalyticsMetric) => void
  quotaPerUnit: number
  isPending: boolean
  isFetching: boolean
}

type StageBar = { label: string; value: number }

/**
 * Top {@link STAGE_BAR_LIMIT} nodes by the selected measure, with everything
 * past that summed into one bar so the chart never claims the tail does not
 * exist. Nodes contributing nothing to the measure are dropped rather than
 * drawn as a zero-length bar.
 */
function stageBars(nodes: readonly FlowNodeTotals[], metric: AnalyticsMetric, quotaPerUnit: number, t: TFunction): StageBar[] {
  const projection = metricProjection(metric, quotaPerUnit, t)
  const ranked = nodes
    .map((node) => ({ label: flowNodeLabel(node, t), value: projection.toValue(node) }))
    .filter((bar) => bar.value > 0)
    .sort((left, right) => right.value - left.value)

  const head = ranked.slice(0, STAGE_BAR_LIMIT)
  const tail = ranked.slice(STAGE_BAR_LIMIT)
  if (tail.length === 0) return head

  return [
    ...head,
    {
      label: t('{{count}} more', { count: tail.length }),
      value: tail.reduce((sum, bar) => sum + bar.value, 0),
    },
  ]
}

function StageCard(props: {
  kind: FlowStageKind
  rows: readonly FlowQuotaRow[]
  filters: FlowFilters
  onFilterChange: (kind: FlowStageKind, nodeId: string) => void
  metric: AnalyticsMetric
  quotaPerUnit: number
}) {
  const { t } = useTranslation()
  const breakdown = flowStageBreakdown(props.rows, props.kind, props.filters)
  const stageName = flowStageLabel(props.kind, t)
  const projection = metricProjection(props.metric, props.quotaPerUnit, t)
  const bars = stageBars(breakdown.nodes, props.metric, props.quotaPerUnit, t)

  // The "all" entry has to be a real, selectable option: NativeSelect renders
  // its `placeholder` disabled, which would make a chosen filter unclearable.
  const options: NativeSelectOption[] = [
    { value: '', label: t('All {{stage}}', { stage: stageName }) },
    ...breakdown.nodes.map((node) => ({ value: node.id, label: flowNodeLabel(node, t) })),
  ]

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-[4px] border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">{stageName}</h3>
          <p className="eyebrow mt-1">
            {t('{{count}} distinct', { count: breakdown.nodes.length })}
          </p>
        </div>
        <NativeSelect
          className="w-44 shrink-0"
          label={t('Filter by {{stage}}', { stage: stageName })}
          hideLabel
          onChange={(event) => props.onFilterChange(props.kind, event.target.value)}
          options={options}
          size="sm"
          value={props.filters[props.kind] ?? ''}
        />
      </div>

      {bars.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">
          {t('No {{measure}} recorded at this stage.', { measure: projection.label.toLowerCase() })}
        </p>
      ) : (
        <BarChart
          axisWidth={128}
          categories={bars.map((bar) => bar.label)}
          categoryHeader={stageName}
          formatValue={projection.format}
          height={Math.max(120, bars.length * 26)}
          label={t('{{measure}} by {{stage}}', { measure: projection.label, stage: stageName })}
          orientation="horizontal"
          series={[
            {
              name: projection.label,
              points: bars.map((bar, index) => ({ x: index, y: bar.value })),
            },
          ]}
          showLegend={false}
        />
      )}
    </div>
  )
}

/**
 * The flow rendered as one ranked breakdown per dimension instead of a Sankey.
 *
 * The chart kit ships no Sankey, and the payload does not justify building one:
 * `/api/data/flow*` returns pre-grouped rows across at most six dimensions, and
 * on a real deployment several of those collapse to a single node (one group,
 * one channel), which a Sankey draws as a bottleneck that carries no
 * information. Ranked bars per stage plus the exact path table underneath show
 * the same numbers and stay readable and sortable.
 */
export function FlowStagePanel(props: FlowStagePanelProps) {
  const { t } = useTranslation()

  return (
    <Panel>
      <Panel.Header
        actions={<MetricControl label={t('Flow measure')} onChange={props.onMetricChange} value={props.metric} />}
        description={t(
          'Each dimension the endpoint grouped by, ranked. Selecting one narrows every other dimension and the paths below, but never its own ranking.',
        )}
        title={t('Where the traffic went')}
      />
      <Panel.Body>
        {props.isPending ? (
          <Skeleton height={CHART_HEIGHT} label={t('Loading the flow breakdown')} variant="block" />
        ) : null}

        {!props.isPending && props.stages.length === 0 ? (
          <EmptyState
            description={t('The server returned no rows for this range, so there is nothing to break down.')}
            headingLevel={3}
            title={t('No traffic in this range')}
          />
        ) : null}

        {!props.isPending && props.stages.length > 0 ? (
          <div aria-busy={props.isFetching} className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {props.stages.map((kind) => (
                <StageCard
                  filters={props.filters}
                  key={kind}
                  kind={kind}
                  metric={props.metric}
                  onFilterChange={props.onFilterChange}
                  quotaPerUnit={props.quotaPerUnit}
                  rows={props.rows}
                />
              ))}
            </div>
            <DerivationNote>
              {t(
                'Ranked in this console by summing the returned rows per dimension. At most STAGE_BAR_LIMIT = {{limit}} bars are drawn; the rest are summed into a single "more" bar. The server sends no ranking or totals of its own.',
                { limit: STAGE_BAR_LIMIT },
              )}
            </DerivationNote>
          </div>
        ) : null}
      </Panel.Body>
    </Panel>
  )
}
