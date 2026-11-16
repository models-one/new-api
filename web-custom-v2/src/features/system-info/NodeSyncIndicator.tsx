import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import CircleAlertIcon from 'lucide-react/dist/esm/icons/circle-alert'
import CircleCheckIcon from 'lucide-react/dist/esm/icons/circle-check'
import LoaderCircleIcon from 'lucide-react/dist/esm/icons/loader-circle'

import { Popover } from '@/components/overlay'
import { Button } from '@/components/ui'
import { getJson } from '@/lib/api/client'
import { cn } from '@/lib/utils'

/**
 * Whether a change made on one node has reached the others (`controller.GetNodeSync`,
 * root only). Each topic is one kind of state the nodes reload, such as `plugins` or
 * `options`.
 */

export type NodeSyncTopicState = {
  synced: boolean
  applied_at: number
  error: string
  /** Per-item load failures, such as plugins, by item key. */
  errors: Record<string, string> | null
}

export type NodeSyncNode = {
  node_name: string
  online: boolean
  topics: Record<string, NodeSyncTopicState> | null
}

export type NodeSync = {
  topics: Array<{ topic: string; revision: number; updated_at: number; updated_by: string }>
  nodes: NodeSyncNode[]
}

export type NodeSyncState = 'synced' | 'updating' | 'failed'

const UPDATING_INTERVAL_MS = 3_000
const IDLE_INTERVAL_MS = 30_000

/** Labels of the sync topics the server registers; others show their id. */
const SYNC_TOPIC_LABELS: Record<string, string> = {
  authz: 'Permissions',
  channels: 'Channels',
  models: 'Models',
  oauth_providers: 'Login providers',
  options: 'Settings',
  plugins: 'Plugins',
  subscription_plans: 'Subscription plans',
}

/**
 * The watched topics the server registers. A topic the server does not run (the channel
 * cache when it is off) has no state on any node.
 */
function registeredSyncTopics(sync: NodeSync, topics: string[]) {
  const registered = sync.topics.map((item) => item.topic)
  return topics.filter((topic) => registered.includes(topic))
}

/** A node fails on any load error, else updates until every topic is synced. */
export function nodeSyncState(node: NodeSyncNode, topics: string[]): NodeSyncState {
  let state: NodeSyncState = 'synced'
  for (const topic of topics) {
    const entry = node.topics?.[topic]
    if (entry?.error || Object.keys(entry?.errors ?? {}).length > 0) return 'failed'
    if (!entry?.synced) state = 'updating'
  }
  return state
}

const STATE_CLASSES: Record<NodeSyncState, string> = {
  failed: 'text-destructive',
  synced: 'text-muted',
  updating: 'text-muted',
}

function StateIcon(props: { state: NodeSyncState }) {
  if (props.state === 'failed') return <CircleAlertIcon aria-hidden="true" className="size-3.5" />
  if (props.state === 'updating') return <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" />
  return <CircleCheckIcon aria-hidden="true" className="size-3.5 text-success" />
}

type NodeSyncIndicatorProps = {
  /** The sync topics the changes on this page go through. */
  topics: string[]
  /** Display names by item key, for items that failed to load (plugins). */
  itemNames?: Record<string, string>
  /** Only the root user can read the sync state. */
  enabled: boolean
}

/**
 * Whether the changes on a page have reached every online node. Shown only with two or
 * more online nodes; a click lists each node. Refetches every 3 s while a node is still
 * loading a watched topic, otherwise every 30 s.
 */
export function NodeSyncIndicator(props: NodeSyncIndicatorProps) {
  const { t } = useTranslation()
  const watched = props.topics
  const syncQuery = useQuery({
    enabled: props.enabled,
    queryFn: async (): Promise<NodeSync> => {
      const sync = await getJson<Partial<NodeSync> | null>('/api/system-info/sync', { skipBusinessError: true, skipErrorHandler: true })
      return { nodes: sync?.nodes ?? [], topics: sync?.topics ?? [] }
    },
    queryKey: ['system-info', 'node-sync'] as const,
    refetchInterval: (query) => {
      const sync = query.state.data
      if (!sync) return IDLE_INTERVAL_MS
      const topics = registeredSyncTopics(sync, watched)
      const updating = sync.nodes.some((node) => node.online && topics.some((topic) => !node.topics?.[topic]?.synced))
      return updating ? UPDATING_INTERVAL_MS : IDLE_INTERVAL_MS
    },
    retry: false,
  })
  const sync = syncQuery.data
  if (!sync) return null
  const topics = registeredSyncTopics(sync, watched)
  const nodes = sync.nodes.filter((node) => node.online)
  if (topics.length === 0 || nodes.length < 2) return null

  const states = nodes.map((node) => nodeSyncState(node, topics))
  const failedCount = states.filter((state) => state === 'failed').length
  const syncedCount = states.filter((state) => state === 'synced').length
  let summary: NodeSyncState = 'synced'
  let summaryText = t('Up to date on {{count}} nodes', { count: nodes.length })
  if (failedCount > 0) {
    summary = 'failed'
    summaryText = t('Failed on {{count}} nodes', { count: failedCount })
  } else if (syncedCount < nodes.length) {
    summary = 'updating'
    summaryText = t('{{synced}}/{{total}} nodes updated', { synced: syncedCount, total: nodes.length })
  }

  return (
    <Popover
      align="end"
      className="w-80"
      label={t('Nodes')}
      trigger={
        <Button className={cn('font-normal', STATE_CLASSES[summary])} size="sm" variant="quiet">
          <StateIcon state={summary} />
          {summaryText}
        </Button>
      }
    >
      <p className="mb-1 text-sm font-semibold text-foreground">{t('Nodes')}</p>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {nodes.map((node, index) => {
          const state = states[index]
          let stateText = t('In effect')
          if (state === 'failed') stateText = t('Update failed')
          else if (state === 'updating') stateText = t('Updating')
          const problems = topics.flatMap((topic) => {
            const entry = node.topics?.[topic]
            if (!entry || state !== 'failed') return []
            const items = Object.entries(entry.errors ?? {}).map(([key, message]) => ({
              key: `${topic}:${key}`,
              label: props.itemNames?.[key] ?? key,
              message,
            }))
            if (entry.error) {
              items.unshift({ key: topic, label: SYNC_TOPIC_LABELS[topic] ? t(SYNC_TOPIC_LABELS[topic]) : topic, message: entry.error })
            }
            return items
          })
          return (
            <li className="flex flex-col gap-1.5 py-2 last:pb-0" key={node.node_name}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{node.node_name}</span>
                <span className={cn('flex shrink-0 items-center gap-1 text-xs', STATE_CLASSES[state])}>
                  <StateIcon state={state} />
                  {stateText}
                </span>
              </div>
              {problems.length === 0 ? null : (
                <ul className="flex flex-col gap-1 text-xs">
                  {problems.map((problem) => (
                    <li className="rounded-md bg-destructive/5 px-2 py-1.5" key={problem.key}>
                      <div className="font-medium text-foreground">{problem.label}</div>
                      <div className="break-words text-muted">{problem.message}</div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </Popover>
  )
}
