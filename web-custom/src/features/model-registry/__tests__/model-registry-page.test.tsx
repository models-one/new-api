// @vitest-environment happy-dom

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

import type {
  RegistryModel,
  SyncPreview,
  SyncResult,
  Vendor,
} from '@/features/model-registry/api'

const { ModelRegistryPage } = await import('@/features/model-registry/ModelRegistryPage')
const { MODEL_REGISTRY_ADMIN_ROLE } = await import('@/features/model-registry/access')

const rootViewer = { id: 1, role: 100, username: 'root' }
const adminViewer = { id: 11, role: 10, username: 'an_admin' }
const plainViewer = { id: 2, role: 1, username: 'member' }

/** A verbatim row from `GET /api/models/` on the dev server. */
const exactRow: RegistryModel = {
  bound_channels: [{ name: 'local-test', type: 1 }],
  created_time: 1_788_578_034,
  description: 'Small omni GPT for cheap multimodal assistance',
  enable_groups: ['default'],
  endpoints: '["openai"]',
  icon: 'OpenAI',
  id: 2,
  model_name: 'gpt-4o-mini',
  name_rule: 0,
  quota_types: [0],
  status: 1,
  sync_official: 0,
  tags: 'Tools,Files,Vision,128K',
  updated_time: 1_788_578_034,
  vendor_id: 1,
}

/** A prefix rule, which is the only kind that carries `matched_models`. */
const ruleRow: RegistryModel = {
  created_time: 1_788_577_998,
  id: 1,
  matched_count: 1,
  matched_models: ['gpt-4o-mini'],
  model_name: 'gpt-4o',
  name_rule: 1,
  status: 0,
  sync_official: 1,
  updated_time: 1_788_578_047,
}

const vendors: Vendor[] = [
  { created_time: 1, icon: 'OpenAI', id: 1, name: 'OpenAI', status: 1, updated_time: 1 },
]

const preview: SyncPreview = {
  conflicts: [
    {
      fields: [
        { field: 'description', local: 'local desc', upstream: 'Omni-era GPT' },
        { field: 'vendor', local: '', upstream: 'OpenAI' },
      ],
      model_name: 'gpt-4o',
    },
  ],
  missing: ['gpt-4o-mini'],
  source: {
    locale: '',
    models_url: 'https://basellm.github.io/llm-metadata/api/newapi/models.json',
    vendors_url: 'https://basellm.github.io/llm-metadata/api/newapi/vendors.json',
  },
}

const syncResult: SyncResult = {
  created_list: ['gpt-4o-mini'],
  created_models: 1,
  created_vendors: 0,
  skipped_models: ['my-custom-model'],
  source: preview.source,
  updated_list: ['gpt-4o'],
  updated_models: 1,
}

type ServerState = {
  viewer: typeof rootViewer
  items: RegistryModel[]
  total: number
  missing: string[]
  listFails: boolean
  selfFails: boolean
  missingFails: boolean
  previewFails: boolean
}

let server: ServerState

function envelope(data: unknown) {
  return Promise.resolve({ data: { data, message: '', success: true } })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<ModelRegistryPage />, { wrapper })
}

/**
 * The page renders the desktop table and the mobile card list side by side and hides one
 * with a Tailwind breakpoint, so both are in the DOM under happy-dom. Every row assertion
 * is scoped to the table to keep the duplicates apart.
 */
async function definitionTable() {
  return within(await screen.findByRole('table', { name: 'Model definitions' }))
}

async function definitionRow(name: string) {
  const table = await definitionTable()
  const cell = await table.findByText(name)
  return within(cell.closest('tr') as HTMLElement)
}

async function rowMenu(name: string) {
  const cells = await definitionRow(name)
  fireEvent.click(cells.getByRole('button', { name: `More actions for ${name}` }))
  return within(await screen.findByRole('menu'))
}

