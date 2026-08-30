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

vi.mock('@tanstack/react-router', () => ({
  useParams: () => routeParams,
  useRouter: () => ({ history: { push: vi.fn() } }),
}))

const { SystemSettingsPage } = await import('@/features/system-settings/SystemSettingsPage')

/**
 * The Site and Content sections, exercised through the settings shell so the role guard,
 * the option payload and the section are all the real ones.
 *
 * The seeded values below are the values the running dev server actually holds for these
 * keys — every panel flag is the STRING 'true', every list is the EMPTY STRING, and the
 * two navigation blobs are absent from the payload entirely. Those three facts are what
 * most of these tests are about.
 */
const seeded: Record<string, string> = {
  Chats: '[{"Cherry Studio":"cherrystudio://providers/api-keys?v=1&data={cherryConfig}"}]',
  DataExportDefaultTime: 'hour',
  DataExportEnabled: 'true',
  DataExportInterval: '5',
  DrawingEnabled: 'true',
  MjAccountFilterEnabled: 'false',
  MjActionCheckSuccessEnabled: 'true',
  MjForwardUrlEnabled: 'true',
  MjModeClearEnabled: 'false',
  MjNotifyEnabled: 'false',
  Notice: '',
  'console_setting.announcements': '',
  'console_setting.announcements_enabled': 'true',
  'console_setting.api_info': '',
  'console_setting.api_info_enabled': 'true',
  'console_setting.faq': '',
  'console_setting.faq_enabled': 'true',
  'console_setting.uptime_kuma_enabled': 'true',
  'console_setting.uptime_kuma_groups': '',
  // HeaderNavModules and SidebarModulesAdmin are deliberately absent: `InitOptionMap`
  // never seeds them and the live payload does not contain them.
}

type ServerState = {
  role: number
  stored: Record<string, string>
  /** Keys the server answers `{success:false, message}` for, as a refusal does live. */
  refuse: Record<string, string>
}

let routeParams: Record<string, string> = {}
let server: ServerState

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<SystemSettingsPage />, { wrapper })
}

/** Every `{key, value}` written during the test, in order. */
function writes() {
  return put.mock.calls
    .filter((call) => call[0] === '/api/option/')
    .map((call) => call[1] as { key: string; value: string })
}

