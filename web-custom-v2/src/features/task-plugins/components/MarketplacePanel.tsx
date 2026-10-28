import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import SettingsIcon from 'lucide-react/dist/esm/icons/settings'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import ShieldCheckIcon from 'lucide-react/dist/esm/icons/shield-check'

import { Input, NativeSelect } from '@/components/form'
import { Dialog, toast, toErrorMessage } from '@/components/overlay'
import { Alert, Badge, Button, Panel } from '@/components/ui'

import {
  activateTaskPlugin,
  installMarketplacePlugin,
  marketplaceSourcesQuery,
  taskPluginKeys,
  updateMarketplaceSources,
} from '../api'
import {
  DEFAULT_MARKETPLACE_INDEX_URL,
  deriveInstallState,
  findMarketplaceVersion,
  indexHasIntegrityHashes,
  isDefaultMarketplaceSource,
  parseMarketplaceIndex,
  resolvePluginSourceUrl,
  type InstallState,
} from '../lib/marketplace'
import { fetchPluginIconDataUri } from '../lib/plugin-icon-file'
import { computeSourceSha256, fetchPluginSourceText, PluginSourceFetchError } from '../lib/plugin-url'
import { localizedText } from '../presentation'
import type { MarketplaceIndex, MarketplacePlugin, MarketplaceSource, TaskPluginListItem } from '../types'
import { PluginCapabilities } from './PluginFacts'
import { PluginIcon } from './PluginIcon'

type InstallTarget = { plugin: MarketplacePlugin; source: MarketplaceSource; installState: InstallState }

