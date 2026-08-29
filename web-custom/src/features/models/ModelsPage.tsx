import { useQuery } from '@tanstack/react-query'
import BoxesIcon from 'lucide-react/dist/esm/icons/boxes'
import CircleDollarSignIcon from 'lucide-react/dist/esm/icons/circle-dollar-sign'
import ServerIcon from 'lucide-react/dist/esm/icons/server'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NativeSelect, SearchInput, type NativeSelectOption } from '@/components/form'
import { toErrorMessage } from '@/components/overlay'
import { EmptyState } from '@/components/system/EmptyState'
import {
  Alert,
  Button,
  PageHeader,
  Pagination,
  Panel,
  SegmentedControl,
  Skeleton,
  StatCard,
  type SegmentedControlOption,
} from '@/components/ui'
import { ModelCard } from '@/features/models/components/ModelCard'
import { ModelComparePanel } from '@/features/models/components/ModelComparePanel'
import {
  MAX_COMPARED_MODELS,
  MODELS_PER_PAGE,
  MODELS_PER_PAGE_OPTIONS,
  countProviders,
  endpointTypeOptions,
  formatMultiplier,
  groupMultiplier,
  modelEndpointTypes,
  modelGroups,
  modelMatchesSearch,
} from '@/features/models/model-presentation'
import { pricingQuery } from '@/lib/api/pricing'
import { selfUserQuery } from '@/lib/api/user'
import { formatNumber } from '@/lib/format'

/** Which slice of the catalogue the availability toggle shows. */
type AvailabilityFilter = 'all' | 'group'

const SKELETON_CARDS = 6

