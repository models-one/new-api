import { useTranslation } from 'react-i18next'

import { BarChart } from '@/components/chart'
import { NativeSelect } from '@/components/form'
import { EmptyState } from '@/components/system/EmptyState'
import { Panel, Skeleton } from '@/components/ui'
import { DerivationNote, MetricControl } from '@/features/dashboard-analytics/components/AnalyticsControls'
import { metricProjection, type AnalyticsMetric } from '@/features/dashboard-analytics/presentation'
import { TOP_USER_LIMITS, type UserTotals } from '@/features/dashboard-analytics/users'

const CHART_ROW_HEIGHT = 28

type UserRankingPanelProps = {
  /** Already ranked and truncated to `limit` by the page. */
  ranked: readonly UserTotals[]
  /** Distinct users the response mentioned at all, for the "of N" caption. */
  totalUsers: number
  limit: number
  onLimitChange: (limit: number) => void
  metric: AnalyticsMetric
  onMetricChange: (metric: AnalyticsMetric) => void
  quotaPerUnit: number
  isPending: boolean
  isFetching: boolean
}

/** The label for a row `/api/data/users` attributed to no username at all. */
function userLabel(username: string, anonymous: string): string {
  return username === '' ? anonymous : username
}

export function UserRankingPanel(props: UserRankingPanelProps) {
  const { t } = useTranslation()
  const projection = metricProjection(props.metric, props.quotaPerUnit, t)
  const anonymous = t('Unattributed')

  const bars = props.ranked.map((user) => ({
    label: userLabel(user.username, anonymous),
    value: projection.toValue(user),
  }))

  return (
    <Panel>
      <Panel.Header
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              className="w-32"
              hideLabel
              label={t('Users shown')}
              onChange={(event) => props.onLimitChange(Number(event.target.value))}
              options={TOP_USER_LIMITS.map((limit) => ({
                value: String(limit),
                label: t('Top {{count}}', { count: limit }),
              }))}
              size="sm"
              value={String(props.limit)}
            />
            <MetricControl label={t('Ranking measure')} onChange={props.onMetricChange} value={props.metric} />
          </div>
        }
        description={t('Showing {{shown}} of {{total}} users that recorded traffic in this range.', {
          shown: props.ranked.length,
          total: props.totalUsers,
        })}
        title={t('User consumption ranking')}
      />
      <Panel.Body>
        {props.isPending ? (
          <Skeleton height={260} label={t('Loading the user ranking')} variant="block" />
        ) : null}

        {!props.isPending && bars.length === 0 ? (
          <EmptyState
            description={t('No user recorded any {{measure}} in this range.', {
              measure: projection.label.toLowerCase(),
            })}
            headingLevel={3}
            title={t('Nothing to rank')}
          />
        ) : null}

        {!props.isPending && bars.length > 0 ? (
          <div aria-busy={props.isFetching} className="flex flex-col gap-4">
            <BarChart
              axisWidth={140}
              categories={bars.map((bar) => bar.label)}
              categoryHeader={t('User')}
              formatValue={projection.format}
              height={Math.max(160, bars.length * CHART_ROW_HEIGHT)}
              label={t('{{measure}} by user', { measure: projection.label })}
              orientation="horizontal"
              series={[
                {
                  name: projection.label,
                  points: bars.map((bar, index) => ({ x: index, y: bar.value })),
                },
              ]}
              showLegend={false}
            />
            <DerivationNote>
              {t(
                'Ranked in this console: the rows of /api/data/users are summed per username, sorted by the selected measure and cut to TOP_N = {{limit}}. The endpoint returns neither an order nor a total.',
                { limit: props.limit },
              )}
            </DerivationNote>
          </div>
        ) : null}
      </Panel.Body>
    </Panel>
  )
}
