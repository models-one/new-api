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

const { SystemInfoPage } = await import('@/features/system-info/SystemInfoPage')
const { ROOT_ROLE } = await import('@/features/system-info/root-access')

const rootUser = { id: 1, role: 100, username: 'root' }
/** role 10 is `common.RoleAdminUser` — enough for AdminAuth, refused by RootAuth. */
const adminUser = { id: 2, role: 10, username: 'admin' }

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

type Instance = {
  node_name: string
  status: 'online' | 'stale'
  stale_after_seconds: number
  started_at: number
  last_seen_at: number
  info?: unknown
}

/** Shaped exactly like the row `GET /api/system-info/instances` returned on the dev server. */
function onlineNode(overrides: Partial<Instance> = {}): Instance {
  const now = nowSeconds()
  return {
    info: {
      host: { hostname: 'MacBook-Air.local' },
      node: {
        manually_configured: false,
        name: 'MacBook-Air.local',
        should_configure_manually: true,
        source: 'hostname',
      },
      resources: {
        cpu: { usage_percent: 17.504019292608263 },
        memory: { usage_percent: 47.417593002319336 },
        storage: {
          free_bytes: 61_318_922_240,
          total_bytes: 494_384_795_648,
          used_bytes: 433_065_873_408,
          used_percent: 87.59692393864418,
        },
      },
      role: { is_master: true },
      runtime: { goarch: 'arm64', goos: 'darwin', started_at: now - 3_720, version: 'v0.0.0' },
      schema_version: 1,
    },
    last_seen_at: now - 20,
    node_name: 'MacBook-Air.local',
    stale_after_seconds: 90,
    started_at: now - 3_720,
    status: 'online',
    ...overrides,
  }
}

function staleNode(overrides: Partial<Instance> = {}): Instance {
  const now = nowSeconds()
  return {
    info: {
      host: { hostname: 'worker-2' },
      node: { manually_configured: true, name: 'worker 2', source: 'manual' },
      role: { is_master: false },
      runtime: { goarch: 'amd64', goos: 'linux', started_at: now - 200_000, version: 'v0.9.1' },
    },
    last_seen_at: now - 4_000,
    node_name: 'worker 2',
    stale_after_seconds: 90,
    started_at: now - 200_000,
    status: 'stale',
    ...overrides,
  }
}

/** Verbatim from `GET /api/performance/stats`. */
const performanceStats = {
  cache_stats: {
    active_disk_files: 0,
    active_memory_buffers: 0,
    current_disk_usage_bytes: 0,
    current_memory_usage_bytes: 0,
    disk_cache_hits: 0,
    disk_cache_max_bytes: 1_073_741_824,
    disk_cache_threshold_bytes: 10_485_760,
    memory_cache_hits: 0,
  },
  config: {
    disk_cache_enabled: false,
    disk_cache_max_size_mb: 1_024,
    disk_cache_path: '',
    disk_cache_threshold_mb: 10,
    is_running_in_container: false,
    monitor_cpu_threshold: 90,
    monitor_disk_threshold: 95,
    monitor_enabled: true,
    monitor_memory_threshold: 90,
  },
  disk_cache_info: {
    exists: false,
    file_count: 0,
    path: '/tmp/new-api-body-cache',
    total_size: 0,
  },
  disk_space_info: {
    free: 61_316_067_328,
    total: 494_384_795_648,
    used: 433_068_728_320,
    used_percent: 87.5975014062413,
  },
  memory_stats: {
    alloc: 12_696_992,
    num_gc: 11,
    num_goroutine: 29,
    sys: 45_123_848,
    total_alloc: 47_342_600,
  },
}

/** Verbatim from `GET /api/performance/logs`, RFC 3339 strings and all. */
const logFiles = {
  enabled: true,
  file_count: 2,
  files: [
    { mod_time: '2026-08-30T08:13:28.137042061+08:00', name: 'oneapi-20260830080528.log', size: 16_545 },
    { mod_time: '2026-08-30T08:05:26.386462387+08:00', name: 'oneapi-20260829232953.log', size: 23_770 },
  ],
  log_dir: '/var/newapi/logs',
  newest_time: '2026-08-30T08:13:28.137042061+08:00',
  oldest_time: '2026-08-30T08:05:26.386462387+08:00',
  total_size: 40_315,
}

