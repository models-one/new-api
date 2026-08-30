import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import CalendarCheckIcon from 'lucide-react/dist/esm/icons/calendar-check'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage, toast } from '@/components/overlay'
import { EmptyState } from '@/components/system/EmptyState'
import { Turnstile } from '@/components/system/Turnstile'
import {
  Alert,
  Badge,
  Button,
  DescriptionList,
  IconBadge,
  Panel,
  Skeleton,
  type DescriptionListItem,
} from '@/components/ui'
import { useAuthServerConfig } from '@/features/auth/server-config'
import {
  checkinMonthKey,
  checkinStatusQuery,
  performCheckin,
  type CheckinRecord,
} from '@/features/profile/identity-api'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { selfUserQuery } from '@/lib/api/user'
import { formatQuota } from '@/lib/format'

/**
 * The daily check-in, rendered only where the operator turned it on.
 *
 * `GET /api/user/checkin` refuses outright when `checkin_setting.enabled` is false — it
 * answers `{"success":false,"message":"签到功能未启用"}` with no payload — so the caller
 * gates on `/api/status`'s `checkin_enabled` instead of probing and swallowing the refusal.
 *
 * Shapes verified live by enabling the setting on the dev server and restoring it after.
 */

/**
 * Check-in rewards are deliberately tiny — the shipped default is 1000-10000 quota, which
 * is $0.002-$0.02. At the console's usual two decimals the floor renders as "$0.00", so
 * every figure on this panel is shown to four.
 */
const CHECKIN_AMOUNT_DIGITS = 4

/** Sums the quota the server itself reported for each claimed day of the queried month. */
export function sumMonthlyQuota(records: readonly CheckinRecord[]): number {
  return records.reduce((total, record) => total + record.quota_awarded, 0)
}

export function CheckInPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const quotaPerUnit = useQuotaPerUnit()
  const { config } = useAuthServerConfig()

  // Fixed at mount: a month that changed mid-session would silently swap the data under a
  // heading that still names the old one.
  const [month] = useState(() => checkinMonthKey(new Date()))
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileKey, setTurnstileKey] = useState(0)

  const statusQuery = useQuery(checkinStatusQuery(month))
  const turnstileReady = !config.turnstileEnabled || turnstileToken !== ''

  const claim = useMutation({
    mutationFn: () => performCheckin(turnstileToken),
    onError: (failure: unknown) => toast.error(toErrorMessage(failure)),
    onSettled: () => {
      if (!config.turnstileEnabled) return
      setTurnstileToken('')
      setTurnstileKey((current) => current + 1)
    },
    onSuccess: async (result) => {
      toast.success(t('Checked in — {{amount}} added to your balance.', {
        amount: formatQuota(result.quota_awarded, quotaPerUnit, CHECKIN_AMOUNT_DIGITS),
      }))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: checkinStatusQuery(month).queryKey }),
        queryClient.invalidateQueries({ queryKey: selfUserQuery().queryKey }),
      ])
    },
  })

  const header = (
    <Panel.Header
      description={t('Claim a small quota reward once a day.')}
      icon={<IconBadge icon={<CalendarCheckIcon />} size="sm" tone="success" />}
      title={t('Daily check-in')}
    />
  )

  if (statusQuery.isError) {
    return (
      <Panel>
        {header}
        <Panel.Body className="p-6">
          <Alert
            action={
              <Button
                aria-busy={statusQuery.isFetching}
                disabled={statusQuery.isFetching}
                onClick={() => void statusQuery.refetch()}
                size="sm"
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            title={t('Check-in could not be loaded')}
            tone="destructive"
          >
            {toErrorMessage(statusQuery.error)}
          </Alert>
        </Panel.Body>
      </Panel>
    )
  }

  const status = statusQuery.data

  if (status === undefined) {
    return (
      <Panel>
        {header}
        <Panel.Body aria-busy="true" className="flex flex-col gap-4 p-6" role="status">
          <span className="sr-only">{t('Loading check-in')}</span>
          <Skeleton height={40} variant="block" />
          <Skeleton height={120} variant="block" />
        </Panel.Body>
      </Panel>
    )
  }

  const { records } = status.stats
  const monthlyQuota = sumMonthlyQuota(records)
  const claimedToday = status.stats.checked_in_today

  const stats: DescriptionListItem[] = [
    {
      description: `${formatQuota(status.min_quota, quotaPerUnit, CHECKIN_AMOUNT_DIGITS)} – ${formatQuota(status.max_quota, quotaPerUnit, CHECKIN_AMOUNT_DIGITS)}`,
      id: 'range',
      term: t('Reward range'),
    },
    { description: status.stats.checkin_count, id: 'month-count', term: t('Days claimed this month') },
    { description: status.stats.total_checkins, id: 'total-count', term: t('Days claimed in total') },
    {
      description: formatQuota(status.stats.total_quota, quotaPerUnit, CHECKIN_AMOUNT_DIGITS),
      id: 'total-quota',
      term: t('Earned in total'),
    },
    {
      description: formatQuota(monthlyQuota, quotaPerUnit, CHECKIN_AMOUNT_DIGITS),
      id: 'month-quota',
      term: t('Earned this month'),
    },
  ]

  return (
    <Panel>
      {header}
      <Panel.Body aria-busy={statusQuery.isFetching} className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone={claimedToday ? 'success' : 'muted'}>
            {claimedToday ? t('Claimed today') : t('Not claimed today')}
          </Badge>
          <Button
            aria-busy={claim.isPending}
            disabled={claimedToday || claim.isPending || !turnstileReady}
            onClick={() => claim.mutate()}
          >
            {claimedToday ? t('Come back tomorrow') : t('Check in')}
          </Button>
        </div>

        {config.turnstileEnabled ? (
          <Turnstile
            onExpire={() => setTurnstileToken('')}
            onVerify={setTurnstileToken}
            refreshKey={turnstileKey}
            siteKey={config.turnstileSiteKey}
          />
        ) : null}

        <DescriptionList items={stats} label={t('Check-in totals')} />

        <p className="text-xs leading-5 text-muted">
          {t('"Earned this month" is added up in this page: the sum of quota_awarded across the {{count}} records the server returned for {{month}}. Every other figure comes straight from the server.', {
            count: records.length,
            month,
          })}
        </p>

        {records.length === 0 ? (
          <EmptyState
            description={t('Nothing has been claimed in {{month}} yet.', { month })}
            headingLevel={3}
            title={t('No check-ins this month')}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {records.map((record) => (
              <li
                className="flex items-center justify-between gap-4 rounded-[4px] border border-border px-4 py-2 text-sm"
                key={record.checkin_date}
              >
                <span className="mono text-muted">{record.checkin_date}</span>
                <span className="mono font-bold text-foreground">
                  {formatQuota(record.quota_awarded, quotaPerUnit, CHECKIN_AMOUNT_DIGITS)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel.Body>
    </Panel>
  )
}
