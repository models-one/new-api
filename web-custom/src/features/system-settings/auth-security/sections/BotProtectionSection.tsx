import { useQuery } from '@tanstack/react-query'
import InfoIcon from 'lucide-react/dist/esm/icons/info'
import { useTranslation } from 'react-i18next'

import { Input, PasswordInput, SwitchRow } from '@/components/form'
import { Alert } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/auth/bot-protection` — the Cloudflare Turnstile challenge.
 *
 * Three keys, and only ONE of them can be read back:
 *
 *   TurnstileCheckEnabled  'false'      present in GET /api/option/
 *   TurnstileSiteKey       write-only   absent — `controller.GetOptions` drops it
 *   TurnstileSecretKey     write-only   absent — same rule
 *
 * The site key is a PUBLIC value that the sign-in page embeds in the widget, but it ends
 * in `Key`, so the server's blanket suffix filter hides it like a secret. The console
 * genuinely cannot show the operator what site key is configured. Both fields therefore
 * start empty and are documented as write-only; neither claims the stored value is blank.
 *
 * ENABLE ORDERING. `controller.UpdateOption` refuses `TurnstileCheckEnabled=true` while
 * `common.TurnstileSiteKey` is empty (verified live), and `useOptionSectionForm` writes
 * dirty keys in sorted order — `TurnstileCheckEnabled` before `TurnstileSiteKey`. Doing
 * both in one Save would send the enable first and have it refused. The switch is
 * therefore held disabled while the site key has unsaved edits, so the order that fails
 * cannot be produced. Two saves, both of which succeed, beat one save with a refusal.
 *
 * Because the site key is unreadable, the section cannot tell whether one is already
 * stored, so it never blocks enabling on "the site key looks empty" — that would lock an
 * operator out of a correctly configured deployment.
 */

type BotProtectionDraft = {
  TurnstileCheckEnabled: boolean
  TurnstileSiteKey: string
  TurnstileSecretKey: string
}

function toDraft(options: SystemOptionMap | undefined): BotProtectionDraft {
  return {
    TurnstileCheckEnabled: readOptionBoolean(options, 'TurnstileCheckEnabled'),
    TurnstileSecretKey: '',
    TurnstileSiteKey: '',
  }
}

export function BotProtectionSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<BotProtectionDraft>({ saved: toDraft(optionsQuery.data) })

  const values = form.values
  const disabled = optionsQuery.isPending || form.isSaving
  const siteKeyPending = form.isFieldDirty('TurnstileSiteKey')

  const writeOnlyNote = t('Leave blank to keep the stored value. The server never sends these back, so neither field can show what is configured — an empty box does not mean an empty setting.')

  return (
    <SettingsSection
      description={t('A Cloudflare Turnstile challenge in front of sign-in, registration and password reset.')}
      form={form}
      note={writeOnlyNote}
      saveMode="section"
      title={t('Bot protection')}
    >
      <Alert icon={<InfoIcon aria-hidden="true" />} live="status" title={t('Both keys are write-only')}>
        {t('The site key is public and the secret key is not, but the settings endpoint hides every key-shaped option, so the console can write both and read neither.')}
      </Alert>

      <SwitchRow
        checked={values.TurnstileCheckEnabled}
        description={
          siteKeyPending
            ? t('Save the site key first. This setting is written before the site key, so enabling it in the same save would be refused.')
            : t('Show the challenge on the sign-in, registration and password-reset forms. The server refuses to turn this on while no site key is stored.')
        }
        disabled={disabled || siteKeyPending}
        label={t('Enable the Turnstile challenge')}
        onCheckedChange={(checked) => form.setField('TurnstileCheckEnabled', checked)}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Input
          autoComplete="off"
          description={t('From the Turnstile widget in the Cloudflare dashboard. Public — it is embedded in the sign-in page.')}
          disabled={disabled}
          label={t('Turnstile site key')}
          onChange={(event) => form.setField('TurnstileSiteKey', event.target.value)}
          placeholder={t('Unchanged')}
          value={values.TurnstileSiteKey}
        />
        <PasswordInput
          autoComplete="off"
          description={t('The matching secret from the same widget. Used server-side to verify each challenge response.')}
          disabled={disabled}
          label={t('Turnstile secret key')}
          onChange={(event) => form.setField('TurnstileSecretKey', event.target.value)}
          placeholder={t('Unchanged')}
          value={values.TurnstileSecretKey}
        />
      </div>
    </SettingsSection>
  )
}
