import { z } from 'zod'

/**
 * The user's `setting` column, which `GET /api/user/self` returns as a JSON STRING.
 *
 * Every field below exists in `relaykit/dto/user_settings.go`. That struct is
 * closed: `PUT /api/user/setting` binds into `controller.UpdateUserSettingRequest`
 * and rebuilds a `dto.UserSetting` field by field, so a key this file invented
 * would be accepted by the request and then silently dropped on the way to the
 * database. Nothing here is speculative.
 *
 * Fields present in the struct but NOT edited by this surface, and why:
 *   sidebar_modules     — owned by the navigation surface, written through
 *                         `PUT /api/user/self`.
 *   billing_preference  — owned by the subscription surface, written through
 *                         its own endpoint.
 * Both are read here anyway, because of the overwrite described in `api.ts`.
 */

/** `dto.NotifyType*`; `controller.UpdateUserSetting` rejects anything else outright. */
export const NOTIFY_TYPES = ['email', 'webhook', 'bark', 'gotify'] as const

export type NotifyType = (typeof NOTIFY_TYPES)[number]

/** `controller.UpdateUserSetting` clamps out-of-range priorities to this value. */
export const DEFAULT_GOTIFY_PRIORITY = 5

/** Gotify's own scale, enforced server-side before the clamp. */
export const GOTIFY_PRIORITY_MIN = 0
export const GOTIFY_PRIORITY_MAX = 10

/**
 * 500000 quota units. With the stock `quota_per_unit` of 500000 that is $1, but
 * the field is stored in quota units and the panel converts it for display using
 * the live `quota_per_unit` rather than assuming the stock value.
 */
export const DEFAULT_QUOTA_WARNING_THRESHOLD = 500_000

const userSettingSchema = z.object({
  notify_type: z.enum(NOTIFY_TYPES).optional(),
  quota_warning_threshold: z.number().optional(),
  webhook_url: z.string().optional(),
  webhook_secret: z.string().optional(),
  notification_email: z.string().optional(),
  bark_url: z.string().optional(),
  gotify_url: z.string().optional(),
  gotify_token: z.string().optional(),
  gotify_priority: z.number().optional(),
  upstream_model_update_notify_enabled: z.boolean().optional(),
  accept_unset_model_ratio_model: z.boolean().optional(),
  record_ip_log: z.boolean().optional(),
  sidebar_modules: z.string().optional(),
  language: z.string().optional(),
  billing_preference: z.string().optional(),
})

export type UserSetting = z.infer<typeof userSettingSchema>

/**
 * A brand-new account has `setting: ""`. Malformed JSON is treated the same as
 * absent: an empty settings object, so the form renders its defaults instead of
 * blocking on a value nobody can fix from the UI.
 */
