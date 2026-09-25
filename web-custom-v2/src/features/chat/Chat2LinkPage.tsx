import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import ArrowRightIcon from 'lucide-react/dist/esm/icons/arrow-right'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, Panel, Skeleton, Spinner } from '@/components/ui'
import { activeChatKeyQuery } from '@/features/chat/api'
import {
  buildChatUrl,
  presetRequiresApiKey,
  type ChatUrlResult,
} from '@/features/chat/chat-presets'
import {
  ChatPageFrame,
  KeyLookupFailedState,
  NoEnabledKeyState,
  NoPresetsState,
  PresetDirectory,
} from '@/features/chat/components/ChatStates'
import { useChatPresets } from '@/features/chat/use-chat-presets'

export type ChatRedirect = (url: string) => void

/**
 * Leaving the console. `assign` rather than `replace`: the back button should return the
 * user to where they were, not re-fire the redirect.
 */
const defaultRedirect: ChatRedirect = (url) => {
  window.location.assign(url)
}

/**
 * `/chat2link` — the legacy shortcut that opens the first embeddable chat client with the
 * user's key already filled in, ported from `web/src/routes/_authenticated/chat2link.tsx`.
 *
 * It stays headless in the happy path, but every way it can fail now renders an
 * explanation instead of the legacy toast-and-bounce: the account has no enabled key, the
 * operator configured no web client, the template is malformed. `buildChatUrl` is the only
 * source of the destination, so the address this navigates to is always one whose origin an
 * administrator wrote out in full — never anything assembled from the page URL.
 */
export function Chat2LinkPage(props: { redirect?: ChatRedirect } = {}) {
  const { t } = useTranslation()
  const catalogue = useChatPresets()
  const redirect = props.redirect ?? defaultRedirect

  const preset = useMemo(
    () => catalogue.presets.find((candidate) => candidate.kind === 'web'),
    [catalogue.presets],
  )
  const needsKey = preset !== undefined && presetRequiresApiKey(preset.template)

  const keyQuery = useQuery({ ...activeChatKeyQuery(), enabled: needsKey })
  const activeKey = keyQuery.data ?? null

  const urlResult = useMemo<ChatUrlResult | null>(() => {
    if (preset === undefined) return null
    if (needsKey && activeKey === null) return null
    return buildChatUrl({
      apiKey: needsKey && activeKey !== null ? activeKey.secret : undefined,
      serverAddress: catalogue.serverAddress,
      template: preset.template,
    })
  }, [activeKey, catalogue.serverAddress, needsKey, preset])

  const target = urlResult !== null && urlResult.ok ? urlResult : null
  const sentTo = useRef<string | null>(null)

  useEffect(() => {
    if (target === null) return
    if (sentTo.current === target.url) return
    sentTo.current = target.url
    redirect(target.url)
  }, [redirect, target])

  if (catalogue.isPending) {
    return (
      <ChatPageFrame title={t('Opening chat')}>
        <Skeleton className="h-48" label={t('Loading chat clients')} variant="block" />
      </ChatPageFrame>
    )
  }

  if (catalogue.isError) {
    return (
      <ChatPageFrame title={t('Opening chat')}>
        <Alert
          action={
            <Button
              aria-busy={catalogue.isFetching}
              disabled={catalogue.isFetching}
              onClick={catalogue.retry}
              size="sm"
            >
              {t('Try again')}
            </Button>
          }
          title={t('Could not load the chat clients')}
          tone="destructive"
        >
          <p>{toErrorMessage(catalogue.error)}</p>
        </Alert>
      </ChatPageFrame>
    )
  }

  if (catalogue.presets.length === 0) {
    return (
      <ChatPageFrame title={t('Opening chat')}>
        <NoPresetsState />
      </ChatPageFrame>
    )
  }

  if (preset === undefined) {
    return (
      <ChatPageFrame title={t('Opening chat')}>
        <Alert title={t('No web chat client is configured')} tone="warning">
          <p>
            {t(
              'This shortcut opens the first chat client that runs as a web page. Every client this gateway publishes launches a desktop app or a browser extension instead, so there is nothing to open.',
            )}
          </p>
        </Alert>
        <PresetDirectory presets={catalogue.presets} />
      </ChatPageFrame>
    )
  }

  if (needsKey && keyQuery.isPending) {
    return (
      <ChatPageFrame title={t('Opening chat')}>
        <Skeleton className="h-48" label={t('Preparing your chat link')} variant="block" />
      </ChatPageFrame>
    )
  }

  if (needsKey && keyQuery.isError) {
    return (
      <ChatPageFrame title={t('Opening chat')}>
        <KeyLookupFailedState
          message={toErrorMessage(keyQuery.error)}
          onRetry={() => void keyQuery.refetch()}
          retrying={keyQuery.isFetching}
        />
      </ChatPageFrame>
    )
  }

  if (needsKey && activeKey === null) {
    return (
      <ChatPageFrame title={t('Opening chat')}>
        <NoEnabledKeyState />
      </ChatPageFrame>
    )
  }

  if (target === null) {
    return (
      <ChatPageFrame title={t('Opening chat')}>
        <Alert title={t('This chat client is misconfigured')} tone="destructive">
          <p>
            {t(
              'The console could not build a safe address for {{name}}, so nothing was opened and your API key was not sent.',
              { name: preset.name },
            )}
          </p>
        </Alert>
        <PresetDirectory presets={catalogue.presets} />
      </ChatPageFrame>
    )
  }

  return (
    <ChatPageFrame title={t('Opening chat')}>
      <Panel>
        <Panel.Body>
          <p className="flex items-center gap-3 text-sm font-semibold text-foreground">
            <Spinner label={t('Redirecting')} size="sm" />
            {t('Taking you to {{origin}}', { origin: target.origin })}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            {t(
              'Your API key is being added to the address an administrator configured for {{name}}. You are leaving the console.',
              { name: preset.name },
            )}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={() => redirect(target.url)}>
              {t('Continue now')}
              <ArrowRightIcon aria-hidden="true" />
            </Button>
            <Button render={<Link to="/dashboard" />} variant="outline">
              {t('Back to dashboard')}
            </Button>
          </div>
        </Panel.Body>
      </Panel>
    </ChatPageFrame>
  )
}
