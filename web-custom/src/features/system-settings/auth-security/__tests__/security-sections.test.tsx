// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put, delete: del } }))

const { RateLimitSection } = await import(
  '@/features/system-settings/auth-security/sections/RateLimitSection'
)
const { PasskeySection } = await import(
  '@/features/system-settings/auth-security/sections/PasskeySection'
)
const { TokenLimitsSection } = await import(
  '@/features/system-settings/auth-security/sections/TokenLimitsSection'
)

/** The security keys exactly as the seeded dev server returns them — all strings. */
const seeded: Record<string, string> = {
  ModelRequestRateLimitCount: '0',
  ModelRequestRateLimitDurationMinutes: '1',
  ModelRequestRateLimitEnabled: 'false',
  ModelRequestRateLimitGroup: '{}',
  ModelRequestRateLimitSuccessCount: '1000',
  'passkey.allow_insecure_origin': 'false',
  'passkey.attachment_preference': '',
  'passkey.enabled': 'false',
  'passkey.origins': '',
  'passkey.rp_display_name': 'New API',
  'passkey.rp_id': '',
  'passkey.user_verification': 'preferred',
  'token_setting.max_user_tokens': '1000',
}

let stored: Record<string, string>
let refuse: Record<string, string>

function writes(): { key: string; value: string }[] {
  return put.mock.calls
    .filter((call) => call[0] === '/api/option/')
    .map((call) => call[1] as { key: string; value: string })
}

function renderSection(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(node, { wrapper })
}

/**
 * Sections render immediately with the readers' fallbacks and disable their controls while
 * `GET /api/option/` is in flight, so every test waits for the payload first. Base UI's
 * `Switch.Root` is a span, so `toBeEnabled()` is meaningless on it — the signal is
 * `data-disabled` going away.
 */
async function renderLoaded(node: ReactElement, readySwitch: string) {
  const result = renderSection(node)
  await waitFor(() =>
    expect(screen.getByRole('switch', { name: readySwitch })).not.toHaveAttribute('data-disabled'),
  )
  return result
}

async function renderTokenLimits() {
  const result = renderSection(<TokenLimitsSection />)
  await waitFor(() =>
    expect(screen.getByLabelText('Maximum API keys per account')).toHaveValue(1000),
  )
  return result
}

beforeEach(() => {
  stored = { ...seeded }
  refuse = {}

  get.mockReset()
  put.mockReset()
  post.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/option/') {
      return Promise.resolve({
        data: {
          data: Object.entries(stored).map(([key, value]) => ({ key, value })),
          message: '',
          success: true,
        },
      })
    }
    if (url === '/api/status') {
      return Promise.resolve({
        data: { data: { quota_per_unit: 500_000 }, message: '', success: true },
      })
    }
    throw new Error(`unmocked GET ${url}`)
  })

  put.mockImplementation((url: string, body: { key: string; value: string }) => {
    if (url !== '/api/option/') throw new Error(`unmocked PUT ${url}`)
    // A refusal is HTTP 200 with success:false, not a 4xx.
    const refusal = refuse[body.key]
    if (refusal !== undefined) return Promise.resolve({ data: { message: refusal, success: false } })
    stored[body.key] = body.value
    return Promise.resolve({ data: { message: '', success: true } })
  })
})

afterEach(cleanup)

const RATE_LIMIT_READY = 'Limit model requests'
const PASSKEY_READY = 'Enable passkeys'

