// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { InternalAxiosRequestConfig } from 'axios'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from '@/lib/http-client'
import { PelicanAdmin } from '../admin'
import { ArtifactImage } from '../artwork'
import { PelicanGallery } from '../gallery'
import { RuleEditor } from '../rule-editor'
import { defaultRule, type PelicanArtwork } from '../types'

const i18n = createInstance()
await i18n.init({
  lng: 'en',
  resources: {
    en: { translation: {} },
    zh: {
      translation: {
        'Artifact service URL must be an HTTP(S) address without credentials, query or fragment':
          '独立服务地址必须为 HTTP(S) 地址，且不能包含凭据、查询参数或片段',
      },
    },
  },
  initAsync: false,
})
const clients: QueryClient[] = []
const originalAdapter = api.defaults.adapter
const NativeURL = globalThis.URL

function artwork(id: string, channel: string): PelicanArtwork {
  return {
    id,
    channel_name: channel,
    model: 'fixture-model',
    protocol: 'openai-responses',
    revision: 1,
    generated_at: 1700000000,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    prompt: 'Draw a pelican',
    system_prompt: '',
    parameters: '{}',
    generation: { duration_ms: 1234 },
    artifacts: [{ id: `art_${id}`, type: 'png', size: 8, sha256: 'fixture' }],
  }
}

function mockApi(handler: (config: InternalAxiosRequestConfig) => unknown) {
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
    data: handler(config),
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }))
  api.defaults.adapter = adapter
  return adapter
}

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL() {
        return 'blob:fixture-image'
      }
      static revokeObjectURL() {}
    },
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        )
      }
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
})

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
  for (const client of clients.splice(0)) client.clear()
  api.defaults.adapter = originalAdapter
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function mount(
  component: React.ReactNode,
  role = 1,
  adminPermissions?: Record<string, Record<string, boolean>>,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['user', 'self'], {
    id: 1,
    role,
    username: 'tester',
    permissions: { admin_permissions: adminPermissions },
  })
  clients.push(client)
  const route = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>{component}</I18nextProvider>
      </QueryClientProvider>
    ),
  })
  const router = createRouter({
    routeTree: route,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await router.load()
  return client
}

it('groups by channel/model, fetches authenticated images and limits comparison to two artworks', async () => {
  const adapter = mockApi((config) => {
    if (config.url?.includes('/artifacts/')) return new Blob(['png'], { type: 'image/png' })
    if (config.url === '/api/user/self') return { success: true, data: { id: 1, role: 1 } }
    return {
      success: true,
      data: {
        page: 1,
        total: 2,
        groups: [
          {
            key: 'a',
            channel_name: 'Channel A',
            model: 'fixture-model',
            interval_seconds: 3600,
            latest_status: 'succeeded',
            runs: [artwork('a1', 'Channel A'), artwork('a2', 'Channel A')],
          },
          {
            key: 'b',
            channel_name: 'Channel B',
            model: 'fixture-model',
            interval_seconds: 0,
            latest_status: 'failed',
            runs: [{ ...artwork('b1', 'Channel B'), prompt: 'Different prompt' }],
          },
        ],
      },
    }
  })
  await mount(<PelicanGallery />)
  expect(await screen.findByRole('heading', { name: 'Channel A / fixture-model' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Channel B / fixture-model' })).toBeVisible()
  expect(screen.getByRole('list', { name: 'Channel A / fixture-model' })).toHaveAttribute(
    'tabindex',
    '0',
  )
  expect(screen.queryByRole('link', { name: 'Manage tests' })).not.toBeInTheDocument()
  const [first, second, third] = screen.getAllByRole('checkbox')
  fireEvent.click(first!)
  fireEvent.click(third!)
  expect(second).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Compare artworks (2/2)' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('Channel A / fixture-model')).toBeVisible()
  expect(within(dialog).getByText('Channel B / fixture-model')).toBeVisible()
  expect(
    within(dialog).getByText('Generation conditions differ between these artworks'),
  ).toBeVisible()
  expect(
    adapter.mock.calls.some(
      ([config]) =>
        config.url?.includes('/artifacts/') &&
        config.responseType === 'blob' &&
        config.withCredentials === true,
    ),
  ).toBe(true)
})

it('does not fetch an expired artwork', async () => {
  const adapter = mockApi(() => {
    throw new Error('Expired artwork must not be requested')
  })
  await mount(<ArtifactImage run={{ ...artwork('expired', 'A'), expires_at: 1 }} large />)
  expect(await screen.findByText('Artwork is unavailable or expired')).toBeVisible()
  expect(adapter).not.toHaveBeenCalled()
})

it.each(['expiry', 'refetch failure'])('releases the displayed Blob after %s', async (reason) => {
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  const timers = vi.spyOn(globalThis, 'setTimeout')
  const revoke = vi.spyOn(URL, 'revokeObjectURL')
  let fail = false
  mockApi(() => {
    if (fail) throw new Error('Artifact unavailable')
    return new Blob(['png'], { type: 'image/png' })
  })
  const run = artwork('lifecycle', 'A')
  const client = await mount(<ArtifactImage run={run} large />)
  expect(await screen.findByRole('img')).toBeVisible()
  if (reason === 'expiry') {
    const expire = timers.mock.calls.find(([, delay]) => delay === run.expires_at * 1000 - now)?.[0]
    expect(expire).toBeTypeOf('function')
    act(() => (expire as () => void)())
  } else {
    fail = true
    await act(async () => {
      await client.refetchQueries({ queryKey: ['pelican-artifact', run.id] })
    })
  }
  expect(await screen.findByText('Artwork is unavailable or expired')).toBeVisible()
  await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:fixture-image'))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  if (reason === 'expiry') {
    await waitFor(() =>
      expect(
        client.getQueryData(['pelican-artifact', run.id, run.artifacts[0]?.id]),
      ).toBeUndefined(),
    )
  }
})

it('changes channel/model and Anthropic parameters while retaining detailed save failures', async () => {
  const onClose = vi.fn()
  const adapter = mockApi((config) => {
    if (config.url === '/api/channel/')
      return {
        success: true,
        data: { items: [{ id: 2, name: 'Claude line' }] },
      }
    if (config.url === '/api/channel/2')
      return {
        success: true,
        data: { id: 2, name: 'Claude line', models: 'claude-test' },
      }
    if (config.url === '/api/pelican/admin/rules')
      return {
        success: false,
        message: 'Save failed',
        details: 'driver: connection reset by peer',
      }
    return {
      success: true,
      data: { id: 1, name: 'Old line', models: 'old-model' },
    }
  })
  await mount(
    <RuleEditor
      rule={{ ...defaultRule, name: 'Test', channel_id: 1, model: 'old-model' }}
      onClose={onClose}
    />,
  )
  await screen.findByRole('option', { name: 'Claude line (#2)' })
  fireEvent.change(screen.getByRole('combobox', { name: 'Channel' }), {
    target: { value: '2' },
  })
  await screen.findByRole('option', { name: 'claude-test' })
  fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
    target: { value: 'claude-test' },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'Protocol' }), {
    target: { value: 'anthropic' },
  })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Interval (minutes)' }), {
    target: { value: '30' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('driver: connection reset by peer')).toBeVisible()
  const request = adapter.mock.calls.find(
    ([config]) => config.url === '/api/pelican/admin/rules',
  )?.[0]
  expect(JSON.parse(request?.data as string)).toMatchObject({
    channel_id: 2,
    model: 'claude-test',
    protocol: 'anthropic',
    parameters: '{"max_tokens":8192}',
    interval_seconds: 1800,
  })
  expect(onClose).not.toHaveBeenCalled()
})

