/**
 * The interface languages this console ships, and how they are stored.
 *
 * Two codes exist for the same language and they are not interchangeable:
 *
 *   `i18n`   — what `src/i18n/config.ts` registers as a resource bundle
 *              (`en`, `zh`, `zh-TW`, `fr`, `ja`, `ru`, `vi`).
 *   `stored` — what goes into the user's `setting.language` column.
 *
 * `stored` uses BCP-47 tags because three different readers consume that column
 * and only BCP-47 satisfies all of them:
 *   - `i18n/i18n.go#normalizeLang` lowercases and prefix-matches, so `zh-CN`
 *     selects Chinese for API error messages and `zh` would too.
 *   - The legacy console's `normalizeInterfaceLanguage` special-cases the exact
 *     strings `zh-CN` and `zh-TW`; it maps a bare `zh` to English.
 *   - This console, through `toInterfaceLanguage` below.
 * Writing `zh-CN` therefore keeps Chinese working in all three; writing `zh`
 * would silently switch the legacy console back to English.
 */

export type InterfaceLanguage = {
  /** i18next resource key. */
  i18n: string
  /** Value written to `setting.language`. */
  stored: string
  /** Endonym. Never translated — a language picker is read in its own language. */
  label: string
}

export const INTERFACE_LANGUAGES: readonly InterfaceLanguage[] = [
  { i18n: 'en', stored: 'en', label: 'English' },
  { i18n: 'zh', stored: 'zh-CN', label: '简体中文' },
  { i18n: 'zh-TW', stored: 'zh-TW', label: '繁體中文' },
  { i18n: 'fr', stored: 'fr', label: 'Français' },
  { i18n: 'ja', stored: 'ja', label: '日本語' },
  { i18n: 'ru', stored: 'ru', label: 'Русский' },
  { i18n: 'vi', stored: 'vi', label: 'Tiếng Việt' },
]

export const DEFAULT_INTERFACE_LANGUAGE = 'en'

/**
 * Maps a stored value onto an i18next resource key.
 *
 * Accepts more than this console writes, because the column may already hold a
 * value written by the legacy console (`zhCN`, `zhTW`), by a browser detector
 * (`zh-Hans`, `fr-FR`), or with an underscore separator. Anything unrecognised
 * falls back to English rather than leaving the picker on a language whose
 * strings do not exist.
 */
export function toInterfaceLanguage(stored: string | null | undefined): string {
  const value = (stored ?? '').trim().replaceAll('_', '-').toLowerCase()
  if (value === '') return DEFAULT_INTERFACE_LANGUAGE

  if (value.startsWith('zh')) {
    const traditional = value === 'zhtw'
      || value.startsWith('zh-tw')
      || value.startsWith('zh-hk')
      || value.startsWith('zh-mo')
      || value.startsWith('zh-hant')
    return traditional ? 'zh-TW' : 'zh'
  }

  const exact = INTERFACE_LANGUAGES.find((language) => language.i18n.toLowerCase() === value)
  if (exact) return exact.i18n

  // `fr-FR`, `ja-JP` and friends: match on the primary subtag.
  const primary = value.split('-')[0]
  const base = INTERFACE_LANGUAGES.find((language) => language.i18n.toLowerCase() === primary)
  return base ? base.i18n : DEFAULT_INTERFACE_LANGUAGE
}

/** The value to persist for an i18next resource key. */
export function toStoredLanguage(i18nCode: string): string {
  const match = INTERFACE_LANGUAGES.find((language) => language.i18n === i18nCode)
  return match ? match.stored : DEFAULT_INTERFACE_LANGUAGE
}
