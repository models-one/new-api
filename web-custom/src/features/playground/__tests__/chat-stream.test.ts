import { describe, expect, it, vi } from 'vitest'

import {
  RelayRequestError,
  isAbortError,
  parseRelayError,
  sendCompletion,
  streamCompletion,
} from '@/features/playground/chat-stream'
import type { ChatCompletionRequest, CompletionUsage } from '@/features/playground/types'

const payload: ChatCompletionRequest = {
  group: 'default',
  messages: [{ content: 'hi', role: 'user' }],
  model: 'gpt-4o-mini',
  stream: true,
}

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

function collect() {
  const content: string[] = []
  const reasoning: string[] = []
  const usage: CompletionUsage[] = []
  return {
    callbacks: {
      onDelta: (part: { content?: string; reasoning?: string }) => {
        if (part.content) content.push(part.content)
        if (part.reasoning) reasoning.push(part.reasoning)
      },
      onUsage: (value: CompletionUsage) => usage.push(value),
    },
    content,
    reasoning,
    usage,
  }
}

/**
 * Every error body below is a verbatim response from the seeded dev server, captured by
 * driving `/pg/chat/completions` into each failure. They are the whole reason this
 * module exists separately from the shared axios client, whose 401 handling would sign
 * the user out on the `invalid_api_key` case.
 */
describe('parseRelayError', () => {
  it('reads the upstream 401 the seeded probe channel produces', () => {
    const error = parseRelayError(
      '{"error":{"message":"Incorrect API key provided: sk-probe. You can find your API key at https://***.com/***/***","type":"invalid_request_error","param":"","code":"invalid_api_key"}}',
      401,
    )

    expect(error.code).toBe('invalid_api_key')
    expect(error.status).toBe(401)
    expect(error.message).toContain('Incorrect API key provided')
  })

  it('reads the no-channel error', () => {
    const error = parseRelayError(
      '{"error":{"code":"model_not_found","message":"No available channel for model no-such-model under group default (distributor)","type":"new_api_error"}}',
      503,
    )

    expect(error.code).toBe('model_not_found')
    expect(error.type).toBe('new_api_error')
  })

  it('reads the unpriced-model error that only an admin can fix', () => {
    const error = parseRelayError(
      '{"error":{"message":"Model pg-mock-model price not configured.","type":"new_api_error","param":"","code":"model_price_error"}}',
      400,
    )

    expect(error.code).toBe('model_price_error')
  })

  it('keeps an empty code when the relay omits one', () => {
    const error = parseRelayError(
      '{"error":{"code":"","message":"No permission to access this group","type":"new_api_error"}}',
    )

    expect(error.code).toBe('')
    expect(error.message).toBe('No permission to access this group')
  })

  it('unwraps an error delivered inside an SSE frame', () => {
    const error = parseRelayError('data: {"error":{"code":"boom","message":"framed"}}', 500)

    expect(error).toMatchObject({ code: 'boom', message: 'framed' })
  })

  it('surfaces non-JSON bodies as text rather than a generic message', () => {
    const error = parseRelayError('<html>502 Bad Gateway</html>', 502)

    expect(error.message).toBe('<html>502 Bad Gateway</html>')
  })

  it('falls back to a readable message for an empty body', () => {
    expect(parseRelayError('', 500).message).not.toBe('')
  })
})

