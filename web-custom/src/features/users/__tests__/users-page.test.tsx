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

import type { AdminUser } from '@/features/users/api'

const { UsersPage } = await import('@/features/users/UsersPage')
const { ADMIN_ROLE } = await import('@/features/users/access')

/** `quota_per_unit` exactly as the seeded dev server reports it on `/api/status`. */
const statusFixture = { quota_per_unit: 500_000 }

const rootViewer = { id: 1, role: 100, username: 'root' }
const adminViewer = { id: 11, role: 10, username: 'ua_admin_1' }
const plainViewer = { id: 2, role: 1, username: 'member' }

/** A verbatim row from `GET /api/user/?p=1&page_size=10` on the dev server. */
const memberRow: AdminUser = {
  DeletedAt: null,
  aff_code: 'kX9P',
  aff_count: 0,
  aff_history_quota: 0,
  aff_quota: 0,
  created_at: 1_788_048_856,
  discord_id: '',
  display_name: 'Renamed Probe',
  email: '',
  github_id: '',
  group: 'vip',
  id: 10,
  inviter_id: 0,
  last_login_at: 0,
  linux_do_id: '',
  oidc_id: '',
  quota: 250_000,
  remark: 'internal note',
  request_count: 0,
  role: 1,
  status: 1,
  stripe_customer: '',
  telegram_id: '',
  used_quota: 250_000,
  username: 'ua_probe_1',
  wechat_id: '',
}

const rootRow: AdminUser = {
  ...memberRow,
  display_name: 'Root User',
  group: 'default',
  id: 1,
  last_login_at: 1_788_048_823,
  quota: 100_003_227,
  remark: undefined,
  role: 100,
  used_quota: 0,
  username: 'root',
}

const deletedRow: AdminUser = {
  ...memberRow,
  DeletedAt: '2026-08-30T08:14:41.0611+08:00',
  display_name: 'ua_admin_1',
  group: 'default',
  id: 11,
  quota: 0,
  remark: undefined,
  role: 10,
  used_quota: 0,
  username: 'ua_admin_1',
}

const adminRow: AdminUser = { ...deletedRow, DeletedAt: null, id: 12, username: 'ua_admin_2' }

type ServerState = {
  viewer: typeof rootViewer
  items: AdminUser[]
  total: number
  groups: string[]
  listFails?: boolean
  selfFails?: boolean
  groupsFail?: boolean
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
  return render(<UsersPage />, { wrapper })
}

function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } })
}

/**
 * The page renders the desktop table and the mobile card list side by side and
 * hides one with a Tailwind breakpoint, so both are in the DOM under happy-dom.
 * Every row assertion is scoped to the table to keep the duplicates apart.
 */
async function accountTable() {
  return within(await screen.findByRole('table', { name: 'Accounts' }))
}

async function accountRow(username: string) {
  const table = await accountTable()
  const cell = await table.findByText(username)
  return within(cell.closest('tr') as HTMLElement)
}

/** Opens the row's overflow menu and returns the menu's scope. */
async function rowMenu(username: string) {
  const cells = await accountRow(username)
  fireEvent.click(cells.getByRole('button', { name: `More actions for ${username}` }))
  return within(await screen.findByRole('menu'))
}

