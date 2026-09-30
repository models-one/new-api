import { useQuery } from '@tanstack/react-query'
import LayoutGridIcon from 'lucide-react/dist/esm/icons/layout-grid'
import ListIcon from 'lucide-react/dist/esm/icons/list'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NativeSelect, SearchInput } from '@/components/form'
import { toErrorMessage } from '@/components/overlay'
import { EmptyState } from '@/components/system/EmptyState'
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  Pagination,
  Panel,
  SegmentedControl,
  Skeleton,
} from '@/components/ui'
import { ModelCard } from '@/features/models/components/ModelCard'
import { ModelComparePanel } from '@/features/models/components/ModelComparePanel'
import { ModelTable } from '@/features/models/components/ModelTable'
import {
  MAX_COMPARED_MODELS,
  MODELS_PER_PAGE,
  MODELS_PER_PAGE_OPTIONS,
  billingKind,
  endpointTypeOptions,
  groupMultiplier,
  modelEndpointTypes,
  modelGroups,
  modelMatchesSearch,
} from '@/features/models/model-presentation'
import {
  inputPricePerMillion,
  outputPricePerMillion,
  parseTags,
  pricingQuery,
  vendorName,
} from '@/lib/api/pricing'
import { selfUserQuery } from '@/lib/api/user'

const ADMIN_ROLE = 10

