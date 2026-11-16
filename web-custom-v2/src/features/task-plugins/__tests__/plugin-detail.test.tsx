// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { delete: vi.fn(), get, post, put: vi.fn() } }))

const { PluginDetailDrawer } = await import('@/features/task-plugins/components/PluginDetailDrawer')
const { MarketplacePanel } = await import('@/features/task-plugins/components/MarketplacePanel')
const { NodeSyncIndicator } = await import('@/features/system-info/NodeSyncIndicator')
const { COMMUNITY_MARKETPLACE_INDEX_URL, DEFAULT_MARKETPLACE_INDEX_URL } = await import('@/features/task-plugins/lib/marketplace')

/**
 * jsdom, not happy-dom: the usage guide and changelog go through DOMPurify, which needs
 * a full DOM implementation.
 */

function envelope(data: unknown) {
  return Promise.resolve({ data: { data, message: '', success: true } })
}

function renderWithQuery(element: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>)
}

const GUARD_META = {
  apiVersion: 1,
  author: { name: 'Acme', url: 'https://acme.example' },
  configSchema: { properties: { keywords: { default: [], title: { en: 'Keywords' }, type: 'array' } }, type: 'object' },
  description: { en: 'Forwards chat requests and masks listed words.' },
  fetchMode: '',
  key: 'acme_guard',
  models: ['acme-chat'],
  name: 'Acme guard',
  relay: [{ converter: 'plugin', incoming_path: '/v1/chat/completions', models: ['acme-chat'], upstream_path: '/api/chat' }],
  version: '2.0.0',
  website: 'https://acme.example/guard',
}

const VIDEO_META = {
  apiVersion: 1,
  author: { name: 'Acme' },
  fetchMode: 'per_task',
  key: 'acme_video',
  models: ['video-1', 'video-pro'],
  name: 'Acme video',
  routes: [{ method: 'POST', path: '/v1/videos', type: 'submit' }],
  usageProfiles: [{ models: ['video-pro'], schema: { seconds: { description: { en: 'Pro video unit price' }, unit: 'second' } } }],
  usageSchema: { seconds: { description: { en: 'Video generation unit price' }, unit: 'second' } },
  version: '1.0.0',
  // Not https, so it must not become a link.
  website: 'javascript:alert(1)',
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PluginDetailDrawer', () => {
  it('opens a built-in plugin, which has no stored version, and shows the parts it has', async () => {
    get.mockImplementation((url: string, config?: { params?: unknown }) => {
      if (url === '/api/plugin/task/acme_guard/versions') return envelope([])
      if (url === '/api/plugin/task/acme_guard') {
        expect(config?.params).toBeUndefined()
        return envelope({
          layer: 'factory',
          login: false,
          meta: GUARD_META,
          provider: true,
          source: 'export const meta = {}',
          task: false,
          transform: true,
          transform_hooks: ['request', 'reply'],
        })
      }
      throw new Error(`unmocked GET ${url}`)
    })
    renderWithQuery(<PluginDetailDrawer onOpenChange={() => {}} pluginKey="acme_guard" />)

    const drawer = within(await screen.findByRole('dialog'))
    expect(await drawer.findByText('Forwards chat requests and masks listed words.')).toBeInTheDocument()
    expect(drawer.getByRole('link', { name: 'Plugin website' })).toHaveAttribute('href', 'https://acme.example/guard')

    const relay = within(drawer.getByRole('region', { name: 'Forwarded routes' }))
    expect(relay.getByText('/v1/chat/completions')).toBeInTheDocument()
    expect(relay.getByText('/api/chat')).toBeInTheDocument()
    expect(relay.getByText('Converted by the plugin')).toBeInTheDocument()

    const transform = within(drawer.getByRole('region', { name: 'Request processing' }))
    expect(transform.getByText('Before format conversion')).toBeInTheDocument()
    expect(transform.getByText('Reply check')).toBeInTheDocument()
    expect(within(transform.getByRole('table', { name: 'Settings' })).getByText('Keywords')).toBeInTheDocument()

    // No task part: nothing to bill and no task hook to dry-run.
    expect(drawer.queryByRole('tab', { name: 'Billing parameters' })).not.toBeInTheDocument()
    expect(drawer.queryByRole('tab', { name: 'Dry run' })).not.toBeInTheDocument()
    expect(drawer.queryByRole('region', { name: 'Endpoints' })).not.toBeInTheDocument()

    fireEvent.click(drawer.getByRole('tab', { name: 'Source' }))
    expect(await drawer.findByText('export const meta = {}')).toBeInTheDocument()
  })

  it('shows a task plugin its billing parameters per model group and where a skipped route is served', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/api/plugin/task/acme_video/versions') {
        return envelope([{ active: true, api_version: 1, created_at: 1, enabled: true, id: 1, key: 'acme_video', remark: '', source: 's', source_hash: 'h', version: '1.0.0' }])
      }
      if (url === '/api/plugin/task/acme_video') {
        return envelope({
          layer: 'override',
          meta: VIDEO_META,
          plugin: { active: true, api_version: 1, created_at: 1, enabled: true, id: 1, key: 'acme_video', remark: '', source: 's', source_hash: 'h', version: '1.0.0' },
          skipped_routes: ['POST /v1/videos'],
          source: 's',
          task: true,
        })
      }
      throw new Error(`unmocked GET ${url}`)
    })
    renderWithQuery(<PluginDetailDrawer onOpenChange={() => {}} pluginKey="acme_video" />)

    const drawer = within(await screen.findByRole('dialog'))
    const endpoints = within(await drawer.findByRole('region', { name: 'Endpoints' }))
    expect(endpoints.getByText('/acme_video/v1/videos')).toBeInTheDocument()
    expect(endpoints.getByText('Only served at the /acme_video address')).toBeInTheDocument()
    expect(drawer.queryByRole('link', { name: 'Plugin website' })).not.toBeInTheDocument()

    fireEvent.click(drawer.getByRole('tab', { name: 'Billing parameters' }))
    expect(await drawer.findByText('Video generation unit price')).toBeInTheDocument()
    expect(drawer.getByText('Pro video unit price')).toBeInTheDocument()
    // The default schema covers only the models no group claims.
    const defaults = within(drawer.getByRole('region', { name: 'Default' }))
    expect(defaults.getByText('video-1')).toBeInTheDocument()
    expect(defaults.queryByText('video-pro')).not.toBeInTheDocument()
  })
})