beforeEach(() => {
  server = { groups: ['svip', 'default', 'vip'], items: [], total: 0, viewer: rootViewer }
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/status') return envelope(statusFixture)
    if (url === '/api/user/self') {
      if (server.selfFails) return Promise.reject(new Error('self is unavailable'))
      return envelope(server.viewer)
    }
    if (url === '/api/group/') {
      if (server.groupsFail) return Promise.reject(new Error('groups are unavailable'))
      return envelope(server.groups)
    }
    if (url === '/api/user/' || url === '/api/user/search') {
      if (server.listFails) return Promise.reject(new Error('the account list is unavailable'))
      return envelope({ items: server.items, page: 1, page_size: 20, total: server.total })
    }
    if (url.startsWith('/api/user/')) {
      const id = Number(url.slice('/api/user/'.length))
      const match = server.items.find((item) => item.id === id)
      if (match === undefined) {
        return Promise.resolve({ data: { success: false, message: 'record not found' } })
      }
      return envelope(match)
    }
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

describe('the administrator guard', () => {
  it('uses the RoleAdminUser threshold AdminAuth enforces, not the root role', () => {
    expect(ADMIN_ROLE).toBe(10)
  })

  it('refuses a non-admin and never calls an account endpoint', async () => {
    server.viewer = plainViewer
    renderPage()

    expect(await screen.findByText('Administrator access required')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New account' })).not.toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/user/', expect.anything())
  })

  it('reports a failed role lookup instead of claiming the account lacks the role', async () => {
    server.selfFails = true
    renderPage()

    expect(await screen.findByText('Could not confirm your permissions')).toBeInTheDocument()
    expect(screen.queryByText('Administrator access required')).not.toBeInTheDocument()
  })
})

describe('the account table', () => {
  it('shows a real empty state when nothing matches', async () => {
    renderPage()

    const table = await accountTable()
    expect(await table.findByText('No accounts yet')).toBeInTheDocument()
  })

  it('converts the balance with quota_per_unit and shows the derived share', async () => {
    server.items = [memberRow]
    server.total = 1
    renderPage()

    const cells = await accountRow('ua_probe_1')

    // 250,000 quota units / quota_per_unit 500,000.
    expect(cells.getByText('$0.50')).toBeInTheDocument()
    // quota + used_quota = 500,000 units.
    expect(cells.getByText('of $1.00')).toBeInTheDocument()
    // 250,000 / 500,000 = 50%, drawn by the meter.
    expect(cells.getByRole('progressbar', { name: 'Balance left for ua_probe_1' }))
      .toHaveAttribute('aria-valuetext', '50.0%')
  })

  it('spells out that the meter and the money are worked out client-side', async () => {
    renderPage()
    await accountTable()

    expect(
      screen.getByText(/quota ÷ \(quota \+ used_quota\)/),
    ).toBeInTheDocument()
    expect(screen.getByText(/QUOTA_PER_UNIT \(500,000\)/)).toBeInTheDocument()
  })

  it('shows the admin remark and hides a display name that repeats the username', async () => {
    server.items = [memberRow, adminRow]
    server.total = 2
    renderPage()

    const withRemark = await accountRow('ua_probe_1')
    expect(withRemark.getByText('internal note')).toBeInTheDocument()
    expect(withRemark.getByText('Renamed Probe')).toBeInTheDocument()

    // `display_name` equals the username on this row, so it is not repeated.
    const cells = await accountRow('ua_admin_2')
    expect(cells.queryAllByText('ua_admin_2')).toHaveLength(1)
  })

  it('reads a soft-deleted row as Deleted rather than by its stale status column', async () => {
    server.items = [deletedRow]
    server.total = 1
    renderPage()

    const cells = await accountRow('ua_admin_1')
    // The row still carries status 1; DeletedAt is what makes it deleted.
    expect(cells.getByText('Deleted')).toBeInTheDocument()
    expect(cells.queryByText('Enabled')).not.toBeInTheDocument()
  })

  it('offers a retry rather than an empty table when the list request fails', async () => {
    server.listFails = true
    renderPage()

    expect(await screen.findByText('Could not load the accounts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText('No accounts yet')).not.toBeInTheDocument()
  })
})

describe('filters, sorting and pagination', () => {
  it('stays on the plain list endpoint until a facet is set', async () => {
    renderPage()
    await accountTable()

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/user/', expect.anything()))
    expect(get).not.toHaveBeenCalledWith('/api/user/search', expect.anything())
  })

  it('switches to the search endpoint and sends every facet the handler parses', async () => {
    renderPage()
    await accountTable()

    type(screen.getByLabelText('Role'), '10')

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/user/search',
        expect.objectContaining({
          params: expect.objectContaining({ group: '', keyword: '', p: 1, role: '10', status: '' }),
        }),
      )
    })
  })

  it('sends status -1 for the deleted facet, which is not a stored status', async () => {
    renderPage()
    await accountTable()

    type(screen.getByLabelText('Status'), '-1')

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/user/search',
        expect.objectContaining({ params: expect.objectContaining({ status: '-1' }) }),
      )
    })
  })

  it('only sorts on the six columns model.userSortColumns accepts', async () => {
    server.items = [memberRow]
    server.total = 1
    renderPage()

    const table = await accountTable()
    for (const sortable of ['ID', 'Account', 'Group', 'Balance', 'Created', 'Last sign-in']) {
      expect(table.getByRole('button', { name: sortable })).toBeInTheDocument()
    }
    // Not in the server's sort map, so no sort control is offered at all.
    expect(table.queryByRole('button', { name: 'Requests' })).not.toBeInTheDocument()
    expect(table.queryByRole('button', { name: 'Role' })).not.toBeInTheDocument()
  })

  it('sends sort_by and sort_order when a sortable header is used', async () => {
    server.items = [memberRow]
    server.total = 1
    renderPage()

    const table = await accountTable()
    fireEvent.click(table.getByRole('button', { name: 'Account' }))

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/user/',
        expect.objectContaining({
          params: expect.objectContaining({ p: 1, sort_by: 'username', sort_order: 'asc' }),
        }),
      )
    })
  })

  it('asks for the next page and returns to page one when a facet changes', async () => {
    server.items = [memberRow]
    server.total = 60
    renderPage()
    // The Next control only unlocks once `total` has arrived, so wait for a row.
    await accountRow('ua_probe_1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/user/',
        expect.objectContaining({ params: expect.objectContaining({ p: 2 }) }),
      )
    })

    type(screen.getByLabelText('Role'), '1')
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/user/search',
        expect.objectContaining({ params: expect.objectContaining({ p: 1, role: '1' }) }),
      )
    })
  })

  it('keeps the group facet in the tree but inert when GET /api/group/ fails', async () => {
    server.groupsFail = true
    renderPage()
    await accountTable()

    await waitFor(() => expect(screen.getByLabelText('Group')).toBeDisabled())
  })
})

