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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/form/Input'
import { Dialog } from '@/components/overlay/Dialog'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import { readOptionString, systemOptionsQuery } from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

import { errorDetails } from './api'

export function ServiceSettings(props: { onClose: () => void }) {
  const { t } = useTranslation()
  const options = useQuery(systemOptionsQuery())
  const form = useOptionSectionForm({
    saved: { PelicanServiceURL: readOptionString(options.data, 'PelicanServiceURL') },
    serialize: { PelicanServiceURL: (value) => String(value).trim().replace(/\/+$/, '') },
  })

  return (
    <Dialog
      open
      title={t('Artifact service settings')}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      dismissible={!form.isSaving}
      hideCloseButton={form.isSaving}
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
        <SettingsSection
          title={t('Artifact service URL')}
          description={t(
            'Use an address reachable from the new-api server. Changes apply to new requests without restarting.',
          )}
          form={{
            ...form,
            failures: form.failures.map((failure) => ({
              ...failure,
              message:
                failure.message ===
                'Artifact service URL must be an HTTP(S) address without credentials, query or fragment'
                  ? t(
                      'Artifact service URL must be an HTTP(S) address without credentials, query or fragment',
                    )
                  : failure.message,
            })),
          }}
          saveMode="section"
          note={t(
            'Changing the address does not move existing artwork. The new address must serve the same stored data.',
          )}
        >
          <Input
            label={t('Artifact service URL')}
            description={t(
              'Leave empty to use PELICAN_SERVICE_URL. If both are empty, scheduled testing is disabled.',
            )}
            placeholder="http://model-artifact-service:3001"
            maxLength={2048}
            disabled={form.isSaving}
            value={form.values.PelicanServiceURL}
            onChange={(event) => form.setField('PelicanServiceURL', event.target.value)}
          />
        </SettingsSection>
      )}
    </Dialog>
  )
}
