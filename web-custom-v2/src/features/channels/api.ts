import { queryOptions } from '@tanstack/react-query'

import { deleteJson, getJson, postJson, putJson } from '@/lib/api/client'
import { api, type ApiRequestConfig } from '@/lib/http-client'

/**
 * Every channel endpoint renders its own error surface, so the global axios
 * interceptor must not also fire a toast for the same failure.
 */
const silent: ApiRequestConfig = { skipBusinessError: true, skipErrorHandler: true }

/**
 * `model.Channel.ChannelInfo` (model/channel.go). `multi_key_disabled_reason` and
 * `multi_key_disabled_time` are stripped by `controller.clearChannelInfo` on every
 * list/detail read, so they never reach this console and are not modelled.
 */
export type ChannelInfo = {
  is_multi_key: boolean
  multi_key_size: number
  /** key index → status. `null` on every single-key channel. */
  multi_key_status_list: Record<string, number> | null
  multi_key_polling_index: number
  /** '' | 'random' | 'polling' (constant/multi_key_mode.go). */
  multi_key_mode: string
}

/**
 * A row from `GET /api/channel/`, `GET /api/channel/search` and `GET /api/channel/:id`
 * (controller/channel.go, model/channel.go). Verified field-by-field against the running
 * dev server; this is a verbatim item, with nothing elided:
 *
 *   { "id": 3, "type": 1, "key": "", "openai_organization": null, "test_model": null,
 *     "status": 1, "name": "__probe_chanui", "weight": 2, "created_time": 1788052007,
 *     "test_time": 0, "response_time": 0, "base_url": "http://127.0.0.1:9", "other": "",
 *     "balance": 0, "balance_updated_time": 0, "models": "gpt-4o-mini", "group": "default",
 *     "used_quota": 0, "model_mapping": "{\"a\":\"b\"}", "status_code_mapping": "",
 *     "priority": 3, "auto_ban": 1, "other_info": "", "tag": "probeTag", "setting": "",
 *     "param_override": null, "header_override": null, "remark": "probe",
 *     "channel_info": { … }, "settings": "" }
 *
 * `key` is ALWAYS the empty string on a read: all three handlers run `Omit("key")`
 * (`GetAllChannels`, `SearchChannels`, `model.GetChannelById(id, false)`). It is not a
 * mask of the stored key — no part of the secret is disclosed. The only endpoint that
 * returns a key is `POST /api/channel/:id/key`, which is root-only AND behind
 * `SecureVerificationRequired`; this console does not call it (see README note in
 * `channel-presentation.ts`).
 */
export type Channel = {
  id: number
  /** A `constant.ChannelType*` value; see CHANNEL_TYPE_NAMES. */
  type: number
  /** Always ''. See the note above — reads never carry the secret. */
  key: string
  openai_organization: string | null
  test_model: string | null
  /** 1 enabled, 2 manually disabled, 3 automatically disabled (common/constants.go). */
  status: number
  name: string
  /** `*uint`; null when the column was never written. */
  weight: number | null
  /** Unix SECONDS. */
  created_time: number
  /** Unix SECONDS; 0 when the channel has never been tested. */
  test_time: number
  /** Milliseconds measured by the last test; 0 when never tested. */
  response_time: number
  base_url: string | null
  /** A per-type scalar: Azure API version, Cloudflare account id, Vertex region JSON… */
  other: string
  /** USD, as reported by the upstream billing endpoint. */
  balance: number
  /** Unix SECONDS; 0 when the balance has never been refreshed. */
  balance_updated_time: number
  /** Comma-separated model names. */
  models: string
  /** Comma-separated group names. */
  group: string
  used_quota: number
  model_mapping: string | null
  status_code_mapping: string | null
  /** `*int64`; null when the column was never written. */
  priority: number | null
  /** `*int`: 1 auto-disable on repeated upstream failures, 0 never. */
  auto_ban: number | null
  /** Server-written JSON blob, e.g. {"status_reason":…,"status_time":…}. Read-only. */
  other_info: string
  tag: string | null
  /** JSON string of `dto.ChannelSettings` (proxy, system prompt, HTTP transport…). */
  setting: string | null
  param_override: string | null
  header_override: string | null
  remark: string | null
  channel_info: ChannelInfo
  /** JSON string of `dto.ChannelOtherSettings`. Note the column is `settings`. */
  settings: string
}

