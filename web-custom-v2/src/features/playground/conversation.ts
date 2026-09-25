import { MAX_STORED_MESSAGES } from '@/features/playground/constants'
import type {
  ChatCompletionMessage,
  ChatCompletionRequest,
  ParameterEnabled,
  PlaygroundConfig,
  PlaygroundMessage,
} from '@/features/playground/types'

/**
 * Pure transcript operations. Everything here takes a message list and returns a new
 * one, so the reducer in `use-playground-chat` stays trivial and these stay testable
 * without a DOM.
 */

let fallbackIdCounter = 0

/** `crypto.randomUUID` where available; a counter elsewhere. Ids are local-only keys. */
export function createId(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID()
  fallbackIdCounter += 1
  return `pg-${Date.now().toString(36)}-${fallbackIdCounter}`
}

export function createUserMessage(content: string, now = Date.now()): PlaygroundMessage {
  return {
    content,
    createdAt: now,
    id: createId(),
    reasoning: '',
    role: 'user',
    status: 'complete',
  }
}

export function createPendingAssistantMessage(model: string, now = Date.now()): PlaygroundMessage {
  return {
    content: '',
    createdAt: now,
    id: createId(),
    model,
    reasoning: '',
    role: 'assistant',
    startedAt: now,
    status: 'loading',
  }
}

export function updateMessage(
  messages: PlaygroundMessage[],
  id: string,
  patch: (message: PlaygroundMessage) => PlaygroundMessage,
): PlaygroundMessage[] {
  return messages.map((message) => (message.id === id ? patch(message) : message))
}

export function removeMessage(
  messages: PlaygroundMessage[],
  id: string,
): PlaygroundMessage[] {
  return messages.filter((message) => message.id !== id)
}

/**
 * Truncates back to just before `id` so the turn can be re-run.
 *
 * Regenerating an ASSISTANT message drops it and everything after it, keeping the user
 * turn that prompted it. Regenerating a USER message keeps that turn and drops what
 * followed. Returns null when the id is unknown.
 */
export function truncateForRetry(
  messages: PlaygroundMessage[],
  id: string,
): PlaygroundMessage[] | null {
  const index = messages.findIndex((message) => message.id === id)
  if (index === -1) return null

  return messages[index].role === 'user'
    ? messages.slice(0, index + 1)
    : messages.slice(0, index)
}

/**
 * Applies an edit to one message.
 *
 * When `resend` is set on a user turn, everything after it is dropped so the
 * conversation can continue from the edited text.
 */
export function applyEdit(
  messages: PlaygroundMessage[],
  id: string,
  content: string,
  resend: boolean,
): { messages: PlaygroundMessage[]; shouldSend: boolean } | null {
  const index = messages.findIndex((message) => message.id === id)
  if (index === -1) return null

  const edited = updateMessage(messages, id, (message) => ({ ...message, content }))
  if (!resend || edited[index].role !== 'user') {
    return { messages: edited, shouldSend: false }
  }

  return { messages: edited.slice(0, index + 1), shouldSend: true }
}

/**
 * Whether a message should be sent upstream.
 *
 * Drops the empty assistant placeholder that is on screen while a request is in flight,
 * and any turn that failed — replaying an error message back to the model as if it were
 * an answer would poison the next turn.
 */
export function isSendableMessage(message: PlaygroundMessage): boolean {
  if (message.status === 'error') return false
  if (message.role === 'assistant' && message.content.trim() === '') return false
  return message.content.trim() !== ''
}

/**
 * Builds the relay payload.
 *
 * A non-empty system prompt is prepended as a `system` turn — verified against the dev
 * server, which forwards `{"role":"system"}` through to the upstream untouched.
 *
 * Parameters are included only when their toggle is on, matching the legacy behaviour:
 * some upstreams reject `max_tokens` or `seed` outright, so they stay off by default.
 */
export function buildPayload(
  messages: PlaygroundMessage[],
  systemPrompt: string,
  config: PlaygroundConfig,
  enabled: ParameterEnabled,
): ChatCompletionRequest {
  const history: ChatCompletionMessage[] = messages
    .filter(isSendableMessage)
    .map((message) => ({ content: message.content, role: message.role }))

  const trimmedSystem = systemPrompt.trim()
  const payload: ChatCompletionRequest = {
    group: config.group,
    messages: trimmedSystem === ''
      ? history
      : [{ content: trimmedSystem, role: 'system' }, ...history],
    model: config.model,
    stream: config.stream,
  }

  if (enabled.temperature) payload.temperature = config.temperature
  if (enabled.top_p) payload.top_p = config.top_p
  if (enabled.max_tokens) payload.max_tokens = config.max_tokens
  if (enabled.frequency_penalty) payload.frequency_penalty = config.frequency_penalty
  if (enabled.presence_penalty) payload.presence_penalty = config.presence_penalty
  if (enabled.seed && config.seed !== null) payload.seed = config.seed

  return payload
}

/** Keeps the persisted transcript bounded, newest turns first to be dropped last. */
export function capMessages(messages: PlaygroundMessage[]): PlaygroundMessage[] {
  return messages.length <= MAX_STORED_MESSAGES
    ? messages
    : messages.slice(messages.length - MAX_STORED_MESSAGES)
}

/**
 * Picks the model to use when the stored one is not offered by the selected group.
 * Returns null when the current choice is still valid or nothing is available.
 */
export function resolveModel(models: string[], current: string): string | null {
  if (models.length === 0) return null
  if (models.includes(current)) return null
  return models[0]
}

/** Same idea for groups, preferring `default` over an arbitrary first entry. */
export function resolveGroup(groups: string[], current: string): string | null {
  if (groups.length === 0) return null
  if (groups.includes(current)) return null
  return groups.includes('default') ? 'default' : groups[0]
}
