import { useQuery } from '@tanstack/react-query'

import { DEFAULT_QUOTA_PER_UNIT, serverStatusQuery, type ServerStatus } from '@/lib/api/status'

export function useServerStatus() {
  return useQuery(serverStatusQuery())
}

/** The quota divisor, falling back to the server default while status is still loading. */
export function useQuotaPerUnit(): number {
  const { data } = useServerStatus()
  const perUnit = data?.quota_per_unit
  return typeof perUnit === 'number' && perUnit > 0 ? perUnit : DEFAULT_QUOTA_PER_UNIT
}

export function useServerConfig<T>(select: (status: ServerStatus) => T, fallback: T): T {
  const { data } = useServerStatus()
  return data ? select(data) : fallback
}
