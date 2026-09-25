import axios, { type AxiosRequestConfig } from 'axios'
import { t } from 'i18next'
import { toast } from 'sonner'

import { applyAuthRotation, clearAuthentication, refreshAuthentication } from '@/lib/auth-session'
import { redirectToLegacySignIn } from '@/lib/navigation'
import { useAuthStore } from '@/stores/auth-store'

declare module 'axios' {
  export interface AxiosRequestConfig {
    skipBusinessError?: boolean
    skipErrorHandler?: boolean
    disableDuplicate?: boolean
    skipAuthRefresh?: boolean
    authRetry?: boolean
    acceptAuthRotation?: boolean
  }
}

export type ApiRequestConfig = AxiosRequestConfig

export const api = axios.create({
  baseURL: import.meta.env.PUBLIC_API_BASE_URL ?? '',
  withCredentials: true,
  headers: { 'Cache-Control': 'no-store' },
})

const inFlightGet = new Map<string, Promise<unknown>>()
const originalGet = api.get.bind(api)

api.get = ((url: string, config: ApiRequestConfig = {}) => {
  if (config.disableDuplicate) return originalGet(url, config)

  const params = config.params ? JSON.stringify(config.params) : '{}'
  const sid = useAuthStore.getState().auth.session?.sid ?? 'anonymous'
  const requestKey = `${sid}:${url}?${params}`
  const existingRequest = inFlightGet.get(requestKey)
  if (existingRequest) return existingRequest

  const request = originalGet(url, config).finally(() => inFlightGet.delete(requestKey))
  inFlightGet.set(requestKey, request)
  return request
}) as typeof api.get

api.interceptors.request.use((config) => {
  const accessToken = useAuthStore.getState().auth.accessToken
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

api.interceptors.response.use(
  (response) => {
    if (response.config.acceptAuthRotation && response.data?.success === true) {
      applyAuthRotation(response.data.data)
    }

    if (
      !response.config.skipBusinessError
      && typeof response.data?.success === 'boolean'
      && !response.data.success
    ) {
      toast.error(response.data.message || t('Request failed'))
    }
    return response
  },
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      toast.error(t('Request failed'))
      throw error
    }

    const config = error.config as ApiRequestConfig | undefined
    const status = error.response?.status
    if (status === 401 && config && !config.skipAuthRefresh && !config.authRetry) {
      config.authRetry = true
      const outcome = await refreshAuthentication()
      if (outcome.kind === 'authenticated') {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${outcome.bundle.access_token}`,
        }
        return api.request(config)
      }

      if (outcome.kind === 'anonymous' || outcome.kind === 'out_of_sync') {
        if (!config.skipErrorHandler) toast.error(t('Session expired!'))
        redirectToLegacySignIn()
      } else if (!config.skipErrorHandler) {
        toast.error(t('Request failed'))
      }
    } else if (status === 401 && config?.authRetry) {
      clearAuthentication(false)
      if (!config.skipErrorHandler) toast.error(t('Session expired!'))
      redirectToLegacySignIn()
    } else if (!config?.skipErrorHandler) {
      const responseData = error.response?.data as { message?: string } | undefined
      toast.error(responseData?.message || error.message || t('Request failed'))
    }

    throw error
  },
)
