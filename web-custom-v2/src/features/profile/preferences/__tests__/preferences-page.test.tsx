// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18next from 'i18next'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put, delete: del } }))

const { PreferencesPage } = await import('@/features/profile/preferences/PreferencesPage')

/** `GET /api/user/self` on the seeded dev server, trimmed to what this page reads. */
function selfFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    username: 'root',
    display_name: 'Root User',
    role: 1,
    status: 1,
    email: '',
    group: 'default',
    quota: 100000000,
    used_quota: 0,
    request_count: 0,
    setting: '',
    ...overrides,
  }
}

let self = selfFixture()

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<PreferencesPage />, { wrapper })
}

beforeEach(async () => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()
  self = selfFixture()
  await i18next.changeLanguage('en')

  get.mockImplementation((url: string) => {
    if (url === '/api/user/self') return Promise.resolve({ data: { success: true, data: self } })
    if (url === '/api/status') {
      return Promise.resolve({ data: { success: true, data: { quota_per_unit: 500000 } } })
    }
    throw new Error(`unmocked GET ${url}`)
  })
  put.mockResolvedValue({ data: { success: true, data: null } })
})

afterEach(cleanup)

describe('notification method fields', () => {
  it('shows only the email field for the email method', async () => {
    renderPage()

    expect(await screen.findByLabelText('Notification email')).toBeInTheDocument()
    expect(screen.queryByLabelText('Webhook URL')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Bark push URL')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Gotify server URL')).not.toBeInTheDocument()
  })

  it('swaps the fields when the method changes', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('radio', { name: /Webhook/ }))
    expect(await screen.findByLabelText('Webhook URL')).toBeInTheDocument()
    expect(screen.getByLabelText('Webhook secret')).toBeInTheDocument()
    expect(screen.queryByLabelText('Notification email')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Gotify/ }))
    expect(await screen.findByLabelText('Gotify server URL')).toBeInTheDocument()
    expect(screen.getByLabelText('Gotify application token')).toBeInTheDocument()
    expect(screen.getByLabelText('Message priority')).toBeInTheDocument()
    expect(screen.queryByLabelText('Webhook URL')).not.toBeInTheDocument()
  })

  it('seeds the form from the stored settings', async () => {
    self = selfFixture({
      setting: JSON.stringify({
        notify_type: 'bark',
        quota_warning_threshold: 250000,
        bark_url: 'https://api.day.app/abc',
      }),
    })
    renderPage()

    expect(await screen.findByLabelText('Bark push URL')).toHaveValue('https://api.day.app/abc')
    expect(screen.getByLabelText('Low balance threshold')).toHaveValue(250000)
  })
})

describe('the threshold, and saying where the currency figure comes from', () => {
  it('names the quota_per_unit divisor next to the converted amount', async () => {
    renderPage()

    // 500000 quota units / 500000 per unit = $1.00, and the description says so.
    expect(
      await screen.findByText(/500,000 units = \$1\.00 at the current rate of 500,000 units per unit of currency/),
    ).toBeInTheDocument()
  })

  it('refuses to save a non-positive threshold, which the server would reject anyway', async () => {
    renderPage()

    fireEvent.change(await screen.findByLabelText('Low balance threshold'), {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))

    expect(await screen.findByText('Enter a threshold greater than zero.')).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
  })

  it('refuses to save a webhook method with no URL', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('radio', { name: /Webhook/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))

    expect(
      await screen.findByText('This is required for the selected method.'),
    ).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
  })
})

describe('the admin-only switch', () => {
  it('is hidden for a normal user', async () => {
    renderPage()

    await screen.findByLabelText('Notification email')
    expect(
      screen.queryByRole('switch', { name: 'Upstream model update alerts' }),
    ).not.toBeInTheDocument()
    // The two switches every account gets are still there.
    expect(screen.getByRole('switch', { name: 'Accept models without a price' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Record IP addresses in my logs' })).toBeInTheDocument()
  })

  it('is shown for an administrator', async () => {
    self = selfFixture({ role: 10 })
    renderPage()

    expect(
      await screen.findByRole('switch', { name: 'Upstream model update alerts' }),
    ).toBeInTheDocument()
  })
})

describe('saving', () => {
  it('sends the closed field set, then puts back the language the endpoint would have wiped', async () => {
    self = selfFixture({
      setting: JSON.stringify({ notify_type: 'email', quota_warning_threshold: 500000, language: 'zh-CN' }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save preferences' }))

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith(
        '/api/user/setting',
        {
          notify_type: 'email',
          quota_warning_threshold: 500000,
          accept_unset_model_ratio_model: false,
          record_ip_log: false,
        },
        expect.anything(),
      )
      expect(put).toHaveBeenCalledWith('/api/user/self', { language: 'zh-CN' }, expect.anything())
    })
  })

  it('puts back the sidebar configuration too, in its own request', async () => {
    self = selfFixture({
      setting: JSON.stringify({ notify_type: 'email', sidebar_modules: '{"chat":true}' }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save preferences' }))

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith(
        '/api/user/self',
        { sidebar_modules: '{"chat":true}' },
        expect.anything(),
      )
    })
  })

  it('makes no restore calls when there is nothing to restore', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save preferences' }))

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/user/setting', expect.anything(), expect.anything()))
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('shows the server message inline when the save is refused', async () => {
    put.mockResolvedValue({
      data: { success: false, message: 'Webhook address is not a valid URL' },
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save preferences' }))

    expect(await screen.findByText('Preferences were not saved')).toBeInTheDocument()
    expect(screen.getByText('Webhook address is not a valid URL')).toBeInTheDocument()
  })
})

describe('interface language', () => {
  it('reads the stored value, including the legacy console\'s code', async () => {
    self = selfFixture({ setting: JSON.stringify({ language: 'zhTW' }) })
    renderPage()

    expect(await screen.findByLabelText('Interface language')).toHaveValue('zh-TW')
  })

  it('switches the console immediately and stores the BCP-47 tag', async () => {
    renderPage()

    fireEvent.change(await screen.findByLabelText('Interface language'), {
      target: { value: 'zh' },
    })

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/api/user/self', { language: 'zh-CN' }, expect.anything())
      expect(i18next.language).toBe('zh')
    })
  })

  it('rolls the console back to the previous language when the save fails', async () => {
    put.mockResolvedValue({ data: { success: false, message: 'Update failed' } })
    renderPage()

    fireEvent.change(await screen.findByLabelText('Interface language'), {
      target: { value: 'ja' },
    })

    expect(await screen.findByText('Language was not saved')).toBeInTheDocument()
    expect(i18next.language).toBe('en')
  })
})
