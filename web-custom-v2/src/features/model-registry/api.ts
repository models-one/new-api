import { queryOptions } from '@tanstack/react-query'

import { deleteJson, getJson, postJson, putJson } from '@/lib/api/client'
import type { ApiRequestConfig } from '@/lib/http-client'

/**
 * Every registry endpoint renders its own error surface, so the global axios
 * interceptor must not also fire a toast for the same failure.
 */
const silent: ApiRequestConfig = { skipBusinessError: true, skipErrorHandler: true }

/**
 * A channel that currently serves this model, from `model.GetBoundChannelsByModelsMap`
 * (model/model_meta.go). `type` is a `constant.ChannelType*` value; this feature does
 * not carry the provider-name table (that lives with the channels page), so the number
 * is shown as `#N` rather than guessed at.
 */
export type BoundChannel = {
  name: string
  type: number
}

/**
 * One row of the ADMIN model registry — `model.Model` (model/model_meta.go), as returned
 * by `GET /api/models/`, `/api/models/search` and `/api/models/:id`. Verified field by
 * field against the running dev server; a verbatim item, nothing elided:
 *
 *   { "id": 2, "model_name": "gpt-4o-mini",
 *     "description": "Small omni GPT for cheap multimodal assistance…",
 *     "icon": "OpenAI", "tags": "Tools,Files,Vision,128K", "vendor_id": 1,
 *     "endpoints": "[\"openai\"]", "status": 1, "sync_official": 0,
 *     "created_time": 1788578034, "updated_time": 1788578034,
 *     "bound_channels": [{ "name": "local-test", "type": 1 }],
 *     "enable_groups": ["default"], "quota_types": [0], "name_rule": 0 }
 *
 * This is NOT `/api/pricing`: that endpoint is the user-facing catalogue with prices and
 * group ratios. This one is the definition table an administrator maintains.
 *
 * `description`, `icon`, `tags`, `endpoints`, `vendor_id`, `bound_channels`,
 * `enable_groups`, `quota_types`, `matched_models` and `matched_count` all carry
 * `omitempty` in Go, so an empty/zero value arrives as an ABSENT key, not as `""`/`0`.
 * `status`, `sync_official` and `name_rule` are always present.
 */
export type RegistryModel = {
  id: number
  model_name: string
  description?: string
  /** A `@lobehub/icons` identifier consumed by other surfaces. Free text here. */
  icon?: string
  /** Comma-separated, e.g. "Tools,Files,Vision,128K". */
  tags?: string
  /** Absent (not 0) when no vendor is assigned. */
  vendor_id?: number
  /**
   * A JSON array string, e.g. `["openai"]`.
   *
   * `controller.enrichModels` FILLS THIS IN when the stored column is empty, using the
   * endpoints the serving channels advertise, and it does so on the list, the search and
   * the detail read alike. There is therefore no read that distinguishes a stored value
   * from a derived one — see `ModelDrawer`, which says so and never clears it silently.
   */
  endpoints?: string
  /** 1 enabled, 0 disabled (`model.parseModelStatusFilter`). */
  status: number
  /** 1 follow the official upstream, 0 never overwrite from it. */
  sync_official: number
  /** Unix SECONDS. */
  created_time: number
  /** Unix SECONDS. */
  updated_time: number
  /** 0 exact, 1 prefix, 2 contains, 3 suffix (`model.NameRule*`). */
  name_rule: number
  /** Server-computed. Channels whose enabled abilities cover this definition. */
  bound_channels?: BoundChannel[]
  /** Server-computed. Token groups that may reach it. */
  enable_groups?: string[]
  /** Server-computed. 0 token-based, 1 per-request. */
  quota_types?: number[]
  /** Server-computed, RULE ROWS ONLY: the published models this rule matched. */
  matched_models?: string[]
  /** Server-computed, rule rows only: `matched_models.length`. */
  matched_count?: number
}

/**
 * `GET /api/models/` and `GET /api/models/search` both return this shape.
 *
 * `vendor_counts` is `model.GetVendorModelCounts()` — every vendor id in the table
 * mapped to its row count, computed WITHOUT the active filters, so it stays stable while
 * a facet is applied. The key `"0"` counts the rows with no vendor assigned.
 */
export type RegistryModelPage = {
  items: RegistryModel[]
  total: number
  page: number
  page_size: number
  vendor_counts: Record<string, number>
}

