// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DrawingTasksPage } from '@/features/task-logs/DrawingTasksPage'
import type { DrawingTask } from '@/features/task-logs/api'
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
 * Field-for-field a verbatim item from `GET /api/mj/self` on the dev server.
 * `submit_time` is MILLISECONDS, as the mj tables store it.
 */
function buildTask(overrides: Partial<DrawingTask> = {}): DrawingTask {
  return {
    id: 900001,
    code: 1,
    user_id: 1,
    action: 'IMAGINE',
    mj_id: 'mjprobe001',
    prompt: 'a cat, cinematic',
    prompt_en: '',
    description: '',
    state: '',
    submit_time: 1788040000000,
    start_time: 1788040001000,
    finish_time: 1788040030000,
    image_url: 'http://localhost:3000/mj/image/mjprobe001',
    video_url: '',
    video_urls: '',
    status: 'SUCCESS',
    progress: '100%',
    fail_reason: '',
    channel_id: 7,
    quota: 4000,
    buttons: '[]',
    properties: '{}',
    ...overrides,
  }
}

type Call = { url: string; params: Record<string, unknown> }

let calls: Call[] = []

function respond(options: {
  role?: number
  items?: DrawingTask[]
  enableDrawing?: boolean
  failList?: boolean
}) {
  const { role = 1, items = [], enableDrawing = true, failList = false } = options
  mockedGetJson.mockImplementation(async (url, config) => {
    const params = { ...(config?.params as Record<string, unknown> | undefined) }
    if (url === '/api/status') {
      return { quota_per_unit: 500_000, enable_drawing: enableDrawing, enable_task: true }
    }
    if (url === '/api/user/self') return { id: 1, username: 'root', role }
    if (url === '/api/mj/self' || url === '/api/mj/') {
      calls.push({ url, params })
      if (failList) throw new Error('mj listing exploded')
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
  return render(<DrawingTasksPage />, { wrapper })
}

const lastCall = () => calls[calls.length - 1]

/** Waits past the loading skeleton for the row body to actually render. */
async function findLoadedTable(taskId = 'mjprobe001') {
  const table = await screen.findByRole('table', { name: 'Drawing tasks' })
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

    await waitFor(() => expect(lastCall()?.url).toBe('/api/mj/self'))
    expect(screen.queryByRole('group', { name: 'Drawing task scope' })).not.toBeInTheDocument()
  })

  it('never reaches the admin listing for a normal user, even though the route exists', async () => {
    respond({ role: 1, items: [buildTask()] })
    renderPage()

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls.every((call) => call.url === '/api/mj/self')).toBe(true)
  })

  it('starts an admin on their own tasks and switches to the admin listing on demand', async () => {
    respond({ role: 10, items: [buildTask()] })
    renderPage()

    await waitFor(() => expect(lastCall()?.url).toBe('/api/mj/self'))

    fireEvent.click(await screen.findByRole('button', { name: 'All users' }))

    await waitFor(() => expect(lastCall()?.url).toBe('/api/mj/'))
  })
})

describe('admin-only columns', () => {
  it('hides the user and channel columns from a normal user', async () => {
    respond({ role: 1, items: [buildTask()] })
    renderPage()

    const table = await findLoadedTable()
    expect(within(table).queryByRole('columnheader', { name: /User ID/ })).not.toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: /Channel/ })).not.toBeInTheDocument()
  })

  it('adds them once an admin switches to the all-users scope', async () => {
    respond({ role: 10, items: [buildTask()] })
    renderPage()

    await findLoadedTable()
    fireEvent.click(await screen.findByRole('button', { name: 'All users' }))

    await waitFor(() => {
      const table = screen.getByRole('table', { name: 'Drawing tasks' })
      expect(within(table).getByRole('columnheader', { name: /User ID/ })).toBeInTheDocument()
      expect(within(table).getByRole('columnheader', { name: /Channel/ })).toBeInTheDocument()
    })
  })

  it('shows the channel filter only in the admin scope, because /self ignores it', async () => {
    respond({ role: 10, items: [buildTask()] })
    renderPage()

    await findLoadedTable()
    expect(screen.queryByLabelText('Channel ID')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'All users' }))
    await waitFor(() => expect(screen.getByLabelText('Channel ID')).toBeInTheDocument())
  })
})

