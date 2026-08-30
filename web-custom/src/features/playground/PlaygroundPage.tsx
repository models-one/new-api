import { useQuery } from '@tanstack/react-query'
import MessagesSquareIcon from 'lucide-react/dist/esm/icons/messages-square'
import SlidersIcon from 'lucide-react/dist/esm/icons/sliders-horizontal'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/overlay'
import { EmptyState } from '@/components/system/EmptyState'
import { Alert, Badge, Button, PageHeader, Panel, Skeleton } from '@/components/ui'
import { Composer } from '@/features/playground/components/Composer'
import { MessageTurn } from '@/features/playground/components/MessageTurn'
import { ParameterPanel } from '@/features/playground/components/ParameterPanel'
import { playgroundModelsQuery } from '@/features/playground/api'
import {
  DEFAULT_CONFIG,
  DEFAULT_PARAMETER_ENABLED,
} from '@/features/playground/constants'
import {
  applyEdit,
  capMessages,
  removeMessage,
  resolveGroup,
  resolveModel,
  truncateForRetry,
} from '@/features/playground/conversation'
import type { ParameterKey } from '@/features/playground/parameters'
import {
  loadConfig,
  loadMessages,
  loadParameterEnabled,
  loadSystemPrompt,
  saveConfig,
  saveMessages,
  saveParameterEnabled,
  saveSystemPrompt,
} from '@/features/playground/storage'
import type {
  ParameterEnabled,
  PlaygroundConfig,
  PlaygroundGroup,
  PlaygroundMessage,
} from '@/features/playground/types'
import { usePlaygroundChat } from '@/features/playground/use-playground-chat'
import { selfUserQuery, userGroupsQuery } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

/**
 * The model playground.
 *
 * Sends to `/pg/chat/completions`, which `router/relay-router.go` mounts behind
 * `middleware.UserAuth()`. `controller/playground.go` mints a temporary
 * `model.Token` for the signed-in user, so this page needs NO API key of the user's
 * own — which is why there is no "create a key first" empty state here.
 */
