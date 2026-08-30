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

const { BasicAuthSection } = await import(
  '@/features/system-settings/auth-security/sections/BasicAuthSection'
)
const { BotProtectionSection } = await import(
  '@/features/system-settings/auth-security/sections/BotProtectionSection'
)
const { OAuthSection } = await import('@/features/system-settings/auth-security/sections/OAuthSection')
const { SsrfSection } = await import('@/features/system-settings/auth-security/sections/SsrfSection')
const { CustomOAuthSection } = await import(
  '@/features/system-settings/auth-security/sections/CustomOAuthSection'
)
const { SensitiveWordsSection } = await import(
  '@/features/system-settings/auth-security/sections/SensitiveWordsSection'
)

/**
 * The option payload as the seeded dev server actually returns it: every value a STRING,
 * and not one `*Secret` / `*Token` / `*Key` among them.
 */
const seeded: Record<string, string> = {
  CheckSensitiveEnabled: 'true',
  CheckSensitiveOnPromptEnabled: 'true',
  SensitiveWords: 'test_sensitive',
  StopOnSensitiveEnabled: 'true',
  'discord.client_id': '',
  'discord.enabled': 'false',
  EmailAliasRestrictionEnabled: 'false',
  EmailDomainRestrictionEnabled: 'false',
  EmailDomainWhitelist: 'gmail.com,163.com',
  EmailVerificationEnabled: 'false',
  'fetch_setting.allow_private_ip': 'false',
  'fetch_setting.allowed_ports': '["80","443","8080","8443"]',
  'fetch_setting.apply_ip_filter_for_domain': 'true',
  'fetch_setting.domain_filter_mode': 'false',
  'fetch_setting.domain_list': '[]',
  'fetch_setting.enable_ssrf_protection': 'true',
  'fetch_setting.ip_filter_mode': 'false',
  'fetch_setting.ip_list': '[]',
  GitHubClientId: '',
  GitHubOAuthEnabled: 'false',
  LinuxDOOAuthEnabled: 'false',
  'oidc.authorization_endpoint': '',
  'oidc.client_id': '',
  'oidc.enabled': 'false',
  'oidc.token_endpoint': '',
  'oidc.user_info_endpoint': '',
  'oidc.well_known': '',
  PasswordLoginEnabled: 'true',
  PasswordRegisterEnabled: 'true',
  RegisterEnabled: 'true',
  ServerAddress: 'https://console.example.com',
  TelegramBotName: '',
  TelegramOAuthEnabled: 'false',
  TurnstileCheckEnabled: 'false',
  WeChatAccountQRCodeImageURL: '',
  WeChatAuthEnabled: 'false',
  WeChatServerAddress: '',
}

type ServerState = {
  stored: Record<string, string>
  /** Keys the server should refuse, mapped to the sentence it refuses them with. */
  refuse: Record<string, string>
  providers: unknown[]
  providersFail: boolean
}

let server: ServerState

function renderSection(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(node, { wrapper })
}

/**
 * A section renders its controls IMMEDIATELY and disables them while `GET /api/option/`
 * is still in flight — `disabled={optionsQuery.isPending || form.isSaving}`. During that
 * first pass the draft holds the readers' fallbacks rather than the server's values, so a
 * bare `findBy*` resolves against the LOADING render: it reads a fallback instead of the
 * stored value, and a click on a disabled switch is swallowed while an edit to a disabled
 * text field still registers. Both produce failures that look like component bugs.
 *
 * Every test therefore waits for the payload before touching anything. The signal is the
 * section's own switch losing `data-disabled` — Base UI's `Switch.Root` is a `span`, so
 * jest-dom's `toBeEnabled()` is meaningless on it and would resolve immediately.
 */
async function renderLoaded(node: ReactElement, readySwitch: string) {
  const result = renderSection(node)
  await waitFor(() =>
    expect(screen.getByRole('switch', { name: readySwitch })).not.toHaveAttribute('data-disabled'),
  )
  return result
}

const READY = {
  basicAuth: 'Restrict e-mail domains',
  sensitiveWords: 'Filter sensitive words',
  botProtection: 'Enable the Turnstile challenge',
  github: 'Enable GitHub sign-in',
  ssrf: 'Protect against server-side request forgery',
} as const

/** Every `{key, value}` the section has written, in order. */
function writes(): { key: string; value: string }[] {
  return put.mock.calls
    .filter((call) => call[0] === '/api/option/')
    .map((call) => call[1] as { key: string; value: string })
}

