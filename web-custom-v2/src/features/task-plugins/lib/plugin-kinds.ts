import type { TaskPluginMeta, TaskPluginParts } from '../types'

/**
 * The lists the plugins page splits plugins into, one per part (docs/plugin-api/v1.md):
 * a task part runs async tasks, a provider part serves ordinary API requests on a Task
 * Plugin channel, and a request processing part inspects requests on any channel. A plugin
 * with several parts is listed under each.
 */
export const PLUGIN_KINDS = ['task', 'provider', 'transform'] as const
export type PluginKind = (typeof PLUGIN_KINDS)[number]

export const PLUGIN_KIND_LABELS: Record<PluginKind, string> = {
  task: 'Task',
  provider: 'Channel',
  transform: 'Request processing',
}

export type ResolvedPluginParts = Required<Omit<TaskPluginParts, 'transform_hooks'>>

/**
 * The parts a plugin has, with the fallbacks for older servers: a missing `task` counts as a
 * task part, a missing `provider` follows `meta.relay`, and a missing credential hook or
 * request processing part counts as absent.
 */
export function resolvePluginParts(item: TaskPluginParts & { meta: Pick<TaskPluginMeta, 'relay'> }): ResolvedPluginParts {
  return {
    task: item.task ?? true,
    provider: item.provider ?? Boolean(item.meta.relay?.length),
    login: item.login ?? false,
    refresh: item.refresh ?? false,
    transform: item.transform ?? false,
  }
}

export function countPluginKinds(items: readonly ResolvedPluginParts[]): Record<PluginKind, number> {
  const counts: Record<PluginKind, number> = { task: 0, provider: 0, transform: 0 }
  for (const parts of items) {
    for (const kind of PLUGIN_KINDS) if (parts[kind]) counts[kind] += 1
  }
  return counts
}

/** Without a chosen kind the page opens on Task, or the first kind that has plugins. */
export function defaultPluginKind(counts: Record<PluginKind, number>): PluginKind {
  return PLUGIN_KINDS.find((kind) => counts[kind] > 0) ?? 'task'
}