export function PlaygroundPage() {
  const { t } = useTranslation()
  const accessToken = useAuthStore((state) => state.auth.accessToken)

  const [config, setConfig] = useState<PlaygroundConfig>(loadConfig)
  const [parameterEnabled, setParameterEnabled] =
    useState<ParameterEnabled>(loadParameterEnabled)
  const [systemPrompt, setSystemPrompt] = useState<string>(loadSystemPrompt)
  const [messages, setMessagesState] = useState<PlaygroundMessage[]>(loadMessages)
  const [confirmClear, setConfirmClear] = useState(false)

  const selfQuery = useQuery(selfUserQuery())
  const groupsQuery = useQuery(userGroupsQuery())
  const modelsQuery = useQuery(playgroundModelsQuery(config.group))

  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  const setMessages = useCallback(
    (updater: (previous: PlaygroundMessage[]) => PlaygroundMessage[]) => {
      setMessagesState((previous) => {
        const next = capMessages(updater(previous))
        saveMessages(next)
        return next
      })
    },
    [],
  )

  const updateConfig = useCallback(
    <K extends keyof PlaygroundConfig>(key: K, value: PlaygroundConfig[K]) => {
      setConfig((previous) => {
        const next = { ...previous, [key]: value }
        saveConfig(next)
        return next
      })
    },
    [],
  )

  const transport = useMemo(() => ({ accessToken }), [accessToken])

  const { isGenerating, run, send, stop } = usePlaygroundChat({
    config,
    messages,
    parameterEnabled,
    setMessages,
    systemPrompt,
    transport,
  })

  const groups: PlaygroundGroup[] = useMemo(() => {
    const data = groupsQuery.data
    if (!data) return []
    return Object.entries(data).map(([value, info]) => ({
      desc: info.desc,
      ratio: info.ratio,
      value,
    }))
  }, [groupsQuery.data])

  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data])

  // Keep the stored group/model valid: a group can disappear and a model can stop being
  // offered by the selected group, and a stale choice would fail at the relay.
  useEffect(() => {
    if (groups.length === 0) return
    const fallback = resolveGroup(groups.map((group) => group.value), config.group)
    if (fallback !== null) updateConfig('group', fallback)
  }, [config.group, groups, updateConfig])

  useEffect(() => {
    if (modelsQuery.isPending) return
    const fallback = resolveModel(models, config.model)
    if (fallback !== null) updateConfig('model', fallback)
    else if (models.length === 0 && config.model !== '') updateConfig('model', '')
  }, [config.model, models, modelsQuery.isPending, updateConfig])

  useEffect(() => {
    // Guarded: `scrollIntoView` is absent in jsdom and in older embedded webviews, and
    // following the transcript is a nicety that must never break the page.
    const end = transcriptEndRef.current
    if (typeof end?.scrollIntoView === 'function') end.scrollIntoView({ block: 'end' })
  }, [messages])

  const handleRegenerate = useCallback(
    (id: string) => {
      const history = truncateForRetry(messages, id)
      if (!history) return
      run(history)
    },
    [messages, run],
  )

  const handleEdit = useCallback(
    (id: string, content: string, resend: boolean) => {
      const result = applyEdit(messages, id, content, resend)
      if (!result) return
      if (result.shouldSend) run(result.messages)
      else setMessages(() => result.messages)
    },
    [messages, run, setMessages],
  )

  const handleDelete = useCallback(
    (id: string) => {
      setMessages((previous) => removeMessage(previous, id))
    },
    [setMessages],
  )

  const clearConversation = () => {
    setMessages(() => [])
    setConfirmClear(false)
  }

  const resetParameters = () => {
    setParameterEnabled(DEFAULT_PARAMETER_ENABLED)
    saveParameterEnabled(DEFAULT_PARAMETER_ENABLED)
    setConfig((previous) => {
      const next = { ...DEFAULT_CONFIG, group: previous.group, model: previous.model }
      saveConfig(next)
      return next
    })
  }

  const updateParameterEnabled = (key: ParameterKey, value: boolean) => {
    setParameterEnabled((previous) => {
      const next = { ...previous, [key]: value }
      saveParameterEnabled(next)
      return next
    })
  }

  const updateSystemPrompt = (value: string) => {
    setSystemPrompt(value)
    saveSystemPrompt(value)
  }

  const groupRatio = groups.find((group) => group.value === config.group)?.ratio

  // An empty group is a different situation from an empty conversation, and the
  // seeded instance shows the first one, so both get a real state of their own.
  const hasNoModels = models.length === 0
  const emptyTitle = hasNoModels ? t('No models in this group') : t('No messages yet')
  const emptyDescription = hasNoModels
    ? t('The selected billing group offers no models, so there is nothing to send a prompt to yet. An administrator has to add a channel for this group.')
    : t('Nothing has been sent yet. Type a prompt below to start a conversation.')

  // Loading, error, empty and populated, resolved up front so the JSX below stays flat.
  let transcript
  if (modelsQuery.isPending) {
    transcript = (
      <div className="flex flex-col gap-3">
        <Skeleton label={t('Loading the playground')} lines={2} />
        <Skeleton height={64} variant="block" />
        <Skeleton lines={2} />
        <Skeleton height={96} variant="block" />
      </div>
    )
  } else if (modelsQuery.isError) {
    transcript = (
      <Alert
        action={
          <Button onClick={() => void modelsQuery.refetch()} size="sm" variant="outline">
            {t('Retry')}
          </Button>
        }
        title={t('Models unavailable')}
        tone="destructive"
      >
        <p className="text-sm leading-6">
          {t('The models available to this billing group could not be loaded.')}
        </p>
      </Alert>
    )
  } else if (messages.length === 0) {
    transcript = (
      <EmptyState description={emptyDescription} headingLevel={3} title={emptyTitle} />
    )
  } else {
    transcript = (
      <div className="flex flex-col gap-6">
        {messages.map((message) => (
          <MessageTurn
            isGenerating={isGenerating}
            key={message.id}
            message={message}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onRegenerate={handleRegenerate}
            role={selfQuery.data?.role}
          />
        ))}
        <div ref={transcriptEndRef} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description={t('Send a prompt to any model your billing group can reach, and read the reply as it streams.')}
        eyebrow={t('Playground')}
        status={
          groupRatio === undefined ? null : (
            <Badge tone="muted">
              {t('Group rate')}
              {': '}
              <span className="mono">{groupRatio}×</span>
            </Badge>
          )
        }
        title={t('Model playground')}
      />

      {groupsQuery.isError ? (
        <Alert
          action={
            <Button onClick={() => void groupsQuery.refetch()} size="sm" variant="outline">
              {t('Retry')}
            </Button>
          }
          title={t('Billing groups unavailable')}
          tone="destructive"
        >
          <p className="text-sm leading-6">
            {t('The list of billing groups could not be loaded, so only the last used group is available.')}
          </p>
        </Alert>
      ) : null}

      <div className="grid min-h-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label={t('Conversation')} className="flex min-w-0 flex-col gap-4">
          <Panel className="flex min-h-[24rem] flex-col">
            <Panel.Header
              headingLevel={2}
              icon={<MessagesSquareIcon aria-hidden="true" className="text-muted" />}
              title={t('Conversation')}
              description={
                messages.length === 0
                  ? undefined
                  : t('{{count}} messages', { count: messages.length })
              }
            />

            <Panel.Body className="flex-1" scroll>
              {transcript}
            </Panel.Body>
          </Panel>

          <Composer
            disabled={models.length === 0 || config.model === ''}
            group={config.group}
            groups={groups}
            hasMessages={messages.length > 0}
            isGenerating={isGenerating}
            isLoadingModels={modelsQuery.isPending}
            model={config.model}
            models={models}
            onClear={() => setConfirmClear(true)}
            onGroupChange={(group) => updateConfig('group', group)}
            onModelChange={(model) => updateConfig('model', model)}
            onStop={stop}
            onSubmit={send}
          />
        </section>

        <aside aria-label={t('Request settings')} className="flex min-w-0 flex-col gap-4">
          <Alert
            icon={<SlidersIcon aria-hidden="true" />}
            title={t('Billed like any other request')}
            tone="info"
          >
            <p className="text-xs leading-5">
              {t('Playground requests run through the same relay and are charged to your balance at the selected group’s rate.')}
            </p>
          </Alert>

          <ParameterPanel
            config={config}
            enabled={parameterEnabled}
            onConfigChange={updateConfig}
            onEnabledChange={updateParameterEnabled}
            onReset={resetParameters}
            onSystemPromptChange={updateSystemPrompt}
            systemPrompt={systemPrompt}
          />
        </aside>
      </div>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Clear conversation')}
        description={t('This removes every message in this conversation from your browser. It cannot be undone.')}
        destructive
        onConfirm={clearConversation}
        onOpenChange={setConfirmClear}
        open={confirmClear}
        title={t('Clear this conversation?')}
      />

      {/* Announces generation state to assistive tech without stealing focus. */}
      <p aria-live="polite" className="sr-only">
        {isGenerating ? t('The model is generating a reply.') : ''}
      </p>
    </div>
  )
}
