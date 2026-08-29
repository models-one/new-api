import type { ResetPasswordSearch } from '@/features/auth/password-reset/ResetPasswordPage'

/**
 * The search schema for `/user/reset` and `/reset`.
 *
 * `controller/misc.go#SendPasswordResetEmail` mails a link of the form
 * `<server>/user/reset?email=<address>&token=<code>`, so those two parameters are the
 * entire input to the confirmation page. Anything else in the query string is dropped:
 * unlike `/register`, this URL has nothing to forward.
 *
 * Kept in its own tiny module rather than in `ResetPasswordRoute.tsx` so that
 * `src/routes.tsx` can import it statically — the page itself stays behind
 * `lazyRouteComponent`, and a static import of that file would pull the whole
 * confirmation screen into the entry bundle.
 *
 * Deliberately total: a link missing either half still resolves, and the page renders its
 * "this reset link is incomplete" state instead of the router throwing at a user who
 * clicked a mangled e-mail link.
 */
export function validateResetSearch(search: Record<string, unknown>): ResetPasswordSearch {
  return {
    email: typeof search.email === 'string' ? search.email : undefined,
    token: typeof search.token === 'string' ? search.token : undefined,
  }
}
