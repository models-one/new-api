import { queryOptions } from '@tanstack/react-query'

import { ApiError } from '@/lib/api/client'
import { api, type ApiRequestConfig } from '@/lib/http-client'

import type {
  ApiResponse,
  MarketplaceSource,
  TaskPluginDetail,
  TaskPluginDryRunRequest,
  TaskPluginListItem,
  TaskPluginRecord,
  TaskPluginUsage,
} from './types'

// Mutations surface their own errors in the dialog that triggered them, and a
// rejected disable/delete carries the blocking channels in `data`, so the global
// business-error toast must not fire first.
const mutationConfig: ApiRequestConfig = {
  skipBusinessError: true,
  skipErrorHandler: true,
}

export class TaskPluginUsageError extends Error {
  constructor(
    message: string,
    public usage: TaskPluginUsage
  ) {
    super(message)
    this.name = 'TaskPluginUsageError'
  }
}

function requireSuccess<T>(response: ApiResponse<T>): T {
  if (!response.success) {
    const data = response.data as TaskPluginUsage | undefined
    if (data?.channels && typeof data.in_flight_count === 'number') {
      throw new TaskPluginUsageError(response.message, data)
    }
    throw new ApiError(response.message || 'Request failed')
  }
  return response.data
}

const pluginPath = (key: string) => `/api/plugin/task/${encodeURIComponent(key)}`

export async function listTaskPlugins() {
  const response = await api.get<ApiResponse<TaskPluginListItem[]>>('/api/plugin/task')
  return requireSuccess(response.data) ?? []
}

export async function getTaskPlugin(key: string, version?: string) {
  const response = await api.get<ApiResponse<TaskPluginDetail>>(pluginPath(key), {
    params: version ? { version } : undefined,
  })
  return requireSuccess(response.data)
}

export async function getTaskPluginVersions(key: string) {
  const response = await api.get<ApiResponse<TaskPluginRecord[]>>(`${pluginPath(key)}/versions`)
  return requireSuccess(response.data) ?? []
}

/**
 * `icon` is the sidecar icon.svg / icon.png as a data URI. It is stored apart
 * from the source, so the JavaScript stays readable in diffs and reviews.
 */
export async function uploadTaskPlugin(source: string, remark: string, icon?: string) {
  const response = await api.post<ApiResponse<TaskPluginDetail>>(
    '/api/plugin/task',
    { source, remark, icon: icon || undefined },
    mutationConfig
  )
  return requireSuccess(response.data)
}

/**
 * Installs a plugin fetched from a marketplace source. `sourceSha256` lets the
 * server re-verify the bytes it received against the index hash, and `force` is
 * deliberately never sent: a routing conflict must reject so the administrator
 * resolves it on the task plugins page instead of being silently overridden.
 */
export async function installMarketplacePlugin(request: {
  source: string
  sourceSha256?: string
  remark: string
  icon?: string
}) {
  const response = await api.post<ApiResponse<TaskPluginDetail>>(
    '/api/plugin/task',
    {
      source: request.source,
      sourceSha256: request.sourceSha256,
      enabled: true,
      remark: request.remark,
      icon: request.icon || undefined,
    },
    mutationConfig
  )
  return requireSuccess(response.data)
}

export async function listMarketplaceSources() {
  const response = await api.get<ApiResponse<MarketplaceSource[]>>('/api/plugin/task/marketplace/sources')
  return requireSuccess(response.data) ?? []
}

export async function updateMarketplaceSources(sources: MarketplaceSource[]) {
  const response = await api.put<ApiResponse<MarketplaceSource[]>>(
    '/api/plugin/task/marketplace/sources',
    sources,
    mutationConfig
  )
  return requireSuccess(response.data) ?? []
}

export async function activateTaskPlugin(key: string, version: string) {
  const response = await api.post<ApiResponse<null>>(`${pluginPath(key)}/activate`, { version }, mutationConfig)
  requireSuccess(response.data)
}

export async function setTaskPluginStatus(
  key: string,
  enabled: boolean,
  options?: { cascade?: boolean; force?: boolean }
) {
  const response = await api.post<ApiResponse<null>>(
    `${pluginPath(key)}/status`,
    { enabled },
    { ...mutationConfig, params: options }
  )
  requireSuccess(response.data)
}

export async function deleteTaskPluginVersion(key: string, version: string, force = false) {
  const response = await api.delete<ApiResponse<null>>(
    `${pluginPath(key)}/versions/${encodeURIComponent(version)}`,
    { ...mutationConfig, params: force ? { force: true } : undefined }
  )
  requireSuccess(response.data)
}

export async function dryRunTaskPlugin(key: string, request: TaskPluginDryRunRequest) {
  const response = await api.post<ApiResponse<unknown>>(`${pluginPath(key)}/dryrun`, request, mutationConfig)
  return requireSuccess(response.data)
}

export async function getTaskPluginEnabledOption() {
  const response = await api.get<ApiResponse<Array<{ key: string; value: string }>>>('/api/option/')
  const options = requireSuccess(response.data) ?? []
  return options.find((option) => option.key === 'TaskPluginEnabled')?.value === 'true'
}

export async function setTaskPluginEnabledOption(enabled: boolean) {
  const response = await api.put<ApiResponse<null>>(
    '/api/option/',
    { key: 'TaskPluginEnabled', value: String(enabled) },
    mutationConfig
  )
  requireSuccess(response.data)
}

export const taskPluginKeys = {
  all: ['task-plugins'] as const,
  detail: (key: string, version?: string) => ['task-plugins', 'detail', key, version ?? 'active'] as const,
  list: ['task-plugins', 'list'] as const,
  sources: ['task-plugins', 'marketplace-sources'] as const,
  switch: ['task-plugins', 'runtime-switch'] as const,
  versions: (key: string) => ['task-plugins', 'versions', key] as const,
}

export function taskPluginsQuery() {
  return queryOptions({ queryFn: listTaskPlugins, queryKey: taskPluginKeys.list })
}

export function taskPluginDetailQuery(key: string, version?: string) {
  return queryOptions({
    queryFn: () => getTaskPlugin(key, version),
    queryKey: taskPluginKeys.detail(key, version),
  })
}

export function taskPluginVersionsQuery(key: string) {
  return queryOptions({ queryFn: () => getTaskPluginVersions(key), queryKey: taskPluginKeys.versions(key) })
}

export function taskPluginRuntimeSwitchQuery() {
  return queryOptions({ queryFn: getTaskPluginEnabledOption, queryKey: taskPluginKeys.switch })
}

export function marketplaceSourcesQuery() {
  return queryOptions({ queryFn: listMarketplaceSources, queryKey: taskPluginKeys.sources })
}
