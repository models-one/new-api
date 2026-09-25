import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import CircleCheckIcon from 'lucide-react/dist/esm/icons/circle-check'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PasswordInput, SwitchRow } from '@/components/form'
import { toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, DescriptionList, Panel } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  hasOption,
  readOptionBoolean,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import {
  modelDeploymentSettingsQuery,
  testModelDeploymentConnection,
} from '@/features/system-settings/models-operations/api'

/**
 * `/system-settings/models/model-deployment`
 *
 * THE ONE SECTION WHOSE STATE IS NOT IN THE OPTION PAYLOAD.
 *
 *   model_deployment.ionet.api_key   never readable. It ends in `_key`, so
 *                                    `controller.GetOptions` strips it before serialising.
 *   model_deployment.ionet.enabled   absent from a fresh deployment. `model.InitOptionMap`
 *                                    does not seed it; `controller/deployment.go` reads it
 *                                    straight out of `common.OptionMap` and treats a missing
 *                                    row as false.
 *
 * Both are nevertheless real: `PUT /api/option/` accepts an unknown key and stores it, and
 * writing `model_deployment.ionet.enabled` was verified live — the row appeared in the next
 * `GET /api/option/` and the deployment probe kept agreeing with it.
 *
 * Because the option store cannot answer "is a key stored?", the truth for this section
 * comes from `GET /api/deployments/settings`, which reports
 * `{provider, enabled, configured, can_connect}` — `configured` being exactly the "a
 * non-empty key is stored" fact the option payload withholds. That endpoint sits behind
 * `AdminAuth` rather than `RootAuth`, but the settings shell already gates this whole area
 * at root, so nothing weaker reaches it.
 */

type DeploymentDraft = {
  'model_deployment.ionet.enabled': boolean
  'model_deployment.ionet.api_key': string
}

function toDraft(options: SystemOptionMap | undefined, serverEnabled: boolean): DeploymentDraft {
  return {
    // The probe is authoritative; the option row is the fallback for the moment before it
    // answers, and for a deployment where the row exists but the probe is unreachable.
    'model_deployment.ionet.api_key': '',
    'model_deployment.ionet.enabled': hasOption(options, 'model_deployment.ionet.enabled')
      ? readOptionBoolean(options, 'model_deployment.ionet.enabled')
      : serverEnabled,
  }
}

const serializeDeployment = {
  'model_deployment.ionet.api_key': (value: string | number | boolean) => String(value).trim(),
}

