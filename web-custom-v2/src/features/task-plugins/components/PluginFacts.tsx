import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, Badge, CopyButton } from '@/components/ui'
import { channelTypeName } from '@/features/channels/channel-presentation'

import { HOST_PROTOCOL_ENDPOINTS } from '../lib/host-protocols'
import { parsePluginMetaPreview, resolvePluginMetaPreview } from '../lib/plugin-meta-preview'
import type {
  MarketplaceIndexVersion,
  MarketplacePlugin,
  PluginPreviewField,
  TaskPluginMeta,
  TaskPluginRoute,
} from '../types'

const VISIBLE_MODELS = 8

/** Model ids are wire vocabulary: shown raw, with the overflow behind a disclosure. */
export function PluginModelList(props: { models: string[] }) {
  const { t } = useTranslation()
  const visible = props.models.slice(0, VISIBLE_MODELS)
  const hidden = props.models.slice(VISIBLE_MODELS)
  const chip = (model: string) => (
    <Badge className="max-w-full font-mono break-all whitespace-normal" key={model} tone="muted">
      {model}
    </Badge>
  )
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">{visible.map(chip)}</div>
      {hidden.length === 0 ? null : (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
            {t('More models ({{count}})', { count: hidden.length })}
          </summary>
          <div className="flex flex-wrap gap-1.5 pt-2">{hidden.map(chip)}</div>
        </details>
      )}
    </div>
  )
}

function EndpointRow(props: { method: string; path: string; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-2 py-2">
      <Badge className="justify-center font-mono" tone="muted">
        {props.method}
      </Badge>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-xs break-all text-foreground">{props.path}</span>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">{props.children}</div>
      </div>
      <CopyButton label={t('Copy endpoint path')} size="sm" value={props.path} />
    </li>
  )
}

/**
 * The endpoints the gateway serves for a plugin: first the host protocol
 * endpoints each `meta.protocols` claim unlocks, then the plugin's own native
 * routes. Supported request forms gate only the create call, so they sit on it.
 */
