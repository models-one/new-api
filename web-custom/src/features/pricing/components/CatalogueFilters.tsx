import { useTranslation } from 'react-i18next'

import { NativeSelect, SearchInput, type NativeSelectOption } from '@/components/form'
import { Button, SegmentedControl, type SegmentedControlOption } from '@/components/ui'
import {
  ANY_GROUP,
  activeFilterCount,
  type PricingFilters,
  type PricingGroup,
  type QuotaTypeFilter,
  type SortOrder,
} from '@/features/pricing/pricing-presentation'
import type { PricingVendor } from '@/lib/api/pricing'

type CatalogueFiltersProps = {
  filters: PricingFilters
  onChange: (patch: Partial<PricingFilters>) => void
  onReset: () => void
  groups: readonly PricingGroup[]
  vendors: readonly PricingVendor[]
  endpointTypes: readonly string[]
  tags: readonly string[]
  /** Counts for the billing-type toggle, computed on the otherwise-filtered set. */
  counts: { all: number; token: number; request: number }
}

/** The group label the operator wrote, in the server's own language, next to the group id. */
function groupLabel(group: PricingGroup): string {
  if (group.description === '' || group.description === group.name) return group.name
  return `${group.name} · ${group.description}`
}

export function CatalogueFilters(props: CatalogueFiltersProps) {
  const { t } = useTranslation()
  const { filters, onChange, groups, vendors, endpointTypes, tags, counts } = props

  const groupOptions: NativeSelectOption[] = [
    { value: ANY_GROUP, label: t('Best available group') },
    ...groups.map((group) => ({ value: group.name, label: groupLabel(group) })),
  ]

  const vendorOptionList: NativeSelectOption[] = [
    { value: '', label: t('All providers') },
    ...vendors.map((vendor) => ({ value: String(vendor.id), label: vendor.name })),
  ]

  const endpointOptions: NativeSelectOption[] = [
    { value: '', label: t('All endpoints') },
    ...endpointTypes.map((type) => ({ value: type, label: type })),
  ]

  const tagOptionList: NativeSelectOption[] = [
    { value: '', label: t('All tags') },
    ...tags.map((tag) => ({ value: tag, label: tag })),
  ]

  const sortOptions: NativeSelectOption[] = [
    { value: 'name', label: t('Name (A to Z)') },
    { value: 'price-asc', label: t('Input price (low to high)') },
    { value: 'price-desc', label: t('Input price (high to low)') },
  ]

  const quotaOptions: SegmentedControlOption<QuotaTypeFilter>[] = [
    { id: 'all', label: t('All models'), count: counts.all },
    { id: 'token', label: t('Token-based'), count: counts.token },
    { id: 'request', label: t('Per request'), count: counts.request },
  ]

  return (
    <section aria-label={t('Catalogue filters')} className="flex flex-col gap-5">
      <SearchInput
        debounceMs={200}
        description={t(
          'Matches model name, provider, description and tags. Filters in your browser.',
        )}
        label={t('Search models')}
        onValueChange={(next) => onChange({ search: next })}
        placeholder={t('Search models')}
        value={filters.search}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <NativeSelect
          description={t('Every price on this page is multiplied by this group ratio.')}
          label={t('Pricing group')}
          onChange={(event) => onChange({ group: event.target.value })}
          options={groupOptions}
          value={filters.group}
        />
        <NativeSelect
          disabled={vendors.length === 0}
          label={t('Provider')}
          onChange={(event) => onChange({ vendor: event.target.value })}
          options={vendorOptionList}
          value={filters.vendor}
        />
        <NativeSelect
          disabled={endpointTypes.length === 0}
          label={t('Endpoint')}
          onChange={(event) => onChange({ endpointType: event.target.value })}
          options={endpointOptions}
          value={filters.endpointType}
        />
        <NativeSelect
          disabled={tags.length === 0}
          label={t('Tag')}
          onChange={(event) => onChange({ tag: event.target.value })}
          options={tagOptionList}
          value={filters.tag}
        />
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <SegmentedControl
          className="self-start"
          label={t('Billing type')}
          onChange={(next) => onChange({ quotaType: next })}
          options={quotaOptions}
          value={filters.quotaType}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <NativeSelect
            className="sm:w-60"
            label={t('Sort by')}
            onChange={(event) => onChange({ sort: event.target.value as SortOrder })}
            options={sortOptions}
            value={filters.sort}
          />
          <Button
            className="sm:mb-0.5"
            disabled={activeFilterCount(filters) === 0 && filters.search === ''}
            onClick={props.onReset}
            variant="quiet"
          >
            {t('Reset filters')}
          </Button>
        </div>
      </div>
    </section>
  )
}