beforeEach(() => {
  routeParams = {}
  server = { refuse: {}, role: 100, stored: { ...seeded } }

  get.mockReset()
  put.mockReset()
  post.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/user/self') {
      return Promise.resolve({
        data: { data: { id: 1, role: server.role, username: 'root' }, message: '', success: true },
      })
    }
    if (url === '/api/option/') {
      return Promise.resolve({
        data: {
          data: Object.entries(server.stored).map(([key, value]) => ({ key, value })),
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
    const refusal = server.refuse[body.key]
    if (refusal !== undefined) {
      return Promise.resolve({ data: { message: refusal, success: false } })
    }
    server.stored[body.key] = body.value
    return Promise.resolve({ data: { message: '', success: true } })
  })
})

afterEach(cleanup)

describe('the root guard covers these sections too', () => {
  it('refuses an administrator on a content section and reads no options at all', async () => {
    server.role = 10
    routeParams = { group: 'content', section: 'announcements' }
    renderPage()

    expect(await screen.findByText('Root access required')).toBeInTheDocument()
    expect(get.mock.calls.filter((call) => call[0] === '/api/option/')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Add an announcement' })).not.toBeInTheDocument()
  })
})

describe('the string-typed panel flag', () => {
  it('reads the string "false" as off, not as a truthy string', async () => {
    // The whole payload is strings, and `'false'` is truthy. A section that branched on
    // the raw value would draw this switch as ON for a panel that is disabled.
    server.stored['console_setting.faq_enabled'] = 'false'
    routeParams = { group: 'content', section: 'faq' }
    renderPage()

    const toggle = await screen.findByRole('switch', { name: 'Show the FAQ panel' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('reads the string "true" as on', async () => {
    routeParams = { group: 'content', section: 'faq' }
    renderPage()

    const toggle = await screen.findByRole('switch', { name: 'Show the FAQ panel' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})

describe('the list editor', () => {
  it('shows the empty state for a list the server holds as an empty string', async () => {
    routeParams = { group: 'content', section: 'faq' }
    renderPage()

    expect(await screen.findByText('No questions yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a question' })).toBeEnabled()
  })

  it('adds an entry through the dialog and writes the blob compacted, with the flag, on save', async () => {
    routeParams = { group: 'content', section: 'faq' }
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Add a question' }))
    fireEvent.change(await screen.findByLabelText(/Question/), { target: { value: 'How do I start?' } })
    fireEvent.change(screen.getByLabelText(/Answer/), { target: { value: 'Create an API key.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to the list' }))

    expect(await screen.findByText('How do I start?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Show the FAQ panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes()).toEqual([
      {
        key: 'console_setting.faq',
        value: '[{"question":"How do I start?","answer":"Create an API key."}]',
      },
      { key: 'console_setting.faq_enabled', value: 'false' },
    ])
  })

  it('refuses to save a row the server would reject, and never sends the write', async () => {
    routeParams = { group: 'content', section: 'faq' }
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Add a question' }))
    fireEvent.change(await screen.findByLabelText(/Question/), { target: { value: 'Q' } })
    // The answer is required by `validateFAQ`; submitting without it must not add a row.
    fireEvent.click(screen.getByRole('button', { name: 'Add to the list' }))

    expect(await screen.findByText('This is required.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to the list' })).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('reports a stored blob it cannot parse instead of showing an empty list over it', async () => {
    server.stored['console_setting.faq'] = '[{"question":'
    routeParams = { group: 'content', section: 'faq' }
    renderPage()

    expect(await screen.findByText('This list cannot be shown as a table')).toBeInTheDocument()
    // Adding to a list that cannot be read would write over whatever is in there.
    expect(screen.getByRole('button', { name: 'Add a question' })).toBeDisabled()
  })

  it('puts removal behind a confirmation and only then rewrites the list', async () => {
    server.stored['console_setting.faq'] = '[{"question":"Q1","answer":"A1"},{"question":"Q2","answer":"A2"}]'
    routeParams = { group: 'content', section: 'faq' }
    renderPage()

    fireEvent.click((await screen.findAllByRole('button', { name: 'Remove this question' }))[0])
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Remove this question?')).toBeInTheDocument()

    fireEvent.click(dialog.getByRole('button', { name: 'Keep it' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Q1')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove this question' })[0])
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove it' }))

    await waitFor(() => expect(screen.queryByText('Q1')).not.toBeInTheDocument())
    expect(writes()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0].value).toBe('[{"question":"Q2","answer":"A2"}]')
  })

  it('keeps a refused blob dirty and quotes the server, while the flag beside it still lands', async () => {
    server.refuse['console_setting.api_info'] = '第1个API信息的颜色值不合法'
    server.stored['console_setting.api_info'] = '[{"url":"https://a.example.com","route":"main","description":"d","color":"blue"}]'
    routeParams = { group: 'content', section: 'api-info' }
    renderPage()

    fireEvent.click(await screen.findByRole('tab', { name: 'JSON' }))
    fireEvent.change(await screen.findByLabelText(/Stored value/), {
      target: { value: '[{"url":"https://a.example.com","route":"main","description":"d","color":"grey"}]' },
    })
    fireEvent.click(screen.getByRole('switch', { name: 'Show the API address panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('The server refused some of these settings')).toBeInTheDocument()
    expect(screen.getByText('第1个API信息的颜色值不合法')).toBeInTheDocument()
    // The refused key keeps the operator's text so a second Save retries only that one.
    expect(screen.getByText('1 setting change(s) not saved yet.')).toBeInTheDocument()
    expect(server.stored['console_setting.api_info_enabled']).toBe('false')
  })
})

describe('chat presets', () => {
  it('reads the seeded single-key entries', async () => {
    routeParams = { group: 'content', section: 'chat' }
    renderPage()

    expect(await screen.findByText('Cherry Studio')).toBeInTheDocument()
  })

  it('will not save a template whose host is built from the user’s API key', async () => {
    routeParams = { group: 'content', section: 'chat' }
    renderPage()

    fireEvent.click(await screen.findByRole('tab', { name: 'JSON' }))
    fireEvent.change(await screen.findByLabelText(/Stored value/), {
      target: { value: '[{"Evil":"https://{key}.example.com/"}]' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    // Blocked in the form: the gateway would have stored this happily and every user who
    // pressed it would have leaked their key into a DNS lookup.
    await waitFor(() => expect(screen.getAllByText(/placeholder sits inside the host/).length).toBeGreaterThan(0))
    expect(writes()).toHaveLength(0)
  })

  it('reports a Chats refusal that the server stored anyway, and stops calling it unsaved', async () => {
    // `model.UpdateOption` writes the row BEFORE `updateOptionMap` validates it and hands
    // back the error, so a refused Chats write has already replaced the stored list —
    // verified live. The section must quote the refusal and then show what the server
    // actually holds, rather than pretending the old presets survived.
    server.refuse.Chats = 'json: cannot unmarshal number into Go value of type string'
    routeParams = { group: 'content', section: 'chat' }
    renderPage()

    fireEvent.click(await screen.findByRole('tab', { name: 'JSON' }))
    fireEvent.change(await screen.findByLabelText(/Stored value/), {
      target: { value: '[{"Kept":"https://kept.example.com/?key={key}"}]' },
    })
    // The server refuses but stores it, exactly as the gateway does.
    put.mockImplementation((_url: string, body: { key: string; value: string }) => {
      server.stored[body.key] = body.value
      const refusal = server.refuse[body.key]
      if (refusal !== undefined) return Promise.resolve({ data: { message: refusal, success: false } })
      return Promise.resolve({ data: { message: '', success: true } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('The server refused some of these settings')).toBeInTheDocument()
    expect(screen.getByText('json: cannot unmarshal number into Go value of type string')).toBeInTheDocument()
    // Nothing is left "unsaved": the operator's text IS what the server now holds.
    await waitFor(() => expect(screen.getByText('No unsaved changes.')).toBeInTheDocument())
    expect(server.stored.Chats).toBe('[{"Kept":"https://kept.example.com/?key={key}"}]')
  })
})

describe('the data dashboard', () => {
  it('refuses an interval the server would silently turn into zero', async () => {
    routeParams = { group: 'content', section: 'dashboard' }
    renderPage()

    fireEvent.change(await screen.findByLabelText(/Aggregation interval/), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText(/Between 1 and 1440 minutes/)).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('keeps a granularity this build does not list rather than rewriting it on save', async () => {
    server.stored.DataExportDefaultTime = 'month'
    routeParams = { group: 'content', section: 'dashboard' }
    renderPage()

    const select = await screen.findByLabelText(/Default granularity/)
    expect(select).toHaveValue('month')
  })
})

describe('drawing', () => {
  it('writes one key the moment a switch is flipped, with no Save button in sight', async () => {
    routeParams = { group: 'content', section: 'drawing' }
    renderPage()

    fireEvent.click(await screen.findByRole('switch', { name: 'Allow upstream callbacks' }))

    await waitFor(() => expect(writes()).toEqual([{ key: 'MjNotifyEnabled', value: 'true' }]))
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('snaps the switch back when the server refuses it', async () => {
    server.refuse.DrawingEnabled = 'nope'
    routeParams = { group: 'content', section: 'drawing' }
    renderPage()

    const toggle = await screen.findByRole('switch', { name: 'Enable drawing' })
    fireEvent.click(toggle)

    expect(await screen.findByText('nope')).toBeInTheDocument()
    // A switch has no Save to retry with, so leaving it flipped would be a lie.
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
  })
})

describe('the navigation blobs', () => {
  it('treats an absent HeaderNavModules as the backend’s fallback rather than an error', async () => {
    routeParams = { group: 'site', section: 'header-navigation' }
    renderPage()

    expect(await screen.findByRole('switch', { name: 'Model catalogue' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('No unsaved changes.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'JSON' }))
    expect(await screen.findByLabelText(/Stored value/)).toHaveValue('')
  })

  it('writes the whole object when one module is switched off', async () => {
    routeParams = { group: 'site', section: 'header-navigation' }
    renderPage()

    fireEvent.click(await screen.findByRole('switch', { name: 'Rankings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(JSON.parse(writes()[0].value)).toEqual({
      about: true,
      console: true,
      docs: true,
      home: true,
      pricing: { enabled: true, requireAuth: false },
      rankings: { enabled: false, requireAuth: false },
    })
  })

  it('refuses to save a navigation blob it cannot read, which the server would have stored', async () => {
    server.stored.SidebarModulesAdmin = 'garbage{'
    routeParams = { group: 'site', section: 'sidebar-modules' }
    renderPage()

    expect(await screen.findByText('This navigation setting cannot be read')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Administration' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'JSON' }))
    fireEvent.change(await screen.findByLabelText(/Stored value/), { target: { value: 'still broken{' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.getAllByText('The stored text is not valid JSON.').length).toBeGreaterThan(0))
    expect(writes()).toHaveLength(0)
  })
})
