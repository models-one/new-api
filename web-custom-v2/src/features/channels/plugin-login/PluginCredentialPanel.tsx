import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import LogInIcon from 'lucide-react/dist/esm/icons/log-in'
import UserPlusIcon from 'lucide-react/dist/esm/icons/user-plus'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Badge, Button } from '@/components/ui'
import { fetchPluginCredentials, type PluginCredentialSummary } from '@/features/channels/api'
import { formatDateTime } from '@/lib/format'

export function pluginCredentialsQueryKey(channelId: number) {
  return ['channels', 'detail', channelId, 'plugin_credentials'] as const
}

type PluginCredentialPanelProps = {
  /** Null until the channel is saved with this plugin; login needs a channel id. */
  channelId: number | null
  multiKey: boolean
  disabled: boolean
  /**
   * null logs in a new credential; an index logs in again on that line. `add` keeps the
   * account of a single-key channel and adds the new one next to it.
   */
  onLogin: (keyIndex: number | null, add?: boolean) => void
}

/** Replaces the key input for plugins that log in to the provider. */
export function PluginCredentialPanel(props: PluginCredentialPanelProps) {
  const { t } = useTranslation()
  const channelId = props.channelId
  const query = useQuery({
    enabled: channelId !== null,
    queryFn: () => fetchPluginCredentials(channelId ?? 0),
    queryKey: pluginCredentialsQueryKey(channelId ?? 0),
  })

  if (channelId === null) {
    return (
      <section aria-labelledby="plugin-credentials-title" className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-foreground" id="plugin-credentials-title">
          {t('Credentials')}
        </h3>
        <p className="text-sm text-muted">{t('This channel signs in with a provider account. Save the channel, then log in.')}</p>
      </section>
    )
  }

  const items = query.data ?? []
  const loggedIn = items.length > 0
  // A single-key channel replaces its account, or adds one and becomes a multi-key channel.
  const canSwitch = loggedIn && !props.multiKey

  let list
  if (query.isPending) {
    list = <p className="text-sm text-muted">{t('Loading…')}</p>
  } else if (query.isError) {
    list = (
      <Alert
        action={
          <Button onClick={() => void query.refetch()} size="sm" variant="outline">
            {t('Try again')}
          </Button>
        }
        title={t('Failed to load credentials')}
        tone="destructive"
      >
        {toErrorMessage(query.error)}
      </Alert>
    )
  } else if (items.length === 0) {
    list = (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm">
        <p className="font-medium text-foreground">{t('Not logged in')}</p>
        <p className="text-muted">{t('Log in to start using this channel.')}</p>
      </div>
    )
  } else {
    list = (
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <CredentialRow
            disabled={props.disabled}
            item={item}
            key={item.index}
            multiKey={props.multiKey}
            onLogin={() => props.onLogin(item.index)}
          />
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby="plugin-credentials-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground" id="plugin-credentials-title">
          {t('Credentials')}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {canSwitch ? (
            <Button disabled={props.disabled} onClick={() => props.onLogin(null)} size="sm" variant="outline">
              <LogInIcon aria-hidden="true" />
              {t('Switch account')}
            </Button>
          ) : null}
          <Button disabled={props.disabled || query.isPending} onClick={() => props.onLogin(null, canSwitch)} size="sm" variant="primary">
            {loggedIn ? <UserPlusIcon aria-hidden="true" /> : <LogInIcon aria-hidden="true" />}
            {loggedIn ? t('Add account') : t('Log in')}
          </Button>
        </div>
      </div>
      {list}
    </section>
  )
}

function CredentialRow(props: { item: PluginCredentialSummary; multiKey: boolean; disabled: boolean; onLogin: () => void }) {
  const { i18n, t } = useTranslation()
  const item = props.item
  const name = item.label || item.account_id || t('Unnamed account')
  const details: string[] = []
  if (item.account_id && item.account_id !== name) details.push(`${t('Account ID')}: ${item.account_id}`)
  if (item.expires_at) details.push(t('Expires {{time}}', { time: formatDateTime(item.expires_at, i18n.language) }))
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {/* Same numbering as the multi-key manager, which removes lines. */}
          {props.multiKey ? <span className="text-muted tabular-nums">#{item.index + 1}</span> : null}
          <span className="min-w-0 break-all">{name}</span>
          {item.needs_login ? <Badge tone="warning">{t('Needs login')}</Badge> : null}
        </p>
        {details.length > 0 ? <p className="text-xs break-all text-muted">{details.join(' · ')}</p> : null}
      </div>
      <Button disabled={props.disabled} onClick={props.onLogin} size="sm" variant={item.needs_login ? 'primary' : 'outline'}>
        {t('Log in again')}
      </Button>
    </li>
  )
}
