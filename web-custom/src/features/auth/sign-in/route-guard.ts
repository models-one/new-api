import { redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { resolveAuthRedirect } from '@/features/auth/auth-redirect'
import { useAuthStore } from '@/stores/auth-store'

/**
 * `?redirect=` is validated as a plain string and NOT trusted here. Everything that acts
 * on it goes through `sanitizeAuthRedirect` first, which is what stops the sign-in page
 * from becoming an open redirector for anyone who can put a link in front of a user.
 */
export const signInSearchSchema = z.object({
  redirect: z.string().optional(),
})

export type SignInSearch = z.infer<typeof signInSearchSchema>

/**
 * Where an already-signed-in visitor should be sent, or null when the page should render.
 *
 * Split out from the guard so the decision is testable without a router or a store.
 */
export function signedInRedirectTarget(
  isSignedIn: boolean,
  requestedRedirect: unknown,
  origin: string,
): string | null {
  if (!isSignedIn) return null
  return resolveAuthRedirect(requestedRedirect, origin)
}

/**
 * Skips the sign-in page for a visitor who already holds a session in this SPA instance.
 *
 * Deliberately synchronous and store-only, exactly as the legacy route guard was. Calling
 * `bootstrapAuthentication()` here would make every anonymous visit to a login page wait
 * on a refresh round trip before the form paints — a cost paid by the majority case to
 * serve the minority one. Inside the app the store is already populated, which is the
 * case this guard exists for (a signed-in user hitting Back onto /sign-in).
 */
export function skipSignInWhenAuthenticated(search: SignInSearch): void {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const target = signedInRedirectTarget(
    useAuthStore.getState().auth.user !== null,
    search.redirect,
    origin,
  )
  if (target !== null) throw redirect({ href: target, replace: true })
}