export function PluginEndpoints(props: {
  protocols?: TaskPluginMeta['protocols']
  routes?: TaskPluginRoute[]
  note?: ReactNode
}) {
  const { t } = useTranslation()
  const claims = props.protocols ?? []
  const routes = props.routes ?? []
  const modeLabels = { background: t('Background'), stream: t('Streaming'), sync: t('Synchronous') }

  if (claims.length === 0 && routes.length === 0) {
    return <p className="text-sm text-muted">{props.note ?? t('Not declared')}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {props.note}
      {claims.map((claim) => {
        const name = typeof claim === 'string' ? claim : claim.name
        const supports = typeof claim === 'string' ? undefined : claim.supports
        const endpoints = HOST_PROTOCOL_ENDPOINTS[name] ?? []
        const chips = supports?.map((mode) => (
          <Badge key={mode} tone="secondary">
            <span className="font-mono">{mode}</span> {modeLabels[mode]}
          </Badge>
        ))
        const hasCreateRow = endpoints.some((endpoint) => endpoint.modeBearing)
        return (
          <div className="flex flex-col gap-1 rounded-md bg-sunken p-3" key={name}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs break-all text-muted">{name}</span>
              {hasCreateRow ? null : chips}
            </div>
            <ul className="divide-y divide-border">
              {endpoints.map((endpoint) => (
                <EndpointRow key={`${endpoint.method} ${endpoint.path}`} method={endpoint.method} path={endpoint.path}>
                  {endpoint.method === 'POST' ? t('Submit request') : t('Retrieve result')}
                  {endpoint.modeBearing ? chips : null}
                </EndpointRow>
              ))}
            </ul>
          </div>
        )
      })}
      {routes.length === 0 ? null : (
        <div className="flex flex-col gap-1 rounded-md bg-sunken p-3">
          <p className="text-xs text-muted">{t('Plugin-defined interfaces')}</p>
          <ul className="divide-y divide-border">
            {routes.map((route) => (
              <EndpointRow key={`${route.method} ${route.path}`} method={route.method} path={route.path}>
                <span className="font-mono">{route.type}</span>
                {route.type === 'submit' ? t('Submit request') : null}
                {route.type === 'query' ? t('Retrieve result') : null}
                {route.type === 'dynamic' ? t('Dynamic operation') : null}
              </EndpointRow>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function FieldOrigin(props: { field: PluginPreviewField<unknown> }) {
  const { t } = useTranslation()
  if (props.field.state !== 'value' || props.field.origin !== 'index') return null
  return (
    <Badge className="mt-1" tone="muted">
      {t('From marketplace index')}
    </Badge>
  )
}

/**
 * What a plugin will do once installed, read from its static declarations (and,
 * for a marketplace entry, the index). Shown before install so the administrator
 * reviews models, endpoints, credentials and outbound hosts up front.
 */
export function PluginCapabilities(props: {
  plugin?: MarketplacePlugin
  version?: MarketplaceIndexVersion
  source?: string
}) {
  const { t } = useTranslation()
  const parsed = useMemo(
    () => (props.source === undefined ? undefined : parsePluginMetaPreview(props.source)),
    [props.source]
  )
  const fields = resolvePluginMetaPreview(props.plugin, props.version, parsed)
  const unavailable = t('Information unavailable')
  const notDeclared = t('Not declared by this plugin')

  let channels = unavailable
  if (fields.channelTypes.state === 'missing') channels = t('Task Plugin')
  if (fields.channelTypes.state === 'value') {
    channels = fields.channelTypes.value.length
      ? fields.channelTypes.value.map((type) => `${t(channelTypeName(type))} (#${type})`).join(', ')
      : t('Task Plugin')
  }

  let hosts = unavailable
  if (fields.allowedHosts.state === 'missing') hosts = t('No extra domains declared')
  if (fields.allowedHosts.state === 'value') hosts = fields.allowedHosts.value.join(', ') || t('No extra domains declared')

  let authentication = unavailable
  if (fields.auth.state === 'missing') authentication = t('Not declared; an API key may still be required.')
  if (fields.auth.state === 'value') {
    const value = fields.auth.value
    authentication = value || t('Not declared; an API key may still be required.')
    if (value === 'api_key') authentication = t('API Key')
    if (value === 'none') authentication = t('None (plugin declaration)')
    if (value === 'oauth2_jwt' || value === 'vertex_oauth') authentication = t('OAuth 2.0 service account')
  }

  let baseUrl = unavailable
  if (fields.baseUrl.state === 'missing') baseUrl = notDeclared
  if (fields.baseUrl.state === 'value') baseUrl = fields.baseUrl.value || notDeclared

  const connections = [
    { field: fields.channelTypes, hint: t('Channel types you can use when binding this plugin.'), title: t('Applicable channels'), value: channels },
    {
      field: fields.auth,
      hint: t('Authentication for upstream requests; channel credentials may still be used.'),
      title: t('Upstream authentication'),
      value: authentication,
    },
    { field: fields.baseUrl, hint: t('Used when a Task Plugin channel has no API address configured.'), title: t('Default API address'), value: baseUrl },
    {
      field: fields.allowedHosts,
      hint: t('Extra destinations beyond the channel API address. The channel address remains accessible.'),
      title: t('Additional request domains'),
      value: hosts,
    },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {parsed && parsed.status !== 'parsed' ? (
        <Alert title={t('Some plugin information could not be read')} tone="warning">
          {t('Dynamic declarations cannot be previewed. Review the source before installing.')}
        </Alert>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('Supported models')}</h3>
        {fields.models.state === 'value' && fields.models.value.length > 0 ? (
          <PluginModelList models={fields.models.value} />
        ) : (
          <p className="text-xs text-muted">{fields.models.state === 'unknown' ? unavailable : notDeclared}</p>
        )}
        <FieldOrigin field={fields.models} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('Supported interfaces')}</h3>
        <PluginEndpoints
          protocols={fields.protocols.state === 'value' ? fields.protocols.value : undefined}
          routes={fields.routes.state === 'value' ? fields.routes.value : undefined}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('Connection settings')}</h3>
        <dl className="grid gap-x-6 gap-y-4 rounded-lg border border-border p-4 sm:grid-cols-2">
          {connections.map((connection, index) => (
            <div className={index >= 2 ? 'min-w-0 sm:col-span-2' : 'min-w-0'} key={connection.title}>
              <dt className="text-xs text-muted">{connection.title}</dt>
              <dd>
                <p className="text-sm break-all text-foreground">{connection.value}</p>
                <FieldOrigin field={connection.field} />
                <p className="mt-1 text-xs text-muted">{connection.hint}</p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-xs text-muted">
        {t('This preview reads static plugin declarations. The gateway validates the plugin during installation.')}
      </p>
    </div>
  )
}