describe('the row permission gates', () => {
  it('withholds disable, demote and delete from root, and says why', async () => {
    server.items = [rootRow]
    server.total = 1
    renderPage()

    const menu = await rowMenu('root')
    expect(menu.getByRole('menuitem', { name: /Disable/ })).toHaveAttribute('data-disabled')
    expect(menu.getByRole('menuitem', { name: /Demote to user/ })).toHaveAttribute('data-disabled')
    expect(menu.getByRole('menuitem', { name: /Delete permanently/ })).toHaveAttribute('data-disabled')
    // Disable and demote share the refusal; delete has its own (`myRole <= role`).
    expect(menu.getAllByText('root is protected')).toHaveLength(2)
    expect(menu.getByText('outranks you')).toBeInTheDocument()
  })

  it('still lets root edit and fund its own account, which the handlers allow', async () => {
    server.items = [rootRow]
    server.total = 1
    renderPage()

    const cells = await accountRow('root')
    expect(cells.getByRole('button', { name: 'Edit root' })).toBeEnabled()
    expect(cells.getByRole('button', { name: 'Adjust the balance of root' })).toBeEnabled()
  })

  it('hides promote from a plain admin, because ManageUser requires root for it', async () => {
    server.viewer = adminViewer
    server.items = [memberRow]
    server.total = 1
    renderPage()

    const menu = await rowMenu('ua_probe_1')
    expect(menu.getByRole('menuitem', { name: /Promote to admin/ })).toHaveAttribute('data-disabled')
    expect(menu.getByText('root only')).toBeInTheDocument()
  })

  it('withdraws every control from a soft-deleted row and names the reason', async () => {
    server.items = [deletedRow]
    server.total = 1
    renderPage()

    const cells = await accountRow('ua_admin_1')
    expect(cells.getByRole('button', { name: 'Edit ua_admin_1 — soft-deleted' })).toBeDisabled()
    expect(
      cells.getByRole('button', { name: 'Adjust the balance of ua_admin_1 — soft-deleted' }),
    ).toBeDisabled()

    const menu = await rowMenu('ua_admin_1')
    expect(menu.getByRole('menuitem', { name: /Delete permanently/ })).toHaveAttribute('data-disabled')
  })

  it('refuses an admin every control against a peer administrator', async () => {
    server.viewer = adminViewer
    server.items = [adminRow]
    server.total = 1
    renderPage()

    const cells = await accountRow('ua_admin_2')
    expect(cells.getByRole('button', { name: 'Edit ua_admin_2 — outranks you' })).toBeDisabled()
  })
})

