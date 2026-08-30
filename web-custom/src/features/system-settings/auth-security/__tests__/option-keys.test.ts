import { describe, expect, it } from 'vitest'

import {
  ENABLE_DEPENDENCIES,
  WRITE_ONLY_AUTH_KEYS,
  isWriteOnlyOptionKey,
} from '@/features/system-settings/auth-security/option-keys'

/**
 * These assertions encode two server behaviours the sections depend on, both verified
 * against the running dev server. If either changes, a section is silently lying to the
 * operator, so they are pinned here rather than left in a comment.
 */

describe('the write-only suffix rule', () => {
  it('matches every suffix controller.GetOptions filters on', () => {
    expect(isWriteOnlyOptionKey('TelegramBotToken')).toBe(true)
    expect(isWriteOnlyOptionKey('GitHubClientSecret')).toBe(true)
    expect(isWriteOnlyOptionKey('TurnstileSiteKey')).toBe(true)
    expect(isWriteOnlyOptionKey('discord.client_secret')).toBe(true)
    expect(isWriteOnlyOptionKey('model_deployment.ionet.api_key')).toBe(true)
  })

  it('leaves ordinary keys alone', () => {
    for (const key of [
      'GitHubClientId',
      'discord.client_id',
      'oidc.authorization_endpoint',
      'TelegramBotName',
      'WeChatServerAddress',
      'passkey.rp_id',
      'fetch_setting.allowed_ports',
      'ModelRequestRateLimitEnabled',
    ]) {
      expect(isWriteOnlyOptionKey(key)).toBe(false)
    }
  })

  it('classifies every credential this feature offers a control for as unreadable', () => {
    for (const key of WRITE_ONLY_AUTH_KEYS) {
      expect(isWriteOnlyOptionKey(key)).toBe(true)
    }
  })

  it('includes TurnstileSiteKey, which is public but hidden by the suffix rule anyway', () => {
    // The site key is embedded in the sign-in page, so it is not a secret — but it ends in
    // `Key`, so the server drops it too. The bot-protection section must not claim it is
    // unset when the field is blank.
    expect(WRITE_ONLY_AUTH_KEYS).toContain('TurnstileSiteKey')
  })
})

describe('the enable-toggle write order', () => {
  /**
   * `useOptionSectionForm.save()` writes dirty keys sorted by key. The server refuses to
   * enable a provider while its companion credential is still empty, so a single save that
   * does both only works when the credential sorts FIRST.
   */
  const sortsFirst = (dependency: string, enableKey: string) =>
    [dependency, enableKey].sort()[0] === dependency

  it('is safe for the five providers whose credential key sorts first', () => {
    for (const enableKey of [
      'GitHubOAuthEnabled',
      'discord.enabled',
      'oidc.enabled',
      'LinuxDOOAuthEnabled',
      'TelegramOAuthEnabled',
    ]) {
      expect(sortsFirst(ENABLE_DEPENDENCIES[enableKey], enableKey)).toBe(true)
    }
  })

  it('is unsafe for WeChat and Turnstile, which is why their switches are held back', () => {
    // Documented, deliberate and covered by the section tests: the switch is disabled while
    // its companion field has unsaved edits, so this order can never be produced.
    expect(sortsFirst(ENABLE_DEPENDENCIES.WeChatAuthEnabled, 'WeChatAuthEnabled')).toBe(false)
    expect(sortsFirst(ENABLE_DEPENDENCIES.TurnstileCheckEnabled, 'TurnstileCheckEnabled')).toBe(false)
  })
})
