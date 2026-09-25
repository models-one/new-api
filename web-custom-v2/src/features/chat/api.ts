import { queryOptions } from '@tanstack/react-query'

import { normalizeApiKey } from '@/features/chat/chat-presets'
import { getJson } from '@/lib/api/client'
import { revealTokenKey, TOKEN_STATUS, type ApiToken } from '@/lib/api/tokens'
import type { PageInfo } from '@/lib/api/types'

/**
 * How many keys the picker looks at, ported from the legacy loader
 * (`web/src/features/chat/hooks/use-active-chat-key.ts`), which asked `GET /api/token/`
 * for 50 rows and took the first ENABLED one in the order the server returned them —
 * newest id first, verified on the dev server. Reproduced rather than "improved" so a
 * preset keeps opening with the same key it opened with before the rebuild.
 */
export const CHAT_KEY_SCAN_SIZE = 50

export type ActiveChatKey = {
  id: number
  name: string
  /** The full secret, `sk-` prefixed. Only ever rendered through `MaskedValue`. */
  secret: string
}

/**
 * `null` — not a thrown error — is the answer when the account has keys but none enabled,
 * or no keys at all. That is an ordinary state of a new account, and the pages render an
 * explanation with a route to the key manager instead of an error banner. The legacy hook
 * threw here, which made "you have not made a key yet" look like a failure.
 *
 * The list endpoint only ever returns `key` masked as `abcd**********wxyz`, so the full
 * secret needs the second, per-id round trip to `POST /api/token/{id}/key`.
 */
export function activeChatKeyQuery() {
  return queryOptions({
    queryKey: ['chat', 'active-key', CHAT_KEY_SCAN_SIZE],
    queryFn: async (): Promise<ActiveChatKey | null> => {
      const page = await getJson<PageInfo<ApiToken>>('/api/token/', {
        params: { p: 1, page_size: CHAT_KEY_SCAN_SIZE },
      })
      const enabled = page.items.find((token) => token.status === TOKEN_STATUS.enabled)
      if (enabled === undefined) return null

      const secret = await revealTokenKey(enabled.id)
      return { id: enabled.id, name: enabled.name, secret: normalizeApiKey(secret) }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
