import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import ExternalLinkIcon from 'lucide-react/dist/esm/icons/external-link'
import MessagesSquareIcon from 'lucide-react/dist/esm/icons/messages-square'
import ShieldCheckIcon from 'lucide-react/dist/esm/icons/shield-check'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Collapsible } from '@/components/disclosure'
import { toErrorMessage } from '@/components/overlay'
import {
  Alert,
  Badge,
  Button,
  DescriptionList,
  MaskedValue,
  Panel,
  Skeleton,
  type DescriptionListItem,
} from '@/components/ui'
import { activeChatKeyQuery } from '@/features/chat/api'
import {
  ADDRESS_PLACEHOLDER,
  buildChatUrl,
  findChatPreset,
  KEY_PLACEHOLDER,
  parseChatIndex,
  presetRequiresApiKey,
  presetScheme,
  substitutedPlaceholders,
  type ChatPreset,
  type ChatUrlRejection,
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

/**
 * The iframe sandbox. Every token is here for a reason, and the omissions are the point.
 *
 *   allow-scripts     third-party chat clients are single-page apps; without it, a blank frame.
 *   allow-same-origin the client needs its own localStorage/IndexedDB and same-origin fetches
 *                     to its own backend. Paired with allow-scripts this is only dangerous
 *                     when the framed document shares the CONSOLE's origin — a preset is a
 *                     remote operator URL, so the frame stays a foreign origin and cannot
 *                     reach this document, its cookies or its storage.
 *   allow-forms       sign-in and settings forms inside the client.
 *   allow-popups      OAuth and "open in a new window". Deliberately WITHOUT
 *                     allow-popups-to-escape-sandbox, so anything it opens inherits these
 *                     same restrictions.
 *   allow-modals      the client's own alert/confirm dialogs.
 *   allow-downloads   conversation export.
 *
 * NOT granted, and this is the important half: `allow-top-navigation` and
 * `allow-top-navigation-by-user-activation`. The frame's URL carries the user's API key;
 * a frame that can navigate the top window is a one-click redirect off the console for a
 * hostile or compromised preset. Also withheld: pointer-lock, presentation,
 * orientation-lock, and storage-access — none of which a chat client needs from us.
 */
export const IFRAME_SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads'

/**
 * The embedded client is told nothing about where it was embedded. The console path
 * carries no secret, but the preset is a third party and the referrer is free to withhold.
 */
export const IFRAME_REFERRER_POLICY = 'no-referrer'

/**
 * Voice input. In the `allow` attribute a feature named with no origin list defaults to
 * the frame's own origin, so this delegates camera and microphone to the chat client and
 * to nothing it embeds in turn. The browser still prompts the user.
 */
export const IFRAME_PERMISSIONS = 'camera; microphone'

/** A hand-typed `$chatId` can be arbitrarily long; only this much is echoed back. */
const MAX_SHOWN_POSITION_LENGTH = 32

/** The height reserved for the frame: the viewport, less the app header and this page's chrome. */
const FRAME_HEIGHT = 'h-[calc(100vh-19rem)] min-h-[420px]'

/**
 * `/chat/$chatId` is registered in `routes.tsx` by the integrator, so the router's
 * generated parameter union does not know `chatId` while this feature stands on its own.
 * Widening to an index signature reads the segment without a cast and keeps working once
 * the route lands. The value is a bare index and is validated by `parseChatIndex`; it
 * never reaches a URL, a request, or the frame.
 */
export function ChatEmbedPage() {
  const params: Record<string, unknown> = useParams({ strict: false })
  const chatId = typeof params.chatId === 'string' ? params.chatId : ''
  return <ChatEmbedView chatId={chatId} />
}

export function ChatEmbedView(props: { chatId: string }) {
  const { t } = useTranslation()
  const catalogue = useChatPresets()
  const [detailsOpen, setDetailsOpen] = useState(false)

  const index = parseChatIndex(props.chatId)
  const preset = index === null ? undefined : findChatPreset(catalogue.presets, index)
  const isWeb = preset?.kind === 'web'
  const needsKey = preset !== undefined && isWeb && presetRequiresApiKey(preset.template)

  const keyQuery = useQuery({ ...activeChatKeyQuery(), enabled: needsKey })
  const activeKey = keyQuery.data ?? null

  const urlResult = useMemo<ChatUrlResult | null>(() => {
    if (preset === undefined || preset.kind !== 'web') return null
    if (needsKey && activeKey === null) return null
    return buildChatUrl({
      apiKey: needsKey && activeKey !== null ? activeKey.secret : undefined,
      serverAddress: catalogue.serverAddress,
      template: preset.template,
    })
  }, [activeKey, catalogue.serverAddress, needsKey, preset])

  if (catalogue.isPending) {
    return (
      <ChatPageFrame title={t('Chat')}>
        <Skeleton className="h-96" label={t('Loading chat clients')} variant="block" />
      </ChatPageFrame>
    )
  }

  if (catalogue.isError) {
    return (
      <ChatPageFrame title={t('Chat')}>
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
      <ChatPageFrame title={t('Chat')}>
        <NoPresetsState />
      </ChatPageFrame>
    )
  }

  if (preset === undefined) {
    return (
      <ChatPageFrame
        description={t(
          'The address ends in a position that this gateway has no chat client for. Pick one of the configured clients below.',
        )}
        title={t('Chat client not found')}
      >
        <Alert
          title={t('Nothing is configured at position {{position}}', {
            position: props.chatId.slice(0, MAX_SHOWN_POSITION_LENGTH),
          })}
          tone="warning"
        >
          <p>
            {t('Chat clients are numbered from 0. This gateway currently has {{total}} of them.', {
              total: catalogue.presets.length,
            })}
          </p>
        </Alert>
        <PresetDirectory presets={catalogue.presets} />
        <div>
          <Button render={<Link to="/dashboard" />} variant="outline">
            {t('Back to dashboard')}
          </Button>
        </div>
      </ChatPageFrame>
    )
  }

  if (!isWeb) {
    return <ExternalClientState preset={preset} presets={catalogue.presets} />
  }

  if (needsKey && keyQuery.isPending) {
    return (
      <ChatPageFrame title={preset.name}>
        <Skeleton className="h-96" label={t('Preparing your chat link')} variant="block" />
      </ChatPageFrame>
    )
  }

  if (needsKey && keyQuery.isError) {
    return (
      <ChatPageFrame title={preset.name}>
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
      <ChatPageFrame title={preset.name}>
        <NoEnabledKeyState />
      </ChatPageFrame>
    )
  }

  if (urlResult === null || !urlResult.ok) {
    return (
      <ChatPageFrame title={preset.name}>
        <Alert title={t('This chat client is misconfigured')} tone="destructive">
          <p>{urlResult === null ? t('The console could not build an address for this client.') : rejectionMessage(urlResult.reason, t)}</p>
        </Alert>
        <PresetDirectory currentIndex={preset.index} presets={catalogue.presets} />
      </ChatPageFrame>
    )
  }

  const substituted = substitutedPlaceholders(preset.template)
  const details: DescriptionListItem[] = [
    { description: <span className="mono">{preset.index}</span>, term: t('Position') },
    { description: <span className="mono">{urlResult.origin}</span>, term: t('Client origin') },
    {
      description:
        substituted.length === 0 ? (
          t('None')
        ) : (
          <span className="flex flex-wrap justify-end gap-1.5">
            {substituted.map((token) => (
              <Badge key={token} size="sm">
                <span className="mono">{token}</span>
              </Badge>
            ))}
          </span>
        ),
      term: t('Placeholders filled in'),
    },
    { description: <span className="mono break-all">{IFRAME_SANDBOX}</span>, term: t('Frame sandbox') },
    {
      description: <span className="mono">{IFRAME_REFERRER_POLICY}</span>,
      term: t('Referrer policy'),
    },
  ]

  if (activeKey !== null) {
    details.splice(2, 0, {
      description: (
        <span className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-sm">{activeKey.name}</span>
          <MaskedValue
            copyLabel={t('Copy API key')}
            copyable
            hideLabel={t('Hide API key')}
            showLabel={t('Show API key')}
            size="sm"
            value={activeKey.secret}
          />
        </span>
      ),
      term: t('Signed in with'),
    })
  }

  return (
    <ChatPageFrame
      status={
        <Badge tone="success">
          <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
          {t('Sandboxed frame')}
        </Badge>
      }
      title={preset.name}
    >
      <Panel className="overflow-hidden">
        <Collapsible onOpenChange={setDetailsOpen} open={detailsOpen}>
          <Panel.Header
            actions={
              <Collapsible.Trigger render={<Button size="sm" variant="outline" />}>
                {detailsOpen ? t('Hide connection details') : t('Connection details')}
              </Collapsible.Trigger>
            }
            description={t('Served from {{origin}}', { origin: urlResult.origin })}
            icon={<MessagesSquareIcon aria-hidden="true" />}
            title={t('Chat client')}
          />
          <Collapsible.Panel>
            <Panel.Body>
              <DescriptionList items={details} label={t('Connection details')} />
              <p className="mt-4 text-xs leading-5 text-muted">
                {t(
                  'Built in this browser: CHAT_TEMPLATE, the address an administrator configured, with {{keyToken}} replaced by your API key and {{addressToken}} replaced by SERVER_ADDRESS from the gateway status. Nothing from the page address is used, and the console refuses any template whose own origin is not written out in full.',
                  { addressToken: ADDRESS_PLACEHOLDER, keyToken: KEY_PLACEHOLDER },
                )}
              </p>
            </Panel.Body>
          </Collapsible.Panel>
        </Collapsible>
        <Panel.Body className={FRAME_HEIGHT} padded={false}>
          <iframe
            allow={IFRAME_PERMISSIONS}
            className="h-full w-full border-0"
            key={urlResult.url}
            referrerPolicy={IFRAME_REFERRER_POLICY}
            sandbox={IFRAME_SANDBOX}
            src={urlResult.url}
            title={t('{{name}} chat client', { name: preset.name })}
          />
        </Panel.Body>
      </Panel>
    </ChatPageFrame>
  )
}

/**
 * A preset whose template is a desktop-app protocol (`cherrystudio://`, `opencat://`) or the
 * 流畅阅读 extension bridge. It is shown, not launched: handing the browser a non-http(s)
 * URL that carries the user's API key is exactly the navigation this console refuses.
 */
function ExternalClientState(props: { preset: ChatPreset; presets: readonly ChatPreset[] }) {
  const { t } = useTranslation()
  const scheme = presetScheme(props.preset.template)

  return (
    <ChatPageFrame title={props.preset.name}>
      <Alert
        icon={<ExternalLinkIcon aria-hidden="true" />}
        title={t('{{name}} runs outside the browser', { name: props.preset.name })}
        tone="info"
      >
        <p>
          {scheme === null
            ? t('This client is launched by a browser extension rather than opened as a web page, so it cannot be embedded here.')
            : t('This client opens through the {{scheme}}: protocol handler on your computer rather than as a web page, so it cannot be embedded here.', {
                scheme,
              })}
        </p>
        <p className="mt-2">
          {t('The console only opens http and https addresses, and it will not hand your API key to any other kind of link.')}
        </p>
      </Alert>
      <PresetDirectory currentIndex={props.preset.index} presets={props.presets} />
    </ChatPageFrame>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']

function rejectionMessage(reason: ChatUrlRejection, t: Translate): string {
  if (reason === 'template-not-a-url') {
    return t('An administrator configured this client with something that is not a valid web address.')
  }
  if (reason === 'unsupported-scheme') {
    return t('This client does not use http or https, so the console will not open it.')
  }
  if (reason === 'resolved-not-a-url') {
    return t('Filling in the placeholders produced an address the browser cannot read.')
  }
  return t('This client puts a placeholder inside its own web address, so the console cannot tell where your API key would be sent. It was not sent.')
}

