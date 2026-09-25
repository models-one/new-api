import { useQuery } from '@tanstack/react-query'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SearchInput } from '@/components/form'
import { Alert, Badge, Button, PageHeader, SegmentedControl, type SegmentedControlOption } from '@/components/ui'
import {
  AnalyticsErrorAlert,
  DerivationNote,
  RangeControl,
  useRangeLabels,
} from '@/features/dashboard-analytics/components/AnalyticsControls'
import { FlowPathTable } from '@/features/dashboard-analytics/components/FlowPathTable'
import { FlowStagePanel } from '@/features/dashboard-analytics/components/FlowStagePanel'
import { TotalsRow, TotalsRowSkeleton } from '@/features/dashboard-analytics/components/TotalsRow'
import { useConsoleAccess } from '@/features/dashboard-analytics/access'
import { allFlowQuery, allQuotaQuery, selfFlowQuery } from '@/features/dashboard-analytics/api'
import {
  countActiveFilters,
  filterFlowRows,
  flowPaths,
  flowTotals,
  visibleFlowStages,
  type FlowFilters,
  type FlowStageKind,
} from '@/features/dashboard-analytics/flow'
import { alignedWindowEnd, resolveDataWindow, type DataRangeId } from '@/features/dashboard-analytics/range'
import type { AnalyticsMetric } from '@/features/dashboard-analytics/presentation'
import { useQuotaPerUnit, useServerStatus } from '@/hooks/use-server-status'
import { selfQuotaDataQuery } from '@/lib/api/usage-data'
import { formatQuota } from '@/lib/format'

/** `mine` reads `/api/data/flow/self`; `everyone` reads the admin `/api/data/flow`. */
type FlowScope = 'mine' | 'everyone'