export function MarketplacePanel(props: { installed: TaskPluginListItem[] }) {
  const { i18n, t } = useTranslation()
  const sourcesQuery = useQuery(marketplaceSourcesQuery())
  const sources = sourcesQuery.data ?? []
  const [sourceUrl, setSourceUrl] = useState<string>()
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [target, setTarget] = useState<InstallTarget | null>(null)
  const selectedSource = sources.find((source) => source.index_url === sourceUrl) ?? sources[0]

  const indexQuery = useQuery({
    enabled: selectedSource !== undefined,
    queryFn: async (): Promise<MarketplaceIndex> => {
      if (!selectedSource) throw new Error('marketplace source is not selected')
      // Revalidate so the hashes checked at install time are the host's current
      // ones rather than a copy cached before a republish.
      const response = await fetch(selectedSource.index_url, { cache: 'no-cache' })
      if (!response.ok) throw new Error(t('The marketplace index returned HTTP {{status}}.', { status: response.status }))
      return parseMarketplaceIndex(await response.json())
    },
    queryKey: ['task-plugins', 'marketplace-index', selectedSource?.index_url] as const,
    retry: false,
  })

  const index = indexQuery.data
  const verified = index ? indexHasIntegrityHashes(index) : false

  let indexContent = <p className="text-sm text-muted">{t('Loading…')}</p>
  if (sourcesQuery.isError) {
    indexContent = <Alert tone="destructive">{toErrorMessage(sourcesQuery.error, t('Could not load marketplace sources.'))}</Alert>
  } else if (indexQuery.isError) {
    indexContent = (
      <Alert tone="destructive">
        {t('Could not load this marketplace from the browser. The host may block cross-origin requests or be unreachable.')}{' '}
        {indexQuery.error.message}
      </Alert>
    )
  } else if (index === undefined) {
    if (sources.length === 0 && !sourcesQuery.isPending) {
      indexContent = <p className="text-sm text-muted">{t('No marketplace source configured.')}</p>
    }
  } else if (index.plugins.length === 0) {
    indexContent = <p className="text-sm text-muted">{t('This marketplace has no plugins.')}</p>
  } else {
    indexContent = (
    <ul className="grid gap-3 lg:grid-cols-2">
      {index.plugins.map((plugin) => {
        const installState = deriveInstallState(plugin, props.installed)
        const description = localizedText(plugin.description, i18n.language)
        return (
          <li key={plugin.key}>
            <Panel className="flex h-full flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <PluginIcon icon={plugin.icon} name={plugin.name} pluginKey={plugin.key} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{plugin.name}</p>
                  <p className="truncate font-mono text-xs text-muted">
                    {plugin.key} · v{plugin.latest}
                  </p>
                </div>
                <InstallButton onClick={() => selectedSource && setTarget({ installState, plugin, source: selectedSource })} state={installState} />
              </div>
              {description === '' ? null : <p className="line-clamp-2 text-sm text-muted">{description}</p>}
              <div className="mt-auto flex flex-wrap gap-1.5">
                <InstallStateBadge state={installState} />
                {plugin.models?.length ? <Badge tone="muted">{t('{{count}} models', { count: plugin.models.length })}</Badge> : null}
              </div>
            </Panel>
          </li>
        )
      })}
    </ul>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <NativeSelect
          className="min-w-64 flex-1"
          label={t('Marketplace source')}
          onChange={(event) => setSourceUrl(event.target.value)}
          options={sources.map((source) => ({ label: source.name, value: source.index_url }))}
          value={selectedSource?.index_url ?? ''}
        />
        <Button disabled={indexQuery.isFetching || selectedSource === undefined} onClick={() => void indexQuery.refetch()} variant="outline">
          <RefreshCwIcon aria-hidden="true" />
          {t('Refresh')}
        </Button>
        <Button onClick={() => setSourcesOpen(true)} variant="outline">
          <SettingsIcon aria-hidden="true" />
          {t('Manage sources')}
        </Button>
      </div>

      {selectedSource && !isDefaultMarketplaceSource(selectedSource.index_url) ? (
        <Alert icon={<ShieldAlertIcon aria-hidden="true" />} tone="warning">
          {t('This is a third-party source. Its plugins run code on this server; install only from sources you trust.')}
        </Alert>
      ) : null}

      {index && !verified ? (
        <Alert icon={<ShieldAlertIcon aria-hidden="true" />} tone="warning">
          {t('This index does not publish SHA-256 hashes, so downloaded sources cannot be verified.')}
        </Alert>
      ) : null}

      {indexContent}

      <MarketplaceInstallDialog onOpenChange={(open) => (open ? undefined : setTarget(null))} target={target} />
      <MarketplaceSourcesDialog onOpenChange={setSourcesOpen} open={sourcesOpen} sources={sources} />
    </div>
  )
}

function InstallStateBadge(props: { state: InstallState }) {
  const { t } = useTranslation()
  switch (props.state.status) {
    case 'up_to_date':
      return <Badge tone="success">{t('Installed v{{version}}', { version: props.state.installedVersion })}</Badge>
    case 'upgradable':
      return <Badge tone="warning">{t('Installed v{{version}}', { version: props.state.installedVersion })}</Badge>
    case 'diverged':
      return <Badge tone="info">{t('Custom v{{version}} installed', { version: props.state.installedVersion })}</Badge>
    default:
      return null
  }
}

function InstallButton(props: { state: InstallState; onClick: () => void }) {
  const { t } = useTranslation()
  if (props.state.status === 'up_to_date') {
    return (
      <Button onClick={props.onClick} size="sm" variant="quiet">
        {t('Details')}
      </Button>
    )
  }
  return (
    <Button onClick={props.onClick} size="sm" variant={props.state.status === 'not_installed' ? 'primary' : 'outline'}>
      {props.state.status === 'not_installed' ? t('Install') : t('Upgrade')}
    </Button>
  )
}

function MarketplaceInstallDialog(props: { target: InstallTarget | null; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const target = props.target
  const [version, setVersion] = useState<string>()
  const selectedVersion = version ?? target?.plugin.latest ?? ''
  const entry = target ? findMarketplaceVersion(target.plugin, selectedVersion) : undefined

  const sourceQuery = useQuery({
    enabled: target !== null && entry !== undefined,
    queryFn: async () => {
      if (!target || !entry) throw new Error('missing marketplace entry')
      const url = resolvePluginSourceUrl(target.source.index_url, entry.path)
      if (!url) throw new Error(t('This plugin path does not resolve within the source repository.'))
      const text = await fetchPluginSourceText(url)
      // Shown to the administrator only. The upload carries the index hash and the
      // server re-hashes what it received, so a tampered browser cannot pass a
      // mismatched source off as verified.
      const digest = await computeSourceSha256(text)
      // The logo is cosmetic: a missing or malformed icon never blocks install.
      const iconUrl = target.plugin.iconFile ? resolvePluginSourceUrl(target.source.index_url, target.plugin.iconFile.path) : null
      const icon = iconUrl ? await fetchPluginIconDataUri(iconUrl, { sha256: target.plugin.iconFile?.sha256 }) : null
      return { digest, icon, text }
    },
    queryKey: ['task-plugins', 'marketplace-source', target?.source.index_url, target?.plugin.key, selectedVersion, entry?.sha256] as const,
    retry: false,
  })

  const digestMismatch = Boolean(
    entry?.sha256 && sourceQuery.data?.digest && sourceQuery.data.digest.toLowerCase() !== entry.sha256.toLowerCase()
  )

  const installMutation = useMutation({
    mutationFn: async () => {
      if (!target || !entry || !sourceQuery.data || digestMismatch) throw new Error('source not fetched')
      const detail = await installMarketplacePlugin({
        icon: sourceQuery.data.icon ?? undefined,
        remark: `${target.source.name} v${selectedVersion}`,
        source: sourceQuery.data.text,
        sourceSha256: entry.sha256,
      })
      if (detail.plugin && !detail.plugin.active) await activateTaskPlugin(detail.meta.key, detail.meta.version)
      return detail
    },
    onError: (error) => toast.error(toErrorMessage(error, t('Could not install the plugin.'))),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: taskPluginKeys.all }),
    onSuccess: (detail) => {
      toast.success(t('Installed {{name}} v{{version}}', { name: detail.meta.name, version: detail.meta.version }))
      close(false)
    },
  })

  function close(open: boolean) {
    if (!open && installMutation.isPending) return
    if (!open) {
      setVersion(undefined)
      installMutation.reset()
    }
    props.onOpenChange(open)
  }

  const fetchError = sourceQuery.error
  let fetchErrorMessage = fetchError?.message ?? ''
  if (fetchError instanceof PluginSourceFetchError) {
    fetchErrorMessage =
      fetchError.reason === 'too_large'
        ? t('Plugin source exceeds the 8 MiB limit.')
        : t('Could not fetch the plugin source from this browser. The host may block cross-origin requests or be unreachable.')
  }

  const upgrading = target !== null && target.installState.status !== 'not_installed'
  let installLabel = upgrading ? t('Upgrade to v{{version}}', { version: selectedVersion }) : t('Install and enable')
  if (installMutation.isPending) installLabel = t('Installing…')

  let integrityAlert = null
  if (digestMismatch) {
    integrityAlert = (
      <Alert icon={<ShieldAlertIcon aria-hidden="true" />} title={t('SHA-256 mismatch')} tone="destructive">
        {t('The downloaded source does not match the hash published in the index. Installation is blocked.')}
      </Alert>
    )
  } else if (sourceQuery.data && entry?.sha256) {
    integrityAlert = (
      <Alert icon={<ShieldCheckIcon aria-hidden="true" />} tone="success">
        {t('Source verified against the index SHA-256.')}
      </Alert>
    )
  }

  return (
    <Dialog
      footer={
        <>
          <Button disabled={installMutation.isPending} onClick={() => close(false)} variant="outline">
            {t('Cancel')}
          </Button>
          <Button
            disabled={!sourceQuery.data || sourceQuery.isFetching || digestMismatch || installMutation.isPending}
            onClick={() => installMutation.mutate()}
            variant="primary"
          >
            {installLabel}
          </Button>
        </>
      }
      onOpenChange={close}
      open={target !== null}
      scrollBody
      size="lg"
      title={target ? t('Install {{name}}', { name: target.plugin.name }) : ''}
    >
      {target === null ? null : (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <PluginIcon icon={target.plugin.icon} imageSrc={sourceQuery.data?.icon ?? undefined} name={target.plugin.name} pluginKey={target.plugin.key} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm text-muted">{target.plugin.key}</p>
              <p className="text-xs text-muted">{t('From {{source}}', { source: target.source.name })}</p>
            </div>
            <NativeSelect
              hideLabel
              label={t('Version')}
              onChange={(event) => setVersion(event.target.value)}
              options={target.plugin.versions.map((item) => ({ label: `v${item.version}`, value: item.version }))}
              value={selectedVersion}
            />
          </div>

          {target.installState.status === 'diverged' ? (
            <Alert tone="warning">
              {t('The installed v{{version}} is not in this marketplace; installing replaces it.', {
                version: target.installState.installedVersion,
              })}
            </Alert>
          ) : null}

          {integrityAlert}

          {fetchErrorMessage === '' ? null : <Alert tone="destructive">{fetchErrorMessage}</Alert>}

          {sourceQuery.isPending && entry !== undefined ? <p className="text-sm text-muted">{t('Fetching plugin source…')}</p> : null}

          <PluginCapabilities plugin={target.plugin} source={sourceQuery.data?.text} version={entry} />
        </div>
      )}
    </Dialog>
  )
}

function MarketplaceSourcesDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; sources: MarketplaceSource[] }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<MarketplaceSource[] | null>(null)
  const rows = draft ?? props.sources
  const invalid = useMemo(
    () =>
      rows.some((row) => {
        if (row.name.trim() === '') return true
        try {
          return !['http:', 'https:'].includes(new URL(row.index_url).protocol)
        } catch {
          return true
        }
      }),
    [rows]
  )

  const saveMutation = useMutation({
    mutationFn: () => updateMarketplaceSources(rows.map((row) => ({ index_url: row.index_url.trim(), name: row.name.trim() }))),
    onError: (error) => toast.error(toErrorMessage(error, t('Could not save marketplace sources.'))),
    onSuccess: (saved) => {
      queryClient.setQueryData(taskPluginKeys.sources, saved)
      toast.success(t('Marketplace sources saved.'))
      close(false)
    },
  })

  function close(open: boolean) {
    if (!open) setDraft(null)
    props.onOpenChange(open)
  }

  function updateRow(index: number, patch: Partial<MarketplaceSource>) {
    setDraft(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)))
  }

  return (
    <Dialog
      description={t('Each source is a marketplace index JSON URL. Plugins from any source run code on this server.')}
      footer={
        <>
          <Button onClick={() => close(false)} variant="outline">
            {t('Cancel')}
          </Button>
          <Button disabled={invalid || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {t('Save')}
          </Button>
        </>
      }
      onOpenChange={close}
      open={props.open}
      size="lg"
      title={t('Marketplace sources')}
    >
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end" key={index}>
            <Input label={t('Name')} onChange={(event) => updateRow(index, { name: event.target.value })} value={row.name} />
            <Input label={t('Index URL')} onChange={(event) => updateRow(index, { index_url: event.target.value })} type="url" value={row.index_url} />
            <Button onClick={() => setDraft(rows.filter((_, position) => position !== index))} variant="quiet">
              {t('Remove')}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDraft([...rows, { index_url: '', name: '' }])} size="sm" variant="outline">
            {t('Add source')}
          </Button>
          {rows.some((row) => row.index_url === DEFAULT_MARKETPLACE_INDEX_URL) ? null : (
            <Button
              onClick={() => setDraft([...rows, { index_url: DEFAULT_MARKETPLACE_INDEX_URL, name: t('Official marketplace') }])}
              size="sm"
              variant="quiet"
            >
              {t('Add official marketplace')}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
