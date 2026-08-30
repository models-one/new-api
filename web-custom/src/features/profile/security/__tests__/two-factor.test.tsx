// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put, delete: del } }))

const { TwoFactorPanel } = await import('@/features/profile/security/components/TwoFactorPanel')

/** Field for field what the seeded dev server answered for `POST /api/user/2fa/setup`. */
const setupFixture = {
  secret: 'CUWI2L5GQ5EUZVTBKFI72X5XQOR7CSJE',
  qr_code_data:
    'otpauth://totp/New API:root (New API)?secret=CUWI2L5GQ5EUZVTBKFI72X5XQOR7CSJE&issuer=New API&digits=6&period=30',
  backup_codes: ['K3VK-WV2W', 'G8JK-XXII', 'PH2Y-2HUO', 'XMSP-OB3F'],
}

/** The rotation envelope `authRotationData(bundle)` returns on enable/disable. */
const rotationFixture = {
  access_token: 'rotated-token',
  token_type: 'Bearer',
  access_expires_at: 1788017193,
  session: {
    sid: 'ac4724eb-95f6-4f2e-97b8-da9e03ba93b9',
    current: true,
    login_method: 'password',
    ip: '127.0.0.1',
    user_agent: 'curl/8.7.1',
    created_at: 1788016293,
    last_active_at: 1788016293,
    expires_at: 1790608293,
  },
}

let twoFactorStatus: Record<string, unknown> = { enabled: false, locked: false }

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<TwoFactorPanel />, { wrapper })
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()
  twoFactorStatus = { enabled: false, locked: false }

  get.mockImplementation((url: string) => {
    if (url === '/api/user/2fa/status') {
      return Promise.resolve({ data: { success: true, data: twoFactorStatus } })
    }
    throw new Error(`unmocked GET ${url}`)
  })
})

afterEach(cleanup)

