/**
 * The shape of the six built-in OAuth providers, and the gap between "the server lets you
 * enable it" and "the sign-in page will actually draw a button for it".
 *
 * `src/features/auth/oauth-providers.ts` builds the sign-in buttons from `/api/status`
 * and drops any provider whose flow is incomplete — a deliberate fix for the legacy
 * console, which rendered a button on the enable flag alone and left the operator with a
 * control that silently did nothing. That means an operator CAN reach a state the server
 * accepts and the sign-in page ignores, so this editor names it rather than letting it
 * happen quietly.
 *
 * What each button actually needs (read straight off `authProviderDescriptors`):
 *   github    githubOAuthEnabled  && githubClientId !== ''
 *   discord   discordOAuthEnabled && discordClientId !== ''
 *   oidc      oidcEnabled && oidcClientId !== '' && absolute http(s) authorization endpoint
 *   linuxdo   linuxdoOAuthEnabled && linuxdoClientId !== ''
 *   telegram  telegramOAuthEnabled && telegramBotName !== ''   <- the NAME, not the token
 *   wechat    wechatLoginEnabled                                <- flag alone is enough
 *
 * Telegram is the interesting one: the SERVER refuses to enable it without a bot TOKEN,
 * while the sign-in page needs the bot NAME. Setting one without the other is accepted and
 * produces no button.
 */

export const OAUTH_PROVIDER_IDS = ['github', 'discord', 'oidc', 'telegram', 'linuxdo', 'wechat'] as const

export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number]

/** Absolute http(s) URL — the same test `oauth-providers.ts` applies. */
export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * `ServerAddress` with any trailing slashes removed, or `fallback` when it is unset.
 * The backend concatenates callback paths onto it, so `https://host/` would otherwise
 * produce `https://host//oauth/github`.
 */
export function resolveSiteUrl(serverAddress: string, fallback: string): string {
  return serverAddress.trim().replace(/\/+$/, '') || fallback
}

/** The redirect URI to register with the provider: `<site>/oauth/<slug>`. */
export function buildCallbackUrl(serverAddress: string, slug: string, fallback: string): string {
  return `${resolveSiteUrl(serverAddress, fallback)}/oauth/${slug.replace(/^\/+/, '')}`
}

/** The subset of the OAuth draft the readiness check looks at. */
export type OAuthReadinessInput = {
  GitHubOAuthEnabled: boolean
  GitHubClientId: string
  'discord.enabled': boolean
  'discord.client_id': string
  'oidc.enabled': boolean
  'oidc.client_id': string
  'oidc.authorization_endpoint': string
  TelegramOAuthEnabled: boolean
  TelegramBotName: string
  LinuxDOOAuthEnabled: boolean
  LinuxDOClientId: string
}

/** One provider that is switched on but will not appear on the sign-in page. */
export type OAuthReadinessGap = {
  provider: OAuthProviderId
  /** Which piece is missing, so the section can pick the right sentence. */
  reason: 'client-id' | 'authorization-endpoint' | 'bot-name'
}

/**
 * Providers that are enabled but incomplete. Pure, so the section can call it on every
 * render and the test can drive it directly.
 */
export function oauthReadinessGaps(values: OAuthReadinessInput): OAuthReadinessGap[] {
  const gaps: OAuthReadinessGap[] = []

  if (values.GitHubOAuthEnabled && values.GitHubClientId.trim() === '') {
    gaps.push({ provider: 'github', reason: 'client-id' })
  }
  if (values['discord.enabled'] && values['discord.client_id'].trim() === '') {
    gaps.push({ provider: 'discord', reason: 'client-id' })
  }
  if (values['oidc.enabled']) {
    if (values['oidc.client_id'].trim() === '') {
      gaps.push({ provider: 'oidc', reason: 'client-id' })
    } else if (!isAbsoluteHttpUrl(values['oidc.authorization_endpoint'].trim())) {
      gaps.push({ provider: 'oidc', reason: 'authorization-endpoint' })
    }
  }
  if (values.TelegramOAuthEnabled && values.TelegramBotName.trim() === '') {
    gaps.push({ provider: 'telegram', reason: 'bot-name' })
  }
  if (values.LinuxDOOAuthEnabled && values.LinuxDOClientId.trim() === '') {
    gaps.push({ provider: 'linuxdo', reason: 'client-id' })
  }

  return gaps
}
