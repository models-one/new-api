// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AsyncTasksPage } from '@/features/task-logs/AsyncTasksPage'
import type { AsyncTask } from '@/features/task-logs/api'
import { getJson } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  deleteJson: vi.fn(),
  getJson: vi.fn(),
  getRawJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
}))

const mockedGetJson = vi.mocked(getJson)

/**
 * Field-for-field a verbatim item from `GET /api/task/self` on the dev server —
 * including `channel_id: 0`, which is what a non-admin always reads because
 * `model.TaskGetAllUserTask` omits the column, and no `username` key at all.
 */
function buildTask(overrides: Partial<AsyncTask> = {}): AsyncTask {
  return {
    id: 900001,
    created_at: 1788040000,
    updated_at: 1788040030,
    task_id: 'taskprobe001',
    platform: 'suno',
    user_id: 1,
    group: 'default',
    channel_id: 0,
    quota: 12000,
    action: 'MUSIC',
    status: 'SUCCESS',
    fail_reason: '',
    submit_time: 1788040000,
    start_time: 1788040001,
    finish_time: 1788040030,
    progress: '100%',
    properties: { input: 'a song about rain' },
    data: {},
    ...overrides,
  }
}

type Call = { url: string; params: Record<string, unknown> }

let calls: Call[] = []

function respond(options: {
  role?: number
  items?: AsyncTask[]
  enableTask?: boolean
  failList?: boolean
}) {
  const { role = 1, items = [], enableTask = true, failList = false } = options
  mockedGetJson.mockImplementation(async (url, config) => {
    const params = { ...(config?.params as Record<string, unknown> | undefined) }
    if (url === '/api/status') {
      return { quota_per_unit: 500_000, enable_drawing: true, enable_task: enableTask }
    }
    if (url === '/api/user/self') return { id: 1, username: 'root', role }
    if (url === '/api/task/self' || url === '/api/task/') {
      calls.push({ url, params })
      if (failList) throw new Error('task listing exploded')
      return { page: 1, page_size: 20, total: items.length, items }
    }
    throw new Error(`unexpected url ${url}`)
  })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  })
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
  )
  return render(<AsyncTasksPage />, { wrapper })
}

const lastCall = () => calls[calls.length - 1]

/** Waits past the loading skeleton for the row body to actually render. */
async function findLoadedTable(taskId = 'taskprobe001') {
  const table = await screen.findByRole('table', { name: 'Async tasks' })
  await waitFor(() => expect(within(table).getAllByText(taskId)).not.toHaveLength(0))
  return table
}

