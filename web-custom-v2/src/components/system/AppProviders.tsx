import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { Toaster } from 'sonner'

import { serverStatusQuery } from '@/lib/api/status'

import { clearAuthenticatedClientState, clearAuthentication } from '@/lib/auth-session'
import { subscribeAuthSessionEvents } from '@/lib/auth-session-sync'
import { redirectToLegacySignIn } from '@/lib/navigation'
import { queryClient } from '@/lib/query-client'
import { router } from '@/routes'
import { useAuthStore } from '@/stores/auth-store'

/**
 * The browser tab — and with it every bookmark, history entry and pinned tab — carries
 * the deployment's own name and mark. `index.html` can only ship static ones, so it
 * carries a neutral title and the legacy `/logo.png`, and these are swapped for the
 * operator's once `/api/status` answers.
 */
function DocumentBranding() {
  const { data } = useQuery(serverStatusQuery())
  const systemName = data?.system_name?.trim() ?? ''
  const logo = data?.logo?.trim() ?? ''

  useEffect(() => {
    if (systemName === '') return
    document.title = systemName
  }, [systemName])

  useEffect(() => {
    if (logo === '') return
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link === null) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.append(link)
    }
    link.href = logo
    // The type hint in the markup is for the PNG fallback; an operator's logo can be any
    // format the browser reads, so let it sniff rather than claiming the wrong one.
    link.removeAttribute('type')
  }, [logo])

  return null
}

function AuthSessionCoordinator() {
  const activeQueryClient = useQueryClient()

  useEffect(() => useAuthStore.subscribe((state, previousState) => {
    if (state.auth.session?.sid !== previousState.auth.session?.sid) {
      activeQueryClient.clear()
    }
  }), [activeQueryClient])

  useEffect(() => subscribeAuthSessionEvents((event) => {
    const currentSid = useAuthStore.getState().auth.session?.sid
    if (event.kind === 'authenticated') {
      if (event.sid === currentSid) return
      clearAuthentication(false, 'idle')
      void router.invalidate()
      return
    }

    if (currentSid && event.sid === currentSid) {
      clearAuthenticatedClientState(activeQueryClient, false)
      redirectToLegacySignIn()
    }
  }), [activeQueryClient])

  return null
}

export function AppProviders(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionCoordinator />
      <DocumentBranding />
      {props.children}
      <Toaster closeButton duration={5000} position="top-center" richColors theme="dark" />
    </QueryClientProvider>
  )
}
