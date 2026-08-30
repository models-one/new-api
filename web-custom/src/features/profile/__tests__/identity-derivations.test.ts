import { describe, expect, it } from 'vitest'

import { EMPTY_AUTH_SERVER_CONFIG, readAuthServerConfig } from '@/features/auth/server-config'
import { authProviderDescriptors } from '@/features/auth/oauth-providers'
import {
  buildIdentityBindings,
  customSlugOf,
  displayNameOf,
  roleKeyOf,
} from '@/features/profile/identity'
import { sumMonthlyQuota } from '@/features/profile/components/CheckInPanel'
import { validatePasswordChange } from '@/features/profile/components/ChangePasswordDialog'

import type { CustomOAuthBinding } from '@/features/profile/identity-api'
import type { ServerStatus } from '@/lib/api/status'
import type { SelfUser } from '@/lib/api/user'

/** Captured verbatim from `GET /api/user/self` on the seeded dev server. */
const baseUser: SelfUser = {
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
  used_quota: 0,
  username: 'root',
  wechat_id: '',
}

function bindingsFor(user: Partial<SelfUser>, status: Record<string, unknown>, custom: CustomOAuthBinding[] = []) {
  // Same shape as the auth suite's fixtures: a partial capture of `GET /api/status`,
  // which is exactly what `readAuthServerConfig` is written to tolerate.
  const config = readAuthServerConfig(status as unknown as ServerStatus)
  return buildIdentityBindings({
    config,
    customBindings: custom,
    descriptors: authProviderDescriptors(config),
    user: { ...baseUser, ...user },
  })
}

describe('displayNameOf', () => {
  it('falls back to the username when the display name is blank', () => {
    expect(displayNameOf({ display_name: '   ', username: 'root' })).toBe('root')
    expect(displayNameOf({ display_name: 'Root User', username: 'root' })).toBe('Root User')
  })
})

describe('roleKeyOf', () => {
  it('maps the four roles common/constants.go defines', () => {
    expect(roleKeyOf(0)).toBe('guest')
    expect(roleKeyOf(1)).toBe('user')
    expect(roleKeyOf(10)).toBe('admin')
    expect(roleKeyOf(100)).toBe('root')
  })

  it('does not guess a label for a value the backend never issues', () => {
    expect(roleKeyOf(42)).toBe('unknown')
  })
})

describe('customSlugOf', () => {
  it('recognises only the descriptor ids authProviderDescriptors mints for custom providers', () => {
    expect(customSlugOf('custom:acme')).toBe('acme')
    expect(customSlugOf('github')).toBeNull()
  })
})

describe('buildIdentityBindings', () => {
  it('offers e-mail even when every provider is off, because the bind route is unconditional', () => {
    const rows = bindingsFor({}, {})
    expect(rows.map((row) => row.id)).toEqual(['email'])
    expect(rows[0].bound).toBe(false)
    expect(rows[0].start).toBe('email')
  })

  it('marks e-mail bound from the address on the user row', () => {
    const rows = bindingsFor({ email: 'root@example.com' }, {})
    expect(rows[0].bound).toBe(true)
    expect(rows[0].boundValue).toBe('root@example.com')
  })

  it('skips a provider the operator enabled without the client id its flow needs', () => {
    const rows = bindingsFor({}, { github_oauth: true, github_client_id: '' })
    expect(rows.map((row) => row.id)).toEqual(['email'])
  })

  it('reads a built-in provider bound state off its column on /api/user/self', () => {
    const rows = bindingsFor(
      { github_id: 'octocat', linux_do_id: '' },
      { github_oauth: true, github_client_id: 'gh-client', linuxdo_oauth: true, linuxdo_client_id: 'ld' },
    )

    const github = rows.find((row) => row.id === 'github')
    const linuxdo = rows.find((row) => row.id === 'linuxdo')
    expect(github?.bound).toBe(true)
    expect(github?.boundValue).toBe('octocat')
    expect(linuxdo?.bound).toBe(false)
  })

  it('gives a built-in provider no unbind id, because the server exposes no self-service route', () => {
    const rows = bindingsFor(
      { github_id: 'octocat' },
      { github_oauth: true, github_client_id: 'gh-client' },
    )
    expect(rows.find((row) => row.id === 'github')?.unbindProviderId).toBeUndefined()
  })

  it('matches a custom binding on the NUMERIC provider_id the API returns', () => {
    const status = {
      custom_oauth_providers: [{
        authorization_endpoint: 'https://sso.example.com/authorize',
        client_id: 'abc',
        id: 7,
        name: 'Acme SSO',
        scopes: 'openid',
        slug: 'acme',
      }],
    }
    const rows = bindingsFor({}, status, [{
      provider_icon: '',
      provider_id: 7,
      provider_name: 'Acme SSO',
      provider_slug: 'acme',
      provider_user_id: 'u-1234',
    }])

    const acme = rows.find((row) => row.id === 'custom:acme')
    expect(acme?.bound).toBe(true)
    expect(acme?.boundValue).toBe('u-1234')
    expect(acme?.unbindProviderId).toBe(7)
  })

  it('leaves a custom provider unbound when the bindings list has no row for it', () => {
    const status = {
      custom_oauth_providers: [{
        authorization_endpoint: 'https://sso.example.com/authorize',
        client_id: 'abc',
        id: 7,
        name: 'Acme SSO',
        slug: 'acme',
      }],
    }
    const rows = bindingsFor({}, status, [])
    const acme = rows.find((row) => row.id === 'custom:acme')
    expect(acme?.bound).toBe(false)
    expect(acme?.unbindProviderId).toBe(7)
  })

  it('produces nothing but e-mail from the empty config a pending status renders against', () => {
    const rows = buildIdentityBindings({
      config: EMPTY_AUTH_SERVER_CONFIG,
      customBindings: [],
      descriptors: [],
      user: baseUser,
    })
    expect(rows).toHaveLength(1)
  })
})

describe('validatePasswordChange', () => {
  it('requires the original password, which checkUpdatePassword compares server-side', () => {
    expect(validatePasswordChange({ confirm: 'abcdefgh', next: 'abcdefgh', original: '' }))
      .toBe('original_required')
  })

  it('mirrors the model.User length tags before the server answers "Invalid input"', () => {
    expect(validatePasswordChange({ confirm: 'short', next: 'short', original: 'old-one-1' }))
      .toBe('too_short')
    expect(validatePasswordChange({
      confirm: 'a'.repeat(21),
      next: 'a'.repeat(21),
      original: 'old-one-1',
    })).toBe('too_long')
  })

  it('refuses a no-op change and a typo in the confirmation', () => {
    expect(validatePasswordChange({ confirm: 'same-one-1', next: 'same-one-1', original: 'same-one-1' }))
      .toBe('same_as_current')
    expect(validatePasswordChange({ confirm: 'other-one', next: 'new-one-11', original: 'old-one-1' }))
      .toBe('mismatch')
  })

  it('accepts a change that satisfies every rule', () => {
    expect(validatePasswordChange({ confirm: 'new-one-11', next: 'new-one-11', original: 'old-one-1' }))
      .toBeNull()
  })
})

describe('sumMonthlyQuota', () => {
  it('adds up the quota the server reported per claimed day', () => {
    expect(sumMonthlyQuota([
      { checkin_date: '2026-08-29', quota_awarded: 3227 },
      { checkin_date: '2026-08-30', quota_awarded: 1000 },
    ])).toBe(4227)
  })

  it('is zero for a month with no records', () => {
    expect(sumMonthlyQuota([])).toBe(0)
  })
})