export function FlowAnalyticsPage() {
  const { t } = useTranslation()
  const quotaPerUnit = useQuotaPerUnit()
  const rangeLabels = useRangeLabels()

  // Every signed-in user may open this page, so nothing is required; the role is
  // still needed because it decides which dimensions the payload will carry.
  const access = useConsoleAccess()

  const [rangeId, setRangeId] = useState<DataRangeId>('7d')
  const [metric, setMetric] = useState<AnalyticsMetric>('quota')
  const [scope, setScope] = useState<FlowScope>('mine')
  const [username, setUsername] = useState('')
  const [filters, setFilters] = useState<FlowFilters>({})

  // Resolved once per range: the end is pinned to a 5 minute grid, and memoising
  // keeps the object identity stable so the query keys below do not churn.
  const dataWindow = useMemo(() => resolveDataWindow(rangeId, alignedWindowEnd()), [rangeId])

  const isEveryone = access.isAdmin && scope === 'everyone'

  const selfQuery = useQuery({ ...selfFlowQuery(dataWindow.start, dataWindow.end), enabled: !isEveryone })
  const adminQuery = useQuery({
    ...allFlowQuery(dataWindow.start, dataWindow.end, username),
    enabled: isEveryone,
  })
  const flowQuery = isEveryone ? adminQuery : selfQuery

  /**
   * The same window through the NON-flow endpoint. Both flow routes filter
   * `use_group <> ''` (model/usedata_flow.go), so their totals are a subset:
   * comparing the two is the only way to show how much spend the breakdown
   * below cannot account for.
   */
  const coverageSelfQuery = useQuery({
    ...selfQuotaDataQuery(dataWindow.start, dataWindow.end),
    enabled: !isEveryone,
  })
  const coverageAllQuery = useQuery({
    ...allQuotaQuery(dataWindow.start, dataWindow.end, username),
    enabled: isEveryone,
  })
  const coverageQuery = isEveryone ? coverageAllQuery : coverageSelfQuery

  const rows = useMemo(() => flowQuery.data ?? [], [flowQuery.data])
  const stages = useMemo(() => visibleFlowStages(rows), [rows])
  const paths = useMemo(() => flowPaths(rows, stages, filters), [filters, rows, stages])
  const activeFilters = countActiveFilters(filters)

  // The cards describe the same rows the table lists, so a stage filter narrows
  // them too; otherwise the totals and the path count would disagree.
  const totals = useMemo(() => flowTotals(filterFlowRows(rows, filters)), [filters, rows])

  /**
   * Only meaningful against the UNFILTERED flow total: `/api/data/self` and
   * `/api/data/` know nothing about the stage filters, so subtracting a filtered
   * total from them would report every excluded path as ungrouped spend.
   */
  const coverageQuota = coverageQuery.data?.reduce((sum, point) => sum + point.quota, 0)
  const ungroupedQuota =
    coverageQuota === undefined || activeFilters > 0
      ? undefined
      : Math.max(0, coverageQuota - flowTotals(rows).quota)

  const handleFilterChange = useCallback((kind: FlowStageKind, nodeId: string) => {
    setFilters((current) => {
      const next: FlowFilters = { ...current }
      if (nodeId === '') delete next[kind]
      else next[kind] = nodeId
      return next
    })
  }, [])

  const handleScopeChange = useCallback((next: FlowScope) => {
    setScope(next)
    // Node ids are scoped to the response that produced them; keeping a token
    // filter across a scope switch would silently blank the table.
    setFilters({})
  }, [])

  const scopeOptions: SegmentedControlOption<FlowScope>[] = [
    { id: 'mine', label: t('My traffic') },
    { id: 'everyone', label: t('Everyone') },
  ]

  const { data: serverStatus } = useServerStatus()

  if (access.state === 'unavailable') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={t('How your requests move from key to group to model.')} title={t('Traffic flow')} />
        <AnalyticsErrorAlert
          error={access.error}
          isRetrying={access.isRefetching}
          onRetry={access.retry}
          title={t('Could not confirm your permissions')}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={<RangeControl onChange={setRangeId} value={rangeId} />}
        description={t('How requests move from key to group to model, for the range you pick.')}
        title={t('Traffic flow')}
      />

      {serverStatus?.enable_data_export === false ? (
        <Alert
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Usage collection is turned off')}
          tone="warning"
        >
          {t('This server records no usage data, so the flow endpoints have nothing to return and every panel below stays empty.')}
        </Alert>
      ) : null}

      {access.isAdmin ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <SegmentedControl
            label={t('Traffic scope')}
            onChange={handleScopeChange}
            options={scopeOptions}
            value={scope}
          />
          {isEveryone ? (
            <SearchInput
              className="sm:w-72"
              debounceMs={400}
              hideLabel
              label={t('Filter by exact username')}
              onValueChange={setUsername}
              placeholder={t('Exact username')}
            />
          ) : null}
        </div>
      ) : null}

      {isEveryone && username !== '' && rows.length === 0 && flowQuery.isSuccess ? (
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} title={t('No traffic for that username')} tone="warning">
          {t('The server matches the username exactly, so a partial name returns nothing. Check the spelling.')}
        </Alert>
      ) : null}

      {flowQuery.isError ? (
        <AnalyticsErrorAlert
          error={flowQuery.error}
          isRetrying={flowQuery.isFetching}
          onRetry={() => void flowQuery.refetch()}
          title={t('The traffic flow could not be loaded')}
        />
      ) : null}

      {flowQuery.isError ? null : (
        <>
          {flowQuery.isPending ? (
            <TotalsRowSkeleton />
          ) : (
            <div className="flex flex-col gap-3">
              <TotalsRow
                breakdown={{ label: t('Paths'), value: paths.length }}
                caption={t('Last {{range}}', { range: rangeLabels.long[rangeId] })}
                quotaPerUnit={quotaPerUnit}
                totals={totals}
              />
              {ungroupedQuota !== undefined && ungroupedQuota > 0 ? (
                <DerivationNote>
                  {t(
                    'The flow endpoint only counts usage recorded with a group. {{amount}} of spend in this range carries none and is missing from every panel below: computed here as the total from {{endpoint}} minus the flow total.',
                    {
                      amount: formatQuota(ungroupedQuota, quotaPerUnit),
                      endpoint: isEveryone ? '/api/data/' : '/api/data/self',
                    },
                  )}
                </DerivationNote>
              ) : null}
            </div>
          )}

          {activeFilters > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="primary">{t('{{count}} filters applied', { count: activeFilters })}</Badge>
              <Button onClick={() => setFilters({})} size="sm" variant="quiet">
                {t('Clear all filters')}
              </Button>
            </div>
          ) : null}

          <FlowStagePanel
            filters={filters}
            isFetching={flowQuery.isFetching}
            isPending={flowQuery.isPending}
            metric={metric}
            onFilterChange={handleFilterChange}
            onMetricChange={setMetric}
            quotaPerUnit={quotaPerUnit}
            rows={rows}
            stages={stages}
          />

          <FlowPathTable
            hasFilters={activeFilters > 0}
            isFetching={flowQuery.isFetching}
            isPending={flowQuery.isPending}
            paths={paths}
            quotaPerUnit={quotaPerUnit}
            stages={stages}
          />

          {!access.isAdmin && access.state === 'granted' ? (
            <Alert icon={<ShieldAlertIcon aria-hidden="true" />} title={t('This is your own traffic')} tone="info">
              {t('The self endpoint groups by key, group and model only. User, node and channel are administrator dimensions and are not part of this response.')}
            </Alert>
          ) : null}
        </>
      )}
    </div>
  )
}
