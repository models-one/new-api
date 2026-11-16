import { useTranslation } from 'react-i18next'

import { Badge, CopyButton } from '@/components/ui'
import { channelTypeName } from '@/features/channels/channel-presentation'

import type { ResolvedPluginParts } from '../lib/plugin-kinds'
import { getPluginWebsite } from '../lib/plugin-website'
import { REQUEST_PLUGIN_STAGE_LABELS } from '../lib/request-plugins'
import { localizedText } from '../presentation'
import type { RequestPluginConfigField, RequestPluginConfigSchema, TaskPluginDetail, TaskPluginRelayRoute } from '../types'
import { PluginEndpoints, PluginModelList } from './PluginFacts'
import { PluginWebsiteLink } from './PluginWebsiteLink'

function Fact(props: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={props.wide ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
      <dt className="text-xs text-muted">{props.label}</dt>
      <dd className="mt-0.5 text-sm break-words text-foreground">{props.children}</dd>
    </div>
  )
}

function Card(props: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={props.title} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
        {props.aside}
      </div>
      {props.children}
    </section>
  )
}

/** What a plugin declares about itself, by the parts it has. */
export function PluginOverview(props: { detail: TaskPluginDetail; parts: ResolvedPluginParts }) {
  const { t } = useTranslation()
  const { detail, parts } = props
  const meta = detail.meta
  const record = detail.plugin
  const models = meta.models ?? []
  const relay = meta.relay ?? []
  // A plugin that only processes requests has no channel, models or address.
  const hasChannel = parts.task || parts.provider
  let channelTypes = parts.provider ? t('Plugin') : t('Task Plugin')
  if (meta.channelTypes?.length) channelTypes = meta.channelTypes.map((type) => `${t(channelTypeName(type))} (#${type})`).join(', ')
  let canCopyBaseUrl = false
  try {
    const url = new URL(meta.baseUrl ?? '')
    canCopyBaseUrl = url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    // A missing or invalid URL is displayed verbatim without a copy action.
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card title={t('Plugin metadata')}>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Fact label={t('Author')}>
            {getPluginWebsite(meta.author.url) ? (
              <a className="text-primary underline-offset-2 hover:underline" href={meta.author.url} rel="noopener noreferrer" target="_blank">
                {meta.author.name}
              </a>
            ) : (
              meta.author.name
            )}
          </Fact>
          <Fact label={t('Plugin website')}>
            {getPluginWebsite(meta.website) ? <PluginWebsiteLink website={meta.website} /> : t('Not declared')}
          </Fact>
          <Fact label={t('Plugin API version')}>{meta.apiVersion}</Fact>
          <Fact label={t('Sort priority')}>{meta.sortPriority ?? 0}</Fact>
          {parts.task ? <Fact label={t('Fetch mode')}>{meta.fetchMode || t('Not declared')}</Fact> : null}
          {hasChannel ? <Fact label={t('Channel types')}>{channelTypes}</Fact> : null}
          {record?.remark ? <Fact label={t('Remark')}>{record.remark}</Fact> : null}
          {hasChannel ? (
            <Fact label={t('Default base URL')} wide>
              <span className="flex items-start gap-2">
                <span className="min-w-0 flex-1 font-mono text-xs break-all">{meta.baseUrl || t('Not declared')}</span>
                {canCopyBaseUrl ? <CopyButton label={t('Copy base URL')} size="icon-sm" value={meta.baseUrl ?? ''} /> : null}
              </span>
            </Fact>
          ) : null}
          {record?.source_hash ? (
            <Fact label="SHA-256" wide>
              <span className="font-mono text-xs break-all">{record.source_hash}</span>
            </Fact>
          ) : null}
        </dl>
      </Card>

      {parts.transform ? <TransformCard hooks={detail.transform_hooks ?? []} schema={meta.configSchema ?? undefined} /> : null}

      {hasChannel ? (
        <Card
          aside={
            <>
              <Badge tone="muted">{models.length}</Badge>
              {models.length > 0 ? <CopyButton className="ml-auto" label={t('Copy all models')} size="icon-sm" value={models.join('\n')} /> : null}
            </>
          }
          title={t('Models')}
        >
          {models.length > 0 ? <PluginModelList models={models} /> : <p className="text-sm text-muted">{t('Not declared')}</p>}
        </Card>
      ) : null}

      {relay.length > 0 ? (
        <Card title={t('Forwarded routes')}>
          <RelayRoutes routes={relay} />
        </Card>
      ) : null}

      {parts.task ? (
        <Card title={t('Endpoints')}>
          <PluginEndpoints pluginKey={meta.key} protocols={meta.protocols} routes={meta.routes} skippedRoutes={detail.skipped_routes} />
        </Card>
      ) : null}
    </div>
  )
}

