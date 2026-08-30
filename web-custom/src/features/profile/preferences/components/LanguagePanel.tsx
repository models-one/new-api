import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import LanguagesIcon from 'lucide-react/dist/esm/icons/languages'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NativeSelect } from '@/components/form'
import { toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, IconBadge, Panel, Skeleton } from '@/components/ui'
import { saveInterfaceLanguage } from '@/features/profile/preferences/api'
import {
  INTERFACE_LANGUAGES,
  toInterfaceLanguage,
  toStoredLanguage,
} from '@/features/profile/preferences/languages'
import { parseUserSetting } from '@/features/profile/preferences/user-settings'
import { selfUserQuery } from '@/lib/api/user'

/**
 * The interface language.
 *
 * Applied optimistically and rolled back on failure: switching i18next is
 * instant and local, while the request that persists it is neither, and leaving
 * the console in English until the round trip finishes reads as a broken control.
 * If the save fails the language goes back to what the server still holds, so the
 * screen never disagrees with the stored value.
 *
 * The stored value also reaches the API: `i18n/i18n.go#GetLangFromContext` reads
 * `setting.language` to pick the language of API error messages, which is why the
 * description says so.
 */
export function LanguagePanel() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  const userQuery = useQuery(selfUserQuery())
  const storedLanguage = useMemo(
    () => toInterfaceLanguage(parseUserSetting(userQuery.data?.setting).language),
    [userQuery.data?.setting],
  )

  // What the picker shows while the server has not caught up yet. Without it the
  // select snaps back to the old language between a successful save and the
  // refetch of `/api/user/self`.
  const [selection, setSelection] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async (next: string) => {
      const previous = i18n.language
      await i18n.changeLanguage(next)
      try {
        await saveInterfaceLanguage(toStoredLanguage(next))
      } catch (error: unknown) {
        await i18n.changeLanguage(previous)
        throw error
      }
    },
    onSuccess: () => {
      setFailure(null)
      toast.success(t('Language saved'))
      void queryClient.invalidateQueries({ queryKey: ['user', 'self'] })
    },
    onError: (error: unknown) => {
      // The console language is already rolled back; drop the optimistic
      // selection so the picker shows what the server still holds.
      setSelection(null)
      setFailure(toErrorMessage(error))
    },
  })

  const selected = selection ?? storedLanguage

  return (
    <Panel>
      <Panel.Header
        description={t('The language of this console.')}
        icon={<IconBadge icon={<LanguagesIcon aria-hidden="true" />} size="sm" tone="muted" />}
        title={t('Language')}
      />

      <Panel.Body className="flex flex-col gap-4">
        {userQuery.isPending ? (
          <div aria-busy="true" role="status">
            <span className="sr-only">{t('Loading language preference')}</span>
            <Skeleton height={64} variant="block" />
          </div>
        ) : null}

        {userQuery.isError ? (
          <Alert
            action={(
              <Button
                aria-busy={userQuery.isFetching}
                disabled={userQuery.isFetching}
                onClick={() => void userQuery.refetch()}
                size="sm"
                variant="outline"
              >
                {t('Try again')}
              </Button>
            )}
            title={t('Language preference could not be loaded')}
            tone="destructive"
          >
            {toErrorMessage(userQuery.error)}
          </Alert>
        ) : null}

        {userQuery.data ? (
          <>
            <NativeSelect
              className="max-w-sm"
              description={t(
                'Saved to your account, so it follows you to other devices. It also sets the language of API error messages.',
              )}
              disabled={save.isPending}
              label={t('Interface language')}
              onChange={(event) => {
                setFailure(null)
                setSelection(event.target.value)
                save.mutate(event.target.value)
              }}
              options={INTERFACE_LANGUAGES.map((language) => ({
                label: language.label,
                value: language.i18n,
              }))}
              value={selected}
            />

            {failure !== null ? (
              <Alert title={t('Language was not saved')} tone="destructive">
                {failure}
              </Alert>
            ) : null}
          </>
        ) : null}
      </Panel.Body>
    </Panel>
  )
}