describe('the marketplace install dialog', () => {
  const SOURCE = 'export const meta = {}\n'
  const README = '# Acme guard\n\nMasks the words you list. See [setup](docs/setup.md).\n'
  const CHANGELOG = [
    '---',
    'changelogVersion: 1',
    'plugin: acme_guard',
    'version: 2.0.0',
    'locale: en',
    '---',
    '# Changelog',
    '',
    '## [2.0.0]',
    '',
    '### Added',
    '',
    '- Reply checks',
    '',
    '### Fixed',
    '',
    '- Words split across lines',
    '',
  ].join('\n')

  function stubMarketplace(readme: string) {
    const entry = {
      code: '12345678',
      key: 'acme_guard',
      latest: '2.0.0',
      name: 'Acme guard',
      versions: [
        {
          changelog: { path: 'acme_guard/2.0.0/CHANGELOG.md' },
          path: 'acme_guard/2.0.0/plugin.js',
          readme: { path: 'acme_guard/2.0.0/README.md', sourceUrl: 'https://github.com/acme/plugins/blob/main/acme_guard/README.md' },
          version: '2.0.0',
        },
      ],
      website: 'https://acme.example/guard',
    }
    get.mockImplementation((url: string) => {
      if (url === '/api/plugin/task/marketplace/sources') {
        return envelope([
          { index_url: DEFAULT_MARKETPLACE_INDEX_URL, name: 'Official' },
          { index_url: COMMUNITY_MARKETPLACE_INDEX_URL, name: 'Community' },
        ])
      }
      throw new Error(`unmocked GET ${url}`)
    })
    const fetched: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL) => {
        const url = String(input)
        fetched.push(url)
        if (url === DEFAULT_MARKETPLACE_INDEX_URL) return Promise.resolve(new Response(JSON.stringify({ indexVersion: 1, plugins: [] })))
        if (url.includes('/community/resolve?code=12345678')) {
          return Promise.resolve(new Response(JSON.stringify({ indexVersion: 1, plugins: [entry] })))
        }
        if (url.includes('/community/resolve')) return Promise.resolve(new Response('', { status: 404 }))
        if (url.endsWith('README.md')) return Promise.resolve(new Response(readme))
        if (url.endsWith('CHANGELOG.md')) return Promise.resolve(new Response(CHANGELOG))
        if (url.endsWith('plugin.js')) return Promise.resolve(new Response(SOURCE))
        return Promise.resolve(new Response('', { status: 404 }))
      }),
    )
    return fetched
  }

  async function findByCode(code: string) {
    fireEvent.change(await screen.findByLabelText(/^Plugin code/), { target: { value: code } })
    fireEvent.click(screen.getByRole('button', { name: 'Find' }))
  }

  it('finds a plugin by its code and shows its usage guide and changelog before installing', async () => {
    const fetched = stubMarketplace(README)
    renderWithQuery(<MarketplacePanel installed={[]} />)

    await findByCode('00000000')
    expect(await screen.findByText('No plugin has this code.')).toBeInTheDocument()

    await findByCode('12345678')
    expect(await screen.findByText('Result for plugin code 12345678')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    const dialog = within(await screen.findByRole('dialog'))
    const guide = within(await dialog.findByRole('region', { name: 'Usage guide' }))
    expect(guide.getByRole('heading', { name: 'Acme guard' })).toBeInTheDocument()
    // A relative link leads into the plugin's repository, never into this console.
    expect(guide.getByRole('link', { name: 'setup' })).toHaveAttribute('href', 'https://github.com/acme/plugins/blob/main/acme_guard/docs/setup.md')

    // The release notes are not fetched until their tab is opened.
    expect(fetched.some((url) => url.endsWith('CHANGELOG.md'))).toBe(false)
    fireEvent.click(dialog.getByRole('tab', { name: 'Changelog' }))
    expect(await dialog.findByText('Reply checks')).toBeInTheDocument()
    expect(dialog.getByRole('heading', { name: 'Fixed' })).toBeInTheDocument()
    expect(dialog.getByText('Words split across lines')).toBeInTheDocument()
  })

  it('refuses to render a usage guide that carries raw HTML, and says where', async () => {
    stubMarketplace('# Acme guard\n\n<img src="https://evil.example/pixel.png">\n')
    renderWithQuery(<MarketplacePanel installed={[]} />)

    await findByCode('12345678')
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(await dialog.findByText(/Could not show the usage guide\. README\.md line 3: HTML is not allowed/)).toBeInTheDocument()
    expect(document.querySelector('img[src*="evil.example"]')).toBeNull()
  })
})

