import type { OAuthProviderIcon } from '@/features/auth/oauth-providers'

type ProviderIdentity = {
  label: string
  icon: OAuthProviderIcon
}

/**
 * The providers `oauth.GetProvider` knows by name. Anything else reaching
 * `/oauth/:provider` is an operator-defined provider, whose slug is the only
 * name this page has — `/api/status` publishes `custom_oauth_providers` only
 * while at least one is enabled, and a callback must still name itself when the
 * status request has not landed (or the provider was turned off mid-flow).
 */
const builtIn: Record<string, ProviderIdentity> = {
  github: { label: 'GitHub', icon: 'github' },
  discord: { label: 'Discord', icon: 'discord' },
  oidc: { label: 'OIDC', icon: 'generic' },
  linuxdo: { label: 'LinuxDO', icon: 'linuxdo' },
  telegram: { label: 'Telegram', icon: 'telegram' },
  wechat: { label: 'WeChat', icon: 'wechat' },
}

/**
 * A display name and mark for a callback slug. The label is never translated:
 * these are product names, and a custom provider's slug is operator text.
 */
export function providerIdentity(provider: string): ProviderIdentity {
  const normalized = provider.trim().toLowerCase()
  return builtIn[normalized] ?? { label: provider.trim(), icon: 'generic' }
}