/**
 * `GET /api/channel/` returns items/total/page/page_size/type_counts.
 * `GET /api/channel/search` returns items/total/type_counts ONLY — it paginates in Go
 * but does not echo the page back, so both fields are optional here.
 *
 * `type_counts` is keyed by the stringified channel type and is computed WITHOUT the
 * type filter applied, so it stays stable while a type facet is active.
 */
export type ChannelPage = {
  items: Channel[]
  total: number
  page?: number
  page_size?: number
  type_counts: Record<string, number>
}

/** The six columns `model.channelSortColumns` accepts; anything else falls back. */
export const CHANNEL_SORT_COLUMNS = [
  'id',
  'name',
  'priority',
  'balance',
  'response_time',
  'test_time',
] as const

export type ChannelSortColumn = (typeof CHANNEL_SORT_COLUMNS)[number]

export function isChannelSortColumn(value: string): value is ChannelSortColumn {
  return (CHANNEL_SORT_COLUMNS as readonly string[]).includes(value)
}

export type ChannelFilters = {
  keyword: string
  /** A group name from `GET /api/group/`, or '' for every group. */
  group: string
  /** A model name, matched against the channel's model list by `/search` only. */
  model: string
  /** 'enabled' | 'disabled' | '' — the three values `parseStatusFilter` understands. */
  status: string
  /** A stringified channel type, or '' for every type. */
  type: string
}