beforeEach(() => {
  server = { providers: [], providersFail: false, refuse: {}, stored: { ...seeded } }

  get.mockReset()
  put.mockReset()
  post.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/option/') {
      return Promise.resolve({
        data: {
          data: Object.entries(server.stored).map(([key, value]) => ({ key, value })),
          message: '',
          success: true,
        },
      })
    }
    if (url === '/api/custom-oauth-provider/') {
      if (server.providersFail) return Promise.reject(new Error('providers are unavailable'))
      return Promise.resolve({ data: { data: server.providers, message: '', success: true } })
    }
    if (url === '/api/status') {
      return Promise.resolve({ data: { data: { quota_per_unit: 500_000 }, message: '', success: true } })
    }
    throw new Error(`unmocked GET ${url}`)
  })

  put.mockImplementation((url: string, body: { key: string; value: string }) => {
    if (url !== '/api/option/') throw new Error(`unmocked PUT ${url}`)
    const refusal = server.refuse[body.key]
    // A refusal is HTTP 200 with success:false, not a 4xx.
    if (refusal !== undefined) return Promise.resolve({ data: { message: refusal, success: false } })
    server.stored[body.key] = body.value
    return Promise.resolve({ data: { message: '', success: true } })
  })

  del.mockImplementation(() => Promise.resolve({ data: { message: '删除成功', success: true } }))
})

afterEach(cleanup)

