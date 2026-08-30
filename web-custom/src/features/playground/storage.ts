import {
  DEFAULT_CONFIG,
  DEFAULT_PARAMETER_ENABLED,
  STORAGE_KEYS,
} from '@/features/playground/constants'
import { capMessages } from '@/features/playground/conversation'
import type {
  ParameterEnabled,
  PlaygroundConfig,
  PlaygroundMessage,
} from '@/features/playground/types'

/**
 * Transcript and settings persistence.
 *
 * There is no server-side playground history — `/pg/chat/completions` is stateless and
 * no console endpoint stores conversations — so this is `localStorage` or nothing.
 * Every read is defensive: the stored value is user-editable and may be from an older
 * build, so anything unparseable falls back to the default rather than throwing on boot.
 * Every write is wrapped too, because storage throws in private mode and when the quota
 * is exceeded, and losing a transcript must never break the page.
 */

function readRaw(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // Private mode or quota exceeded. The session still works; it just will not persist.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

export function loadConfig(): PlaygroundConfig {
  const parsed = parseJson(readRaw(STORAGE_KEYS.config))
  if (!isRecord(parsed)) return DEFAULT_CONFIG

  // An empty group is never restored: `playgroundModelsQuery` is disabled while the
  // group is blank, which would leave the page on its loading skeleton forever if the
  // group list also failed to load and could not heal the choice.
  const storedGroup = stringOr(parsed.group, DEFAULT_CONFIG.group)

  return {
    frequency_penalty: numberOr(parsed.frequency_penalty, DEFAULT_CONFIG.frequency_penalty),
    group: storedGroup === '' ? DEFAULT_CONFIG.group : storedGroup,
    max_tokens: numberOr(parsed.max_tokens, DEFAULT_CONFIG.max_tokens),
    model: stringOr(parsed.model, DEFAULT_CONFIG.model),
    presence_penalty: numberOr(parsed.presence_penalty, DEFAULT_CONFIG.presence_penalty),
    seed: typeof parsed.seed === 'number' ? parsed.seed : null,
    stream: booleanOr(parsed.stream, DEFAULT_CONFIG.stream),
    temperature: numberOr(parsed.temperature, DEFAULT_CONFIG.temperature),
    top_p: numberOr(parsed.top_p, DEFAULT_CONFIG.top_p),
  }
}

export function saveConfig(config: PlaygroundConfig): void {
  writeRaw(STORAGE_KEYS.config, JSON.stringify(config))
}

export function loadParameterEnabled(): ParameterEnabled {
  const parsed = parseJson(readRaw(STORAGE_KEYS.parameters))
  if (!isRecord(parsed)) return DEFAULT_PARAMETER_ENABLED

  return {
    frequency_penalty: booleanOr(
      parsed.frequency_penalty,
      DEFAULT_PARAMETER_ENABLED.frequency_penalty,
    ),
    max_tokens: booleanOr(parsed.max_tokens, DEFAULT_PARAMETER_ENABLED.max_tokens),
    presence_penalty: booleanOr(
      parsed.presence_penalty,
      DEFAULT_PARAMETER_ENABLED.presence_penalty,
    ),
    seed: booleanOr(parsed.seed, DEFAULT_PARAMETER_ENABLED.seed),
    temperature: booleanOr(parsed.temperature, DEFAULT_PARAMETER_ENABLED.temperature),
    top_p: booleanOr(parsed.top_p, DEFAULT_PARAMETER_ENABLED.top_p),
  }
}

export function saveParameterEnabled(enabled: ParameterEnabled): void {
  writeRaw(STORAGE_KEYS.parameters, JSON.stringify(enabled))
}

const ROLES = new Set(['user', 'assistant', 'system'])

/**
 * Rehydrates one stored turn, or null when it is not recognisable.
 *
 * A message that was mid-flight when the tab closed is restored as `aborted`, never as
 * `loading` or `streaming` — nothing is going to arrive for it, and a spinner that never
 * resolves is worse than an honest "interrupted" marker.
 */
function parseMessage(value: unknown): PlaygroundMessage | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.role !== 'string') return null
  if (!ROLES.has(value.role)) return null
  if (typeof value.content !== 'string') return null

  const status = value.status
  const restored: PlaygroundMessage['status'] =
    status === 'complete' || status === 'error' || status === 'aborted'
      ? status
      : 'aborted'

  const usage = isRecord(value.usage)
    ? {
        completion_tokens: numberOr(value.usage.completion_tokens, 0),
        prompt_tokens: numberOr(value.usage.prompt_tokens, 0),
        total_tokens: numberOr(value.usage.total_tokens, 0),
      }
    : undefined

  const error = isRecord(value.error)
    ? {
        code: stringOr(value.error.code, ''),
        message: stringOr(value.error.message, ''),
        type: stringOr(value.error.type, ''),
      }
    : undefined

  return {
    content: value.content,
    createdAt: numberOr(value.createdAt, Date.now()),
    error,
    id: value.id,
    model: typeof value.model === 'string' ? value.model : undefined,
    reasoning: stringOr(value.reasoning, ''),
    role: value.role as PlaygroundMessage['role'],
    status: restored,
    usage,
  }
}

export function loadMessages(): PlaygroundMessage[] {
  const parsed = parseJson(readRaw(STORAGE_KEYS.messages))
  if (!Array.isArray(parsed)) return []

  const messages: PlaygroundMessage[] = []
  for (const entry of parsed) {
    const message = parseMessage(entry)
    if (message) messages.push(message)
  }
  return capMessages(messages)
}

export function saveMessages(messages: PlaygroundMessage[]): void {
  writeRaw(STORAGE_KEYS.messages, JSON.stringify(capMessages(messages)))
}

export function loadSystemPrompt(): string {
  return readRaw(STORAGE_KEYS.systemPrompt) ?? ''
}

export function saveSystemPrompt(prompt: string): void {
  writeRaw(STORAGE_KEYS.systemPrompt, prompt)
}
