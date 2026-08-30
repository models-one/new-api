import { useQuery } from '@tanstack/react-query'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, PageHeader } from '@/components/ui'
import {
  AnalyticsErrorAlert,
  RangeControl,
  useRangeLabels,
} from '@/features/dashboard-analytics/components/AnalyticsControls'
import { ModelMixPanel } from '@/features/dashboard-analytics/components/ModelMixPanel'
import { TotalsRow, TotalsRowSkeleton } from '@/features/dashboard-analytics/components/TotalsRow'
import { UserBreakdownTable } from '@/features/dashboard-analytics/components/UserBreakdownTable'
import { UserRankingPanel } from '@/features/dashboard-analytics/components/UserRankingPanel'
import { TREND_SERIES_LIMIT, UserTrendPanel } from '@/features/dashboard-analytics/components/UserTrendPanel'
import { ADMIN_ROLE, useConsoleAccess } from '@/features/dashboard-analytics/access'
import { allQuotaQuery, usersQuotaQuery } from '@/features/dashboard-analytics/api'
import type { AnalyticsMetric } from '@/features/dashboard-analytics/presentation'
import { alignedWindowEnd, resolveDataWindow, type DataRangeId } from '@/features/dashboard-analytics/range'
import {
  aggregateByModel,
  aggregateByUser,
  buildUserTrends,
  rankUsers,
  sumUsage,
} from '@/features/dashboard-analytics/users'
import { useQuotaPerUnit, useServerStatus } from '@/hooks/use-server-status'

const DEFAULT_TOP_N = 10

const PAGE_DESCRIPTION_KEY = 'Who is consuming the platform, and on which models, over the range you pick.'

export function UserAnalyticsPage() {
  const { t } = useTranslation()
  const quotaPerUnit = useQuotaPerUnit()
  const rangeLabels = useRangeLabels()
  const access = useConsoleAccess(ADMIN_ROLE)

  const [rangeId, setRangeId] = useState<DataRangeId>('7d')
  const [metric, setMetric] = useState<AnalyticsMetric>('quota')
  const [limit, setLimit] = useState(DEFAULT_TOP_N)

  // Resolved once per range: the end is pinned to a 5 minute grid, and memoising
  // keeps the object identity stable so the query keys and the trend memo below
  // do not churn on every render.
  const dataWindow = useMemo(() => resolveDataWindow(rangeId, alignedWindowEnd()), [rangeId])
  const isAdmin = access.state === 'granted'

  const usersQuery = useQuery({ ...usersQuotaQuery(dataWindow.start, dataWindow.end), enabled: isAdmin })
  const modelsQuery = useQuery({ ...allQuotaQuery(dataWindow.start, dataWindow.end), enabled: isAdmin })

  const points = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  const users = useMemo(() => aggregateByUser(points), [points])
  const totals = useMemo(() => sumUsage(points), [points])
  const ranked = useMemo(() => rankUsers(users, metric, limit), [limit, metric, users])
  const trends = useMemo(
    () => buildUserTrends(points, ranked.slice(0, TREND_SERIES_LIMIT).map((user) => user.username), dataWindow),
    [dataWindow, points, ranked],
  )
  const models = useMemo(() => aggregateByModel(modelsQuery.data ?? []), [modelsQuery.data])

  const { data: serverStatus } = useServerStatus()

  if (access.state === 'checking') {
    return (
      <div aria-busy="true" className="flex flex-col gap-8" role="status">
        <span className="sr-only">{t('Checking your permissions')}</span>
        <PageHeader description={t(PAGE_DESCRIPTION_KEY)} title={t('User analytics')} />
      </div>
    )
  }

  if (access.state === 'unavailable') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={t(PAGE_DESCRIPTION_KEY)} title={t('User analytics')} />
        <AnalyticsErrorAlert
          error={access.error}
          isRetrying={access.isRefetching}
          onRetry={access.retry}
          title={t('Could not confirm your permissions')}
        />
      </div>
    )
  }

  if (access.state === 'denied') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={t(PAGE_DESCRIPTION_KEY)} title={t('User analytics')} />
        <Alert
          icon={<ShieldAlertIcon aria-hidden="true" />}
          title={t('Administrator access required')}
          tone="warning"
        >
          {t('Both endpoints behind this page sit behind the administrator guard, so it has nothing to show for your account. Your own traffic is on the traffic flow page.')}
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={<RangeControl onChange={setRangeId} value={rangeId} />}
        description={t(PAGE_DESCRIPTION_KEY)}
        title={t('User analytics')}
      />

      {serverStatus?.enable_data_export === false ? (
        <Alert
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Usage collection is turned off')}
          tone="warning"
        >
          {t('This server records no usage data, so both endpoints return nothing and every panel below stays empty.')}
        </Alert>
      ) : null}

      {usersQuery.isError ? (
        <AnalyticsErrorAlert
          error={usersQuery.error}
          isRetrying={usersQuery.isFetching}
          onRetry={() => void usersQuery.refetch()}
          title={t('User consumption could not be loaded')}
        />
      ) : null}

      {usersQuery.isError ? null : (
        <>
          {usersQuery.isPending ? (
            <TotalsRowSkeleton />
          ) : (
            <TotalsRow
              breakdown={{ label: t('Users'), value: users.length }}
              caption={t('Last {{range}}', { range: rangeLabels.long[rangeId] })}
              quotaPerUnit={quotaPerUnit}
              totals={totals}
            />
          )}

          <UserRankingPanel
            isFetching={usersQuery.isFetching}
            isPending={usersQuery.isPending}
            limit={limit}
            metric={metric}
            onLimitChange={setLimit}
            onMetricChange={setMetric}
            quotaPerUnit={quotaPerUnit}
            ranked={ranked}
            totalUsers={users.length}
          />

          <UserTrendPanel
            isFetching={usersQuery.isFetching}
            isPending={usersQuery.isPending}
            metric={metric}
            quotaPerUnit={quotaPerUnit}
            trends={trends}
            window={dataWindow}
          />

          <UserBreakdownTable
            isFetching={usersQuery.isFetching}
            isPending={usersQuery.isPending}
            quotaPerUnit={quotaPerUnit}
            users={users}
          />
        </>
      )}

      <ModelMixPanel
        error={modelsQuery.error}
        isError={modelsQuery.isError}
        isFetching={modelsQuery.isFetching}
        isPending={modelsQuery.isPending}
        metric={metric}
        models={models}
        onRetry={() => void modelsQuery.refetch()}
        quotaPerUnit={quotaPerUnit}
      />
    </div>
  )
}
