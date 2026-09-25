import { redirect } from '@tanstack/react-router'

import { useAuthStore } from '@/stores/auth-store'

/**
 * The search schema for `/sign-up` and `/register`.
 *
 * A TanStack route with no `validateSearch` has the search schema `{}`, which makes
 * `redirect({ to, search })` reject anything real and leaves the parameters untyped. The
 * pass-through keeps whatever arrived — the `?aff=` referral code above all, which
 * `/register` has to hand to `/sign-up` intact — and `captureReferralCode` narrows what it
 * actually reads.
 *
 * Preserving the whole object rather than just `aff` matches the legacy route, which
 * forwarded `location.search` wholesale. `/register` is the URL printed on referral links,
 * so anything an operator appends to it has to survive the hop.
 */
export function passThroughSearch(search: Record<string, unknown>): Record<string, unknown> {
  return search
}

/**
 * Skips the registration page for a visitor who already holds a session in this SPA
 * instance — the legacy `/sign-up` route did exactly this, and for the same reason: a
 * signed-in user pressing Back onto the sign-up form has nothing to do there.
 *
 * Store-only and synchronous on purpose. Calling `bootstrapAuthentication()` here would
 * make every anonymous visit wait on a refresh round trip before the form paints, which is
 * the majority case on a public sign-up page.
 */
export function skipSignUpWhenAuthenticated(): void {
  if (useAuthStore.getState().auth.user !== null) {
    throw redirect({ replace: true, to: '/dashboard' })
  }
}
