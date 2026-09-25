// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))

const { OAuthProviders } = await import('@/features/auth/components/OAuthProviders')
const { EMPTY_AUTH_SERVER_CONFIG } = await import('@/features/auth/server-config')
type AuthServerConfig = typeof EMPTY_AUTH_SERVER_CONFIG

/** Shape accepted by `authBundleSchema`; anything less is rejected as not-a-bundle. */
const authBundle = {
  access_token: 'token',
  token_type: 'Bearer',
  access_expires_at: 1788004087,
  user: { id: 1, username: 'root', role: 100 },
  session: {
    sid: 'session-id',
    current: true,
    login_method: 'wechat',
    ip: '127.0.0.1',
    user_agent: 'vitest',
    created_at: 1788000000,
    last_active_at: 1788000000,
    expires_at: 1788004087,
  },
}

function renderProviders(overrides: Partial<AuthServerConfig>, props: { disabled?: boolean } = {}) {
  const onAuthenticated = vi.fn()
  const view = render(
    <OAuthProviders
      config={{ ...EMPTY_AUTH_SERVER_CONFIG, ...overrides }}
      disabled={props.disabled}
      onAuthenticated={onAuthenticated}
    />,
  )
  return { ...view, onAuthenticated }
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  post.mockResolvedValue({ data: { success: true } })
})

afterEach(cleanup)

describe('OAuthProviders', () => {
  it('renders nothing when the server enables no provider', () => {
    const { container } = renderProviders({})
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one labelled button per configured provider', () => {
    renderProviders({
      githubOAuthEnabled: true,
      githubClientId: 'gh',
      wechatLoginEnabled: true,
      customOAuthProviders: [{
        id: 1,
        name: 'Acme SSO',
        slug: 'acme',
        icon: '',
        clientId: 'acme-client',
        authorizationEndpoint: 'https://sso.acme.test/authorize',
        scopes: '',
      }],
    })

    const group = screen.getByRole('group', { name: 'Other sign-in options' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Continue with WeChat',
      'Continue with GitHub',
      'Continue with Acme SSO',
    ])
  })

  it('hides a provider the operator enabled without credentials', () => {
    renderProviders({ githubOAuthEnabled: true, discordOAuthEnabled: true, discordClientId: 'dc' })

    expect(screen.queryByRole('button', { name: 'Continue with GitHub' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with Discord' })).toBeInTheDocument()
  })

  it('keeps every provider disabled but present while the caller blocks sign-in', () => {
    renderProviders({ wechatLoginEnabled: true, githubOAuthEnabled: true, githubClientId: 'gh' }, { disabled: true })

    for (const name of ['Continue with WeChat', 'Continue with GitHub']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  it('does not start a provider the consent gate rejects', () => {
    render(
      <OAuthProviders
        canStart={() => false}
        config={{ ...EMPTY_AUTH_SERVER_CONFIG, wechatLoginEnabled: true }}
        onAuthenticated={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Continue with WeChat' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('explains a missing WeChat QR code instead of showing a broken image', async () => {
    renderProviders({ wechatLoginEnabled: true })

    fireEvent.click(screen.getByRole('button', { name: 'Continue with WeChat' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('No QR code is configured. Ask your operator to add one.')).toBeInTheDocument()
  })

  it('exchanges the WeChat verification code and hands the bundle to the caller', async () => {
    get.mockResolvedValue({ data: { success: true, data: authBundle } })
    const { onAuthenticated } = renderProviders({
      wechatLoginEnabled: true,
      wechatQrCodeUrl: 'https://cdn.example.com/qr.png',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Continue with WeChat' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('img', { name: 'WeChat sign-in QR code' })).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText('Verification code'), { target: { value: ' 123456 ' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/api/oauth/wechat', expect.objectContaining({ params: { code: '123456' } }))
    })
    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith(authBundle, 'wechat')
    })
  })

  it('does not sign the user in when WeChat rejects the code', async () => {
    get.mockResolvedValue({ data: { success: false, message: 'Invalid verification code' } })
    const { onAuthenticated } = renderProviders({ wechatLoginEnabled: true })

    fireEvent.click(screen.getByRole('button', { name: 'Continue with WeChat' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Verification code'), { target: { value: '000000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(onAuthenticated).not.toHaveBeenCalled()
  })
})
