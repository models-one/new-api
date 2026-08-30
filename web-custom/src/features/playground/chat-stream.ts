import { PLAYGROUND_ENDPOINT } from '@/features/playground/constants'
import { SseFrameParser, isDoneFrame } from '@/features/playground/sse'
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  CompletionUsage,
  RelayError,
} from '@/features/playground/types'

/**
 * WHY `fetch` AND NOT THE SHARED AXIOS CLIENT
 *
 * `src/lib/http-client.ts` has a response interceptor that treats ANY 401 as an expired
 * console session: it refreshes, and failing that clears auth and bounces to sign-in.
 * The relay returns 401 for a perfectly ordinary upstream failure — a channel whose
 * upstream API key is rejected, which is exactly what the seeded dev server does:
 *
 *   HTTP 401  {"error":{"message":"Incorrect API key provided: sk-probe",
 *                       "type":"invalid_request_error","code":"invalid_api_key"}}
 *
 * Routing the playground through axios would sign the user out of the console every time
 * a channel was misconfigured. So this module talks to `fetch` directly, sends the same
 * `Authorization: Bearer <console access token>` the interceptor would have added, and
 * translates failures into `RelayError` instead of into a logout.
 *
 * Axios also cannot stream a response body in the browser, and the abort requirement
 * needs a real `AbortController` on the socket rather than a UI-only stop.
 */

export type StreamCallbacks = {
  onDelta: (part: { content?: string; reasoning?: string }) => void
  onUsage: (usage: CompletionUsage) => void
}

export type ChatTransport = {
  accessToken: string | null
  /** Injectable for tests; defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch
}

/** Anything thrown out of this module that is not an abort is one of these. */
export class RelayRequestError extends Error {
  readonly detail: RelayError

  constructor(detail: RelayError) {
    super(detail.message)
    this.name = 'RelayRequestError'
    this.detail = detail
  }
}

const FALLBACK_ERROR: RelayError = {
  code: 'request_failed',
  message: 'The request failed before the model could answer.',
  type: 'client_error',
}

function buildHeaders(accessToken: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream, application/json',
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  return headers
}

/**
 * Pulls the relay's error envelope out of a body that may be JSON, may be an SSE frame
 * carrying JSON, or may be nothing at all.
 *
 * Verified shapes, all `{ error: { message, type, code } }`:
 *   400 model_price_error   "模型 x 的价格未配置..."
 *   400 invalid_request     "field messages is required"
 *   401 invalid_api_key     "Incorrect API key provided: sk-probe"
 *   503 model_not_found     "No available channel for model x under group default"
 *   ""                      "No permission to access this group"
 *
 * Note the streamed 401 arrives with `Content-Type: text/event-stream` but a bare JSON
 * body rather than a `data:` frame, so both framings are handled.
 */
export function parseRelayError(body: string, status?: number): RelayError {
  const text = body.trim()
  if (text === '') {
    return { ...FALLBACK_ERROR, status }
  }

  // Tolerate the error arriving inside an SSE frame.
  const payload = text.startsWith('data:') ? text.slice(text.indexOf(':') + 1).trim() : text

  try {
    const parsed: unknown = JSON.parse(payload)
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      const error = (parsed as { error: unknown }).error
      if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>
        const message = typeof record.message === 'string' ? record.message : ''
        return {
          code: typeof record.code === 'string' ? record.code : '',
          message: message === '' ? FALLBACK_ERROR.message : message,
          status,
          type: typeof record.type === 'string' ? record.type : '',
        }
      }
    }
  } catch {
    // Not JSON — fall through and surface the raw text, which is still more useful
    // than a generic message when a proxy returns an HTML error page.
  }

  return { code: '', message: payload.slice(0, 500), status, type: '' }
}

async function readErrorBody(response: Response): Promise<RelayError> {
  try {
    return parseRelayError(await response.text(), response.status)
  } catch {
    return { ...FALLBACK_ERROR, status: response.status }
  }
}

/** Applies one `data:` payload to the callbacks. Unknown frames are ignored, not fatal. */
export function applyChunk(data: string, callbacks: StreamCallbacks): void {
  let chunk: ChatCompletionChunk
  try {
    chunk = JSON.parse(data) as ChatCompletionChunk
  } catch {
    return
  }

  const delta = chunk.choices?.[0]?.delta
  if (delta) {
    const content = typeof delta.content === 'string' ? delta.content : ''
    const reasoning = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : ''
    if (content !== '' || reasoning !== '') {
      callbacks.onDelta({
        content: content === '' ? undefined : content,
        reasoning: reasoning === '' ? undefined : reasoning,
      })
    }
  }

  if (chunk.usage) callbacks.onUsage(chunk.usage)
}

/**
 * Streams a completion, invoking callbacks as frames arrive.
 *
 * Resolves when the stream ends. Rejects with `RelayRequestError` on a relay failure, or
 * with the signal's `AbortError` when the caller aborts — callers must distinguish the
 * two, because an abort is a user action and not an error to report.
 */
export async function streamCompletion(
  payload: ChatCompletionRequest,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
  transport: ChatTransport,
): Promise<void> {
  const doFetch = transport.fetchImpl ?? globalThis.fetch
  const response = await doFetch(PLAYGROUND_ENDPOINT, {
    body: JSON.stringify(payload),
    credentials: 'include',
    headers: buildHeaders(transport.accessToken),
    method: 'POST',
    signal,
  })

  if (!response.ok) throw new RelayRequestError(await readErrorBody(response))

  if (!response.body) {
    // A relay that answered 200 with no body cannot be rendered; treat it as a failure
    // rather than silently completing an empty message.
    throw new RelayRequestError({ ...FALLBACK_ERROR, status: response.status })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = new SseFrameParser()

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      const frames = parser.push(decoder.decode(value, { stream: true }))
      for (const frame of frames) {
        if (isDoneFrame(frame)) return
        applyChunk(frame.data, callbacks)
      }
    }

    for (const frame of parser.flush()) {
      if (isDoneFrame(frame)) return
      applyChunk(frame.data, callbacks)
    }
  } finally {
    // Releasing the lock lets an abort tear the socket down instead of leaving it pinned.
    reader.cancel().catch(() => undefined)
  }
}

/** One-shot completion. Same error contract as `streamCompletion`. */
export async function sendCompletion(
  payload: ChatCompletionRequest,
  signal: AbortSignal,
  transport: ChatTransport,
): Promise<{ content: string; reasoning: string; usage?: CompletionUsage }> {
  const doFetch = transport.fetchImpl ?? globalThis.fetch
  const response = await doFetch(PLAYGROUND_ENDPOINT, {
    body: JSON.stringify(payload),
    credentials: 'include',
    headers: buildHeaders(transport.accessToken),
    method: 'POST',
    signal,
  })

  if (!response.ok) throw new RelayRequestError(await readErrorBody(response))

  const text = await response.text()
  let parsed: ChatCompletionResponse
  try {
    parsed = JSON.parse(text) as ChatCompletionResponse
  } catch {
    throw new RelayRequestError(parseRelayError(text, response.status))
  }

  const choice = parsed.choices?.[0]
  if (!choice?.message) throw new RelayRequestError({ ...FALLBACK_ERROR, status: response.status })

  return {
    content: typeof choice.message.content === 'string' ? choice.message.content : '',
    reasoning:
      typeof choice.message.reasoning_content === 'string' ? choice.message.reasoning_content : '',
    usage: parsed.usage ?? undefined,
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
