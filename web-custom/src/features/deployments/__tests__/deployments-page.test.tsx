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

/** The guard links into the settings route; the router is not mounted in these tests. */
vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children?: ReactNode }) => <a href="#settings">{props.children}</a>,
}))

import type { Deployment, DeploymentSettings } from '@/features/deployments/api'

const { DeploymentsPage } = await import('@/features/deployments/DeploymentsPage')
const { DEPLOYMENT_ADMIN_ROLE } = await import('@/features/deployments/access')

const viewer = (role: number) => ({ id: 1, role, username: 'root' })

/**
 * A deployment row exactly as `controller.mapIoNetDeployment` assembles one: note the
 * four keys the handler hard-codes to "" and `updated_at === created_at`.
 */
const runningRow: Deployment = {
  brand_name: 'NVIDIA',
  completed_percent: 25,
  compute_minutes_remaining: 135,
  compute_minutes_served: 45,
  container_name: 'probe-cluster',
  created_at: 1_788_048_856,
  deployment_name: 'probe-cluster',
  description: '',
  hardware_info: 'NVIDIA A100 x8',
  hardware_name: 'A100',
  hardware_quantity: 8,
  id: 'dep_01HX9ZK',
  instance_count: 8,
  model_name: '',
  model_version: '',
  provider: 'io.net',
  resource_config: { cpu: '', gpu: '8', memory: '' },
  status: 'running',
  time_remaining: '2 hour 15 minutes',
  time_remaining_minutes: 135,
  type: 'Container',
  updated_at: 1_788_048_856,
}

const destroyedRow: Deployment = {
  ...runningRow,
  completed_percent: 100,
  compute_minutes_remaining: 0,
  container_name: 'old-cluster',
  deployment_name: 'old-cluster',
  id: 'dep_01HXOLD',
  status: 'destroyed',
  time_remaining: 'completed',
  time_remaining_minutes: 0,
}

type ServerState = {
  viewer: ReturnType<typeof viewer>
  selfFails: boolean
  settings: DeploymentSettings
  settingsFails: boolean
  /** null means the connection test succeeds. */
  connectionError: string | null
  items: Deployment[]
  total: number
  listFails: boolean
}

let server: ServerState

function envelope(data: unknown) {
  return Promise.resolve({ data: { data, message: '', success: true } })
}

/** `getJson` throws ApiError(message) whenever the envelope says success:false. */
function refusal(message: string) {
  return Promise.resolve({ data: { message, success: false } })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<DeploymentsPage />, { wrapper })
}

async function deploymentTable() {
  return within(await screen.findByRole('table', { name: 'GPU deployments' }))
}

async function rowMenu(name: string) {
  const table = await deploymentTable()
  const cell = await table.findByText(name)
  const row = within(cell.closest('tr') as HTMLElement)
  fireEvent.click(row.getByRole('button', { name: `More actions for ${name}` }))
  return within(await screen.findByRole('menu'))
}

