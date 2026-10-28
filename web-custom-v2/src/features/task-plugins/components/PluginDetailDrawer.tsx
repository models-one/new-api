import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import PlayIcon from 'lucide-react/dist/esm/icons/play'

import { Tabs } from '@/components/disclosure'
import { NativeSelect, Textarea } from '@/components/form'
import { ConfirmDialog, Drawer, toast, toErrorMessage } from '@/components/overlay'
import { Alert, Badge, Button, CopyButton } from '@/components/ui'
import { channelTypeName } from '@/features/channels/channel-presentation'

import {
  activateTaskPlugin,
  deleteTaskPluginVersion,
  dryRunTaskPlugin,
  taskPluginDetailQuery,
  taskPluginKeys,
  TaskPluginUsageError,
  taskPluginVersionsQuery,
} from '../api'
import { localizedText, UsageList } from '../presentation'
import type { BillingUsageSchema, TaskPluginDetail, TaskPluginRecord, TaskPluginUsage } from '../types'
import { PluginEndpoints, PluginModelList } from './PluginFacts'
import { PluginIcon } from './PluginIcon'

type PluginDetailDrawerProps = {
  pluginKey: string | null
  onOpenChange: (open: boolean) => void
}

export function PluginDetailDrawer(props: PluginDetailDrawerProps) {
  const { t } = useTranslation()
  const [selectedVersion, setSelectedVersion] = useState<string>()
  const key = props.pluginKey ?? ''
  const open = props.pluginKey !== null

  const versionsQuery = useQuery({ ...taskPluginVersionsQuery(key), enabled: open })
  const activeVersion = versionsQuery.data?.find((record) => record.active)?.version
  const version = selectedVersion ?? activeVersion
  const detailQuery = useQuery({ ...taskPluginDetailQuery(key, version), enabled: open && version !== undefined })
  const activeDetailQuery = useQuery({
    ...taskPluginDetailQuery(key, activeVersion),
    enabled: open && activeVersion !== undefined && version !== activeVersion,
  })

  const detail = detailQuery.data
  const name = detail?.meta.name ?? key
  const loadError = versionsQuery.error ?? detailQuery.error

  let body = <p className="text-sm text-muted">{t('Loading…')}</p>
  if (loadError !== null) {
    body = <Alert tone="destructive">{toErrorMessage(loadError, t('Could not load the plugin.'))}</Alert>
  } else if (detail !== undefined) {
    body = (
      <div className="flex flex-col gap-5">
        <PluginHeader detail={detail} />
        <Tabs defaultValue="overview">
          <Tabs.List label={t('Plugin details')}>
            <Tabs.Tab value="overview">{t('Overview')}</Tabs.Tab>
            <Tabs.Tab value="versions">{t('Versions')}</Tabs.Tab>
            <Tabs.Tab value="source">{t('Source')}</Tabs.Tab>
            <Tabs.Tab value="dryrun">{t('Dry run')}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel className="pt-4" value="overview">
            <PluginOverview detail={detail} />
          </Tabs.Panel>
          <Tabs.Panel className="pt-4" value="versions">
            <VersionList onView={setSelectedVersion} pluginKey={key} selectedVersion={version} versions={versionsQuery.data ?? []} />
          </Tabs.Panel>
          <Tabs.Panel className="pt-4" value="source">
            <SourceView activeSource={activeDetailQuery.data?.plugin?.source} detail={detail} />
          </Tabs.Panel>
          <Tabs.Panel className="pt-4" value="dryrun">
            <PluginSandbox pluginKey={key} />
          </Tabs.Panel>
        </Tabs>
      </div>
    )
  }

  return (
    <Drawer
      onOpenChange={(next) => {
        if (!next) setSelectedVersion(undefined)
        props.onOpenChange(next)
      }}
      open={open}
      size="xl"
      title={name || t('Plugin details')}
    >
      {body}
    </Drawer>
  )
}

function PluginHeader(props: { detail: TaskPluginDetail }) {
  const { i18n, t } = useTranslation()
  const meta = props.detail.meta
  const description = localizedText(meta.description, i18n.language)
  return (
    <div className="flex items-start gap-3">
      <PluginIcon hasIcon={props.detail.has_icon} icon={meta.icon} name={meta.name} pluginKey={meta.key} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted">{meta.key}</span>
          <Badge tone="muted">v{meta.version}</Badge>
          {props.detail.plugin?.active ? <Badge tone="success">{t('Active')}</Badge> : <Badge tone="warning">{t('Inactive version')}</Badge>}
          {meta.website ? (
            <a className="text-xs text-primary hover:underline" href={meta.website} rel="noopener noreferrer" target="_blank">
              {t('Website')}
            </a>
          ) : null}
        </div>
        {description === '' ? null : <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
    </div>
  )
}

function Fact(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{props.label}</dt>
      <dd className="mt-0.5 text-sm break-all text-foreground">{props.children}</dd>
    </div>
  )
}

