import { useQuery } from '@tanstack/react-query'
import BoxesIcon from 'lucide-react/dist/esm/icons/boxes'
import LockIcon from 'lucide-react/dist/esm/icons/lock'
import ServerIcon from 'lucide-react/dist/esm/icons/server'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import UsersIcon from 'lucide-react/dist/esm/icons/users'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { EmptyState } from '@/components/system/EmptyState'
import { Alert, Button, PageHeader, Pagination, Panel, Skeleton, StatCard } from '@/components/ui'
import { CatalogueFilters } from '@/features/pricing/components/CatalogueFilters'
import { ModelPricingCard } from '@/features/pricing/components/ModelPricingCard'
import { PublicFrame } from '@/features/pricing/components/PublicFrame'
import { pricingModuleAccess } from '@/features/pricing/module-access'
import {
  EMPTY_FILTERS,
  MODELS_PER_PAGE,
  MODELS_PER_PAGE_OPTIONS,
  activeFilterCount,
  endpointTypeOptions,
  filterAndSortModels,
  resolveGroupRatio,
  selectableGroups,
  tagOptions,
  vendorOptions,
  type PricingFilters,
} from '@/features/pricing/pricing-presentation'
import { publicPerfSummaryQuery, publicPricingQuery } from '@/features/pricing/public-queries'
import { useServerStatus } from '@/hooks/use-server-status'
import type { ModelPerfSummary } from '@/lib/api/metrics'
import { QUOTA_TYPE } from '@/lib/api/pricing'
import { formatNumber } from '@/lib/format'
import { getLegacySignInHref } from '@/lib/navigation'

const SKELETON_CARDS = 6

function CatalogueSkeleton(props: { label: string }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: SKELETON_CARDS }, (_unused, index) => (
        <Skeleton
          className="h-80"
          key={index}
          label={index === 0 ? props.label : undefined}
          variant="block"
        />
      ))}
    </div>
  )
}

/**
 * The public model square.
 *
 * Anonymous by construction: it lives outside the console auth guard and requests only
 * `/api/status`, `/api/pricing` and `/api/perf-metrics/summary`, all three of which the
 * gateway serves to visitors while the `pricing` nav module stays public.
 */