it('rejects invalid rule JSON before sending a save request', async () => {
  const adapter = mockApi(() => ({
    success: true,
    data: { id: 1, name: 'A', models: 'fixture-model', items: [] },
  }))
  await mount(
    <RuleEditor
      rule={{
        ...defaultRule,
        id: 1,
        name: 'Test',
        channel_id: 1,
        model: 'fixture-model',
        parameters: '{',
      }}
      onClose={() => {}}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Parameters must be a JSON object')
  expect(adapter.mock.calls.some(([config]) => ['put', 'post'].includes(config.method ?? ''))).toBe(
    false,
  )
})

it('does not request admin data without channel read permission', async () => {
  const adapter = mockApi(() => ({ success: true, data: { id: 1, role: 1 } }))
  await mount(<PelicanAdmin />)
  expect(await screen.findByText('The channel:read grant is missing')).toBeVisible()
  expect(adapter.mock.calls.some(([config]) => config.url?.startsWith('/api/pelican/admin'))).toBe(
    false,
  )
})

it('shows execution failures to an administrator with the original debugging detail', async () => {
  mockApi((config) => {
    if (config.url === '/api/user/self') return { success: true, data: { id: 1, role: 100 } }
    if (config.url?.endsWith('/status')) return { success: true, data: { ready: true } }
    if (config.url?.endsWith('/rules')) return { success: true, data: [] }
    return {
      success: true,
      data: {
        total: 1,
        items: [
          {
            id: 'failed',
            channel_name: 'Channel A',
            model: 'fixture-model',
            created_at: 1700000000,
            status: 'failed',
            error_detail: 'upstream status 504: deadline exceeded',
          },
        ],
      },
    }
  })
  await mount(<PelicanAdmin />, 100)
  fireEvent.click(await screen.findByRole('tab', { name: 'Execution history' }))
  const mobileHistory = await screen.findByRole('region', { name: 'Execution history' })
  fireEvent.click(within(mobileHistory).getByRole('button', { name: 'Debug details' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(/upstream status 504: deadline exceeded/)).toBeVisible()
  expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeEnabled()
})

it('saves root connection and test key independently without echoing the service token', async () => {
  let saved = 'http://environment:3001'
  let testToken = 0
  let refusal = ''
  const adapter = mockApi((config) => {
    if (config.url === '/api/pelican/settings') {
      return {
        success: true,
        data: {
          url: saved,
          service_token_configured: true,
          test_token_id: testToken,
          test_tokens: [{ id: 9, name: 'fixture' }],
        },
      }
    }
    if (config.url === '/api/pelican/settings/connection') {
      if (refusal) return { success: false, message: refusal }
      const body = JSON.parse(config.data as string)
      expect(body.service_token).toBe('fixture-write-only-service-credential')
      saved = body.url.replace(/\/+$/, '')
      return { success: true }
    }
    if (config.url === '/api/pelican/settings/test-token') {
      testToken = JSON.parse(config.data as string).id
      return { success: true }
    }
    if (config.url === '/api/user/self') return { success: true, data: { id: 1, role: 100 } }
    if (config.url?.endsWith('/status'))
      return {
        success: true,
        data: { ready: true, service_url: saved || 'http://environment:3001' },
      }
    if (config.url?.endsWith('/rules')) return { success: true, data: [] }
    return { success: true, data: { total: 0, items: [] } }
  })
  await mount(<PelicanAdmin />, 100)
  fireEvent.click(await screen.findByRole('button', { name: 'Artifact service settings' }))
  const dialog = await screen.findByRole('dialog')
  const input = await within(dialog).findByRole('textbox', { name: 'Artifact service URL' })
  const secret = within(dialog).getByLabelText('Artifact service token')
  const connectionSave = within(dialog).getAllByRole('button', { name: 'Save changes' })[0]
  const keySave = within(dialog).getAllByRole('button', { name: 'Save changes' })[1]
  expect(secret).toHaveValue('')
  fireEvent.change(input, { target: { value: ' http://renderer:3001/prefix/ ' } })
  fireEvent.change(secret, { target: { value: 'fixture-write-only-service-credential' } })
  fireEvent.click(connectionSave)
  await waitFor(() => expect(input).toHaveValue('http://renderer:3001/prefix'))
  expect(secret).toHaveValue('')
  expect(connectionSave).toBeDisabled()
  await act(() => i18n.changeLanguage('zh'))
  refusal = 'Artifact service URL must be an HTTP(S) address without credentials, query or fragment'
  fireEvent.change(input, { target: { value: 'ftp://invalid.example' } })
  fireEvent.click(connectionSave)
  expect(
    await within(dialog).findByText(
      '独立服务地址必须为 HTTP(S) 地址，且不能包含凭据、查询参数或片段',
    ),
  ).toBeVisible()
  expect(input).toHaveValue('ftp://invalid.example')
  expect(saved).toBe('http://renderer:3001/prefix')
  await act(() => i18n.changeLanguage('en'))
  refusal = 'database: connection reset by peer'
  fireEvent.change(input, { target: { value: 'https://replacement.example' } })
  fireEvent.click(connectionSave)
  expect(await within(dialog).findByText(refusal)).toBeVisible()
  expect(input).toHaveValue('https://replacement.example')
  expect(saved).toBe('http://renderer:3001/prefix')
  const select = within(dialog).getByRole('combobox', { name: 'Test API key' })
  fireEvent.change(select, { target: { value: '9' } })
  fireEvent.click(keySave)
  await waitFor(() => expect(keySave).toBeDisabled())
  expect(testToken).toBe(9)
  expect(input).toHaveValue('https://replacement.example')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  expect(await screen.findByText('Artifact service URL: http://renderer:3001/prefix')).toBeVisible()
  expect(adapter.mock.calls.filter(([config]) => config.method === 'put')).toHaveLength(4)
})

it('does not offer service configuration or fetch root options to a channel administrator', async () => {
  const adapter = mockApi((config) => {
    if (config.url === '/api/user/self')
      return {
        success: true,
        data: {
          id: 1,
          role: 10,
          permissions: { admin_permissions: { channel: { read: true, operate: true } } },
        },
      }
    if (config.url?.endsWith('/status')) return { success: true, data: { ready: true } }
    if (config.url?.endsWith('/rules')) return { success: true, data: [] }
    return { success: true, data: { total: 0, items: [] } }
  })
  await mount(<PelicanAdmin />, 10, { channel: { read: true, operate: true } })
  expect(await screen.findByRole('button', { name: 'Check connection' })).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Artifact service settings' }),
  ).not.toBeInTheDocument()
  expect(
    adapter.mock.calls.some(([config]) => config.url?.startsWith('/api/pelican/settings')),
  ).toBe(false)
})
