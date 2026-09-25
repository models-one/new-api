import type { AuthServerConfig } from '@/features/auth/server-config'
import type { OAuthProviderDescriptor, OAuthProviderIcon } from '@/features/auth/oauth-providers'
import type { CustomOAuthBinding } from '@/features/profile/identity-api'
import { ROLE_ADMIN, ROLE_ROOT, ROLE_USER } from '@/features/profile/identity-api'
import type { SelfUser } from '@/lib/api/user'

/** Pure derivations shared by the identity panels. No requests, no React. */

export function displayNameOf(user: Pick<SelfUser, 'display_name' | 'username'>): string {
  const name = user.display_name.trim()
  return name === '' ? user.username : name
}

export type RoleKey = 'guest' | 'user' | 'admin' | 'root' | 'unknown'

/**
 * `common/constants.go`: 0 guest, 1 common user, 10 admin, 100 root. Anything else is a
 * value this console does not know, and saying so is better than guessing a label.
 */
export function roleKeyOf(role: number): RoleKey {
  if (role === ROLE_ROOT) return 'root'
  if (role === ROLE_ADMIN) return 'admin'
  if (role === ROLE_USER) return 'user'
  if (role === 0) return 'guest'
  return 'unknown'
}

/**
 * How a binding is started. `email`, `wechat` and `telegram` each open their own dialog;
 * `redirect` opens the shared OAuth popup.
 */
export type BindingStart = 'email' | 'wechat' | 'telegram' | 'redirect'

export type IdentityBinding = {
  /** Stable React key, and the id the pending-state tracker uses. */
  id: string
  /** Product name or operator-chosen provider name. Never translated. */
  name: string
  icon: OAuthProviderIcon
  start: BindingStart
  bound: boolean
  /**
   * The identifier the server holds for this account: the address for e-mail, the provider
   * user id for a custom provider, the stored `*_id` for a built-in provider. Empty when
   * the server keeps no id it is willing to show.
   */
  boundValue: string
  /** Present for `redirect` bindings; carries `buildAuthorizationUrl`. */
  descriptor?: OAuthProviderDescriptor
  /**
   * Set only for administrator-defined providers — the numeric id
   * `DELETE /api/user/oauth/bindings/:provider_id` takes. Its absence is what says
   * "this deployment has no way for the user to unbind this".
   */
  unbindProviderId?: number
}

/**
 * Descriptor id -> the column on `GET /api/user/self` that holds the linked account id.
 * These six are every built-in provider `oauth.GetProvider` knows plus WeChat.
 */
const builtInIdField = {
  github: 'github_id',
  discord: 'discord_id',
  oidc: 'oidc_id',
  linuxdo: 'linux_do_id',
  telegram: 'telegram_id',
  wechat: 'wechat_id',
} as const satisfies Record<string, keyof SelfUser>

function builtInBoundValue(user: SelfUser, descriptorId: string): string | null {
  if (!(descriptorId in builtInIdField)) return null
  const field = builtInIdField[descriptorId as keyof typeof builtInIdField]
  const value = user[field]
  return typeof value === 'string' ? value : ''
}

const CUSTOM_PREFIX = 'custom:'

/** `custom:<slug>` is the id `authProviderDescriptors` gives an operator-defined provider. */
export function customSlugOf(descriptorId: string): string | null {
  return descriptorId.startsWith(CUSTOM_PREFIX) ? descriptorId.slice(CUSTOM_PREFIX.length) : null
}

export type BuildIdentityBindingsInput = {
  config: AuthServerConfig
  user: SelfUser
  /** `GET /api/user/oauth/bindings`; empty while it is still loading. */
  customBindings: readonly CustomOAuthBinding[]
  /** The enabled providers, in the order `authProviderDescriptors` returns them. */
  descriptors: readonly OAuthProviderDescriptor[]
}

/**
 * The rows the login-identity panel renders.
 *
 * E-mail always appears: `POST /api/oauth/email/bind` and `GET /api/verification` are
 * registered unconditionally in `router/api-router.go` and neither consults the
 * `email_verification` flag, so the deployment can always bind one — provided SMTP works.
 *
 * Every other row comes from a descriptor, so a provider the operator turned off, or
 * turned on without the client id its flow needs, has no row at all rather than a button
 * that cannot succeed.
 */
export function buildIdentityBindings(input: BuildIdentityBindingsInput): IdentityBinding[] {
  const { config, customBindings, descriptors, user } = input

  const rows: IdentityBinding[] = [{
    id: 'email',
    name: 'Email',
    icon: 'generic',
    start: 'email',
    bound: user.email.trim() !== '',
    boundValue: user.email,
  }]

  for (const descriptor of descriptors) {
    const slug = customSlugOf(descriptor.id)

    if (slug === null) {
      const boundValue = builtInBoundValue(user, descriptor.id)
      if (boundValue === null) continue
      rows.push({
        id: descriptor.id,
        name: descriptor.name,
        icon: descriptor.icon,
        start: descriptor.kind === 'redirect' ? 'redirect' : descriptor.kind,
        bound: boundValue.trim() !== '',
        boundValue,
        descriptor,
      })
      continue
    }

    const provider = config.customOAuthProviders.find((entry) => entry.slug === slug)
    if (provider === undefined) continue

    const binding = customBindings.find((entry) => entry.provider_id === provider.id)
    rows.push({
      id: descriptor.id,
      name: provider.name,
      icon: descriptor.icon,
      start: 'redirect',
      bound: binding !== undefined,
      boundValue: binding?.provider_user_id ?? '',
      descriptor,
      unbindProviderId: provider.id,
    })
  }

  return rows
}
