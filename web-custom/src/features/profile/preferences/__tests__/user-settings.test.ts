import { describe, expect, it } from 'vitest'

import {
  toInterfaceLanguage,
  toStoredLanguage,
} from '@/features/profile/preferences/languages'
import {
  DEFAULT_GOTIFY_PRIORITY,
  DEFAULT_QUOTA_WARNING_THRESHOLD,
  buildUserSettingPayload,
  parseUserSetting,
  readNotificationPreferences,
  validateNotificationPreferences,
  type NotificationPreferences,
} from '@/features/profile/preferences/user-settings'

const messages = {
  emailInvalid: 'email-invalid',
  thresholdPositive: 'threshold-positive',
  tokenRequired: 'token-required',
  urlInvalid: 'url-invalid',
  urlRequired: 'url-required',
}

function preferences(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    acceptUnpricedModels: false,
    barkUrl: '',
    gotifyPriority: 5,
    gotifyToken: '',
    gotifyUrl: '',
    notificationEmail: '',
    notifyType: 'email',
    quotaWarningThreshold: 500000,
    recordIpLog: false,
    upstreamModelUpdateNotify: false,
    webhookSecret: '',
    webhookUrl: '',
    ...overrides,
  }
}

describe('parseUserSetting', () => {
  it('reads the payload the dev server actually stores', () => {
    // Captured from `GET /api/user/self` after one save on the seeded server.
    const raw = '{"notify_type":"email","quota_warning_threshold":500000,"notification_email":"a@b.com","gotify_priority":0,"upstream_model_update_notify_enabled":true,"accept_unset_model_ratio_model":true}'
    expect(parseUserSetting(raw)).toEqual({
      notify_type: 'email',
      quota_warning_threshold: 500000,
      notification_email: 'a@b.com',
      gotify_priority: 0,
      upstream_model_update_notify_enabled: true,
      accept_unset_model_ratio_model: true,
    })
  })

  it('treats a new account\'s empty column, and unparseable JSON, as no settings', () => {
    expect(parseUserSetting('')).toEqual({})
    expect(parseUserSetting(undefined)).toEqual({})
    expect(parseUserSetting('not json at all')).toEqual({})
  })

  it('keeps the fields other surfaces own, because saving must not lose them', () => {
    const raw = '{"language":"zh-CN","sidebar_modules":"{\\"chat\\":true}","billing_preference":"wallet"}'
    const parsed = parseUserSetting(raw)
    expect(parsed.language).toBe('zh-CN')
    expect(parsed.sidebar_modules).toBe('{"chat":true}')
    expect(parsed.billing_preference).toBe('wallet')
  })
})

describe('readNotificationPreferences', () => {
  it('falls back to the documented defaults for an empty settings object', () => {
    const result = readNotificationPreferences({})
    expect(result.notifyType).toBe('email')
    expect(result.quotaWarningThreshold).toBe(DEFAULT_QUOTA_WARNING_THRESHOLD)
    expect(result.gotifyPriority).toBe(DEFAULT_GOTIFY_PRIORITY)
  })

  it('keeps a stored Gotify priority of 0, which is a real priority and not "unset"', () => {
    expect(readNotificationPreferences({ gotify_priority: 0 }).gotifyPriority).toBe(0)
  })

  it('replaces a non-positive threshold, which the server would reject', () => {
    expect(readNotificationPreferences({ quota_warning_threshold: 0 }).quotaWarningThreshold)
      .toBe(DEFAULT_QUOTA_WARNING_THRESHOLD)
  })
})

describe('validateNotificationPreferences', () => {
  it('accepts the defaults', () => {
    expect(validateNotificationPreferences(preferences(), messages)).toEqual({})
  })

  it('rejects a threshold of zero or below, mirroring the server check', () => {
    expect(validateNotificationPreferences(preferences({ quotaWarningThreshold: 0 }), messages))
      .toEqual({ quotaWarningThreshold: 'threshold-positive' })
  })

  it('treats an empty notification email as "use the account address"', () => {
    expect(validateNotificationPreferences(preferences({ notificationEmail: '' }), messages))
      .toEqual({})
  })

  it('rejects a notification email with no @, exactly the server rule', () => {
    expect(validateNotificationPreferences(preferences({ notificationEmail: 'nope' }), messages))
      .toEqual({ notificationEmail: 'email-invalid' })
  })

  it('requires a webhook URL only while the webhook method is selected', () => {
    expect(validateNotificationPreferences(preferences({ webhookUrl: '' }), messages)).toEqual({})
    expect(validateNotificationPreferences(
      preferences({ notifyType: 'webhook', webhookUrl: '' }),
      messages,
    )).toEqual({ webhookUrl: 'url-required' })
  })

  it('requires webhook, Bark and Gotify URLs to be absolute http(s)', () => {
    expect(validateNotificationPreferences(
      preferences({ notifyType: 'webhook', webhookUrl: 'example.com/hook' }),
      messages,
    )).toEqual({ webhookUrl: 'url-invalid' })
    expect(validateNotificationPreferences(
      preferences({ notifyType: 'bark', barkUrl: 'ftp://example.com' }),
      messages,
    )).toEqual({ barkUrl: 'url-invalid' })
  })

  it('requires both halves of a Gotify configuration', () => {
    expect(validateNotificationPreferences(preferences({ notifyType: 'gotify' }), messages))
      .toEqual({ gotifyUrl: 'url-required', gotifyToken: 'token-required' })
  })

  it('passes a complete Gotify configuration', () => {
    expect(validateNotificationPreferences(
      preferences({
        gotifyToken: 'A1B2',
        gotifyUrl: 'https://gotify.example.com',
        notifyType: 'gotify',
      }),
      messages,
    )).toEqual({})
  })
})

