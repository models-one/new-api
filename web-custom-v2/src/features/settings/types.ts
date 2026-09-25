import type { ApiToken } from '@/lib/api/tokens'

/**
 * `GET /api/token/` accepts only `p` and `page_size` — there is no status parameter —
 * so this filter is always applied client-side over the page that was fetched.
 */
export type StatusFilter = 'all' | 'enabled' | 'disabled'

/**
 * One hop of a key's routing order.
 *
 * A "group" in new-api is an operator-defined billing label: a name, a description and a
 * ratio (`GET /api/user/self/groups`). The schema stores no vendor, provider or model
 * ownership for a group, so nothing of that kind can be shown here.
 */
export type GroupRoute = {
  name: string
  /** Operator description; empty when the group is not among the caller's groups. */
  desc: string
  /** Billing ratio; null when the group is not among the caller's groups. */
  ratio: number | null
}

export type ApiKeyDraft = {
  name: string
  /** Group names in priority order. One name is stored directly; several become `auto`. */
  groupNames: string[]
  /** `model.Token.CrossGroupRetry` — the backend honours it only in `auto` mode. */
  crossGroupRetry: boolean
  unlimitedQuota: boolean
  /** Remaining quota in quota units; ignored by the backend when `unlimitedQuota` is set. */
  remainQuota: number
  /** Unix seconds, or -1 for a key that never expires. */
  expiredTime: number
}

export type ApiKeyEditorTarget = { mode: 'create' } | { mode: 'edit'; token: ApiToken }