beforeEach(() => {
  calls = []
  mockedGetJson.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('endpoint selection by role', () => {
  it('reads the self endpoint for a normal user and offers no scope switch', async () => {
    respond({ role: 1, items: [buildTask()] })
    renderPage()

    await waitFor(() => expect(lastCall()?.url).toBe('/api/task/self'))
    expect(screen.queryByRole('button', { name: 'All users' })).not.toBeInTheDocument()
  })

  it('switches an admin to the all-users listing on demand', async () => {
    respond({ role: 10, items: [buildTask()] })
    renderPage()

    await waitFor(() => expect(lastCall()?.url).toBe('/api/task/self'))
    fireEvent.click(await screen.findByRole('button', { name: 'All users' }))
    await waitFor(() => expect(lastCall()?.url).toBe('/api/task/'))
  })

  it('sends an admin back to their own tasks when the scope is switched back', async () => {
    respond({ role: 10, items: [buildTask()] })
    renderPage()

    await findLoadedTable()
    fireEvent.click(await screen.findByRole('button', { name: 'All users' }))
    await waitFor(() => expect(lastCall().url).toBe('/api/task/'))

    fireEvent.click(screen.getByRole('button', { name: 'My tasks' }))
    await waitFor(() => expect(lastCall().url).toBe('/api/task/self'))
  })
})

describe('columns the server only fills for an admin', () => {
  it('omits the user column, because /self never returns a username', async () => {
    respond({ role: 1, items: [buildTask()] })
    renderPage()

    const table = await findLoadedTable()
    expect(within(table).queryByRole('columnheader', { name: /User/ })).not.toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: /Channel/ })).not.toBeInTheDocument()
  })

  it('shows the username the admin listing adds', async () => {
    respond({ role: 10, items: [buildTask({ username: 'root', channel_id: 9 })] })
    renderPage()

    await findLoadedTable()
    fireEvent.click(await screen.findByRole('button', { name: 'All users' }))

    await waitFor(() => {
      const table = screen.getByRole('table', { name: 'Async tasks' })
      expect(within(table).getByRole('columnheader', { name: /User/ })).toBeInTheDocument()
      expect(within(table).getAllByText('root')).not.toHaveLength(0)
      expect(within(table).getAllByText('9')).not.toHaveLength(0)
    })
  })

  it('falls back to the user id when the admin payload has no username', async () => {
    respond({ role: 10, items: [buildTask({ user_id: 42, username: undefined })] })
    renderPage()

    await findLoadedTable()
    fireEvent.click(await screen.findByRole('button', { name: 'All users' }))

    await waitFor(() => {
      const table = screen.getByRole('table', { name: 'Async tasks' })
      expect(within(table).getAllByText('42')).not.toHaveLength(0)
    })
  })
})

describe('platform is a channel-type number, not a product name', () => {
  it('names a known numeric channel type', async () => {
    respond({ role: 1, items: [buildTask({ platform: '50' })] })
    renderPage()

    const table = await findLoadedTable()
    expect(within(table).getAllByText('Kling')).not.toHaveLength(0)
  })

  it('shows an unmapped channel type verbatim rather than calling it unknown', async () => {
    respond({ role: 1, items: [buildTask({ platform: '999' })] })
    renderPage()

    const table = await findLoadedTable()
    expect(within(table).getAllByText('999')).not.toHaveLength(0)
    expect(within(table).queryByText('Unknown')).not.toBeInTheDocument()
  })
})

describe('filters', () => {
  it('sends the time window in SECONDS, matching the task submit_time column', async () => {
    respond({ role: 1, items: [buildTask()] })
    renderPage()

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: '24h' } })

    await waitFor(() => {
      const sent = lastCall().params.start_timestamp
      expect(typeof sent).toBe('number')
      // Seconds: an epoch-milliseconds value would be a thousand times larger.
      expect(sent as number).toBeLessThan(100_000_000_000)
      expect(sent as number).toBeGreaterThan(1_000_000_000)
    })
  })

  it('sends the platform, status and action the server understands', async () => {
    respond({ role: 1, items: [buildTask()] })
    renderPage()

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))

    fireEvent.change(screen.getByLabelText('Platform'), { target: { value: 'suno' } })
    await waitFor(() => expect(lastCall().params.platform).toBe('suno'))

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'FAILURE' } })
    await waitFor(() => expect(lastCall().params.status).toBe('FAILURE'))

    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'textGenerate' } })
    await waitFor(() => expect(lastCall().params.action).toBe('textGenerate'))
  })

  it('never sends channel_id from the self scope, which ignores it', async () => {
    respond({ role: 1, items: [buildTask()] })
    renderPage()

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(screen.queryByLabelText('Channel ID')).not.toBeInTheDocument()
    expect(calls.every((call) => call.params.channel_id === undefined)).toBe(true)
  })

  it('drops the channel filter again when an admin leaves the all-users scope', async () => {
    respond({ role: 10, items: [buildTask()] })
    renderPage()

    await findLoadedTable()
    fireEvent.click(await screen.findByRole('button', { name: 'All users' }))

    const channelInput = await screen.findByLabelText('Channel ID')
    fireEvent.change(channelInput, { target: { value: '9' } })
    await waitFor(() => expect(lastCall().params.channel_id).toBe('9'), { timeout: 2000 })

    fireEvent.click(screen.getByRole('button', { name: 'My tasks' }))
    await waitFor(() => {
      expect(lastCall().url).toBe('/api/task/self')
      expect(lastCall().params.channel_id).toBeUndefined()
    })
  })

  it('clears every filter on reset', async () => {
    respond({ role: 1, items: [buildTask()] })
    renderPage()

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'SUCCESS' } })
    await waitFor(() => expect(lastCall().params.status).toBe('SUCCESS'))

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    await waitFor(() => expect(lastCall().params.status).toBeUndefined())
  })
})