/** `model.Vendor` (model/vendor_meta.go), from `GET /api/vendors/`. */
export type Vendor = {
  id: number
  name: string
  description?: string
  icon?: string
  status: number
  created_time: number
  updated_time: number
}

export type VendorPage = {
  items: Vendor[]
  total: number
  page: number
  page_size: number
}

export type RegistryFilters = {
  keyword: string
  /** A stringified vendor id, or '' for every vendor. `"0"` means "no vendor". */
  vendor: string
  /** 'enabled' | 'disabled' | '' — the values `parseModelStatusFilter` understands. */
  status: string
  /** 'yes' | 'no' | '' — the values `parseModelSyncFilter` understands. */
  sync_official: string
}

export const EMPTY_REGISTRY_FILTERS: RegistryFilters = {
  keyword: '',
  status: '',
  sync_official: '',
  vendor: '',
}

export function hasActiveRegistryFilters(filters: RegistryFilters): boolean {
  return (
    filters.keyword.trim() !== ''
    || filters.vendor !== ''
    || filters.status !== ''
    || filters.sync_official !== ''
  )
}

/** `common.GetPageQuery` clamps `page_size` to 100 and falls back to 10 at 0. */
export const MAX_PAGE_SIZE = 100

/**
 * One factory for both list endpoints.
 *
 * `GET /api/models/` calls `model.SearchModels("", "", status, sync_official, …)` — it
 * hard-codes the keyword and the vendor to empty and would silently ignore either, so
 * `/api/models/search` is used whenever one of them is set. Both run the same query and
 * paginate in the database; neither is cheaper.
 */
export function registryModelsQuery(
  filters: RegistryFilters,
  page: number,
  pageSize: number,
) {
  const keyword = filters.keyword.trim()
  const isSearch = keyword !== '' || filters.vendor !== ''

  return queryOptions({
    queryKey: [
      'model-registry',
      'list',
      keyword,
      filters.vendor,
      filters.status,
      filters.sync_official,
      page,
      pageSize,
    ] as const,
    queryFn: () =>
      getJson<RegistryModelPage>(isSearch ? '/api/models/search' : '/api/models/', {
        ...silent,
        params: {
          p: page,
          page_size: pageSize,
          status: filters.status,
          sync_official: filters.sync_official,
          ...(isSearch ? { keyword, vendor: filters.vendor } : {}),
        },
      }),
    staleTime: 10 * 1000,
  })
}

/**
 * The unfiltered row count, used by the sync diff to say how many definitions the
 * preview leaves alone. Asks for one row rather than none: `page_size=0` makes
 * `common.GetPageQuery` fall back to its default of 10.
 */
export function registryTotalQuery() {
  return queryOptions({
    queryKey: ['model-registry', 'total'] as const,
    queryFn: async () => {
      const page = await getJson<RegistryModelPage>('/api/models/', {
        ...silent,
        params: { p: 1, page_size: 1 },
      })
      return page.total
    },
    staleTime: 10 * 1000,
  })
}

/**
 * `GET /api/vendors/` pages like everything else and caps at 100 per page, so the picker
 * walks the pages instead of assuming one is enough.
 */
