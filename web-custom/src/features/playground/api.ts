import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api'

/**
 * `GET /api/user/models?group=<group>` — the models the signed-in user may call in that
 * billing group. Verified on the dev server:
 *
 *   {"data":["gpt-4o-mini","gpt-image-1","mj_imagine","suno_music"],"message":"","success":true}
 *
 * A plain `string[]` inside the standard envelope, so `getJson` unwraps it directly.
 *
 * THE LIST IS NOT FILTERED TO CHAT MODELS, and this console does not filter it either.
 * `mj_imagine` and `suno_music` are Midjourney and Suno task models that
 * `/pg/chat/completions` cannot serve, but nothing in the API distinguishes them:
 * `/api/pricing` reports `supported_endpoint_types: ["openai"]` for BOTH of them, the
 * same value it reports for `gpt-4o-mini`. Filtering on that field would drop nothing,
 * and filtering on `quota_type` would be reading a billing mode as a capability.
 *
 * So every model the server offers is offered here, and a model that cannot chat fails
 * at the relay with a legible error rather than being hidden on a guess.
 *
 * Keyed on the group because switching group genuinely changes the answer — the server
 * filters by what that group's channels serve.
 */
export function playgroundModelsQuery(group: string) {
  return queryOptions({
    enabled: group !== '',
    queryFn: () => getJson<string[]>('/api/user/models', { params: { group } }),
    queryKey: ['playground', 'models', group],
    staleTime: 5 * 60 * 1000,
  })
}
