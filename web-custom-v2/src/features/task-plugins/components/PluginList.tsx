import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import EllipsisIcon from 'lucide-react/dist/esm/icons/ellipsis'

import { ConfirmDialog, DropdownMenu, toast, toErrorMessage } from '@/components/overlay'
import { Switch } from '@/components/form'
import { Badge, Button, Panel } from '@/components/ui'

import { deleteTaskPluginVersion, setTaskPluginStatus, taskPluginKeys, TaskPluginUsageError } from '../api'
import { findRevokedEntry } from '../lib/marketplace'
import { PLUGIN_KIND_LABELS, resolvePluginParts, type PluginKind } from '../lib/plugin-kinds'
import { localizedText, runtimeStatusBadge, sourceBadge, UsageList } from '../presentation'
import type { MarketplaceIndex, TaskPluginListItem, TaskPluginUsage } from '../types'
import { PluginIcon } from './PluginIcon'
import { PluginWebsiteLink } from './PluginWebsiteLink'
import { RevokedPluginWarning } from './RevokedPluginWarning'
import { toastPluginChange } from '../lib/plugin-change-toast'

type PluginListProps = {
  plugins: TaskPluginListItem[]
  /** Marketplace versions newer than the installed one, keyed by plugin key. */
  updates: Map<string, string>
  /** The community list, whose takedowns are matched against installed code. */
  communityIndex?: MarketplaceIndex
  /** The kind being listed; its own part badge is left out as redundant. */
  kind?: PluginKind
  onOpen: (key: string) => void
  onUploadVersion: (key: string) => void
}

type PendingDisable = { plugin: TaskPluginListItem; usage: TaskPluginUsage }
type PendingDelete = { plugin: TaskPluginListItem; usage?: TaskPluginUsage }

/** Part tags, in the order the kinds are listed, plus sign-in in place of a key. */
const PLUGIN_PART_BADGES = [
  { id: 'task', label: PLUGIN_KIND_LABELS.task },
  { id: 'provider', label: PLUGIN_KIND_LABELS.provider },
  { id: 'login', label: 'Account login' },
  { id: 'transform', label: PLUGIN_KIND_LABELS.transform },
] as const