export function ModelsPage() {
  const { t } = useTranslation()
  const pricing = useQuery(pricingQuery())
  const self = useQuery(selfUserQuery())
  const [search, setSearch] = useState('')
  const [endpointFilter, setEndpointFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [capabilityFilter, setCapabilityFilter] = useState('')
  const [availability, setAvailability] = useState<'all' | 'group'>('all')
  const [groupChoice, setGroupChoice] = useState<string | null>(null)
  const [sort, setSort] = useState('name')
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(MODELS_PER_PAGE)
  const [compared, setCompared] = useState<string[]>([])

  const isLoading = pricing.isLoading || self.isLoading
  const payload = pricing.data
  const models = useMemo(() => payload?.data ?? [], [payload])
  // `/api/pricing` only lists models an enabled channel serves to one of the caller's
  // usable groups, so an empty catalogue means a group mismatch, not missing prices.
  const catalogueEmpty = !isLoading && models.length === 0
  const vendors = useMemo(() => payload?.vendors ?? [], [payload])
  const groupNames = Object.keys(payload?.usable_group ?? {})
  const ownGroup = self.data?.group ?? ''
  let defaultGroup = groupNames[0] ?? ''
  if (groupNames.includes('default')) defaultGroup = 'default'
  if (groupNames.includes(ownGroup)) defaultGroup = ownGroup
  const selectedGroup =
    groupChoice !== null && groupNames.includes(groupChoice) ? groupChoice : defaultGroup
  const groupRatio = groupMultiplier(payload?.group_ratio ?? {}, selectedGroup)

  const providerNames = useMemo(
    () => [...new Set(models.map((model) => vendorName(model, vendors)).filter(Boolean))].sort(),
    [models, vendors],
  )
  const capabilities = useMemo(() => [...new Set(models.flatMap(parseTags))].sort(), [models])
  const availableCount = models.filter(
    (model) => selectedGroup === '' || modelGroups(model).includes(selectedGroup),
  ).length

  const filtered = useMemo(() => {
    const matches = models.filter((model) => {
      if (!modelMatchesSearch(model, vendors, search)) return false
      if (endpointFilter && !modelEndpointTypes(model).includes(endpointFilter)) return false
      if (providerFilter && vendorName(model, vendors) !== providerFilter) return false
      if (capabilityFilter && !parseTags(model).includes(capabilityFilter)) return false
      return (
        availability !== 'group' ||
        selectedGroup === '' ||
        modelGroups(model).includes(selectedGroup)
      )
    })
    return matches.sort((left, right) => {
      // Only flat token prices share a comparable unit. Keep expression-based,
      // per-request and unpublished prices after them, with a stable name order.
      if (sort !== 'name' && groupRatio !== undefined) {
        const leftComparable = billingKind(left) === 'per-token'
        const rightComparable = billingKind(right) === 'per-token'
        if (leftComparable !== rightComparable) return leftComparable ? -1 : 1
        if (leftComparable && rightComparable) {
          const price = sort === 'input' ? inputPricePerMillion : outputPricePerMillion
          const difference = price(left, groupRatio) - price(right, groupRatio)
          if (difference !== 0) return difference
        }
      }
      return left.model_name.localeCompare(right.model_name)
    })
  }, [
    models,
    vendors,
    search,
    endpointFilter,
    providerFilter,
    capabilityFilter,
    availability,
    selectedGroup,
    sort,
    groupRatio,
  ])

  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const visibleModels = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const comparedModels = models.filter((model) => compared.includes(model.model_name))
  const hasFilters = Boolean(
    search || endpointFilter || providerFilter || capabilityFilter || availability !== 'all',
  )
  const toggleCompare = (name: string) =>
    setCompared((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name].slice(-MAX_COMPARED_MODELS),
    )
  const resetFilters = () => {
    setSearch('')
    setEndpointFilter('')
    setProviderFilter('')
    setCapabilityFilter('')
    setAvailability('all')
    setPage(1)
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        title={t('Model library')}
        description={t(
          'Find the right model. Compare capabilities, endpoints, and pricing in one place.',
        )}
        action={
          !isLoading && !pricing.isError ? (
            <div className="flex items-center gap-3 text-xs text-muted">
              <span>
                <strong className="font-medium text-foreground">{models.length}</strong>{' '}
                {t('Models')}
              </span>
              <span className="h-3 border-l border-border" />
              <span>
                <strong className="font-medium text-foreground">{providerNames.length}</strong>{' '}
                {t('Providers')}
              </span>
            </div>
          ) : undefined
        }
      />

      {pricing.isError ? (
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
      {self.isError ? (
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
          {t('Your account group could not be loaded, so the default pricing group is shown.')}
        </Alert>
      ) : null}

      {!pricing.isError ? (
        <>
          {catalogueEmpty ? null : (
            <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <NativeSelect
                  hideLabel
                  size="sm"
                  label={t('Endpoint type')}
                  options={[
                    { value: '', label: t('All endpoints') },
                    ...endpointTypeOptions(models).map((type) => ({ value: type, label: type })),
                  ]}
                  value={endpointFilter}
                  onChange={(event) => {
                    setEndpointFilter(event.target.value)
                    setPage(1)
                  }}
                />
                <NativeSelect
                  hideLabel
                  size="sm"
                  label={t('Provider')}
                  options={[
                    { value: '', label: t('All providers') },
                    ...providerNames.map((name) => ({ value: name, label: name })),
                  ]}
                  value={providerFilter}
                  onChange={(event) => {
                    setProviderFilter(event.target.value)
                    setPage(1)
                  }}
                />
                <NativeSelect
                  hideLabel
                  size="sm"
                  label={t('Capabilities')}
                  options={[
                    { value: '', label: t('All capabilities') },
                    ...capabilities.map((tag) => ({ value: tag, label: tag })),
                  ]}
                  value={capabilityFilter}
                  onChange={(event) => {
                    setCapabilityFilter(event.target.value)
                    setPage(1)
                  }}
                />
                {hasFilters ? (
                  <Button onClick={resetFilters} size="sm" variant="quiet">
                    {t('Reset filters')}
                  </Button>
                ) : null}
              </div>
              <NativeSelect
                className="min-w-40"
                hideLabel
                size="sm"
                label={t('Pricing group')}
                options={groupNames.map((name) => ({
                  value: name,
                  label:
                    payload?.group_ratio[name] === undefined
                      ? name
                      : `${name} · ${payload.group_ratio[name]}×`,
                }))}
                value={selectedGroup}
                onChange={(event) => {
                  setGroupChoice(event.target.value)
                  setPage(1)
                }}
                disabled={groupNames.length === 0}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedControl
                label={t('Availability')}
                size="sm"
                value={availability}
                options={[
                  { id: 'all', label: t('All models'), count: models.length },
                  { id: 'group', label: t('Available in this group'), count: availableCount },
                ]}
                onChange={(next) => {
                  setAvailability(next)
                  setPage(1)
                }}
              />
              <span className="text-[11px] text-muted">
                {t('Token prices in USD per 1M tokens.')}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SearchInput
                className="min-w-48 flex-1"
                hideLabel
                debounceMs={200}
                label={t('Search models')}
                placeholder={t('Search models, providers, or capabilities…')}
                value={search}
                onValueChange={(next) => {
                  setSearch(next)
                  setPage(1)
                }}
              />
              <NativeSelect
                className="w-44"
                hideLabel
                size="sm"
                label={t('Sort models')}
                value={sort}
                options={[
                  { value: 'name', label: t('Name: A–Z') },
                  { value: 'input', label: t('Input price: low to high') },
                  { value: 'output', label: t('Output price: low to high') },
                ]}
                onChange={(event) => {
                  setSort(event.target.value)
                  setPage(1)
                }}
              />
              <div
                aria-label={t('Model view')}
                className="flex shrink-0 rounded-control border border-border bg-sunken p-0.5"
                role="group"
              >
                <Button
                  aria-label={t('Table view')}
                  aria-pressed={view === 'table'}
                  onClick={() => setView('table')}
                  size="icon-sm"
                  variant={view === 'table' ? 'primary' : 'quiet'}
                >
                  <ListIcon aria-hidden="true" />
                </Button>
                <Button
                  aria-label={t('Card view')}
                  aria-pressed={view === 'cards'}
                  onClick={() => setView('cards')}
                  size="icon-sm"
                  variant={view === 'cards' ? 'primary' : 'quiet'}
                >
                  <LayoutGridIcon aria-hidden="true" />
                </Button>
              </div>
            </div>
            </>
          )}

          <section
            aria-busy={pricing.isFetching || self.isFetching}
            aria-label={t('Model catalogue')}
            className="flex min-w-0 flex-col gap-3"
          >
            {isLoading ? (
              <Skeleton className="h-96" label={t('Loading models')} variant="block" />
            ) : null}
            {catalogueEmpty ? (
              <Panel>
                <EmptyState
                  title={t('No models are available to you yet')}
                  description={
                    (self.data?.role ?? 0) >= ADMIN_ROLE
                      ? t(
                          'No enabled channel serves any of these groups: {{groups}}. Add one of them to a channel, or make the channel groups user-selectable in group settings.',
                          { groups: groupNames.join(', ') },
                        )
                      : t(
                          'No enabled channel serves any of your groups: {{groups}}. Ask an administrator to open one to you.',
                          { groups: groupNames.join(', ') },
                        )
                  }
                />
              </Panel>
            ) : null}
            {!isLoading && models.length > 0 && filtered.length === 0 ? (
              <Panel>
                <EmptyState
                  title={t('No models match these filters')}
                  description={t('Try a different search term, endpoint, or pricing group.')}
                  action={
                    <Button onClick={resetFilters} variant="outline">
                      {t('Reset filters')}
                    </Button>
                  }
                />
              </Panel>
            ) : null}
            {!isLoading && visibleModels.length > 0 ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <p aria-live="polite">
                    {t('Showing {{shown}} of {{total}} models', {
                      shown: visibleModels.length,
                      total: filtered.length,
                    })}
                  </p>
                  <Badge size="sm" tone="muted">
                    {t('Group ratio')} ·{' '}
                    {groupRatio === undefined ? t('Not published') : `${groupRatio}×`}
                  </Badge>
                </div>
                {view === 'table' ? (
                  <ModelTable
                    models={visibleModels}
                    vendors={vendors}
                    compared={compared}
                    endpointCatalog={payload?.supported_endpoint ?? {}}
                    groupRatio={groupRatio}
                    selectedGroup={selectedGroup}
                    onToggleCompare={toggleCompare}
                  />
                ) : (
                  <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {visibleModels.map((model) => (
                      <ModelCard
                        model={model}
                        key={model.model_name}
                        compared={compared.includes(model.model_name)}
                        vendors={vendors}
                        endpointCatalog={payload?.supported_endpoint ?? {}}
                        groupRatio={groupRatio}
                        selectedGroup={selectedGroup}
                        onToggleCompare={toggleCompare}
                      />
                    ))}
                  </div>
                )}
                {filtered.length > pageSize ? (
                  <Pagination
                    label={t('Model pages')}
                    page={currentPage}
                    pageSize={pageSize}
                    total={filtered.length}
                    onPageChange={setPage}
                    onPageSizeChange={(next) => {
                      setPageSize(next)
                      setPage(1)
                    }}
                    pageSizeLabel={t('Models per page')}
                    pageSizeOptions={MODELS_PER_PAGE_OPTIONS}
                  />
                ) : null}
              </>
            ) : null}
          </section>
          {comparedModels.length > 0 && !isLoading ? (
            <ModelComparePanel groupRatio={groupRatio} models={comparedModels} vendors={vendors} />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
