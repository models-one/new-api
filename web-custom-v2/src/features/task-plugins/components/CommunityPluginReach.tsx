import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'

import { Alert } from '@/components/ui'

import { resolvePluginParts } from '../lib/plugin-kinds'
import { parsePluginMetaPreview, readPluginSourceParts, resolvePluginMetaPreview } from '../lib/plugin-meta-preview'
import type { MarketplaceIndexVersion, MarketplacePlugin } from '../types'

type CommunityPluginReachProps = {
  plugin: MarketplacePlugin
  version?: MarketplaceIndexVersion
  /** The downloaded code; until it arrives the source's own claims are used. */
  source?: string
}

function hostOf(address: string) {
  try {
    return new URL(address).host
  } catch {
    return ''
  }
}

/** What a plugin from a community or third-party source can reach once installed. */
export function CommunityPluginReach(props: CommunityPluginReachProps) {
  const { t } = useTranslation()
  const read = useMemo(() => {
    if (props.source === undefined) return undefined
    return { parts: readPluginSourceParts(props.source), preview: parsePluginMetaPreview(props.source) }
  }, [props.source])
  const fields = resolvePluginMetaPreview(props.plugin, props.version, read?.preview)
  // Code that cannot be read may hold any part, so every line shows.
  let parts = { provider: true, task: true, transform: true }
  if (read?.parts) parts = read.parts
  if (!read) parts = resolvePluginParts({ ...props.plugin, meta: {} })

  const lines: string[] = []
  if (parts.task || parts.provider) lines.push(t('The keys and API addresses of the channels that use it'))
  if (parts.transform) lines.push(t('The requests and replies it handles'))
  const hosts = new Set<string>()
  if (fields.baseUrl.state === 'value' && fields.baseUrl.value) {
    const host = hostOf(fields.baseUrl.value)
    if (host) hosts.add(host)
  }
  if (fields.allowedHosts.state === 'value') {
    for (const host of fields.allowedHosts.value) hosts.add(host)
  }
  if (hosts.size > 0) lines.push(t('Other addresses: {{hosts}}', { hosts: [...hosts].join(', ') }))
  if (fields.allowedHosts.state === 'unknown') lines.push(t('Other addresses: could not be read from the code'))

  return (
    <Alert icon={<ShieldAlertIcon aria-hidden="true" />} title={t('What this plugin can reach')} tone="warning">
      <ul className="list-disc space-y-0.5 pl-4 break-words">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Alert>
  )
}
