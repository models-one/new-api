import { describe, expect, it } from 'vitest'

import {
  serializeStringList,
  splitCommas,
  splitLines,
  validateDomainEntries,
  validateIpEntries,
  validatePortEntries,
  validateRateLimitGroups,
} from '@/features/system-settings/auth-security/validation'
import {
  isAbsoluteHttpUrl,
  oauthReadinessGaps,
  buildCallbackUrl,
  resolveSiteUrl,
  type OAuthReadinessInput,
} from '@/features/system-settings/auth-security/oauth-config'

describe('validateRateLimitGroups', () => {
  it('accepts an empty value and the shipped default', () => {
    expect(validateRateLimitGroups('')).toBeUndefined()
    expect(validateRateLimitGroups('   ')).toBeUndefined()
    expect(validateRateLimitGroups('{}')).toBeUndefined()
    expect(validateRateLimitGroups('{"vip": [0, 5000]}')).toBeUndefined()
  })

  it('rejects malformed JSON and non-objects', () => {
    expect(validateRateLimitGroups('not json')).toBe('invalid-json')
    expect(validateRateLimitGroups('[1,2]')).toBe('not-an-object')
    expect(validateRateLimitGroups('"vip"')).toBe('not-an-object')
    expect(validateRateLimitGroups('null')).toBe('not-an-object')
  })

  it('mirrors CheckModelRequestRateLimitGroup on the pair itself', () => {
    expect(validateRateLimitGroups('{"vip": [1]}')).toBe('bad-limit-shape')
    expect(validateRateLimitGroups('{"vip": [1, 2, 3]}')).toBe('bad-limit-shape')
    expect(validateRateLimitGroups('{"vip": ["1", "2"]}')).toBe('bad-limit-shape')
    expect(validateRateLimitGroups('{"vip": [1.5, 2]}')).toBe('bad-limit-shape')
    expect(validateRateLimitGroups('{"vip": [-1, 2]}')).toBe('negative-total')
    expect(validateRateLimitGroups('{"vip": [0, 0]}')).toBe('success-below-one')
    expect(validateRateLimitGroups('{"vip": [0, 2147483648]}')).toBe('limit-too-large')
  })
})

describe('validatePortEntries', () => {
  it('accepts single ports, ranges and an empty list', () => {
    expect(validatePortEntries([])).toBeUndefined()
    expect(validatePortEntries(['80', '443', '8080', '8443'])).toBeUndefined()
    expect(validatePortEntries(['8000-9000'])).toBeUndefined()
    expect(validatePortEntries(['  443  ', ''])).toBeUndefined()
  })

  it('rejects what common.parsePortRanges would reject', () => {
    expect(validatePortEntries(['nope'])).toBe('bad-port')
    expect(validatePortEntries(['0'])).toBe('bad-port')
    expect(validatePortEntries(['70000'])).toBe('bad-port')
    expect(validatePortEntries(['9000-8000'])).toBe('bad-port-range')
    expect(validatePortEntries(['1-2-3'])).toBe('bad-port-range')
    expect(validatePortEntries(['a-b'])).toBe('bad-port-range')
  })
})

describe('validateIpEntries', () => {
  it('accepts bare addresses and CIDR blocks', () => {
    expect(validateIpEntries(['203.0.113.7'])).toBeUndefined()
    expect(validateIpEntries(['203.0.113.0/24'])).toBeUndefined()
    expect(validateIpEntries(['2001:db8::/32'])).toBeUndefined()
    expect(validateIpEntries([])).toBeUndefined()
  })

  it('rejects typos rather than storing something that never matches', () => {
    expect(validateIpEntries(['203.0.113'])).toBe('bad-cidr')
    expect(validateIpEntries(['203.0.113.300'])).toBe('bad-cidr')
    expect(validateIpEntries(['203.0.113.0/33'])).toBe('bad-cidr')
    expect(validateIpEntries(['203.0.113.0/24/8'])).toBe('bad-cidr')
    expect(validateIpEntries(['https://203.0.113.7'])).toBe('bad-cidr')
  })
})

describe('validateDomainEntries', () => {
  it('accepts a bare domain and a wildcard', () => {
    expect(validateDomainEntries(['example.com', '*.cdn.example.com'])).toBeUndefined()
  })

  it('rejects entries the backend could never match', () => {
    // `common.isDomainListed` compares the host verbatim, so a scheme, port or path in the
    // list is dead weight the operator would never notice.
    expect(validateDomainEntries(['https://example.com'])).toBe('bad-domain')
    expect(validateDomainEntries(['example.com/path'])).toBe('bad-domain')
    expect(validateDomainEntries(['example.com:443'])).toBe('bad-domain')
  })
})

