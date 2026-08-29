import GaugeIcon from 'lucide-react/dist/esm/icons/gauge'
import ReceiptTextIcon from 'lucide-react/dist/esm/icons/receipt-text'
import TrendingUpIcon from 'lucide-react/dist/esm/icons/trending-up'
import { useTranslation } from 'react-i18next'

import { Panel, Skeleton, StatCard } from '@/components/ui'
import { projectMonthlyQuota, type BillingWindow } from '@/features/usage/billing-month'
import type { UsageTotals } from '@/features/usage/usage'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatTokens,
  quotaToCurrency,
  splitCurrency,
} from '@/lib/format'

type SpendSummaryProps = {
  totals: UsageTotals
  window: BillingWindow
  quotaPerUnit: number
  isFetching: boolean
}

/** Renders "$85" large with ".67" reduced, the way the console shows money. */
function CurrencyValue(props: { amount: number }) {
  const split = splitCurrency(props.amount)
  return (
    <>
      {split.whole}
      <span className="text-2xl font-bold text-muted">{split.fraction}</span>
    </>
  )
}

export function SpendSummarySkeleton() {
  const { t } = useTranslation()

  // StatCard renders its value inside a <p>, so the loading pass uses plain panels
  // rather than nesting block-level placeholders in a paragraph.
  return (
    <div aria-busy="true" className="grid gap-4 md:grid-cols-3" role="status">
      <span className="sr-only">{t('Loading your spend')}</span>
      {[t('Current spend'), t('Projected spend (estimate)'), t('Requests')].map((label) => (
        <Panel as="div" className="flex flex-col p-6" key={label}>
          <p className="eyebrow">{label}</p>
          <Skeleton className="mt-4" height={36} variant="block" width={128} />
          <Skeleton className="mt-6" height={12} variant="block" width={160} />
        </Panel>
      ))}
    </div>
  )
}

export function SpendSummary(props: SpendSummaryProps) {
  const { t, i18n } = useTranslation()

  const spend = quotaToCurrency(props.totals.quota, props.quotaPerUnit)
  const projectedQuota = projectMonthlyQuota(props.totals.quota, props.window)
  const chartedDays = Math.max(0, Math.floor(props.window.chartedDays))

  return (
    <div
      aria-busy={props.isFetching}
      className={projectedQuota === null ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4 md:grid-cols-3'}
    >
      <StatCard
        footer={t('Recorded usage from {{start}} to {{end}}', {
          end: formatDate(props.window.end, i18n.language),
          start: formatDate(props.window.start, i18n.language),
        })}
        icon={<GaugeIcon />}
        iconTone="primary"
        label={t('Current spend')}
        value={<CurrencyValue amount={spend} />}
      />

      {projectedQuota === null ? null : (
        <StatCard
          footer={t(
            'Estimated in this console: the {{spend}} above spread over {{days}} charted days, then extended to all {{total}} days of the month.',
            {
              days: chartedDays,
              spend: formatCurrency(spend),
              total: props.window.daysInMonth,
            },
          )}
          icon={<TrendingUpIcon />}
          iconTone="secondary"
          label={t('Projected spend (estimate)')}
          value={<CurrencyValue amount={quotaToCurrency(projectedQuota, props.quotaPerUnit)} />}
        />
      )}

      <StatCard
        footer={t('{{tokens}} tokens in the same window', {
          tokens: formatTokens(props.totals.tokens),
        })}
        icon={<ReceiptTextIcon />}
        iconTone="info"
        label={t('Requests')}
        value={formatNumber(props.totals.requests)}
      />
    </div>
  )
}