function PluginOverview(props: { detail: TaskPluginDetail }) {
  const { t } = useTranslation()
  const meta = props.detail.meta
  const record = props.detail.plugin
  const channelTypes = meta.channelTypes?.length
    ? meta.channelTypes.map((type) => `${t(channelTypeName(type))} (#${type})`).join(', ')
    : t('Task Plugin')

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-x-6 gap-y-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <Fact label={t('Applicable channels')}>{channelTypes}</Fact>
        <Fact label={t('Default API address')}>{meta.baseUrl || t('Not declared by this plugin')}</Fact>
        <Fact label={t('Author')}>
          {meta.author.url ? (
            <a className="text-primary hover:underline" href={meta.author.url} rel="noopener noreferrer" target="_blank">
              {meta.author.name}
            </a>
          ) : (
            meta.author.name
          )}
        </Fact>
        <Fact label={t('Plugin API version')}>{meta.apiVersion}</Fact>
        {record?.remark ? <Fact label={t('Remark')}>{record.remark}</Fact> : null}
        {record?.source_hash ? (
          <Fact label="SHA-256">
            <span className="font-mono text-xs">{record.source_hash}</span>
          </Fact>
        ) : null}
      </dl>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('Supported models')}</h3>
        {meta.models?.length ? <PluginModelList models={meta.models} /> : <p className="text-sm text-muted">{t('Not declared by this plugin')}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('Supported interfaces')}</h3>
        <PluginEndpoints protocols={meta.protocols} routes={meta.routes} />
      </section>

      {meta.usageSchema && Object.keys(meta.usageSchema).length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t('Billing usage fields')}</h3>
          <UsageSchemaTable schema={meta.usageSchema} />
        </section>
      ) : null}
    </div>
  )
}