export type ChannelSort = {
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export const EMPTY_CHANNEL_FILTERS: ChannelFilters = {
  group: '',
  keyword: '',
  model: '',
  status: '',
  type: '',
}

export function hasActiveChannelFilters(filters: ChannelFilters): boolean {
  return (
    filters.keyword.trim() !== ''
    || filters.model.trim() !== ''
    || filters.group !== ''
    || filters.status !== ''
    || filters.type !== ''
  )
}

/**
 * One factory for both list endpoints.
 *
 * `/api/channel/search` is the only one that understands `keyword` and `model`, so it is
 * used whenever either is set. The plain list understands `group`, `status` and `type`
 * as SQL predicates and paginates in the database, so it is preferred when it can serve
 * the request — `/search` loads every matching row into memory before slicing.
 */
export function channelsQuery(
  filters: ChannelFilters,
  page: number,
  pageSize: number,
  sort: ChannelSort,
) {
  const keyword = filters.keyword.trim()
  const model = filters.model.trim()
  const isSearch = keyword !== '' || model !== ''

  return queryOptions({
    queryKey: [
      'channels',
      'list',
      keyword,
      model,
      filters.group,
      filters.status,
      filters.type,
      page,
      pageSize,
      sort,
    ] as const,
    queryFn: () =>
      getJson<ChannelPage>(isSearch ? '/api/channel/search' : '/api/channel/', {
        ...silent,
        params: {
          group: filters.group,
          p: page,
          page_size: pageSize,
          status: filters.status,
          type: filters.type,
          ...(isSearch ? { keyword, model } : {}),
          ...sort,
        },
      }),
    staleTime: 10 * 1000,
  })
}

/** `GET /api/group/` → a flat array of group names, e.g. ["default","vip","svip"]. */
export function channelGroupNamesQuery() {
  return queryOptions({
    queryKey: ['channels', 'groups'] as const,
    queryFn: () => getJson<string[]>('/api/group/', silent),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * `GET /api/channel/models_enabled` → the model names currently served by at least one
 * enabled channel. Used as the suggestion list for the model filter and the test model.
 */
export function enabledModelNamesQuery() {
  return queryOptions({
    queryKey: ['channels', 'models-enabled'] as const,
    queryFn: () => getJson<string[]>('/api/channel/models_enabled', silent),
    staleTime: 5 * 60 * 1000,
  })
}

/** One entry of `GET /api/channel/models` (controller.OpenAIModel). */
export type CatalogModel = {
  id: string
  object: string
  created: number
  owned_by: string
}

/**
 * `GET /api/channel/models` → the gateway's built-in model catalogue. Offered in the
 * drawer as a picker so a model list can be assembled without typing.
 */
export function catalogModelsQuery() {
  return queryOptions({
    queryKey: ['channels', 'models-catalog'] as const,
    queryFn: () => getJson<CatalogModel[]>('/api/channel/models', silent),
    staleTime: 30 * 60 * 1000,
  })
}

/** `GET /api/channel/:id`. Carries the same masked-out `key: ''` as the list. */
export function fetchChannel(id: number): Promise<Channel> {
  return getJson<Channel>(`/api/channel/${id}`, silent)
}

/**
 * The body `POST /api/channel/` binds (controller.AddChannelRequest).
 *
 * `mode` is required — an unrecognised value is refused with "不支持的添加模式".
 *   'single'          one channel from one key
 *   'batch'           one channel per newline-separated key
 *   'multi_to_single' one channel holding every key, rotated by `multi_key_mode`
 */
export type CreateChannelPayload = {
  mode: 'single' | 'batch' | 'multi_to_single'
  multi_key_mode?: 'random' | 'polling'
  batch_add_set_key_prefix_2_name?: boolean
  channel: ChannelWritePayload
}

/**
 * The channel fields this console writes. Everything here is either in
 * `channelSensitiveFields` or `channelNonSensitiveFields` (controller/channel_authz.go);
 * an unclassified field would be treated as sensitive by the server's fail-closed scan.
 *
 * `status` is deliberately absent: `UpdateChannel` refuses ANY request whose body
 * carries a `status` key with "Invalid parameters". Status moves through
 * `POST /api/channel/:id/status` instead.
 */
export type ChannelWritePayload = {
  id?: number
  type: number
  name: string
  /**
   * OMIT on update to keep the stored key. `model.Channel.Update` uses GORM
   * `Updates(struct)`, which skips zero values, so an empty string cannot clobber a
   * stored secret — verified on the dev server: after `PUT` with `key: ""` the row's
   * key column was unchanged.
   */
  key?: string
  base_url?: string
  other?: string
  models: string
  group: string
  model_mapping?: string
  status_code_mapping?: string
  param_override?: string
  header_override?: string
  openai_organization?: string
  test_model?: string
  priority?: number
  weight?: number
  auto_ban?: number
  tag?: string | null
  remark?: string
  /** JSON string of `dto.ChannelSettings`. */
  setting?: string
  /** JSON string of `dto.ChannelOtherSettings`; the column is named `settings`. */
  settings?: string
}

export function createChannel(payload: CreateChannelPayload): Promise<unknown> {
  return postJson('/api/channel/', payload, silent)
}

/**
 * `PUT /api/channel/`. Only the keys present in the body are considered, so a partial
 * payload is the norm — see `buildUpdatePayload` in `channel-presentation.ts`, which
 * drops every sensitive field that did not actually change so a `channel:write`-only
 * administrator is not refused for editing routing alone.
 */
export function updateChannel(payload: ChannelWritePayload & { id: number }): Promise<Channel> {
  return putJson<Channel>('/api/channel/', payload, silent)
}

/** `DELETE /api/channel/:id`. Permanent; also drops the channel's ability rows. */
export function deleteChannel(id: number): Promise<unknown> {
  return deleteJson(`/api/channel/${id}`, silent)
}

/** `POST /api/channel/batch` → the number of rows actually deleted. */
export function deleteChannelsBatch(ids: number[]): Promise<number> {
  return postJson<number>('/api/channel/batch', { ids }, silent)
}

/** `DELETE /api/channel/disabled` → the number of disabled rows deleted. */
export function deleteDisabledChannels(): Promise<number> {
  return deleteJson<number>('/api/channel/disabled', silent)
}

/**
 * `POST /api/channel/:id/status` → true when the row actually moved.
 * `isManageableChannelStatus` accepts only 1 (enabled) and 2 (manually disabled); 3
 * (auto-disabled) is reserved for the server and is refused with "Invalid parameters".
 */
export function setChannelStatus(id: number, status: number): Promise<boolean> {
  return postJson<boolean>(`/api/channel/${id}/status`, { status }, silent)
}

/** `POST /api/channel/status/batch` → the number of rows that actually moved. */
export function setChannelStatusBatch(ids: number[], status: number): Promise<number> {
  return postJson<number>('/api/channel/status/batch', { ids, status }, silent)
}

/** `POST /api/channel/copy/:id` → the new channel's id. The key is copied too. */
export function copyChannel(id: number, suffix: string): Promise<{ id: number }> {
  return postJson<{ id: number }>(`/api/channel/copy/${id}`, undefined, {
    ...silent,
    params: { reset_balance: 'true', suffix },
  })
}

/** `POST /api/channel/batch/tag` → the number of rows retagged. */
export function setChannelsTag(ids: number[], tag: string): Promise<number> {
  return postJson<number>('/api/channel/batch/tag', { ids, tag }, silent)
}

/**
 * `GET /api/channel/test/:id`. A REAL upstream call: it spends the channel's own credit
 * and can take as long as the upstream takes.
 *
 * The payload is NOT the usual envelope — `time` and `error_code` sit next to `success`
 * and there is no `data`, so this goes through axios directly instead of `getJson`.
 * Verified against the dev server, failure case:
 *   {"error_code":"do_request_failed","message":"do request failed: upstream error: …",
 *    "success":false,"time":0}
 * and success case: {"success":true,"message":"","time":1.234}.
 */
export type ChannelTestResult = {
  success: boolean
  message: string
  /** Round-trip time in SECONDS (fractional). 0 when the call never left the process. */
  time: number
  error_code?: string
}

export async function testChannel(id: number, model: string): Promise<ChannelTestResult> {
  const response = await api.get<ChannelTestResult>(`/api/channel/test/${id}`, {
    ...silent,
    disableDuplicate: true,
    params: model === '' ? {} : { model },
  })
  return {
    error_code: response.data.error_code,
    message: response.data.message ?? '',
    success: response.data.success === true,
    time: typeof response.data.time === 'number' ? response.data.time : 0,
  }
}

/**
 * `GET /api/channel/update_balance/:id`. Another REAL upstream call. `balance` sits at
 * the top level next to `success`, not inside `data`.
 *
 * Only implemented for a handful of providers — see `SUPPORTS_BALANCE_TYPES`. Everything
 * else answers `{"success":false,"message":"尚未实现"}`, and a multi-key channel answers
 * "多密钥渠道不支持余额查询".
 */
export type ChannelBalanceResult = {
  success: boolean
  message: string
  /** USD. Absent on failure. */
  balance?: number
}

export async function refreshChannelBalance(id: number): Promise<ChannelBalanceResult> {
  const response = await api.get<ChannelBalanceResult>(`/api/channel/update_balance/${id}`, {
    ...silent,
    disableDuplicate: true,
  })
  return {
    balance: response.data.balance,
    message: response.data.message ?? '',
    success: response.data.success === true,
  }
}

/**
 * `GET /api/channel/fetch_models/:id` → the model ids the SAVED channel's upstream
 * advertises. Uses the stored key, so it works without re-typing the secret.
 */
export function fetchUpstreamModels(id: number): Promise<string[]> {
  return getJson<string[]>(`/api/channel/fetch_models/${id}`, {
    ...silent,
    disableDuplicate: true,
  })
}

/**
 * `POST /api/channel/fetch_models` → the same list for a channel that does not exist
 * yet. `key` travels in the body, so this is only called from the create drawer when
 * the admin has just typed one, and the response is never logged.
 */
export function fetchUpstreamModelsForDraft(input: {
  type: number
  key: string
  base_url: string
}): Promise<string[]> {
  return postJson<string[]>(
    '/api/channel/fetch_models',
    { base_url: input.base_url, key: input.key, type: input.type },
    silent,
  )
}
