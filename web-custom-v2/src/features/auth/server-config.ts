import { useMemo } from 'react'
import { z } from 'zod'

import { useServerStatus } from '@/hooks/use-server-status'

import type { ServerStatus } from '@/lib/api/status'

/**
 * An admin-defined OAuth provider, normalized from the `custom_oauth_providers`
 * array that `GET /api/status` only emits when at least one provider is enabled
 * (see `controller/misc.go`; the key is absent otherwise).
 */
export type CustomOAuthProvider = {
  id: number
  name: string
  slug: string
  icon: string
  clientId: string
  authorizationEndpoint: string
  scopes: string
}

/**
 * Every `/api/status` flag the authentication surface reads, normalized once.
 *
 * The legacy console read each flag twice — as a property of the status object
 * and again as a property of a nested `data` object — because the payload shape
 * was inconsistent between call sites. That fallback happens exactly once here,
 * in `resolveStatusSource`, and nothing downstream repeats it.
 */
export type AuthServerConfig = {
  systemName: string
  logo: string

  registerEnabled: boolean
  passwordLoginEnabled: boolean
  passwordRegisterEnabled: boolean
  emailVerificationEnabled: boolean

  turnstileEnabled: boolean
  turnstileSiteKey: string

  passkeyLoginEnabled: boolean

  userAgreementEnabled: boolean
  privacyPolicyEnabled: boolean

  githubOAuthEnabled: boolean
  githubClientId: string
  discordOAuthEnabled: boolean
  discordClientId: string
  oidcEnabled: boolean
  oidcClientId: string
  oidcAuthorizationEndpoint: string
  linuxdoOAuthEnabled: boolean
  linuxdoClientId: string
  telegramOAuthEnabled: boolean
  telegramBotName: string
  wechatLoginEnabled: boolean
  wechatQrCodeUrl: string

  customOAuthProviders: CustomOAuthProvider[]

  selfUseModeEnabled: boolean
  demoSiteEnabled: boolean
}

const customOAuthProviderSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  icon: z.string().optional(),
  client_id: z.string().optional(),
  authorization_endpoint: z.string().optional(),
  scopes: z.string().optional(),
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The single place that tolerates a status payload still wrapped in its
 * `{ success, data }` envelope. `getJson` unwraps it, so the flat object is the
 * normal path; the nested branch only keeps a raw response from silently
 * disabling every provider.
 */
function resolveStatusSource(status: ServerStatus | null | undefined): Record<string, unknown> {
  if (!isRecord(status)) return {}
  const nested = status.data
  if (isRecord(nested) && typeof status.success === 'boolean') return nested
  return status
}

function flag(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true
}

function text(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value.trim() : ''
}

function readCustomOAuthProviders(value: unknown): CustomOAuthProvider[] {
  if (!Array.isArray(value)) return []

  const providers: CustomOAuthProvider[] = []
  for (const entry of value) {
    const parsed = customOAuthProviderSchema.safeParse(entry)
    if (!parsed.success) continue

    const name = parsed.data.name.trim()
    const slug = parsed.data.slug.trim()
    if (name === '' || slug === '') continue

    providers.push({
      id: parsed.data.id,
      name,
      slug,
      icon: parsed.data.icon?.trim() ?? '',
      clientId: parsed.data.client_id?.trim() ?? '',
      authorizationEndpoint: parsed.data.authorization_endpoint?.trim() ?? '',
      scopes: parsed.data.scopes?.trim() ?? '',
    })
  }
  return providers
}

/**
 * Normalizes `GET /api/status` into the authentication config. An absent or
 * failed status yields a config with every capability off, so a page rendered
 * before the request settles never offers a method the server may not support.
 */
export function readAuthServerConfig(status: ServerStatus | null | undefined): AuthServerConfig {
  const source = resolveStatusSource(status)
  const turnstileSiteKey = text(source, 'turnstile_site_key')

  return {
    systemName: text(source, 'system_name'),
    logo: text(source, 'logo'),

    registerEnabled: flag(source, 'register_enabled'),
    passwordLoginEnabled: flag(source, 'password_login_enabled'),
    passwordRegisterEnabled: flag(source, 'password_register_enabled'),
    emailVerificationEnabled: flag(source, 'email_verification'),

    turnstileEnabled: flag(source, 'turnstile_check') && turnstileSiteKey !== '',
    turnstileSiteKey,

    passkeyLoginEnabled: flag(source, 'passkey_login'),

    userAgreementEnabled: flag(source, 'user_agreement_enabled'),
    privacyPolicyEnabled: flag(source, 'privacy_policy_enabled'),

    githubOAuthEnabled: flag(source, 'github_oauth'),
    githubClientId: text(source, 'github_client_id'),
    discordOAuthEnabled: flag(source, 'discord_oauth'),
    discordClientId: text(source, 'discord_client_id'),
    oidcEnabled: flag(source, 'oidc_enabled'),
    oidcClientId: text(source, 'oidc_client_id'),
    oidcAuthorizationEndpoint: text(source, 'oidc_authorization_endpoint'),
    linuxdoOAuthEnabled: flag(source, 'linuxdo_oauth'),
    linuxdoClientId: text(source, 'linuxdo_client_id'),
    telegramOAuthEnabled: flag(source, 'telegram_oauth'),
    telegramBotName: text(source, 'telegram_bot_name'),
    wechatLoginEnabled: flag(source, 'wechat_login'),
    // `controller/misc.go` emits exactly one QR key. The legacy console probed six
    // aliases; five of them never existed on this backend.
    wechatQrCodeUrl: text(source, 'wechat_qrcode'),

    customOAuthProviders: readCustomOAuthProviders(source.custom_oauth_providers),

    selfUseModeEnabled: flag(source, 'self_use_mode_enabled'),
    demoSiteEnabled: flag(source, 'demo_site_enabled'),
  }
}

/** Everything disabled: the config a page renders against while status is pending or failed. */
export const EMPTY_AUTH_SERVER_CONFIG: AuthServerConfig = readAuthServerConfig(undefined)

/**
 * Whether the operator published a document the user has to accept. When false
 * there is nothing to consent to and a form must not block submission on it.
 */
export function requiresLegalConsent(config: AuthServerConfig): boolean {
  return config.userAgreementEnabled || config.privacyPolicyEnabled
}

export type UseAuthServerConfigResult = {
  config: AuthServerConfig
  /** True until `/api/status` resolves. Never render a config-driven form on it. */
  isPending: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function useAuthServerConfig(): UseAuthServerConfigResult {
  const query = useServerStatus()
  const config = useMemo(() => readAuthServerConfig(query.data), [query.data])

  return {
    config,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch()
    },
  }
}
