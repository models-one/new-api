import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import CoinsIcon from 'lucide-react/dist/esm/icons/coins'
import LayersIcon from 'lucide-react/dist/esm/icons/layers'
import WalletIcon from 'lucide-react/dist/esm/icons/wallet'
import { useTranslation } from 'react-i18next'

import { Panel, Skeleton, StatCard } from '@/components/ui'
import { formatCompactNumber, formatQuota, formatTokens } from '@/lib/format'

type TotalsRowProps = {
  totals: { quota: number; tokens: number; requests: number }
  quotaPerUnit: number
  /** Caption under every card, e.g. "Last 7 days". */
  caption: string
  /** Fourth card: the row/series count the response produced. */
  breakdown: { label: string; value: number }
}

export function TotalsRow(props: TotalsRowProps) {
  const { t } = useTranslation()

  return (
    <section
      aria-label={t('Range totals')}
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <StatCard
        footer={props.caption}
        icon={<WalletIcon />}
        iconTone="primary"
        label={t('Spend')}
        value={formatQuota(props.totals.quota, props.quotaPerUnit)}
      />
      <StatCard
        footer={props.caption}
        icon={<CoinsIcon />}
        iconTone="info"
        label={t('Tokens')}
        value={formatTokens(props.totals.tokens)}
      />
      <StatCard
        footer={props.caption}
        icon={<ActivityIcon />}
        iconTone="success"
        label={t('Requests')}
        value={formatCompactNumber(props.totals.requests)}
      />
      <StatCard
        footer={props.caption}
        icon={<LayersIcon />}
        iconTone="secondary"
        label={props.breakdown.label}
        value={formatCompactNumber(props.breakdown.value)}
      />
    </section>
  )
}

export function TotalsRowSkeleton() {
  const { t } = useTranslation()

  return (
    <div aria-busy="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status">
      <span className="sr-only">{t('Loading totals')}</span>
      {[0, 1, 2, 3].map((slot) => (
        <Panel as="div" className="p-6" key={slot}>
          <Skeleton width="40%" />
          <Skeleton className="mt-5" height={32} variant="block" width="65%" />
          <Skeleton className="mt-6" width="50%" />
        </Panel>
      ))}
    </div>
  )
}