describe('TwoFactorPanel', () => {
  it('offers enrolment while two-factor is off', async () => {
    renderPanel()

    expect(await screen.findByText('Off')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Turn on two-factor authentication' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Replace backup codes' })).not.toBeInTheDocument()
  })

  it('shows the remaining backup codes and the two management actions once it is on', async () => {
    twoFactorStatus = { enabled: true, locked: false, backup_codes_remaining: 3 }
    renderPanel()

    expect(await screen.findByText('On')).toBeInTheDocument()
    expect(screen.getByText('3 backup codes left')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replace backup codes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Turn on two-factor authentication' }),
    ).not.toBeInTheDocument()
  })

  it('warns when the account has burned through every backup code', async () => {
    twoFactorStatus = { enabled: true, locked: false, backup_codes_remaining: 0 }
    renderPanel()

    expect(await screen.findByText('No backup codes left')).toBeInTheDocument()
  })

  it('reports the lockout the server signals instead of pretending nothing happened', async () => {
    twoFactorStatus = { enabled: true, locked: true, backup_codes_remaining: 4 }
    renderPanel()

    expect(await screen.findByText('Temporarily locked')).toBeInTheDocument()
    expect(screen.getByText('Too many incorrect codes')).toBeInTheDocument()
  })

  it('renders an error state with a retry when the status request fails', async () => {
    get.mockImplementation(() => Promise.reject(new Error('network down')))
    renderPanel()

    expect(await screen.findByText('Two-factor status could not be loaded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('two-factor enrolment', () => {
  it('walks scan then backup codes then verify, and will not skip the codes screen unacknowledged', async () => {
    post.mockImplementation((url: string) => {
      if (url === '/api/user/2fa/setup') {
        return Promise.resolve({ data: { success: true, data: setupFixture } })
      }
      if (url === '/api/user/2fa/enable') {
        return Promise.resolve({ data: { success: true, data: rotationFixture } })
      }
      throw new Error(`unmocked POST ${url}`)
    })

    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on two-factor authentication' }))

    // Step 1: the secret, as an image and as copyable text.
    expect(await screen.findByText('Step 1 of 3')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Two-factor authentication setup code' }),
    ).toBeInTheDocument()
    // The secret is masked until asked for, never printed in prose.
    expect(screen.queryByText(setupFixture.secret)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reveal setup key' }))
    expect(screen.getByText(setupFixture.secret)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    // Step 2: the gate. Continue stays dead until the user says they saved them.
    expect(await screen.findByText('Step 2 of 3')).toBeInTheDocument()
    const continueButton = screen.getByRole('button', { name: 'Continue' })
    expect(continueButton).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', {
      name: 'I have saved these backup codes somewhere safe',
    }))
    await waitFor(() => expect(continueButton).toBeEnabled())
    fireEvent.click(continueButton)

    // Step 3: the code, and the warning about other sessions.
    expect(await screen.findByText('Step 3 of 3')).toBeInTheDocument()
    expect(screen.getByText('Your other devices will be signed out')).toBeInTheDocument()

    const confirm = screen.getByRole('button', { name: 'Turn on two-factor authentication' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } })
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/2fa/enable',
        { code: '123456' },
        expect.objectContaining({ acceptAuthRotation: true }),
      )
    })
  })

  it('keeps every backup code masked until it is individually revealed', async () => {
    post.mockResolvedValue({ data: { success: true, data: setupFixture } })

    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on two-factor authentication' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await screen.findByText('Step 2 of 3')

    for (const code of setupFixture.backup_codes) {
      expect(screen.queryByText(code)).not.toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Reveal backup code 1' }))
    expect(screen.getByText(setupFixture.backup_codes[0])).toBeInTheDocument()
    expect(screen.queryByText(setupFixture.backup_codes[1])).not.toBeInTheDocument()
  })

  it('shows the server message inline when the verification code is rejected', async () => {
    post.mockImplementation((url: string) => {
      if (url === '/api/user/2fa/setup') {
        return Promise.resolve({ data: { success: true, data: setupFixture } })
      }
      return Promise.resolve({
        data: { success: false, message: 'Verification code is incorrect, please try again' },
      })
    })

    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on two-factor authentication' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('checkbox', {
      name: 'I have saved these backup codes somewhere safe',
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    fireEvent.change(await screen.findByLabelText('Verification code'), {
      target: { value: '000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Turn on two-factor authentication' }))

    expect(
      await screen.findByText('Verification code is incorrect, please try again'),
    ).toBeInTheDocument()
  })

  it('surfaces a failed setup call instead of showing an empty wizard', async () => {
    post.mockResolvedValue({ data: { success: false, message: 'Please disable 2FA first' } })

    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on two-factor authentication' }))

    expect(await screen.findByText('Setup could not be started')).toBeInTheDocument()
    expect(screen.getByText('Please disable 2FA first')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('turning two-factor off', () => {
  beforeEach(() => {
    twoFactorStatus = { enabled: true, locked: false, backup_codes_remaining: 4 }
  })

  it('requires a confirmation and a code before it will call the server', async () => {
    post.mockResolvedValue({ data: { success: true, data: rotationFixture } })

    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }))

    const confirm = await screen.findByRole('button', {
      name: 'Turn off two-factor authentication',
    })

    // Confirming with an empty field must not reach the server.
    fireEvent.click(confirm)
    expect(
      await screen.findByText('Enter a verification code or a backup code to continue.'),
    ).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Verification code or backup code'), {
      target: { value: 'K3VK-WV2W' },
    })
    fireEvent.click(confirm)

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/api/user/2fa/disable',
        { code: 'K3VK-WV2W' },
        expect.objectContaining({ acceptAuthRotation: true }),
      )
    })
  })

  it('never calls the server from the panel button alone', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }))

    await screen.findByText('Turn off two-factor authentication?')
    expect(post).not.toHaveBeenCalled()
  })
})

describe('replacing backup codes', () => {
  beforeEach(() => {
    twoFactorStatus = { enabled: true, locked: false, backup_codes_remaining: 1 }
  })

  it('takes a code, then holds the new codes until the user acknowledges them', async () => {
    const replacements = ['AAAA-1111', 'BBBB-2222', 'CCCC-3333', 'DDDD-4444']
    post.mockResolvedValue({
      data: { success: true, data: { ...rotationFixture, backup_codes: replacements } },
    })

    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Replace backup codes' }))

    const generate = await screen.findByRole('button', { name: 'Generate new codes' })
    expect(generate).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '654321' } })
    await waitFor(() => expect(generate).toBeEnabled())
    fireEvent.click(generate)

    const done = await screen.findByRole('button', { name: 'Done' })
    expect(done).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', {
      name: 'I have saved these backup codes somewhere safe',
    }))
    await waitFor(() => expect(done).toBeEnabled())

    expect(post).toHaveBeenCalledWith(
      '/api/user/2fa/backup_codes',
      { code: '654321' },
      expect.objectContaining({ acceptAuthRotation: true }),
    )
  })
})