describe('buildUserSettingPayload', () => {
  it('sends only the fields the chosen method keeps', () => {
    const payload = buildUserSettingPayload(
      preferences({
        barkUrl: 'https://api.day.app/key',
        notifyType: 'email',
        notificationEmail: 'alerts@example.com',
        webhookUrl: 'https://example.com/hook',
      }),
      { isAdmin: false },
    )

    expect(payload).toEqual({
      notify_type: 'email',
      quota_warning_threshold: 500000,
      accept_unset_model_ratio_model: false,
      record_ip_log: false,
      notification_email: 'alerts@example.com',
    })
    // The server would have discarded these; sending them implies they are kept.
    expect(payload).not.toHaveProperty('webhook_url')
    expect(payload).not.toHaveProperty('bark_url')
  })

  it('omits an empty notification email so the server falls back to the account address', () => {
    const payload = buildUserSettingPayload(preferences({ notificationEmail: '' }), { isAdmin: false })
    expect(payload).not.toHaveProperty('notification_email')
  })

  it('omits an empty webhook secret so the stored one survives', () => {
    const payload = buildUserSettingPayload(
      preferences({ notifyType: 'webhook', webhookSecret: '', webhookUrl: 'https://e.co/h' }),
      { isAdmin: false },
    )
    expect(payload.webhook_url).toBe('https://e.co/h')
    expect(payload).not.toHaveProperty('webhook_secret')
  })

  it('sends the full Gotify triple, priority included, even at 0', () => {
    const payload = buildUserSettingPayload(
      preferences({
        gotifyPriority: 0,
        gotifyToken: 'A1B2',
        gotifyUrl: 'https://gotify.example.com',
        notifyType: 'gotify',
      }),
      { isAdmin: false },
    )
    expect(payload.gotify_url).toBe('https://gotify.example.com')
    expect(payload.gotify_token).toBe('A1B2')
    expect(payload.gotify_priority).toBe(0)
  })

  it('sends the admin-only flag only for an admin, since the server discards it otherwise', () => {
    expect(
      buildUserSettingPayload(preferences({ upstreamModelUpdateNotify: true }), { isAdmin: false }),
    ).not.toHaveProperty('upstream_model_update_notify_enabled')

    expect(
      buildUserSettingPayload(preferences({ upstreamModelUpdateNotify: true }), { isAdmin: true }),
    ).toHaveProperty('upstream_model_update_notify_enabled', true)
  })

  it('never invents a key the closed dto.UserSetting struct does not have', () => {
    const allowed = new Set([
      'notify_type',
      'quota_warning_threshold',
      'webhook_url',
      'webhook_secret',
      'notification_email',
      'bark_url',
      'gotify_url',
      'gotify_token',
      'gotify_priority',
      'upstream_model_update_notify_enabled',
      'accept_unset_model_ratio_model',
      'record_ip_log',
    ])

    for (const notifyType of ['email', 'webhook', 'bark', 'gotify'] as const) {
      const payload = buildUserSettingPayload(
        preferences({
          barkUrl: 'https://b',
          gotifyToken: 'g',
          gotifyUrl: 'https://g',
          notificationEmail: 'a@b.c',
          notifyType,
          webhookSecret: 's',
          webhookUrl: 'https://w',
        }),
        { isAdmin: true },
      )
      for (const key of Object.keys(payload)) expect(allowed.has(key)).toBe(true)
    }
  })
})

describe('interface language codes', () => {
  it('maps this console\'s i18n keys onto BCP-47 tags the backend and legacy console both read', () => {
    expect(toStoredLanguage('zh')).toBe('zh-CN')
    expect(toStoredLanguage('zh-TW')).toBe('zh-TW')
    expect(toStoredLanguage('fr')).toBe('fr')
  })

  it('falls back to English for an i18n key this console does not ship', () => {
    expect(toStoredLanguage('kl')).toBe('en')
  })

  it('reads back what it wrote', () => {
    for (const code of ['en', 'zh', 'zh-TW', 'fr', 'ja', 'ru', 'vi']) {
      expect(toInterfaceLanguage(toStoredLanguage(code))).toBe(code)
    }
  })

  it('understands the values the legacy console wrote', () => {
    expect(toInterfaceLanguage('zhCN')).toBe('zh')
    expect(toInterfaceLanguage('zhTW')).toBe('zh-TW')
  })

  it('understands browser-shaped tags and separators', () => {
    expect(toInterfaceLanguage('zh_CN')).toBe('zh')
    expect(toInterfaceLanguage('zh-Hant-TW')).toBe('zh-TW')
    expect(toInterfaceLanguage('zh-Hans')).toBe('zh')
    expect(toInterfaceLanguage('fr-FR')).toBe('fr')
    expect(toInterfaceLanguage('ja-JP')).toBe('ja')
  })

  it('falls back to English for an empty or unknown value', () => {
    expect(toInterfaceLanguage('')).toBe('en')
    expect(toInterfaceLanguage(null)).toBe('en')
    expect(toInterfaceLanguage('kl-GL')).toBe('en')
  })
})