export function ModelsPage() {
  const { t } = useTranslation()

  const pricing = useQuery(pricingQuery())
  const self = useQuery(selfUserQuery())

  const [search, setSearch] = useState('')
  const [endpointFilter, setEndpointFilter] = useState('')
  const [availability, setAvailability] = useState<AvailabilityFilter>('all')
  const [groupChoice, setGroupChoice] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(MODELS_PER_PAGE)
  const [compared, setCompared] = useState<string[]>([])

  // The account group decides which pricing group is preselected, so the catalogue
  // waits for both queries rather than briefly pricing every model in the wrong group.
  const isLoading = pricing.isLoading || self.isLoading

  const payload = pricing.data
  const models = useMemo(() => payload?.data ?? [], [payload])
  const vendors = useMemo(() => payload?.vendors ?? [], [payload])
  const groupNames = useMemo(() => Object.keys(payload?.usable_group ?? {}), [payload])

  // The user's own group is the natural default; fall back to whatever the server
  // published when the account group is not a selectable pricing group.
  const ownGroup = self.data?.group ?? ''
  let defaultGroup = groupNames[0] ?? ''
  if (groupNames.includes('default')) defaultGroup = 'default'
  if (groupNames.includes(ownGroup)) defaultGroup = ownGroup

  const selectedGroup =
    groupChoice !== null && groupNames.includes(groupChoice) ? groupChoice : defaultGroup
  const groupRatio = groupMultiplier(payload?.group_ratio ?? {}, selectedGroup)

  const availableInGroupCount = models.filter(
    (model) => selectedGroup === '' || modelGroups(model).includes(selectedGroup),
  ).length

  const filtered = useMemo(() => {
    const matches = models.filter((model) => {
      if (!modelMatchesSearch(model, vendors, search)) return false
      if (endpointFilter !== '' && !modelEndpointTypes(model).includes(endpointFilter)) {
        return false
      }
      if (availability === 'group' && selectedGroup !== '') {
        return modelGroups(model).includes(selectedGroup)
      }
      return true
    })
    // `/api/pricing` builds its rows from a map, so the order it returns is arbitrary;
    // sorting by name keeps the grid from reshuffling between fetches.
    return matches.sort((left, right) => left.model_name.localeCompare(right.model_name))
  }, [availability, endpointFilter, models, search, selectedGroup, vendors])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleModels = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const comparedModels = useMemo(
    () => compared.flatMap((name) => models.filter((model) => model.model_name === name)),
    [compared, models],
  )

  // `usable_group` maps a group name to the label the server publishes for it, which is
  // operator-written text in the server's own language and is shown verbatim.
  const groupOptions: NativeSelectOption[] = groupNames.map((name) => {
    const description = payload?.usable_group[name] ?? ''
    return {
      value: name,
      label: description === '' || description === name ? name : `${name} · ${description}`,
    }
  })

  const endpointOptions: NativeSelectOption[] = [
    { value: '', label: t('All endpoints') },
    ...endpointTypeOptions(models).map((type) => ({ value: type, label: type })),
  ]

  const availabilityOptions: SegmentedControlOption<AvailabilityFilter>[] = [
    { id: 'all', label: t('All models'), count: models.length },
    { id: 'group', label: t('Available in this group'), count: availableInGroupCount },
  ]

  const toggleCompare = (modelName: string) => {
    setCompared((current) =>
      current.includes(modelName)
        ? current.filter((name) => name !== modelName)
        : [...current, modelName].slice(-MAX_COMPARED_MODELS),
    )
  }

  const resetFilters = () => {
    setSearch('')
    setEndpointFilter('')
    setAvailability('all')
    setPage(1)
  }

  if (pricing.isError) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          description={t('Every model this gateway publishes, priced for the group you select.')}
          title={t('Explore models')}
        />
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
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description={t('Every model this gateway publishes, priced for the group you select.')}
        title={t('Explore models')}
      />

      {self.isError ? (
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
          {t('Your account group could not be loaded, so the default pricing group is shown.')}
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_unused, index) => (
            <Skeleton className="h-36" key={index} variant="block" />
          ))}
        </div>
      ) : (
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
            value={formatNumber(countProviders(models, vendors))}
          />
          <StatCard
            footer={t('Applied to every price on this page.')}
            icon={<CircleDollarSignIcon />}
            iconTone="secondary"
            label={t('Group ratio')}
            value={
              groupRatio === undefined ? (
                <span className="text-xl">{t('Not published')}</span>
              ) : (
                formatMultiplier(groupRatio)
              )
            }
          />
        </div>
      )}

      {groupRatio === undefined && !isLoading && groupNames.length > 0 ? (
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
          {t('This pricing group has no published multiplier, so prices cannot be shown.')}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <NativeSelect
            className="sm:w-56"
            disabled={groupOptions.length === 0}
            label={t('Pricing group')}
            onChange={(event) => {
              setGroupChoice(event.target.value)
              setPage(1)
            }}
            options={groupOptions}
            value={selectedGroup}
          />
          <NativeSelect
            className="sm:w-48"
            label={t('Endpoint')}
            onChange={(event) => {
              setEndpointFilter(event.target.value)
              setPage(1)
            }}
            options={endpointOptions}
            value={endpointFilter}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SegmentedControl
            className="self-start"
            label={t('Model filters')}
            onChange={(next) => {
              setAvailability(next)
              setPage(1)
            }}
            options={availabilityOptions}
            value={availability}
          />
          <SearchInput
            className="sm:w-72"
            debounceMs={200}
            description={t('Filters this list in your browser.')}
            label={t('Search models')}
            onValueChange={(next) => {
              setSearch(next)
              setPage(1)
            }}
            placeholder={t('Search models')}
            value={search}
          />
        </div>
      </div>

      <section
        aria-busy={pricing.isFetching || self.isFetching}
        aria-label={t('Model catalogue')}
        className="flex flex-col gap-5"
      >
        {isLoading ? (
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: SKELETON_CARDS }, (_unused, index) => (
              <Skeleton
                className="h-80"
                key={index}
                label={index === 0 ? t('Loading models') : undefined}
                variant="block"
              />
            ))}
          </div>
        ) : null}

        {!isLoading && models.length === 0 ? (
          <Panel>
            <EmptyState
              description={t('No model prices have been configured on this gateway yet.')}
              title={t('No models are published yet')}
            />
          </Panel>
        ) : null}

        {!isLoading && models.length > 0 && filtered.length === 0 ? (
          <Panel>
            <EmptyState
              action={
                <Button onClick={resetFilters} variant="outline">
                  {t('Reset filters')}
                </Button>
              }
              description={t('Try a different search term, endpoint, or pricing group.')}
              title={t('No models match these filters')}
            />
          </Panel>
        ) : null}

        {visibleModels.length > 0 ? (
          <>
            <p className="text-sm text-muted">
              {/* The total counts what the current filters match, not the whole catalogue. */}
              {t('Showing {{shown}} of {{total}} models', {
                shown: visibleModels.length,
                total: filtered.length,
              })}
            </p>

            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {visibleModels.map((model) => (
                <ModelCard
                  compared={compared.includes(model.model_name)}
                  endpointCatalog={payload?.supported_endpoint ?? {}}
                  groupRatio={groupRatio}
                  key={model.model_name}
                  model={model}
                  onToggleCompare={toggleCompare}
                  selectedGroup={selectedGroup}
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

      {models.length > 0 && !isLoading ? (
        <ModelComparePanel groupRatio={groupRatio} models={comparedModels} vendors={vendors} />
      ) : null}
    </div>
  )
}
