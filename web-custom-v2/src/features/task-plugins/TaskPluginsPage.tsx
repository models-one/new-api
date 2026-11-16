import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'

import { Tabs } from '@/components/disclosure'
import { Switch } from '@/components/form'
import { toast, toErrorMessage } from '@/components/overlay'
import { Alert, Button, PageHeader, Panel, SegmentedControl } from '@/components/ui'

import {
  marketplaceSourcesQuery,
  setTaskPluginEnabledOption,
  taskPluginKeys,
  taskPluginRuntimeSwitchQuery,
  taskPluginsQuery,
} from './api'
import { NodeSyncIndicator } from '@/features/system-info/NodeSyncIndicator'

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
import {
  fetchMarketplaceIndex,
  marketplaceIndexQueryKey,
  marketplaceSourceKind,
  marketplaceUpdates,
} from './lib/marketplace'

// Index files change rarely; the list page should not refetch them on every visit.
const INDEX_STALE_MS = 10 * 60_000

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

  // Installed plugins are compared with the official lists for newer versions.
  // The community list is read only when something was uploaded, since only an
  // uploaded plugin can be community code or appear on its takedown list.
  const hasInstalled = (allPlugins?.length ?? 0) > 0
  const hasUploaded = (allPlugins ?? []).some((plugin) => plugin.source !== 'factory' && plugin.source_hash)
  const sourcesQuery = useQuery({ ...marketplaceSourcesQuery(), enabled: isRoot && hasInstalled })
  const checkedSources = (sourcesQuery.data ?? []).filter((source) => {
    const sourceKind = marketplaceSourceKind(source.index_url)
    return sourceKind === 'official' || (sourceKind === 'community' && hasUploaded)
  })
  const indexQueries = useQueries({
    queries: checkedSources.map((source) => ({
      queryFn: () => fetchMarketplaceIndex(source.index_url),
      queryKey: marketplaceIndexQueryKey(source.index_url),
      retry: false,
      staleTime: INDEX_STALE_MS,
    })),
  })
  const indexes = indexQueries.flatMap((query) => (query.data ? [query.data] : []))
  const communityPosition = checkedSources.findIndex((source) => marketplaceSourceKind(source.index_url) === 'community')
  const communityIndex = communityPosition < 0 ? undefined : indexQueries[communityPosition]?.data
  const updates = marketplaceUpdates(indexes, allPlugins ?? [])
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
      communityIndex={communityIndex}
      plugins={kindPlugins}
      updates={updates}
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
          <div className="flex flex-wrap items-center gap-2">
            <NodeSyncIndicator
              enabled={isRoot}
              itemNames={Object.fromEntries(plugins.map((plugin) => [plugin.meta.key, plugin.meta.name]))}
              topics={['plugins', 'options']}
            />
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
          </div>
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
