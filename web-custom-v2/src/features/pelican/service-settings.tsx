/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form/Input'
import { NativeSelect } from '@/components/form/NativeSelect'
import { Dialog } from '@/components/overlay/Dialog'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

import {
  errorDetails,
  getPelicanSettings,
  pelicanKeys,
  savePelicanConnection,
  savePelicanTestToken,
} from './api'

const settingsKey = [...pelicanKeys.all, 'settings'] as const

export function ServiceSettings(props: { onClose: () => void }) {
  const { t } = useTranslation()
  const cache = useQueryClient()
  const options = useQuery({ queryKey: settingsKey, queryFn: getPelicanSettings })
  const connection = useOptionSectionForm({
    saved: { url: options.data?.url ?? '', serviceToken: '' },
    groupWrite: {
      keys: ['url', 'serviceToken'],
      write: async (values) => {
        try {
          await savePelicanConnection(String(values.url).trim(), String(values.serviceToken))
        } catch (error) {
          const message = errorDetails(error)
          throw new Error(t(message, { defaultValue: message }))
        }
        await cache.invalidateQueries({ queryKey: settingsKey })
        void cache.invalidateQueries({ queryKey: [...pelicanKeys.all, 'status'] })
      },
    },
  })
  const testToken = useOptionSectionForm({
    saved: { id: String(options.data?.test_token_id ?? 0) },
    groupWrite: {
      keys: ['id'],
      write: async (values) => {
        try {
          await savePelicanTestToken(Number(values.id))
        } catch (error) {
          const message = errorDetails(error)
          throw new Error(t(message, { defaultValue: message }))
        }
        await cache.invalidateQueries({ queryKey: settingsKey })
        void cache.invalidateQueries({ queryKey: [...pelicanKeys.all, 'status'] })
      },
    },
  })
  const busy = connection.isSaving || testToken.isSaving
  const testTokenOptions = (options.data?.test_tokens ?? []).map((token) => ({
    value: String(token.id),
    label: token.name + ' (#' + token.id + ')',
  }))
  if (
    options.data?.test_token_id &&
    !testTokenOptions.some((item) => Number(item.value) === options.data?.test_token_id)
  ) {
    testTokenOptions.unshift({
      value: String(options.data.test_token_id),
      label: '#' + options.data.test_token_id,
    })
  }

  return (
    <Dialog
      open
      title={t('Artifact service settings')}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      dismissible={!busy}
      hideCloseButton={busy}
    >
      {options.isPending && <Spinner label={t('Loading')} />}
      {options.isError && (
        <Alert tone="destructive">
          {errorDetails(options.error)}
          <Button variant="outline" size="sm" onClick={() => void options.refetch()}>
            {t('Retry')}
          </Button>
        </Alert>
      )}
      {options.isSuccess && (
        <div className="flex flex-col gap-4">
          <SettingsSection
            title={t('Artifact service URL')}
            description={t(
              'Use an address reachable from the new-api server. Changes apply to new requests without restarting.',
            )}
            form={connection}
            saveMode="section"
            note={t(
              'Changing the address does not move existing artwork. The new address must serve the same stored data.',
            )}
          >
            <Input
              label={t('Artifact service URL')}
              description={t('Leave the address and token empty to use the server environment.')}
              placeholder="http://model-artifact-service:3001"
              maxLength={2048}
              disabled={busy}
              value={connection.values.url}
              onChange={(event) => connection.setField('url', event.target.value)}
            />
            <Input
              label={t('Artifact service token')}
              description={
                options.data.service_token_configured
                  ? t('Token configured; enter a new one to replace it.')
                  : undefined
              }
              type="password"
              autoComplete="new-password"
              maxLength={512}
              disabled={busy}
              value={connection.values.serviceToken}
              onChange={(event) => connection.setField('serviceToken', event.target.value)}
            />
          </SettingsSection>
          <SettingsSection
            title={t('Test API key')}
            description={t('Use an enabled key from your account with a fixed group.')}
            form={testToken}
            saveMode="section"
          >
            <NativeSelect
              label={t('Test API key')}
              options={[{ value: '0', label: t('Use server environment') }, ...testTokenOptions]}
              disabled={busy}
              value={testToken.values.id}
              onChange={(event) => testToken.setField('id', event.target.value)}
            />
          </SettingsSection>
        </div>
      )}
    </Dialog>
  )
}
