// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put: vi.fn(), delete: vi.fn() } }))
vi.mock('@/features/task-plugins/access', () => ({
  useTaskPluginsAccess: () => ({ error: null, isRefetching: false, retry: () => {}, state: 'granted' }),
}))

const { TaskPluginsPage } = await import('@/features/task-plugins/TaskPluginsPage')
const { resolvePluginParts } = await import('@/features/task-plugins/lib/plugin-kinds')

function plugin(key: string, parts: Record<string, unknown>) {
  return {
    active: true,
    channel_count: 0,
    enabled: true,
    in_flight_count: 0,
    meta: { apiVersion: 1, author: { name: 'A' }, fetchMode: 'per_task', key, models: [], name: key, version: '1.0.0' },
    remark: '',
    runtime_status: 'registered',
    source: 'override',
    source_hash: 'h',
    ...parts,
  }
}

const PLUGINS = [
  plugin('video', { task: true, provider: false, transform: false, enabled: false }),
  plugin('vendor', { task: false, provider: true, transform: false, login: true }),
  plugin('redact', { task: false, provider: false, transform: true }),
]

beforeEach(() => {
  get.mockReset()
  get.mockImplementation((url: string) => {
    if (url === '/api/plugin/task') return Promise.resolve({ data: { success: true, data: PLUGINS } })
    if (url === '/api/option/') return Promise.resolve({ data: { success: true, data: [{ key: 'TaskPluginEnabled', value: 'true' }] } })
    if (url === '/api/plugin/task/marketplace/sources') return Promise.resolve({ data: { success: true, data: [] } })
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TaskPluginsPage />
      <Toaster />
    </QueryClientProvider>,
  )
}

describe('resolvePluginParts', () => {
  it('treats a server that predates plugin parts as listing task plugins', () => {
    const legacy = { meta: { relay: null } } as never
    expect(resolvePluginParts(legacy)).toEqual({ task: true, provider: false, login: false, refresh: false, transform: false })
  })

  it('reads a provider part from relay routes when the flag is missing', () => {
    expect(resolvePluginParts({ meta: { relay: [{}] } } as never).provider).toBe(true)
  })
})

describe('TaskPluginsPage', () => {
  it('splits the installed plugins by kind, with a count for each', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TaskPluginsPage />
      </QueryClientProvider>,
    )

    const kinds = within(await screen.findByRole('group', { name: 'Plugin kind' }))
    expect(kinds.getByRole('button', { name: /Task/ })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('video')).toBeInTheDocument()
    expect(screen.queryByText('redact')).not.toBeInTheDocument()

    fireEvent.click(kinds.getByRole('button', { name: /Request processing/ }))
    expect(await screen.findByText('redact')).toBeInTheDocument()
    expect(screen.queryByText('video')).not.toBeInTheDocument()

    fireEvent.click(kinds.getByRole('button', { name: /Channel/ }))
    expect(await screen.findByText('vendor')).toBeInTheDocument()
    expect(screen.getByText('Account login')).toBeInTheDocument()
  })
})

describe('a plugin change that leaves models unpriced', () => {
  it('lists those models instead of reporting plain success', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        data: { pricing_issues: [{ model_name: 'video-1', plugin_key: 'video', plugin_name: 'video', reason: 'unconfigured' }] },
      },
    })
    renderPage()

    fireEvent.click(await screen.findByRole('switch', { name: 'Enable video' }))

    expect(await screen.findByText('Prices of these models need attention:')).toBeInTheDocument()
    expect(screen.getByText('video-1: No price set')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/api/plugin/task/video/status', { enabled: true }, expect.anything())
  })
})

