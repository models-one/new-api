// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as AuthPasskey from '@/features/auth/passkey'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put, delete: del } }))

// The base64url codec and credential shaping stay REAL — this suite must not be
// able to pass with a broken encoder. Only the two calls that need a browser
// authenticator, plus the capability probe, are replaced.
const createCredential = vi.fn()
const getCredential = vi.fn()
const isPasskeySupported = vi.fn()

vi.mock('@/features/auth/passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthPasskey>()),
  createCredential,
  getCredential,
  isPasskeySupported,
}))

const { PasskeyPanel } = await import('@/features/profile/security/components/PasskeyPanel')

/** `protocol.CredentialCreation` as Go marshals it, wrapped in the flow envelope. */
const registrationChallenge = {
  options: {
    publicKey: {
      challenge: 'Y2hhbGxlbmdlLWJ5dGVz',
      rp: { id: 'localhost', name: 'New API' },
      user: { id: 'MQ', name: 'root', displayName: 'Root User' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    },
  },
  flow_token: 'flow-token-register',
  expires_at: 1788020000,
}

const assertionChallenge = {
  options: {
    publicKey: {
      challenge: 'Y2hhbGxlbmdlLWJ5dGVz',
      rpId: 'localhost',
      allowCredentials: [{ type: 'public-key', id: 'Y3JlZC1pZA' }],
    },
  },
  flow_token: 'flow-token-verify',
  expires_at: 1788020000,
}

function fakeCredential(kind: 'create' | 'get') {
  const buffer = new Uint8Array([1, 2, 3, 4]).buffer
  const response = kind === 'create'
    ? { attestationObject: buffer, clientDataJSON: buffer, getTransports: () => ['internal'] }
    : { authenticatorData: buffer, clientDataJSON: buffer, signature: buffer, userHandle: null }

  return {
    id: 'credential-id',
    rawId: buffer,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response,
    getClientExtensionResults: () => ({}),
  }
}

let statusFixture: Record<string, unknown> = { passkey_login: true, quota_per_unit: 500000 }
let passkeyFixture: Record<string, unknown> = { enabled: false }
let twoFactorFixture: Record<string, unknown> = { enabled: false, locked: false }

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<PasskeyPanel />, { wrapper })
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()
  createCredential.mockReset()
  getCredential.mockReset()
  isPasskeySupported.mockReset()

  statusFixture = { passkey_login: true, quota_per_unit: 500000 }
  passkeyFixture = { enabled: false }
  twoFactorFixture = { enabled: false, locked: false }
  isPasskeySupported.mockResolvedValue(true)

  get.mockImplementation((url: string) => {
    if (url === '/api/status') return Promise.resolve({ data: { success: true, data: statusFixture } })
    if (url === '/api/user/passkey') {
      return Promise.resolve({ data: { success: true, data: passkeyFixture } })
    }
    if (url === '/api/user/2fa/status') {
      return Promise.resolve({ data: { success: true, data: twoFactorFixture } })
    }
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

describe('PasskeyPanel capability gating', () => {
  it('explains the operator switch rather than offering a button that always fails', async () => {
    statusFixture = { passkey_login: false, quota_per_unit: 500000 }
    renderPanel()

    expect(await screen.findByText('Passkeys are turned off for this site')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a passkey' })).toBeDisabled()
  })

  it('explains an incapable browser separately from an operator switch', async () => {
    isPasskeySupported.mockResolvedValue(false)
    renderPanel()

    expect(await screen.findByText('This device cannot use passkeys')).toBeInTheDocument()
    expect(screen.queryByText('Passkeys are turned off for this site')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add a passkey' })).toBeDisabled()
    })
  })

  it('shows registration state and the last sign-in when a credential exists', async () => {
    passkeyFixture = { enabled: true, last_used_at: '2026-08-20T09:15:00Z' }
    renderPanel()

    expect(await screen.findByText('Registered')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove passkey' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument()
  })

  it('says so plainly when the credential has never been used', async () => {
    passkeyFixture = { enabled: true, last_used_at: null }
    renderPanel()

    expect(
      await screen.findByText('This passkey has not been used to sign in yet.'),
    ).toBeInTheDocument()
  })

  it('renders an error state with a retry when the status request fails', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/api/status') return Promise.resolve({ data: { success: true, data: statusFixture } })
      if (url === '/api/user/2fa/status') {
        return Promise.resolve({ data: { success: true, data: twoFactorFixture } })
      }
      return Promise.reject(new Error('boom'))
    })
    renderPanel()

    expect(await screen.findByText('Passkey status could not be loaded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('registering a passkey', () => {
  it('registers straight away when two-factor is off, because the server asks for no proof', async () => {
    createCredential.mockResolvedValue(fakeCredential('create'))
    post.mockImplementation((url: string) => {
      if (url === '/api/user/passkey/register/begin') {
        return Promise.resolve({ data: { success: true, data: registrationChallenge } })
      }
      if (url === '/api/user/passkey/register/finish') {
        return Promise.resolve({ data: { success: true, data: null } })
      }
      throw new Error(`unmocked POST ${url}`)
    })

    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/passkey/register/finish',
        expect.objectContaining({ flow_token: 'flow-token-register' }),
        expect.anything(),
      )
    })
    // No step-up dialog should have appeared.
    expect(screen.queryByText('Confirm it is you')).not.toBeInTheDocument()
  })

  it('demands a two-factor code first when two-factor is on, and sends it as the proof header', async () => {
    twoFactorFixture = { enabled: true, locked: false, backup_codes_remaining: 4 }
    createCredential.mockResolvedValue(fakeCredential('create'))
    post.mockImplementation((url: string) => {
      if (url === '/api/verify') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              proof_token: 'proof-abc',
              expires_at: 1788020000,
              method: '2fa',
              scope: 'passkey.register',
            },
          },
        })
      }
      if (url === '/api/user/passkey/register/begin') {
        return Promise.resolve({ data: { success: true, data: registrationChallenge } })
      }
      if (url === '/api/user/passkey/register/finish') {
        return Promise.resolve({ data: { success: true, data: null } })
      }
      throw new Error(`unmocked POST ${url}`)
    })

    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }))

    expect(await screen.findByText('Confirm it is you')).toBeInTheDocument()
    // The ceremony must not have started before the proof exists.
    expect(post).not.toHaveBeenCalledWith('/api/user/passkey/register/begin', expect.anything(), expect.anything())

    const verify = screen.getByRole('button', { name: 'Verify' })
    expect(verify).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '112233' } })
    await waitFor(() => expect(verify).toBeEnabled())
    fireEvent.click(verify)

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/verify',
        { method: '2fa', code: '112233', scope: 'passkey.register' },
        expect.anything(),
      )
    })
    // Both halves of the ceremony carry the header: the middleware runs on each.
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/passkey/register/begin',
        undefined,
        expect.objectContaining({ headers: { 'X-Security-Proof': 'proof-abc' } }),
      )
      expect(post).toHaveBeenCalledWith(
        '/api/user/passkey/register/finish',
        expect.anything(),
        expect.objectContaining({ headers: { 'X-Security-Proof': 'proof-abc' } }),
      )
    })
  })

  it('reports a dismissed browser prompt as a cancellation, not a failure', async () => {
    createCredential.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'))
    post.mockResolvedValue({ data: { success: true, data: registrationChallenge } })

    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }))

    expect(
      await screen.findByText('The passkey prompt was dismissed before it finished.'),
    ).toBeInTheDocument()
  })
})

