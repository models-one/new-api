import { create } from 'zustand'

import type { AuthBundle, AuthUser, LoginSession } from '@/features/auth/types'

export type AuthBootstrapState = 'idle' | 'checking' | 'complete'

type AuthState = {
  auth: {
    user: AuthUser | null
    accessToken: string | null
    accessExpiresAt: number | null
    session: LoginSession | null
    bootstrapState: AuthBootstrapState
    setBundle: (bundle: AuthBundle) => void
    setBootstrapState: (state: AuthBootstrapState) => void
    reset: (state?: AuthBootstrapState) => void
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  auth: {
    user: null,
    accessToken: null,
    accessExpiresAt: null,
    session: null,
    bootstrapState: 'idle',
    setBundle: (bundle) => set((state) => ({
      ...state,
      auth: {
        ...state.auth,
        user: bundle.user,
        accessToken: bundle.access_token,
        accessExpiresAt: bundle.access_expires_at,
        session: bundle.session,
        bootstrapState: 'complete',
      },
    })),
    setBootstrapState: (bootstrapState) => set((state) => ({
      ...state,
      auth: { ...state.auth, bootstrapState },
    })),
    reset: (bootstrapState = 'complete') => set((state) => ({
      ...state,
      auth: {
        ...state.auth,
        user: null,
        accessToken: null,
        accessExpiresAt: null,
        session: null,
        bootstrapState,
      },
    })),
  },
}))
