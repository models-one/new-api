import { useQuery } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LineChart, formatTimeTick } from '@/components/chart'
import type { ChartSeries } from '@/components/chart'
import { Panel, SegmentedControl, Skeleton } from '@/components/ui'
import type { SegmentedControlOption } from '@/components/ui'
import { aggregateByHour, selfQuotaDataQuery } from '@/lib/api/usage-data'
import { QueryErrorAlert } from '@/features/dashboard/components/QueryErrorAlert'
import { VOLUME_RANGE_SECONDS, type VolumeRange } from '@/features/dashboard/estimates'

/**
 * Requests and tokens share one axis, so tokens are plotted in thousands. The
 * series name and the panel description both state the unit.
 */
const TOKENS_PER_CHART_UNIT = 1_000

const CHART_HEIGHT = 208

type ApiVolumePanelProps = {
  /** Shared hour-aligned window end, so `24h` reuses the balance card's query. */
  windowEnd: number
}

export function ApiVolumePanel(props: ApiVolumePanelProps) {
  const { t, i18n } = useTranslation()
  const titleId = useId()
  const [range, setRange] = useState<VolumeRange>('7d')

  const windowSeconds = VOLUME_RANGE_SECONDS[range]
  const usage = useQuery(selfQuotaDataQuery(props.windowEnd - windowSeconds, props.windowEnd))

  const series = useMemo<ChartSeries[]>(() => {
    const hours = aggregateByHour(usage.data ?? [])
    return [
      {
        name: t('Requests'),
        tone: 'primary',
        points: hours.map((hour) => ({ x: hour.x, y: hour.requests })),
      },
      {
        name: t('Tokens (thousands)'),
        tone: 'secondary',
        dashed: true,
        points: hours.map((hour) => ({ x: hour.x, y: hour.tokens / TOKENS_PER_CHART_UNIT })),
      },
    ]
  }, [t, usage.data])

  const rangeOptions: SegmentedControlOption<VolumeRange>[] = [
    { id: '24h', label: t('24h') },
    { id: '7d', label: t('7d') },
    { id: '30d', label: t('30d') },
  ]

  return (
    <Panel aria-busy={usage.isFetching} aria-labelledby={titleId} className="min-h-[350px] p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold" id={titleId}>
            {t('API volume')}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {t('Requests per hour, with tokens in thousands so both share one scale')}
          </p>
        </div>
        <SegmentedControl
          label={t('Chart range')}
          onChange={setRange}
          options={rangeOptions}
          size="sm"
          value={range}
        />
      </div>

      {usage.isError ? (
        <QueryErrorAlert
          className="mt-8"
          error={usage.error}
          isRetrying={usage.isFetching}
          onRetry={() => void usage.refetch()}
        />
      ) : null}

      {usage.isPending ? (
        <Skeleton
          className="mt-8"
          height={CHART_HEIGHT}
          label={t('Loading results')}
          variant="block"
        />
      ) : null}

      {usage.isSuccess ? (
        <LineChart
          categoryHeader={t('Time')}
          className="mt-6"
          emptyLabel={t('No usage in this period')}
          formatX={(value) => formatTimeTick(value * 1000, windowSeconds * 1000, i18n.language)}
          height={CHART_HEIGHT}
          label={t('API volume chart')}
          series={series}
        />
      ) : null}
    </Panel>
  )
}