describe('list serialisation', () => {
  it('writes a JSON array of STRINGS, never numbers', () => {
    // FetchSetting.AllowedPorts is []string. The legacy console wrote [80,443], which
    // json.Unmarshal cannot place into it, and config.updateConfigFromMap swallows the
    // error — so the port list was stored and silently never applied.
    expect(serializeStringList('80\n443\n8000-9000')).toBe('["80","443","8000-9000"]')
    expect(JSON.parse(serializeStringList('80\n443')).every((entry: unknown) => typeof entry === 'string')).toBe(true)
  })

  it('drops blank entries and trims the rest', () => {
    expect(serializeStringList('  80  \n\n 443 \n')).toBe('["80","443"]')
    expect(serializeStringList('')).toBe('[]')
    expect(serializeStringList('a, b', 'comma')).toBe('["a","b"]')
  })

  it('splits both encodings the option payload uses', () => {
    expect(splitLines('a\n \nb')).toEqual(['a', 'b'])
    expect(splitCommas('gmail.com, 163.com,,')).toEqual(['gmail.com', '163.com'])
  })
})

describe('isAbsoluteHttpUrl', () => {
  it('accepts http and https only', () => {
    expect(isAbsoluteHttpUrl('https://idp.example.com/authorize')).toBe(true)
    expect(isAbsoluteHttpUrl('http://localhost:8931/authorize')).toBe(true)
    expect(isAbsoluteHttpUrl('/authorize')).toBe(false)
    expect(isAbsoluteHttpUrl('ftp://example.com')).toBe(false)
    expect(isAbsoluteHttpUrl('')).toBe(false)
  })
})

describe('callback URLs', () => {
  it('strips trailing slashes so the backend does not build a double slash', () => {
    expect(resolveSiteUrl('https://example.com//', 'fallback')).toBe('https://example.com')
    expect(buildCallbackUrl('https://example.com/', 'github', '')).toBe('https://example.com/oauth/github')
  })

  it('falls back when ServerAddress is unset', () => {
    expect(resolveSiteUrl('   ', 'Site URL')).toBe('Site URL')
  })
})

describe('oauthReadinessGaps', () => {
  const base: OAuthReadinessInput = {
    'discord.client_id': '',
    'discord.enabled': false,
    GitHubClientId: '',
    GitHubOAuthEnabled: false,
    LinuxDOClientId: '',
    LinuxDOOAuthEnabled: false,
    'oidc.authorization_endpoint': '',
    'oidc.client_id': '',
    'oidc.enabled': false,
    TelegramBotName: '',
    TelegramOAuthEnabled: false,
  }

  it('reports nothing when every provider is off', () => {
    expect(oauthReadinessGaps(base)).toEqual([])
  })

  it('flags a provider that is on with no client id', () => {
    expect(oauthReadinessGaps({ ...base, GitHubOAuthEnabled: true })).toEqual([
      { provider: 'github', reason: 'client-id' },
    ])
  })

  it('flags Telegram on the bot NAME, which the server never checks', () => {
    // controller.UpdateOption gates TelegramOAuthEnabled on the bot TOKEN; the sign-in page
    // needs the bot NAME. Setting one without the other is accepted and draws no button.
    expect(oauthReadinessGaps({ ...base, TelegramOAuthEnabled: true })).toEqual([
      { provider: 'telegram', reason: 'bot-name' },
    ])
    expect(oauthReadinessGaps({ ...base, TelegramBotName: 'my_bot', TelegramOAuthEnabled: true })).toEqual([])
  })

  it('flags OIDC whose authorization endpoint is not absolute', () => {
    expect(
      oauthReadinessGaps({
        ...base,
        'oidc.authorization_endpoint': '/authorize',
        'oidc.client_id': 'abc',
        'oidc.enabled': true,
      }),
    ).toEqual([{ provider: 'oidc', reason: 'authorization-endpoint' }])
  })

  it('reports the missing client id before the endpoint, one gap per provider', () => {
    expect(oauthReadinessGaps({ ...base, 'oidc.enabled': true })).toEqual([
      { provider: 'oidc', reason: 'client-id' },
    ])
  })

  it('reports several providers at once', () => {
    expect(
      oauthReadinessGaps({
        ...base,
        'discord.enabled': true,
        GitHubOAuthEnabled: true,
        LinuxDOOAuthEnabled: true,
      }),
    ).toEqual([
      { provider: 'github', reason: 'client-id' },
      { provider: 'discord', reason: 'client-id' },
      { provider: 'linuxdo', reason: 'client-id' },
    ])
  })
})
