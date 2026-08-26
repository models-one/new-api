import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { Toaster } from 'sonner'

import { clearAuthenticatedClientState, clearAuthentication } from '@/lib/auth-session'
import { subscribeAuthSessionEvents } from '@/lib/auth-session-sync'
import { redirectToLegacySignIn } from '@/lib/navigation'
import { queryClient } from '@/lib/query-client'
import { router } from '@/routes'
import { useAuthStore } from '@/stores/auth-store'

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
      {props.children}
      <Toaster closeButton duration={5000} position="top-center" richColors theme="dark" />
    </QueryClientProvider>
  )
}