describe('RateLimitSection', () => {
  it('reads the string “false” as an off switch and the string counts as numbers', async () => {
    await renderLoaded(<RateLimitSection />, RATE_LIMIT_READY)

    expect(screen.getByRole('switch', { name: RATE_LIMIT_READY })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByLabelText('Successful requests per window')).toHaveValue(1000)
    expect(screen.getByLabelText('Window (minutes)')).toHaveValue(1)
  })

  it('warns that a successful-request limit of 0 blocks every request', async () => {
    // There is no "0 means unlimited" path for this one: the middleware checks it on every
    // request, so 0 refuses the first call of each window with 429.
    stored.ModelRequestRateLimitEnabled = 'true'
    await renderLoaded(<RateLimitSection />, RATE_LIMIT_READY)

    fireEvent.change(screen.getByLabelText('Successful requests per window'), {
      target: { value: '0' },
    })

    expect(await screen.findByText('This blocks every request')).toBeInTheDocument()
  })

  it('refuses to write a successful-request limit of 0', async () => {
    await renderLoaded(<RateLimitSection />, RATE_LIMIT_READY)

    fireEvent.change(screen.getByLabelText('Successful requests per window'), {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('Enter a whole number between 1 and 2147483647.'),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('shows the seeded {} as an empty override table, not as a broken value', async () => {
    await renderLoaded(<RateLimitSection />, RATE_LIMIT_READY)
    expect(await screen.findByText('No per-group overrides')).toBeInTheDocument()
  })

  it('adds a group through the dialog and writes it as a JSON object', async () => {
    await renderLoaded(<RateLimitSection />, RATE_LIMIT_READY)

    fireEvent.click(screen.getByRole('button', { name: 'Add a group' }))
    fireEvent.change(await screen.findByLabelText('Group'), { target: { value: 'vip' } })
    fireEvent.change(screen.getAllByLabelText('Total requests per window')[1], {
      target: { value: '0' },
    })
    fireEvent.change(screen.getAllByLabelText('Successful requests per window')[1], {
      target: { value: '5000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0].key).toBe('ModelRequestRateLimitGroup')
    expect(JSON.parse(writes()[0].value)).toEqual({ vip: [0, 5000] })
  })

  it('will not add a group whose successful-request limit is 0', async () => {
    await renderLoaded(<RateLimitSection />, RATE_LIMIT_READY)

    fireEvent.click(screen.getByRole('button', { name: 'Add a group' }))
    fireEvent.change(await screen.findByLabelText('Group'), { target: { value: 'vip' } })
    fireEvent.change(screen.getAllByLabelText('Successful requests per window')[1], {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(
      await screen.findByText('Enter a whole number between 1 and 2147483647.'),
    ).toBeInTheDocument()
    // The dialog stays open and nothing reached the draft.
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()
  })

  it('falls back to the JSON box for a value the table cannot represent exactly', async () => {
    // The server accepts {"vip":[1,2,3]} and silently discards the third number. The legacy
    // visual editor filtered that entry out of its list and wrote the filtered list back,
    // erasing it. Here the table is unavailable and the raw value is editable.
    stored.ModelRequestRateLimitGroup = '{"vip":[1,2,3]}'
    await renderLoaded(<RateLimitSection />, RATE_LIMIT_READY)

    expect(await screen.findByText('This value can only be edited as JSON')).toBeInTheDocument()
    expect(screen.getByLabelText('Per-group overrides (JSON)')).toHaveValue('{"vip":[1,2,3]}')
    expect(screen.getByRole('button', { name: 'Table' })).toBeDisabled()
  })

  it('sends {} rather than the empty string the server refuses', async () => {
    // PUT ModelRequestRateLimitGroup="" answers {"success":false,
    // "message":"unexpected end of JSON input"} — verified live.
    stored.ModelRequestRateLimitGroup = '{"vip":[0,5000]}'
    await renderLoaded(<RateLimitSection />, RATE_LIMIT_READY)

    fireEvent.click(await screen.findByRole('button', { name: 'JSON' }))
    fireEvent.change(screen.getByLabelText('Per-group overrides (JSON)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'ModelRequestRateLimitGroup', value: '{}' })
  })

  it('blocks a malformed override before the round trip', async () => {
    await renderLoaded(<RateLimitSection />, RATE_LIMIT_READY)

    fireEvent.click(await screen.findByRole('button', { name: 'JSON' }))
    fireEvent.change(screen.getByLabelText('Per-group overrides (JSON)'), {
      target: { value: '{"vip": [0]}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'Each group maps to exactly two whole numbers: [total requests, successful requests].',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('removes a group override from the draft without writing until Save', async () => {
    stored.ModelRequestRateLimitGroup = '{"vip":[0,5000]}'
    await renderLoaded(<RateLimitSection />, RATE_LIMIT_READY)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove the limit for vip' }))
    expect(writes()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'ModelRequestRateLimitGroup', value: '{}' })
  })

  it('surfaces the server’s own refusal instead of pretending the write landed', async () => {
    refuse.ModelRequestRateLimitGroup = 'group vip has negative rate limit values: [-1, 1]'
    await renderLoaded(<RateLimitSection />, RATE_LIMIT_READY)

    fireEvent.click(await screen.findByRole('button', { name: 'JSON' }))
    fireEvent.change(screen.getByLabelText('Per-group overrides (JSON)'), {
      target: { value: '{"vip": [1, 1]}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('group vip has negative rate limit values: [-1, 1]'),
    ).toBeInTheDocument()
  })
})

describe('PasskeySection', () => {
  it('splits the comma-separated origin list one per line', async () => {
    stored['passkey.origins'] = 'https://a.example.com,https://b.example.com'
    await renderLoaded(<PasskeySection />, PASSKEY_READY)

    expect(screen.getByLabelText('Allowed origins')).toHaveValue(
      'https://a.example.com\nhttps://b.example.com',
    )
  })

  it('joins the lines back with commas on save', async () => {
    await renderLoaded(<PasskeySection />, PASSKEY_READY)

    fireEvent.change(screen.getByLabelText('Allowed origins'), {
      target: { value: 'https://a.example.com\n\n  https://b.example.com  \n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      key: 'passkey.origins',
      value: 'https://a.example.com,https://b.example.com',
    })
  })

  it('refuses an http:// origin while insecure origins are off', async () => {
    // The server accepts this happily; it is service/passkey.buildWebAuthn that rejects the
    // origin at sign-in time, so every passkey request fails with an error the USER sees.
    await renderLoaded(<PasskeySection />, PASSKEY_READY)

    fireEvent.change(screen.getByLabelText('Allowed origins'), {
      target: { value: 'http://localhost:3000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'An http:// origin is rejected at sign-in unless insecure origins are allowed below.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('accepts the same origin once insecure origins are allowed', async () => {
    await renderLoaded(<PasskeySection />, PASSKEY_READY)

    fireEvent.change(screen.getByLabelText('Allowed origins'), {
      target: { value: 'http://localhost:3000' },
    })
    fireEvent.click(screen.getByRole('switch', { name: 'Allow insecure origins' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes().map((write) => write.key).sort()).toEqual([
      'passkey.allow_insecure_origin',
      'passkey.origins',
    ])
  })

  it('rejects a relying party ID that was typed as a URL', async () => {
    await renderLoaded(<PasskeySection />, PASSKEY_READY)

    fireEvent.change(screen.getByLabelText('Relying party ID'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('Use a bare domain such as example.com — no scheme, port or path.'),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('folds an unrecognised stored choice back onto the backend default', async () => {
    // A hand-edited row could hold anything; a select with no matching option would show a
    // phantom empty choice and then write it back.
    stored['passkey.user_verification'] = 'nonsense'
    await renderLoaded(<PasskeySection />, PASSKEY_READY)

    expect(screen.getByLabelText('User verification')).toHaveValue('preferred')
  })
})

describe('TokenLimitsSection', () => {
  it('says what 0 actually does, because there is no unlimited sentinel', async () => {
    await renderTokenLimits()

    fireEvent.change(screen.getByLabelText('Maximum API keys per account'), {
      target: { value: '0' },
    })

    expect(
      await screen.findByText(
        'At 0, no account can create an API key at all — there is no “unlimited” value.',
      ),
    ).toBeInTheDocument()
  })

  it('refuses a fractional limit, which the backend would truncate', async () => {
    await renderTokenLimits()

    fireEvent.change(screen.getByLabelText('Maximum API keys per account'), {
      target: { value: '2.5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Enter a whole number of 0 or more.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('writes the one key it owns', async () => {
    await renderTokenLimits()

    fireEvent.change(screen.getByLabelText('Maximum API keys per account'), {
      target: { value: '25' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'token_setting.max_user_tokens', value: '25' })
  })
})
