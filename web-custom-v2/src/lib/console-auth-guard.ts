import { AuthenticationUnavailableError, bootstrapAuthentication } from '@/lib/auth-session'
import { isPreviewMode, redirectToLegacySignIn } from '@/lib/navigation'

export async function requireConsoleAuthentication(redirectTo: string): Promise<void> {
  if (isPreviewMode()) return

  const outcome = await bootstrapAuthentication()
  if (outcome.kind === 'authenticated') return
  if (outcome.kind === 'transient_error') {
    throw new AuthenticationUnavailableError(outcome.error)
  }

  redirectToLegacySignIn(redirectTo)
  return new Promise<never>(() => undefined)
}
