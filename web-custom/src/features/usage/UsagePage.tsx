import { useQuery } from '@tanstack/react-query'
import InfoIcon from 'lucide-react/dist/esm/icons/info'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NativeSelect } from '@/components/form'
import { Alert, PageHeader, Panel } from '@/components/ui'
import {
  MIN_PROJECTION_DAYS,
  formatBillingMonth,
  projectMonthlyQuota,
  recentBillingMonths,
  resolveBillingWindow,
} from '@/features/usage/billing-month'
import { KeySpendPanel } from '@/features/usage/components/KeySpendPanel'
import { ModelUsagePanel } from '@/features/usage/components/ModelUsagePanel'
import { OrderHistoryPanel } from '@/features/usage/components/OrderHistoryPanel'
import { SpendSummary, SpendSummarySkeleton } from '@/features/usage/components/SpendSummary'
import { UsageErrorAlert } from '@/features/usage/components/UsageErrorAlert'
import { aggregateByToken, selfFlowQuery, sumFlowQuota } from '@/features/usage/flow'
import { buildModelSpend } from '@/features/usage/usage'
import { useQuotaPerUnit, useServerStatus } from '@/hooks/use-server-status'
import { selfQuotaDataQuery } from '@/lib/api/usage-data'
import { formatDate } from '@/lib/format'

export function UsagePage() {
  const { t, i18n } = useTranslation()

  // Pinned at mount so the option list cannot shift underneath the selection.
  const months = useMemo(() => recentBillingMonths(new Date()), [])
  const [selectedId, setSelectedId] = useState(months[0].id)
  const selectedMonth = months.find((month) => month.id === selectedId) ?? months[0]

  // Recomputed every render, but the window end is floored to the hour, so the
  // query keys below stay stable instead of changing on each pass.
  const billingWindow = resolveBillingWindow(selectedMonth, new Date())

  const usageQuery = useQuery(selfQuotaDataQuery(billingWindow.start, billingWindow.end))
  const flowQuery = useQuery(selfFlowQuery(billingWindow.start, billingWindow.end))
  const { data: serverStatus } = useServerStatus()
  const quotaPerUnit = useQuotaPerUnit()

  const spend = buildModelSpend(usageQuery.data ?? [])
  const flowRows = flowQuery.data ?? []
  const keys = aggregateByToken(flowRows)
  // Only meaningful once BOTH answers are in: comparing a loaded total against a
  // still-empty one would report the whole window as unattributed.
  const unattributedQuota =
    usageQuery.data && flowQuery.data
      ? Math.max(0, spend.totals.quota - sumFlowQuota(flowRows))
      : 0

  const windowStart = formatDate(billingWindow.start, i18n.language)
  const windowEnd = formatDate(billingWindow.end, i18n.language)
  const monthLabel = formatBillingMonth(selectedMonth, i18n.language)

  const awaitingProjection =
    billingWindow.isCurrentMonth
    && !usageQuery.isPending
    && !usageQuery.isError
    && spend.totals.quota > 0
    && projectMonthlyQuota(spend.totals.quota, billingWindow) === null

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={(
          <NativeSelect
            hideLabel
            label={t('Billing month')}
            onChange={(event) => setSelectedId(event.target.value)}
            options={months.map((month) => ({
              label: formatBillingMonth(month, i18n.language),
              value: month.id,
            }))}
            size="sm"
            value={selectedId}
          />
        )}
        description={t('Your API spend for the selected month, and your recent top-up orders.')}
        title={t('Usage and billing')}
      />

      {billingWindow.clamped ? (
        <Alert
          icon={<InfoIcon />}
          title={t('Only 30 days of {{month}} can be charted', { month: monthLabel })}
          tone="info"
        >
          {t(
            'One usage request may cover at most 30 days, so this page charts {{start}} to {{end}} and leaves out the earlier days of the month.',
            { end: windowEnd, start: windowStart },
          )}
        </Alert>
      ) : null}

      {serverStatus?.enable_data_export === false ? (
        <Alert
          icon={<TriangleAlertIcon />}
          title={t('Usage collection is turned off')}
          tone="warning"
        >
          {t(
            'This server has usage data collection disabled, so no per-model usage is recorded and the charts below stay empty.',
          )}
        </Alert>
      ) : null}

      {usageQuery.isError ? (
        <UsageErrorAlert
          error={usageQuery.error}
          isRetrying={usageQuery.isFetching}
          onRetry={() => void usageQuery.refetch()}
          title={t('Your usage could not be loaded')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {usageQuery.isPending ? (
            <SpendSummarySkeleton />
          ) : (
            <SpendSummary
              isFetching={usageQuery.isFetching}
              quotaPerUnit={quotaPerUnit}
              totals={spend.totals}
              window={billingWindow}
            />
          )}

          {awaitingProjection ? (
            <p className="text-xs leading-5 text-muted">
              {t(
                'A projection appears once this month has {{days}} full day of recorded usage.',
                { days: MIN_PROJECTION_DAYS },
              )}
            </p>
          ) : null}
        </div>
      )}

      <div className={usageQuery.isError ? 'grid gap-5' : 'grid gap-5 xl:grid-cols-[1fr_340px]'}>
        {usageQuery.isError ? null : (
          <ModelUsagePanel
            isFetching={usageQuery.isFetching}
            isPending={usageQuery.isPending}
            models={spend.models}
            quotaPerUnit={quotaPerUnit}
          />
        )}

        {flowQuery.isError ? (
          <Panel className="p-6">
            <h2 className="text-lg font-bold">{t('Top API keys')}</h2>
            <UsageErrorAlert
              className="mt-4"
              error={flowQuery.error}
              isRetrying={flowQuery.isFetching}
              onRetry={() => void flowQuery.refetch()}
              title={t('Spend per key could not be loaded')}
            />
          </Panel>
        ) : (
          <KeySpendPanel
            isFetching={flowQuery.isFetching}
            isPending={flowQuery.isPending}
            keys={keys}
            quotaPerUnit={quotaPerUnit}
            unattributedQuota={unattributedQuota}
          />
        )}
      </div>

      <OrderHistoryPanel />
    </div>
  )
}