const FIELD_TYPE_LABELS: Record<RequestPluginConfigField['type'], string> = {
  array: 'List',
  boolean: 'On or off',
  integer: 'Whole number',
  number: 'Number',
  object: 'JSON',
  string: 'Text',
}

/** Where a request processing plugin runs, and the settings it takes. */
function TransformCard(props: { hooks: string[]; schema?: RequestPluginConfigSchema }) {
  const { i18n, t } = useTranslation()
  const fields = Object.entries(props.schema?.properties ?? {})
  return (
    <Card title={t('Request processing')}>
      <div className="flex flex-col gap-2">
        <h4 className="text-xs text-muted">{t('When it runs')}</h4>
        {props.hooks.length > 0 ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {props.hooks.map((hook) => (
              <li key={hook}>{t(REQUEST_PLUGIN_STAGE_LABELS[hook] ?? hook)}</li>
            ))}
          </ol>
        ) : (
          <p className="text-sm">{t('Not declared')}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="text-xs text-muted">{t('Settings')}</h4>
        {fields.length === 0 ? (
          <p className="text-sm">{t('This plugin has no settings.')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table aria-label={t('Settings')} className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  {[t('Name'), t('Type'), t('Default')].map((heading) => (
                    <th className="px-3 py-2 font-medium" key={heading} scope="col">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fields.map(([name, field]) => {
                  const description = localizedText(field.description, i18n.language)
                  return (
                    <tr className="align-top" key={name}>
                      <td className="max-w-72 px-3 py-2 break-words">
                        <span className="font-medium text-foreground">{localizedText(field.title, i18n.language) || name}</span>
                        {description === '' ? null : <span className="block text-xs text-muted">{description}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">{t(FIELD_TYPE_LABELS[field.type] ?? field.type)}</td>
                      <td className="max-w-48 px-3 py-2 font-mono text-xs break-all">
                        {field.default === undefined ? '—' : JSON.stringify(field.default)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * The client API paths a provider plugin forwards, each with the upstream path it
 * reaches, how the request format is converted, and its model scope.
 */
function RelayRoutes(props: { routes: TaskPluginRelayRoute[] }) {
  const { t } = useTranslation()
  return (
    <ul className="divide-y divide-border">
      {props.routes.map((route) => {
        const converter = route.converter?.trim() ?? ''
        // A converter the console has no name for is shown as the plugin wrote it.
        let converterLabel = converter
        if (converter === '' || converter === 'none') converterLabel = t('Native forwarding')
        if (converter === 'plugin') converterLabel = t('Converted by the plugin')
        return (
          <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 py-2" key={route.incoming_path}>
            <dl className="flex min-w-0 flex-col gap-1.5 text-xs">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <dt className="text-muted">{t('Incoming path')}</dt>
                <dd className="min-w-0 font-mono break-all text-foreground">{route.incoming_path}</dd>
              </div>
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <dt className="text-muted">{t('Upstream path')}</dt>
                <dd className="min-w-0 font-mono break-all text-foreground">{route.upstream_path}</dd>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <dt className="sr-only">{t('Converter')}</dt>
                <dd>
                  <Badge tone="secondary">{converterLabel}</Badge>
                </dd>
                {route.models?.length ? <dd className="text-muted">{t('Model scope: {{models}}', { models: route.models.join(', ') })}</dd> : null}
              </div>
            </dl>
            <CopyButton label={t('Copy endpoint path')} size="icon-sm" value={route.incoming_path} />
          </li>
        )
      })}
    </ul>
  )
}
