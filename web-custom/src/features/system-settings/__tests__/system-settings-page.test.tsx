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

const historyPush = vi.fn()
let routeParams: Record<string, string> = {}

vi.mock('@tanstack/react-router', () => ({
  useParams: () => routeParams,
  useRouter: () => ({ history: { push: historyPush } }),
}))

const { SystemSettingsPage } = await import('@/features/system-settings/SystemSettingsPage')
const { SYSTEM_SETTINGS_ROLE } = await import('@/features/system-settings/access')
const { SETTINGS_GROUPS } = await import('@/features/system-settings/groups/registry')
const { SectionPlaceholder } = await import(
  '@/features/system-settings/components/SectionPlaceholder'
)

/**
 * The three keys `/system-settings/operations/behavior` reads, with the values the seeded
 * dev server actually holds. All three are the STRING 'false'.
 */
const seededOptions: Record<string, string> = {
  About: '<div><h1>About Acme AI</h1></div>',
  DefaultCollapseSidebar: 'false',
  DemoSiteEnabled: 'false',
  Footer: '',
  HomePageContent: '',
  'legal.privacy_policy': '',
  'legal.user_agreement': '',
  Logo: '',
  SelfUseModeEnabled: 'false',
  ServerAddress: '',
  SystemName: 'New API',
}

type ServerState = {
  role: number
  selfFails: boolean
  optionsFail: boolean
  /** The Go handler serialises an empty option slice as null. */
  optionsEmpty: boolean
  stored: Record<string, string>
}

let server: ServerState

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<SystemSettingsPage />, { wrapper })
}

function optionReads() {
  return get.mock.calls.filter((call) => call[0] === '/api/option/').length
}

beforeEach(() => {
  routeParams = {}
  historyPush.mockReset()
  server = {
    optionsEmpty: false,
    optionsFail: false,
    role: SYSTEM_SETTINGS_ROLE,
    selfFails: false,
    stored: { ...seededOptions },
  }

  get.mockReset()
  put.mockReset()
  post.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/user/self') {
      if (server.selfFails) return Promise.reject(new Error('self is unavailable'))
      return Promise.resolve({
        data: { data: { id: 1, role: server.role, username: 'root' }, message: '', success: true },
      })
    }
    if (url === '/api/option/') {
      if (server.optionsFail) return Promise.reject(new Error('the option store is unavailable'))
      return Promise.resolve({
        data: {
          data: server.optionsEmpty
            ? null
            : Object.entries(server.stored).map(([key, value]) => ({ key, value })),
          message: '',
          success: true,
        },
      })
    }
    if (url === '/api/status') {
      return Promise.resolve({ data: { data: { quota_per_unit: 500_000 }, message: '', success: true } })
    }
    throw new Error(`unmocked GET ${url}`)
  })

  put.mockImplementation((url: string, body: { key: string; value: string }) => {
    if (url !== '/api/option/') throw new Error(`unmocked PUT ${url}`)
    server.stored[body.key] = body.value
    return Promise.resolve({ data: { message: '', success: true } })
  })
})

afterEach(cleanup)

