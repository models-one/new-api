import { useMutation, useQueryClient } from '@tanstack/react-query'
import CheckIcon from 'lucide-react/dist/esm/icons/check'
import LanguagesIcon from 'lucide-react/dist/esm/icons/languages'
import { useTranslation } from 'react-i18next'

import { DropdownMenu, toErrorMessage, toast } from '@/components/overlay'
import { Button } from '@/components/ui'
import { saveInterfaceLanguage } from '@/features/profile/preferences/api'
import {
  INTERFACE_LANGUAGES,
  applyInterfaceLanguage,
  toInterfaceLanguage,
  toStoredLanguage,
} from '@/i18n/language'

/**
 * The interface language, reachable from every page.
 *
 * The same preference as the one in profile settings, put in the header because
 * a visitor who cannot read the current language cannot navigate to the settings
 * page to change it. Both controls write `setting.language` and agree on what
 * happens when that write fails.
 *
 * Endonyms are never translated: a language picker has to be readable to someone
 * who cannot read the language currently on screen.
 */
export function LanguageMenu() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  const active = toInterfaceLanguage(i18n.resolvedLanguage ?? i18n.language)

  const save = useMutation({
    mutationFn: async (next: string) => {
      const previous = i18n.language
      await applyInterfaceLanguage(next)

      try {
        await saveInterfaceLanguage(toStoredLanguage(next))
      } catch (error: unknown) {
        // Roll back so the screen does not claim a language the account does not
        // hold — the stored value also drives API error messages and follows the
        // user to other devices.
        await applyInterfaceLanguage(previous)
        throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user', 'self'] })
    },
    onError: (error: unknown) => {
      // No success toast: the whole console visibly changes language already.
      toast.error(toErrorMessage(error))
    },
  })

  return (
    <DropdownMenu
      items={INTERFACE_LANGUAGES.map((language) => ({
        id: language.i18n,
        label: language.label,
        disabled: save.isPending,
        hint: language.i18n === active ? <CheckIcon aria-hidden="true" /> : undefined,
        onSelect: () => {
          if (language.i18n === active) return
          save.mutate(language.i18n)
        },
      }))}
      trigger={(
        <Button aria-label={t('Language')} size="icon-lg" variant="quiet">
          <LanguagesIcon aria-hidden="true" />
        </Button>
      )}
    />
  )
}
