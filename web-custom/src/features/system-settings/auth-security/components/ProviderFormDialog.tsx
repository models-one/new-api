import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down'
import DownloadCloudIcon from 'lucide-react/dist/esm/icons/download-cloud'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import WandSparklesIcon from 'lucide-react/dist/esm/icons/wand-sparkles'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Collapsible } from '@/components/disclosure'
import { Input, NativeSelect, PasswordInput, Switch, Textarea } from '@/components/form'
import { Dialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Button, CopyButton } from '@/components/ui'
import {
  fetchOidcDiscovery,
  type CustomOAuthProvider,
  type CustomOAuthProviderInput,
} from '@/features/system-settings/auth-security/custom-oauth-api'
import { OAUTH_PRESETS, joinPresetUrl } from '@/features/system-settings/auth-security/presets'
import {
  EMPTY_PROVIDER_FORM,
  providerFormToInput,
  providerToForm,
  validateProviderForm,
  type ProviderFormErrorCode,
  type ProviderFormField,
  type ProviderFormValues,
} from '@/features/system-settings/auth-security/provider-form'

type ProviderFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Absent for a new provider. */
  provider: CustomOAuthProvider | undefined
  /** `<site>/oauth/` — the callback URL is this plus the slug. */
  callbackBase: string
  isSaving: boolean
  /** The server's own sentence from the last refused submit, if any. */
  submitError: string | undefined
  onSubmit: (input: CustomOAuthProviderInput) => void
}

/**
 * Create and edit dialog for a custom OAuth provider.
 *
 * THE SECRET. `client_secret` is required when creating and optional when editing, because
 * that is exactly what the two handlers do: the create request binds it `required`, and the
 * update handler applies it only when non-empty. The API never returns a stored secret, so
 * the field opens blank on an edit and says what blank means.
 *
 * DISCOVERY runs through `POST /api/custom-oauth-provider/discovery`, which fetches the
 * document on the server. The legacy console fetched `.well-known` from the browser, which
 * fails against any identity provider that does not send CORS headers — a failure the
 * operator had no way to diagnose from the console.
 */
