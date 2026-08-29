import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import TrendingDownIcon from 'lucide-react/dist/esm/icons/trending-down'
import WalletCardsIcon from 'lucide-react/dist/esm/icons/wallet-cards'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, Button, IconBadge, Panel, Skeleton } from '@/components/ui'
import { selfQuotaDataQuery } from '@/lib/api/usage-data'
import { selfUserQuery } from '@/lib/api/user'
import { formatQuota, quotaToCurrency, splitCurrency } from '@/lib/format'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { QueryErrorAlert } from '@/features/dashboard/components/QueryErrorAlert'
import {
  RUNOUT_WINDOW_SECONDS,
  estimateRunoutDays,
  formatRunoutDays,
} from '@/features/dashboard/estimates'

type BalanceCardProps = {
  /** Shared hour-aligned window end so this card and the volume chart cache together. */
  windowEnd: number
}

export function BalanceCard(props: BalanceCardProps) {
  const { t } = useTranslation()
  const quotaPerUnit = useQuotaPerUnit()
  const labelId = useId()

  const user = useQuery(selfUserQuery())
  const recentUsage = useQuery(
    selfQuotaDataQuery(props.windowEnd - RUNOUT_WINDOW_SECONDS, props.windowEnd),
  )

  const balance = user.data ? quotaToCurrency(user.data.quota, quotaPerUnit) : 0
  const { whole, fraction } = splitCurrency(balance)

  const spentLastDay = (recentUsage.data ?? []).reduce((total, point) => total + point.quota, 0)
  const runoutDays = user.data ? estimateRunoutDays(user.data.quota, spentLastDay) : null

  return (
    <Panel
      aria-busy={user.isFetching}
      aria-labelledby={labelId}
      className="flex min-h-[350px] flex-col p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <IconBadge icon={<WalletCardsIcon />} tone="primary" />
        {user.data ? (
          <Badge tone="muted">{t('Group {{group}}', { group: user.data.group })}</Badge>
        ) : null}
      </div>

      <p className="mt-7 text-sm text-muted" id={labelId}>
        {t('Current balance')}
      </p>

      {user.isError ? (
        <QueryErrorAlert
          className="mt-4"
          error={user.error}
          isRetrying={user.isFetching}
          onRetry={() => void user.refetch()}
        />
      ) : null}

      {user.isPending ? (
        <Skeleton className="mt-3" height={48} label={t('Loading results')} variant="block" width="70%" />
      ) : null}

      {user.data ? (
        <>
          <p className="mono mt-1 text-5xl font-bold text-foreground">
            {whole}
            <span className="text-lg text-muted">{fraction}</span>
          </p>

          {recentUsage.isPending ? (
            <Skeleton className="mt-4" height={14} variant="block" width="60%" />
          ) : null}

          {runoutDays === null ? null : (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-primary">
              <TrendingDownIcon aria-hidden="true" className="size-4 shrink-0" />
              {t('Estimated {{days}} days left at the last 24 hours of spend', {
                days: formatRunoutDays(runoutDays),
              })}
            </p>
          )}

          <p className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-4 text-sm text-muted">
            {t('Total consumed')}
            <span className="mono text-foreground">
              {formatQuota(user.data.used_quota, quotaPerUnit)}
            </span>
          </p>
        </>
      ) : null}

      <Button className="mt-auto w-full" render={<Link to="/wallet" />} variant="outline">
        {t('Top up balance')}
      </Button>
    </Panel>
  )
}
