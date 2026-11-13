// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { createHash } from 'node:crypto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put: vi.fn(), delete: vi.fn() } }))
vi.mock('@/features/task-plugins/access', () => ({
  useTaskPluginsAccess: () => ({ error: null, isRefetching: false, retry: () => {}, state: 'granted' }),
}))

const { TaskPluginsPage } = await import('@/features/task-plugins/TaskPluginsPage')
const { MarketplacePanel } = await import('@/features/task-plugins/components/MarketplacePanel')
const { COMMUNITY_MARKETPLACE_INDEX_URL, DEFAULT_MARKETPLACE_INDEX_URL, marketplaceSourceKind, parseMarketplaceIndex } =
  await import('@/features/task-plugins/lib/marketplace')

const TAKEN_DOWN = 'a'.repeat(64)
const COMMUNITY_SOURCE = 'export const meta = {}\n'
const SOURCE_SHA256 = createHash('sha256').update(COMMUNITY_SOURCE).digest('hex')
const THIRD_PARTY_URL = 'https://plugins.example.com/index.json'

function installed(key: string, version: string, sourceHash: string) {
  return {
    active: true,
    channel_count: 0,
    enabled: true,
    in_flight_count: 0,
    meta: { apiVersion: 1, author: { name: 'A' }, fetchMode: 'per_task', key, models: [], name: key, version },
    remark: '',
    runtime_status: 'registered',
    source: 'override',
    source_hash: sourceHash,
    task: true,
  }
}

function indexEntry(key: string, latest: string, versions: string[], extra: Record<string, unknown> = {}) {
  return {
    key,
    latest,
    name: key,
    versions: versions.map((version) => ({ path: `${key}/${version}.js`, sha256: SOURCE_SHA256, version })),
    ...extra,
  }
}

const INDEXES: Record<string, unknown> = {
  [DEFAULT_MARKETPLACE_INDEX_URL]: { indexVersion: 1, name: 'Official', plugins: [indexEntry('video', '1.1.0', ['1.1.0', '1.0.0'])] },
  [COMMUNITY_MARKETPLACE_INDEX_URL]: {
    indexVersion: 1,
    name: 'Community',
    plugins: [indexEntry('alice_tool', '2.0.0', ['2.0.0'], { author: { login: 'alice' }, installs30d: 1234 })],
    revoked: [{ sha256: TAKEN_DOWN.toUpperCase(), key: 'alice_tool', reason: { en: 'Leaked keys', zh: '泄露密钥' } }],
  },
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  get.mockImplementation((url: string) => {
    if (url === '/api/plugin/task') {
      return Promise.resolve({
        data: { success: true, data: [installed('video', '1.0.0', 'c'.repeat(64)), installed('alice_tool', '2.0.0', TAKEN_DOWN)] },
      })
    }
    if (url === '/api/option/') return Promise.resolve({ data: { success: true, data: [{ key: 'TaskPluginEnabled', value: 'true' }] } })
    if (url === '/api/plugin/task/marketplace/sources') {
      return Promise.resolve({
        data: {
          success: true,
          data: [
            { index_url: DEFAULT_MARKETPLACE_INDEX_URL, name: 'Official' },
            { index_url: COMMUNITY_MARKETPLACE_INDEX_URL, name: 'Community' },
          ],
        },
      })
    }
    throw new Error(`unmocked GET ${url}`)
  })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url in INDEXES) return Promise.resolve(new Response(JSON.stringify(INDEXES[url])))
      if (url.endsWith('.js')) return Promise.resolve(new Response(COMMUNITY_SOURCE))
      return Promise.resolve(new Response('', { status: 404 }))
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderWithQuery(element: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>)
}

describe('parseMarketplaceIndex', () => {
  it('keeps takedowns with a valid digest and lists recommended, then most installed plugins first', () => {
    const index = parseMarketplaceIndex({
      indexVersion: 1,
      plugins: [
        indexEntry('a_low', '1.0.0', ['1.0.0'], { installs30d: 3 }),
        indexEntry('b_high', '1.0.0', ['1.0.0'], { installs30d: 90 }),
        indexEntry('c_pick', '1.0.0', ['1.0.0'], { recommended: true }),
      ],
      revoked: [{ sha256: TAKEN_DOWN }, { sha256: 'not-a-digest' }],
    })

    expect(index.plugins.map((plugin) => plugin.key)).toEqual(['c_pick', 'b_high', 'a_low'])
    expect(index.revoked).toEqual([{ key: undefined, reason: undefined, sha256: TAKEN_DOWN }])
  })

  it('classifies sources by address the way the gateway does', () => {
    expect(marketplaceSourceKind(DEFAULT_MARKETPLACE_INDEX_URL)).toBe('official')
    expect(marketplaceSourceKind(COMMUNITY_MARKETPLACE_INDEX_URL)).toBe('community')
    expect(marketplaceSourceKind(THIRD_PARTY_URL)).toBe('third_party')
  })
})

describe('the installed plugin list', () => {
  it('shows newer official versions and community takedowns of installed code', async () => {
    renderWithQuery(<TaskPluginsPage />)

    expect(await screen.findByText('Update available: v1.1.0')).toBeInTheDocument()
    expect(await screen.findByText(/This version was taken down from community plugins\./)).toHaveTextContent('Reason: Leaked keys')
  })
})

describe('installing from the marketplace', () => {
  it('names the source it installs from, and shows a community plugin what it can reach', async () => {
    post.mockResolvedValue({
      data: { success: true, data: { meta: { key: 'alice_tool', name: 'alice_tool', version: '2.0.0' }, plugin: { active: true } } },
    })
    renderWithQuery(<MarketplacePanel installed={[]} />)

    await screen.findByRole('option', { name: 'Community · Community' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Marketplace source' }), {
      target: { value: COMMUNITY_MARKETPLACE_INDEX_URL },
    })
    expect(await screen.findByText('@alice')).toBeInTheDocument()
    expect(screen.getByText(/1,234 installs in 30 days/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(await screen.findByText('What this plugin can reach')).toBeInTheDocument()

    const install = await screen.findByRole('button', { name: 'Install and enable' })
    await vi.waitFor(() => expect(install).toBeEnabled())
    fireEvent.click(install)

    await vi.waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/plugin/task',
        expect.objectContaining({ marketplaceIndexUrl: COMMUNITY_MARKETPLACE_INDEX_URL, source: COMMUNITY_SOURCE }),
        expect.anything(),
      ),
    )
  })
})
