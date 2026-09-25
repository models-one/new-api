import { describe, expect, it } from 'vitest'

import { readAuthServerConfig, requiresLegalConsent } from '@/features/auth/server-config'

import type { ServerStatus } from '@/lib/api/status'

/** Captured verbatim from `GET /api/status` on the seeded dev server. */
const liveStatus = {
  discord_client_id: '',
  discord_oauth: false,
  email_verification: false,
  github_client_id: '',
  github_oauth: false,
  linuxdo_client_id: '',
  linuxdo_oauth: false,
  logo: '',
  oidc_authorization_endpoint: '',
  oidc_client_id: '',
  oidc_enabled: false,
  passkey_login: false,
  password_login_enabled: true,
  password_register_enabled: true,
  privacy_policy_enabled: false,
  register_enabled: true,
  self_use_mode_enabled: false,
  system_name: 'New API',
  telegram_bot_name: '',
  telegram_oauth: false,
  turnstile_check: false,
  turnstile_site_key: '',
  user_agreement_enabled: false,
  wechat_login: false,
  wechat_qrcode: '',
} as unknown as ServerStatus

function statusWith(overrides: Record<string, unknown>): ServerStatus {
  return { ...liveStatus, ...overrides } as unknown as ServerStatus
}

describe('readAuthServerConfig', () => {
  it('disables every capability when status is missing', () => {
    const config = readAuthServerConfig(undefined)

    expect(config.passwordLoginEnabled).toBe(false)
    expect(config.registerEnabled).toBe(false)
    expect(config.githubOAuthEnabled).toBe(false)
    expect(config.turnstileEnabled).toBe(false)
    expect(config.systemName).toBe('')
    expect(config.customOAuthProviders).toEqual([])
  })

  it('reads the seeded dev server payload', () => {
    const config = readAuthServerConfig(liveStatus)

    expect(config.systemName).toBe('New API')
    expect(config.passwordLoginEnabled).toBe(true)
    expect(config.passwordRegisterEnabled).toBe(true)
    expect(config.registerEnabled).toBe(true)
    expect(config.emailVerificationEnabled).toBe(false)
    expect(config.passkeyLoginEnabled).toBe(false)
    expect(config.wechatQrCodeUrl).toBe('')
  })

  it('treats a missing key and a non-boolean value as disabled', () => {
    const config = readAuthServerConfig(statusWith({ github_oauth: 'true', passkey_login: 1 }))

    expect(config.githubOAuthEnabled).toBe(false)
    expect(config.passkeyLoginEnabled).toBe(false)
  })

  it('requires a site key before reporting Turnstile as enabled', () => {
    expect(readAuthServerConfig(statusWith({ turnstile_check: true })).turnstileEnabled).toBe(false)
    expect(readAuthServerConfig(statusWith({ turnstile_check: true, turnstile_site_key: '  ' })).turnstileEnabled)
      .toBe(false)

    const enabled = readAuthServerConfig(statusWith({ turnstile_check: true, turnstile_site_key: '0xAAA' }))
    expect(enabled.turnstileEnabled).toBe(true)
    expect(enabled.turnstileSiteKey).toBe('0xAAA')
  })

  it('normalizes custom OAuth providers and drops unusable rows', () => {
    const config = readAuthServerConfig(statusWith({
      custom_oauth_providers: [
        {
          id: 3,
          name: ' GitHub Enterprise ',
          slug: ' github-enterprise ',
          icon: 'Github',
          client_id: ' abc ',
          authorization_endpoint: ' https://git.example.com/login/oauth/authorize ',
          scopes: 'openid profile',
        },
        { id: 4, name: '   ', slug: 'blank-name' },
        { id: 'not-a-number', name: 'Broken', slug: 'broken' },
        'nonsense',
      ],
    }))

    expect(config.customOAuthProviders).toEqual([
      {
        id: 3,
        name: 'GitHub Enterprise',
        slug: 'github-enterprise',
        icon: 'Github',
        clientId: 'abc',
        authorizationEndpoint: 'https://git.example.com/login/oauth/authorize',
        scopes: 'openid profile',
      },
    ])
  })

  it('reads a payload that is still wrapped in its response envelope', () => {
    const envelope = { success: true, message: '', data: liveStatus } as unknown as ServerStatus

    expect(readAuthServerConfig(envelope).systemName).toBe('New API')
    expect(readAuthServerConfig(envelope).passwordLoginEnabled).toBe(true)
  })
})

describe('requiresLegalConsent', () => {
  it('is false only when the operator published neither document', () => {
    expect(requiresLegalConsent(readAuthServerConfig(liveStatus))).toBe(false)
    expect(requiresLegalConsent(readAuthServerConfig(statusWith({ user_agreement_enabled: true })))).toBe(true)
    expect(requiresLegalConsent(readAuthServerConfig(statusWith({ privacy_policy_enabled: true })))).toBe(true)
  })
})