type ServerState = {
  user: typeof rootUser
  instances: Instance[]
  instancesFail: boolean
  statsFail: boolean
  logs: unknown
  models: unknown[]
  selfFails: boolean
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
  return render(<SystemInfoPage />, { wrapper })
}

/** The desktop table and the mobile cards both render; scope every row assertion. */
async function instanceTable() {
  return within(await screen.findByRole('table', { name: 'Deployment instances' }))
}

async function instanceRow(name: string) {
  const table = await instanceTable()
  const cell = await table.findByText(name)
  return within(cell.closest('tr') as HTMLElement)
}

beforeEach(() => {
  server = {
    instances: [],
    instancesFail: false,
    logs: logFiles,
    models: [],
    selfFails: false,
    statsFail: false,
    user: rootUser,
  }
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/user/self') {
      if (server.selfFails) return Promise.reject(new Error('self is unavailable'))
      return envelope(server.user)
    }
    if (url === '/api/system-info/instances') {
      if (server.instancesFail) return Promise.reject(new Error('the instance list is unavailable'))
      return envelope(server.instances)
    }
    if (url === '/api/performance/stats') {
      if (server.statsFail) return Promise.reject(new Error('runtime statistics are unavailable'))
      return envelope(performanceStats)
    }
    if (url === '/api/performance/logs') return envelope(server.logs)
    if (url === '/api/perf-metrics/summary') return envelope({ models: server.models })
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

describe('the root guard', () => {
  it('uses RoleRootUser, the threshold RootAuth enforces — not RoleAdminUser', () => {
    expect(ROOT_ROLE).toBe(100)
  })

  it('refuses an administrator and calls no root-only endpoint', async () => {
    server.user = adminUser
    renderPage()

    expect(await screen.findByText('Root access required')).toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/system-info/instances', expect.anything())
    expect(get).not.toHaveBeenCalledWith('/api/performance/stats', expect.anything())
  })

  it('reports a failed role lookup rather than claiming the account lacks the role', async () => {
    server.selfFails = true
    renderPage()

    expect(await screen.findByText('Could not confirm your permissions')).toBeInTheDocument()
    expect(screen.queryByText('Root access required')).not.toBeInTheDocument()
  })
})

describe('the instances panel', () => {
  it('shows a real empty state when nothing has reported a heartbeat', async () => {
    renderPage()

    const table = await instanceTable()
    expect(await table.findByText('No node has reported a heartbeat')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prune stale' })).toBeDisabled()
  })

  it('renders the fields the heartbeat actually carries for a single online node', async () => {
    server.instances = [onlineNode()]
    renderPage()

    const row = await instanceRow('MacBook-Air.local')
    expect(row.getByText('Online')).toBeInTheDocument()
    expect(row.getByText('Master')).toBeInTheDocument()
    expect(row.getByText('17.5%')).toBeInTheDocument()
    expect(row.getByText('47.4%')).toBeInTheDocument()
    expect(row.getByText('403.3 GB of 460.4 GB')).toBeInTheDocument()
    expect(row.getByText('darwin/arm64')).toBeInTheDocument()
    expect(row.getByText('v0.0.0')).toBeInTheDocument()
    expect(row.getByText('1h 2m')).toBeInTheDocument()
    // NODE_NAME is unset on this node, so the name came from the hostname.
    expect(row.getByText('Auto-named')).toBeInTheDocument()
  })

  it('degrades to dashes instead of guessing when the info column is null', async () => {
    server.instances = [
      { last_seen_at: nowSeconds() - 10, node_name: 'bare-node', info: null, stale_after_seconds: 90, started_at: nowSeconds() - 60, status: 'online' },
    ]
    renderPage()

    const row = await instanceRow('bare-node')
    expect(row.getByText('Worker')).toBeInTheDocument()
    expect(row.queryByText('Auto-named')).not.toBeInTheDocument()
    // CPU, memory and storage all have no value on this row.
    expect(row.getAllByText('—').length).toBeGreaterThanOrEqual(3)
  })

  it('refuses to offer a delete the server would reject for an online node', async () => {
    server.instances = [onlineNode()]
    renderPage()

    const row = await instanceRow('MacBook-Air.local')
    expect(
      row.getByRole('button', { name: 'MacBook-Air.local is online and cannot be removed' }),
    ).toBeDisabled()
  })

  it('deletes one stale node only after the confirmation, url-encoding its name', async () => {
    server.instances = [onlineNode(), staleNode()]
    del.mockResolvedValue({ data: { data: { deleted_count: 1 }, message: '', success: true } })
    renderPage()

    const row = await instanceRow('worker 2')
    fireEvent.click(row.getByRole('button', { name: 'Remove stale instance worker 2' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Remove this stale instance?')).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Remove instance' }))
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/api/system-info/instances/worker%202', expect.anything())
    })
  })

  it('gates the deployment-wide prune behind its own confirmation', async () => {
    server.instances = [onlineNode(), staleNode()]
    del.mockResolvedValue({ data: { data: { deleted_count: 1 }, message: '', success: true } })
    renderPage()

    const prune = await screen.findByRole('button', { name: 'Prune stale' })
    await waitFor(() => expect(prune).toBeEnabled())
    fireEvent.click(prune)

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('1 rows currently read as stale.')).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Prune stale instances' }))
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/api/system-info/stale-instances', expect.anything())
    })
  })

  it('warns when the counted master role is not exactly one node', async () => {
    server.instances = [onlineNode(), onlineNode({ node_name: 'second-master' })]
    renderPage()

    expect(await screen.findByText('More than one node holds the master role')).toBeInTheDocument()
  })

  it('warns just as loudly when no node holds the master role', async () => {
    server.instances = [staleNode()]
    renderPage()

    expect(await screen.findByText('No node holds the master role')).toBeInTheDocument()
  })

  it('says nothing about the master role on a healthy single-node deployment', async () => {
    server.instances = [onlineNode()]
    renderPage()

    await instanceRow('MacBook-Air.local')
    expect(screen.queryByText('No node holds the master role')).not.toBeInTheDocument()
    expect(screen.queryByText('More than one node holds the master role')).not.toBeInTheDocument()
  })

  it('offers a retry instead of an empty table when the list request fails', async () => {
    server.instancesFail = true
    renderPage()

    expect(await screen.findByText('Could not load instances')).toBeInTheDocument()
    expect(screen.queryByText('No node has reported a heartbeat')).not.toBeInTheDocument()
  })
})