beforeEach(() => {
  server = {
    items: [],
    listFails: false,
    missing: [],
    missingFails: false,
    previewFails: false,
    selfFails: false,
    total: 0,
    viewer: rootViewer,
  }
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()

  get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/api/status') return envelope({ quota_per_unit: 500_000 })
    if (url === '/api/user/self') {
      if (server.selfFails) return Promise.reject(new Error('self is unavailable'))
      return envelope(server.viewer)
    }
    if (url === '/api/vendors/') {
      return envelope({ items: vendors, page: 1, page_size: 100, total: vendors.length })
    }
    if (url === '/api/models/missing') {
      if (server.missingFails) return Promise.reject(new Error('missing is unavailable'))
      return envelope(server.missing)
    }
    if (url === '/api/models/sync_upstream/preview') {
      if (server.previewFails) {
        return Promise.resolve({ data: { message: '获取上游模型失败: timeout', success: false } })
      }
      return envelope(preview)
    }
    if (url === '/api/models/' || url === '/api/models/search') {
      if (server.listFails) return Promise.reject(new Error('the definition list is unavailable'))
      const pageSize = Number(config?.params?.page_size ?? 20)
      return envelope({
        items: server.items,
        page: 1,
        page_size: pageSize,
        total: server.total,
        vendor_counts: { '1': server.total },
      })
    }
    if (url.startsWith('/api/models/')) {
      const id = Number(url.slice('/api/models/'.length))
      const match = server.items.find((item) => item.id === id)
      if (match === undefined) {
        return Promise.resolve({ data: { message: 'record not found', success: false } })
      }
      return envelope(match)
    }
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

describe('the administrator guard', () => {
  it('gates on the RoleAdminUser threshold AdminAuth enforces, not on root', () => {
    expect(MODEL_REGISTRY_ADMIN_ROLE).toBe(10)
  })

  it('refuses a non-admin and never calls a registry endpoint', async () => {
    server.viewer = plainViewer
    renderPage()

    expect(await screen.findByText('Administrator access required')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New definition' })).not.toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/models/', expect.anything())
    expect(get).not.toHaveBeenCalledWith('/api/models/missing', expect.anything())
  })

  it('admits a role-10 administrator, since no route here needs root', async () => {
    server.viewer = adminViewer
    renderPage()

    await definitionTable()
    expect(screen.queryByText('Administrator access required')).not.toBeInTheDocument()
  })

  it('reports a failed role lookup instead of claiming the account lacks the role', async () => {
    server.selfFails = true
    renderPage()

    expect(await screen.findByText('Could not confirm your permissions')).toBeInTheDocument()
    expect(screen.queryByText('Administrator access required')).not.toBeInTheDocument()
  })
})

describe('the definition table', () => {
  it('shows a real empty state when nothing is defined', async () => {
    renderPage()

    const table = await definitionTable()
    expect(await table.findByText('No model definitions yet')).toBeInTheDocument()
  })

  it('offers a retry rather than an empty table when the list request fails', async () => {
    server.listFails = true
    renderPage()

    expect(await screen.findByText('Could not load the model definitions')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('renders the match rule and resolves the vendor id against the vendor list', async () => {
    server.items = [exactRow]
    server.total = 1
    renderPage()

    const cells = await definitionRow('gpt-4o-mini')
    expect(cells.getByText('Exact')).toBeInTheDocument()
    expect(cells.getByText('OpenAI')).toBeInTheDocument()
    expect(cells.getByText('Enabled')).toBeInTheDocument()
    // sync_official 0 — the sync must never overwrite this row.
    expect(cells.getByText('Pinned')).toBeInTheDocument()
  })

  it('shows how many published names a rule row matched, and only for rule rows', async () => {
    server.items = [ruleRow, exactRow]
    server.total = 2
    renderPage()

    const rule = await definitionRow('gpt-4o')
    expect(rule.getByText('Prefix')).toBeInTheDocument()
    expect(rule.getByText('1 matched')).toBeInTheDocument()
    expect(rule.getByText('Disabled')).toBeInTheDocument()

    const exact = await definitionRow('gpt-4o-mini')
    expect(exact.queryByText(/matched$/)).not.toBeInTheDocument()
  })

  it('says "None" for a row whose vendor_id the API omitted', async () => {
    server.items = [ruleRow]
    server.total = 1
    renderPage()

    const cells = await definitionRow('gpt-4o')
    expect(cells.getByText('None')).toBeInTheDocument()
  })
})

describe('the list endpoint choice', () => {
  it('uses the plain list while no keyword or vendor is set', async () => {
    renderPage()
    await definitionTable()

    expect(get).toHaveBeenCalledWith('/api/models/', expect.anything())
    expect(get).not.toHaveBeenCalledWith('/api/models/search', expect.anything())
  })

  it('passes the status and upstream facets the plain list does understand', async () => {
    renderPage()
    await definitionTable()

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'disabled' } })

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/models/',
        expect.objectContaining({
          params: expect.objectContaining({ status: 'disabled' }),
        }),
      )
    })
    expect(get).not.toHaveBeenCalledWith('/api/models/search', expect.anything())
  })

  it('switches to /search for a vendor, which the plain list hard-codes to empty', async () => {
    server.items = [exactRow]
    server.total = 1
    renderPage()
    await definitionRow('gpt-4o-mini')

    const vendorFilter = screen.getByLabelText('Vendor')
    // The facet counts come from `vendor_counts`, which ignores the active filters.
    await waitFor(() => {
      expect(within(vendorFilter).getByRole('option', { name: 'OpenAI (1)' })).toBeInTheDocument()
    })
    fireEvent.change(vendorFilter, { target: { value: '1' } })

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/models/search',
        expect.objectContaining({ params: expect.objectContaining({ vendor: '1' }) }),
      )
    })
  })

  it('switches to /search for a keyword and returns to page 1', async () => {
    server.items = [exactRow]
    server.total = 60
    renderPage()
    await definitionRow('gpt-4o-mini')

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/models/',
        expect.objectContaining({ params: expect.objectContaining({ p: 2 }) }),
      )
    })

    fireEvent.change(screen.getByLabelText('Search model definitions'), {
      target: { value: 'gpt' },
    })

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/models/search',
        expect.objectContaining({ params: expect.objectContaining({ keyword: 'gpt', p: 1 }) }),
      )
    })
  })
})