export function ProviderFormDialog(props: ProviderFormDialogProps) {
  const { t } = useTranslation()
  const mode = props.provider === undefined ? 'create' : 'edit'

  const [values, setValues] = useState<ProviderFormValues>(EMPTY_PROVIDER_FORM)
  const [showErrors, setShowErrors] = useState(false)
  const [presetId, setPresetId] = useState('')
  const [presetBaseUrl, setPresetBaseUrl] = useState('')
  const [discoveryBusy, setDiscoveryBusy] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | undefined>(undefined)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // The dialog is a modal snapshot of one record: it is seeded when it opens and is not
  // re-synced afterwards, so a background refetch cannot overwrite what is being typed.
  const providerId = props.provider?.id
  useEffect(() => {
    if (!props.open) return
    setValues(props.provider === undefined ? EMPTY_PROVIDER_FORM : providerToForm(props.provider))
    setShowErrors(false)
    setPresetId('')
    setPresetBaseUrl('')
    setDiscoveryError(undefined)
    setAdvancedOpen(false)
    // Re-seeding on `providerId` covers "edit A, close, edit B" without depending on the
    // object identity of a refetched row.
  }, [props.open, providerId, props.provider])

  const errorCodes = validateProviderForm(values, mode)
  const messages: Record<ProviderFormErrorCode, string> = {
    'auth-style': t('Choose one of the listed client authentication styles.'),
    'policy-json': t('The access policy must be valid JSON, or empty.'),
    required: t('This field is required.'),
    'slug-format': t('Use lowercase letters, numbers and hyphens only.'),
    'slug-reserved': t('This slug belongs to a built-in provider. Pick another.'),
    url: t('Enter a full http:// or https:// address.'),
  }

  const errorFor = (field: ProviderFormField): string | undefined => {
    if (!showErrors) return undefined
    const code = errorCodes[field]
    return code === undefined ? undefined : messages[code]
  }

  const setField = <TField extends ProviderFormField>(field: TField, value: ProviderFormValues[TField]) => {
    setValues((previous) => ({ ...previous, [field]: value }))
  }

  const applyPreset = () => {
    const preset = OAUTH_PRESETS.find((entry) => entry.id === presetId)
    if (preset === undefined) return

    setValues((previous) => ({
      ...previous,
      authorization_endpoint: joinPresetUrl(presetBaseUrl, preset.authorizationPath),
      display_name_field: preset.displayNameField,
      email_field: preset.emailField,
      icon: previous.icon === '' ? preset.icon : previous.icon,
      name: previous.name === '' ? preset.name : previous.name,
      scopes: preset.scopes,
      token_endpoint: joinPresetUrl(presetBaseUrl, preset.tokenPath),
      user_id_field: preset.userIdField,
      user_info_endpoint: joinPresetUrl(presetBaseUrl, preset.userInfoPath),
      username_field: preset.usernameField,
    }))
    toast.success(t('Preset applied. Check the endpoints before saving.'))
  }

  const runDiscovery = async () => {
    const wellKnown = values.well_known.trim()
    if (wellKnown === '') {
      setDiscoveryError(t('Enter the discovery document URL first.'))
      return
    }

    setDiscoveryBusy(true)
    setDiscoveryError(undefined)
    try {
      const result = await fetchOidcDiscovery({ wellKnownUrl: wellKnown })
      const discovery = result.discovery
      setValues((previous) => ({
        ...previous,
        authorization_endpoint: discovery.authorization_endpoint ?? previous.authorization_endpoint,
        scopes:
          discovery.scopes_supported !== undefined && discovery.scopes_supported.length > 0
            ? discovery.scopes_supported.join(' ')
            : previous.scopes,
        token_endpoint: discovery.token_endpoint ?? previous.token_endpoint,
        // The document spells it `userinfo_endpoint`; the provider record uses `user_info_endpoint`.
        user_info_endpoint: discovery.userinfo_endpoint ?? previous.user_info_endpoint,
      }))
      toast.success(t('Endpoints filled in from the discovery document.'))
    } catch (error) {
      setDiscoveryError(toErrorMessage(error))
    } finally {
      setDiscoveryBusy(false)
    }
  }

  const submit = () => {
    setShowErrors(true)
    if (Object.keys(errorCodes).length > 0) return
    props.onSubmit(providerFormToInput(values))
  }

  const slug = values.slug.trim()
  const callbackUrl = `${props.callbackBase}${slug === '' ? '<slug>' : slug}`

  const authStyleOptions = [
    { label: t('Automatic — let the client library decide'), value: '0' },
    { label: t('In the request body — client_id and client_secret as form fields'), value: '1' },
    { label: t('HTTP Basic header — Authorization: Basic'), value: '2' },
  ]

  return (
    <Dialog
      description={
        mode === 'create'
          ? t('Add an OAuth or OpenID Connect provider of your own. Users can then link it from their profile and sign in with it.')
          : t('Change how this provider is contacted and which accounts it may admit.')
      }
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)} variant="outline">
            {t('Cancel')}
          </Button>
          <Button aria-busy={props.isSaving} disabled={props.isSaving} onClick={submit}>
            {mode === 'create' ? t('Create provider') : t('Save provider')}
          </Button>
        </>
      }
      onOpenChange={props.onOpenChange}
      open={props.open}
      size="lg"
      title={mode === 'create' ? t('New OAuth provider') : t('Edit OAuth provider')}
    >
      <div className="flex flex-col gap-5">
        {props.submitError !== undefined ? (
          <Alert icon={<TriangleAlertIcon aria-hidden="true" />} title={t('The server refused this provider')} tone="destructive">
            {props.submitError}
          </Alert>
        ) : null}

        {mode === 'create' ? (
          <div className="panel-muted flex flex-col gap-3 px-4 py-3">
            <p className="eyebrow">{t('Start from a preset')}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <NativeSelect
                label={t('Provider software')}
                onChange={(event) => setPresetId(event.target.value)}
                options={OAUTH_PRESETS.map((preset) => ({ label: preset.name, value: preset.id }))}
                placeholder={t('None — enter the endpoints by hand')}
                value={presetId}
              />
              <Input
                description={t('Your installation’s root URL. The preset’s paths are appended to it.')}
                label={t('Base URL')}
                onChange={(event) => setPresetBaseUrl(event.target.value)}
                placeholder="https://git.example.com"
                value={presetBaseUrl}
              />
            </div>
            <div>
              <Button disabled={presetId === ''} onClick={applyPreset} size="sm" variant="outline">
                <WandSparklesIcon aria-hidden="true" />
                {t('Apply preset')}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <Input
            error={errorFor('name')}
            invalid={errorFor('name') !== undefined}
            label={t('Display name')}
            onChange={(event) => setField('name', event.target.value)}
            placeholder="GitHub Enterprise"
            required
            value={values.name}
          />
          <Input
            description={t('Lowercase letters, numbers and hyphens. It forms the callback path and cannot collide with a built-in provider.')}
            error={errorFor('slug')}
            invalid={errorFor('slug') !== undefined}
            label={t('Slug')}
            onChange={(event) => setField('slug', event.target.value)}
            placeholder="github-enterprise"
            required
            value={values.slug}
          />
        </div>

        <div className="panel-muted flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="text-xs text-muted">{t('Authorization callback URL')}</span>
          <span className="flex min-w-0 items-center gap-1">
            <code className="mono truncate rounded-[3px] bg-sidebar px-1.5 py-0.5 text-xs text-foreground">
              {callbackUrl}
            </code>
            <CopyButton label={t('Copy the callback URL')} size="icon-sm" value={callbackUrl} />
          </span>
        </div>

        <Switch
          checked={values.enabled}
          description={t('A disabled provider keeps its configuration and its existing links, but offers no sign-in button.')}
          label={t('Enabled')}
          onCheckedChange={(checked) => setField('enabled', checked)}
        />

        <div className="grid gap-5 md:grid-cols-2">
          <Input
            error={errorFor('client_id')}
            invalid={errorFor('client_id') !== undefined}
            label={t('Client ID')}
            onChange={(event) => setField('client_id', event.target.value)}
            required
            value={values.client_id}
          />
          <PasswordInput
            autoComplete="off"
            description={
              mode === 'create'
                ? t('Required when creating a provider.')
                : t('Leave blank to keep the stored secret. It is never sent back to the console, so this field cannot show it.')
            }
            error={errorFor('client_secret')}
            invalid={errorFor('client_secret') !== undefined}
            label={t('Client secret')}
            onChange={(event) => setField('client_secret', event.target.value)}
            placeholder={mode === 'create' ? undefined : t('Unchanged')}
            required={mode === 'create'}
            value={values.client_secret}
          />
        </div>

        {discoveryError !== undefined ? (
          <Alert
            dismissLabel={t('Dismiss the discovery error')}
            dismissible
            icon={<TriangleAlertIcon aria-hidden="true" />}
            onDismiss={() => setDiscoveryError(undefined)}
            title={t('Could not read the discovery document')}
            tone="destructive"
          >
            {discoveryError}
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3">
          <Input
            description={t('Optional. For an OpenID Connect provider, this fills the three endpoints below in one step.')}
            error={errorFor('well_known')}
            invalid={errorFor('well_known') !== undefined}
            label={t('Discovery document URL')}
            onChange={(event) => setField('well_known', event.target.value)}
            placeholder="https://idp.example.com/.well-known/openid-configuration"
            value={values.well_known}
          />
          <div>
            <Button
              aria-busy={discoveryBusy}
              disabled={discoveryBusy}
              onClick={() => void runDiscovery()}
              size="sm"
              variant="outline"
            >
              <DownloadCloudIcon aria-hidden="true" />
              {t('Fill the endpoints from discovery')}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <Input
            error={errorFor('authorization_endpoint')}
            invalid={errorFor('authorization_endpoint') !== undefined}
            label={t('Authorization endpoint')}
            onChange={(event) => setField('authorization_endpoint', event.target.value)}
            required
            value={values.authorization_endpoint}
          />
          <Input
            error={errorFor('token_endpoint')}
            invalid={errorFor('token_endpoint') !== undefined}
            label={t('Token endpoint')}
            onChange={(event) => setField('token_endpoint', event.target.value)}
            required
            value={values.token_endpoint}
          />
          <Input
            error={errorFor('user_info_endpoint')}
            invalid={errorFor('user_info_endpoint') !== undefined}
            label={t('User info endpoint')}
            onChange={(event) => setField('user_info_endpoint', event.target.value)}
            required
            value={values.user_info_endpoint}
          />
        </div>

        <Collapsible onOpenChange={setAdvancedOpen} open={advancedOpen}>
          <Collapsible.Trigger>
            <ChevronDownIcon
              aria-hidden="true"
              className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
            {t('Field mapping and advanced options')}
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <div className="flex flex-col gap-5 pt-4">
              <Input
                description={t('Space-separated. Left blank, the server stores “openid profile email”.')}
                label={t('Scopes')}
                onChange={(event) => setField('scopes', event.target.value)}
                value={values.scopes}
              />

              <div className="grid gap-5 md:grid-cols-2">
                <Input
                  description={t('Path into the user-info response, for example sub or data.user.id.')}
                  label={t('User ID field')}
                  onChange={(event) => setField('user_id_field', event.target.value)}
                  value={values.user_id_field}
                />
                <Input
                  label={t('Username field')}
                  onChange={(event) => setField('username_field', event.target.value)}
                  value={values.username_field}
                />
                <Input
                  label={t('Display name field')}
                  onChange={(event) => setField('display_name_field', event.target.value)}
                  value={values.display_name_field}
                />
                <Input
                  label={t('E-mail field')}
                  onChange={(event) => setField('email_field', event.target.value)}
                  value={values.email_field}
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <NativeSelect
                  description={t('How the client credentials are presented at the token endpoint.')}
                  label={t('Client authentication style')}
                  onChange={(event) => setField('auth_style', Number(event.target.value))}
                  options={authStyleOptions}
                  value={String(values.auth_style)}
                />
                <Input
                  description={t('An icon name for the sign-in button. Optional; a neutral mark is used when empty.')}
                  label={t('Icon name')}
                  onChange={(event) => setField('icon', event.target.value)}
                  value={values.icon}
                />
              </div>

              <Textarea
                description={t('Optional JSON rules matched against the user-info response, so only some accounts may sign in. Leave empty to admit every account the provider authenticates.')}
                error={errorFor('access_policy')}
                invalid={errorFor('access_policy') !== undefined}
                label={t('Access policy')}
                onChange={(event) => setField('access_policy', event.target.value)}
                placeholder={'{"logic":"and","conditions":[{"field":"groups","op":"contains","value":"staff"}]}'}
                rows={5}
                value={values.access_policy}
              />

              <Input
                description={t('Shown to a user the access policy turns away.')}
                label={t('Access denied message')}
                onChange={(event) => setField('access_denied_message', event.target.value)}
                value={values.access_denied_message}
              />
            </div>
          </Collapsible.Panel>
        </Collapsible>
      </div>
    </Dialog>
  )
}
