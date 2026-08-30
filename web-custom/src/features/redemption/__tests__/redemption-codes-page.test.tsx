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

vi.mock('@/lib/http-client', () => ({ api: { get, post, put, delete: del } }))

const { RedemptionCodesPage } = await import('@/features/redemption/RedemptionCodesPage')
const { ADMIN_ROLE } = await import('@/features/redemption/admin-access')

/** `quota_per_unit` exactly as the seeded dev server reports it on `/api/status`. */
const statusFixture = { quota_per_unit: 500_000 }
const rootUser = { id: 1, role: 100, username: 'root' }
const plainUser = { id: 2, role: 1, username: 'member' }

/** Seconds since the epoch, read from the real clock the components also read. */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/** A verbatim row from `GET /api/redemption/?p=1&page_size=10` on the dev server. */
const unusedCode = {
  id: 7,
  user_id: 1,
  key: 'aaaaaaabbbbbccccddddeeeeffff0007',
  status: 1,
  name: 'probe-batch',
  quota: 500_000,
  created_time: 1_788_047_585,
  redeemed_time: 0,
  expired_time: 0,
  used_user_id: 0,
}

const usedCode = {
  ...unusedCode,
  id: 21,
  key: 'bbbbbbbccccceeeeddddffff11110021',
  name: 'probe-used',
  quota: 300_000,
  redeemed_time: 1_787_997_618,
  status: 3,
  used_user_id: 4,
}

/** status stays 1; only the lapsed `expired_time` makes this read as expired. */
function expiredCode() {
  return {
    ...unusedCode,
    expired_time: nowSeconds() - 1_000,
    id: 20,
    key: 'ccccccddddddeeeeffff0000aaaa0020',
    name: 'probe-expired',
  }
}

type ServerState = {
  user: typeof rootUser
  items: (typeof unusedCode)[]
  total: number
  complianceConfirmed: boolean
  listFails?: boolean
  selfFails?: boolean
}

let server: ServerState

function envelope(data: unknown) {
  return Promise.resolve({ data: { success: true, message: '', data } })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<RedemptionCodesPage />, { wrapper })
}

function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } })
}

/**
 * The page renders the desktop table and the mobile card list side by side and
 * hides one with a Tailwind breakpoint, so both are in the DOM under happy-dom.
 * Every row assertion is scoped to the table to keep the duplicates apart.
 */
async function codeTable() {
  return within(await screen.findByRole('table', { name: 'Redemption codes' }))
}

async function codeRow(name: string) {
  const table = await codeTable()
  const cell = await table.findByText(name)
  return within(cell.closest('tr') as HTMLElement)
}

