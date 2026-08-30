import { useQuery } from '@tanstack/react-query'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import { useTranslation } from 'react-i18next'

import { Input, NativeSelect, SwitchRow, Textarea } from '@/components/form'
import { Alert } from '@/components/ui'
import { isAbsoluteHttpUrl } from '@/features/system-settings/auth-security/oauth-config'
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
 * `/system-settings/auth/passkey` — WebAuthn / passkey sign-in.
 *
 * Seven keys, all verified present in `GET /api/option/`:
 *
 *   passkey.enabled               'false'
 *   passkey.rp_display_name       'New API'
 *   passkey.rp_id                 ''
 *   passkey.origins               ''
 *   passkey.allow_insecure_origin 'false'
 *   passkey.user_verification     'preferred'
 *   passkey.attachment_preference ''
 *
 * No secrets here, and no server-side refusal: `PUT passkey.enabled=true` is accepted on a
 * completely blank configuration (verified live). That is not the same as it working — the
 * blanks are filled in at sign-in time by `service/passkey.buildWebAuthn`:
 *
 *   rp_display_name  empty  → `common.SystemName`
 *   rp_id            empty  → the host of `ServerAddress`, then the request host
 *   origins          empty  → the request's own scheme + host
 *   user_verification empty → `preferred`
 *
 * `passkey.origins` is a COMMA-separated string (`strings.Split(originsStr, ",")`), edited
 * one per line here. An `http://` origin is REJECTED at sign-in time unless
 * `allow_insecure_origin` is on — the whole request fails with a Chinese error the user
 * sees, so the form refuses to save that combination instead.
 */

const USER_VERIFICATION_VALUES = ['required', 'preferred', 'discouraged'] as const
const ATTACHMENT_VALUES = ['', 'platform', 'cross-platform'] as const

type PasskeyDraft = {
  'passkey.enabled': boolean
  'passkey.rp_display_name': string
  'passkey.rp_id': string
  'passkey.origins': string
  'passkey.allow_insecure_origin': boolean
  'passkey.user_verification': string
  'passkey.attachment_preference': string
}

function normalizeChoice(value: string, allowed: readonly string[], fallback: string): string {
  return allowed.includes(value) ? value : fallback
}

function toDraft(options: SystemOptionMap | undefined): PasskeyDraft {
  return {
    'passkey.allow_insecure_origin': readOptionBoolean(options, 'passkey.allow_insecure_origin'),
    // An unrecognised stored value would leave the select with no matching option, so it
    // is folded back onto the backend's own default rather than shown as a phantom choice.
    'passkey.attachment_preference': normalizeChoice(
      readOptionString(options, 'passkey.attachment_preference'),
      ATTACHMENT_VALUES,
      '',
    ),
    'passkey.enabled': readOptionBoolean(options, 'passkey.enabled'),
    'passkey.origins': splitCommas(readOptionString(options, 'passkey.origins')).join('\n'),
    'passkey.rp_display_name': readOptionString(options, 'passkey.rp_display_name'),
    'passkey.rp_id': readOptionString(options, 'passkey.rp_id'),
    'passkey.user_verification': normalizeChoice(
      readOptionString(options, 'passkey.user_verification', 'preferred'),
      USER_VERIFICATION_VALUES,
      'preferred',
    ),
  }
}

const serializePasskey = {
  'passkey.origins': (value: string | number | boolean) => splitLines(String(value)).join(','),
}