export function ModelDeploymentSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const optionsQuery = useQuery(systemOptionsQuery())
  const settingsQuery = useQuery(modelDeploymentSettingsQuery(!optionsQuery.isPending))

  const settings = settingsQuery.data
  const form = useOptionSectionForm<DeploymentDraft>({
    saved: toDraft(optionsQuery.data, settings?.enabled ?? false),
    serialize: serializeDeployment,
    validate: (values) => {
      const typed = values['model_deployment.ionet.api_key']
      // Whitespace is dirty, trims to '' on the way out, and would replace a working key
      // with nothing. An empty field is the "keep what is stored" case and never written.
      if (typed !== '' && typed.trim() === '') {
        return {
          'model_deployment.ionet.api_key': t('That is only whitespace. Clear the field to keep the stored value.'),
        }
      }
      if (
        values['model_deployment.ionet.enabled']
        && settings?.configured === false
        && typed.trim() === ''
      ) {
        return {
          'model_deployment.ionet.api_key': t('An API key is required before this provider can be switched on.'),
        }
      }
      return {}
    },
  })

  const testMutation = useMutation({
    mutationFn: (apiKey: string) => testModelDeploymentConnection(apiKey),
    onError: (error) => toast.error(toErrorMessage(error)),
    onSuccess: async () => {
      toast.success(t('io.net accepted the key.'))
      await queryClient.invalidateQueries({
        queryKey: ['system-settings', 'model-deployment', 'settings'],
      })
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const typedKey = form.values['model_deployment.ionet.api_key'].trim()
  const configured = settings?.configured ?? false
  const canTest = typedKey !== '' || configured

  /** Three states apart: "unavailable" and "off" are different facts about the provider. */
  const providerStatus = ((): ReactNode => {
    if (settingsQuery.isPending) {
      return (
        <p className="text-xs text-muted" role="status">
          {t('Reading the provider status…')}
        </p>
      )
    }

    if (settings === undefined) {
      return <p className="text-xs text-muted">{t('The provider status is unavailable.')}</p>
    }

    return (
            <DescriptionList
              items={[
                { description: settings.provider, term: t('Provider') },
                {
                  description: (
                    <Badge size="sm" tone={settings.enabled ? 'success' : 'muted'}>
                      {settings.enabled ? t('On') : t('Off')}
                    </Badge>
                  ),
                  term: t('Switched on'),
                },
                {
                  description: (
                    <Badge size="sm" tone={settings.configured ? 'success' : 'warning'}>
                      {settings.configured ? t('A key is stored') : t('No key stored')}
                    </Badge>
                  ),
                  term: t('Credential'),
                },
                {
                  description: (
                    <Badge size="sm" tone={settings.can_connect ? 'success' : 'muted'}>
                      {settings.can_connect ? t('Ready') : t('Not usable')}
                    </Badge>
                  ),
                  term: t('Can be called'),
                },
              ]}
              label={t('io.net provider status')}
            />
    )
  })()

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        description={t('Credentials for the managed GPU provider this deployment can launch model containers on.')}
        form={form}
        note={t('Neither of these two settings appears in the server’s settings payload — the key is stripped as a secret and the switch is not seeded — so this page reads their state from the deployment endpoint instead.')}
        saveMode="section"
        title={t('Model deployment')}
      >
        {settingsQuery.isError ? (
          <Alert
            action={
              <Button
                aria-busy={settingsQuery.isFetching}
                disabled={settingsQuery.isFetching}
                onClick={() => void settingsQuery.refetch()}
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('The provider status could not be read')}
            tone="destructive"
          >
            {toErrorMessage(settingsQuery.error)}
          </Alert>
        ) : null}

        <SwitchRow
          checked={form.values['model_deployment.ionet.enabled']}
          description={t('Lets this deployment call io.net to list hardware and launch model containers. With no key stored, turning it on has no effect — every call is refused with “not enabled or api key missing”.')}
          disabled={disabled || settingsQuery.isPending}
          label={t('Use io.net for model deployment')}
          onCheckedChange={(checked) =>
            form.setField('model_deployment.ionet.enabled', checked)
          }
        />

        <Alert icon={<KeyRoundIcon aria-hidden="true" />} title={t('The API key is write-only')} tone="info">
          {t('The server strips this key from its settings payload, so it can never be displayed. Leave the field empty to keep the stored key; anything you type replaces it.')}
        </Alert>

        <PasswordInput
          autoComplete="new-password"
          description={
            configured
              ? t('A key is currently stored. Type a new one only to replace it.')
              : t('No key is stored yet.')
          }
          disabled={disabled}
          error={form.errors['model_deployment.ionet.api_key']}
          invalid={form.errors['model_deployment.ionet.api_key'] !== undefined}
          label={t('io.net API key')}
          onChange={(event) => form.setField('model_deployment.ionet.api_key', event.target.value)}
          placeholder={t('Leave empty to keep the stored value')}
          value={form.values['model_deployment.ionet.api_key']}
        />
      </SettingsSection>

      <Panel as="section">
        <Panel.Header
          description={t('What the server reports about this provider, independently of the form above.')}
          title={t('Provider status')}
        />

        <Panel.Body className="flex flex-col gap-4">
          {providerStatus}

          <p className="text-xs leading-5 text-muted">
            {t('“Can be called” only means the switch is on and a key is stored. Use the test below to find out whether io.net actually accepts that key.')}
          </p>

          {testMutation.isSuccess ? (
            <Alert
              icon={<CircleCheckIcon aria-hidden="true" />}
              title={t('io.net accepted the key')}
              tone="success"
            >
              {t('The provider answered a real request, so the credential works.')}
            </Alert>
          ) : null}
        </Panel.Body>

        <Panel.Footer align="end">
          <Button
            aria-busy={testMutation.isPending}
            disabled={testMutation.isPending || !canTest}
            onClick={() => testMutation.mutate(typedKey)}
            size="sm"
            variant="outline"
          >
            {typedKey === '' ? t('Test the stored key') : t('Test the key you typed')}
          </Button>
        </Panel.Footer>
      </Panel>
    </div>
  )
}
