import { createOAuthState, logout, type OAuthIntent } from '@/features/auth/api'
import { clearAuthenticatedClientState } from '@/lib/auth-session'
import { queryClient } from '@/lib/query-client'

import type { OAuthProviderDescriptor } from '@/features/auth/oauth-providers'

/**
 * Drops whatever session this browser still holds before an OAuth handshake, so
 * the provider callback lands on a clean slate instead of binding to a stale one.
 *
 * Failure is deliberately non-fatal. The legacy console threw when `logout`
 * answered `success: false`, which turned an already-expired session — the exact
 * state a user signing in is usually in — into a dead sign-in button. The local
 * session is cleared either way, which is the part that actually matters here.
 */
export async function resetAuthSession(): Promise<void> {
  try {
    await logout()
  } catch {
    // Ignored: see above.
  } finally {
    clearAuthenticatedClientState(queryClient)
  }
}

export type StartRedirectOAuthOptions = {
  /** `login` (default) also forwards a stored referral code. */
  intent?: OAuthIntent
  /** Origin used to build `redirect_uri`. Defaults to the current location's. */
  origin?: string
  /** Seam for tests. Defaults to a same-tab navigation. */
  navigate?: (url: string) => void
  /** Seam for tests. Defaults to `resetAuthSession`. */
  resetSession?: () => Promise<void>
}

function navigateSameTab(url: string): void {
  if (typeof window === 'undefined') return
  window.location.assign(url)
}

/**
 * Runs the redirect half of the OAuth handshake: clear the session, mint a state
 * token, then hand the browser to the provider.
 *
 * Every provider shares this one path and one loading state. The legacy console
 * gave GitHub a private 20-second timer that rewrote the button's own label into
 * an error message and left it permanently disabled; that is gone.
 */
export async function startRedirectOAuth(
  descriptor: OAuthProviderDescriptor,
  options: StartRedirectOAuthOptions = {},
): Promise<void> {
  const buildAuthorizationUrl = descriptor.buildAuthorizationUrl
  if (descriptor.kind !== 'redirect' || buildAuthorizationUrl === undefined) {
    throw new Error(`Provider "${descriptor.id}" does not use the redirect flow`)
  }

  const origin = options.origin
    ?? (typeof window === 'undefined' ? '' : window.location.origin)

  await (options.resetSession ?? resetAuthSession)()
  const state = await createOAuthState(descriptor.provider, options.intent ?? 'login')

  const url = buildAuthorizationUrl({ state, origin })
  ;(options.navigate ?? navigateSameTab)(url)
}
