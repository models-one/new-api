import { useMemo } from 'react'

import { parseChatPresets, type ChatPreset } from '@/features/chat/chat-presets'
import { useServerStatus } from '@/hooks/use-server-status'
import type { ServerStatus } from '@/lib/api/status'

export type ChatPresetCatalogue = {
  presets: ChatPreset[]
  /** Substituted for `{address}`. Operator-set, with the current origin as the fallback. */
  serverAddress: string
  isPending: boolean
  isError: boolean
  error: unknown
  isFetching: boolean
  retry: () => void
}

function resolveServerAddress(status: ServerStatus | undefined): string {
  const configured = status?.server_address
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

/**
 * Reads the operator's chat presets off `GET /api/status`.
 *
 * The legacy hook fell back to a copy of the status blob cached in `localStorage` when the
 * request had not landed. This one does not: a preset template gets the user's API key
 * interpolated into it, and browser storage is not operator configuration — anything that
 * can write to it (a stale entry from another account on a shared machine, script injected
 * elsewhere in the app) could choose where the key is sent. Presets come from the live
 * response or the page shows its loading state.
 */
export function useChatPresets(): ChatPresetCatalogue {
  const status = useServerStatus()
  const data = status.data

  const presets = useMemo(() => parseChatPresets(data?.chats), [data])
  const serverAddress = useMemo(() => resolveServerAddress(data), [data])

  return {
    error: status.error,
    isError: status.isError,
    isFetching: status.isFetching,
    isPending: status.isPending,
    presets,
    retry: () => void status.refetch(),
    serverAddress,
  }
}
