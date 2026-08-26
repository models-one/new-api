export function isPreviewMode(): boolean {
  return import.meta.env.DEV && import.meta.env.PUBLIC_PREVIEW_MODE !== 'false'
}

export function getLegacySignInHref(redirectTo?: string): string {
  const fallbackOrigin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const configuredOrigin = import.meta.env.PUBLIC_LEGACY_WEB_ORIGIN?.replace(/\/$/, '')
  const signInUrl = new URL('/sign-in', configuredOrigin || fallbackOrigin)
  if (redirectTo) signInUrl.searchParams.set('redirect', redirectTo)
  return signInUrl.toString()
}

export function redirectToLegacySignIn(redirectTo?: string): void {
  if (typeof window === 'undefined') return
  window.location.replace(getLegacySignInHref(redirectTo ?? window.location.href))
}
