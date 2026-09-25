import { describe, expect, it } from 'vitest'

import { authProviderDescriptors, hasOAuthProviders } from '@/features/auth/oauth-providers'
import { EMPTY_AUTH_SERVER_CONFIG, type AuthServerConfig } from '@/features/auth/server-config'

const origin = 'https://console.example.com'

function configWith(overrides: Partial<AuthServerConfig>): AuthServerConfig {
  return { ...EMPTY_AUTH_SERVER_CONFIG, ...overrides }
}

function idsFor(overrides: Partial<AuthServerConfig>): string[] {
  return authProviderDescriptors(configWith(overrides)).map((provider) => provider.id)
}

describe('authProviderDescriptors', () => {
  it('offers nothing when the server enables nothing', () => {
    expect(authProviderDescriptors(EMPTY_AUTH_SERVER_CONFIG)).toEqual([])
    expect(hasOAuthProviders(EMPTY_AUTH_SERVER_CONFIG)).toBe(false)
  })

  it('omits a provider whose credentials the server did not send', () => {
    expect(idsFor({ githubOAuthEnabled: true })).toEqual([])
    expect(idsFor({ discordOAuthEnabled: true })).toEqual([])
    expect(idsFor({ linuxdoOAuthEnabled: true })).toEqual([])
    expect(idsFor({ telegramOAuthEnabled: true })).toEqual([])
    expect(idsFor({ oidcEnabled: true, oidcClientId: 'client' })).toEqual([])
  })

  it('rejects an OIDC endpoint that is not an absolute http(s) URL', () => {
    expect(idsFor({
      oidcEnabled: true,
      oidcClientId: 'client',
      oidcAuthorizationEndpoint: '/authorize',
    })).toEqual([])

    expect(idsFor({
      oidcEnabled: true,
      oidcClientId: 'client',
      oidcAuthorizationEndpoint: 'javascript:alert(1)',
    })).toEqual([])
  })

  it('lists every configured provider in the established order', () => {
    const ids = idsFor({
      githubOAuthEnabled: true,
      githubClientId: 'gh',
      discordOAuthEnabled: true,
      discordClientId: 'dc',
      oidcEnabled: true,
      oidcClientId: 'oidc',
      oidcAuthorizationEndpoint: 'https://idp.example.com/authorize',
      linuxdoOAuthEnabled: true,
      linuxdoClientId: 'ld',
      telegramOAuthEnabled: true,
      telegramBotName: 'example_bot',
      wechatLoginEnabled: true,
      customOAuthProviders: [{
        id: 1,
        name: 'Acme SSO',
        slug: 'acme',
        icon: '',
        clientId: 'acme-client',
        authorizationEndpoint: 'https://sso.acme.test/authorize',
        scopes: 'openid email',
      }],
    })

    expect(ids).toEqual(['wechat', 'github', 'discord', 'oidc', 'linuxdo', 'telegram', 'custom:acme'])
  })

  it('marks WeChat and Telegram as in-page flows and the rest as redirects', () => {
    const providers = authProviderDescriptors(configWith({
      githubOAuthEnabled: true,
      githubClientId: 'gh',
      telegramOAuthEnabled: true,
      telegramBotName: 'example_bot',
      wechatLoginEnabled: true,
    }))

    const kinds = Object.fromEntries(providers.map((provider) => [provider.id, provider.kind]))
    expect(kinds).toEqual({ wechat: 'wechat', github: 'redirect', telegram: 'telegram' })

    const wechat = providers.find((provider) => provider.id === 'wechat')
    expect(wechat?.buildAuthorizationUrl).toBeUndefined()
  })
})

describe('authorization URLs', () => {
  function urlFor(overrides: Partial<AuthServerConfig>, id: string): string {
    const provider = authProviderDescriptors(configWith(overrides)).find((entry) => entry.id === id)
    if (!provider?.buildAuthorizationUrl) throw new Error(`no redirect provider ${id}`)
    return provider.buildAuthorizationUrl({ state: 'state-token', origin })
  }

  it('sends GitHub the email scope and the state token', () => {
    expect(urlFor({ githubOAuthEnabled: true, githubClientId: 'gh id' }, 'github'))
      .toBe('https://github.com/login/oauth/authorize?client_id=gh%20id&state=state-token&scope=user:email')
  })

  it('points Discord and OIDC at this origin callback', () => {
    const discord = new URL(urlFor({ discordOAuthEnabled: true, discordClientId: 'dc' }, 'discord'))
    expect(discord.searchParams.get('redirect_uri')).toBe('https://console.example.com/oauth/discord')
    expect(discord.searchParams.get('state')).toBe('state-token')
    expect(discord.searchParams.get('response_type')).toBe('code')

    const oidc = new URL(urlFor({
      oidcEnabled: true,
      oidcClientId: 'oidc',
      oidcAuthorizationEndpoint: 'https://idp.example.com/authorize?audience=console',
    }, 'oidc'))
    expect(oidc.origin + oidc.pathname).toBe('https://idp.example.com/authorize')
    // Query parameters already on the endpoint survive.
    expect(oidc.searchParams.get('audience')).toBe('console')
    expect(oidc.searchParams.get('redirect_uri')).toBe('https://console.example.com/oauth/oidc')
    expect(oidc.searchParams.get('scope')).toBe('openid profile email')
  })

  it('builds a custom provider callback from its slug and forwards its scopes', () => {
    const url = new URL(urlFor({
      customOAuthProviders: [{
        id: 1,
        name: 'Acme SSO',
        slug: 'acme',
        icon: '',
        clientId: 'acme-client',
        authorizationEndpoint: 'https://sso.acme.test/authorize',
        scopes: 'openid email',
      }],
    }, 'custom:acme'))

    expect(url.searchParams.get('redirect_uri')).toBe('https://console.example.com/oauth/acme')
    expect(url.searchParams.get('client_id')).toBe('acme-client')
    expect(url.searchParams.get('scope')).toBe('openid email')
  })

  it('omits the scope parameter when a custom provider defines none', () => {
    const url = new URL(urlFor({
      customOAuthProviders: [{
        id: 2,
        name: 'Bare SSO',
        slug: 'bare',
        icon: '',
        clientId: 'bare-client',
        authorizationEndpoint: 'https://sso.bare.test/authorize',
        scopes: '',
      }],
    }, 'custom:bare'))

    expect(url.searchParams.has('scope')).toBe(false)
  })
})
