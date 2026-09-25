import { Link, useRouter } from '@tanstack/react-router'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import MessagesSquareIcon from 'lucide-react/dist/esm/icons/messages-square'
import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { ChatPreset, ChatPresetKind } from '@/features/chat/chat-presets'
import { EmptyState } from '@/components/system/EmptyState'
import { Alert, Badge, Button, PageHeader, Panel } from '@/components/ui'
import type { Tone } from '@/components/ui/tone'

/** The console's key manager, which the sidebar labels "API Keys". */
export const API_KEYS_PATH = '/settings'

type ChatPageFrameProps = {
  title: string
  description?: string
  status?: ReactNode
  children: ReactNode
}

/** Shared chrome for every state of both chat routes, embed included. */
export function ChatPageFrame(props: ChatPageFrameProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description={props.description}
        eyebrow={t('Embedded chat')}
        status={props.status}
        title={props.title}
      />
      {props.children}
    </div>
  )
}

const kindTone: Record<ChatPresetKind, Tone> = {
  'custom-protocol': 'muted',
  fluent: 'muted',
  web: 'success',
}

function KindBadge(props: { kind: ChatPresetKind }) {
  const { t } = useTranslation()

  const label: Record<ChatPresetKind, string> = {
    'custom-protocol': t('Desktop app'),
    fluent: t('Browser extension'),
    web: t('Embeddable'),
  }

  return (
    <Badge size="sm" tone={kindTone[props.kind]}>
      {label[props.kind]}
    </Badge>
  )
}

/**
 * The operator's list, by index, so a visitor who typed the wrong number can see what the
 * right ones are. Only names and indices are shown — never a template, which may contain
 * the `{key}` placeholder and, once resolved, the user's secret.
 *
 * Real anchors carrying a real `href`, so middle-click and "open in new tab" behave; a
 * plain left click is intercepted and pushed through the router's history instead, which
 * keeps the navigation client-side. `<Link to="/chat/$chatId">` is not usable here yet:
 * the route is registered in `routes.tsx` by the integrator, so the router's generated
 * path union does not contain it while this feature stands on its own. `history.push`
 * takes an ordinary string and needs no such registration.
 */
export function PresetDirectory(props: { presets: readonly ChatPreset[]; currentIndex?: number }) {
  const { t } = useTranslation()
  const router = useRouter()

  const openPreset = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    // Leave modified and non-primary clicks to the browser.
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    if (event.defaultPrevented || modified || event.button !== 0) return
    event.preventDefault()
    router.history.push(path)
  }

  if (props.presets.length === 0) return null

  return (
    <Panel>
      <Panel.Header
        description={t('Set by an administrator in the chat settings.')}
        headingLevel={2}
        icon={<MessagesSquareIcon aria-hidden="true" />}
        title={t('Configured chat clients')}
      />
      <Panel.Body>
        <nav aria-label={t('Configured chat clients')}>
          <ul className="flex flex-col gap-2">
            {props.presets.map((preset) => (
              <li key={preset.index}>
                <a
                  aria-current={preset.index === props.currentIndex ? 'page' : undefined}
                  className="flex min-h-10 items-center justify-between gap-3 rounded-[4px] border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-high"
                  href={`/chat/${preset.index}`}
                  onClick={(event) => openPreset(event, `/chat/${preset.index}`)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="mono shrink-0 text-xs text-muted">{preset.index}</span>
                    <span className="truncate">{preset.name}</span>
                  </span>
                  <KindBadge kind={preset.kind} />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Panel.Body>
    </Panel>
  )
}

/** Shown when the operator has configured no presets at all — the seeded default is not empty. */
export function NoPresetsState() {
  const { t } = useTranslation()

  return (
    <Panel>
      <EmptyState
        description={t(
          'An administrator has not published any chat clients for this gateway yet. Once one is configured it appears here and in the chat menu.',
        )}
        headingLevel={2}
        title={t('No chat clients configured')}
      />
    </Panel>
  )
}

/** The account has no key in the `enabled` state, so no preset can be signed in. */
export function NoEnabledKeyState() {
  const { t } = useTranslation()

  return (
    <Panel>
      <EmptyState
        action={
          <Button render={<Link to={API_KEYS_PATH} />}>
            <KeyRoundIcon aria-hidden="true" />
            {t('Go to API keys')}
          </Button>
        }
        description={t(
          'This chat client signs in with one of your API keys, and none of your keys is currently enabled. Create a key, or re-enable an existing one, and come back.',
        )}
        headingLevel={2}
        title={t('No enabled API key')}
      />
    </Panel>
  )
}

/** The key lookup itself failed — a transport or permission problem, not an empty account. */
export function KeyLookupFailedState(props: { message: string; onRetry: () => void; retrying: boolean }) {
  const { t } = useTranslation()

  return (
    <Alert
      action={
        <>
          <Button aria-busy={props.retrying} disabled={props.retrying} onClick={props.onRetry} size="sm">
            {t('Try again')}
          </Button>
          <Button render={<Link to={API_KEYS_PATH} />} size="sm" variant="outline">
            {t('Go to API keys')}
          </Button>
        </>
      }
      title={t('Could not load your API key')}
      tone="destructive"
    >
      <p>{props.message}</p>
    </Alert>
  )
}
