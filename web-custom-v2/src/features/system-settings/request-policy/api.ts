import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'

import { getJson, patchJson } from '@/lib/api/client'
import type { ApiRequestConfig } from '@/lib/http-client'
import { serializeOptionValue, type SystemOptionMap } from '@/features/system-settings/options-store'
import {
  useOptionSectionForm,
  type OptionDraft,
  type OptionDraftValue,
  type OptionSectionForm,
} from '@/features/system-settings/section-form'

/**
 * The request policy (`controller/request_policy.go`, `model/request_policy.go`): session
 * affinity, retries and channel health.
 *
 *   GET   /api/option/request_policy   every policy option, defaults filled in
 *   PATCH /api/option/request_policy   `{options}`; the WHOLE resulting policy is validated
 *                                      — affinity rules, their regexes, status-code rules,
 *                                      test settings — before anything is written, and the
 *                                      changed keys are stored in one transaction
 *
 * `PUT /api/option/` stores `channel_affinity_setting.rules` without looking at it, so a
 * typo there silently stops every rule from matching. Saving through this endpoint is what
 * makes the server refuse it instead.
 */

const silent: ApiRequestConfig = { skipBusinessError: true, skipErrorHandler: true }

export const requestPolicyKeys = { all: ['system-settings', 'request-policy'] as const }

export function requestPolicyQuery() {
  return queryOptions({
    queryFn: async (): Promise<SystemOptionMap> => (await getJson<{ options: Record<string, string> }>('/api/option/request_policy', silent)).options ?? {},
    queryKey: requestPolicyKeys.all,
  })
}

export async function saveRequestPolicy(options: Record<string, string>): Promise<void> {
  if (Object.keys(options).length === 0) return
  await patchJson('/api/option/request_policy', { options }, silent)
}

type PolicyFormOptions<TDraft extends OptionDraft> = {
  toDraft: (options: SystemOptionMap | undefined) => TDraft
  validate?: (values: TDraft) => Partial<Record<keyof TDraft & string, string>>
  serialize?: Partial<Record<keyof TDraft & string, (value: OptionDraftValue) => string | number | boolean>>
}

/**
 * A settings section over the request policy: read from `GET request_policy`, and every
 * dirty key saved together in one validated `PATCH`, so the server refuses a policy that
 * would not work rather than storing half of it.
 */
export function usePolicySectionForm<TDraft extends OptionDraft>(
  options: PolicyFormOptions<TDraft>,
): { form: OptionSectionForm<TDraft>; isPending: boolean; error: unknown } {
  const queryClient = useQueryClient()
  const policyQuery = useQuery(requestPolicyQuery())
  const saved = options.toDraft(policyQuery.data)
  const keys = Object.keys(saved) as (keyof TDraft & string)[]

  const text = (key: keyof TDraft & string, value: OptionDraftValue) => {
    const transform = options.serialize?.[key]
    return serializeOptionValue(transform === undefined ? value : transform(value))
  }

  const form = useOptionSectionForm<TDraft>({
    groupWrite: {
      keys,
      write: async (values, previous) => {
        const changed: Record<string, string> = {}
        for (const key of keys) {
          const next = text(key, values[key])
          if (next !== text(key, previous[key])) changed[key] = next
        }
        await saveRequestPolicy(changed)
        await queryClient.invalidateQueries({ queryKey: requestPolicyKeys.all })
      },
    },
    saved,
    serialize: options.serialize,
    validate: options.validate,
  })
  return { error: policyQuery.error, form, isPending: policyQuery.isPending }
}