export function parseUserSetting(raw: string | null | undefined): UserSetting {
  if (!raw || raw.trim() === '') return {}
  try {
    const parsed = userSettingSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

/** The editable half of the settings, with every field resolved to a concrete value. */
export type NotificationPreferences = {
  notifyType: NotifyType
  quotaWarningThreshold: number
  notificationEmail: string
  webhookUrl: string
  webhookSecret: string
  barkUrl: string
  gotifyUrl: string
  gotifyToken: string
  gotifyPriority: number
  acceptUnpricedModels: boolean
  recordIpLog: boolean
  upstreamModelUpdateNotify: boolean
}

export function readNotificationPreferences(setting: UserSetting): NotificationPreferences {
  const threshold = setting.quota_warning_threshold
  const priority = setting.gotify_priority

  return {
    notifyType: setting.notify_type ?? 'email',
    quotaWarningThreshold: typeof threshold === 'number' && threshold > 0
      ? threshold
      : DEFAULT_QUOTA_WARNING_THRESHOLD,
    notificationEmail: setting.notification_email ?? '',
    webhookUrl: setting.webhook_url ?? '',
    webhookSecret: setting.webhook_secret ?? '',
    barkUrl: setting.bark_url ?? '',
    gotifyUrl: setting.gotify_url ?? '',
    gotifyToken: setting.gotify_token ?? '',
    // 0 is a legitimate Gotify priority, so `?? default` is wrong here: the
    // server writes `gotify_priority: 0` for every user who never set one.
    gotifyPriority: typeof priority === 'number' && priority >= GOTIFY_PRIORITY_MIN
      ? priority
      : DEFAULT_GOTIFY_PRIORITY,
    acceptUnpricedModels: setting.accept_unset_model_ratio_model ?? false,
    recordIpLog: setting.record_ip_log ?? false,
    upstreamModelUpdateNotify: setting.upstream_model_update_notify_enabled ?? false,
  }
}

export type PreferenceValidationErrors = Partial<
  Record<'quotaWarningThreshold' | 'notificationEmail' | 'webhookUrl' | 'barkUrl' | 'gotifyUrl' | 'gotifyToken', string>
>

type ValidationMessages = {
  thresholdPositive: string
  emailInvalid: string
  urlRequired: string
  urlInvalid: string
  tokenRequired: string
}

function isHttpUrl(value: string): boolean {
  if (!value.startsWith('http://') && !value.startsWith('https://')) return false
  try {
    // Mirrors Go's url.ParseRequestURI: an absolute URL is required.
    return new URL(value).host !== ''
  } catch {
    return false
  }
}

/**
 * The client-side mirror of `controller.UpdateUserSetting`'s validation, so a
 * user is told which field is wrong instead of getting one server message with
 * no field attached.
 *
 * The rules are conditional on the notification method, exactly as the server's
 * are: a blank webhook URL is only an error while the method is `webhook`.
 * `notification_email` is the one optional field — the server falls back to the
 * account e-mail when it is empty — so it is validated only when filled in.
 */
export function validateNotificationPreferences(
  preferences: NotificationPreferences,
  messages: ValidationMessages,
): PreferenceValidationErrors {
  const errors: PreferenceValidationErrors = {}

  if (!(preferences.quotaWarningThreshold > 0)) {
    errors.quotaWarningThreshold = messages.thresholdPositive
  }

  if (preferences.notifyType === 'email' && preferences.notificationEmail !== '') {
    if (!preferences.notificationEmail.includes('@')) errors.notificationEmail = messages.emailInvalid
  }

  if (preferences.notifyType === 'webhook') {
    if (preferences.webhookUrl === '') errors.webhookUrl = messages.urlRequired
    else if (!isHttpUrl(preferences.webhookUrl)) errors.webhookUrl = messages.urlInvalid
  }

  if (preferences.notifyType === 'bark') {
    if (preferences.barkUrl === '') errors.barkUrl = messages.urlRequired
    else if (!isHttpUrl(preferences.barkUrl)) errors.barkUrl = messages.urlInvalid
  }

  if (preferences.notifyType === 'gotify') {
    if (preferences.gotifyUrl === '') errors.gotifyUrl = messages.urlRequired
    else if (!isHttpUrl(preferences.gotifyUrl)) errors.gotifyUrl = messages.urlInvalid
    if (preferences.gotifyToken === '') errors.gotifyToken = messages.tokenRequired
  }

  return errors
}

/**
 * Builds the request body.
 *
 * Only the fields that belong to the chosen method are sent. The server ignores
 * the rest anyway — it copies `webhook_url` into the stored settings only while
 * `notify_type == webhook` — and sending them would suggest they are being kept.
 *
 * `upstream_model_update_notify_enabled` is a `*bool` server-side and is applied
 * only for `role >= RoleAdminUser`; omitting it for everyone else leaves the
 * stored value untouched instead of writing a value the server would discard.
 */
export function buildUserSettingPayload(
  preferences: NotificationPreferences,
  options: { isAdmin: boolean },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    notify_type: preferences.notifyType,
    quota_warning_threshold: preferences.quotaWarningThreshold,
    accept_unset_model_ratio_model: preferences.acceptUnpricedModels,
    record_ip_log: preferences.recordIpLog,
  }

  if (options.isAdmin) {
    payload.upstream_model_update_notify_enabled = preferences.upstreamModelUpdateNotify
  }

  if (preferences.notifyType === 'email' && preferences.notificationEmail !== '') {
    payload.notification_email = preferences.notificationEmail
  }

  if (preferences.notifyType === 'webhook') {
    payload.webhook_url = preferences.webhookUrl
    if (preferences.webhookSecret !== '') payload.webhook_secret = preferences.webhookSecret
  }

  if (preferences.notifyType === 'bark') payload.bark_url = preferences.barkUrl

  if (preferences.notifyType === 'gotify') {
    payload.gotify_url = preferences.gotifyUrl
    payload.gotify_token = preferences.gotifyToken
    payload.gotify_priority = preferences.gotifyPriority
  }

  return payload
}
