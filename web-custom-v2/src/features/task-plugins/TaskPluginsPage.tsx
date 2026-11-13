import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'

import { Tabs } from '@/components/disclosure'
import { Switch } from '@/components/form'
import { toast, toErrorMessage } from '@/components/overlay'
import { Alert, Button, PageHeader, Panel, SegmentedControl } from '@/components/ui'

import { setTaskPluginEnabledOption, taskPluginKeys, taskPluginRuntimeSwitchQuery, taskPluginsQuery } from './api'
import { useTaskPluginsAccess } from './access'
import { MarketplacePanel } from './components/MarketplacePanel'
import { PluginDetailDrawer } from './components/PluginDetailDrawer'
import { PluginList } from './components/PluginList'
import { UploadDialog } from './components/UploadDialog'
import {
  countPluginKinds,
  defaultPluginKind,
  PLUGIN_KIND_LABELS,
  PLUGIN_KINDS,
  resolvePluginParts,
  type PluginKind,
} from './lib/plugin-kinds'

const NO_UPDATES = new Map<string, string>()

export function TaskPluginsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const access = useTaskPluginsAccess()
  const isRoot = access.state === 'granted'
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadKey, setUploadKey] = useState<string>()
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [chosenKind, setChosenKind] = useState<PluginKind | null>(null)

  const pluginsQuery = useQuery({ ...taskPluginsQuery(), enabled: isRoot })
  const switchQuery = useQuery({ ...taskPluginRuntimeSwitchQuery(), enabled: isRoot })

  const switchMutation = useMutation({
    mutationFn: setTaskPluginEnabledOption,
    onError: (error) => toast.error(toErrorMessage(error, t('Could not update the task plugin runtime.'))),
    onSuccess: (_, enabled) => {
      queryClient.setQueryData(taskPluginKeys.switch, enabled)
      toast.success(enabled ? t('Task plugin runtime enabled.') : t('Task plugin runtime disabled.'))
      void queryClient.invalidateQueries({ queryKey: taskPluginKeys.list })
    },
  })

  const allPlugins = pluginsQuery.data
  const kindCounts = useMemo(() => countPluginKinds((allPlugins ?? []).map(resolvePluginParts)), [allPlugins])
  const kind = chosenKind ?? defaultPluginKind(kindCounts)
  const kindPlugins = useMemo(
    () => (allPlugins ?? []).filter((plugin) => resolvePluginParts(plugin)[kind]),
    [allPlugins, kind],
  )

  const pageTitle = t('Plugins')
  const pageDescription = t('JavaScript plugins that add async tasks, serve channels, or process requests on their way upstream.')

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
          {t('Task plugins run code on the server, so only the root user can manage them.')}
        </Alert>
      </div>
    )
  }

  const plugins = allPlugins ?? []
  const runtimeEnabled = switchQuery.data === true

  let installedContent = (
    <PluginList
      kind={kind}
      onOpen={setDetailKey}
      onUploadVersion={(key) => {
        setUploadKey(key)
        setUploadOpen(true)
      }}
      plugins={kindPlugins}
      updates={NO_UPDATES}
    />
  )
  if (pluginsQuery.isError) {
    installedContent = <Alert tone="destructive">{toErrorMessage(pluginsQuery.error, t('Could not load task plugins.'))}</Alert>
  } else if (pluginsQuery.isPending) {
    installedContent = <p className="text-sm text-muted">{t('Loading…')}</p>
  } else if (plugins.length === 0) {
    installedContent = (
      <Panel className="p-8 text-center text-sm text-muted">
        {t('No plugin installed yet. Upload one or install it from the marketplace.')}
      </Panel>
    )
  } else if (kindPlugins.length === 0) {
    installedContent = <Panel className="p-8 text-center text-sm text-muted">{t('No plugins of this kind')}</Panel>
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={
          <Button
            onClick={() => {
              setUploadKey(undefined)
              setUploadOpen(true)
            }}
            variant="primary"
          >
            <PlusIcon aria-hidden="true" />
            {t('Upload plugin')}
          </Button>
        }
        description={pageDescription}
        title={pageTitle}
      />

      <Panel className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t('Enable plugins')}</p>
          <p className="text-sm text-muted">
            {runtimeEnabled
              ? t('Enabled plugins are registered and serve their channels.')
              : t('Off: plugin tasks and Task Plugin channels reject requests.')}{' '}
            {t('Request processing keeps running either way.')}
          </p>
        </div>
        <Switch
          checked={runtimeEnabled}
          disabled={switchQuery.isPending || switchMutation.isPending}
          hideLabel
          label={t('Enable plugins')}
          onCheckedChange={(enabled) => switchMutation.mutate(enabled)}
        />
      </Panel>

      <Tabs defaultValue="installed">
        <Tabs.List label={pageTitle}>
          <Tabs.Tab value="installed">{t('Installed ({{count}})', { count: plugins.length })}</Tabs.Tab>
          <Tabs.Tab value="marketplace">{t('Marketplace')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel className="flex flex-col gap-4 pt-4" value="installed">
          {plugins.length === 0 ? null : (
            <SegmentedControl
              label={t('Plugin kind')}
              onChange={setChosenKind}
              options={PLUGIN_KINDS.map((id) => ({ count: kindCounts[id], id, label: t(PLUGIN_KIND_LABELS[id]) }))}
              size="sm"
              value={kind}
            />
          )}
          {installedContent}
        </Tabs.Panel>
        <Tabs.Panel className="pt-4" value="marketplace">
          <MarketplacePanel installed={plugins} />
        </Tabs.Panel>
      </Tabs>

      <UploadDialog onOpenChange={setUploadOpen} open={uploadOpen} pluginKey={uploadKey} />
      <PluginDetailDrawer onOpenChange={(open) => (open ? undefined : setDetailKey(null))} pluginKey={detailKey} />
    </div>
  )
}