describe('streamCompletion', () => {
  it('assembles content and reasoning deltas and reports usage', async () => {
    const collector = collect()
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        streamOf([
          'data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"# Hi"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":9,"completion_tokens":7,"total_tokens":16}}\n\n',
          'data: [DONE]\n\n',
        ]),
        { status: 200 },
      ),
    )

    await streamCompletion(payload, collector.callbacks, new AbortController().signal, {
      accessToken: 'token-abc',
      fetchImpl,
    })

    expect(collector.content.join('')).toBe('# Hi there')
    expect(collector.reasoning.join('')).toBe('thinking...')
    expect(collector.usage).toEqual([
      { completion_tokens: 7, prompt_tokens: 9, total_tokens: 16 },
    ])
  })

  it('sends the console access token as a bearer credential', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(streamOf(['data: [DONE]\n\n']), { status: 200 }))

    await streamCompletion(payload, collect().callbacks, new AbortController().signal, {
      accessToken: 'token-abc',
      fetchImpl,
    })

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/pg/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc')
    expect(init.credentials).toBe('include')
  })

  it('stops at [DONE] and ignores anything the server sends after it', async () => {
    const collector = collect()
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        streamOf([
          'data: {"choices":[{"delta":{"content":"kept"}}]}\n\n',
          'data: [DONE]\n\n',
          'data: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
        ]),
        { status: 200 },
      ),
    )

    await streamCompletion(payload, collector.callbacks, new AbortController().signal, {
      accessToken: null,
      fetchImpl,
    })

    expect(collector.content.join('')).toBe('kept')
  })

  it('throws a RelayRequestError carrying the relay code on a failed response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        '{"error":{"code":"model_not_found","message":"No available channel","type":"new_api_error"}}',
        { status: 503 },
      ),
    )

    const failure = streamCompletion(
      payload,
      collect().callbacks,
      new AbortController().signal,
      { accessToken: null, fetchImpl },
    )

    await expect(failure).rejects.toBeInstanceOf(RelayRequestError)
    await failure.catch((error: unknown) => {
      expect((error as RelayRequestError).detail.code).toBe('model_not_found')
    })
  })

  it('handles the streamed 401 whose body is bare JSON despite the event-stream type', async () => {
    // Verified: the relay answers `Content-Type: text/event-stream` with an unframed
    // JSON error body when auth fails on a streaming request.
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        '{"error":{"message":"Incorrect API key provided: sk-probe","type":"invalid_request_error","code":"invalid_api_key"}}',
        { headers: { 'Content-Type': 'text/event-stream' }, status: 401 },
      ),
    )

    await streamCompletion(payload, collect().callbacks, new AbortController().signal, {
      accessToken: null,
      fetchImpl,
    }).catch((error: unknown) => {
      expect((error as RelayRequestError).detail.code).toBe('invalid_api_key')
      expect((error as RelayRequestError).detail.status).toBe(401)
    })

    expect.assertions(2)
  })

  it('passes the abort signal to fetch so a stop really cancels the request', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      // Mirror what a real fetch does: reject with AbortError once the signal fires.
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted.')
          error.name = 'AbortError'
          reject(error)
        })
      })
    })

    const pending = streamCompletion(payload, collect().callbacks, controller.signal, {
      accessToken: null,
      fetchImpl,
    })

    controller.abort()

    await expect(pending).rejects.toSatisfy(isAbortError)
    expect((fetchImpl.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal)
  })

  it('ignores an unparseable frame instead of failing the whole stream', async () => {
    const collector = collect()
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        streamOf([
          'data: not json at all\n\n',
          'data: {"choices":[{"delta":{"content":"still here"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
        { status: 200 },
      ),
    )

    await streamCompletion(payload, collector.callbacks, new AbortController().signal, {
      accessToken: null,
      fetchImpl,
    })

    expect(collector.content.join('')).toBe('still here')
  })
})

describe('sendCompletion', () => {
  it('reads the non-streamed body shape the relay returns', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        '{"id":"chatcmpl-mock","choices":[{"index":0,"message":{"role":"assistant","content":"# Hi","reasoning_content":"let me think"},"finish_reason":"stop"}],"usage":{"prompt_tokens":9,"completion_tokens":7,"total_tokens":16}}',
        { status: 200 },
      ),
    )

    const result = await sendCompletion(
      { ...payload, stream: false },
      new AbortController().signal,
      { accessToken: null, fetchImpl },
    )

    expect(result.content).toBe('# Hi')
    expect(result.reasoning).toBe('let me think')
    expect(result.usage?.total_tokens).toBe(16)
  })

  it('rejects a 200 that carries no choice rather than rendering an empty reply', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"choices":[]}', { status: 200 }))

    await expect(
      sendCompletion({ ...payload, stream: false }, new AbortController().signal, {
        accessToken: null,
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(RelayRequestError)
  })
})