beforeEach(() => {
  server = {
    connectionError: null,
    items: [],
    listFails: false,
    selfFails: false,
    settings: { can_connect: true, configured: true, enabled: true, provider: 'io.net' },
    settingsFails: false,
    total: 0,
    viewer: viewer(100),
  }
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/status') return envelope({ quota_per_unit: 500_000 })
    if (url === '/api/user/self') {
      if (server.selfFails) return Promise.reject(new Error('self is unavailable'))
      return envelope(server.viewer)
    }
    if (url === '/api/deployments/settings') {
      if (server.settingsFails) return refusal('database is locked')
      return envelope(server.settings)
    }
    if (url === '/api/deployments/' || url === '/api/deployments/search') {
      if (server.listFails) return refusal('failed to list deployments: Invalid API key provided!')
      return envelope({
        items: server.items,
        page: 1,
        page_size: 10,
        status_counts: { all: server.total, running: 1 },
        total: server.total,
      })
    }
    if (url === '/api/deployments/hardware-types') {
      return envelope({
        hardware_types: [
          {
            available: true,
            available_count: 12,
            brand_name: 'NVIDIA',
            gpu_memory: 0,
            gpu_type: '',
            hourly_rate: 0,
            id: 5,
            max_gpus: 8,
            name: 'A100',
          },
        ],
        total: 1,
        total_available: 12,
      })
    }
    if (url === '/api/deployments/locations') {
      return envelope({
        locations: [{ available: 147, id: 2, iso2: 'US', name: 'United States' }],
        total: 147,
      })
    }
    if (url === '/api/deployments/available-replicas') {
      return envelope({
        replicas: [
          {
            available_count: 6,
            hardware_id: 5,
            hardware_name: '',
            location_id: 2,
            location_name: 'United States',
            max_gpus: 1,
          },
        ],
      })
    }
    if (url === '/api/deployments/check-name') {
      return envelope({ available: true, name: 'anything' })
    }
    if (url.endsWith('/containers')) return envelope({ containers: [], total: 0 })
    if (url.startsWith('/api/deployments/')) {
      return envelope({
        amount_paid: 4.5,
        brand_name: 'NVIDIA',
        completed_percent: 25,
        compute_minutes_remaining: 135,
        compute_minutes_served: 45,
        container_config: {
          entrypoint: ['serve'],
          env_variables: { PORT: '11434' },
          image_url: 'ollama/ollama:latest',
          traffic_port: 11_434,
        },
        created_at: 1_788_048_856,
        deployment_name: 'dep_01HX9ZK',
        description: '',
        gpus_per_container: 2,
        hardware_id: 5,
        hardware_name: 'A100',
        id: 'dep_01HX9ZK',
        instance_count: 4,
        locations: [{ id: 2, iso2: 'US', name: 'United States' }],
        model_name: '',
        model_version: '',
        resource_config: { cpu: '', gpu: '8', memory: '' },
        status: 'running',
        total_containers: 4,
        total_gpus: 8,
        updated_at: 1_788_048_856,
      })
    }
    throw new Error(`unmocked GET ${url}`)
  })

  post.mockImplementation((url: string) => {
    if (url === '/api/deployments/settings/test-connection') {
      if (server.connectionError !== null) return refusal(server.connectionError)
      return envelope({ hardware_count: 3, total_available: 41 })
    }
    if (url === '/api/deployments/price-estimation') {
      return envelope({
        currency: 'USDC',
        estimated_cost: 12.5,
        estimation_valid: true,
        price_breakdown: { compute_cost: 11.5, hourly_rate: 6.25, total_cost: 12.5 },
      })
    }
    if (url === '/api/deployments/') {
      return envelope({ deployment_id: 'dep_new', message: 'Deployment created successfully', status: 'ok' })
    }
    if (url.endsWith('/extend')) return envelope({ ...runningRow, compute_minutes_remaining: 195 })
    throw new Error(`unmocked POST ${url}`)
  })

  del.mockImplementation(() =>
    envelope({
      deployment_id: 'dep_01HX9ZK',
      message: 'Deployment termination requested successfully',
      status: 'ok',
    }),
  )
})

afterEach(cleanup)

describe('the administrator guard', () => {
  it('gates on AdminAuth, the only middleware the deployments group carries', () => {
    expect(DEPLOYMENT_ADMIN_ROLE).toBe(10)
  })

  it('refuses a non-admin and never touches a deployment endpoint', async () => {
    server.viewer = viewer(1)
    renderPage()

    expect(await screen.findByText('Administrator access required')).toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/deployments/settings', expect.anything())
    expect(get).not.toHaveBeenCalledWith('/api/deployments/', expect.anything())
  })

  it('reports a failed role lookup instead of claiming the account lacks the role', async () => {
    server.selfFails = true
    renderPage()

    expect(await screen.findByText('Could not confirm your permissions')).toBeInTheDocument()
    expect(screen.queryByText('Administrator access required')).not.toBeInTheDocument()
  })
})