export function vendorsQuery() {
  return queryOptions({
    queryKey: ['model-registry', 'vendors'] as const,
    queryFn: async () => {
      const collected: Vendor[] = []
      let page = 1
      for (;;) {
        const result = await getJson<VendorPage>('/api/vendors/', {
          ...silent,
          params: { p: page, page_size: MAX_PAGE_SIZE },
        })
        collected.push(...result.items)
        if (collected.length >= result.total || result.items.length === 0) break
        page += 1
      }
      return collected
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * `GET /api/models/missing` → the model names at least one ENABLED channel serves that
 * have no row in this registry (`model.GetMissingModels`). Returns bare strings.
 *
 * This is the page's reason to exist: an undefined model still relays, but carries no
 * description, vendor, tags or match rule anywhere it is shown.
 */
export function missingModelsQuery() {
  return queryOptions({
    queryKey: ['model-registry', 'missing'] as const,
    queryFn: () => getJson<string[]>('/api/models/missing', silent),
    staleTime: 30 * 1000,
  })
}

/** `GET /api/models/:id`. Carries the same server-computed extras as a list row. */
export function fetchRegistryModel(id: number): Promise<RegistryModel> {
  return getJson<RegistryModel>(`/api/models/${id}`, silent)
}

/**
 * The body `POST /api/models/` and `PUT /api/models/` bind into `model.Model`.
 *
 * Every key here is written on update: `model.Model.Update` runs
 * `Select("model_name","description","icon","tags","vendor_id","endpoints","status",
 * "sync_official","name_rule","updated_time")`, which forces zero values through. A
 * partial body therefore CLEARS whatever it omits — the drawer always sends all of them.
 */
export type RegistryModelPayload = {
  id?: number
  model_name: string
  description: string
  icon: string
  tags: string
  vendor_id: number
  endpoints: string
  status: number
  sync_official: number
  name_rule: number
}

export function createRegistryModel(payload: RegistryModelPayload): Promise<RegistryModel> {
  return postJson<RegistryModel>('/api/models/', payload, silent)
}

export function updateRegistryModel(
  payload: RegistryModelPayload & { id: number },
): Promise<RegistryModel> {
  return putJson<RegistryModel>('/api/models/', payload, silent)
}

/**
 * `PUT /api/models/?status_only=true` writes the status column alone, so the rest of the
 * row cannot be clobbered by a toggle. Verified: the response echoes a stub row with an
 * empty `model_name`, which is why nothing is read back off it.
 */
export function setRegistryModelStatus(id: number, status: number): Promise<unknown> {
  return putJson('/api/models/', { id, status }, { ...silent, params: { status_only: 'true' } })
}

/** `DELETE /api/models/:id`. A GORM soft delete; the name becomes reusable. */
export function deleteRegistryModel(id: number): Promise<unknown> {
  return deleteJson(`/api/models/${id}`, silent)
}

/** One differing field of one model, as `SyncUpstreamPreview` reports it. */
export type SyncConflictField = {
  /** 'description' | 'icon' | 'tags' | 'vendor' | 'name_rule' | 'status'. */
  field: string
  /** The registry's value. A string for text fields, a number for name_rule/status. */
  local: unknown
  upstream: unknown
}

export type SyncConflict = {
  model_name: string
  fields: SyncConflictField[]
}

/** Where the upstream metadata was actually read from, echoed by both sync endpoints. */
export type SyncSource = {
  locale: string
  models_url: string
  vendors_url: string
}

/**
 * `GET /api/models/sync_upstream/preview`. Verified on the dev server, both arrays are
 * `null` (not `[]`) when empty:
 *
 *   { "conflicts": [{ "model_name": "gpt-4o", "fields": [
 *       { "field": "description", "local": "local desc", "upstream": "Omni-era GPT…" },
 *       { "field": "vendor", "local": "", "upstream": "OpenAI" } ] }],
 *     "missing": ["gpt-4o-mini"],
 *     "source": { "locale": "", "models_url": "…/api/newapi/models.json",
 *                 "vendors_url": "…/api/newapi/vendors.json" } }
 *
 * `missing` holds the names that WOULD BE CREATED — it is `GET /api/models/missing`
 * intersected with what upstream actually defines. `conflicts` holds existing rows whose
 * `sync_official` is not 0 and which differ from upstream; NOTHING in it is applied
 * unless it is named in the apply call's `overwrite`.
 */
export type SyncPreview = {
  missing: string[] | null
  conflicts: SyncConflict[] | null
  source: SyncSource
}

export function fetchSyncPreview(locale: string): Promise<SyncPreview> {
  return getJson<SyncPreview>('/api/models/sync_upstream/preview', {
    ...silent,
    disableDuplicate: true,
    params: locale === '' ? {} : { locale },
  })
}

/** One entry of the apply call's opt-in overwrite list. */
export type SyncOverwrite = {
  model_name: string
  /** Only 'description', 'icon', 'tags', 'vendor', 'name_rule' and 'status' are read. */
  fields: string[]
}

/**
 * `POST /api/models/sync_upstream`. Verified response:
 *
 *   { "created_list": ["gpt-4o-mini"], "created_models": 1, "created_vendors": 0,
 *     "skipped_models": ["claude-3-5-sonnet-20241022", "my-custom-model"],
 *     "updated_list": ["gpt-4o"], "updated_models": 1, "source": { … } }
 */
export type SyncResult = {
  created_models: number
  created_vendors: number
  updated_models: number
  /** Names that were missing but which upstream does not define. */
  skipped_models: string[]
  created_list: string[]
  updated_list: string[]
  source: SyncSource
}

export function applySyncUpstream(input: {
  locale: string
  overwrite: SyncOverwrite[]
}): Promise<SyncResult> {
  return postJson<SyncResult>(
    '/api/models/sync_upstream',
    { locale: input.locale, overwrite: input.overwrite },
    { ...silent, disableDuplicate: true },
  )
}