describe('the runtime panel', () => {
  it('states that the figures describe one process, not the deployment', async () => {
    renderPage()

    expect(
      await screen.findByText(/comes from the single process that answered this request/),
    ).toBeInTheDocument()
  })

  it('renders the runtime snapshot the endpoint returns', async () => {
    renderPage()

    expect(await screen.findByText('12.1 MB')).toBeInTheDocument()
    expect(screen.getByText('29')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getAllByText('87.6%').length).toBeGreaterThan(0)
  })

  it('runs the disruptive GC only after the confirmation is accepted', async () => {
    post.mockResolvedValue({ data: { message: 'GC 已执行', success: true } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Force GC' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Force garbage collection now?')).toBeInTheDocument()
    expect(dialog.getByText(/only the node your load balancer picks is affected/)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Run garbage collection' }))
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/performance/gc', undefined, expect.anything())
    })
  })

  it('gates the body cache purge and sends the delete only on confirm', async () => {
    del.mockResolvedValue({ data: { message: '', success: true } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Clear body cache' }))

    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Clear inactive files' }))
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/api/performance/disk_cache', expect.anything())
    })
  })

  it('abandons a maintenance action when the confirmation is dismissed', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Reset counters' }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
  })

  it('disables every maintenance control when the snapshot could not be read', async () => {
    server.statsFail = true
    renderPage()

    expect(await screen.findByText('Could not load runtime statistics')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Force GC' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset counters' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear body cache' })).toBeDisabled()
  })
})