describe('gate 1 — the feature flag', () => {
  it('names the switch when the provider is off, and never asks io.net for anything', async () => {
    server.settings = { can_connect: false, configured: false, enabled: false, provider: 'io.net' }
    renderPage()

    expect(await screen.findByText('The io.net integration is switched off')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalledWith('/api/deployments/', expect.anything())
  })

  it('marks the connection check skipped rather than failed when the flag is off', async () => {
    server.settings = { can_connect: false, configured: false, enabled: false, provider: 'io.net' }
    renderPage()

    await screen.findByText('The io.net integration is switched off')
    const steps = within(screen.getByRole('list', { name: 'io.net readiness checks' }))
    expect(steps.getAllByText('Failed').length).toBeGreaterThan(0)
    expect(steps.getAllByText('Skipped').length).toBeGreaterThan(0)
  })

  it('separates "no key stored" from "switched off"', async () => {
    server.settings = { can_connect: false, configured: false, enabled: true, provider: 'io.net' }
    renderPage()

    expect(await screen.findByText('The io.net integration has no API key')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('does not claim the gate is shut when the settings route itself failed', async () => {
    server.settingsFails = true
    renderPage()

    expect(await screen.findByText('The io.net integration could not be checked')).toBeInTheDocument()
    expect(await screen.findByText('database is locked')).toBeInTheDocument()
    expect(screen.queryByText('The io.net integration is switched off')).not.toBeInTheDocument()
  })
})

describe('gate 2 — the live connection', () => {
  it('runs even though can_connect is true, because that field is only about configuration', async () => {
    renderPage()
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/deployments/settings/test-connection', {}, expect.anything())
    })
  })

  it('quotes io.net verbatim when the stored key is rejected', async () => {
    server.connectionError = 'failed to get max GPUs per container: Invalid API key provided!'
    renderPage()

    expect(await screen.findByText('io.net did not accept the stored key')).toBeInTheDocument()
    expect(
      await screen.findByText('failed to get max GPUs per container: Invalid API key provided!'),
    ).toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/deployments/', expect.anything())
  })

  it('re-runs both checks from the guard', async () => {
    server.connectionError = 'Invalid API key provided!'
    renderPage()

    await screen.findByText('io.net did not accept the stored key')
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => {
      expect(post.mock.calls.filter((call) => call[0] === '/api/deployments/settings/test-connection').length)
        .toBeGreaterThan(1)
    })
  })

  it('shows what io.net reported once both gates pass', async () => {
    server.items = [runningRow]
    server.total = 1
    renderPage()

    expect(await screen.findByText('Hardware types visible to this account')).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
  })
})

describe('the deployment list', () => {
  it('renders a row with the values the server actually sends', async () => {
    server.items = [runningRow]
    server.total = 1
    renderPage()

    const table = await deploymentTable()
    expect(await table.findByText('probe-cluster')).toBeInTheDocument()
    expect(table.getByText('dep_01HX9ZK')).toBeInTheDocument()
    expect(table.getByText('Running')).toBeInTheDocument()
    expect(table.getByText('NVIDIA A100 ×8')).toBeInTheDocument()
    expect(table.getByText('2h 15m')).toBeInTheDocument()
  })

  it('labels the remaining share as derived from completed_percent', async () => {
    server.items = [runningRow]
    server.total = 1
    renderPage()

    const table = await deploymentTable()
    expect(
      await table.findByText('75% of the paid window left (derived: 100 − completed_percent)'),
    ).toBeInTheDocument()
  })

  it('switches to /search only once a keyword is typed', async () => {
    server.items = [runningRow, destroyedRow]
    server.total = 2
    renderPage()
    await deploymentTable()

    expect(get).toHaveBeenCalledWith('/api/deployments/', expect.anything())
    expect(get).not.toHaveBeenCalledWith('/api/deployments/search', expect.anything())

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search deployments' }), {
      target: { value: 'old' },
    })

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/deployments/search',
        expect.objectContaining({ params: expect.objectContaining({ keyword: 'old' }) }),
      )
    })
  })

  it('says the search only covers the page the server fetched', async () => {
    server.items = [runningRow]
    server.total = 1
    renderPage()
    await deploymentTable()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search deployments' }), {
      target: { value: 'probe' },
    })

    expect(await screen.findByText(/Search runs after pagination/)).toBeInTheDocument()
  })

  it('says the status tally counts this page only, not the collection', async () => {
    server.items = [runningRow]
    server.total = 1
    renderPage()
    await deploymentTable()

    expect(screen.getByText(/describe the deployments on THIS page only/)).toBeInTheDocument()
  })

  it('sends the chosen status to the list route', async () => {
    server.items = [runningRow]
    server.total = 1
    renderPage()
    await deploymentTable()

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'destroyed' },
    })

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/deployments/',
        expect.objectContaining({ params: expect.objectContaining({ status: 'destroyed' }) }),
      )
    })
  })

  it('shows the empty state, which is what an account with no clusters sees', async () => {
    renderPage()
    expect((await screen.findAllByText('No deployments yet')).length).toBeGreaterThan(0)
  })

  it('surfaces the upstream message when the list itself fails', async () => {
    server.listFails = true
    renderPage()

    expect(await screen.findByText('Could not load the deployments')).toBeInTheDocument()
    expect(
      screen.getByText('failed to list deployments: Invalid API key provided!'),
    ).toBeInTheDocument()
  })
})

