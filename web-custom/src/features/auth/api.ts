import axios from 'axios'

import { clearAuthenticatedClientState, refreshAuthentication, type RefreshOutcome } from '@/lib/auth-session'
import { api } from '@/lib/http-client'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'

export type ApiResponse<T = unknown> = {
  success: boolean
  message?: string
  data?: T
}

type LogoutRuntime = {
  getExpectedSid: () => string | undefined
  request: (expectedSid?: string) => Promise<ApiResponse>
  refresh: () => Promise<RefreshOutcome>
}

export async function executeLogout(runtime: LogoutRuntime, allowMismatchRecovery = true): Promise<ApiResponse> {
  try {
    return await runtime.request(runtime.getExpectedSid())
  } catch (error: unknown) {
    const code = axios.isAxiosError(error) ? error.response?.data?.code : undefined
    if (
      allowMismatchRecovery
      && axios.isAxiosError(error)
      && error.response?.status === 409
      && code === 'AUTH_SESSION_MISMATCH'
    ) {
      const outcome = await runtime.refresh()
      if (outcome.kind === 'authenticated') return executeLogout(runtime, false)
      if (outcome.kind === 'anonymous') return { success: true, message: '' }
    }
    throw error
  }
}

export async function logout(): Promise<ApiResponse> {
  const result = await executeLogout({
    getExpectedSid: () => useAuthStore.getState().auth.session?.sid,
    request: async (sid) => {
      const response = await api.post('/api/user/auth/logout', undefined, {
        headers: sid ? { 'X-Auth-Session': sid } : undefined,
        skipAuthRefresh: true,
        skipErrorHandler: true,
      })
      return response.data
    },
    refresh: refreshAuthentication,
  })

  if (result.success) clearAuthenticatedClientState(queryClient)
  return result
}
