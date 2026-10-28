import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'

import {
  CHANNEL_TYPE_NAMES,
  NEW_API_CHANNEL_TYPE,
  TASK_PLUGIN_CHANNEL_TYPE,
} from './channel-presentation'

/** `controller.taskPluginOption` — an enabled task plugin a channel can be bound to. */
export type TaskPluginOption = {
  key: string
  name: string
  description?: Record<string, string> | null
  icon?: string
  hasIcon?: boolean
  baseUrl?: string
  models: string[]
  channelTypes?: number[] | null
  upstreams?: string[] | null
  sortPriority?: number
  website?: string
}

/** `GET /api/task_plugin_options` → enabled plugins, empty when the runtime is off. */
export function taskPluginOptionsQuery() {
  return queryOptions({
    queryKey: ['channels', 'task-plugin-options'] as const,
    queryFn: () =>
      getJson<TaskPluginOption[] | null>('/api/task_plugin_options', {
        skipBusinessError: true,
        skipErrorHandler: true,
      }).then((options) => options ?? []),
    staleTime: 60 * 1000,
  })
}

// These task-only legacy types are replaced by plugins, not extended by them.
const LEGACY_TASK_PLUGIN_KEYS: Readonly<Partial<Record<number, string>>> = {
  36: 'sunoapi',
  50: 'kling',
  51: 'jimeng',
  52: 'vidu',
  54: 'doubao',
  55: 'sora',
}

function supportsChannelPluginExtensions(channelType: number): boolean {
  return (
    channelType !== TASK_PLUGIN_CHANNEL_TYPE &&
    !LEGACY_TASK_PLUGIN_KEYS[channelType] &&
    CHANNEL_TYPE_NAMES[channelType] !== undefined
  )
}

/**
 * A New API channel proxies another gateway, which serves a plugin's wire format
 * only on the plugin's own native routes. Only drivers that declare they address
 * such a gateway can be bound there; the server rejects the rest.
 */
export function supportsNewAPIUpstream(plugin: Pick<TaskPluginOption, 'upstreams'>): boolean {
  return plugin.upstreams?.includes('new_api') ?? false
}

/**
 * Plugins that also route through a channel of this type: the ones declaring
 * the type in their manifest, or — for New API — the ones the administrator
 * listed on the channel.
 */
export function channelPluginExtensions(
  channelType: number,
  plugins: TaskPluginOption[],
  extendPluginKeys: readonly string[] = []
): TaskPluginOption[] {
  if (!supportsChannelPluginExtensions(channelType)) return []
  if (channelType === NEW_API_CHANNEL_TYPE) {
    return plugins.filter((plugin) => extendPluginKeys.includes(plugin.key))
  }
  return plugins.filter((plugin) => plugin.channelTypes?.includes(channelType))
}

/**
 * Hosts an administrator should look at twice before sending a channel key to
 * them: loopback, RFC 1918 and CGNAT ranges, link-local (including the cloud
 * metadata address), IPv6 loopback/link-local/ULA, and single-label or
 * *.local / *.internal / *.lan names. These are legitimate for self-hosted
 * upstreams, so they are flagged, never blocked.
 */
const PRIVATE_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /\.(local|internal|lan)$/i,
]

export type BaseUrlTrust = {
  plainHttp: boolean
  privateHost: boolean
}

/**
 * Describes why a base URL deserves a warning before a channel key is bound to
 * it. Returns null for empty or unparsable input so callers render nothing.
 */
export function assessBaseUrlTrust(value: string | undefined): BaseUrlTrust | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const host = parsed.hostname.toLowerCase()
  const singleLabel = !host.includes('.') && !host.includes(':')
  return {
    plainHttp: parsed.protocol === 'http:',
    privateHost: singleLabel || PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host)),
  }
}

function normalizeBaseUrlValue(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\/+$/, '')
}

/**
 * Decides what the Base URL field should become when the bound task plugin
 * changes. The plugin default is written only when the field is empty or still
 * holds the previous plugin's default, so a value the administrator typed by
 * hand survives switching plugins. Returns null when nothing should change.
 */
export function nextTaskPluginBaseUrl(
  currentValue: string | undefined,
  previousDefault: string | undefined,
  nextDefault: string | undefined
): string | null {
  if (!nextDefault) return null
  const current = normalizeBaseUrlValue(currentValue)
  if (current && current !== normalizeBaseUrlValue(previousDefault)) return null
  if (current === normalizeBaseUrlValue(nextDefault)) return null
  return nextDefault
}
