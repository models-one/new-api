import { useQuery } from '@tanstack/react-query'
import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import CoinsIcon from 'lucide-react/dist/esm/icons/coins'
import GaugeIcon from 'lucide-react/dist/esm/icons/gauge'
import { useTranslation } from 'react-i18next'

import { StatCard } from '@/components/ui'
import { scopedLogStatQuery, type AdminLogFilters, type LogScope } from '@/features/logs/api'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { formatNumber, formatQuota } from '@/lib/format'

/**
 * `GET /api/log/self/stat` and its admin twin `GET /api/log/stat` answer three numbers,
 * and none of them means quite what a naive caption would claim. Both routes call the
 * same `model.SumUsedQuota`, so both carry the same two caveats:
 *
 *   quota    respects username / token_name / model_name / channel / group and the
 *            timestamps, but the query appends `type = LogTypeConsume` unconditionally
 *            and never reads the `type` or `request_id` the caller sent.
 *   rpm/tpm  a live 60-second snapshot — `created_at >= now-60s` is pinned in
 *            model/log.go regardless of the timestamps sent.
 *
 * Labelling either as a total for the filtered window would misreport it.
 */
export function LogStatsStrip(props: { filters: AdminLogFilters; scope?: LogScope }) {
  const { t } = useTranslation()
  const quotaPerUnit = useQuotaPerUnit()
  const statQuery = useQuery(scopedLogStatQuery(props.filters, props.scope ?? 'mine'))

  const stat = statQuery.data
  const liveRateCaption = t('Live rate over the last 60 seconds, not a total for this view.')

  return (
    <section aria-label={t('Log totals')} className="grid gap-4 md:grid-cols-3">
      <StatCard
        footer={
          <>
            <span>{t('Matches the filters above.')}</span>{' '}
            <span>
              {t('Usage rows only — the server pins type=2 for this total and ignores the type filter.')}
            </span>
          </>
        }
        icon={<CoinsIcon aria-hidden="true" />}
        iconTone="primary"
        label={
          props.scope === 'everyone' ? t('Spend in this view (all users)') : t('Spend in this view')
        }
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
