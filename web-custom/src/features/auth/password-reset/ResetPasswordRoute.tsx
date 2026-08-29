import { useSearch } from '@tanstack/react-router'

import { ResetPasswordPage, type ResetPasswordSearch } from '@/features/auth/password-reset/ResetPasswordPage'

/**
 * Narrows the router's search object without reaching back into `src/routes.tsx` for the
 * route handle — importing it here would close a module cycle, since that file imports
 * this component.
 */
export function readResetPasswordSearch(search: unknown): ResetPasswordSearch {
  if (typeof search !== 'object' || search === null) return {}
  const record = search as Record<string, unknown>
  return {
    email: typeof record.email === 'string' ? record.email : undefined,
    token: typeof record.token === 'string' ? record.token : undefined,
  }
}

/**
 * The component behind BOTH `/user/reset` (the path the backend puts in the reset e-mail,
 * see `controller/misc.go#SendPasswordResetEmail`) and `/reset` (kept from the legacy
 * console so older links still resolve).
 */
export function ResetPasswordRoute() {
  const search = useSearch({ strict: false })
  const { email, token } = readResetPasswordSearch(search)

  return <ResetPasswordPage email={email} token={token} />
}
