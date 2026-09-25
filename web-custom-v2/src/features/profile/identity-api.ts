import { queryOptions } from '@tanstack/react-query'

import { deleteJson, getJson, postJson, putJson } from '@/lib/api/client'

import type { ApiRequestConfig } from '@/lib/http-client'

/**
 * The identity half of the account centre: profile edits, account deletion, the system
 * access token, login-identity bindings and the daily check-in.
 *
 * Every shape below was read off the running dev server (127.0.0.1:3000, seeded SQLite)
 * and cross-checked against the Go handlers that produce it. Where the two disagreed the
 * server won; where the server could not be made to answer (SMTP is not configured here,
 * no OAuth provider is enabled) the handler is cited and the gap is stated.
 */

/** Forms that render the server's refusal inline instead of letting the interceptor toast it. */
const inlineErrors: ApiRequestConfig = { skipBusinessError: true, skipErrorHandler: true }

// ---------------------------------------------------------------------------
// Profile edits — PUT /api/user/self (controller/user.go UpdateSelf)
// ---------------------------------------------------------------------------

/**
 * `UpdateSelf` branches on the KEYS present in the body, not on a discriminator:
 *
 *   { sidebar_modules }        -> writes user setting, answers { success, message }
 *   { language }               -> writes user setting, answers { success, message }
 *   anything else              -> the profile branch below
 *
 * The profile branch reads only `display_name`, `password` and `original_password` off the
 * decoded body (`cleanUser` is rebuilt from scratch, so a `role` or `quota` smuggled in is
 * dropped). Verified live: `{"display_name":"Root User"}` answers
 * `{"success":true,"message":""}` with NO `data`.
 *
 * Sent on its own so the request can never collide with the setting branches, which the
 * preferences half of this page owns.
 */
export function updateDisplayName(displayName: string): Promise<null> {
  return putJson<null>('/api/user/self', { display_name: displayName }, inlineErrors)
}

/**
 * What `UpdateSelf` returns when it actually changed the password.
 *
 * Changing the password advances the user's auth version, which invalidates every token
 * minted before it — including the one this request was sent with. The handler therefore
 * calls `service.AdvanceCurrentSessionToUserVersion` and answers with a REPLACEMENT bundle:
 *
 *   { access_token, token_type, access_expires_at, session }
 *
 * with no `user` (the caller already has it). Verified live against a throwaway account.
 * `authRotationSchema` in features/auth/types.ts is exactly this shape.
 *
 * A client that ignores it keeps sending the dead token and is bounced to sign-in on the
 * next request, which is why `changePassword` sets `acceptAuthRotation`.
 */
export type PasswordRotation = {
  access_token: string
  token_type: string
  access_expires_at: number
  session: { sid: string; current: boolean }
}

/** `model.User` validation tag (`Password` min=8,max=20); mirrored so the form refuses first. */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 20

export type ChangePasswordInput = {
  /** Required: `checkUpdatePassword` compares it against the stored hash. */
  originalPassword: string
  newPassword: string
}

/**
 * `acceptAuthRotation` makes the shared response interceptor hand the returned bundle to
 * `applyAuthRotation`, which swaps the in-memory access token for the new one. Without it
 * the change succeeds server-side and the session dies on the very next request.
 *
 * Server refusals observed live:
 *   wrong `original_password` -> "Original password is incorrect"
 *   password shorter than 8   -> "Invalid input"
 *   account with no password  -> the i18n "password unset" message
 */
export function changePassword(input: ChangePasswordInput): Promise<PasswordRotation> {
  return putJson<PasswordRotation>(
    '/api/user/self',
    { original_password: input.originalPassword, password: input.newPassword },
    { ...inlineErrors, acceptAuthRotation: true },
  )
}

/**
 * `DELETE /api/user/self` (controller/user.go DeleteSelf).
 *
 * Takes NO body — the handler reads the user id off the session and ignores the request
 * body entirely, so there is no password re-entry to send. It refuses for the root account:
 * verified live, `{"success":false,"message":"Cannot delete super administrator account"}`.
 */
export function deleteSelfAccount(): Promise<null> {
  return deleteJson<null>('/api/user/self', inlineErrors)
}

/** `common.RoleRootUser`; `DeleteSelf` refuses this role outright. */
export const ROLE_ROOT = 100
export const ROLE_ADMIN = 10
export const ROLE_USER = 1

// ---------------------------------------------------------------------------
// System access token — GET /api/user/token (controller/user.go GenerateAccessToken)
// ---------------------------------------------------------------------------

/**
 * Mints a NEW access token and stores it on the user, replacing whatever was there. The
 * previous token stops working the moment this resolves — the handler overwrites
 * `user.AccessToken` unconditionally, there is no "read the current one" route.
 *
 * `data` is the token as a bare string. Verified live twice in a row: two calls returned
 * two different keys, and `GET /api/user/self` never echoes the value back, so the string
 * this promise resolves with is the only chance the user has to copy it.
 *
 * `disableDuplicate` switches off the client's in-flight GET de-duplication: two clicks
 * must mint two tokens rather than silently share one promise.
 */
export function generateAccessToken(): Promise<string> {
  return getJson<string>('/api/user/token', { ...inlineErrors, disableDuplicate: true })
}

// ---------------------------------------------------------------------------
// Login identity bindings
// ---------------------------------------------------------------------------

/**
 * `POST /api/oauth/email/bind` (controller/user.go EmailBind).
 *
 * Body is `{ email, code }`; the code is the 6-character value `GET /api/verification`
 * mailed out. Verified live with a deliberately wrong code:
 * `{"success":false,"message":"Verification code is incorrect or has expired"}`.
 * An address already on another account answers the "e-mail already taken" message.
 */