/** The usage facts a plugin reports, which pricing expressions bill against. */
function UsageSchemaTable(props: { schema: BillingUsageSchema }) {
  const { i18n, t } = useTranslation()
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-sunken text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">{t('Field')}</th>
            <th className="px-3 py-2 font-medium">{t('Type')}</th>
            <th className="px-3 py-2 font-medium">{t('Values')}</th>
            <th className="px-3 py-2 font-medium">{t('Description')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Object.entries(props.schema).map(([field, definition]) => (
            <tr key={field}>
              <td className="px-3 py-2 font-mono text-xs">{field}</td>
              <td className="px-3 py-2 text-xs">
                {definition.type ?? (definition.enum ? 'enum' : 'number')}
                {definition.unit ? ` · ${localizedText(definition.unitLabel, i18n.language) || definition.unit}` : ''}
              </td>
              <td className="px-3 py-2 text-xs">
                {definition.enum
                  ?.map((value) => {
                    const label = localizedText(definition.enumLabels?.[value], i18n.language)
                    return label && label !== value ? `${value} (${label})` : value
                  })
                  .join(', ') ?? '—'}
              </td>
              <td className="px-3 py-2 text-xs text-muted">{localizedText(definition.description, i18n.language) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VersionList(props: {
  pluginKey: string
  versions: TaskPluginRecord[]
  selectedVersion?: string
  onView: (version: string) => void
}) {
  const { i18n, t } = useTranslation()
  const queryClient = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<{ version: string; usage?: TaskPluginUsage } | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: taskPluginKeys.all })

  const activateMutation = useMutation({
    mutationFn: (version: string) => activateTaskPlugin(props.pluginKey, version),
    onError: (error) => toast.error(toErrorMessage(error, t('Could not activate the plugin version.'))),
    onSuccess: () => {
      toast.success(t('Plugin version activated.'))
      void refresh()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (request: { version: string; force: boolean }) => deleteTaskPluginVersion(props.pluginKey, request.version, request.force),
    onError: (error, request) => {
      if (error instanceof TaskPluginUsageError && !request.force) {
        setPendingDelete({ usage: error.usage, version: request.version })
        return
      }
      toast.error(toErrorMessage(error, t('Could not delete the plugin.')))
    },
    onSuccess: () => {
      setPendingDelete(null)
      toast.success(t('Plugin version deleted.'))
      void refresh()
    },
  })

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {props.versions.map((record) => (
          <li className="flex flex-wrap items-center gap-3 px-4 py-3" key={record.version}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-foreground">v{record.version}</span>
                {record.active ? <Badge tone="success">{t('Active')}</Badge> : null}
                {record.version === props.selectedVersion ? <Badge tone="info">{t('Viewing')}</Badge> : null}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {new Date(record.created_at * 1000).toLocaleString(i18n.language)}
                {record.remark ? ` · ${record.remark}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {record.version === props.selectedVersion ? null : (
                <Button onClick={() => props.onView(record.version)} size="sm" variant="quiet">
                  {t('View')}
                </Button>
              )}
              {record.active ? null : (
                <>
                  <Button disabled={activateMutation.isPending} onClick={() => activateMutation.mutate(record.version)} size="sm" variant="outline">
                    {t('Activate')}
                  </Button>
                  <Button onClick={() => setPendingDelete({ version: record.version })} size="sm" variant="quiet">
                    {t('Delete')}
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={pendingDelete?.usage ? t('Delete anyway') : t('Delete')}
        description={pendingDelete === null ? undefined : t('Delete version {{version}}? This cannot be undone.', { version: pendingDelete.version })}
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete === null) return
          deleteMutation.mutate({ force: pendingDelete.usage !== undefined, version: pendingDelete.version })
        }}
        onOpenChange={(next) => (next ? undefined : setPendingDelete(null))}
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

type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

/** Line diff by longest common subsequence; plugin sources are small enough. */
function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  if (a.length * b.length > 4_000_000) {
    return [...a.map((text) => ({ kind: 'removed' as const, text })), ...b.map((text) => ({ kind: 'added' as const, text }))]
  }
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i] })
      i++
      j++
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      lines.push({ kind: 'removed', text: a[i++] })
    } else {
      lines.push({ kind: 'added', text: b[j++] })
    }
  }
  while (i < a.length) lines.push({ kind: 'removed', text: a[i++] })
  while (j < b.length) lines.push({ kind: 'added', text: b[j++] })
  return lines
}

const DIFF_LINE_PREFIX = { added: '+ ', removed: '- ', same: '  ' } as const

const DIFF_LINE_CLASSES = {
  added: 'bg-success/10 text-success',
  removed: 'bg-destructive/10 text-destructive',
  same: 'text-foreground',
} as const

function SourceView(props: { detail: TaskPluginDetail; activeSource?: string }) {
  const { t } = useTranslation()
  const source = props.detail.plugin?.source ?? ''
  const canCompare = props.activeSource !== undefined && props.activeSource !== source
  const [compare, setCompare] = useState(false)
  const diff = useMemo(
    () => (compare && props.activeSource !== undefined ? diffLines(props.activeSource, source) : []),
    [compare, props.activeSource, source]
  )

  if (source === '') {
    return <p className="text-sm text-muted">{t('This is a built-in plugin; its source ships with the gateway.')}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton label={t('Copy source')} size="sm" value={source} />
        {canCompare ? (
          <Button onClick={() => setCompare((value) => !value)} size="sm" variant="outline">
            {compare ? t('Show source') : t('Compare with active version')}
          </Button>
        ) : null}
      </div>
      <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-sunken p-3 font-mono text-xs leading-5">
        {compare
          ? diff.map((line, index) => (
              <div className={DIFF_LINE_CLASSES[line.kind]} key={index}>
                {DIFF_LINE_PREFIX[line.kind]}
                {line.text}
              </div>
            ))
          : source}
      </pre>
    </div>
  )
}

const SANDBOX_HOOKS = [
  'resolveRequest',
  'buildSubmitRequest',
  'parseSubmitResponse',
  'extractUsage',
  'extractUsageOnSubmit',
  'extractUsageOnComplete',
  'buildQueryRequest',
  'parseTaskResult',
  'buildBatchQueryRequest',
  'parseBatchResult',
  'buildContentRequest',
  'renderers.openai_video',
]

/** Calls one plugin hook on the server with the given arguments, without side effects upstream. */
function PluginSandbox(props: { pluginKey: string }) {
  const { t } = useTranslation()
  const [hook, setHook] = useState('buildSubmitRequest')
  const [args, setArgs] = useState('[{}]')
  const [output, setOutput] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(args) as unknown
      if (!Array.isArray(parsed)) throw new Error(t('Arguments must be a JSON array'))
      const separator = hook.indexOf('.')
      return dryRunTaskPlugin(props.pluginKey, {
        args: parsed,
        hook: separator < 0 ? hook : hook.slice(0, separator),
        member: separator < 0 ? undefined : hook.slice(separator + 1),
      })
    },
    onError: (error) => setOutput(JSON.stringify({ error: error.message }, null, 2)),
    onSuccess: (value) => setOutput(JSON.stringify(value, null, 2)),
  })

  return (
    <div className="flex flex-col gap-4">
      <NativeSelect
        label={t('Hook')}
        onChange={(event) => setHook(event.target.value)}
        options={SANDBOX_HOOKS.map((item) => ({ label: item, value: item }))}
        value={hook}
      />
      <Textarea
        label={t('Arguments JSON')}
        onChange={(event) => setArgs(event.target.value)}
        rows={10}
        spellCheck={false}
        textareaClassName="font-mono text-xs"
        value={args}
      />
      <div>
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          <PlayIcon aria-hidden="true" />
          {mutation.isPending ? t('Running dry run') : t('Run dry run')}
        </Button>
      </div>
      {output === '' ? null : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{t('Dry run result')}</p>
          <pre className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-sunken p-3 font-mono text-xs leading-5">{output}</pre>
        </div>
      )}
    </div>
  )
}
