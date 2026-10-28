import type { ReactNode } from 'react'
import type { TFunction } from 'i18next'

import type { Tone } from '@/components/ui/tone'

import type { TaskPluginListItem } from './types'

type TaskPluginRuntimeStatus = TaskPluginListItem['runtime_status']

/**
 * Manifest prose is a `{ language: text }` map. The console language picks the
 * entry; a regional code (`zh-TW`) falls back to its base (`zh`), then English,
 * then whatever the author wrote first.
 */
export function localizedText(value: Record<string, string> | string | null | undefined, language: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  const normalized = language.toLowerCase()
  const exact = Object.entries(value).find(([code]) => code.toLowerCase() === normalized)?.[1]
  if (exact) return exact
  const base = normalized.split('-')[0]
  const baseMatch = Object.entries(value).find(([code]) => code.toLowerCase().split('-')[0] === base)?.[1]
  return baseMatch || value.en || Object.values(value).find(Boolean) || ''
}

export type RuntimeBadge = { label: string; tone: Tone; hint?: string }

export function runtimeStatusBadge(
  t: TFunction,
  status: TaskPluginRuntimeStatus | undefined,
  plugin: Pick<TaskPluginListItem, 'factory_meta' | 'runtime_error'>
): RuntimeBadge {
  switch (status) {
    case 'registered':
      return { label: t('Registered'), tone: 'success' }
    case 'compile_failed':
      return { hint: plugin.runtime_error, label: t('Compilation failed'), tone: 'destructive' }
    case 'disabled':
      return { label: t('Disabled'), tone: 'muted' }
    case 'disabled_fallback':
      return {
        label: plugin.factory_meta ? t('Disabled; fell back to factory') : t('Disabled; platform unavailable'),
        tone: 'warning',
      }
    default:
      return { label: t('Not registered'), tone: 'muted' }
  }
}

export function sourceBadge(t: TFunction, plugin: TaskPluginListItem): RuntimeBadge {
  if (plugin.source === 'factory') return { label: t('Factory'), tone: 'secondary' }
  if (plugin.source === 'override_over_factory') {
    return {
      label: t('Custom (overrides factory {{version}})', { version: plugin.factory_meta?.version }),
      tone: 'info',
    }
  }
  return { label: t('Third-party'), tone: 'primary' }
}

export function UsageList(props: { channels: Array<{ id: number; name: string }>; children?: ReactNode }) {
  if (props.channels.length === 0) return null
  return (
    <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-sm text-muted">
      {props.channels.map((channel) => (
        <li key={channel.id}>
          #{channel.id} {channel.name}
        </li>
      ))}
    </ul>
  )
}
