// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReactNode } from 'react'

const get = vi.fn()
const post = vi.fn()
const navigate = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: (props: { to: string, className?: string, children: ReactNode }) => (
    <a className={props.className} href={props.to}>{props.children}</a>
  ),
}))

const { SignInForm } = await import('@/features/auth/sign-in/SignInForm')
const { EMPTY_AUTH_SERVER_CONFIG } = await import('@/features/auth/server-config')
const { clearPending2FAChallenge, readPending2FAChallenge } = await import(
  '@/features/auth/otp/pending-2fa'
)
const { useAuthStore } = await import('@/stores/auth-store')

type AuthServerConfig = typeof EMPTY_AUTH_SERVER_CONFIG

const authBundle = {
  access_token: 'token',
  token_type: 'Bearer',
  access_expires_at: 1788010374,
  user: { id: 1, username: 'root', role: 100 },
  session: {
    sid: 'session-id',
    current: true,
    login_method: 'password',
    ip: '127.0.0.1',
    user_agent: 'vitest',
    created_at: 1788009474,
    last_active_at: 1788009474,
    expires_at: 1790601474,
  },
}

const passwordOnly: Partial<AuthServerConfig> = { passwordLoginEnabled: true }

function renderForm(overrides: Partial<AuthServerConfig>, redirectTo?: string) {
  return render(
    <SignInForm
      config={{ ...EMPTY_AUTH_SERVER_CONFIG, ...overrides }}
      redirectTo={redirectTo}
    />,
  )
}

function fillCredentials(username = 'root', password = 'Local-dev-2026') {
  fireEvent.change(screen.getByLabelText(/^Username or email/), { target: { value: username } })
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: password } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  navigate.mockReset()
  clearPending2FAChallenge()
  useAuthStore.getState().auth.reset()
})

afterEach(() => {
  cleanup()
  // The WebAuthn test installs globals happy-dom does not provide; leaving them in place
  // would make the "cannot use passkeys" test pass or fail depending on file order.
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window.navigator, 'credentials')
})

describe('SignInForm — which mechanisms render', () => {
  it('shows only the password form when the server enables nothing else', () => {
    renderForm(passwordOnly)

    expect(screen.getByLabelText(/^Username or email/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Other sign-in options' })).not.toBeInTheDocument()
  })

  it('drops the password form entirely when password_login_enabled is off', () => {
    renderForm({ passwordLoginEnabled: false, wechatLoginEnabled: true })

    expect(screen.queryByLabelText(/^Username or email/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with WeChat' })).toBeInTheDocument()
  })

  it('renders a provider button per enabled provider alongside the password form', () => {
    renderForm({ ...passwordOnly, githubOAuthEnabled: true, githubClientId: 'gh' })

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeInTheDocument()
  })

  it('says so instead of showing an empty card when no method is enabled at all', () => {
    renderForm({})

    expect(screen.getByText('Sign-in is unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})

describe('SignInForm — password sign-in', () => {
  it('reports both missing fields without calling the backend', () => {
    renderForm(passwordOnly)
    submit()

    expect(screen.getByText('Enter your username or email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('drops a field error as soon as the user fixes that field', () => {
    renderForm(passwordOnly)
    submit()

    fireEvent.change(screen.getByLabelText(/^Username or email/), { target: { value: 'root' } })

    expect(screen.queryByText('Enter your username or email address.')).not.toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  })

  it('clears a rejection message once the password is edited', async () => {
    post.mockResolvedValue({ data: { success: false, message: 'Wrong password' } })
    renderForm(passwordOnly)

    fillCredentials('root', 'wrong')
    submit()
    expect(await screen.findByText('Wrong password')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'better' } })
    expect(screen.queryByText('Wrong password')).not.toBeInTheDocument()
  })

  it('signs in and lands on the sanitized redirect target', async () => {
    post.mockResolvedValue({ data: { success: true, data: authBundle } })
    renderForm(passwordOnly, '/wallet?tab=history')

    fillCredentials()
    submit()

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ href: '/wallet?tab=history', replace: true })
    })
    expect(useAuthStore.getState().auth.user?.username).toBe('root')
  })

  it('refuses to follow a redirect that points at another origin', async () => {
    post.mockResolvedValue({ data: { success: true, data: authBundle } })
    renderForm(passwordOnly, 'https://evil.test/steal')

    fillCredentials()
    submit()

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ href: '/dashboard', replace: true })
    })
  })

  it('shows the server message for a rejected password and stays on the page', async () => {
    post.mockResolvedValue({
      data: { success: false, message: 'Username or password is incorrect, or user has been banned' },
    })
    renderForm(passwordOnly)

    fillCredentials('root', 'wrong')
    submit()

    expect(await screen.findByText('Username or password is incorrect, or user has been banned'))
      .toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
    expect(useAuthStore.getState().auth.user).toBeNull()
  })

  it('surfaces a transport failure in the form rather than losing it', async () => {
    post.mockRejectedValue(new Error('Network Error'))
    renderForm(passwordOnly)

    fillCredentials()
    submit()

    expect(await screen.findByText('Network Error')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('never treats a payload that is not an auth bundle as a signed-in session', async () => {
    post.mockResolvedValue({ data: { success: true, data: { username: 'root' } } })
    renderForm(passwordOnly)

    fillCredentials()
    submit()

    expect(await screen.findByText('Sign-in failed. Please try again.')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('hands a two-factor challenge to the OTP page instead of signing in', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        data: { require_2fa: true, flow_token: 'flow-token', expires_at: 4102444800 },
      },
    })
    renderForm(passwordOnly, '/wallet')

    fillCredentials()
    submit()

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ replace: true, to: '/otp' })
    })
    expect(readPending2FAChallenge()).toEqual({
      flowToken: 'flow-token',
      expiresAt: 4102444800,
      redirectTo: '/wallet',
    })
    expect(useAuthStore.getState().auth.user).toBeNull()
  })
})

