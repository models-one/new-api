import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'

/** `GET /api/user/self` (controller/user.go GetSelf). */
export type SelfUser = {
  id: number
  username: string
  display_name: string
  role: number
  status: number
  email: string
  group: string
  /** Remaining prepaid balance, in quota units. */
  quota: number
  /** Lifetime consumption, in quota units. */
  used_quota: number
  request_count: number
  aff_code: string
  aff_count: number
  aff_quota: number
  aff_history_quota: number
  inviter_id: number
  github_id: string
  discord_id: string
  oidc_id: string
  wechat_id: string
  telegram_id: string
  linux_do_id: string
  setting: string
  stripe_customer: string
  sidebar_modules: string
  permissions: {
    sidebar_settings: boolean
    sidebar_modules: Record<string, unknown> | false
    admin_permissions: Record<string, Record<string, boolean>>
  }
}

/** `GET /api/user/self/groups` — group name to its description and billing ratio. */
export type UserGroupMap = Record<string, { desc: string; ratio: number }>

export function selfUserQuery() {
  return queryOptions({
    queryKey: ['user', 'self'],
    queryFn: () => getJson<SelfUser>('/api/user/self'),
    staleTime: 30 * 1000,
  })
}

export function userGroupsQuery() {
  return queryOptions({
    queryKey: ['user', 'groups'],
    queryFn: () => getJson<UserGroupMap>('/api/user/self/groups'),
    staleTime: 5 * 60 * 1000,
  })
}

export function affCodeQuery() {
  return queryOptions({
    queryKey: ['user', 'aff-code'],
    queryFn: () => getJson<string>('/api/user/aff'),
    staleTime: 10 * 60 * 1000,
  })
}
