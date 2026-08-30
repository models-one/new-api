import { useQuery } from '@tanstack/react-query'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import { useTranslation } from 'react-i18next'

import { Input, PasswordInput, SwitchRow } from '@/components/form'
import { Alert } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  hasOption,
  readOptionBoolean,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/operations/worker`
 *
 * Two keys present in `GET /api/option/`, one absent:
 *
 *   WorkerUrl                          ''
 *   WorkerAllowHttpImageRequestEnabled 'false'
 *   WorkerValidKey                     ABSENT — ends in `Key`, so `controller.GetOptions`
 *                                      strips it. Write-only, exactly like `SMTPToken`.
 *
 * The worker is a relay the gateway fetches upstream media through, so the deployment's own
 * IP is not the one contacting the media host.
 */

type WorkerDraft = {
  WorkerUrl: string
  WorkerValidKey: string
  WorkerAllowHttpImageRequestEnabled: boolean
}

function toDraft(options: SystemOptionMap | undefined): WorkerDraft {
  return {
    WorkerAllowHttpImageRequestEnabled: readOptionBoolean(
      options,
      'WorkerAllowHttpImageRequestEnabled',
    ),
    WorkerUrl: readOptionString(options, 'WorkerUrl'),
    // Never readable; empty means "leave the stored secret alone".
    WorkerValidKey: '',
  }
}

const serializeWorker = {
  // A trailing slash would produce `https://worker//path` once the gateway appends to it.
  WorkerUrl: (value: string | number | boolean) => String(value).trim().replace(/\/+$/, ''),
  WorkerValidKey: (value: string | number | boolean) => String(value).trim(),
}

export function WorkerSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<WorkerDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializeWorker,
    validate: (values) => {
      const errors: Partial<Record<keyof WorkerDraft, string>> = {}

      const url = values.WorkerUrl.trim()
      if (url !== '' && !/^https?:\/\//.test(url)) {
        errors.WorkerUrl = t('Enter a full http:// or https:// address, or leave this empty.')
      }
      // An empty field is never dirty and never written, which is what "keep the stored key"
      // means here. Whitespace IS dirty, trims to '' on the way out, and would replace the
      // stored key with nothing — after which the worker rejects every request from here.
      if (values.WorkerValidKey !== '' && values.WorkerValidKey.trim() === '') {
        errors.WorkerValidKey = t('That is only whitespace. Clear the field to keep the stored value.')
      }
      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const keyIsReadable = hasOption(optionsQuery.data, 'WorkerValidKey')
  const workerConfigured = form.values.WorkerUrl.trim() !== ''

  return (
    <SettingsSection
      description={t('An optional relay the gateway fetches upstream images and other media through.')}
      form={form}
      note={t('With no address set the gateway fetches media directly and every other control here has no effect.')}
      saveMode="section"
      title={t('Worker proxy')}
    >
      <Input
        autoComplete="off"
        description={t('Media requests are sent here instead of straight to the media host. A trailing slash is removed when saved.')}
        disabled={disabled}
        error={form.errors.WorkerUrl}
        inputMode="url"
        invalid={form.errors.WorkerUrl !== undefined}
        label={t('Worker address')}
        onChange={(event) => form.setField('WorkerUrl', event.target.value)}
        placeholder="https://worker.example.workers.dev"
        value={form.values.WorkerUrl}
      />

      <Alert icon={<KeyRoundIcon aria-hidden="true" />} title={t('The access key is write-only')} tone="info">
        {keyIsReadable
          ? t('The server is returning this credential in its settings payload. Treat it as exposed and rotate it.')
          : t('The server never returns the stored worker key, so this console cannot show it or tell you whether one is set. Leave the field empty to keep what is stored; anything you type replaces it.')}
      </Alert>

      <PasswordInput
        autoComplete="new-password"
        description={t('Sent with each request so the worker can reject traffic that did not come from this deployment.')}
        disabled={disabled}
        error={form.errors.WorkerValidKey}
        invalid={form.errors.WorkerValidKey !== undefined}
        label={t('Worker access key')}
        onChange={(event) => form.setField('WorkerValidKey', event.target.value)}
        placeholder={t('Leave empty to keep the stored value')}
        value={form.values.WorkerValidKey}
      />

      <SwitchRow
        checked={form.values.WorkerAllowHttpImageRequestEnabled}
        description={t('Lets the worker fetch media over plain http://. Leave this off unless the worker genuinely needs to reach a host that has no TLS.')}
        disabled={disabled || !workerConfigured}
        label={t('Allow the worker to fetch over plain HTTP')}
        onCheckedChange={(checked) =>
          form.setField('WorkerAllowHttpImageRequestEnabled', checked)
        }
      />
    </SettingsSection>
  )
}
