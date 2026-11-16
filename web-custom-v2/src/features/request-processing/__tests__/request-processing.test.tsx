// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { delete: vi.fn(), get, post, put } }))
vi.mock('@/features/task-plugins/access', () => ({
  useTaskPluginsAccess: () => ({ error: null, isRefetching: false, retry: () => {}, state: 'granted' }),
}))

const { RequestProcessingPage } = await import('@/features/request-processing/RequestProcessingPage')
const { requestPluginSampleBody, requestPluginSamplesFor } = await import('@/features/request-processing/lib/samples')

const PLUGIN = {
  configSchema: {
    properties: {
      action: { default: 'mask', enum: ['mask', 'reject'], title: { en: 'Action' }, type: 'string' },
      keywords: { format: 'keywords', title: { en: 'Keywords' }, type: 'string' },
    },
    required: ['keywords'],
    type: 'object',
  },
  description: { en: 'Masks or refuses requests that hold listed words.' },
  key: 'acme_guard',
  models: [],
  name: 'Keyword guard',
  optional: false,
  samples: [{ body: { messages: [{ content: 'tell me the secret', role: 'user' }], model: 'gpt-4.1-mini' }, format: 'openai', name: { en: 'Secret' } }],
  task: false,
  transform: true,
  transform_hooks: ['request'],
}

const GUARD = { config: { keywords: 'secret' }, enabled: true, global: true, groups: [], id: 'guard', models: [], name: 'Guard', plugin: 'acme_guard' }
const VIP = { config: {}, enabled: false, global: false, groups: ['vip'], id: 'vip', models: ['gpt-4o'], name: 'VIP only', plugin: 'gone_plugin' }

function envelope(data: unknown) {
  return Promise.resolve({ data: { data, message: '', success: true } })
}

let stored: unknown[]

beforeEach(() => {
  stored = [GUARD, VIP]
  get.mockReset()
  post.mockReset()
  put.mockReset()
  get.mockImplementation((url: string) => {
    if (url === '/api/request_plugin/instances') return envelope({ instances: stored })
    if (url === '/api/task_plugin_options') return envelope([PLUGIN, { key: 'video', models: [], name: 'Video', task: true, transform: false }])
    if (url === '/api/group/') return envelope(['default', 'vip'])
    if (url === '/api/channel/models_enabled') return envelope(['gpt-4o'])
    throw new Error(`unmocked GET ${url}`)
  })
  // The server answers a save with the list as it stored it.
  put.mockImplementation((_url: string, body: { instances: unknown[] }) => envelope({ instances: body.instances }))
})

afterEach(cleanup)

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RequestProcessingPage />
    </QueryClientProvider>,
  )
}

describe('plugin samples', () => {
  const samples = [
    { body: {}, format: 'openai' as const, lang: 'en', name: 'english' },
    { body: {}, format: 'openai' as const, lang: 'zh', name: 'chinese' },
    { body: {}, format: 'openai' as const, name: 'any' },
  ]

  it("offers the samples written in the reader's language, else the neutral and English ones", () => {
    expect(requestPluginSamplesFor(samples, 'zh-TW').map((sample) => sample.name)).toEqual(['chinese'])
    expect(requestPluginSamplesFor(samples, 'fr').map((sample) => sample.name)).toEqual(['any', 'english'])
  })

  it("puts the console's image where a sample asks for one, in the format's own part shape", () => {
    const body = { messages: [{ content: [{ text: 'look', type: 'text' }, '[sample-image]'] }] }
    expect(requestPluginSampleBody(body, 'claude', 'data:image/png;base64,AAAA')).toEqual({
      messages: [{ content: [{ text: 'look', type: 'text' }, { source: { data: 'AAAA', media_type: 'image/png', type: 'base64' }, type: 'image' }] }],
    })
    // Without a drawn image the placeholder is dropped rather than sent as text.
    expect(requestPluginSampleBody(body, 'openai', null)).toEqual({ messages: [{ content: [{ text: 'look', type: 'text' }] }] })
  })
})