describe('destructive actions', () => {
  it('deletes an account only after the name is typed into the confirmation', async () => {
    server.items = [memberRow]
    server.total = 1
    del.mockResolvedValue({ data: { success: true, message: '' } })
    renderPage()

    const menu = await rowMenu('ua_probe_1')
    fireEvent.click(menu.getByRole('menuitem', { name: /Delete permanently/ }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Delete this account permanently?')).toBeInTheDocument()
    expect(dialog.getByText(/“ua_probe_1” \(id 10\)/)).toBeInTheDocument()

    const confirm = dialog.getByRole('button', { name: 'Delete account' })
    expect(confirm).toBeDisabled()
    expect(del).not.toHaveBeenCalled()

    type(dialog.getByLabelText(/Type ua_probe_1 to confirm/), 'ua_probe_1')
    fireEvent.click(dialog.getByRole('button', { name: 'Delete account' }))

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/user/10', expect.anything()))
  })

  it('sends the demote action only after the confirmation names the account', async () => {
    server.items = [adminRow]
    server.total = 1
    post.mockResolvedValue({ data: { success: true, message: '' } })
    renderPage()

    const menu = await rowMenu('ua_admin_2')
    fireEvent.click(menu.getByRole('menuitem', { name: /Demote to user/ }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Demote this administrator?')).toBeInTheDocument()
    expect(dialog.getByText(/“ua_admin_2” \(id 12\)/)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    fireEvent.click(dialog.getByRole('button', { name: 'Demote account' }))
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/manage',
        { action: 'demote', id: 12 },
        expect.anything(),
      )
    })
  })

  it('confirms a disable and abandons it when the dialog is dismissed', async () => {
    server.items = [memberRow]
    server.total = 1
    renderPage()

    const menu = await rowMenu('ua_probe_1')
    fireEvent.click(menu.getByRole('menuitem', { name: /^Disable/ }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Disable this account?')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
  })

  it('sends promote straight through, since it only adds a privilege', async () => {
    server.items = [memberRow]
    server.total = 1
    post.mockResolvedValue({ data: { success: true, message: '' } })
    renderPage()

    const menu = await rowMenu('ua_probe_1')
    fireEvent.click(menu.getByRole('menuitem', { name: /Promote to admin/ }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/manage',
        { action: 'promote', id: 10 },
        expect.anything(),
      )
    })
  })
})

describe('creating an account', () => {
  async function openCreateDrawer() {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'New account' }))
    return within(await screen.findByRole('dialog'))
  }

  it('refuses a username the validator would reject, without calling the server', async () => {
    const drawer = await openCreateDrawer()

    type(drawer.getByLabelText(/Username/), 'x'.repeat(21))
    type(drawer.getByLabelText(/^Password/), 'Passw0rd-123')
    fireEvent.click(drawer.getByRole('button', { name: 'Create account' }))

    expect(await drawer.findByText('Enter a username of 1 to 20 characters.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses a password outside the 8 to 20 the model declares', async () => {
    const drawer = await openCreateDrawer()

    type(drawer.getByLabelText(/Username/), 'newcomer')
    type(drawer.getByLabelText(/^Password/), 'short')
    fireEvent.click(drawer.getByRole('button', { name: 'Create account' }))

    expect(await drawer.findByText('A password must be 8 to 20 characters.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('offers root both creatable roles and posts the four fields CreateUser keeps', async () => {
    post.mockResolvedValue({ data: { success: true, message: '' } })
    const drawer = await openCreateDrawer()

    expect(drawer.getByRole('radio', { name: /User/ })).toBeInTheDocument()
    expect(drawer.getByRole('radio', { name: /Admin/ })).toBeInTheDocument()

    type(drawer.getByLabelText(/Username/), 'newcomer')
    type(drawer.getByLabelText(/^Password/), 'Passw0rd-123')
    fireEvent.click(drawer.getByRole('radio', { name: /Admin/ }))
    fireEvent.click(drawer.getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/',
        // display_name falls back to the username, exactly as CreateUser does.
        { display_name: 'newcomer', password: 'Passw0rd-123', role: 10, username: 'newcomer' },
        expect.anything(),
      )
    })
  })

  it('offers a plain admin only the regular-user role CreateUser would accept', async () => {
    server.viewer = adminViewer
    const drawer = await openCreateDrawer()

    expect(drawer.getByRole('radio', { name: /User/ })).toBeInTheDocument()
    expect(drawer.queryByRole('radio', { name: /Admin/ })).not.toBeInTheDocument()
  })
})

describe('editing an account', () => {
  async function openEditDrawer(username: string) {
    renderPage()
    const cells = await accountRow(username)
    fireEvent.click(cells.getByRole('button', { name: `Edit ${username}` }))
    return within(await screen.findByRole('dialog'))
  }

  it('re-reads the row and carries group and remark back so a save never blanks them', async () => {
    server.items = [memberRow]
    server.total = 1
    put.mockResolvedValue({ data: { success: true, message: '' } })

    const drawer = await openEditDrawer('ua_probe_1')
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/user/10', expect.anything()))

    expect(await drawer.findByDisplayValue('internal note')).toBeInTheDocument()
    type(drawer.getByLabelText(/Display name/), 'Probe One')
    fireEvent.click(drawer.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith(
        '/api/user/',
        {
          display_name: 'Probe One',
          group: 'vip',
          id: 10,
          remark: 'internal note',
          username: 'ua_probe_1',
        },
        expect.anything(),
      )
    })
  })

  it('omits the password entirely when the field is left blank', async () => {
    server.items = [memberRow]
    server.total = 1
    put.mockResolvedValue({ data: { success: true, message: '' } })

    const drawer = await openEditDrawer('ua_probe_1')
    await drawer.findByDisplayValue('ua_probe_1')
    fireEvent.click(drawer.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0]?.[1]).not.toHaveProperty('password')
  })

  it('does not offer a balance field, because PUT /api/user/ cannot move one', async () => {
    server.items = [memberRow]
    server.total = 1

    const drawer = await openEditDrawer('ua_probe_1')
    await drawer.findByDisplayValue('ua_probe_1')

    expect(drawer.queryByLabelText(/Amount/)).not.toBeInTheDocument()
    expect(drawer.queryByLabelText(/Balance/)).not.toBeInTheDocument()
  })

  it('surfaces a server refusal in the drawer instead of closing over it', async () => {
    server.items = [memberRow]
    server.total = 1
    put.mockResolvedValue({
      data: { success: false, message: 'No permission to update users of same or higher permission level' },
    })

    const drawer = await openEditDrawer('ua_probe_1')
    await drawer.findByDisplayValue('ua_probe_1')
    fireEvent.click(drawer.getByRole('button', { name: 'Save changes' }))

    expect(
      await drawer.findByText('No permission to update users of same or higher permission level'),
    ).toBeInTheDocument()
  })
})

describe('adjusting a balance', () => {
  async function openQuotaDialog() {
    server.items = [memberRow]
    server.total = 1
    renderPage()
    const cells = await accountRow('ua_probe_1')
    fireEvent.click(cells.getByRole('button', { name: 'Adjust the balance of ua_probe_1' }))
    return within(await screen.findByRole('dialog'))
  }

  it('multiplies the typed amount by quota_per_unit before sending it', async () => {
    post.mockResolvedValue({ data: { success: true, message: '' } })
    const dialog = await openQuotaDialog()

    type(dialog.getByLabelText(/Amount/), '2.5')
    fireEvent.click(dialog.getByRole('button', { name: 'Apply adjustment' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/manage',
        // 2.5 × 500,000.
        { action: 'add_quota', id: 10, mode: 'add', value: 1_250_000 },
        expect.anything(),
      )
    })
  })

  it('refuses a zero add, which the server calls a change of nothing', async () => {
    const dialog = await openQuotaDialog()

    type(dialog.getByLabelText(/Amount/), '0')
    fireEvent.click(dialog.getByRole('button', { name: 'Apply adjustment' }))

    expect(await dialog.findByText('Enter an amount greater than zero.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('allows a negative figure in override, the only mode that writes the column', async () => {
    post.mockResolvedValue({ data: { success: true, message: '' } })
    const dialog = await openQuotaDialog()

    fireEvent.click(dialog.getByRole('radio', { name: /Set the balance outright/ }))
    type(dialog.getByLabelText(/Amount/), '-1')
    fireEvent.click(dialog.getByRole('button', { name: 'Apply adjustment' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/manage',
        { action: 'add_quota', id: 10, mode: 'override', value: -500_000 },
        expect.anything(),
      )
    })
  })

  it('previews the resulting balance before anything is sent', async () => {
    const dialog = await openQuotaDialog()

    type(dialog.getByLabelText(/Amount/), '1')
    // 250,000 units on hand + 1 × 500,000.
    expect(await dialog.findByText('$1.50')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })
})
