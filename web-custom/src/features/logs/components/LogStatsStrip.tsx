import { useQuery } from '@tanstack/react-query'
import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import CoinsIcon from 'lucide-react/dist/esm/icons/coins'
import GaugeIcon from 'lucide-react/dist/esm/icons/gauge'
import { useTranslation } from 'react-i18next'

import { StatCard } from '@/components/ui'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { logStatQuery, type LogFilters } from '@/lib/api/logs'
import { formatNumber, formatQuota } from '@/lib/format'

/**
 * `GET /api/log/self/stat` answers three numbers, and only ONE of them respects the
 * filters: `quota` is the spend over the requested window, while `rpm` and `tpm` are a
 * live 60-second snapshot — model/log.go pins `created_at >= now-60s` regardless of the
 * timestamps sent. Labelling those as range totals would misreport them, so they are
 * captioned as a live rate instead.
 */
export function LogStatsStrip(props: { filters: LogFilters }) {
  const { t } = useTranslation()
  const quotaPerUnit = useQuotaPerUnit()
  const statQuery = useQuery(logStatQuery(props.filters))

  const stat = statQuery.data
  const liveRateCaption = t('Live rate over the last 60 seconds, not a total for this view.')

  return (
    <section aria-label={t('Log totals')} className="grid gap-4 md:grid-cols-3">
      <StatCard
        footer={t('Matches the filters above.')}
        icon={<CoinsIcon aria-hidden="true" />}
        iconTone="primary"
        label={t('Spend in this view')}
        value={stat === undefined ? '—' : formatQuota(stat.quota, quotaPerUnit)}
      />
      <StatCard
        footer={liveRateCaption}
        icon={<ActivityIcon aria-hidden="true" />}
        iconTone="info"
        label={t('Requests per minute')}
        value={stat === undefined ? '—' : formatNumber(stat.rpm)}
      />
      <StatCard
        footer={liveRateCaption}
        icon={<GaugeIcon aria-hidden="true" />}
        iconTone="secondary"
        label={t('Tokens per minute')}
        value={stat === undefined ? '—' : formatNumber(stat.tpm)}
      />
    </section>
  )
}