describe('SignInForm — Turnstile', () => {
  it('does not post a login the backend would reject for an empty Turnstile token', () => {
    renderForm({ ...passwordOnly, turnstileEnabled: true, turnstileSiteKey: 'site-key' })

    fillCredentials()
    submit()

    expect(screen.getByText(
      'The human verification check has not finished. Please wait a moment and try again.',
    )).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('sends an empty token when the operator has the check off', async () => {
    post.mockResolvedValue({ data: { success: true, data: authBundle } })
    renderForm(passwordOnly)

    fillCredentials()
    submit()

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/login',
        { username: 'root', password: 'Local-dev-2026' },
        expect.objectContaining({ params: { turnstile: '' } }),
      )
    })
  })
})

describe('SignInForm — legal consent', () => {
  it('blocks every mechanism until the published terms are accepted', () => {
    renderForm({
      ...passwordOnly,
      userAgreementEnabled: true,
      wechatLoginEnabled: true,
      passkeyLoginEnabled: true,
    })

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue with WeChat' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeDisabled()
    expect(screen.getByText('Accept the terms above to continue.')).toBeInTheDocument()
  })

  it('tells a screen reader why the blocked buttons are disabled', () => {
    renderForm({ ...passwordOnly, userAgreementEnabled: true, passkeyLoginEnabled: true })

    expect(screen.getByRole('button', { name: 'Sign in' }))
      .toHaveAccessibleDescription('Accept the terms above to continue.')
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' }))
      .toHaveAccessibleDescription(expect.stringContaining('Accept the terms above to continue.'))
  })

  it('releases the form once the box is ticked', () => {
    renderForm({ ...passwordOnly, privacyPolicyEnabled: true })

    fireEvent.click(screen.getByRole('checkbox'))

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(screen.queryByText('Accept the terms above to continue.')).not.toBeInTheDocument()
  })

  it('does not gate anything when the operator published no legal document', () => {
    renderForm(passwordOnly)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })
})

describe('SignInForm — passkey', () => {
  it('explains the disabled button on a device that cannot run the ceremony', async () => {
    renderForm({ ...passwordOnly, passkeyLoginEnabled: true })

    expect(await screen.findByText('This browser or device cannot use passkeys.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeDisabled()
  })

  it('runs the WebAuthn ceremony and signs in with the returned bundle', async () => {
    const getCredential = vi.fn().mockResolvedValue({
      id: 'credential-id',
      rawId: new ArrayBuffer(4),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        authenticatorData: new ArrayBuffer(4),
        clientDataJSON: new ArrayBuffer(4),
        signature: new ArrayBuffer(4),
        userHandle: null,
      },
      getClientExtensionResults: () => ({}),
    })

    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
    })
    Object.defineProperty(window.navigator, 'credentials', {
      configurable: true,
      value: { get: getCredential },
    })

    post.mockImplementation((url: string) => {
      if (url === '/api/user/passkey/login/begin') {
        return Promise.resolve({
          data: {
            success: true,
            data: { options: { publicKey: { challenge: 'AAAA' } }, flow_token: 'flow-token' },
          },
        })
      }
      return Promise.resolve({ data: { success: true, data: authBundle } })
    })

    renderForm({ passkeyLoginEnabled: true, passwordLoginEnabled: false })

    const button = await screen.findByRole('button', { name: 'Sign in with a passkey' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/passkey/login/finish',
        expect.objectContaining({ flow_token: 'flow-token' }),
        expect.anything(),
      )
    })
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ href: '/dashboard', replace: true })
    })
  })
})
