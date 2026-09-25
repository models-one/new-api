import { queryOptions } from '@tanstack/react-query'

import { deleteJson, getJson, postJson, putJson } from '@/lib/api/client'
import type { ApiRequestConfig } from '@/lib/http-client'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS VERIFIED AGAINST THE RUNNING SERVER, AND WHAT WAS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * Every route below sits behind `getIoEnterpriseClient` or `getIoClient`
 * (controller/deployment.go), which refuse outright unless BOTH
 * `model_deployment.ionet.enabled` is "true" AND `model_deployment.ionet.api_key`
 * is non-empty, and otherwise forward to https://api.io.solutions with that key.
 *
 * Verified live on the dev server (127.0.0.1:3000):
 *   GET  /api/deployments/settings              → the exact ModelDeploymentSettings below.
 *   POST /api/deployments/settings/test-connection
 *        · no body, nothing stored  → success:false "api_key is required"
 *        · a wrong key              → success:false
 *          "failed to get max GPUs per container: Invalid API key provided!"
 *   GET  /api/deployments/locations             → the exact DeploymentLocationsPage below,
 *        with real rows: {"id":2,"name":"United States","iso2":"US","available":147}.
 *        This is the ONE data route that answers without a valid key: it uses the plain
 *        (non-enterprise) io.net client and that path is unauthenticated upstream.
 *   Every other route, with the flag on and a deliberately wrong key → success:false and
 *        the upstream message, e.g. "failed to list deployments: Invalid API key provided!".
 *
 * NOT verifiable here — no valid io.net enterprise key exists on this instance. Their
 * payload shapes are transcribed from the Go handlers that build them
 * (controller/deployment.go, pkg/ionet/*.go) and each type below records which handler it
 * came from. Fields the handler HARD-CODES to an empty value are called out and are
 * deliberately never rendered.
 */

/** Every panel on this page renders its own error surface; no global toast on top. */
const silent: ApiRequestConfig = { skipBusinessError: true, skipErrorHandler: true }

/* ------------------------------------------------------------------ *
 * Gate 1 — the feature flag
 * ------------------------------------------------------------------ */

/**
 * `GET /api/deployments/settings` (controller.GetModelDeploymentSettings). VERIFIED LIVE,
 * verbatim: {"provider":"io.net","enabled":false,"configured":false,"can_connect":false}.
 *
 * `configured` is the only way to learn whether a key is stored: the option key ends in
 * `_key`, so `controller.GetOptions` strips it from the option payload entirely.
 * `can_connect` is `enabled && configured` computed server-side — it does NOT mean a
 * connection succeeded, which is why gate 2 exists.
 */
export type DeploymentSettings = {
  provider: string
  enabled: boolean
  configured: boolean
  can_connect: boolean
}

export function deploymentSettingsQuery() {
  return queryOptions({
    queryKey: ['deployments', 'settings'] as const,
    queryFn: () => getJson<DeploymentSettings>('/api/deployments/settings', silent),
    staleTime: 10 * 1000,
  })
}

/* ------------------------------------------------------------------ *
 * Gate 2 — the live connection test
 * ------------------------------------------------------------------ */

/**
 * `POST /api/deployments/settings/test-connection` with an empty body, so the stored key
 * is used. On success the handler reports what `GET /hardware/max-gpus-per-container`
 * returned: how many hardware types the account can see and how many units are free.
 * `total_available` falls back to the sum of the per-hardware `available` counts when the
 * upstream omits its own total.
 */
export type DeploymentConnection = {
  hardware_count: number
  total_available: number
}

export function testDeploymentConnection(): Promise<DeploymentConnection> {
  return postJson<DeploymentConnection>('/api/deployments/settings/test-connection', {}, silent)
}

/* ------------------------------------------------------------------ *
 * The deployment list
 * ------------------------------------------------------------------ */

/**
 * One row of `GET /api/deployments/` and `GET /api/deployments/search`, built field by
 * field by `controller.mapIoNetDeployment` from an `ionet.Deployment`.
 *
 * The handler hard-codes four of its own keys to empty values on EVERY row, so this
 * console models them but never renders them:
 *   model_name "", model_version "", description "", resource_config.cpu/.memory "".
 * `updated_at` is assigned the same value as `created_at` — there is no update clock.
 * `type` is the literal string "Container" for every row, and `provider` the literal
 * "io.net"; neither is a discriminator.
 */
export type Deployment = {
  id: string
  /** io.net's cluster name. `container_name` is the SAME value, assigned twice. */
  deployment_name: string
  container_name: string
  /** Lower-cased upstream status. See DEPLOYMENT_STATUSES for the seeded set. */
  status: string
  /** Always "Container". */
  type: string
  /** The server's own phrasing, e.g. "2 hour 15 minutes" / "45 minutes" / "completed". */
  time_remaining: string
  time_remaining_minutes: number
  /** "<brand> <hardware> x<qty>", pre-assembled by the handler. */
  hardware_info: string
  hardware_name: string
  brand_name: string
  hardware_quantity: number
  /** 0–100, share of the paid compute window already consumed. */
  completed_percent: number
  compute_minutes_served: number
  compute_minutes_remaining: number
  /** Unix SECONDS. Falls back to "now" when io.net sends a zero time. */
  created_at: number
  /** Unix SECONDS. Always equal to created_at — the handler copies it. */
  updated_at: number
  /** Always "". */
  model_name: string
  /** Always "". */
  model_version: string
  /** Copy of hardware_quantity. */
  instance_count: number
  /** cpu and memory are always ""; gpu is hardware_quantity as a string. */
  resource_config: { cpu: string; memory: string; gpu: string }
  /** Always "". */
  description: string
  /** Always "io.net". */
  provider: string
}

/**
 * `GET /api/deployments/`.
 *
 * `status_counts` is NOT a whole-collection tally. `computeStatusCounts` seeds "all" with
 * the upstream `total` and then walks ONLY the deployments on the page it just fetched,
 * so every per-status number counts the current page alone. The UI says so rather than
 * presenting them as collection totals.
 */
export type DeploymentListPage = {
  page: number
  page_size: number
  total: number
  items: Deployment[]
  status_counts: Record<string, number>
}

/**
 * `GET /api/deployments/search`. Same envelope WITHOUT `status_counts`.
 *
 * The keyword filter is applied in Go to the page that was already sliced upstream
 * (`SearchDeployments` calls `ListDeployments` with the same page/page_size and then
 * filters the result), so it matches within the current page only and `total` becomes the
 * filtered count. The toolbar states this next to the field.
 */
export type DeploymentSearchPage = {
  page: number
  page_size: number
  total: number
  items: Deployment[]
}

export type DeploymentFilters = {
  keyword: string
  /** A lower-cased status, or '' for every status. */
  status: string
}

export const EMPTY_DEPLOYMENT_FILTERS: DeploymentFilters = { keyword: '', status: '' }

export function hasActiveDeploymentFilters(filters: DeploymentFilters): boolean {
  return filters.keyword.trim() !== '' || filters.status !== ''
}

/**
 * One factory for both list routes. `/search` is used only when a keyword is present,
 * because it is the only route that understands one; the plain list is preferred
 * otherwise since it also returns the status tally.
 *
 * Both routes sort `created_at desc` server-side and accept no sort parameters, so this
 * table offers no sortable columns.
 */
export function deploymentsQuery(filters: DeploymentFilters, page: number, pageSize: number) {
  const keyword = filters.keyword.trim()
  const isSearch = keyword !== ''

  return queryOptions({
    queryKey: ['deployments', 'list', keyword, filters.status, page, pageSize] as const,
    queryFn: async (): Promise<DeploymentListPage> => {
      if (isSearch) {
        const found = await getJson<DeploymentSearchPage>('/api/deployments/search', {
          ...silent,
          params: { keyword, p: page, page_size: pageSize, status: filters.status },
        })
        return { ...found, status_counts: {} }
      }
      return getJson<DeploymentListPage>('/api/deployments/', {
        ...silent,
        params: { p: page, page_size: pageSize, status: filters.status },
      })
    },
    staleTime: 10 * 1000,
  })
}

/* ------------------------------------------------------------------ *
 * One deployment
 * ------------------------------------------------------------------ */

/** An entry of `DeploymentDetail.locations` (pkg/ionet/types.go). */
export type DeploymentLocationRef = {
  id: number
  iso2: string
  name: string
}

/** `DeploymentDetail.container_config` — the only writable surface of a live deployment. */
export type DeploymentContainerConfig = {
  entrypoint: string[] | null
  /** `map[string]interface{}` upstream: values may be strings, numbers or booleans. */
  env_variables: Record<string, unknown> | null
  traffic_port: number
  image_url: string
}

/**
 * `GET /api/deployments/:id` (controller.GetDeployment).
 *
 * Hard-coded to empty by the handler and therefore never rendered:
 *   deployment_name — assigned `details.ID`, i.e. the id again, NOT the cluster name.
 *   model_name "", model_version "", description "", resource_config.cpu/.memory "".
 *   updated_at — a copy of created_at.
 */
export type DeploymentDetail = {
  id: string
  /** A copy of `id`. Not a name. */
  deployment_name: string
  model_name: string
  model_version: string
  status: string
  /** Copy of total_containers. */
  instance_count: number
  hardware_id: number
  resource_config: { cpu: string; memory: string; gpu: string }
  created_at: number
  updated_at: number
  description: string
  /** Settled amount, in io.net's settlement currency. */
  amount_paid: number
  completed_percent: number
  gpus_per_container: number
  total_gpus: number
  total_containers: number
  hardware_name: string
  brand_name: string
  compute_minutes_served: number
  compute_minutes_remaining: number
  locations: DeploymentLocationRef[] | null
  container_config: DeploymentContainerConfig
}

export function deploymentDetailQuery(id: string | undefined) {
  return queryOptions({
    enabled: id !== undefined,
    queryKey: ['deployments', 'detail', id] as const,
    queryFn: () => getJson<DeploymentDetail>(`/api/deployments/${encodeURIComponent(id ?? '')}`, silent),
    staleTime: 10 * 1000,
  })
}

/* ------------------------------------------------------------------ *
 * Containers and logs
 * ------------------------------------------------------------------ */

export type DeploymentContainerEvent = {
  /** Unix SECONDS. */
  time: number
  message: string
}

/** One worker of `GET /api/deployments/:id/containers` (controller.ListDeploymentContainers). */
export type DeploymentContainer = {
  container_id: string
  device_id: string
  status: string
  hardware: string
  brand_name: string
  /** Unix SECONDS. */
  created_at: number
  /** Whole percent, as sent by io.net. */
  uptime_percent: number
  gpus_per_container: number
  public_url: string
  events: DeploymentContainerEvent[]
}

export type DeploymentContainersPage = {
  total: number
  containers: DeploymentContainer[]
}

export function deploymentContainersQuery(id: string | undefined, enabled: boolean) {
  return queryOptions({
    enabled: enabled && id !== undefined,
    queryKey: ['deployments', 'containers', id] as const,
    queryFn: () =>
      getJson<DeploymentContainersPage>(
        `/api/deployments/${encodeURIComponent(id ?? '')}/containers`,
        silent,
      ),
    staleTime: 10 * 1000,
  })
}

/**
 * `GET /api/deployments/:id/logs` (controller.GetDeploymentLogs).
 *
 * `container_id` is REQUIRED — without it the handler answers
 * "container_id parameter is required" before touching io.net. The handler returns
 * `GetContainerLogsRaw`, i.e. the upstream response body as ONE STRING, not a parsed list
 * of entries, so there is nothing to render but text. `limit` is clamped to 1000 in Go;
 * `follow` is accepted but this console never sets it (the handler still answers with a
 * single body, so following would only re-request).
 */
export type DeploymentLogQuery = {
  container_id: string
  /** '' | 'stdout' | 'stderr' — passed through to io.net untouched. */
  stream: string
  limit: number
}

export function deploymentLogsQuery(
  id: string | undefined,
  options: DeploymentLogQuery,
  enabled: boolean,
) {
  return queryOptions({
    enabled: enabled && id !== undefined && options.container_id !== '',
    queryKey: ['deployments', 'logs', id, options.container_id, options.stream, options.limit] as const,
    queryFn: () =>
      getJson<string>(`/api/deployments/${encodeURIComponent(id ?? '')}/logs`, {
        ...silent,
        params: {
          container_id: options.container_id,
          limit: options.limit,
          ...(options.stream === '' ? {} : { stream: options.stream }),
        },
      }),
    staleTime: 0,
  })
}

/* ------------------------------------------------------------------ *
 * Catalogue: hardware, locations, replicas
 * ------------------------------------------------------------------ */

/**
 * One entry of `GET /api/deployments/hardware-types`.
 *
 * `Client.ListHardwareTypes` does NOT call a hardware catalogue: it maps
 * `/hardware/max-gpus-per-container`, whose rows carry only max_gpus_per_container,
 * available, hardware_id, hardware_name and brand_name. Everything else in the Go
 * `HardwareType` struct is written as a zero value on the way out, so this console shows
 * the five real fields and NOTHING else — no GPU memory, no CPU, no storage and above all
 * no hourly_rate, all of which would read as 0 on every row.
 */
export type HardwareType = {
  id: number
  name: string
  /** Always "" — mapped as a zero value. */
  gpu_type: string
  /** Always 0. */
  gpu_memory: number
  /** max_gpus_per_container: the ceiling for gpus_per_container. */
  max_gpus: number
  /** Always 0. Price comes from the estimate endpoint, never from here. */
  hourly_rate: number
  /** available > 0. */
  available: boolean
  /** Omitted by Go when empty. */
  brand_name?: string
  /** Units free upstream. Omitted by Go when 0. */
  available_count?: number
}

export type HardwareTypesPage = {
  hardware_types: HardwareType[]
  total: number
  total_available: number
}

export function hardwareTypesQuery(enabled: boolean) {
  return queryOptions({
    enabled,
    queryKey: ['deployments', 'hardware-types'] as const,
    queryFn: () => getJson<HardwareTypesPage>('/api/deployments/hardware-types', silent),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * One entry of `GET /api/deployments/locations`. VERIFIED LIVE — a real row is
 * {"id":2,"name":"United States","iso2":"US","available":147}. `region`, `country`,
 * `latitude`, `longitude` and `description` are `omitempty` in Go and were absent from
 * every one of the 13 rows the live server returned, so they are optional here and are
 * not rendered.
 */
export type DeploymentLocation = {
  id: number
  name: string
  iso2?: string
  available?: number
  region?: string
  country?: string
  description?: string
}

/** `total` is io.net's own total, or the SUM of `available` when io.net sends 0. */
export type DeploymentLocationsPage = {
  locations: DeploymentLocation[]
  total: number
}

export function deploymentLocationsQuery(enabled: boolean) {
  return queryOptions({
    enabled,
    queryKey: ['deployments', 'locations'] as const,
    queryFn: () => getJson<DeploymentLocationsPage>('/api/deployments/locations', silent),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * One entry of `GET /api/deployments/available-replicas?hardware_id=&gpu_count=`.
 *
 * `Client.GetAvailableReplicas` maps `{id, iso2, name, available_replicas}` onto this
 * struct: `hardware_name` is written as "" and `max_gpus` is the gpu_count that was
 * asked for, echoed back. Only `location_id`, `location_name` and `available_count`
 * carry upstream information, so only those three are used.
 */
export type AvailableReplica = {
  location_id: number
  location_name: string
  hardware_id: number
  /** Always "". */
  hardware_name: string
  available_count: number
  /** The requested gpu_count, echoed. */
  max_gpus: number
}

export type AvailableReplicasPage = {
  replicas: AvailableReplica[]
}

export function availableReplicasQuery(hardwareId: number | undefined, gpuCount: number, enabled: boolean) {
  return queryOptions({
    enabled: enabled && hardwareId !== undefined && gpuCount > 0,
    queryKey: ['deployments', 'available-replicas', hardwareId, gpuCount] as const,
    queryFn: () =>
      getJson<AvailableReplicasPage>('/api/deployments/available-replicas', {
        ...silent,
        params: { gpu_count: gpuCount, hardware_id: hardwareId },
      }),
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ *
 * The name check
 * ------------------------------------------------------------------ */

/**
 * `GET /api/deployments/check-name?name=` (controller.CheckClusterNameAvailability).
 * Cluster names are unique upstream; `UpdateDeploymentName` runs this same check server
 * side and refuses with "deployment name is not available, please choose a different
 * name" when it comes back false, so both forms ask first.
 */
export type ClusterNameCheck = {
  available: boolean
  name: string
}

export function clusterNameCheckQuery(name: string, enabled: boolean) {
  const trimmed = name.trim()
  return queryOptions({
    enabled: enabled && trimmed !== '',
    queryKey: ['deployments', 'check-name', trimmed] as const,
    queryFn: () =>
      getJson<ClusterNameCheck>('/api/deployments/check-name', {
        ...silent,
        params: { name: trimmed },
      }),
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ *
 * Price estimation — the money gate
 * ------------------------------------------------------------------ */

/**
 * The body `POST /api/deployments/price-estimation` binds (`ionet.PriceEstimationRequest`).
 *
 * `Client.GetPriceEstimation` fills the blanks: currency defaults to "usdc",
 * duration_type to "hour", duration_qty to duration_hours and hardware_qty to
 * gpus_per_container. It refuses with a 400-shaped envelope when location_ids is empty,
 * hardware_id is 0 or replica_count < 1, so the caller must have all three.
 */
export type PriceEstimationPayload = {
  location_ids: number[]
  hardware_id: number
  gpus_per_container: number
  duration_hours: number
  replica_count: number
  currency: string
  duration_type: string
  duration_qty: number
  hardware_qty: number
}

/**
 * The response `Client.GetPriceEstimation` assembles from io.net's `/price` payload.
 *
 *   estimated_cost  = total_cost_usdc
 *   price_breakdown.total_cost   = the same number
 *   price_breakdown.compute_cost = total − ionet_fee − currency_conversion_fee
 *   price_breakdown.hourly_rate  = total ÷ the duration in hours
 *   estimation_valid             = hard-coded true whenever the call succeeded
 *
 * `network_cost` and `storage_cost` are `omitempty` and never written, so they are absent.
 */
export type PriceBreakdown = {
  compute_cost: number
  total_cost: number
  hourly_rate: number
  network_cost?: number
  storage_cost?: number
}

export type PriceEstimation = {
  estimated_cost: number
  currency: string
  price_breakdown: PriceBreakdown
  /** Hard-coded true by the Go client on every successful call. */
  estimation_valid: boolean
}

/** The settlement currency `Client.GetPriceEstimation` falls back to. */
export const DEFAULT_PRICE_CURRENCY = 'usdc'

/**
 * Always a mutation, never a cached query: an estimate shown next to a "spend money"
 * button must be built from the values on screen at that moment, so nothing here may be
 * served from a previous set of inputs.
 */
export function estimateDeploymentPrice(payload: PriceEstimationPayload): Promise<PriceEstimation> {
  return postJson<PriceEstimation>('/api/deployments/price-estimation', payload, silent)
}

/** Assembles the payload from the pieces every caller has, filling the derivable fields. */
export function buildPricePayload(input: {
  locationIds: number[]
  hardwareId: number
  gpusPerContainer: number
  durationHours: number
  replicaCount: number
}): PriceEstimationPayload {
  return {
    currency: DEFAULT_PRICE_CURRENCY,
    duration_hours: input.durationHours,
    duration_qty: input.durationHours,
    duration_type: 'hour',
    gpus_per_container: input.gpusPerContainer,
    hardware_id: input.hardwareId,
    hardware_qty: input.gpusPerContainer,
    location_ids: input.locationIds,
    replica_count: input.replicaCount,
  }
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/**
 * The body `POST /api/deployments/` binds (`ionet.DeploymentRequest`). The Go client
 * validates before any HTTP call and names the offending field:
 * resource_private_name, location_ids, hardware_id, registry_config.image_url,
 * gpus_per_container ≥ 1, duration_hours ≥ 1, container_config.replica_count ≥ 1.
 */
export type CreateDeploymentPayload = {
  resource_private_name: string
  duration_hours: number
  gpus_per_container: number
  hardware_id: number
  location_ids: number[]
  container_config: {
    replica_count: number
    env_variables?: Record<string, string>
    secret_env_variables?: Record<string, string>
    entrypoint?: string[]
    traffic_port?: number
    args?: string[]
  }
  registry_config: {
    image_url: string
    registry_username?: string
    registry_secret?: string
  }
}

/** `{deployment_id, status, message}` — the handler adds the message itself. */
export type CreateDeploymentResult = {
  deployment_id: string
  status: string
  message: string
}

export function createDeployment(payload: CreateDeploymentPayload): Promise<CreateDeploymentResult> {
  return postJson<CreateDeploymentResult>('/api/deployments/', payload, silent)
}

/**
 * The body `PUT /api/deployments/:id` binds (`ionet.UpdateDeploymentRequest`). Every field
 * is `omitempty`, so an omitted key is left alone upstream; `traffic_port` is a `*int`,
 * which is why it is optional here rather than 0.
 */
export type UpdateDeploymentPayload = {
  image_url?: string
  traffic_port?: number
  entrypoint?: string[]
  args?: string[]
  command?: string
  env_variables?: Record<string, string>
  secret_env_variables?: Record<string, string>
  registry_username?: string
  registry_secret?: string
}

export type UpdateDeploymentResult = {
  status: string
  deployment_id: string
}

export function updateDeployment(
  id: string,
  payload: UpdateDeploymentPayload,
): Promise<UpdateDeploymentResult> {
  return putJson<UpdateDeploymentResult>(`/api/deployments/${encodeURIComponent(id)}`, payload, silent)
}

/**
 * `PUT /api/deployments/:id/name` with `{name}`. The handler re-checks availability itself
 * and refuses a taken name, so the form's own check is a courtesy, not the boundary.
 */
export type UpdateDeploymentNameResult = {
  status: string
  message: string
  id: string
  name: string
}

export function renameDeployment(id: string, name: string): Promise<UpdateDeploymentNameResult> {
  return putJson<UpdateDeploymentNameResult>(
    `/api/deployments/${encodeURIComponent(id)}/name`,
    { name },
    silent,
  )
}

/**
 * `POST /api/deployments/:id/extend` with `{duration_hours}`. SPENDS MONEY: it buys more
 * compute on a running cluster. The response is a deployment row rebuilt by
 * `mapIoNetDeployment`, whose `deployment_name` is the id that was extended.
 */
export function extendDeployment(id: string, durationHours: number): Promise<Deployment> {
  return postJson<Deployment>(
    `/api/deployments/${encodeURIComponent(id)}/extend`,
    { duration_hours: durationHours },
    silent,
  )
}

/**
 * `DELETE /api/deployments/:id`. Irreversible: it asks io.net to terminate the cluster.
 * The handler answers `{status, deployment_id, message}` with its own message,
 * "Deployment termination requested successfully".
 */
export type DeleteDeploymentResult = {
  status: string
  deployment_id: string
  message: string
}

export function deleteDeployment(id: string): Promise<DeleteDeploymentResult> {
  return deleteJson<DeleteDeploymentResult>(`/api/deployments/${encodeURIComponent(id)}`, silent)
}
