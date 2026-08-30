// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { delete: del, get, post, put } }))

const { PlaygroundPage } = await import('@/features/playground/PlaygroundPage')
const { useAuthStore } = await import('@/stores/auth-store')
const { STORAGE_KEYS } = await import('@/features/playground/constants')

/** Verbatim from `GET /api/user/self/groups` on the seeded dev server. */
const groupsFixture = {
  default: { desc: '默认分组', ratio: 1 },
  vip: { desc: 'vip分组', ratio: 1 },
}

/** Verbatim from `GET /api/user/models?group=default`. */
const modelsFixture = ['gpt-4o-mini', 'gpt-image-1', 'mj_imagine', 'suno_music']

const rootUser = { id: 1, role: 100, username: 'root' }
const plainUser = { id: 2, role: 1, username: 'member' }

type ServerState = {
  user: typeof rootUser
  models: string[]
  modelsFail: boolean
  groupsFail: boolean
}

let server: ServerState
let fetchMock: ReturnType<typeof vi.fn>

function envelope(data: unknown) {
  return Promise.resolve({ data: { data, message: '', success: true } })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<PlaygroundPage />, { wrapper })
}

/** Streams SSE frames the way the relay does, one enqueue per frame. */
function sseResponse(frames: string[], delayMs = 0) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      async start(controller) {
        for (const frame of frames) {
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
          controller.enqueue(encoder.encode(frame))
        }
        controller.close()
      },
    }),
    { status: 200 },
  )
}

async function typePrompt(text: string) {
  const box = await screen.findByLabelText('Message')
  fireEvent.change(box, { target: { value: text } })
  return box
}

beforeEach(() => {
  localStorage.clear()
  server = { groupsFail: false, models: modelsFixture, modelsFail: false, user: rootUser }

  get.mockReset()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)

  useAuthStore.getState().auth.setBundle({
    access_expires_at: 1_788_049_716,
    access_token: 'console-token',
    session: null,
    user: null,
  } as never)

  get.mockImplementation((url: string) => {
    if (url === '/api/status') return envelope({ quota_per_unit: 500_000 })
    if (url === '/api/user/self') return envelope(server.user)
    if (url === '/api/user/self/groups') {
      if (server.groupsFail) return Promise.reject(new Error('groups unavailable'))
      return envelope(groupsFixture)
    }
    if (url === '/api/user/models') {
      if (server.modelsFail) return Promise.reject(new Error('models unavailable'))
      return envelope(server.models)
    }
    return envelope(null)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PlaygroundPage — loading, empty and error states', () => {
  it('shows a loading placeholder before the model list resolves', () => {
    renderPage()

    // The Skeleton announces itself as a busy status region; its label is the
    // screen-reader text inside it. Scoped by that label because the sidebar's
    // info Alert is also a role="status" region.
    const label = screen.getByText('Loading the playground')
    expect(label.closest('[role="status"]')).toHaveAttribute('aria-busy', 'true')
  })

  it('shows the empty conversation state once models are available', async () => {
    renderPage()

    expect(await screen.findByText('No messages yet')).toBeInTheDocument()
  })

  it('explains the seeded reality when the group offers no models, and blocks sending', async () => {
    server.models = []
    renderPage()

    expect(await screen.findByText('No models in this group')).toBeInTheDocument()
    expect(await screen.findByLabelText('Message')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('offers a retry when the model list fails to load', async () => {
    server.modelsFail = true
    renderPage()

    expect(await screen.findByText('Models unavailable')).toBeInTheDocument()

    server.modelsFail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('No messages yet')).toBeInTheDocument()
  })

  it('warns but stays usable when the billing groups fail to load', async () => {
    server.groupsFail = true
    renderPage()

    expect(await screen.findByText('Billing groups unavailable')).toBeInTheDocument()
    expect(await screen.findByText('No messages yet')).toBeInTheDocument()
  })
})

describe('PlaygroundPage — sending', () => {
  it('streams a reply and renders it as sanitized markdown', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"# Hi"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"\\n\\nplain **answer**"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":9,"completion_tokens":7,"total_tokens":16}}\n\n',
        'data: [DONE]\n\n',
      ]),
    )

    renderPage()
    await typePrompt('hello there')
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }))

    const reply = await screen.findByRole('article', { name: 'Model reply' })
    await waitFor(() => {
      expect(within(reply).getByRole('heading', { name: 'Hi' })).toBeInTheDocument()
    })
    expect(within(reply).getByText('answer').tagName).toBe('STRONG')
  })

  it('posts to the playground relay with the console token, not to /v1', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']))

    renderPage()
    await typePrompt('hi')
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

    expect(url).toBe('/pg/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer console-token')

    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.group).toBe('default')
    expect(body.stream).toBe(true)
  })

  it('sends the system prompt as the first message when one is set', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']))

    renderPage()
    const systemBox = await screen.findByLabelText('System prompt')
    fireEvent.change(systemBox, { target: { value: 'be terse' } })

    await typePrompt('hi')
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)

    expect(body.messages[0]).toEqual({ content: 'be terse', role: 'system' })
    expect(body.messages[1]).toEqual({ content: 'hi', role: 'user' })
  })

  it('omits a parameter whose switch has been turned off', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']))

    renderPage()
    // Temperature ships on by default; turning it off must drop it from the body.
    fireEvent.click(await screen.findByRole('switch', { name: 'Temperature' }))

    await typePrompt('hi')
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)

    expect('temperature' in body).toBe(false)
    expect(body.top_p).toBe(1)
  })

  it('refetches the model list when the billing group changes', async () => {
    renderPage()
    await screen.findByText('No messages yet')

    fireEvent.change(screen.getByLabelText('Billing group'), { target: { value: 'vip' } })

    await waitFor(() => {
      const groups = get.mock.calls
        .filter(([url]) => url === '/api/user/models')
        .map(([, config]) => (config as { params: { group: string } }).params.group)
      expect(groups).toContain('vip')
    })
  })
})

