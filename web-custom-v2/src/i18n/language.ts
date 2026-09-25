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

import i18next from 'i18next'

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
 * Where the applied language is kept so a hard reload does not land in English.
 *
 * `setting.language` is the authority, but it is only readable once a session
 * exists, and i18next has to pick a language before the first request is sent.
 * This mirror is written every time a language is applied, which makes the
 * reload render in the language the user last saw instead of flashing English
 * and switching.
 */
const STORAGE_KEY = 'new-api:web-custom:interface-language'

/**
 * Matches a language tag against the shipped bundles, or reports that none fit.
 *
 * Accepts more than this console writes, because the value may come from the
 * legacy console (`zhCN`, `zhTW`), from `navigator.languages` (`zh-Hans-CN`,
 * `fr-FR`), or with an underscore separator.
 */
function matchInterfaceLanguage(value: string | null | undefined): string | null {
  const tag = (value ?? '').trim().replaceAll('_', '-').toLowerCase()
  if (tag === '') return null

  if (tag.startsWith('zh')) {
    const traditional = tag === 'zhtw'
      || tag.startsWith('zh-tw')
      || tag.startsWith('zh-hk')
      || tag.startsWith('zh-mo')
      || tag.startsWith('zh-hant')
    return traditional ? 'zh-TW' : 'zh'
  }

  const exact = INTERFACE_LANGUAGES.find((language) => language.i18n.toLowerCase() === tag)
  if (exact) return exact.i18n

  // `fr-FR`, `ja-JP` and friends: match on the primary subtag.
  const primary = tag.split('-')[0]
  const base = INTERFACE_LANGUAGES.find((language) => language.i18n.toLowerCase() === primary)
  return base ? base.i18n : null
}

/**
 * Maps a stored value onto an i18next resource key.
 *
 * Anything unrecognised falls back to English rather than leaving the picker on
 * a language whose strings do not exist.
 */
export function toInterfaceLanguage(stored: string | null | undefined): string {
  return matchInterfaceLanguage(stored) ?? DEFAULT_INTERFACE_LANGUAGE
}

/** The value to persist for an i18next resource key. */
export function toStoredLanguage(i18nCode: string): string {
  const match = INTERFACE_LANGUAGES.find((language) => language.i18n === i18nCode)
  return match ? match.stored : DEFAULT_INTERFACE_LANGUAGE
}

/**
 * The language i18next should start in, before any account is known.
 *
 * Last applied language first, then the browser's own preference — a zh-CN
 * browser reaching the sign-in page has no session to read a setting from, and
 * English is a worse guess than the one the browser already states. Only the
 * first *supported* entry of `navigator.languages` counts, so a `de,zh-CN,en`
 * browser gets Chinese rather than falling straight to English.
 */
export function initialInterfaceLanguage(): string {
  const stored = readPersistedLanguage()
  const remembered = matchInterfaceLanguage(stored)
  if (remembered !== null) {
    // Converge a legacy `zhCN` in storage on the canonical key. Only a value
    // already remembered is rewritten — freezing the browser's guess would stop
    // this console following the browser if its language later changes.
    if (remembered !== stored) persistLanguage(remembered)
    return remembered
  }

  if (typeof navigator !== 'undefined') {
    const preferences = navigator.languages ?? [navigator.language]
    for (const preference of preferences) {
      const matched = matchInterfaceLanguage(preference)
      if (matched !== null) return matched
    }
  }

  return DEFAULT_INTERFACE_LANGUAGE
}

/**
 * Switches the console to a stored language value, normalising it first.
 *
 * Every sign-in mechanism funnels through here rather than calling
 * `changeLanguage` with the raw column, because the column can still hold the
 * legacy console's non-BCP-47 `zhCN`. i18next accepts that string happily and
 * then every `Intl` call on the page throws `RangeError: Invalid language tag`,
 * which took the whole console down behind the error boundary.
 *
 * An absent or empty value leaves the current language alone: the account has
 * expressed no preference, and forcing English over a language the visitor
 * already chose would be a regression, not a default.
 *
 * Failures are swallowed. The language is presentation; a sign-in must not fail
 * because a bundle could not be swapped.
 */
export async function applyInterfaceLanguage(stored: string | null | undefined): Promise<void> {
  const next = matchInterfaceLanguage(stored)
  if (next === null) return

  persistLanguage(next)
  if (next === i18next.language) return

  try {
    await i18next.changeLanguage(next)
  } catch {
    // Keeps the previous language; the caller's flow continues either way.
  }
}

/**
 * An `Intl` locale that cannot throw.
 *
 * `toLocaleDateString` and friends reject any tag `Intl` considers malformed,
 * and the interface language is not guaranteed to be well-formed: it is
 * whatever ended up in `setting.language`. Every date, time and axis-tick
 * formatter resolves its locale here so one bad tag degrades a timestamp's
 * formatting instead of unmounting the page that renders it.
 *
 * Also the reason `undefined` is never passed through: that would use the HOST
 * locale, so a zh-CN browser reading an English console would get "2026年9月16日"
 * next to "Never expires".
 */
export function intlLocale(preferred?: string): string {
  const candidate = preferred !== undefined && preferred !== ''
    ? preferred
    : i18next.resolvedLanguage ?? i18next.language ?? DEFAULT_INTERFACE_LANGUAGE

  const cached = validatedLocales.get(candidate)
  if (cached !== undefined) return cached

  let resolved = DEFAULT_INTERFACE_LANGUAGE
  try {
    resolved = Intl.getCanonicalLocales(candidate)[0] ?? DEFAULT_INTERFACE_LANGUAGE
  } catch {
    // Malformed tag; English formatting is wrong but readable.
  }
  validatedLocales.set(candidate, resolved)
  return resolved
}

/** Axis ticks re-resolve on every render, so the validity check is memoised. */
const validatedLocales = new Map<string, string>()

function readPersistedLanguage(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch {
    // Storage denied (private browsing, blocked third-party context).
    return null
  }
}

function persistLanguage(i18nCode: string): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, i18nCode)
  } catch {
    // Without storage the language still applies, it just will not survive a reload.
  }
}
