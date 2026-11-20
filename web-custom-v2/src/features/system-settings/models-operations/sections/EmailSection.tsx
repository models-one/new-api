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
  writeSystemOption,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/operations/email`
 *
 * SMTP or Resend; see `EmailProvider` below. The SMTP part:
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

/**
 * `EmailProvider` picks ONE way to send (`common.SendEmail`); a failed send never falls
 * back to the other. While Resend is the active method the server refuses any change that
 * would leave it without a valid key and sender (`model/option.go`), so switching to Resend
 * must store the key and sender BEFORE the provider, and switching away must store the
 * provider first. `ResendApiKey` is write-only; `ResendKeyConfigured` says whether one is set.
 */
type EmailProvider = 'smtp' | 'resend'
const PROVIDER_KEYS = ['EmailProvider', 'ResendApiKey', 'ResendFrom'] as const

function toSecurity(ssl: boolean, startTls: boolean): SmtpSecurity {
  // SSL wins if both are somehow set, matching `service/email.go`'s own precedence.
  if (ssl) return 'ssl_tls'
  if (startTls) return 'starttls'
  return 'none'
}

type EmailDraft = {
  EmailProvider: string
  ResendApiKey: string
  ResendFrom: string
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
    EmailProvider: readOptionString(options, 'EmailProvider', 'smtp') === 'resend' ? 'resend' : 'smtp',
    // Write-only, like SMTPToken: empty means "keep what is stored".
    ResendApiKey: '',
    ResendFrom: readOptionString(options, 'ResendFrom'),
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
  ResendApiKey: (value: string | number | boolean) => String(value).trim(),
  ResendFrom: (value: string | number | boolean) => String(value).trim(),
  SMTPAccount: (value: string | number | boolean) => String(value).trim(),
  SMTPFrom: (value: string | number | boolean) => String(value).trim(),
  SMTPServer: (value: string | number | boolean) => String(value).trim(),
  SMTPToken: (value: string | number | boolean) => String(value).trim(),
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EmailSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const keyStored = readOptionBoolean(optionsQuery.data, 'ResendKeyConfigured')
  const form = useOptionSectionForm<EmailDraft>({
    groupWrite: {
      keys: PROVIDER_KEYS,
      write: async (values, saved) => {
        const changed = PROVIDER_KEYS.filter((key) => String(values[key]).trim() !== String(saved[key]).trim() && !(key === 'ResendApiKey' && String(values[key]).trim() === ''))
        // Turning Resend on: its key and sender first. Otherwise the provider first.
        const order = values.EmailProvider === 'resend' ? (['ResendApiKey', 'ResendFrom', 'EmailProvider'] as const) : PROVIDER_KEYS
        for (const key of order) {
          if (changed.includes(key)) await writeSystemOption({ key, value: String(values[key]).trim() })
        }
      },
    },
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
      if (values.ResendApiKey !== '' && values.ResendApiKey.trim() === '') {
        errors.ResendApiKey = t('That is only whitespace. Clear the field to keep the stored value.')
      }
      if (values.EmailProvider === 'resend') {
        const sender = values.ResendFrom.trim()
        const address = sender.includes('<') ? sender.slice(sender.indexOf('<') + 1, sender.lastIndexOf('>')) : sender
        if (!EMAIL_PATTERN.test(address)) {
          errors.ResendFrom = t('Enter the sender as an address, or a display name with one in angle brackets.')
          errors.EmailProvider = errors.ResendFrom
        }
        if (!keyStored && values.ResendApiKey.trim() === '') {
          errors.ResendApiKey = t('No Resend API key is stored yet. Enter one to send with Resend.')
          errors.EmailProvider = errors.ResendApiKey
        }
      }
      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const provider: EmailProvider = form.values.EmailProvider === 'resend' ? 'resend' : 'smtp'
  const security = toSecurity(form.values.SMTPSSLEnabled, form.values.SMTPStartTLSEnabled)
  // Belt and braces: if the payload were ever to start carrying it, say so rather than lie.
  const tokenIsReadable = hasOption(optionsQuery.data, 'SMTPToken')

  const setSecurity = (next: SmtpSecurity) => {
    form.setField('SMTPSSLEnabled', next === 'ssl_tls')
    form.setField('SMTPStartTLSEnabled', next === 'starttls')
  }

  return (
    <SettingsSection
      description={t('How address verification, password resets and low-balance warnings are sent.')}
      form={form}
      note={provider === 'smtp' ? t('With no host configured, every feature that sends mail silently does nothing — including e-mail verification at sign-up.') : undefined}
      saveMode="section"
      title={t('E-mail')}
    >
      <RadioGroup<EmailProvider>
        disabled={disabled}
        label={t('Sending method')}
        onValueChange={(value) => form.setField('EmailProvider', value)}
        options={[
          { description: t('Your own mail server or relay.'), label: 'SMTP', value: 'smtp' },
          { description: t('Sent through the Resend API with an API key. Never falls back to SMTP.'), label: 'Resend', value: 'resend' },
        ]}
        orientation="horizontal"
        value={provider}
        variant="card"
      />

      {provider === 'resend' ? (
        <div className="grid gap-5 md:grid-cols-2">
          <PasswordInput
            autoComplete="new-password"
            description={keyStored ? t('A key is stored. Leave empty to keep it; anything you type replaces it.') : t('No key is stored yet.')}
            disabled={disabled}
            error={form.errors.ResendApiKey}
            invalid={form.errors.ResendApiKey !== undefined}
            label={t('Resend API key')}
            onChange={(event) => form.setField('ResendApiKey', event.target.value)}
            placeholder={keyStored ? t('Leave empty to keep the stored value') : 're_…'}
            value={form.values.ResendApiKey}
          />
          <Input
            autoComplete="off"
            description={t('An address on a domain verified in Resend, optionally with a display name in angle brackets.')}
            disabled={disabled}
            error={form.errors.ResendFrom}
            invalid={form.errors.ResendFrom !== undefined}
            label={t('Sender')}
            onChange={(event) => form.setField('ResendFrom', event.target.value)}
            placeholder={t('Your service name <noreply@example.com>')}
            value={form.values.ResendFrom}
          />
        </div>
      ) : (
        <>
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
              placeholder={t('Your service name <noreply@example.com>')}
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
        </>
      )}
    </SettingsSection>
  )
}