export function PluginList(props: PluginListProps) {
  const { i18n, t } = useTranslation()
  const queryClient = useQueryClient()
  const [pendingDisable, setPendingDisable] = useState<PendingDisable | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: taskPluginKeys.all })

  const statusMutation = useMutation({
    mutationFn: (request: { plugin: TaskPluginListItem; enabled: boolean; cascade?: boolean; force?: boolean }) =>
      setTaskPluginStatus(request.plugin.meta.key, request.enabled, { cascade: request.cascade, force: request.force }),
    onError: (error, request) => {
      // Disabling a plugin that channels still run is refused with the blockers;
      // the administrator then decides whether to disable those channels too.
      if (error instanceof TaskPluginUsageError && !request.enabled) {
        setPendingDisable({ plugin: request.plugin, usage: error.usage })
        return
      }
      toast.error(toErrorMessage(error, t('Could not update the plugin.')))
    },
    onSuccess: (notice, request) => {
      setPendingDisable(null)
      toastPluginChange(request.enabled ? t('Plugin enabled.') : t('Plugin disabled.'), notice?.pricing_issues)
      void refresh()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (request: { plugin: TaskPluginListItem; force: boolean }) =>
      deleteTaskPluginVersion(request.plugin.meta.key, request.plugin.meta.version, request.force),
    onError: (error, request) => {
      if (error instanceof TaskPluginUsageError && !request.force) {
        setPendingDelete({ plugin: request.plugin, usage: error.usage })
        return
      }
      toast.error(toErrorMessage(error, t('Could not delete the plugin.')))
    },
    onSuccess: (notice) => {
      setPendingDelete(null)
      toastPluginChange(t('Plugin version deleted.'), notice?.pricing_issues)
      void refresh()
    },
  })

  let deleteDescription: string | undefined
  if (pendingDelete !== null) {
    const names = { name: pendingDelete.plugin.meta.name, version: pendingDelete.plugin.meta.version }
    deleteDescription =
      pendingDelete.plugin.source === 'override_over_factory'
        ? t('Delete version {{version}} of {{name}} and fall back to the factory version.', names)
        : t('Delete version {{version}} of {{name}}. This cannot be undone.', names)
  }

  return (
    <>
      <ul className="grid gap-3 lg:grid-cols-2">
        {props.plugins.map((plugin) => {
          const meta = plugin.meta
          const runtime = runtimeStatusBadge(t, plugin.runtime_status, plugin)
          const source = sourceBadge(t, plugin)
          const update = props.updates.get(meta.key)
          const parts = resolvePluginParts(plugin)
          const description = localizedText(meta.description, i18n.language)
          const busy =
            (statusMutation.isPending && statusMutation.variables?.plugin.meta.key === meta.key) ||
            (deleteMutation.isPending && deleteMutation.variables?.plugin.meta.key === meta.key)

          return (
            <li key={meta.key}>
              <Panel className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <PluginIcon hasIcon={plugin.has_icon} icon={meta.icon} name={meta.name} pluginKey={meta.key} />
                  <div className="min-w-0 flex-1">
                    <button
                      className="truncate text-left text-sm font-semibold text-foreground hover:underline"
                      onClick={() => props.onOpen(meta.key)}
                      type="button"
                    >
                      {meta.name}
                    </button>
                    <p className="truncate font-mono text-xs text-muted">
                      {meta.key} · v{meta.version}
                    </p>
                    <PluginWebsiteLink website={meta.website} />
                  </div>
                  <Switch
                    checked={plugin.enabled}
                    disabled={busy}
                    hideLabel
                    label={t('Enable {{name}}', { name: meta.name })}
                    onCheckedChange={(enabled) => statusMutation.mutate({ enabled, plugin })}
                    size="sm"
                  />
                  <DropdownMenu
                    items={[
                      { id: 'details', label: t('Details'), onSelect: () => props.onOpen(meta.key) },
                      { id: 'upload', label: t('Upload new version'), onSelect: () => props.onUploadVersion(meta.key) },
                      ...(plugin.source === 'factory'
                        ? []
                        : [
                            {
                              destructive: true,
                              id: 'delete',
                              label: plugin.source === 'override_over_factory' ? t('Revert to factory version') : t('Delete'),
                              onSelect: () => setPendingDelete({ plugin }),
                              separatorBefore: true,
                            },
                          ]),
                    ]}
                    trigger={
                      <Button aria-label={t('More actions for {{name}}', { name: meta.name })} size="icon-sm" variant="quiet">
                        <EllipsisIcon aria-hidden="true" />
                      </Button>
                    }
                  />
                </div>

                {description === '' ? null : <p className="line-clamp-2 text-sm text-muted">{description}</p>}

                <RevokedPluginWarning entry={findRevokedEntry(props.communityIndex, plugin.source_hash)} />

                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  <Badge title={runtime.hint} tone={runtime.tone}>
                    {runtime.label}
                  </Badge>
                  <Badge tone={source.tone}>{source.label}</Badge>
                  {PLUGIN_PART_BADGES.filter((part) => part.id !== props.kind && parts[part.id]).map((part) => (
                    <Badge key={part.id} tone="info">
                      {t(part.label)}
                    </Badge>
                  ))}
                  {update === undefined ? null : <Badge tone="warning">{t('Update available: v{{version}}', { version: update })}</Badge>}
                  {meta.models?.length ? <Badge tone="muted">{t('{{count}} models', { count: meta.models.length })}</Badge> : null}
                  {plugin.channel_count > 0 ? <Badge tone="muted">{t('{{count}} channels', { count: plugin.channel_count })}</Badge> : null}
                </div>

                {plugin.runtime_status === 'compile_failed' && plugin.runtime_error ? (
                  <p className="line-clamp-3 rounded-md bg-destructive/10 px-2 py-1.5 font-mono text-xs text-destructive">{plugin.runtime_error}</p>
                ) : null}
              </Panel>
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Disable plugin and channels')}
        description={
          pendingDisable === null
            ? undefined
            : t('{{name}} still serves these channels. Disabling it also disables them.', { name: pendingDisable.plugin.meta.name })
        }
        destructive
        isLoading={statusMutation.isPending}
        onConfirm={() => {
          if (pendingDisable === null) return
          statusMutation.mutate({
            cascade: true,
            enabled: false,
            force: pendingDisable.usage.in_flight_count > 0,
            plugin: pendingDisable.plugin,
          })
        }}
        onOpenChange={(open) => (open ? undefined : setPendingDisable(null))}
        open={pendingDisable !== null}
        title={t('Disable a plugin in use?')}
      >
        {pendingDisable === null ? null : (
          <div className="flex flex-col gap-2">
            <UsageList channels={pendingDisable.usage.channels} />
            {pendingDisable.usage.in_flight_count > 0 ? (
              <p className="text-sm text-warning">
                {t('{{count}} tasks are still running; their results may not be collected.', {
                  count: pendingDisable.usage.in_flight_count,
                })}
              </p>
            ) : null}
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={pendingDelete?.usage ? t('Delete anyway') : t('Delete')}
        description={deleteDescription}
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete === null) return
          deleteMutation.mutate({ force: pendingDelete.usage !== undefined, plugin: pendingDelete.plugin })
        }}
        onOpenChange={(open) => (open ? undefined : setPendingDelete(null))}
        open={pendingDelete !== null}
        title={t('Delete plugin version?')}
      >
        {pendingDelete?.usage ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-warning">{t('These channels are bound to it and will stop working:')}</p>
            <UsageList channels={pendingDelete.usage.channels} />
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  )
}
