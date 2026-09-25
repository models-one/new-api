import { useQuery } from '@tanstack/react-query'

import { Input, Textarea } from '@/components/form'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import { useTranslation } from 'react-i18next'

/**
 * `/system-settings/site/system-info` — the text-heavy reference section.
 *
 * Eight keys, all verified present in `GET /api/option/` on the running dev server:
 *
 *   SystemName            'New API'
 *   ServerAddress         ''
 *   Logo                  ''
 *   Footer                ''
 *   About                 '<div><h1>About Acme AI</h1>…'
 *   HomePageContent       ''
 *   legal.user_agreement  ''
 *   legal.privacy_policy  ''
 *
 * The two dotted keys are FLAT MAP KEYS. The legacy console modelled them as a nested
 * `legal: { user_agreement }` object and then had to flatten the dirty-field tree back
 * into dotted keys before writing; this form is keyed by the option key verbatim and
 * needs none of that.
 *
 * Saving is per SECTION here: these are eight text fields that are usually edited
 * together, and committing each one on blur would fire eight writes for one editing pass.
 * A refusal of any single key is reported against that key and leaves the others saved —
 * see `useOptionSectionForm`.
 */

/** Absolute http(s) URL, the shape the legacy console required of `Logo`. */
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

type SystemInfoDraft = {
  SystemName: string
  ServerAddress: string
  Logo: string
  Footer: string
  About: string
  HomePageContent: string
  'legal.user_agreement': string
  'legal.privacy_policy': string
}

function toDraft(options: SystemOptionMap | undefined): SystemInfoDraft {
  return {
    About: readOptionString(options, 'About'),
    Footer: readOptionString(options, 'Footer'),
    HomePageContent: readOptionString(options, 'HomePageContent'),
    'legal.privacy_policy': readOptionString(options, 'legal.privacy_policy'),
    'legal.user_agreement': readOptionString(options, 'legal.user_agreement'),
    Logo: readOptionString(options, 'Logo'),
    ServerAddress: readOptionString(options, 'ServerAddress'),
    // `model.InitOptionMap` seeds this from `common.SystemName`, so it is never absent
    // on a running server; the fallback covers a payload that failed to load.
    SystemName: readOptionString(options, 'SystemName'),
  }
}

/**
 * `controller.UpdateOption` stores `ServerAddress` verbatim and the backend concatenates
 * callback paths onto it, so a trailing slash produces `https://host//api/...`. The
 * legacy console strips it on save and so does this one — on the way to the server only,
 * leaving what the operator typed visible in the field.
 */
const serializeSystemInfo = {
  ServerAddress: (value: string | number | boolean) => String(value).trim().replace(/\/+$/, ''),
}

export function SystemInfoSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<SystemInfoDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializeSystemInfo,
    validate: (values) => {
      const errors: Partial<Record<keyof SystemInfoDraft, string>> = {}
      if (values.SystemName.trim() === '') errors.SystemName = t('A system name is required.')
      if (values.Logo.trim() !== '' && !isAbsoluteHttpUrl(values.Logo.trim())) {
        errors.Logo = t('Enter a full http:// or https:// address, or leave this empty.')
      }
      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving

  return (
    <SettingsSection
      description={t('The name, logo and copy this deployment presents to its users.')}
      form={form}
      note={t('“About”, the home page and the two legal documents each accept Markdown, raw HTML, or a full URL that is embedded in place.')}
      saveMode="section"
      title={t('System information')}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Input
          description={t('Shown in the browser tab, the console header and outgoing e-mail.')}
          disabled={disabled}
          error={form.errors.SystemName}
          invalid={form.errors.SystemName !== undefined}
          label={t('System name')}
          onChange={(event) => form.setField('SystemName', event.target.value)}
          required
          value={form.values.SystemName}
        />

        <Input
          description={t('The public address of this deployment. Used to build OAuth callbacks and webhook URLs, so it must be reachable from outside. A trailing slash is removed when saved.')}
          disabled={disabled}
          label={t('Server address')}
          onChange={(event) => form.setField('ServerAddress', event.target.value)}
          placeholder="https://example.com"
          value={form.values.ServerAddress}
        />

        <Input
          description={t('A full image URL. Leave empty to use the built-in mark.')}
          disabled={disabled}
          error={form.errors.Logo}
          invalid={form.errors.Logo !== undefined}
          label={t('Logo URL')}
          onChange={(event) => form.setField('Logo', event.target.value)}
          placeholder="https://example.com/logo.png"
          value={form.values.Logo}
        />

        <Textarea
          description={t('Rendered at the bottom of every page.')}
          disabled={disabled}
          label={t('Footer')}
          onChange={(event) => form.setField('Footer', event.target.value)}
          rows={4}
          value={form.values.Footer}
        />
      </div>

      <Textarea
        description={t('The content of the About page.')}
        disabled={disabled}
        label={t('About')}
        onChange={(event) => form.setField('About', event.target.value)}
        rows={5}
        value={form.values.About}
      />

      <Textarea
        description={t('Replaces the default landing page when it is not empty.')}
        disabled={disabled}
        label={t('Home page content')}
        onChange={(event) => form.setField('HomePageContent', event.target.value)}
        rows={5}
        value={form.values.HomePageContent}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Textarea
          description={t('Leave empty to drop the agreement requirement entirely.')}
          disabled={disabled}
          label={t('User agreement')}
          onChange={(event) => form.setField('legal.user_agreement', event.target.value)}
          rows={5}
          value={form.values['legal.user_agreement']}
        />

        <Textarea
          description={t('Leave empty to drop the privacy policy requirement entirely.')}
          disabled={disabled}
          label={t('Privacy policy')}
          onChange={(event) => form.setField('legal.privacy_policy', event.target.value)}
          rows={5}
          value={form.values['legal.privacy_policy']}
        />
      </div>
    </SettingsSection>
  )
}
