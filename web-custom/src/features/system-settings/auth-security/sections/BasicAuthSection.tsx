import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { SwitchRow, Textarea } from '@/components/form'
import { splitCommas, splitLines } from '@/features/system-settings/auth-security/validation'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/auth/basic-auth` — password sign-in, registration and e-mail rules.
 *
 * Seven keys, every one verified present in `GET /api/option/` on the running dev server:
 *
 *   PasswordLoginEnabled           'true'
 *   PasswordRegisterEnabled        'true'
 *   RegisterEnabled                'true'
 *   EmailVerificationEnabled       'false'
 *   EmailDomainRestrictionEnabled  'false'
 *   EmailAliasRestrictionEnabled   'false'
 *   EmailDomainWhitelist           'gmail.com,163.com,126.com,qq.com,…'
 *
 * `EmailDomainWhitelist` is COMMA-separated on the wire (`strings.Join(…, ",")` on the way
 * out, `strings.Split(value, ",")` on the way in). It is edited one domain per line and
 * joined back with commas on save, which is also what the legacy console did.
 *
 * THE SERVER'S OWN GUARD ON `EmailDomainRestrictionEnabled` IS DEAD. `controller.UpdateOption`
 * refuses to enable it while `len(common.EmailDomainWhitelist) == 0`, but the whitelist is
 * stored as `strings.Split(value, ",")`, and splitting `''` yields `[""]` — length 1. So
 * the guard can never fire after any write. Verified live: blanking the whitelist and then
 * enabling the restriction is ACCEPTED, and every e-mail domain is then rejected at
 * registration. That is why the check below is client-side and blocking: it is the only
 * thing standing between the operator and a registration form nobody can pass.
 */

type BasicAuthDraft = {
  PasswordLoginEnabled: boolean
  RegisterEnabled: boolean
  PasswordRegisterEnabled: boolean
  EmailVerificationEnabled: boolean
  EmailDomainRestrictionEnabled: boolean
  EmailAliasRestrictionEnabled: boolean
  EmailDomainWhitelist: string
}

function toDraft(options: SystemOptionMap | undefined): BasicAuthDraft {
  return {
    EmailAliasRestrictionEnabled: readOptionBoolean(options, 'EmailAliasRestrictionEnabled'),
    EmailDomainRestrictionEnabled: readOptionBoolean(options, 'EmailDomainRestrictionEnabled'),
    // Comma-separated on the wire, one per line in the control.
    EmailDomainWhitelist: splitCommas(readOptionString(options, 'EmailDomainWhitelist')).join('\n'),
    EmailVerificationEnabled: readOptionBoolean(options, 'EmailVerificationEnabled'),
    PasswordLoginEnabled: readOptionBoolean(options, 'PasswordLoginEnabled', true),
    PasswordRegisterEnabled: readOptionBoolean(options, 'PasswordRegisterEnabled', true),
    RegisterEnabled: readOptionBoolean(options, 'RegisterEnabled', true),
  }
}

const serializeBasicAuth = {
  EmailDomainWhitelist: (value: string | number | boolean) => splitLines(String(value)).join(','),
}

export function BasicAuthSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<BasicAuthDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializeBasicAuth,
    validate: (values) => {
      const errors: Partial<Record<keyof BasicAuthDraft, string>> = {}

      if (values.EmailDomainRestrictionEnabled && splitLines(values.EmailDomainWhitelist).length === 0) {
        const message = t('List at least one domain, or turn the domain restriction off — an empty whitelist rejects every address.')
        // Recorded against BOTH keys on purpose. `useOptionSectionForm` blocks a save only
        // when a key it is about to write carries an error, so switching the restriction on
        // while the whitelist is already empty would otherwise be written: the switch is the
        // only dirty key, and the error would be on the untouched textarea. The server's own
        // guard for this is dead (see the file header), so this is the only thing stopping it.
        errors.EmailDomainWhitelist = message
        errors.EmailDomainRestrictionEnabled = message
      }

      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const values = form.values

  const switches: { key: keyof BasicAuthDraft & string; label: string; description: string }[] = [
    {
      description: t('Turn this off on a deployment where every account signs in through an OAuth provider or a passkey. Existing passwords are kept, not deleted.'),
      key: 'PasswordLoginEnabled',
      label: t('Password sign-in'),
    },
    {
      description: t('Turn this off to close the deployment to new accounts entirely. It covers OAuth sign-up as well as the registration form.'),
      key: 'RegisterEnabled',
      label: t('Registration'),
    },
    {
      description: t('Allow the registration form to create an account from a username and password. With this off, new accounts can only arrive through an OAuth provider.'),
      key: 'PasswordRegisterEnabled',
      label: t('Register with a password'),
    },
    {
      description: t('Send a code to the address given at registration and require it before the account is created. Needs a working SMTP configuration.'),
      key: 'EmailVerificationEnabled',
      label: t('Verify e-mail addresses'),
    },
    {
      description: t('Reject sub-addressed e-mail such as user+tag@example.com, which is commonly used to create several accounts from one mailbox.'),
      key: 'EmailAliasRestrictionEnabled',
      label: t('Block e-mail aliases'),
    },
    {
      description: t('Accept registrations only from the domains listed below. The list is not consulted while this is off.'),
      key: 'EmailDomainRestrictionEnabled',
      label: t('Restrict e-mail domains'),
    },
  ]

  return (
    <SettingsSection
      description={t('How an account is created on this deployment, and how it proves ownership of an address.')}
      form={form}
      note={t('The whitelist is stored as one comma-separated string; it is shown one domain per line here and joined again when saved.')}
      saveMode="section"
      title={t('Basic authentication')}
    >
      <div className="flex flex-col">
        {switches.map((row) => (
          <SwitchRow
            checked={values[row.key] === true}
            description={row.description}
            disabled={disabled}
            key={row.key}
            label={row.label}
            onCheckedChange={(checked) => form.setField(row.key, checked)}
          />
        ))}
      </div>

      <Textarea
        description={t('One domain per line, without a scheme — for example example.com. Only used while the domain restriction above is on.')}
        disabled={disabled}
        error={form.errors.EmailDomainWhitelist}
        invalid={form.errors.EmailDomainWhitelist !== undefined}
        label={t('Allowed e-mail domains')}
        onChange={(event) => form.setField('EmailDomainWhitelist', event.target.value)}
        placeholder={'example.com\ncompany.com'}
        rows={6}
        value={values.EmailDomainWhitelist}
      />
    </SettingsSection>
  )
}
