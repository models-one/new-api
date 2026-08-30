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

const redirectToLegacySignIn = vi.fn()
vi.mock('@/lib/navigation', () => ({
  getLegacySignInHref: () => '/sign-in',
  isPreviewMode: () => false,
  redirectToLegacySignIn,
}))

const { ProfileIdentity } = await import('@/features/profile/ProfileIdentity')

/** `GET /api/status` on the seeded dev server, trimmed to the keys this page reads. */
const baseStatus = {
  checkin_enabled: false,
  discord_oauth: false,
  email_verification: false,
  github_client_id: '',
  github_oauth: false,
  linuxdo_oauth: false,
  oidc_enabled: false,
  quota_per_unit: 500000,
  telegram_oauth: false,
  turnstile_check: false,
  turnstile_site_key: '',
  wechat_login: false,
}

/** `GET /api/user/self` on the seeded dev server. */
const baseSelf = {
  aff_code: 'ujX8',
  aff_count: 0,
  aff_history_quota: 0,
  aff_quota: 0,
  discord_id: '',
  display_name: 'Root User',
  email: '',
  github_id: '',
  group: 'default',
  id: 1,
  inviter_id: 0,
  linux_do_id: '',
  oidc_id: '',
  permissions: { admin_permissions: {}, sidebar_modules: {}, sidebar_settings: false },
  quota: 100000000,
  request_count: 0,
  role: 100,
  setting: '',
  sidebar_modules: '',
  status: 1,
  stripe_customer: '',
  telegram_id: '',
  used_quota: 3750000,
  username: 'root',
  wechat_id: '',
}

type Overrides = {
  self?: Record<string, unknown>
  status?: Record<string, unknown>
  bindings?: unknown[]
  selfFails?: boolean
  checkin?: Record<string, unknown>
}

function mockServer(overrides: Overrides = {}) {
  const envelope = (data: unknown) => ({ data: { data, message: '', success: true } })

  get.mockImplementation((url: string) => {
    if (url === '/api/status') return Promise.resolve(envelope({ ...baseStatus, ...overrides.status }))
    if (url === '/api/user/self') {
      if (overrides.selfFails === true) {
        return Promise.resolve({ data: { message: 'Session expired!', success: false } })
      }
      return Promise.resolve(envelope({ ...baseSelf, ...overrides.self }))
    }
    if (url === '/api/user/oauth/bindings') return Promise.resolve(envelope(overrides.bindings ?? []))
    if (url === '/api/user/checkin') return Promise.resolve(envelope(overrides.checkin))
    if (url === '/api/user/token') return Promise.resolve(envelope('rlNdl8GnZoYzicHfGWeGxFLRmR2Zlgo='))
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })
}

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<ProfileIdentity />, { wrapper })
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()
  redirectToLegacySignIn.mockReset()
  mockServer()
})

afterEach(cleanup)

describe('account header', () => {
  it('shows the identity and the two money figures from GET /api/user/self', async () => {
    renderProfile()

    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: 'Root User' })).toBeInTheDocument()
    expect(screen.getByText('Super administrator')).toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
    // 100000000 / quota_per_unit 500000 = 200; 3750000 / 500000 = 7.50
    expect(screen.getByText('$200')).toBeInTheDocument()
    expect(screen.getByText('$7')).toBeInTheDocument()
  })

  it('shows the referral code with a copy control', async () => {
    renderProfile()
    expect(await screen.findByText('ujX8')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy referral code' })).toBeInTheDocument()
  })

  it('says the referral code has not been generated when the server returns none', async () => {
    mockServer({ self: { aff_code: '' } })
    renderProfile()
    expect(await screen.findByText('Not generated yet — open Referrals to create one')).toBeInTheDocument()
  })

  it('reports a failed account load and offers a retry', async () => {
    mockServer({ selfFails: true })
    renderProfile()

    expect(await screen.findByText('Your account could not be loaded')).toBeInTheDocument()
    expect(screen.getByText('Session expired!')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0)
  })

  it('announces the loading pass while the account request is in flight', () => {
    get.mockImplementation(() => new Promise(() => undefined))
    renderProfile()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })
})

