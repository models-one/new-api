import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Panel, Spinner } from '@/components/ui'
import { submitPluginLoginCallback, type PluginLoginStep } from '@/features/channels/api'
import { taskPluginOptionsQuery } from '@/features/channels/task-plugin-binding'
import { PluginIcon } from '@/features/task-plugins/components/PluginIcon'
import { formatDateTime } from '@/lib/format'

/** The login dialog in the console tab listens here for how the callback went. */
export const PLUGIN_LOGIN_BROADCAST_CHANNEL = 'new-api-plugin-login'

type Result =
  | { status: 'pending' }
  | { status: 'received'; step: PluginLoginStep }
  | { status: 'failed'; message: string }

function tellLoginDialog(message: unknown) {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(PLUGIN_LOGIN_BROADCAST_CHANNEL)
  channel.postMessage(message)
  channel.close()
}

/**
 * `/oauth/plugin/$key/callback` — where a provider plugin's vendor sends the browser after
 * sign-in (`service.PluginLoginRedirectURI`). The server completes the exchange and stores
 * the credential; this page only forwards the query and reports the outcome.
 */
export function PluginLoginCallbackPage() {
  const { t, i18n } = useTranslation()
  const { key } = useParams({ strict: false }) as { key: string }
  const plugin = useQuery(taskPluginOptionsQuery()).data?.find((option) => option.key === key)
  const name = plugin?.name || key

  // Read once: the address bar is cleared below because the query holds the authorization code.
  const [params] = useState(() => Object.fromEntries(new URLSearchParams(window.location.search)))
  const [result, setResult] = useState<Result>({ status: 'pending' })
  const sent = useRef(false)

  useEffect(() => {
    // A ref survives StrictMode's remount, so the one-time code is sent exactly once.
    if (sent.current) return
    sent.current = true
    window.history.replaceState(window.history.state, '', window.location.pathname)

    submitPluginLoginCallback(key, params)
      .then((data) => {
        setResult({ status: 'received', step: data.step })
        tellLoginDialog({ channel_id: data.channel_id, step: data.step })
      })
      .catch((error: unknown) => {
        const message = toErrorMessage(error, t('Login failed'))
        setResult({ status: 'failed', message })
        // A failure has no channel yet; the dialog matches its flow by `state`.
        if (params.state) tellLoginDialog({ state: params.state, error: message })
      })
  }, [key, params, t])

  let content: ReactNode
  if (result.status === 'pending') {
    content = (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Spinner decorative size="sm" />
        {t('Finishing sign-in...')}
      </p>
    )
  } else if (result.status === 'failed') {
    content = (
      <>
        <Alert title={t('Login failed')} tone="destructive">
          {result.message}
        </Alert>
        <p className="text-sm text-muted">{t('Close this tab and try again from the login dialog.')}</p>
      </>
    )
  } else if (result.step.type === 'done') {
    const credential = result.step.credential
    content = (
      <>
        <Alert title={t('Signed in')} tone="success">
          {credential?.account_id || credential?.label
            ? t('Credential saved for {{account}}.', { account: credential.account_id || credential.label })
            : t('Credential saved.')}
          {credential?.expires_at
            ? ` ${t('Expires {{date}}.', { date: formatDateTime(credential.expires_at, i18n.language) })}`
            : null}
        </Alert>
        <p className="text-sm text-muted">{t('You can close this tab.')}</p>
      </>
    )
  } else {
    content = <p className="text-sm">{t('Continue in the login dialog. You can close this tab.')}</p>
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col py-6 sm:py-12">
      <Panel>
        <Panel.Header
          icon={<PluginIcon hasIcon={plugin?.hasIcon} icon={plugin?.icon} name={name} pluginKey={key} size="sm" />}
          title={t('Log in to {{name}}', { name })}
        />
        <Panel.Body className="flex flex-col gap-4 p-6">{content}</Panel.Body>
      </Panel>
    </div>
  )
}
