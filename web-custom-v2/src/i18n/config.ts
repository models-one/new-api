import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { initialInterfaceLanguage } from '@/i18n/language'
import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTw from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

void i18n.use(initReactI18next).init({
  resources: { en, fr, ja, ru, vi, zh, 'zh-TW': zhTw },
  // Not a constant: a reload must come back in the language the user left in,
  // and the account's `setting.language` is not readable until a session exists.
  // See `initialInterfaceLanguage`.
  lng: initialInterfaceLanguage(),
  fallbackLng: 'en',
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false,
  },
})

/**
 * Keeps `<html lang>` on the rendered language.
 *
 * `index.html` ships `lang="en"`. Leaving it there tells screen readers to read
 * Chinese with an English voice, and lets the browser hyphenate and pick fonts
 * for the wrong language.
 */
i18n.on('languageChanged', (language: string) => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = language
})

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language ?? 'en'
}

export default i18n