describe('display name', () => {
  it('keeps Save disabled until the name actually changes, then PUTs it', async () => {
    renderProfile()

    const input = await screen.findByRole('textbox', { name: /Display name/ })
    const save = screen.getByRole('button', { name: 'Save name' })
    expect(save).toBeDisabled()

    put.mockReturnValue(Promise.resolve({ data: { message: '', success: true } }))
    fireEvent.change(input, { target: { value: 'Root Operator' } })
    expect(save).toBeEnabled()
    fireEvent.click(save)

    await waitFor(() => expect(put).toHaveBeenCalledWith(
      '/api/user/self',
      { display_name: 'Root Operator' },
      expect.anything(),
    ))
  })

  it('refuses a name longer than the server accepts without sending it', async () => {
    renderProfile()

    const input = await screen.findByRole('textbox', { name: /Display name/ })
    fireEvent.change(input, { target: { value: 'x'.repeat(21) } })

    expect(await screen.findByText('That is longer than 20 characters, which the server refuses.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled()
    expect(put).not.toHaveBeenCalled()
  })
})

describe('password change', () => {
  it('validates in the browser before spending a request', async () => {
    renderProfile()

    fireEvent.click(await screen.findByRole('button', { name: 'Change password' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/Current password/), { target: { value: 'old-one-1' } })
    fireEvent.change(within(dialog).getByLabelText(/^New password/), { target: { value: 'new-one-11' } })
    fireEvent.change(within(dialog).getByLabelText(/Confirm new password/), { target: { value: 'typo-one-1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('The two new passwords do not match.')).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
  })

  it('sends the original password and asks for the rotated bundle', async () => {
    renderProfile()

    fireEvent.click(await screen.findByRole('button', { name: 'Change password' }))
    const dialog = await screen.findByRole('dialog')

    put.mockReturnValue(Promise.resolve({
      data: {
        data: {
          access_expires_at: 1788017932,
          access_token: 'rotated',
          session: { current: true, sid: 'c5bf' },
          token_type: 'Bearer',
        },
        message: '',
        success: true,
      },
    }))

    fireEvent.change(within(dialog).getByLabelText(/Current password/), { target: { value: 'old-one-1' } })
    fireEvent.change(within(dialog).getByLabelText(/^New password/), { target: { value: 'new-one-11' } })
    fireEvent.change(within(dialog).getByLabelText(/Confirm new password/), { target: { value: 'new-one-11' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }))

    await waitFor(() => expect(put).toHaveBeenCalled())
    const [, body, config] = put.mock.calls[0]
    expect(body).toEqual({ original_password: 'old-one-1', password: 'new-one-11' })
    expect(config.acceptAuthRotation).toBe(true)
  })
})

describe('account deletion', () => {
  it('does not offer deletion for the root account the server refuses to delete', async () => {
    renderProfile()

    expect(await screen.findByText('This account cannot be deleted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
  })

  it('keeps the destructive button disabled until the username is typed exactly', async () => {
    mockServer({ self: { role: 1, username: 'probe_ident' } })
    renderProfile()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
    const dialog = await screen.findByRole('dialog')

    const confirm = within(dialog).getByRole('button', { name: 'Delete account' })
    expect(confirm).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/Type probe_ident to confirm/), {
      target: { value: 'probe_iden' },
    })
    expect(confirm).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/Type probe_ident to confirm/), {
      target: { value: 'probe_ident' },
    })
    expect(confirm).toBeEnabled()
    expect(del).not.toHaveBeenCalled()
  })

  it('spells out what is lost before anything is sent', async () => {
    mockServer({ self: { role: 1, username: 'probe_ident' } })
    renderProfile()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText('Your remaining balance, which is not refunded.')).toBeInTheDocument()
    expect(within(dialog).getByText(/Every API key on this account/)).toBeInTheDocument()
  })

  it('signs the browser out and leaves for sign-in once the account is gone', async () => {
    mockServer({ self: { role: 1, username: 'probe_ident' } })
    del.mockReturnValue(Promise.resolve({ data: { message: '', success: true } }))
    post.mockReturnValue(Promise.resolve({ data: { message: '', success: true } }))
    renderProfile()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Type probe_ident to confirm/), {
      target: { value: 'probe_ident' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/user/self', expect.anything()))
    await waitFor(() => expect(redirectToLegacySignIn).toHaveBeenCalledWith(''))
  })
})

describe('sign-in methods', () => {
  it('offers e-mail on a deployment with every provider off, and says why nothing else is there', async () => {
    renderProfile()

    expect(await screen.findByText('Email')).toBeInTheDocument()
    expect(screen.getByText(/No external sign-in providers are enabled/)).toBeInTheDocument()
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument()
  })

  it('renders a row only for a provider whose flow the server fully configured', async () => {
    mockServer({
      status: {
        discord_client_id: '',
        discord_oauth: true,
        github_client_id: 'gh-client',
        github_oauth: true,
      },
    })
    renderProfile()

    expect(await screen.findByText('GitHub')).toBeInTheDocument()
    expect(screen.queryByText('Discord')).not.toBeInTheDocument()
  })

  it('offers no unlink for a linked built-in provider, because the server has no route for it', async () => {
    mockServer({
      self: { github_id: 'octocat' },
      status: { github_client_id: 'gh-client', github_oauth: true },
    })
    renderProfile()

    expect(await screen.findByText('octocat')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unlink' })).not.toBeInTheDocument()
    // Re-running the flow is the one thing that works: it overwrites the stored id.
    expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(1)
    expect(screen.getByText(/Only administrator-defined providers can be unlinked here/)).toBeInTheDocument()
  })

  it('offers unlinking for a custom provider, which is the only one the server exposes a route for', async () => {
    mockServer({
      bindings: [{
        provider_icon: '',
        provider_id: 7,
        provider_name: 'Acme SSO',
        provider_slug: 'acme',
        provider_user_id: 'u-1234',
      }],
      status: {
        custom_oauth_providers: [{
          authorization_endpoint: 'https://sso.example.com/authorize',
          client_id: 'abc',
          id: 7,
          name: 'Acme SSO',
          scopes: 'openid',
          slug: 'acme',
        }],
      },
    })
    renderProfile()

    expect(await screen.findByText('u-1234')).toBeInTheDocument()
    const unlink = screen.getByRole('button', { name: 'Unlink' })
    expect(unlink).toBeEnabled()

    del.mockReturnValue(Promise.resolve({ data: { message: '解绑成功', success: true } }))
    fireEvent.click(unlink)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unlink' }))

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/user/oauth/bindings/7', expect.anything()))
  })

  it('opens the e-mail dialog and only sends a code once an address is typed', async () => {
    renderProfile()

    fireEvent.click(await screen.findByRole('button', { name: 'Link' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText('Enter an email address.')).toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/verification', expect.anything())

    get.mockImplementation((url: string) => {
      if (url === '/api/verification') {
        return Promise.resolve({ data: { message: 'invalid SMTP account', success: false } })
      }
      return Promise.resolve({ data: { data: baseStatus, message: '', success: true } })
    })

    fireEvent.change(within(dialog).getByLabelText('Email address'), {
      target: { value: 'root@example.com' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send code' }))

    // The dev server has no SMTP; the refusal is shown as-is rather than reworded.
    expect(await screen.findByText('invalid SMTP account')).toBeInTheDocument()
  })
})

describe('system access token', () => {
  it('says nothing is on show, because the server never returns an existing token', async () => {
    renderProfile()
    expect(await screen.findByText(/The server never returns an existing token/)).toBeInTheDocument()
  })

  it('gates minting behind a confirmation and then shows the value masked', async () => {
    renderProfile()

    fireEvent.click(await screen.findByRole('button', { name: 'Generate a token' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Anything already using the old token/)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate token' }))

    expect(await screen.findByRole('button', { name: 'Show access token' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy access token' })).toBeInTheDocument()
    // The secret itself is not printed until the reveal control is used.
    expect(screen.queryByText('rlNdl8GnZoYzicHfGWeGxFLRmR2Zlgo=')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show access token' }))
    expect(await screen.findByText('rlNdl8GnZoYzicHfGWeGxFLRmR2Zlgo=')).toBeInTheDocument()
  })
})

describe('daily check-in', () => {
  it('is absent on a deployment with check-in turned off, and is never requested', async () => {
    renderProfile()

    await screen.findByRole('heading', { level: 1, name: 'Account' })
    expect(screen.queryByText('Daily check-in')).not.toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/user/checkin', expect.anything())
  })

  it('shows the totals and marks the derived figure as derived', async () => {
    mockServer({
      checkin: {
        enabled: true,
        max_quota: 10000,
        min_quota: 1000,
        stats: {
          checked_in_today: true,
          checkin_count: 1,
          records: [{ checkin_date: '2026-08-29', quota_awarded: 3227 }],
          total_checkins: 1,
          total_quota: 3227,
        },
      },
      status: { checkin_enabled: true },
    })
    renderProfile()

    expect(await screen.findByText('Daily check-in')).toBeInTheDocument()
    expect(await screen.findByText('Claimed today')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Come back tomorrow' })).toBeDisabled()
    expect(screen.getByText('$0.0020 – $0.0200')).toBeInTheDocument()
    expect(screen.getByText(/is added up in this page/)).toBeInTheDocument()
    expect(screen.getByText('2026-08-29')).toBeInTheDocument()
  })

  it('lets an unclaimed day be claimed', async () => {
    mockServer({
      checkin: {
        enabled: true,
        max_quota: 10000,
        min_quota: 1000,
        stats: {
          checked_in_today: false,
          checkin_count: 0,
          records: [],
          total_checkins: 0,
          total_quota: 0,
        },
      },
      status: { checkin_enabled: true },
    })
    post.mockReturnValue(Promise.resolve({
      data: { data: { checkin_date: '2026-08-29', quota_awarded: 3227 }, message: '', success: true },
    }))
    renderProfile()

    expect(await screen.findByText('No check-ins this month')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      '/api/user/checkin',
      undefined,
      expect.anything(),
    ))
  })

  it('reports a failed check-in load with a retry rather than an empty panel', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/api/status') {
        return Promise.resolve({
          data: { data: { ...baseStatus, checkin_enabled: true }, message: '', success: true },
        })
      }
      if (url === '/api/user/self') {
        return Promise.resolve({ data: { data: baseSelf, message: '', success: true } })
      }
      if (url === '/api/user/checkin') {
        return Promise.resolve({ data: { message: '签到功能未启用', success: false } })
      }
      return Promise.resolve({ data: { data: [], message: '', success: true } })
    })
    renderProfile()

    expect(await screen.findByText('Check-in could not be loaded')).toBeInTheDocument()
    expect(screen.getByText('签到功能未启用')).toBeInTheDocument()
  })
})