describe('the log files panel', () => {
  it('lists the files with their RFC 3339 modification times converted', async () => {
    renderPage()

    const table = within(await screen.findByRole('table', { name: 'Log files on the responding node' }))
    expect(await table.findByText('oneapi-20260830080528.log')).toBeInTheDocument()
    expect(table.getByText('16.2 KB')).toBeInTheDocument()
  })

  it('says file logging is off instead of showing an empty table', async () => {
    server.logs = { enabled: false }
    renderPage()

    expect(await screen.findByText(/File logging is switched off on the responding node/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Log files on the responding node' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete log files' })).toBeDisabled()
  })

  it('blocks the cleanup until the value is a positive whole number', async () => {
    renderPage()

    const value = await screen.findByLabelText('Files to keep')
    fireEvent.change(value, { target: { value: '' } })

    expect(screen.getByRole('button', { name: 'Delete log files' })).toBeDisabled()
    expect(screen.getByText('Enter a whole number of 1 or more.')).toBeInTheDocument()
  })

  it('sends the mode and value the controller requires, after confirmation', async () => {
    del.mockResolvedValue({
      data: {
        data: { deleted_count: 1, failed_files: null, freed_bytes: 23_770 },
        message: '',
        success: true,
      },
    })
    renderPage()

    fireEvent.change(await screen.findByLabelText('Cleanup rule'), { target: { value: 'by_days' } })
    fireEvent.change(screen.getByLabelText('Days to keep'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete log files' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText(/Every log file last modified more than 7 days ago/)).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Delete log files' }))
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith(
        '/api/performance/logs',
        expect.objectContaining({ params: { mode: 'by_days', value: 7 } }),
      )
    })
  })

  it('keeps the files a partial failure did delete instead of discarding the result', async () => {
    const { cleanupLogFiles } = await import('@/features/system-info/api')
    del.mockResolvedValue({
      data: {
        data: { deleted_count: 2, failed_files: ['oneapi-1.log'], freed_bytes: 100 },
        message: '部分文件删除失败（1/3）',
        success: false,
      },
    })

    const result = await cleanupLogFiles('by_count', 5)
    expect(result.deleted_count).toBe(2)
    expect(result.failed_files).toEqual(['oneapi-1.log'])
    expect(result.partialError).toBe('部分文件删除失败（1/3）')
  })

  it('throws when a rejected cleanup carries no data at all', async () => {
    const { cleanupLogFiles } = await import('@/features/system-info/api')
    del.mockResolvedValue({
      data: { data: null, message: 'invalid mode, must be by_count or by_days', success: false },
    })

    await expect(cleanupLogFiles('by_count', 5)).rejects.toThrow(
      'invalid mode, must be by_count or by_days',
    )
  })
})

describe('the model performance panel', () => {
  it('shows a real empty state when no request was recorded in the window', async () => {
    renderPage()

    const table = within(await screen.findByRole('table', { name: 'Model performance summary' }))
    expect(await table.findByText('No model metrics in this window')).toBeInTheDocument()
  })

  it('grades a model the gateway recorded, using the ported thresholds', async () => {
    server.models = [
      {
        avg_latency_ms: 745,
        avg_tps: 0,
        model_name: 'gpt-4o-mini',
        recent_success_rates: [0],
        success_rate: 0,
      },
    ]
    renderPage()

    const table = within(await screen.findByRole('table', { name: 'Model performance summary' }))
    const row = within((await table.findByText('gpt-4o-mini')).closest('tr') as HTMLElement)
    // The badge shows the rate, and the sparkline's screen-reader table repeats it.
    expect(row.getAllByText('0.00%').length).toBeGreaterThan(0)
    expect(row.getByText('Failing')).toBeInTheDocument()
    expect(row.getByText('745ms')).toBeInTheDocument()
    // avg_tps is 0, which the legacy formatter renders as a dash rather than "0 t/s".
    expect(row.getByText('—')).toBeInTheDocument()
  })

  it('asks the endpoint for the window the picker selects', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Model performance summary' })

    fireEvent.click(screen.getByRole('button', { name: '7d' }))

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/perf-metrics/summary',
        expect.objectContaining({ params: { hours: 168 } }),
      )
    })
  })
})