describe('removing a passkey', () => {
  beforeEach(() => {
    passkeyFixture = { enabled: true, last_used_at: '2026-08-20T09:15:00Z' }
  })

  it('confirms first, then proves ownership with the passkey itself when two-factor is off', async () => {
    getCredential.mockResolvedValue(fakeCredential('get'))
    post.mockImplementation((url: string) => {
      if (url === '/api/user/passkey/verify/begin') {
        return Promise.resolve({ data: { success: true, data: assertionChallenge } })
      }
      if (url === '/api/user/passkey/verify/finish') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              proof_token: 'proof-xyz',
              expires_at: 1788020000,
              method: 'passkey',
              scope: 'passkey.delete',
            },
          },
        })
      }
      throw new Error(`unmocked POST ${url}`)
    })
    del.mockResolvedValue({ data: { success: true, data: null } })

    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove passkey' }))

    expect(await screen.findByText('Remove this passkey?')).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()

    const confirmDialog = within(screen.getByRole('dialog'))
    fireEvent.click(confirmDialog.getByRole('button', { name: 'Remove passkey' }))

    // Passkey-method step-up: no code field, the browser prompt is the challenge.
    expect(await screen.findByRole('button', { name: 'Verify with passkey' })).toBeEnabled()
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Verify with passkey' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/passkey/verify/begin',
        { scope: 'passkey.delete' },
        expect.anything(),
      )
      expect(del).toHaveBeenCalledWith(
        '/api/user/passkey',
        expect.objectContaining({ headers: { 'X-Security-Proof': 'proof-xyz' } }),
      )
    })
  })

  it('asks for a two-factor code instead when two-factor is on', async () => {
    twoFactorFixture = { enabled: true, locked: false, backup_codes_remaining: 4 }
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove passkey' }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Remove passkey' }))

    expect(await screen.findByLabelText('Verification code')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verify with passkey' })).not.toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()
  })

  it('does not delete anything when the confirmation is dismissed', async () => {
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove passkey' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }))

    await waitFor(() => expect(screen.queryByText('Remove this passkey?')).not.toBeInTheDocument())
    expect(del).not.toHaveBeenCalled()
  })
})