export function bindEmail(email: string, code: string): Promise<null> {
  return postJson<null>('/api/oauth/email/bind', { email, code }, inlineErrors)
}

/**
 * `POST /api/oauth/wechat/bind` (controller/user.go WeChatBind) — the verification code the
 * official account replies with, not an OAuth code. WeChat login is disabled on the dev
 * server, so only the request shape is verified here, from the handler.
 */
export function bindWeChat(code: string): Promise<null> {
  return postJson<null>('/api/oauth/wechat/bind', { code }, inlineErrors)
}

/**
 * `POST /api/oauth/telegram/bind/start` (controller.TelegramBindStart). Telegram does not
 * use the shared OAuth callback: the backend mints a flow token and a callback URL, the
 * Telegram widget redirects the popup straight to that URL, and the backend performs the
 * bind itself before redirecting to `/oauth/telegram?telegram_bind=…&flow_token=…`.
 *
 * Telegram is disabled on the dev server; shape taken from the handler.
 */
export type TelegramBindFlow = {
  flow_token: string
  callback_url: string
  expires_at: number
}

export function startTelegramBind(): Promise<TelegramBindFlow> {
  return postJson<TelegramBindFlow>('/api/oauth/telegram/bind/start', undefined, inlineErrors)
}

/**
 * `GET /api/user/oauth/bindings` (controller/custom_oauth.go GetUserOAuthBindings).
 *
 * Covers ONLY administrator-defined custom providers. The built-in providers keep their id
 * on the user row instead (`github_id`, `discord_id`, …) and are not listed here.
 *
 * Verified live: an account with no custom binding answers `{"data":[],...}` — an empty
 * array, never null.
 *
 * NOTE: `provider_id` is a JSON NUMBER (`UserOAuthBindingResponse.ProviderId int`). The
 * legacy console compared it against `String(provider.id)`, which never matched, so its
 * custom rows always rendered as unbound. Matching is numeric here.
 */
export type CustomOAuthBinding = {
  provider_id: number
  provider_name: string
  provider_slug: string
  provider_icon: string
  provider_user_id: string
}

export function customOAuthBindingsQuery() {
  return queryOptions({
    queryKey: ['user', 'oauth-bindings'],
    queryFn: () => getJson<CustomOAuthBinding[]>('/api/user/oauth/bindings'),
    staleTime: 30 * 1000,
  })
}

/**
 * `DELETE /api/user/oauth/bindings/:provider_id`. Custom providers only — there is no
 * self-service unbind route for GitHub, Discord, OIDC, Telegram, LinuxDO, WeChat or e-mail
 * anywhere in `router/api-router.go`; the only clear-binding route is
 * `DELETE /api/user/:id/bindings/:binding_type`, which sits behind `AdminAuth`.
 *
 * Verified live: the handler is idempotent — unbinding a provider id that was never bound
 * still answers `{"success":true,"message":"解绑成功"}`.
 */
export function unbindCustomOAuth(providerId: number): Promise<null> {
  return deleteJson<null>(
    `/api/user/oauth/bindings/${encodeURIComponent(String(providerId))}`,
    inlineErrors,
  )
}

// ---------------------------------------------------------------------------
// Daily check-in — GET/POST /api/user/checkin (controller/checkin.go)
// ---------------------------------------------------------------------------

export type CheckinRecord = {
  /** `YYYY-MM-DD`. */
  checkin_date: string
  /** Quota units awarded that day. */
  quota_awarded: number
}

export type CheckinStatus = {
  enabled: boolean
  /** Reward bounds in quota units, straight from `checkin_setting`. */
  min_quota: number
  max_quota: number
  stats: {
    checked_in_today: boolean
    /** Check-ins inside the requested month. */
    checkin_count: number
    /** All-time counters, not month-scoped. */
    total_checkins: number
    total_quota: number
    records: CheckinRecord[]
  }
}

export type CheckinResult = {
  checkin_date: string
  quota_awarded: number
}

/** `month` is `YYYY-MM`; the handler defaults to the current month when it is absent. */
export function checkinMonthKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}`
}

/**
 * Verified live by temporarily enabling `checkin_setting.enabled` (and restoring it):
 *
 *   disabled -> `{"success":false,"message":"签到功能未启用"}` with NO `data`
 *   enabled  -> `{ enabled, min_quota, max_quota, stats:{ checked_in_today, checkin_count,
 *                 total_checkins, total_quota, records:[{checkin_date,quota_awarded}] } }`
 *
 * The disabled answer is why callers must gate this query on `/api/status`'s
 * `checkin_enabled` rather than probing.
 */
export function checkinStatusQuery(month: string) {
  return queryOptions({
    queryKey: ['user', 'checkin', month],
    queryFn: () => getJson<CheckinStatus>('/api/user/checkin', {
      ...inlineErrors,
      params: { month },
    }),
    staleTime: 30 * 1000,
  })
}

/**
 * Claims today's reward. Verified live: the first call answered
 * `{"quota_awarded":3227,"checkin_date":"2026-08-29"}` and the second
 * `{"success":false,"message":"今日已签到"}`.
 *
 * `middleware.TurnstileCheck()` guards the route and reads the token from the QUERY
 * string, never the body — and only when the operator turned Turnstile on.
 */
export function performCheckin(turnstileToken: string): Promise<CheckinResult> {
  return postJson<CheckinResult>('/api/user/checkin', undefined, {
    ...inlineErrors,
    params: turnstileToken === '' ? undefined : { turnstile: turnstileToken },
  })
}