beforeEach(() => {
  server = { complianceConfirmed: true, items: [], total: 0, user: rootUser }
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/status') return envelope(statusFixture)
    if (url === '/api/user/self') {
      if (server.selfFails) return Promise.reject(new Error('self is unavailable'))
      return envelope(server.user)
    }
    if (url === '/api/user/topup/info') {
      return envelope({ payment_compliance_confirmed: server.complianceConfirmed })
    }
    if (url === '/api/redemption/' || url === '/api/redemption/search') {
      if (server.listFails) return Promise.reject(new Error('the list is unavailable'))
      return envelope({
        items: server.items,
        page: 1,
        page_size: 20,
        total: server.total,
      })
    }
    if (url.startsWith('/api/redemption/')) {
      const id = Number(url.slice('/api/redemption/'.length))
      const match = server.items.find((item) => item.id === id)
      if (match === undefined) return Promise.resolve({ data: { success: false, message: 'record not found' } })
      return envelope(match)
    }
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

describe('administrator guard', () => {
  it('uses the RoleAdminUser threshold that AdminAuth enforces on every redemption route', () => {
    expect(ADMIN_ROLE).toBe(10)
  })

  it('refuses a non-admin and never calls a redemption endpoint', async () => {
    server.user = plainUser
    renderPage()

    expect(await screen.findByText('Administrator access required')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New codes' })).not.toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/redemption/', expect.anything())
  })

  it('reports a failed role lookup instead of claiming the account lacks the role', async () => {
    server.selfFails = true
    renderPage()

    expect(await screen.findByText('Could not confirm your permissions')).toBeInTheDocument()
    expect(screen.queryByText('Administrator access required')).not.toBeInTheDocument()
  })
})

describe('the code table', () => {
  it('shows a real empty state when the deployment has issued nothing', async () => {
    renderPage()

    const table = await codeTable()
    expect(await table.findByText('No redemption codes yet')).toBeInTheDocument()
    expect(table.getByText('Codes you create appear here with their value and redemption state.')).toBeInTheDocument()
  })

  it('masks the code, reveals it on demand, and offers a copy control', async () => {
    server.items = [unusedCode]
    server.total = 1
    renderPage()

    const cells = await codeRow('probe-batch')

    expect(cells.queryByText(unusedCode.key)).not.toBeInTheDocument()
    expect(cells.getByText('aaaaaaa••••••••0007')).toBeInTheDocument()
    expect(cells.getByRole('button', { name: 'Copy the code for probe-batch' })).toBeInTheDocument()

    fireEvent.click(cells.getByRole('button', { name: 'Reveal the code for probe-batch' }))
    expect(cells.getByText(unusedCode.key)).toBeInTheDocument()
  })

  it('converts quota with quota_per_unit and spells out the redemption facts it has', async () => {
    server.items = [usedCode]
    server.total = 1
    renderPage()

    const cells = await codeRow('probe-used')

    // 300,000 quota units / quota_per_unit 500,000.
    expect(cells.getByText('$0.60')).toBeInTheDocument()
    expect(cells.getByText('Redeemed')).toBeInTheDocument()
    // The payload carries only `used_user_id`; there is no username to show.
    expect(cells.getByText('User 4')).toBeInTheDocument()
    expect(cells.getByText('Never')).toBeInTheDocument()
  })

  it('derives Expired from the lapsed expiry of a code the database still calls unused', async () => {
    server.items = [expiredCode()]
    server.total = 1
    renderPage()

    const cells = await codeRow('probe-expired')

    expect(cells.getByText('Expired')).toBeInTheDocument()
    // Editing and the enable/disable toggle are withdrawn once a code has lapsed.
    expect(cells.getByRole('button', { name: 'Edit probe-expired' })).toBeDisabled()
    expect(cells.getByRole('button', { name: 'Disable probe-expired' })).toBeDisabled()
    expect(cells.getByRole('button', { name: 'Delete probe-expired' })).toBeEnabled()
  })

  it('offers a retry rather than an empty table when the list request fails', async () => {
    server.listFails = true
    renderPage()

    expect(await screen.findByText('Could not load redemption codes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText('No redemption codes yet')).not.toBeInTheDocument()
  })

  it('switches to the search endpoint and passes the status the server understands', async () => {
    renderPage()
    await codeTable()

    type(screen.getByLabelText('Status'), 'expired')

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/redemption/search',
        expect.objectContaining({
          params: expect.objectContaining({ keyword: '', p: 1, status: 'expired' }),
        }),
      )
    })
  })
})

describe('the payment compliance lock', () => {
  it('blocks only the create path, which is the only one the controller gates', async () => {
    server.complianceConfirmed = false
    server.items = [unusedCode]
    server.total = 1
    renderPage()

    expect(await screen.findByText('New codes cannot be generated')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New codes' })).toBeDisabled()
    // AddRedemption is the only handler in controller/redemption.go with the check.
    const cells = await codeRow('probe-batch')
    expect(cells.getByRole('button', { name: 'Edit probe-batch' })).toBeEnabled()
    expect(cells.getByRole('button', { name: 'Delete probe-batch' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete invalid codes' })).toBeEnabled()
  })

  it('leaves everything enabled once the terms are confirmed', async () => {
    server.items = [unusedCode]
    server.total = 1
    renderPage()

    expect(await screen.findByRole('button', { name: 'New codes' })).toBeEnabled()
    expect(screen.queryByText('New codes cannot be generated')).not.toBeInTheDocument()
  })
})

describe('destructive actions', () => {
  it('deletes one code only after the confirmation is accepted', async () => {
    server.items = [unusedCode]
    server.total = 1
    del.mockResolvedValue({ data: { success: true, message: '' } })
    renderPage()

    const cells = await codeRow('probe-batch')
    fireEvent.click(cells.getByRole('button', { name: 'Delete probe-batch' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Delete this redemption code?')).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Delete code' }))
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/api/redemption/7', expect.anything())
    })
  })

  it('says what "invalid" means and stays unscoped until confirmed', async () => {
    server.items = [unusedCode]
    server.total = 1
    del.mockResolvedValue({ data: { success: true, message: '', data: 3 } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete invalid codes' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(
      dialog.getByText('This deletes every redeemed code, every disabled code, and every unused code whose expiry has passed.'),
    ).toBeInTheDocument()
    expect(
      dialog.getByText(/The search box and status filter do not narrow this/),
    ).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Delete invalid codes' }))
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/api/redemption/invalid', expect.anything())
    })
  })

  it('abandons a delete when the confirmation is dismissed', async () => {
    server.items = [unusedCode]
    server.total = 1
    renderPage()

    const cells = await codeRow('probe-batch')
    fireEvent.click(cells.getByRole('button', { name: 'Delete probe-batch' }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(del).not.toHaveBeenCalled()
  })
})

describe('creating a batch', () => {
  async function openCreateDrawer() {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'New codes' }))
    return within(await screen.findByRole('dialog'))
  }

  it('refuses a name the controller would reject, without calling the server', async () => {
    const drawer = await openCreateDrawer()

    type(drawer.getByLabelText(/Batch name/), 'x'.repeat(21))
    fireEvent.click(drawer.getByRole('button', { name: 'Create codes' }))

    expect(await drawer.findByText('Enter a name of 1 to 20 characters.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses a batch count outside the 1 to 100 the server allows', async () => {
    const drawer = await openCreateDrawer()

    type(drawer.getByLabelText(/Batch name/), 'launch')
    type(drawer.getByLabelText(/Number of codes/), '101')
    fireEvent.click(drawer.getByRole('button', { name: 'Create codes' }))

    expect(await drawer.findByText('Enter a whole number between 1 and 100.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('sends the amount multiplied by quota_per_unit and the chosen expiry', async () => {
    post.mockResolvedValue({ data: { success: true, message: '', data: ['k1', 'k2'] } })
    const drawer = await openCreateDrawer()

    type(drawer.getByLabelText(/Batch name/), 'launch')
    type(drawer.getByLabelText(/Value per code/), '2.5')
    type(drawer.getByLabelText(/Number of codes/), '2')
    fireEvent.click(drawer.getByRole('radio', { name: /Never/ }))
    fireEvent.click(drawer.getByRole('button', { name: 'Create codes' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/redemption/',
        // 2.5 × 500,000.
        { count: 2, expired_time: 0, name: 'launch', quota: 1_250_000 },
        expect.anything(),
      )
    })
  })

  it('turns a 1 day preset into a unix-seconds expiry a day from now', async () => {
    post.mockResolvedValue({ data: { success: true, message: '', data: ['k1'] } })
    const drawer = await openCreateDrawer()

    type(drawer.getByLabelText(/Batch name/), 'daily')
    type(drawer.getByLabelText(/Number of codes/), '1')
    fireEvent.click(drawer.getByRole('radio', { name: /1 day/ }))

    const before = nowSeconds()
    fireEvent.click(drawer.getByRole('button', { name: 'Create codes' }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    const after = nowSeconds()

    const body = post.mock.calls[0]?.[1] as { expired_time: number }
    expect(body.expired_time).toBeGreaterThanOrEqual(before + 86_400)
    expect(body.expired_time).toBeLessThanOrEqual(after + 86_400)
  })

  it('shows the returned codes masked, once, with a copy-all control and a warning', async () => {
    post.mockResolvedValue({
      data: { success: true, message: '', data: ['aaaaaaabbbbbccccddddeeeeffff0001', 'aaaaaaabbbbbccccddddeeeeffff0002'] },
    })
    const drawer = await openCreateDrawer()

    type(drawer.getByLabelText(/Batch name/), 'launch')
    type(drawer.getByLabelText(/Number of codes/), '2')
    fireEvent.click(drawer.getByRole('button', { name: 'Create codes' }))

    expect(await drawer.findByText('Copy these codes now')).toBeInTheDocument()
    expect(drawer.getByText('2 codes created')).toBeInTheDocument()
    expect(drawer.getByRole('button', { name: 'Copy all codes' })).toBeInTheDocument()
    // Masked by default: each secret needs a deliberate reveal.
    expect(drawer.queryByText('aaaaaaabbbbbccccddddeeeeffff0001')).not.toBeInTheDocument()
    expect(drawer.getAllByText('aaaaaaa••••••••0001')).toHaveLength(1)
    expect(drawer.getByRole('button', { name: 'Reveal code 2' })).toBeInTheDocument()
    // The form is gone: the batch cannot be re-submitted from this panel.
    expect(drawer.queryByLabelText(/Batch name/)).not.toBeInTheDocument()
  })

  it('keeps the codes a half-failed batch already inserted, and says so', async () => {
    post.mockResolvedValue({
      data: { success: false, message: 'failed to insert redemption', data: ['aaaaaaabbbbbccccddddeeeeffff0001'] },
    })
    const drawer = await openCreateDrawer()

    type(drawer.getByLabelText(/Batch name/), 'launch')
    type(drawer.getByLabelText(/Number of codes/), '5')
    fireEvent.click(drawer.getByRole('button', { name: 'Create codes' }))

    expect(await drawer.findByText('The server stopped part-way through the batch')).toBeInTheDocument()
    expect(drawer.getByText('1 codes created')).toBeInTheDocument()
  })

  it('surfaces a refusal inline when the server returns no codes at all', async () => {
    post.mockResolvedValue({ data: { success: false, message: 'Redemption code count must be greater than 0' } })
    const drawer = await openCreateDrawer()

    type(drawer.getByLabelText(/Batch name/), 'launch')
    type(drawer.getByLabelText(/Number of codes/), '1')
    fireEvent.click(drawer.getByRole('button', { name: 'Create codes' }))

    expect(await drawer.findByText('The server rejected this')).toBeInTheDocument()
    expect(drawer.getByText('Redemption code count must be greater than 0')).toBeInTheDocument()
  })
})

describe('editing a code', () => {
  it('re-reads the row, hides the batch count, and offers to keep the current expiry', async () => {
    server.items = [unusedCode]
    server.total = 1
    renderPage()

    const cells = await codeRow('probe-batch')
    fireEvent.click(cells.getByRole('button', { name: 'Edit probe-batch' }))
    const drawer = within(await screen.findByRole('dialog'))

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/redemption/7', expect.anything()))
    expect(await drawer.findByDisplayValue('probe-batch')).toBeInTheDocument()
    // 500,000 quota units / quota_per_unit 500,000.
    expect(drawer.getByLabelText(/Value per code/)).toHaveValue(1)
    expect(drawer.queryByLabelText(/Number of codes/)).not.toBeInTheDocument()
    expect(drawer.getByRole('radio', { name: /Keep current expiry/ })).toBeChecked()
  })

  it('sends name, quota and expiry on the update path, and no count', async () => {
    server.items = [unusedCode]
    server.total = 1
    put.mockResolvedValue({ data: { success: true, message: '', data: unusedCode } })
    renderPage()

    const cells = await codeRow('probe-batch')
    fireEvent.click(cells.getByRole('button', { name: 'Edit probe-batch' }))
    const drawer = within(await screen.findByRole('dialog'))
    await drawer.findByDisplayValue('probe-batch')

    type(drawer.getByLabelText(/Batch name/), 'renamed')
    type(drawer.getByLabelText(/Value per code/), '3')
    fireEvent.click(drawer.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith(
        '/api/redemption/',
        { expired_time: 0, id: 7, name: 'renamed', quota: 1_500_000 },
        expect.anything(),
      )
    })
  })
})
