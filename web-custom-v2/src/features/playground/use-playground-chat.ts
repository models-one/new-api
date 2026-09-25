import { useCallback, useEffect, useRef, useState } from 'react'

import {
  RelayRequestError,
  isAbortError,
  sendCompletion,
  streamCompletion,
  type ChatTransport,
} from '@/features/playground/chat-stream'
import { STREAM_FLUSH_MS } from '@/features/playground/constants'
import {
  buildPayload,
  capMessages,
  createPendingAssistantMessage,
  createUserMessage,
  updateMessage,
} from '@/features/playground/conversation'
import type {
  CompletionUsage,
  ParameterEnabled,
  PlaygroundConfig,
  PlaygroundMessage,
  RelayError,
} from '@/features/playground/types'

type UsePlaygroundChatOptions = {
  config: PlaygroundConfig
  parameterEnabled: ParameterEnabled
  systemPrompt: string
  messages: PlaygroundMessage[]
  setMessages: (updater: (previous: PlaygroundMessage[]) => PlaygroundMessage[]) => void
  transport: ChatTransport
}

/**
 * Runs one generation at a time against `/pg/chat/completions`.
 *
 * Two mechanisms keep a cancelled or superseded request from writing into the
 * transcript after the fact:
 *
 *   1. An `AbortController` that is genuinely passed to `fetch`, so stopping really
 *      severs the socket instead of only hiding the output. The upstream stops
 *      generating, and stops billing.
 *   2. A monotonically increasing `runId`. Every callback checks it before touching
 *      state, so a straggling delta from an aborted run — one already decoded and
 *      queued as a microtask when the abort landed — cannot resurrect a finished turn.
 *
 * Deltas are accumulated in a ref and flushed on a timer rather than setting state per
 * token: a fast stream otherwise re-renders the whole transcript hundreds of times.
 */
export function usePlaygroundChat(options: UsePlaygroundChatOptions) {
  const { config, messages, parameterEnabled, setMessages, systemPrompt, transport } = options

  const [isGenerating, setIsGenerating] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bufferRef = useRef({ content: '', reasoning: '', runId: 0, targetId: '' })

  // Callbacks below are recreated on every render; refs keep the live values without
  // making `send` change identity and re-trigger effects in the components using it.
  const configRef = useRef(config)
  const enabledRef = useRef(parameterEnabled)
  const systemRef = useRef(systemPrompt)
  const transportRef = useRef(transport)
  configRef.current = config
  enabledRef.current = parameterEnabled
  systemRef.current = systemPrompt
  transportRef.current = transport

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current === null) return
    clearTimeout(flushTimerRef.current)
    flushTimerRef.current = null
  }, [])

  /** Writes buffered deltas into the pending message. No-op for a superseded run. */
  const flush = useCallback(() => {
    clearFlushTimer()
    const buffer = bufferRef.current
    if (buffer.runId !== runIdRef.current) return
    if (buffer.content === '' && buffer.reasoning === '') return

    const { content, reasoning, targetId } = buffer
    bufferRef.current = { ...buffer, content: '', reasoning: '' }

    setMessages((previous) =>
      updateMessage(previous, targetId, (message) => ({
        ...message,
        content: message.content + content,
        reasoning: message.reasoning + reasoning,
        status: 'streaming',
      })),
    )
  }, [clearFlushTimer, setMessages])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = setTimeout(flush, STREAM_FLUSH_MS)
  }, [flush])

  useEffect(
    () => () => {
      // Unmounting must abort in flight work, or the fetch outlives the page.
      runIdRef.current += 1
      clearFlushTimer()
      abortRef.current?.abort()
      abortRef.current = null
    },
    [clearFlushTimer],
  )

  const finish = useCallback(
    (runId: number, targetId: string, patch: Partial<PlaygroundMessage>) => {
      if (runId !== runIdRef.current) return
      flush()
      setIsGenerating(false)
      abortRef.current = null
      setMessages((previous) =>
        updateMessage(previous, targetId, (message) => ({
          ...message,
          completedAt: Date.now(),
          ...patch,
        })),
      )
    },
    [flush, setMessages],
  )

  /**
   * Starts a generation against `history`, appending the pending assistant turn.
   * Callers pass the history explicitly because they have just derived it (a new user
   * turn, a truncation for retry) and React state has not caught up yet.
   */
  const run = useCallback(
    (history: PlaygroundMessage[]) => {
      const activeConfig = configRef.current
      const runId = runIdRef.current + 1
      runIdRef.current = runId

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const pending = createPendingAssistantMessage(activeConfig.model)
      bufferRef.current = { content: '', reasoning: '', runId, targetId: pending.id }
      clearFlushTimer()
      setIsGenerating(true)
      setMessages(() => capMessages([...history, pending]))

      const payload = buildPayload(
        history,
        systemRef.current,
        activeConfig,
        enabledRef.current,
      )

      const applyUsage = (usage: CompletionUsage) => {
        if (runId !== runIdRef.current) return
        setMessages((previous) =>
          updateMessage(previous, pending.id, (message) => ({ ...message, usage })),
        )
      }

      const fail = (error: RelayError) => {
        finish(runId, pending.id, { error, status: 'error' })
      }

      const request = activeConfig.stream
        ? streamCompletion(
            payload,
            {
              onDelta: (part) => {
                if (runId !== runIdRef.current) return
                const buffer = bufferRef.current
                if (buffer.runId !== runId) return
                buffer.content += part.content ?? ''
                buffer.reasoning += part.reasoning ?? ''
                scheduleFlush()
              },
              onUsage: applyUsage,
            },
            controller.signal,
            transportRef.current,
          ).then(() => {
            finish(runId, pending.id, { status: 'complete' })
          })
        : sendCompletion(payload, controller.signal, transportRef.current).then((result) => {
            if (runId !== runIdRef.current) return
            if (result.usage) applyUsage(result.usage)
            finish(runId, pending.id, {
              content: result.content,
              reasoning: result.reasoning,
              status: 'complete',
            })
          })

      request.catch((error: unknown) => {
        // An abort is a user action, and `stop` has already settled the message.
        if (isAbortError(error) || controller.signal.aborted) return
        if (runId !== runIdRef.current) return

        fail(
          error instanceof RelayRequestError
            ? error.detail
            : {
                code: 'network_error',
                message:
                  error instanceof Error
                    ? error.message
                    : 'The request could not reach the server.',
                type: 'client_error',
              },
        )
      })
    },
    [clearFlushTimer, finish, scheduleFlush, setMessages],
  )

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (trimmed === '') return
      run([...messages, createUserMessage(trimmed)])
    },
    [messages, run],
  )

  /**
   * Aborts the socket and settles the pending turn.
   *
   * Whatever already streamed is kept: partial output the user chose to stop is still
   * output, and throwing it away would be surprising. The turn is marked `aborted` so
   * the transcript says why it is short.
   */
  const stop = useCallback(() => {
    const stoppedRunId = runIdRef.current
    if (stoppedRunId === 0) return

    flush()
    const targetId = bufferRef.current.targetId
    runIdRef.current = stoppedRunId + 1
    clearFlushTimer()
    abortRef.current?.abort()
    abortRef.current = null
    setIsGenerating(false)

    if (targetId === '') return
    setMessages((previous) =>
      updateMessage(previous, targetId, (message) =>
        message.status === 'loading' || message.status === 'streaming'
          ? { ...message, completedAt: Date.now(), status: 'aborted' }
          : message,
      ),
    )
  }, [clearFlushTimer, flush, setMessages])

  return { isGenerating, run, send, stop }
}
