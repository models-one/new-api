import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down'
import ArrowUpIcon from 'lucide-react/dist/esm/icons/arrow-up'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PlayIcon from 'lucide-react/dist/esm/icons/play'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'

import { Switch } from '@/components/form'
import { ConfirmDialog, toast, toErrorMessage } from '@/components/overlay'
import { Alert, Badge, Button, PageHeader, Panel } from '@/components/ui'
import { channelGroupNamesQuery, enabledModelNamesQuery } from '@/features/channels/api'
import { NodeSyncIndicator } from '@/features/system-info/NodeSyncIndicator'
import { useTaskPluginsAccess } from '@/features/task-plugins/access'
import { PluginIcon } from '@/features/task-plugins/components/PluginIcon'
import type { RequestPluginInstance } from '@/features/task-plugins/types'

import {
  requestPluginInstancesQuery,
  requestPluginOptionsQuery,
  requestProcessingKeys,
  saveRequestPluginInstances,
} from './api'
import { DryRunDialog } from './components/DryRunDialog'
import { InstanceEditor } from './components/InstanceEditor'

/**
 * The request processing page: the instances in the order they run. Every change saves
 * the whole list at once, because the server keeps it as one ordered setting.
 */
export function RequestProcessingPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const access = useTaskPluginsAccess()
  const isRoot = access.state === 'granted'
  const [editing, setEditing] = useState<RequestPluginInstance | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RequestPluginInstance | null>(null)
  const [dryRunOpen, setDryRunOpen] = useState(false)

  const instancesQuery = useQuery({ ...requestPluginInstancesQuery(), enabled: isRoot })
  const pluginsQuery = useQuery({ ...requestPluginOptionsQuery(), enabled: isRoot })
  const groupsQuery = useQuery({ ...channelGroupNamesQuery(), enabled: isRoot })
  const modelsQuery = useQuery({ ...enabledModelNamesQuery(), enabled: isRoot })

  const onSaved = (instances: RequestPluginInstance[]) => queryClient.setQueryData(requestProcessingKeys.instances, instances)
  const listMutation = useMutation({
    mutationFn: saveRequestPluginInstances,
    onError: (error) => toast.error(toErrorMessage(error, t('Could not save request processing.'))),
    onSuccess: (instances) => {
      onSaved(instances)
      setDeleteTarget(null)
    },
  })
  // The editor shows its own save error next to the fields that caused it.
  const editorMutation = useMutation({
    mutationFn: saveRequestPluginInstances,
    onSuccess: (instances) => {
      onSaved(instances)
      setEditing(null)
      toast.success(t('Request processing saved.'))
    },
  })

  const pageTitle = t('Request processing')
  const pageDescription = t('Plugins that check or change requests and replies on their way through the gateway.')

  if (access.state === 'checking') {
    return (
      <div aria-busy="true" className="flex flex-col gap-8" role="status">
        <span className="sr-only">{t('Checking your permissions')}</span>
        <PageHeader description={pageDescription} title={pageTitle} />
      </div>
    )
  }
  if (access.state === 'unavailable') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={pageDescription} title={pageTitle} />
        <Alert
          action={
            <Button aria-busy={access.isRefetching} disabled={access.isRefetching} onClick={access.retry} variant="outline">
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Could not confirm your permissions')}
          tone="destructive"
        >
          {toErrorMessage(access.error)}
        </Alert>
      </div>
    )
  }
  if (access.state === 'denied') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={pageDescription} title={pageTitle} />
        <Alert icon={<ShieldAlertIcon aria-hidden="true" />} title={t('Root access required')} tone="warning">
          {t('Request processing runs plugin code on every request, so only the root user can manage it.')}
        </Alert>
      </div>
    )
  }

  const instances = instancesQuery.data ?? []
  const plugins = pluginsQuery.data ?? []
  const instanceCounts: Record<string, number> = {}
  for (const instance of instances) instanceCounts[instance.plugin] = (instanceCounts[instance.plugin] ?? 0) + 1
  const busy = listMutation.isPending || editorMutation.isPending

  function move(index: number, offset: -1 | 1) {
    const next = [...instances]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    listMutation.mutate(next)
  }

  function openEditor(instance: RequestPluginInstance | 'new') {
    editorMutation.reset()
    setEditing(instance)
  }

  let content
  if (instancesQuery.isPending) {
    content = <p className="text-sm text-muted">{t('Loading…')}</p>
  } else if (instancesQuery.isError) {
    content = (
      <Alert
        action={
          <Button onClick={() => void instancesQuery.refetch()} variant="outline">
            {t('Try again')}
          </Button>
        }
        tone="destructive"
      >
        {toErrorMessage(instancesQuery.error, t('Could not load request processing.'))}
      </Alert>
    )
  } else if (instances.length === 0) {
    content = (
      <Panel className="flex flex-col gap-1 p-8 text-center">
        <p className="text-sm font-semibold text-foreground">{t('No request processing yet')}</p>
        <p className="text-sm text-muted">{t('Add an instance to check or change requests before they reach the model.')}</p>
      </Panel>
    )
  } else {
    content = (
      <ol aria-label={pageTitle} className="flex flex-col gap-2">
        {instances.map((instance, index) => {
          const plugin = plugins.find((item) => item.key === instance.plugin)
          let scope = t('Channels only')
          if (instance.global) scope = t('All requests')
          else if (instance.groups.length > 0) scope = instance.groups.join(', ')
          // Servers before the model filter send no list.
          const models = instance.models ?? []
          return (
            <li key={instance.id || index}>
              <Panel className="flex flex-wrap items-center gap-3 p-3">
                <div className="flex items-center gap-1">
                  <span className="w-5 text-xs text-muted tabular-nums">{index + 1}</span>
                  <Button
                    aria-label={t('Move {{name}} up', { name: instance.name })}
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    size="icon-sm"
                    variant="quiet"
                  >
                    <ArrowUpIcon aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label={t('Move {{name}} down', { name: instance.name })}
                    disabled={busy || index === instances.length - 1}
                    onClick={() => move(index, 1)}
                    size="icon-sm"
                    variant="quiet"
                  >
                    <ArrowDownIcon aria-hidden="true" />
                  </Button>
                </div>
                <PluginIcon hasIcon={plugin?.hasIcon} icon={plugin?.icon} name={plugin?.name ?? instance.plugin} pluginKey={instance.plugin} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold break-words text-foreground">
                    {instance.name}
                    {!plugin && pluginsQuery.isSuccess ? <Badge tone="muted">{t('Plugin disabled')}</Badge> : null}
                  </p>
                  <p className="text-xs break-words text-muted">
                    {plugin?.name ?? instance.plugin} · {scope}
                    {models.length > 0 ? ` · ${t('Models: {{models}}', { models: models.join(', ') })}` : ''}
                  </p>
                </div>
                <Switch
                  checked={instance.enabled}
                  disabled={busy}
                  hideLabel
                  label={t('Enable {{name}}', { name: instance.name })}
                  onCheckedChange={(checked) =>
                    listMutation.mutate(instances.map((item, position) => (position === index ? { ...item, enabled: checked } : item)))
                  }
                  size="sm"
                />
                <Button aria-label={t('Edit {{name}}', { name: instance.name })} disabled={busy} onClick={() => openEditor(instance)} size="icon-sm" variant="quiet">
                  <PencilIcon aria-hidden="true" />
                </Button>
                <Button
                  aria-label={t('Delete {{name}}', { name: instance.name })}
                  disabled={busy}
                  onClick={() => setDeleteTarget(instance)}
                  size="icon-sm"
                  variant="quiet"
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </Panel>
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={
          <div className="flex flex-wrap items-center gap-2">
            <NodeSyncIndicator enabled={isRoot} topics={['options']} />
            <Button disabled={!instancesQuery.isSuccess} onClick={() => setDryRunOpen(true)} variant="outline">
              <PlayIcon aria-hidden="true" />
              {t('Dry run')}
            </Button>
            <Button disabled={!instancesQuery.isSuccess || busy} onClick={() => openEditor('new')} variant="primary">
              <PlusIcon aria-hidden="true" />
              {t('Add')}
            </Button>
          </div>
        }
        description={pageDescription}
        title={pageTitle}
      />

      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {t(
            "Instances run from top to bottom. Those for all requests run first, then those for the request's group, then those a channel adds.",
          )}
        </p>
        {content}
      </div>

      <InstanceEditor
        error={editorMutation.isError ? toErrorMessage(editorMutation.error) : undefined}
        groups={groupsQuery.data ?? []}
        instance={editing === 'new' ? null : editing}
        instanceCounts={instanceCounts}
        models={modelsQuery.data ?? []}
        onOpenChange={(open) => (open ? undefined : setEditing(null))}
        onSave={(instance) => {
          const index = editing === 'new' || editing === null ? -1 : instances.findIndex((item) => item.id === editing.id)
          editorMutation.mutate(index < 0 ? [...instances, instance] : instances.map((item, position) => (position === index ? instance : item)))
        }}
        open={editing !== null}
        plugins={plugins}
        saving={editorMutation.isPending}
      />
      <DryRunDialog groups={groupsQuery.data ?? []} instances={instances} onOpenChange={setDryRunOpen} open={dryRunOpen} plugins={plugins} />
      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Delete')}
        description={t('{{name}} stops processing requests, including on channels that added it.', { name: deleteTarget?.name ?? '' })}
        destructive
        isLoading={listMutation.isPending}
        onConfirm={() => {
          if (!deleteTarget) return
          listMutation.mutate(instances.filter((instance) => instance.id !== deleteTarget.id))
        }}
        onOpenChange={(open) => (open || listMutation.isPending ? undefined : setDeleteTarget(null))}
        open={deleteTarget !== null}
        title={t('Delete instance?')}
      />
    </div>
  )
}
