/**
 * The `/sign-in` route.
 *
 * `SignInPage` is loaded lazily by `src/routes.tsx`; the route guard and the 2FA
 * hand-off are exported eagerly because the router needs them before the page renders.
 */

export { SignInForm } from '@/features/auth/sign-in/SignInForm'
export { SignInPage } from '@/features/auth/sign-in/SignInPage'

export {
  passwordLogin,
  readLoginOutcome,
  validateSignInCredentials,
  type LoginOutcome,
  type PasswordLoginInput,
  type SignInCredentials,
  type SignInFieldError,
  type SignInFieldErrors,
} from '@/features/auth/sign-in/api'

export {
  signInSearchSchema,
  signedInRedirectTarget,
  skipSignInWhenAuthenticated,
  type SignInSearch,
} from '@/features/auth/sign-in/route-guard'

export {
  usePasskeyLogin,
  type UsePasskeyLoginOptions,
  type UsePasskeyLoginResult,
} from '@/features/auth/sign-in/use-passkey-login'

export {
  useSignInCompletion,
  type SignInCompletion,
} from '@/features/auth/sign-in/use-sign-in-completion'
