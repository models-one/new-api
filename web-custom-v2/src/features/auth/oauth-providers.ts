import type { AuthServerConfig, CustomOAuthProvider } from '@/features/auth/server-config'

/**
 * How a provider is started.
 * - `redirect`  — POST /api/oauth/state, then leave the page for the provider.
 * - `telegram`  — open the Telegram login widget, then POST the authorization.
 * - `wechat`    — open the QR dialog and exchange a code the user types in.
 */
export type OAuthProviderKind = 'redirect' | 'telegram' | 'wechat'

/** Decorative mark drawn on the button. Not a brand asset; see ProviderIcon. */
export type OAuthProviderIcon = 'github' | 'discord' | 'linuxdo' | 'telegram' | 'wechat' | 'generic'

export type AuthorizationUrlInput = {
  /** Flow token from `POST /api/oauth/state`. */
  state: string
  /** Origin the provider redirects back to, e.g. `https://console.example.com`. */
  origin: string
}

export type OAuthProviderDescriptor = {
  /** Stable key for React lists and for tracking which button is busy. */
  id: string
  /** The `provider` value `POST /api/oauth/state` expects. */
  provider: string
  /** Display name, interpolated into "Continue with {{name}}". Not translated. */
  name: string
  kind: OAuthProviderKind
  icon: OAuthProviderIcon
  /** Present only when `kind` is `redirect`. */
  buildAuthorizationUrl?: (input: AuthorizationUrlInput) => string
}

function callbackUrl(origin: string, slug: string): string {
  return new URL(`/oauth/${slug}`, origin).toString()
}

export function buildGitHubAuthorizationUrl(clientId: string, state: string): string {
  const client = encodeURIComponent(clientId)
  const flow = encodeURIComponent(state)
  return `https://github.com/login/oauth/authorize?client_id=${client}&state=${flow}&scope=user:email`
}

export function buildDiscordAuthorizationUrl(clientId: string, state: string, origin: string): string {
  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', callbackUrl(origin, 'discord'))
  url.searchParams.set('response_type', 'code')
  // Kept exactly as the legacy console sends it. See the report: the `+` is very
  // likely meant to be a scope separator, but changing it here would silently
  // alter a live flow.
  url.searchParams.set('scope', 'identify+openid')
  url.searchParams.set('state', state)
  return url.toString()
}

export function buildOidcAuthorizationUrl(
  authorizationEndpoint: string,
  clientId: string,
  state: string,
  origin: string,
): string {
  const url = new URL(authorizationEndpoint)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', callbackUrl(origin, 'oidc'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid profile email')
  url.searchParams.set('state', state)
  return url.toString()
}

export function buildLinuxDoAuthorizationUrl(clientId: string, state: string): string {
  const client = encodeURIComponent(clientId)
  const flow = encodeURIComponent(state)
  return `https://connect.linux.do/oauth2/authorize?response_type=code&client_id=${client}&state=${flow}`
}

export function buildCustomAuthorizationUrl(
  provider: CustomOAuthProvider,
  state: string,
  origin: string,
): string {
  const url = new URL(provider.authorizationEndpoint)
  url.searchParams.set('client_id', provider.clientId)
  url.searchParams.set('redirect_uri', callbackUrl(origin, provider.slug))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  if (provider.scopes !== '') url.searchParams.set('scope', provider.scopes)
  return url.toString()
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * The enabled providers, in the order the legacy console rendered them.
 *
 * A provider appears only when the server gave every value its flow needs. The
 * legacy console rendered a button on the enable flag alone, so an operator who
 * turned GitHub on without a client id got a button whose handler returned
 * immediately. Here that button does not exist.
 */
export function authProviderDescriptors(config: AuthServerConfig): OAuthProviderDescriptor[] {
  const descriptors: OAuthProviderDescriptor[] = []

  if (config.wechatLoginEnabled) {
    descriptors.push({ id: 'wechat', provider: 'wechat', name: 'WeChat', kind: 'wechat', icon: 'wechat' })
  }

  if (config.githubOAuthEnabled && config.githubClientId !== '') {
    const clientId = config.githubClientId
    descriptors.push({
      id: 'github',
      provider: 'github',
      name: 'GitHub',
      kind: 'redirect',
      icon: 'github',
      buildAuthorizationUrl: ({ state }) => buildGitHubAuthorizationUrl(clientId, state),
    })
  }

  if (config.discordOAuthEnabled && config.discordClientId !== '') {
    const clientId = config.discordClientId
    descriptors.push({
      id: 'discord',
      provider: 'discord',
      name: 'Discord',
      kind: 'redirect',
      icon: 'discord',
      buildAuthorizationUrl: ({ state, origin }) => buildDiscordAuthorizationUrl(clientId, state, origin),
    })
  }

  if (config.oidcEnabled && config.oidcClientId !== '' && isAbsoluteHttpUrl(config.oidcAuthorizationEndpoint)) {
    const { oidcAuthorizationEndpoint, oidcClientId } = config
    descriptors.push({
      id: 'oidc',
      provider: 'oidc',
      name: 'OIDC',
      kind: 'redirect',
      icon: 'generic',
      buildAuthorizationUrl: ({ state, origin }) =>
        buildOidcAuthorizationUrl(oidcAuthorizationEndpoint, oidcClientId, state, origin),
    })
  }

  if (config.linuxdoOAuthEnabled && config.linuxdoClientId !== '') {
    const clientId = config.linuxdoClientId
    descriptors.push({
      id: 'linuxdo',
      provider: 'linuxdo',
      name: 'LinuxDO',
      kind: 'redirect',
      icon: 'linuxdo',
      buildAuthorizationUrl: ({ state }) => buildLinuxDoAuthorizationUrl(clientId, state),
    })
  }

  if (config.telegramOAuthEnabled && config.telegramBotName !== '') {
    descriptors.push({ id: 'telegram', provider: 'telegram', name: 'Telegram', kind: 'telegram', icon: 'telegram' })
  }

  for (const provider of config.customOAuthProviders) {
    if (provider.clientId === '' || !isAbsoluteHttpUrl(provider.authorizationEndpoint)) continue
    descriptors.push({
      id: `custom:${provider.slug}`,
      provider: provider.slug,
      name: provider.name,
      kind: 'redirect',
      icon: 'generic',
      buildAuthorizationUrl: ({ state, origin }) => buildCustomAuthorizationUrl(provider, state, origin),
    })
  }

  return descriptors
}

export function hasOAuthProviders(config: AuthServerConfig): boolean {
  return authProviderDescriptors(config).length > 0
}