describe('states', () => {
  it('explains that no job has run rather than looking broken', async () => {
    respond({ role: 1, items: [] })
    renderPage()

    expect(await screen.findAllByText('No async tasks yet')).not.toHaveLength(0)
    expect(
      screen.getAllByText(
        'You have not submitted an asynchronous job yet. Music and video requests you send through the API appear here.',
      ),
    ).not.toHaveLength(0)
  })

  it('distinguishes an empty filter result from an empty account', async () => {
    respond({ role: 1, items: [] })
    renderPage()

    await screen.findAllByText('No async tasks yet')
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'FAILURE' } })

    await waitFor(() => expect(screen.getAllByText('No matching tasks')).not.toHaveLength(0))
  })

  it('surfaces a listing failure with a retry instead of an empty table', async () => {
    respond({ role: 1, failList: true })
    renderPage()

    expect(await screen.findByText('Could not load tasks')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Async tasks' })).not.toBeInTheDocument()
  })

  it('refuses to render the table when enable_task is off', async () => {
    respond({ role: 10, enableTask: false, items: [buildTask()] })
    renderPage()

    expect(await screen.findByText('Async tasks are turned off')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Async tasks' })).not.toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })
})

describe('progress', () => {
  it('renders a real bar for a parseable percentage', async () => {
    respond({ role: 1, items: [buildTask({ progress: '45%' })] })
    renderPage()

    await findLoadedTable()
    const bars = screen.getAllByRole('progressbar', { name: /Progress for task/ })
    expect(bars[0]).toHaveAttribute('aria-valuenow', '45')
  })

  it('shows unparseable progress text verbatim instead of inventing a bar', async () => {
    respond({ role: 1, items: [buildTask({ progress: 'pending' })] })
    renderPage()

    const table = await findLoadedTable()
    expect(within(table).getAllByText('pending')).not.toHaveLength(0)
    expect(within(table).queryByRole('progressbar')).not.toBeInTheDocument()
  })
})

describe('untrusted upstream text', () => {
  it('renders a fail reason containing markup as characters, never as elements', async () => {
    respond({
      role: 1,
      items: [buildTask({ status: 'FAILURE', fail_reason: '<script>alert(1)</script>' })],
    })
    renderPage()

    const table = await findLoadedTable()
    expect(within(table).getAllByText('<script>alert(1)</script>')).not.toHaveLength(0)
    expect(table.querySelector('script')).toBeNull()
  })

  it('opens the recorded prompt in the row detail', async () => {
    respond({ role: 1, items: [buildTask({ properties: { input: 'a song about rain' } })] })
    renderPage()

    const table = await findLoadedTable()
    fireEvent.click(within(table).getByRole('button', { name: 'Toggle task details' }))

    expect(await screen.findAllByText('a song about rain')).not.toHaveLength(0)
  })

  it('survives a task whose properties are null', async () => {
    respond({ role: 1, items: [buildTask({ properties: null })] })
    renderPage()

    const table = await findLoadedTable()
    fireEvent.click(within(table).getByRole('button', { name: 'Toggle task details' }))

    expect(
      await screen.findAllByText('The backend recorded no prompt for this task.'),
    ).not.toHaveLength(0)
  })
})