describe('terminating a deployment', () => {
  it('demands the cluster name before the delete button becomes usable', async () => {
    server.items = [runningRow]
    server.total = 1
    renderPage()

    const menu = await rowMenu('probe-cluster')
    fireEvent.click(menu.getByRole('menuitem', { name: 'Terminate' }))

    const confirm = await screen.findByRole('button', { name: 'Terminate this deployment' })
    expect(confirm).toBeDisabled()
    expect(del).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Type probe-cluster to confirm'), {
      target: { value: 'probe-cluster' },
    })
    expect(confirm).toBeEnabled()

    fireEvent.click(confirm)
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/api/deployments/dep_01HX9ZK', expect.anything())
    })
  })
})

describe('extending a deployment', () => {
  it('will not spend until an estimate for the exact hours in the field has arrived', async () => {
    server.items = [runningRow]
    server.total = 1
    renderPage()

    const menu = await rowMenu('probe-cluster')
    fireEvent.click(menu.getByRole('menuitem', { name: 'Extend (costs money)' }))

    const confirm = await screen.findByRole('button', { name: 'Extend and pay' })
    expect(confirm).toBeDisabled()

    fireEvent.click(await screen.findByRole('button', { name: 'Calculate the cost' }))
    await waitFor(() => expect(confirm).toBeEnabled())
    expect(screen.getByText('12.5000 USDC')).toBeInTheDocument()

    fireEvent.click(confirm)
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/deployments/dep_01HX9ZK/extend',
        { duration_hours: 1 },
        expect.anything(),
      )
    })
  })

  it('invalidates the estimate as soon as the hours change, so no stale price can be confirmed', async () => {
    server.items = [runningRow]
    server.total = 1
    renderPage()

    const menu = await rowMenu('probe-cluster')
    fireEvent.click(menu.getByRole('menuitem', { name: 'Extend (costs money)' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Calculate the cost' }))
    const confirm = await screen.findByRole('button', { name: 'Extend and pay' })
    await waitFor(() => expect(confirm).toBeEnabled())

    fireEvent.change(screen.getByLabelText(/Hours to add/), { target: { value: '5' } })
    await waitFor(() => expect(confirm).toBeDisabled())

    fireEvent.click(screen.getByRole('button', { name: 'Recalculate' }))
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/deployments/price-estimation',
        expect.objectContaining({ duration_hours: 5, duration_qty: 5 }),
        expect.anything(),
      )
    })
  })

  it('prices the deployment with the shape the detail route reported', async () => {
    server.items = [runningRow]
    server.total = 1
    renderPage()

    const menu = await rowMenu('probe-cluster')
    fireEvent.click(menu.getByRole('menuitem', { name: 'Extend (costs money)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Calculate the cost' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/deployments/price-estimation',
        {
          currency: 'usdc',
          duration_hours: 1,
          duration_qty: 1,
          duration_type: 'hour',
          gpus_per_container: 2,
          hardware_id: 5,
          hardware_qty: 2,
          location_ids: [2],
          replica_count: 4,
        },
        expect.anything(),
      )
    })
  })
})

describe('creating a deployment', () => {
  it('prices the values on screen and refuses to create until that estimate exists', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'New deployment' }))

    fireEvent.change(await screen.findByLabelText(/Deployment name/), {
      target: { value: 'fresh-cluster' },
    })
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/deployments/check-name',
        expect.objectContaining({ params: { name: 'fresh-cluster' } }),
      )
    })

    fireEvent.change(await screen.findByLabelText(/Hardware type/), { target: { value: '5' } })
    const location = await screen.findByRole('checkbox', { name: /United States/ })
    fireEvent.click(location)

    const review = screen.getByRole('button', { name: 'Review the cost' })
    await waitFor(() => expect(review).toBeEnabled())
    fireEvent.click(review)

    expect(await screen.findByText('Create this deployment?')).toBeInTheDocument()
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/deployments/price-estimation',
        expect.objectContaining({ hardware_id: 5, location_ids: [2], replica_count: 1 }),
        expect.anything(),
      )
    })

    const confirm = screen.getByRole('button', { name: 'Create and pay' })
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/deployments/',
        expect.objectContaining({
          hardware_id: 5,
          location_ids: [2],
          resource_private_name: 'fresh-cluster',
        }),
        expect.anything(),
      )
    })
  })

  it('keeps the review disabled while the form cannot produce a valid request', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'New deployment' }))

    const review = await screen.findByRole('button', { name: 'Review the cost' })
    expect(review).toBeDisabled()
    expect(review).toHaveAttribute('title', 'A deployment name is required.')
  })
})
