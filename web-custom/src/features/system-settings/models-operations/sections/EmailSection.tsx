import { useQuery } from '@tanstack/react-query'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import { useTranslation } from 'react-i18next'

import { Input, NumberInput, PasswordInput, RadioGroup, SwitchRow } from '@/components/form'
import { Alert, Separator } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  hasOption,
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/operations/email`
 *
 * Eight keys present in `GET /api/option/`, plus one that is NOT:
 *
 *   SMTPServer '' · SMTPPort '587' · SMTPAccount '' · SMTPFrom ''
 *   SMTPSSLEnabled 'false' · SMTPStartTLSEnabled 'false'
 *   SMTPInsecureSkipVerify 'false' · SMTPForceAuthLogin 'false'
 *
 *   SMTPToken  ABSENT. `controller.GetOptions` drops every key ending in `Token`, `Secret`,
 *              `Key`, `secret` or `api_key` before serialising, so the SMTP password is not
 *              masked — it is not in the payload at all. This console therefore cannot know
 *              whether one is stored, and must not claim it is empty. The field is
 *              write-only: leaving it blank changes nothing, typing into it replaces
 *              whatever the server holds.
 *
 * SSL/TLS and STARTTLS are two independent boolean keys that describe ONE choice, and
 * `SMTPSSLEnabled=true` with `SMTPStartTLSEnabled=true` is a state the backend never
 * intends. They are presented as one radio group and written as a matched pair.
 */

type SmtpSecurity = 'none' | 'ssl_tls' | 'starttls'

function toSecurity(ssl: boolean, startTls: boolean): SmtpSecurity {
  // SSL wins if both are somehow set, matching `service/email.go`'s own precedence.
  if (ssl) return 'ssl_tls'
  if (startTls) return 'starttls'
  return 'none'
}

type EmailDraft = {
  SMTPServer: string
  SMTPPort: number
  SMTPAccount: string
  SMTPFrom: string
  SMTPToken: string
  SMTPSSLEnabled: boolean
  SMTPStartTLSEnabled: boolean
  SMTPInsecureSkipVerify: boolean
  SMTPForceAuthLogin: boolean
}

function toDraft(options: SystemOptionMap | undefined): EmailDraft {
  return {
    SMTPAccount: readOptionString(options, 'SMTPAccount'),
    SMTPForceAuthLogin: readOptionBoolean(options, 'SMTPForceAuthLogin'),
    SMTPFrom: readOptionString(options, 'SMTPFrom'),
    SMTPInsecureSkipVerify: readOptionBoolean(options, 'SMTPInsecureSkipVerify'),
    SMTPPort: readOptionNumber(options, 'SMTPPort', 587),
    SMTPServer: readOptionString(options, 'SMTPServer'),
    SMTPSSLEnabled: readOptionBoolean(options, 'SMTPSSLEnabled'),
    SMTPStartTLSEnabled: readOptionBoolean(options, 'SMTPStartTLSEnabled'),
    // Always empty: the stored value can never be read back. An empty draft means
    // "unchanged", and the field is dropped from the save below when it is untouched.
    SMTPToken: '',
  }
}

const serializeEmail = {
  SMTPAccount: (value: string | number | boolean) => String(value).trim(),
  SMTPFrom: (value: string | number | boolean) => String(value).trim(),
  SMTPServer: (value: string | number | boolean) => String(value).trim(),
  SMTPToken: (value: string | number | boolean) => String(value).trim(),
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EmailSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<EmailDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializeEmail,
    validate: (values) => {
      const errors: Partial<Record<keyof EmailDraft, string>> = {}
      if (values.SMTPPort < 1 || values.SMTPPort > 65535) {
        errors.SMTPPort = t('Enter a port between 1 and 65535.')
      }
      const from = values.SMTPFrom.trim()
      // The backend also accepts `Name <address>`, so only a bare value is checked.
      if (from !== '' && !from.includes('<') && !EMAIL_PATTERN.test(from)) {
        errors.SMTPFrom = t('Enter an e-mail address, or a display name with one in angle brackets.')
      }
      // An empty field means "keep the stored password" and is never written, because it
      // matches the saved draft and so is never dirty. Whitespace does NOT match it: it goes
      // out dirty, is trimmed to '' by the serializer, and overwrites the stored credential
      // with nothing. Refuse it rather than silently unauthenticating the mail server.
      if (values.SMTPToken !== '' && values.SMTPToken.trim() === '') {
        errors.SMTPToken = t('That is only whitespace. Clear the field to keep the stored value.')
      }
      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const security = toSecurity(form.values.SMTPSSLEnabled, form.values.SMTPStartTLSEnabled)
  // Belt and braces: if the payload were ever to start carrying it, say so rather than lie.
  const tokenIsReadable = hasOption(optionsQuery.data, 'SMTPToken')

  const setSecurity = (next: SmtpSecurity) => {
    form.setField('SMTPSSLEnabled', next === 'ssl_tls')
    form.setField('SMTPStartTLSEnabled', next === 'starttls')
  }

  return (
    <SettingsSection
      description={t('The mail server used for address verification, password resets and low-balance warnings.')}
      form={form}
      note={t('With no host configured, every feature that sends mail silently does nothing — including e-mail verification at sign-up.')}
      saveMode="section"
      title={t('SMTP e-mail')}
    >
      <Input
        autoComplete="off"
        description={t('Hostname or IP of the mail server.')}
        disabled={disabled}
        label={t('SMTP host')}
        onChange={(event) => form.setField('SMTPServer', event.target.value)}
        placeholder="smtp.example.com"
        value={form.values.SMTPServer}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <NumberInput
          autoComplete="off"
          description={t('465 is the usual port for SSL/TLS, 587 for STARTTLS, 25 for an unencrypted relay.')}
          disabled={disabled}
          error={form.errors.SMTPPort}
          invalid={form.errors.SMTPPort !== undefined}
          label={t('Port')}
          max={65535}
          min={1}
          onValueChange={(value) => form.setField('SMTPPort', value ?? Number.NaN)}
          step={1}
          value={form.values.SMTPPort}
        />
        <RadioGroup<SmtpSecurity>
          description={t('Stored as two separate flags, but only one of them can be on at a time.')}
          disabled={disabled}
          label={t('Transport security')}
          onValueChange={setSecurity}
          options={[
            {
              description: t('Wraps the whole connection in TLS from the start.'),
              label: t('SSL/TLS'),
              value: 'ssl_tls',
            },
            {
              description: t('Connects in the clear and upgrades to TLS before authenticating.'),
              label: t('STARTTLS'),
              value: 'starttls',
            },
            {
              description: t('Sends credentials and mail unencrypted. Only safe on a trusted local relay.'),
              label: t('No encryption'),
              value: 'none',
            },
          ]}
          value={security}
        />
      </div>

      <Separator />

      <div className="grid gap-5 md:grid-cols-2">
        <Input
          autoComplete="off"
          description={t('The account used to authenticate with the mail server.')}
          disabled={disabled}
          label={t('Username')}
          onChange={(event) => form.setField('SMTPAccount', event.target.value)}
          placeholder="noreply@example.com"
          value={form.values.SMTPAccount}
        />
        <Input
          autoComplete="off"
          description={t('What recipients see in the From header. A display name with the address in angle brackets is accepted.')}
          disabled={disabled}
          error={form.errors.SMTPFrom}
          invalid={form.errors.SMTPFrom !== undefined}
          label={t('From address')}
          onChange={(event) => form.setField('SMTPFrom', event.target.value)}
          placeholder="Models.one <noreply@example.com>"
          value={form.values.SMTPFrom}
        />
      </div>

      <Alert icon={<KeyRoundIcon aria-hidden="true" />} title={t('The password is write-only')} tone="info">
        {tokenIsReadable
          ? t('The server is returning this credential in its settings payload. Treat it as exposed and rotate it.')
          : t('The server never returns the stored SMTP password, so this console cannot show it or tell you whether one is set. Leave the field empty to keep what is stored; anything you type replaces it.')}
      </Alert>

      <PasswordInput
        autoComplete="new-password"
        description={t('The password or app-specific token for the account above.')}
        disabled={disabled}
        error={form.errors.SMTPToken}
        invalid={form.errors.SMTPToken !== undefined}
        label={t('SMTP password or token')}
        onChange={(event) => form.setField('SMTPToken', event.target.value)}
        placeholder={t('Leave empty to keep the stored value')}
        value={form.values.SMTPToken}
      />

      <Separator />

      <SwitchRow
        checked={form.values.SMTPForceAuthLogin}
        description={t('Forces the AUTH LOGIN mechanism instead of letting the server negotiate. Needed by a few older relays that advertise mechanisms they do not accept.')}
        disabled={disabled}
        label={t('Force the AUTH LOGIN mechanism')}
        onCheckedChange={(checked) => form.setField('SMTPForceAuthLogin', checked)}
      />

      <SwitchRow
        checked={form.values.SMTPInsecureSkipVerify}
        description={t('Accepts a self-signed or mismatched certificate. This removes the guarantee that you are talking to the right mail server, so use it only on a relay you control.')}
        disabled={disabled}
        label={t('Do not verify the mail server’s certificate')}
        onCheckedChange={(checked) => form.setField('SMTPInsecureSkipVerify', checked)}
      />
    </SettingsSection>
  )
}