describe('filters', () => {
  it('sends the time window in MILLISECONDS, matching the mj submit_time column', async () => {
    respond({ role: 1, items: [buildTask()] })
    renderPage()

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(lastCall().params.start_timestamp).toBeUndefined()

    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: '24h' } })

    await waitFor(() => {
      const sent = lastCall().params.start_timestamp
      expect(typeof sent).toBe('number')
      // Milliseconds, so it must be far past any plausible seconds value.
      expect(sent as number).toBeGreaterThan(1_600_000_000_000)
    })
  })

  it('sends an exact mj_id and returns to the first page', async () => {
    respond({ role: 1, items: [buildTask()] })
    renderPage()

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    fireEvent.change(screen.getByLabelText('Task ID'), { target: { value: 'mjprobe001' } })

    await waitFor(
      () => {
        expect(lastCall().params.mj_id).toBe('mjprobe001')
        expect(lastCall().params.p).toBe(1)
      },
      { timeout: 2000 },
    )
  })

  it('clears every filter on reset', async () => {
    respond({ role: 1, items: [buildTask()] })
    renderPage()

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: '7d' } })
    await waitFor(() => expect(lastCall().params.start_timestamp).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))

    await waitFor(() => expect(lastCall().params.start_timestamp).toBeUndefined())
  })
})

describe('states', () => {
  it('explains that no job has run rather than looking broken', async () => {
    respond({ role: 1, items: [] })
    renderPage()

    expect(await screen.findAllByText('No drawing tasks yet')).not.toHaveLength(0)
    expect(
      screen.getAllByText(
        'You have not submitted a Midjourney job yet. Drawing requests you send through the API appear here.',
      ),
    ).not.toHaveLength(0)
  })

  it('tells an admin viewing everyone that the deployment itself is idle', async () => {
    respond({ role: 10, items: [] })
    renderPage()

    await screen.findAllByText('No drawing tasks yet')
    fireEvent.click(await screen.findByRole('button', { name: 'All users' }))

    await waitFor(() =>
      expect(
        screen.getAllByText(
          'No Midjourney job has run on this deployment yet. Jobs appear here as soon as someone submits one.',
        ),
      ).not.toHaveLength(0),
    )
  })

  it('distinguishes an empty filter result from an empty account', async () => {
    respond({ role: 1, items: [] })
    renderPage()

    await screen.findAllByText('No drawing tasks yet')
    fireEvent.change(screen.getByLabelText('Time range'), { target: { value: '24h' } })

    await waitFor(() =>
      expect(screen.getAllByText('No matching drawing tasks')).not.toHaveLength(0),
    )
  })

  it('surfaces a listing failure with a retry instead of an empty table', async () => {
    respond({ role: 1, failList: true })
    renderPage()

    expect(await screen.findByText('Could not load drawing tasks')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Drawing tasks' })).not.toBeInTheDocument()
  })

  it('refuses to render the table when enable_drawing is off', async () => {
    respond({ role: 10, enableDrawing: false, items: [buildTask()] })
    renderPage()

    expect(await screen.findByText('Drawing is turned off')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Drawing tasks' })).not.toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })
})

describe('untrusted upstream text', () => {
  it('renders a prompt containing markup as characters, never as elements', async () => {
    respond({
      role: 1,
      items: [buildTask({ prompt: '<img src=x onerror=alert(1)>' })],
    })
    renderPage()

    const table = await findLoadedTable()
    expect(within(table).getAllByText('<img src=x onerror=alert(1)>')).not.toHaveLength(0)
    expect(table.querySelector('img')).toBeNull()
  })

  it('renders a fail reason containing markup as characters', async () => {
    respond({
      role: 1,
      items: [buildTask({ status: 'FAILURE', fail_reason: '<b>upstream refused</b>' })],
    })
    renderPage()

    const table = await findLoadedTable()
    expect(within(table).getAllByText('<b>upstream refused</b>')).not.toHaveLength(0)
    expect(table.querySelector('b')).toBeNull()
  })
})

describe('row detail', () => {
  it('opens the prompt, fail reason and image URL for one row', async () => {
    respond({
      role: 1,
      items: [
        buildTask({
          prompt: 'a cat, cinematic',
          status: 'FAILURE',
          fail_reason: 'upstream refused the job',
        }),
      ],
    })
    renderPage()

    const table = await findLoadedTable()
    fireEvent.click(within(table).getByRole('button', { name: 'Toggle drawing task details' }))

    // The desktop table and the mobile card list both live in the DOM under test
    // (only CSS hides one), and the reason also renders in its own column, so every
    // assertion here matches on a set rather than on a single node.
    expect(await screen.findAllByText('upstream refused the job')).not.toHaveLength(0)
    expect(await screen.findAllByText('Duration (finish − submit)')).not.toHaveLength(0)

    // The image address is shown as text and never fetched by the console.
    const links = screen.getAllByRole('link', {
      name: 'http://localhost:3000/mj/image/mjprobe001',
    })
    expect(links).not.toHaveLength(0)
    for (const link of links) {
      expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
      expect(link).toHaveAttribute('target', '_blank')
    }
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