describe('PlaygroundPage — aborting', () => {
  it('really aborts the fetch when the user stops a generation', async () => {
    let capturedSignal: AbortSignal | undefined
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      capturedSignal = init.signal ?? undefined
      // Never resolves on its own: only the abort can end this generation.
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    })

    renderPage()
    await typePrompt('hi')
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }))

    const stop = await screen.findByRole('button', { name: 'Stop generating' })
    expect(capturedSignal?.aborted).toBe(false)

    fireEvent.click(stop)

    await waitFor(() => expect(capturedSignal?.aborted).toBe(true))
    expect(await screen.findByText('Stopped')).toBeInTheDocument()
    // The composer returns to its sendable state rather than staying stuck.
    expect(await screen.findByRole('button', { name: 'Send message' })).toBeInTheDocument()
  })

  it('keeps whatever had already streamed when the user stops', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const encoder = new TextEncoder()
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('data: {"choices":[{"delta":{"content":"partial answer"}}]}\n\n'),
              )
              init.signal?.addEventListener('abort', () => controller.close())
            },
          }),
          { status: 200 },
        ),
      )
    })

    renderPage()
    await typePrompt('hi')
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }))

    await screen.findByText('partial answer')
    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }))

    expect(await screen.findByText('Stopped')).toBeInTheDocument()
    expect(screen.getByText('partial answer')).toBeInTheDocument()
  })
})

describe('PlaygroundPage — relay failures', () => {
  it('reports the no-channel failure without logging the user out', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        '{"error":{"code":"model_not_found","message":"No available channel for model gpt-4o-mini under group default (distributor)","type":"new_api_error"}}',
        { status: 503 },
      ),
    )

    renderPage()
    await typePrompt('hi')
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('The model did not answer')).toBeInTheDocument()
    expect(screen.getByText(/No available channel for model gpt-4o-mini/)).toBeInTheDocument()
    expect(screen.getByText('model_not_found')).toBeInTheDocument()
  })

  it('explains the upstream 401 as a channel problem, never as an expired session', async () => {
    // This is the case the seeded dev server actually produces, and the reason this page
    // does not route through the axios client (whose 401 handler signs the user out).
    fetchMock.mockResolvedValue(
      new Response(
        '{"error":{"message":"Incorrect API key provided: sk-probe","type":"invalid_request_error","code":"invalid_api_key"}}',
        { status: 401 },
      ),
    )

    renderPage()
    await typePrompt('hi')
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }))

    expect(await screen.findByText(/Your console session is fine/)).toBeInTheDocument()
  })

  it('offers an admin the pricing settings link on an unpriced model', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        '{"error":{"message":"Model price not configured.","type":"new_api_error","code":"model_price_error"}}',
        { status: 400 },
      ),
    )

    renderPage()
    await typePrompt('hi')
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }))

    const link = await screen.findByRole('link', { name: 'Open model pricing settings' })
    expect(link).toHaveAttribute('href', '/system-settings/billing/model-pricing')
  })

  it('withholds that link from a non-admin, who cannot act on it', async () => {
    server.user = plainUser
    fetchMock.mockResolvedValue(
      new Response(
        '{"error":{"message":"Model price not configured.","type":"new_api_error","code":"model_price_error"}}',
        { status: 400 },
      ),
    )

    renderPage()
    await typePrompt('hi')
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('The model did not answer')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Open model pricing settings' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/An administrator needs to set its price/)).toBeInTheDocument()
  })

  it('recovers from a network failure with a retry that succeeds', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderPage()
    await typePrompt('hi')
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('The model did not answer')).toBeInTheDocument()

    fetchMock.mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"second time lucky"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('second time lucky')).toBeInTheDocument()
  })
})

describe('PlaygroundPage — transcript actions', () => {
  it('deletes a single turn', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']))
    renderPage()
    await typePrompt('a question')
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }))

    const turn = await screen.findByRole('article', { name: 'Your message' })
    await waitFor(() =>
      expect(within(turn).getByRole('button', { name: 'Delete message' })).toBeEnabled(),
    )
    fireEvent.click(within(turn).getByRole('button', { name: 'Delete message' }))

    await waitFor(() => expect(screen.queryByText('a question')).not.toBeInTheDocument())
  })

  it('gates clearing the conversation behind a confirmation', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']))
    renderPage()
    await typePrompt('a question')
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }))
    await screen.findByText('a question')

    fireEvent.click(await screen.findByRole('button', { name: 'Clear conversation' }))
    // Still there: opening the dialog must not itself destroy anything.
    expect(screen.getByText('a question')).toBeInTheDocument()

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear conversation' }))

    await waitFor(() => expect(screen.queryByText('a question')).not.toBeInTheDocument())
  })

  it('restores a transcript from storage, marking an interrupted turn as stopped', async () => {
    localStorage.setItem(
      STORAGE_KEYS.messages,
      JSON.stringify([
        { content: 'earlier question', createdAt: 1, id: 'u1', reasoning: '', role: 'user', status: 'complete' },
        { content: 'half an ans', createdAt: 2, id: 'a1', reasoning: '', role: 'assistant', status: 'streaming' },
      ]),
    )

    renderPage()

    expect(await screen.findByText('earlier question')).toBeInTheDocument()
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })
})