describe('the undefined-model list', () => {
  it('names the models a channel serves without a definition and offers to define one', async () => {
    server.missing = ['claude-3-5-sonnet-20241022', 'my-custom-model']
    renderPage()

    expect(await screen.findByText('Served without a definition')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Define my-custom-model' }))

    const drawer = within(await screen.findByRole('dialog', { name: 'New model definition' }))
    expect(drawer.getByLabelText(/Model name/)).toHaveValue('my-custom-model')
  })

  it('says so plainly when every served model already has a definition', async () => {
    renderPage()
    expect(await screen.findByText('Every served model has a definition')).toBeInTheDocument()
  })

  it('reports a failed check instead of implying nothing is missing', async () => {
    server.missingFails = true
    renderPage()

    expect(await screen.findByText('Could not check for undefined models')).toBeInTheDocument()
    expect(screen.queryByText('Every served model has a definition')).not.toBeInTheDocument()
  })
})

describe('destructive and state-changing row actions', () => {
  it('will not delete until the model name is typed back', async () => {
    server.items = [exactRow]
    server.total = 1
    del.mockResolvedValue({ data: { data: null, message: '', success: true } })
    renderPage()

    const menu = await rowMenu('gpt-4o-mini')
    fireEvent.click(menu.getByRole('menuitem', { name: 'Delete definition' }))

    const dialog = within(await screen.findByRole('dialog', { name: 'Delete this model definition?' }))
    const confirm = dialog.getByRole('button', { name: 'Delete definition' })
    expect(confirm).toBeDisabled()
    expect(del).not.toHaveBeenCalled()

    fireEvent.change(dialog.getByLabelText('Type gpt-4o-mini to confirm'), {
      target: { value: 'gpt-4o-mini' },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Delete definition' }))

    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/api/models/2', expect.anything())
    })
  })

  it('disables the state a row is already in rather than offering a no-op', async () => {
    server.items = [exactRow]
    server.total = 1
    renderPage()

    const menu = await rowMenu('gpt-4o-mini')
    expect(menu.getByRole('menuitem', { name: 'Enable' })).toHaveAttribute('aria-disabled', 'true')
    expect(menu.getByRole('menuitem', { name: 'Disable' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('flips the status through the status_only route so the rest of the row is safe', async () => {
    server.items = [exactRow]
    server.total = 1
    put.mockResolvedValue({ data: { data: null, message: '', success: true } })
    renderPage()

    const menu = await rowMenu('gpt-4o-mini')
    fireEvent.click(menu.getByRole('menuitem', { name: 'Disable' }))

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith(
        '/api/models/',
        { id: 2, status: 0 },
        expect.objectContaining({ params: { status_only: 'true' } }),
      )
    })
  })
})

describe('the upstream sync', () => {
  async function openSync() {
    renderPage()
    await definitionTable()
    const buttons = await screen.findAllByRole('button', { name: 'Sync from upstream' })
    fireEvent.click(buttons[0])
    return within(await screen.findByRole('dialog', { name: 'Sync from upstream' }))
  }

  it('reads nothing from upstream until a preview is asked for', async () => {
    const dialog = await openSync()

    expect(get).not.toHaveBeenCalledWith(
      '/api/models/sync_upstream/preview',
      expect.anything(),
    )
    expect(dialog.getByRole('button', { name: 'Preview changes' })).toBeInTheDocument()
  })

  it('offers only the locales the server can actually match', async () => {
    const dialog = await openSync()
    const select = dialog.getByLabelText('Metadata language')

    expect(within(select).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Upstream default', 'English', 'Japanese'])
  })

  it('shows the added, changed and skipped sets, and the address they came from', async () => {
    server.missing = ['gpt-4o-mini', 'my-custom-model']
    const dialog = await openSync()
    fireEvent.click(dialog.getByRole('button', { name: 'Preview changes' }))

    expect(await screen.findByText(preview.source.models_url)).toBeInTheDocument()

    const added = within(await screen.findByRole('region', { name: 'Added' }))
    expect(added.getByText('gpt-4o-mini')).toBeInTheDocument()

    const changed = within(screen.getByRole('region', { name: 'Changed' }))
    expect(changed.getByText('gpt-4o')).toBeInTheDocument()
    expect(changed.getByText('local desc')).toBeInTheDocument()
    expect(changed.getByText('Omni-era GPT')).toBeInTheDocument()

    // Derived in the browser: missing minus the names the preview offers to create.
    const skipped = within(screen.getByRole('region', { name: 'Skipped' }))
    expect(skipped.getByText('my-custom-model')).toBeInTheDocument()

    expect(post).not.toHaveBeenCalled()
  })

  it('sends no overwrite for a conflict left unticked, so a diff alone changes nothing', async () => {
    post.mockResolvedValue({ data: { data: syncResult, message: '', success: true } })
    const dialog = await openSync()
    fireEvent.click(dialog.getByRole('button', { name: 'Preview changes' }))

    // Wait for the diff itself: the footer button exists but stays disabled until it lands.
    await screen.findByText(preview.source.models_url)
    fireEvent.click(screen.getByRole('button', { name: 'Review and apply' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Apply these changes' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/models/sync_upstream',
        { locale: '', overwrite: [] },
        expect.anything(),
      )
    })
  })

  it('carries exactly the ticked fields into the apply call, after a confirmation step', async () => {
    post.mockResolvedValue({ data: { data: syncResult, message: '', success: true } })
    const dialog = await openSync()
    fireEvent.click(dialog.getByRole('button', { name: 'Preview changes' }))

    fireEvent.click(await screen.findByRole('checkbox', {
      name: 'Overwrite Description of gpt-4o',
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Review and apply' }))

    // The confirmation restates the diff rather than firing straight away.
    expect(await screen.findByText('This writes to the registry')).toBeInTheDocument()
    expect(screen.getByText('gpt-4o · description')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Apply these changes' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/models/sync_upstream',
        { locale: '', overwrite: [{ fields: ['description'], model_name: 'gpt-4o' }] },
        expect.anything(),
      )
    })

    expect(await screen.findByText('1 created')).toBeInTheDocument()
    expect(screen.getByText('1 updated')).toBeInTheDocument()
    expect(screen.getByText('1 skipped')).toBeInTheDocument()
  })

  it('surfaces the server message when the upstream files cannot be read', async () => {
    server.previewFails = true
    const dialog = await openSync()
    fireEvent.click(dialog.getByRole('button', { name: 'Preview changes' }))

    expect(await screen.findByText('The upstream metadata could not be read')).toBeInTheDocument()
    expect(screen.getByText('获取上游模型失败: timeout')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })
})
