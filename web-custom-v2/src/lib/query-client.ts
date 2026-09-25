import { QueryClient } from '@tanstack/react-query'
import axios from 'axios'

export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false
  }
  return failureCount < 2
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryRequest,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
    mutations: {
      retry: false,
    },
  },
})
