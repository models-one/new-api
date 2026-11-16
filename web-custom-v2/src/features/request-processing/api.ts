import { queryOptions } from '@tanstack/react-query'

import type { TaskPluginOption } from '@/features/channels/task-plugin-binding'
import type {
  RequestPluginDryRunRequest,
  RequestPluginDryRunResult,
  RequestPluginInstance,
} from '@/features/task-plugins/types'
import { getJson, postJson, putJson } from '@/lib/api/client'
import type { ApiRequestConfig } from '@/lib/http-client'

/**
 * Request processing (`controller/request_plugin.go`). Reading the instances needs an
 * administrator who may bind plugins; changing them or running a dry run is root only,
 * as installing a plugin is. The page renders its own errors, so the global toast is off.
 */
const silent: ApiRequestConfig = { skipBusinessError: true, skipErrorHandler: true }

export const requestProcessingKeys = {
  instances: ['request-processing', 'instances'] as const,
  options: ['request-processing', 'options'] as const,
}

/** `GET /api/request_plugin/instances`, in the order the instances run. */
export function requestPluginInstancesQuery() {
  return queryOptions({
    queryFn: async () => {
      const data = await getJson<{ instances: RequestPluginInstance[] | null }>('/api/request_plugin/instances', silent)
      return data.instances ?? []
    },
    queryKey: requestProcessingKeys.instances,
  })
}

/** The enabled plugins an instance can use: those with a request processing part. */
export function requestPluginOptionsQuery() {
  return queryOptions({
    queryFn: async () => {
      const options = await getJson<TaskPluginOption[] | null>('/api/task_plugin_options', silent)
      return (options ?? []).filter((option) => option.transform === true)
    },
    queryKey: requestProcessingKeys.options,
    staleTime: 60_000,
  })
}

/** `PUT /api/request_plugin/instances` replaces the whole list; its order is the run order. */
export async function saveRequestPluginInstances(instances: RequestPluginInstance[]): Promise<RequestPluginInstance[]> {
  const data = await putJson<{ instances: RequestPluginInstance[] | null }>('/api/request_plugin/instances', { instances }, silent)
  return data.instances ?? []
}

/** `POST /api/request_plugin/dry_run` runs instances on a request; nothing is sent upstream or charged. */
export function dryRunRequestPlugins(request: RequestPluginDryRunRequest): Promise<RequestPluginDryRunResult> {
  return postJson<RequestPluginDryRunResult>('/api/request_plugin/dry_run', request, silent)
}