describe('the root guard', () => {
  it('uses the RoleRootUser threshold RootAuth enforces on /api/option', () => {
    expect(SYSTEM_SETTINGS_ROLE).toBe(100)
  })

  it('refuses an administrator and never reads a single option', async () => {
    server.role = 10
    renderPage()

    expect(await screen.findByText('Root access required')).toBeInTheDocument()
    expect(optionReads()).toBe(0)
    expect(screen.queryByRole('navigation', { name: 'Settings groups' })).not.toBeInTheDocument()
  })

  it('refuses a regular account too', async () => {
    server.role = 1
    renderPage()

    expect(await screen.findByText('Root access required')).toBeInTheDocument()
    expect(optionReads()).toBe(0)
  })

  it('reports a failed role lookup instead of claiming the account lacks the role', async () => {
    server.selfFails = true
    renderPage()

    expect(await screen.findByText('Could not confirm your permissions')).toBeInTheDocument()
    expect(screen.queryByText('Root access required')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(optionReads()).toBe(0)
  })

  it('lets the root account through', async () => {
    renderPage()
    expect(await screen.findByRole('navigation', { name: 'Settings groups' })).toBeInTheDocument()
  })
})

describe('the group and section navigation', () => {
  it('lists all seven groups and marks the resolved one current', async () => {
    renderPage()
    const groups = within(await screen.findByRole('navigation', { name: 'Settings groups' }))

    expect(groups.getAllByRole('link')).toHaveLength(7)
    for (const group of SETTINGS_GROUPS) {
      expect(groups.getByRole('link', { name: new RegExp(group.title, 'i') })).toBeInTheDocument()
    }
    expect(groups.getByRole('link', { name: /Site/i })).toHaveAttribute('aria-current', 'page')
  })

  it('lists the resolved group’s sections and links each to its own path', async () => {
    routeParams = { group: 'operations', section: 'behavior' }
    renderPage()

    const sections = within(await screen.findByRole('navigation', { name: 'Settings sections' }))
    expect(sections.getAllByRole('link')).toHaveLength(7)
    expect(sections.getByRole('link', { name: 'System behaviour' })).toHaveAttribute(
      'href',
      '/system-settings/operations/behavior',
    )
    expect(sections.getByRole('link', { name: 'SMTP e-mail' })).toHaveAttribute(
      'href',
      '/system-settings/operations/email',
    )
  })

  it('routes a left click through the router rather than the browser', async () => {
    renderPage()
    const sections = within(await screen.findByRole('navigation', { name: 'Settings sections' }))

    fireEvent.click(sections.getByRole('link', { name: 'System notice' }), { button: 0 })
    expect(historyPush).toHaveBeenCalledWith('/system-settings/site/notice')
  })

  it('falls back to the first group and section when the URL segments are unknown', async () => {
    routeParams = { group: 'nonsense', section: 'also-nonsense' }
    renderPage()

    const groups = within(await screen.findByRole('navigation', { name: 'Settings groups' }))
    expect(groups.getByRole('link', { name: /Site/i })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByLabelText(/System name/)).toBeInTheDocument()
  })

  it('has a real component behind every registered section, so no placeholder is reachable', () => {
    // This used to point at security/ssrf as an example of an unbuilt section. Every group
    // has since been rebuilt, so naming any one section here would break again the moment
    // it landed. The invariant worth holding is the one the rebuild set out to reach: the
    // registry no longer routes anything to the placeholder.
    const unbuilt = SETTINGS_GROUPS.flatMap((group) =>
      group.sections
        .filter((section) => section.Component === undefined)
        .map((section) => `${group.id}/${section.id}`),
    )

    expect(unbuilt).toEqual([])
  })

  it('still renders the placeholder’s own contract for a section without a component', () => {
    // The fallback stays in the shell for a section added to the registry ahead of its
    // form, so its contract is asserted directly rather than through the registry: a
    // heading that matches the nav entry, and no claim about the settings behind it.
    render(<SectionPlaceholder legacyPath="/console/setting?tab=example" title="Example section" />)

    expect(screen.getByRole('heading', { name: 'Example section' })).toBeInTheDocument()
    expect(screen.getByText('Not available here yet')).toBeInTheDocument()
    expect(screen.getByText(/\/console\/setting\?tab=example/)).toBeInTheDocument()
  })
})

describe('the option store states', () => {
  it('announces the load before the payload arrives', async () => {
    renderPage()
    expect(await screen.findByText('Loading settings')).toBeInTheDocument()
  })

  it('shows the failure and offers a retry when the payload cannot be read', async () => {
    server.optionsFail = true
    renderPage()

    expect(await screen.findByText('The settings could not be loaded')).toBeInTheDocument()
    expect(screen.getByText('the option store is unavailable')).toBeInTheDocument()

    server.optionsFail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText(/System name/)).toBeInTheDocument()
  })

  it('shows an empty state when the server returns no options at all', async () => {
    server.optionsEmpty = true
    renderPage()

    expect(await screen.findByText('This deployment reported no settings')).toBeInTheDocument()
    expect(screen.queryByLabelText(/System name/)).not.toBeInTheDocument()
  })
})

describe('the two reference sections', () => {
  it('fills the system information form from the live payload', async () => {
    renderPage()

    // The label carries a required marker, so it is matched loosely.
    expect(await screen.findByLabelText(/System name/)).toHaveValue('New API')
    expect(screen.getByLabelText('About')).toHaveValue('<div><h1>About Acme AI</h1></div>')
    expect(screen.getByLabelText('Server address')).toHaveValue('')
    expect(screen.getByLabelText('User agreement')).toHaveValue('')
  })

  it('rejects a logo that is not an absolute http address', async () => {
    renderPage()
    await screen.findByLabelText(/System name/)

    fireEvent.change(screen.getByLabelText('Logo URL'), { target: { value: 'logo.png' } })
    expect(
      await screen.findByText('Enter a full http:// or https:// address, or leave this empty.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(put).not.toHaveBeenCalled()
  })

  it("reads the behaviour switches' string 'false' as off, not as truthy", async () => {
    routeParams = { group: 'operations', section: 'behavior' }
    renderPage()

    const collapse = await screen.findByRole('switch', { name: 'Collapse the sidebar by default' })
    expect(collapse).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Demo site mode' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Self-use mode' })).not.toBeChecked()
  })

  it('reverts a switch the server refuses instead of leaving it looking saved', async () => {
    routeParams = { group: 'operations', section: 'behavior' }
    put.mockImplementation(() =>
      Promise.resolve({ data: { message: 'Self-use mode cannot be enabled here', success: false } }),
    )
    renderPage()

    fireEvent.click(await screen.findByRole('switch', { name: 'Self-use mode' }))

    expect(await screen.findByText('Self-use mode cannot be enabled here')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Self-use mode' })).not.toBeChecked(),
    )
  })

  it('saves a switch on its own, with no Save button in sight', async () => {
    routeParams = { group: 'operations', section: 'behavior' }
    renderPage()

    const demo = await screen.findByRole('switch', { name: 'Demo site mode' })
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()

    fireEvent.click(demo)

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0][1]).toEqual({ key: 'DemoSiteEnabled', value: 'true' })
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Demo site mode' })).toBeChecked(),
    )
  })
})
