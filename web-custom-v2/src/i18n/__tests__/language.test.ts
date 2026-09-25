// @vitest-environment happy-dom

import '@/i18n/config'

import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  applyInterfaceLanguage,
  initialInterfaceLanguage,
  intlLocale,
  toInterfaceLanguage,
  toStoredLanguage,
} from '@/i18n/language'
import { formatDate, formatDateTime, formatTime } from '@/lib/format'

/** What `applyInterfaceLanguage` writes; asserted through the public reader. */
const STORAGE_KEY = 'new-api:web-custom:interface-language'

beforeEach(() => {
  localStorage.clear()
})

afterEach(async () => {
  await i18n.changeLanguage('en')
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

describe('applyInterfaceLanguage', () => {
  it('normalises the legacy value before i18next ever sees it', async () => {
    await applyInterfaceLanguage('zhCN')

    // Not `zhCN`: that tag reaches `Intl` through every date formatter, and
    // `Intl` answers a malformed tag with a RangeError.
    expect(i18n.language).toBe('zh')
  })

  it('leaves the current language alone when the account saved none', async () => {
    await i18n.changeLanguage('fr')

    await applyInterfaceLanguage(undefined)
    await applyInterfaceLanguage('')

    expect(i18n.language).toBe('fr')
  })

  it('remembers the applied language so a reload does not land in English', async () => {
    await applyInterfaceLanguage('zh-CN')

    expect(localStorage.getItem(STORAGE_KEY)).toBe('zh')
    expect(initialInterfaceLanguage()).toBe('zh')
  })
})

describe('initialInterfaceLanguage', () => {
  it('prefers the remembered language over the browser\'s', () => {
    localStorage.setItem(STORAGE_KEY, 'ja')

    expect(initialInterfaceLanguage()).toBe('ja')
  })

  it('converges a remembered legacy value on the canonical key', () => {
    localStorage.setItem(STORAGE_KEY, 'zhCN')

    expect(initialInterfaceLanguage()).toBe('zh')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('zh')
  })

  it('does not freeze the browser\'s guess into storage', () => {
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['ja-JP'] })

    expect(initialInterfaceLanguage()).toBe('ja')
    // Remembering it would stop this console following the browser if the
    // browser's own language changes later.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('falls back to English when nothing is remembered and no bundle fits', () => {
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['kl-GL'] })

    expect(initialInterfaceLanguage()).toBe('en')
  })

  it('takes the first browser preference a bundle exists for, not just the first', () => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['kl-GL', 'zh-CN', 'en-US'],
    })

    expect(initialInterfaceLanguage()).toBe('zh')
  })
})

describe('intlLocale', () => {
  it('passes a well-formed tag through', () => {
    expect(intlLocale('zh-CN')).toBe('zh-CN')
    expect(intlLocale('ja')).toBe('ja')
  })

  it('replaces a tag Intl rejects instead of letting it throw', () => {
    expect(intlLocale('zhCN')).toBe('en')
    expect(intlLocale('not a tag')).toBe('en')
  })

  it('falls back to the interface language when the caller threads none', async () => {
    await i18n.changeLanguage('ja')

    expect(intlLocale()).toBe('ja')
    expect(intlLocale('')).toBe('ja')
  })
})

describe('date formatting under a malformed interface language', () => {
  /**
   * The regression this guards: three accounts carried the legacy `zhCN`, the
   * sign-in handlers applied it verbatim, and the first timestamp rendered after
   * that threw `RangeError: Invalid language tag: zhCN` out of the render pass —
   * which the error boundary answered by replacing the whole console.
   *
   * `changeLanguage` is called directly here because `applyInterfaceLanguage` now
   * makes that state unreachable; the formatters must survive it regardless.
   */
  it('formats rather than throwing', async () => {
    await i18n.changeLanguage('zhCN')

    expect(() => formatDate(1758585600)).not.toThrow()
    expect(() => formatDateTime(1758585600)).not.toThrow()
    expect(() => formatTime(1758585600)).not.toThrow()
    expect(formatDate(1758585600)).not.toBe('—')
  })
})