describe('RequestProcessingPage', () => {
  it('lists the instances in run order with where each applies, and saves a reorder as the whole list', async () => {
    renderPage()

    const list = within(await screen.findByRole('list', { name: 'Request processing' }))
    const rows = list.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Guard')
    expect(rows[0]).toHaveTextContent('Keyword guard · All requests')
    expect(rows[1]).toHaveTextContent('VIP only')
    expect(rows[1]).toHaveTextContent('Plugin disabled')
    expect(rows[1]).toHaveTextContent('gone_plugin · vip · Models: gpt-4o')

    fireEvent.click(list.getByRole('button', { name: 'Move Guard down' }))

    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put).toHaveBeenCalledWith('/api/request_plugin/instances', { instances: [VIP, GUARD] }, expect.anything())
  })

  it('adds an instance from a plugin, refusing to save settings its schema rejects', async () => {
    renderPage()
    await screen.findByRole('list', { name: 'Request processing' })

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    const picker = within(await screen.findByRole('dialog'))
    expect(picker.queryByText('Video')).not.toBeInTheDocument()
    expect(picker.getByText('1 added')).toBeInTheDocument()
    fireEvent.click(picker.getByRole('button', { name: /Keyword guard/ }))

    const editor = within(await screen.findByRole('dialog'))
    fireEvent.click(editor.getByRole('button', { name: 'Save' }))
    expect(await editor.findByText('This field is required')).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()

    fireEvent.change(editor.getByRole('textbox', { name: /^Keywords/ }), { target: { value: 'password' } })
    fireEvent.click(editor.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(put).toHaveBeenCalled())
    const body = put.mock.calls[0][1] as { instances: Array<Record<string, unknown>> }
    expect(body.instances).toHaveLength(3)
    expect(body.instances[2]).toEqual({
      config: { action: 'mask', keywords: 'password' },
      enabled: true,
      global: true,
      groups: [],
      id: '',
      models: [],
      name: 'Keyword guard',
      plugin: 'acme_guard',
    })
  })

  it('tries the instance being edited on the plugin sample without saving it', async () => {
    post.mockImplementation(() =>
      envelope({
        body: null,
        failed: null,
        record: [{ plugin: 'acme_guard', rejected: { code: 'guard.blocked' }, stage: 'request' }],
        rejected: { code: 'guard.blocked', instance: 'guard', message: 'That word is not allowed' },
        steps: [{ action: 'reject', duration_ms: 2, effects: 0, instance: 'guard', name: 'Guard', plugin: 'acme_guard', stage: 'request' }],
      }),
    )
    renderPage()
    const list = within(await screen.findByRole('list', { name: 'Request processing' }))
    fireEvent.click(list.getByRole('button', { name: 'Edit Guard' }))

    const editor = within(await screen.findByRole('dialog'))
    expect(await editor.findByText('tell me the secret')).toBeInTheDocument()
    fireEvent.click(editor.getByRole('button', { name: 'Run' }))

    expect(await editor.findByText('This request would be refused')).toBeInTheDocument()
    expect(editor.getByText('Refused by Guard: That word is not allowed (code: guard.blocked)')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith(
      '/api/request_plugin/dry_run',
      {
        body: PLUGIN.samples[0].body,
        format: 'openai',
        // A setting the saved instance leaves out stays out, so the gateway default applies.
        instance: GUARD,
        model: 'gpt-4.1-mini',
        path: '/v1/chat/completions',
        reply: undefined,
      },
      expect.anything(),
    )
    expect(put).not.toHaveBeenCalled()
  })

  it('dry-runs the saved instances on a pasted request and shows what each step did', async () => {
    post.mockImplementation((_url: string, request: { body: { messages: Array<{ content: string }> } }) =>
      envelope({
        body: { ...request.body, messages: [{ content: 'tell me the ******', role: 'user' }] },
        failed: null,
        record: [],
        rejected: null,
        steps: [{ action: 'continue', duration_ms: 3, effects: 1, findings: [{ count: 1, rule: 'secret' }], instance: 'guard', name: 'Guard', plugin: 'acme_guard', stage: 'request' }],
      }),
    )
    renderPage()
    await screen.findByRole('list', { name: 'Request processing' })
    fireEvent.click(screen.getByRole('button', { name: 'Dry run' }))
    const dialog = within(await screen.findByRole('dialog'))

    const body = dialog.getByRole('textbox', { name: 'Request body' })
    fireEvent.change(body, { target: { value: '[1, 2]' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Run' }))
    expect(await dialog.findByText('Request body must be a JSON object.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    fireEvent.change(body, { target: { value: '{"model":"gpt-4o","messages":[{"role":"user","content":"tell me the secret"}]}' } })
    fireEvent.change(dialog.getByRole('combobox', { name: /^Group/ }), { target: { value: 'vip' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Run' }))

    const steps = within(await dialog.findByRole('table', { name: 'Steps' }))
    expect(steps.getByText('Before format conversion')).toBeInTheDocument()
    expect(steps.getByText('secret × 1')).toBeInTheDocument()
    expect(dialog.getByText('tell me the ******')).toBeInTheDocument()
    expect(dialog.getByText('Nothing about this request is shown in user logs.')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith(
      '/api/request_plugin/dry_run',
      expect.objectContaining({ channel_id: undefined, format: 'openai', group: 'vip', model: 'gpt-4.1-mini', path: '/v1/chat/completions' }),
      expect.anything(),
    )
  })
})