export function PricingPage() {
  const { t } = useTranslation()

  // `/api/status` decides whether this surface exists at all, so it is read before the
  // catalogue is requested and nothing pricing-shaped renders while it is pending.
  const status = useServerStatus()
  const access = pricingModuleAccess(status.data)
  const moduleReady = status.isSuccess && access.enabled

  const pricing = useQuery({ ...publicPricingQuery(), enabled: moduleReady })
  // Service-wide relay metrics. Public alongside the pricing module; deferred until the
  // catalogue itself has arrived so a visitor never waits on it.
  const perfSummary = useQuery({
    ...publicPerfSummaryQuery(),
    enabled: moduleReady && pricing.isSuccess,
  })

  const [filters, setFilters] = useState<PricingFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(MODELS_PER_PAGE)

  const payload = pricing.data
  const models = useMemo(() => payload?.data ?? [], [payload])
  const vendors = useMemo(() => payload?.vendors ?? [], [payload])
  const groupRatio = useMemo(() => payload?.group_ratio ?? {}, [payload])
  const groups = useMemo(() => selectableGroups(payload), [payload])

  const perfByModel = useMemo(() => {
    const index = new Map<string, ModelPerfSummary>()
    for (const row of perfSummary.data?.models ?? []) index.set(row.model_name, row)
    return index
  }, [perfSummary.data])

  // The billing-type toggle counts what the other filters already left standing.
  const withoutQuotaType = useMemo(
    () => filterAndSortModels(models, vendors, groupRatio, { ...filters, quotaType: 'all' }),
    [filters, groupRatio, models, vendors],
  )
  const counts = useMemo(
    () => ({
      all: withoutQuotaType.length,
      token: withoutQuotaType.filter((model) => model.quota_type === QUOTA_TYPE.tokenBased).length,
      request: withoutQuotaType.filter((model) => model.quota_type === QUOTA_TYPE.perRequest).length,
    }),
    [withoutQuotaType],
  )

  const filtered = useMemo(
    () => filterAndSortModels(models, vendors, groupRatio, filters),
    [filters, groupRatio, models, vendors],
  )

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const applyFilters = (patch: Partial<PricingFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(1)
  }
  const resetFilters = () => {
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  const header = (
    <PageHeader
      description={t(
        'Every model this gateway publishes, with the rate each pricing group is charged.',
      )}
      eyebrow={t('Public catalogue')}
      title={t('Model pricing')}
    />
  )

  if (status.isLoading) {
    return (
      <PublicFrame>
        <div className="flex flex-col gap-8">
          {header}
          <CatalogueSkeleton label={t('Loading the model catalogue')} />
        </div>
      </PublicFrame>
    )
  }

  if (status.isError) {
    return (
      <PublicFrame>
        <div className="flex flex-col gap-8">
          {header}
          <Alert
            action={
              <Button
                aria-busy={status.isFetching}
                disabled={status.isFetching}
                onClick={() => void status.refetch()}
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('Could not load the site configuration')}
            tone="destructive"
          >
            {toErrorMessage(status.error)}
          </Alert>
        </div>
      </PublicFrame>
    )
  }

  if (!access.enabled) {
    return (
      <PublicFrame>
        <div className="flex flex-col gap-8">
          {header}
          <Panel>
            <EmptyState
              description={t('This gateway has turned the public pricing page off.')}
              title={t('Pricing is not published here')}
            />
          </Panel>
        </div>
      </PublicFrame>
    )
  }

  const pricingFailed = pricing.isError
  // The operator can require a sign-in for this module; the request then answers 401 and the
  // only useful thing to offer is the sign-in link.
  const signInRequired = pricingFailed && access.requireAuth

  return (
    <PublicFrame>
      <div className="flex flex-col gap-8">
        {header}

        {access.requireAuth && !pricingFailed ? (
          <Alert icon={<LockIcon aria-hidden="true" />} tone="info">
            {t('This gateway publishes pricing to signed-in visitors only.')}
          </Alert>
        ) : null}

        {signInRequired ? (
          <Alert
            action={
              <Button render={<a href={getLegacySignInHref()} />} variant="outline">
                {t('Sign in')}
              </Button>
            }
            icon={<LockIcon aria-hidden="true" />}
            title={t('Sign in to see pricing')}
            tone="info"
          >
            {t('This gateway publishes pricing to signed-in visitors only.')}
          </Alert>
        ) : null}

        {pricingFailed && !signInRequired ? (
          <Alert
            action={
              <Button
                aria-busy={pricing.isFetching}
                disabled={pricing.isFetching}
                onClick={() => void pricing.refetch()}
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('Could not load the model catalogue')}
            tone="destructive"
          >
            {toErrorMessage(pricing.error)}
          </Alert>
        ) : null}

        {pricing.isLoading ? <CatalogueSkeleton label={t('Loading the model catalogue')} /> : null}

        {pricing.isSuccess ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                icon={<BoxesIcon />}
                label={t('Models published')}
                value={formatNumber(models.length)}
              />
              <StatCard
                icon={<ServerIcon />}
                iconTone="info"
                label={t('Providers listed')}
                value={formatNumber(vendorOptions(models, vendors).length)}
              />
              <StatCard
                footer={t('Each group carries its own ratio, which scales every price.')}
                icon={<UsersIcon />}
                iconTone="secondary"
                label={t('Pricing groups')}
                value={formatNumber(groups.length)}
              />
            </div>

            <CatalogueFilters
              counts={counts}
              endpointTypes={endpointTypeOptions(models)}
              filters={filters}
              groups={groups}
              onChange={applyFilters}
              onReset={resetFilters}
              tags={tagOptions(models)}
              vendors={vendorOptions(models, vendors)}
            />

            <section
              aria-busy={pricing.isFetching}
              aria-label={t('Model catalogue')}
              className="flex flex-col gap-5"
            >
              {models.length === 0 ? (
                <Panel>
                  <EmptyState
                    description={t('No model prices have been configured on this gateway yet.')}
                    title={t('No models are published yet')}
                  />
                </Panel>
              ) : null}

              {models.length > 0 && filtered.length === 0 ? (
                <Panel>
                  <EmptyState
                    action={
                      <Button onClick={resetFilters} variant="outline">
                        {t('Reset filters')}
                      </Button>
                    }
                    description={t('Try a different search term, provider, endpoint or group.')}
                    title={t('No models match these filters')}
                  />
                </Panel>
              ) : null}

              {visible.length > 0 ? (
                <>
                  <p className="text-sm text-muted">
                    {t('Showing {{shown}} of {{total}} models', {
                      shown: visible.length,
                      total: filtered.length,
                    })}
                    {activeFilterCount(filters) > 0
                      ? ` · ${t('{{count}} filters applied', { count: activeFilterCount(filters) })}`
                      : ''}
                  </p>

                  <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                    {visible.map((model) => (
                      <ModelPricingCard
                        endpointCatalog={payload?.supported_endpoint ?? {}}
                        key={model.model_name}
                        model={model}
                        perf={perfByModel.get(model.model_name)}
                        resolved={resolveGroupRatio(model, filters.group, groupRatio)}
                        vendors={vendors}
                      />
                    ))}
                  </div>

                  {filtered.length > pageSize ? (
                    <Pagination
                      label={t('Model pages')}
                      onPageChange={setPage}
                      onPageSizeChange={(next) => {
                        setPageSize(next)
                        setPage(1)
                      }}
                      page={currentPage}
                      pageSize={pageSize}
                      pageSizeLabel={t('Models per page')}
                      pageSizeOptions={MODELS_PER_PAGE_OPTIONS}
                      total={filtered.length}
                    />
                  ) : null}
                </>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </PublicFrame>
  )
}