export function PasskeySection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<PasskeyDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializePasskey,
    validate: (values) => {
      const errors: Partial<Record<keyof PasskeyDraft & string, string>> = {}
      const origins = splitLines(values['passkey.origins'])

      for (const origin of origins) {
        if (!isAbsoluteHttpUrl(origin)) {
          errors['passkey.origins'] = t('Every origin must be a full http:// or https:// address, with no path.')
          break
        }
        if (new URL(origin).pathname !== '/') {
          errors['passkey.origins'] = t('Every origin must be a full http:// or https:// address, with no path.')
          break
        }
        if (!values['passkey.allow_insecure_origin'] && origin.toLowerCase().startsWith('http://')) {
          errors['passkey.origins'] = t('An http:// origin is rejected at sign-in unless insecure origins are allowed below.')
          break
        }
      }

      if (values['passkey.rp_id'].includes('/') || values['passkey.rp_id'].includes(':')) {
        errors['passkey.rp_id'] = t('Use a bare domain such as example.com — no scheme, port or path.')
      }

      return errors
    },
  })

  const values = form.values
  const disabled = optionsQuery.isPending || form.isSaving

  const verificationOptions = [
    { label: t('Required — always ask for a PIN or biometric'), value: 'required' },
    { label: t('Preferred — ask when the authenticator supports it'), value: 'preferred' },
    { label: t('Discouraged — skip the extra check where possible'), value: 'discouraged' },
  ]

  const attachmentOptions = [
    { label: t('No preference — any authenticator'), value: '' },
    { label: t('Built into this device — Touch ID, Windows Hello'), value: 'platform' },
    { label: t('Removable — a security key on USB, NFC or Bluetooth'), value: 'cross-platform' },
  ]

  return (
    <SettingsSection
      description={t('Sign-in with a passkey stored on the user’s device or security key, instead of a password.')}
      form={form}
      note={t('Anything left blank is derived at sign-in time: the display name falls back to the system name, and the relying party ID and origin fall back to the server address, then to the address the request arrived on.')}
      saveMode="section"
      title={t('Passkey authentication')}
    >
      {values['passkey.allow_insecure_origin'] ? (
        <Alert
          icon={<ShieldAlertIcon aria-hidden="true" />}
          live="status"
          title={t('Insecure origins are allowed')}
          tone="warning"
        >
          {t('Passkeys over plain http:// can be intercepted, and browsers only permit it for localhost. Use this on a local development instance and nowhere else.')}
        </Alert>
      ) : null}

      <div className="flex flex-col">
        <SwitchRow
          checked={values['passkey.enabled']}
          description={t('Offer passkey sign-in and let users register one from their profile.')}
          disabled={disabled}
          label={t('Enable passkeys')}
          onCheckedChange={(checked) => form.setField('passkey.enabled', checked)}
        />
        <SwitchRow
          checked={values['passkey.allow_insecure_origin']}
          description={t('Permit http:// origins. Without this, an http:// origin makes every passkey request fail.')}
          disabled={disabled}
          label={t('Allow insecure origins')}
          onCheckedChange={(checked) => form.setField('passkey.allow_insecure_origin', checked)}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Input
          description={t('The name the browser shows in the passkey prompt. Falls back to the system name when empty.')}
          disabled={disabled}
          label={t('Relying party display name')}
          onChange={(event) => form.setField('passkey.rp_display_name', event.target.value)}
          value={values['passkey.rp_display_name']}
        />
        <Input
          description={t('The bare domain a passkey is bound to. A passkey created under one relying party ID cannot be used under another, so changing this invalidates every existing passkey.')}
          disabled={disabled}
          error={form.errors['passkey.rp_id']}
          invalid={form.errors['passkey.rp_id'] !== undefined}
          label={t('Relying party ID')}
          onChange={(event) => form.setField('passkey.rp_id', event.target.value)}
          placeholder="example.com"
          value={values['passkey.rp_id']}
        />
      </div>

      <Textarea
        description={t('One full origin per line, for example https://console.example.com. Leave empty to accept the address each request arrives on.')}
        disabled={disabled}
        error={form.errors['passkey.origins']}
        invalid={form.errors['passkey.origins'] !== undefined}
        label={t('Allowed origins')}
        onChange={(event) => form.setField('passkey.origins', event.target.value)}
        placeholder={'https://console.example.com'}
        rows={4}
        value={values['passkey.origins']}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <NativeSelect
          description={t('How hard the authenticator must work to confirm the person present.')}
          disabled={disabled}
          label={t('User verification')}
          onChange={(event) => form.setField('passkey.user_verification', event.target.value)}
          options={verificationOptions}
          value={values['passkey.user_verification']}
        />
        <NativeSelect
          description={t('Which kind of authenticator the browser should offer first.')}
          disabled={disabled}
          label={t('Authenticator type')}
          onChange={(event) => form.setField('passkey.attachment_preference', event.target.value)}
          options={attachmentOptions}
          value={values['passkey.attachment_preference']}
        />
      </div>
    </SettingsSection>
  )
}