describe('NodeSyncIndicator', () => {
  function topic(patch: Record<string, unknown> = {}) {
    return { applied_at: 1, error: '', errors: {}, synced: true, ...patch }
  }

  it('stays out of the way on a single node', async () => {
    get.mockImplementation(() => envelope({ nodes: [{ node_name: 'a', online: true, topics: { plugins: topic() } }], topics: [{ topic: 'plugins' }] }))
    renderWithQuery(<NodeSyncIndicator enabled topics={['plugins']} />)

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/system-info/sync', expect.anything()))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('names the node and the plugin that failed to load', async () => {
    get.mockImplementation(() =>
      envelope({
        nodes: [
          { node_name: 'node-a', online: true, topics: { plugins: topic() } },
          { node_name: 'node-b', online: true, topics: { plugins: topic({ errors: { acme_guard: 'compile error at line 3' }, synced: false }) } },
          { node_name: 'node-c', online: false, topics: {} },
        ],
        topics: [{ topic: 'plugins' }],
      }),
    )
    renderWithQuery(<NodeSyncIndicator enabled itemNames={{ acme_guard: 'Acme guard' }} topics={['plugins', 'options']} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Failed on 1 nodes' }))

    const nodes = within(await screen.findByRole('dialog', { name: 'Nodes' }))
    expect(nodes.getByText('node-a')).toBeInTheDocument()
    expect(nodes.getByText('In effect')).toBeInTheDocument()
    expect(nodes.getByText('Update failed')).toBeInTheDocument()
    expect(nodes.getByText('Acme guard')).toBeInTheDocument()
    expect(nodes.getByText('compile error at line 3')).toBeInTheDocument()
    expect(nodes.queryByText('node-c')).not.toBeInTheDocument()
  })

  it('never asks for the sync state on behalf of someone who is not root', () => {
    renderWithQuery(<NodeSyncIndicator enabled={false} topics={['plugins']} />)
    expect(get).not.toHaveBeenCalled()
  })
})
