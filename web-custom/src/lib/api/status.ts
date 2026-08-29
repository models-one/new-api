import { queryOptions } from '@tanstack/react-query'

import { getJson } from '@/lib/api/client'

/**
 * Server configuration from `GET /api/status`. The payload carries ~60 keys; this type
 * covers the ones the console reads. Unlisted keys stay reachable through the index signature.
 */
export type ServerStatus = {
  version: string
  start_time: number
  system_name: string
  logo: string
  footer_html: string
  server_address: string
  docs_link: string

  /** Divisor that turns quota ints into currency. Defaults to 500000 server-side. */
  quota_per_unit: number
  display_in_currency: boolean
  quota_display_type: string
  custom_currency_symbol: string
  custom_currency_exchange_rate: number
  usd_exchange_rate: number
  price: number
  stripe_unit_price: number

  email_verification: boolean
  turnstile_check: boolean
  turnstile_site_key: string
  register_enabled: boolean
  password_login_enabled: boolean
  password_register_enabled: boolean

  github_oauth: boolean
  github_client_id: string
  discord_oauth: boolean
  discord_client_id: string
  linuxdo_oauth: boolean
  linuxdo_client_id: string
  telegram_oauth: boolean
  telegram_bot_name: string
  wechat_login: boolean
  wechat_qrcode: string
  oidc_enabled: boolean
  oidc_client_id: string
  oidc_authorization_endpoint: string
  passkey_login: boolean
  passkey_rp_id: string

  setup: boolean
  demo_site_enabled: boolean
  self_use_mode_enabled: boolean
  default_use_auto_group: boolean
  enable_drawing: boolean
  enable_task: boolean
  enable_data_export: boolean
  data_export_default_time: string
  default_collapse_sidebar: boolean
  uptime_kuma_enabled: boolean
  announcements_enabled: boolean
  api_info_enabled: boolean
  faq_enabled: boolean
  user_agreement_enabled: boolean

  [key: string]: unknown
}

export const DEFAULT_QUOTA_PER_UNIT = 500_000

export function serverStatusQuery() {
  return queryOptions({
    queryKey: ['server-status'],
    queryFn: () => getJson<ServerStatus>('/api/status'),
    // Server config changes rarely; refetching it on every route is waste.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })
}
