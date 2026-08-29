import { useQuery } from '@tanstack/react-query'
import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableEmpty } from '@/components/data'
import { DescriptionList, Panel, Skeleton, StatusBadge } from '@/components/ui'
import { aggregateByVendor, healthFromSuccessRate, perfSummaryQuery } from '@/lib/api/metrics'
import { pricingQuery, vendorName } from '@/lib/api/pricing'
import { formatLatencyMs, formatPercent } from '@/lib/format'
import { QueryErrorAlert } from '@/features/dashboard/components/QueryErrorAlert'
import { vendorInitials } from '@/features/dashboard/estimates'

/** Matches the window named in the section caption. */
export const PERF_WINDOW_HOURS = 24

const SKELETON_CARDS = 3

export function UpstreamProvidersSection() {
  const { t } = useTranslation()
  const titleId = useId()

  const perf = useQuery(perfSummaryQuery(PERF_WINDOW_HOURS))
  const pricing = useQuery(pricingQuery())

  const vendors = useMemo(() => {
    const vendorByModel = new Map(
      (pricing.data?.data ?? []).map((model) => [
        model.model_name,
        vendorName(model, pricing.data?.vendors ?? []),
      ]),
    )
    return aggregateByVendor(
      perf.data?.models ?? [],
      (model) => vendorByModel.get(model) ?? '',
    )
  }, [perf.data, pricing.data])

  const isPending = perf.isPending || pricing.isPending
  const isFetching = perf.isFetching || pricing.isFetching

  return (
    <section aria-busy={isFetching} aria-labelledby={titleId}>
      <h2 className="text-lg font-bold" id={titleId}>
        {t('Upstream providers')}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        {t('Service-wide averages for the last 24 hours across every account, not your own traffic. Health is derived in this console from the success rate.')}
      </p>

      {perf.isError || pricing.isError ? (
        <QueryErrorAlert
          className="mt-4"
          error={perf.error ?? pricing.error}
          isRetrying={isFetching}
          onRetry={() => {
            void perf.refetch()
            void pricing.refetch()
          }}
        />
      ) : null}

      {isPending ? (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {Array.from({ length: SKELETON_CARDS }, (_unused, index) => (
            <Skeleton
              height={150}
              key={index}
              label={index === 0 ? t('Loading results') : undefined}
              variant="block"
            />
          ))}
        </div>
      ) : null}

      {!isPending && !perf.isError && !pricing.isError && vendors.length === 0 ? (
        <Panel as="div" className="mt-4">
          <DataTableEmpty
            description={t('The service records provider latency and success rate once traffic flows through it.')}
            icon={<ActivityIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
            title={t('No upstream performance data yet')}
          />
        </Panel>
      ) : null}

      {vendors.length > 0 ? (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {vendors.map((vendor) => {
            const health = healthFromSuccessRate(vendor.successRate)
            return (
              <Panel as="div" className="p-5" key={vendor.vendor}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="mono grid size-10 shrink-0 place-items-center border border-border bg-background text-xs"
                    >
                      {vendorInitials(vendor.vendor)}
                    </span>
                    <span className="truncate font-semibold">{vendor.vendor}</span>
                  </div>
                  <StatusBadge tone={health.tone}>{t(health.key)}</StatusBadge>
                </div>

                <DescriptionList
                  className="mt-5 border-t-0"
                  dense
                  items={[
                    {
                      id: 'latency',
                      term: t('Average latency'),
                      description: (
                        <span className="mono font-semibold">
                          {formatLatencyMs(vendor.avgLatencyMs)}
                        </span>
                      ),
                    },
                    {
                      id: 'success-rate',
                      term: t('Success rate'),
                      description: (
                        <span className="mono font-semibold">
                          {formatPercent(vendor.successRate)}
                        </span>
                      ),
                    },
                    {
                      id: 'models',
                      term: t('Models measured'),
                      description: <span className="mono">{vendor.modelCount}</span>,
                    },
                  ]}
                />
              </Panel>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
