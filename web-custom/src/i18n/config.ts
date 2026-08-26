import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTw from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

void i18n.use(initReactI18next).init({
  resources: { en, fr, ja, ru, vi, zh, 'zh-TW': zhTw },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