describe('BasicAuthSection', () => {
  it('reads the string “false” as a disabled switch, not as truthy', async () => {
    await renderLoaded(<BasicAuthSection />, READY.basicAuth)

    expect(screen.getByRole('switch', { name: 'Restrict e-mail domains' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByRole('switch', { name: 'Password sign-in' })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows the comma-separated whitelist one domain per line', async () => {
    await renderLoaded(<BasicAuthSection />, READY.basicAuth)
    expect(screen.getByLabelText('Allowed e-mail domains')).toHaveValue('gmail.com\n163.com')
  })

  it('joins the lines back with commas on save, writing only what changed', async () => {
    await renderLoaded(<BasicAuthSection />, READY.basicAuth)

    const textarea = screen.getByLabelText('Allowed e-mail domains')
    fireEvent.change(textarea, { target: { value: 'gmail.com\n\n  example.org  \n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'EmailDomainWhitelist', value: 'gmail.com,example.org' })
  })

  it('blocks the empty-whitelist trap the server’s own guard misses', async () => {
    // model.updateOptionMap stores the whitelist as strings.Split(value, ","), and splitting
    // "" yields [""] — length 1 — so len(EmailDomainWhitelist) == 0 is never true and the
    // server ACCEPTS this. Verified live. Every registration would then be rejected.
    await renderLoaded(<BasicAuthSection />, READY.basicAuth)

    fireEvent.change(screen.getByLabelText('Allowed e-mail domains'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Restrict e-mail domains' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'List at least one domain, or turn the domain restriction off — an empty whitelist rejects every address.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('blocks the same trap when only the switch is touched and the stored list is already empty', async () => {
    // The regression this guards: `useOptionSectionForm` refuses a save only when a key it
    // is about to WRITE carries an error. With the whitelist left alone, the switch is the
    // only dirty key, so an error held solely against the textarea would not stop the write
    // — and the server accepts it, locking every address out of registration.
    server.stored.EmailDomainWhitelist = ''
    await renderLoaded(<BasicAuthSection />, READY.basicAuth)

    fireEvent.click(screen.getByRole('switch', { name: 'Restrict e-mail domains' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'List at least one domain, or turn the domain restriction off — an empty whitelist rejects every address.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('still saves the switch when the stored whitelist is not empty', async () => {
    // The other half of the guard: it must not become a wall in front of a legitimate change.
    await renderLoaded(<BasicAuthSection />, READY.basicAuth)

    fireEvent.click(screen.getByRole('switch', { name: 'Restrict e-mail domains' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'EmailDomainRestrictionEnabled', value: 'true' })
  })
})

describe('BotProtectionSection', () => {
  it('opens with both key fields empty and says an empty box is not an empty setting', async () => {
    await renderLoaded(<BotProtectionSection />, READY.botProtection)

    expect(screen.getByLabelText('Turnstile site key')).toHaveValue('')
    expect(screen.getByLabelText('Turnstile secret key')).toHaveValue('')
    expect(screen.getByText('Both keys are write-only')).toBeInTheDocument()
  })

  it('never writes an untouched key, so saving cannot blank a stored secret', async () => {
    await renderLoaded(<BotProtectionSection />, READY.botProtection)

    fireEvent.change(screen.getByLabelText('Turnstile site key'), { target: { value: '0xSITE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0].key).toBe('TurnstileSiteKey')
    expect(writes().some((write) => write.key === 'TurnstileSecretKey')).toBe(false)
  })

  it('holds the enable switch while the site key has unsaved edits', async () => {
    // TurnstileCheckEnabled sorts before TurnstileSiteKey, so one save would send the enable
    // first and have it refused. Verified live.
    await renderLoaded(<BotProtectionSection />, READY.botProtection)

    // Base UI's Switch.Root is a span, so its disabled state is `data-disabled`, not the
    // `disabled` attribute jest-dom's toBeDisabled() looks for.
    expect(screen.getByRole('switch', { name: 'Enable the Turnstile challenge' })).not.toHaveAttribute(
      'data-disabled',
    )

    fireEvent.change(screen.getByLabelText('Turnstile site key'), { target: { value: '0xSITE' } })
    expect(screen.getByRole('switch', { name: 'Enable the Turnstile challenge' })).toHaveAttribute(
      'data-disabled',
    )
    expect(
      screen.getByText(
        'Save the site key first. This setting is written before the site key, so enabling it in the same save would be refused.',
      ),
    ).toBeInTheDocument()
  })

  it('surfaces the server’s own refusal instead of pretending the write landed', async () => {
    server.refuse.TurnstileCheckEnabled = '无法启用 Turnstile 校验，请先填入 Turnstile 校验相关配置信息！'
    await renderLoaded(<BotProtectionSection />, READY.botProtection)

    fireEvent.click(screen.getByRole('switch', { name: 'Enable the Turnstile challenge' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('The server refused some of these settings')).toBeInTheDocument()
    expect(
      screen.getByText('无法启用 Turnstile 校验，请先填入 Turnstile 校验相关配置信息！'),
    ).toBeInTheDocument()
  })
})

describe('OAuthSection', () => {
  it('warns when a provider is on but the sign-in page would draw no button', async () => {
    await renderLoaded(<OAuthSection />, READY.github)

    fireEvent.click(screen.getByRole('switch', { name: 'Enable GitHub sign-in' }))
    expect(await screen.findByText('Enabled, but no sign-in button')).toBeInTheDocument()
    expect(
      screen.getByText('GitHub is on, but its client ID is empty, so the sign-in page draws no button for it.'),
    ).toBeInTheDocument()
  })

  it('builds the callback URL from ServerAddress', async () => {
    await renderLoaded(<OAuthSection />, READY.github)
    expect(screen.getByText('https://console.example.com/oauth/github')).toBeInTheDocument()
  })

  it('starts every secret field empty and does not write the ones left alone', async () => {
    await renderLoaded(<OAuthSection />, READY.github)

    expect(screen.getByLabelText('GitHub client secret')).toHaveValue('')

    fireEvent.change(screen.getByLabelText('GitHub client ID'), { target: { value: 'gh-client' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'GitHubClientId', value: 'gh-client' })
  })

  it('writes the client id before the enable flag, which is the order the server needs', async () => {
    await renderLoaded(<OAuthSection />, READY.github)

    fireEvent.change(screen.getByLabelText('GitHub client ID'), { target: { value: 'gh-client' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Enable GitHub sign-in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes().map((write) => write.key)).toEqual(['GitHubClientId', 'GitHubOAuthEnabled'])
  })
})

describe('SsrfSection', () => {
  it('reads the port list as strings and writes it back as a string array', async () => {
    // FetchSetting.AllowedPorts is []string, and config.updateConfigFromMap silently ignores
    // a blob it cannot unmarshal — the legacy console's [80,443] was stored and never applied.
    await renderLoaded(<SsrfSection />, READY.ssrf)

    const ports = screen.getByLabelText('Allowed ports')
    expect(ports).toHaveValue('80\n443\n8080\n8443')

    fireEvent.change(ports, { target: { value: '443\n8000-9000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'fetch_setting.allowed_ports', value: '["443","8000-9000"]' })
  })

  it('rejects a port list the server would happily store and never apply', async () => {
    await renderLoaded(<SsrfSection />, READY.ssrf)

    fireEvent.change(screen.getByLabelText('Allowed ports'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Ports must be whole numbers between 1 and 65535.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('refuses an allow list with nothing in it, which would block every fetch', async () => {
    await renderLoaded(<SsrfSection />, READY.ssrf)

    fireEvent.click(screen.getAllByRole('radio', { name: /Allow list/ })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'An allow list with nothing in it blocks every host. Add a domain, or switch this filter back to a deny list.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('refuses the same switch on the IP filter, which the server would also accept', async () => {
    await renderLoaded(<SsrfSection />, READY.ssrf)

    fireEvent.click(screen.getAllByRole('radio', { name: /Allow list/ })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'An allow list with nothing in it blocks every address. Add an entry, or switch this filter back to a deny list.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('saves an allow list that actually has an entry', async () => {
    await renderLoaded(<SsrfSection />, READY.ssrf)

    fireEvent.change(screen.getByLabelText('Domain list'), { target: { value: 'cdn.example.com' } })
    fireEvent.click(screen.getAllByRole('radio', { name: /Allow list/ })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes()).toEqual([
      { key: 'fetch_setting.domain_filter_mode', value: 'true' },
      { key: 'fetch_setting.domain_list', value: '["cdn.example.com"]' },
    ])
  })

  it('spells out what turning the protection off means', async () => {
    await renderLoaded(<SsrfSection />, READY.ssrf)

    fireEvent.click(screen.getByRole('switch', { name: 'Protect against server-side request forgery' }))
    expect(await screen.findByText('Outbound fetches are unrestricted')).toBeInTheDocument()
    expect(screen.getByLabelText('Domain list')).toBeDisabled()
  })
})

describe('SensitiveWordsSection', () => {
  it('does not let filtering be switched on against an empty word list', async () => {
    server.stored.CheckSensitiveEnabled = 'false'
    server.stored.SensitiveWords = ''
    await renderLoaded(<SensitiveWordsSection />, READY.sensitiveWords)

    fireEvent.click(screen.getByRole('switch', { name: 'Filter sensitive words' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'Filtering is on but the list is empty, so nothing is ever matched. Add a word or turn filtering off.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('leaves the two dependent switches out of reach while filtering is off', async () => {
    // ShouldCheckPromptSensitive() is CheckSensitiveEnabled && CheckSensitiveOnPromptEnabled,
    // so the prompt switch does nothing on its own. It stays in the tree, disabled.
    server.stored.CheckSensitiveEnabled = 'false'
    await renderLoaded(<SensitiveWordsSection />, READY.sensitiveWords)

    expect(screen.getByRole('switch', { name: 'Scan prompts' })).toHaveAttribute('data-disabled')
    expect(screen.getByRole('switch', { name: 'Refuse instead of rewriting' })).toHaveAttribute(
      'data-disabled',
    )
  })

  it('writes the word list newline-separated, trimmed and without blank lines', async () => {
    // SensitiveWordsFromString splits on "\n", trims and drops blanks; the write matches.
    await renderLoaded(<SensitiveWordsSection />, READY.sensitiveWords)

    fireEvent.change(screen.getByLabelText('Blocked words'), {
      target: { value: '  first  \n\n second \n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'SensitiveWords', value: 'first\nsecond' })
  })
})

describe('CustomOAuthSection', () => {
  it('shows an empty state rather than a blank table', async () => {
    renderSection(<CustomOAuthSection />)
    expect(await screen.findByText('No custom providers yet')).toBeInTheDocument()
  })

  it('reports a failed list with the server’s message and a retry', async () => {
    server.providersFail = true
    renderSection(<CustomOAuthSection />)

    expect(await screen.findByText('Could not load the custom providers')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  it('puts a type-to-confirm gate in front of deleting a provider', async () => {
    server.providers = [
      {
        access_denied_message: '',
        access_policy: '',
        auth_style: 0,
        authorization_endpoint: 'https://idp.example.com/authorize',
        client_id: 'cid',
        display_name_field: 'name',
        email_field: 'email',
        enabled: true,
        icon: '',
        id: 7,
        name: 'Probe IdP',
        scopes: 'openid',
        slug: 'probe-idp',
        token_endpoint: 'https://idp.example.com/token',
        user_id_field: 'sub',
        user_info_endpoint: 'https://idp.example.com/userinfo',
        username_field: 'preferred_username',
        well_known: '',
      },
    ]
    renderSection(<CustomOAuthSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Probe IdP' }))

    const confirm = await screen.findByRole('button', { name: 'Delete provider' })
    expect(confirm).toBeDisabled()
    expect(del).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Type probe-idp to confirm'), {
      target: { value: 'probe-idp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete provider' }))

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/custom-oauth-provider/7', expect.anything()))
  })
})
