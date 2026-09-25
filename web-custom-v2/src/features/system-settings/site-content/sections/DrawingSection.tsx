import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { SwitchRow } from '@/components/form'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/content/drawing` — image generation and its Midjourney options.
 *
 * Six keys, all verified present in `GET /api/option/` on the running dev server:
 *
 *   DrawingEnabled               'true'   the master switch
 *   MjNotifyEnabled              'false'
 *   MjAccountFilterEnabled       'false'
 *   MjForwardUrlEnabled          'true'
 *   MjModeClearEnabled           'false'
 *   MjActionCheckSuccessEnabled  'true'
 *
 * Saving is per FIELD: each of these is a single decision, and `commitField` writes the
 * one key the moment it is flipped. A refusal snaps the switch back to what the server
 * holds, because the store is re-read after every write.
 *
 * The five `Mj*` flags are read by the Midjourney relay path, not by the console, so they
 * keep working exactly as they did whether or not this console renders a drawing page.
 * `DrawingEnabled` is the one with reach beyond that: it is published on `/api/status` as
 * `enable_drawing` and the console hides the drawing routes when it is off.
 */

type DrawingDraft = {
  DrawingEnabled: boolean
  MjNotifyEnabled: boolean
  MjAccountFilterEnabled: boolean
  MjForwardUrlEnabled: boolean
  MjModeClearEnabled: boolean
  MjActionCheckSuccessEnabled: boolean
}

function toDraft(options: SystemOptionMap | undefined): DrawingDraft {
  return {
    DrawingEnabled: readOptionBoolean(options, 'DrawingEnabled', true),
    MjAccountFilterEnabled: readOptionBoolean(options, 'MjAccountFilterEnabled'),
    MjActionCheckSuccessEnabled: readOptionBoolean(options, 'MjActionCheckSuccessEnabled', true),
    MjForwardUrlEnabled: readOptionBoolean(options, 'MjForwardUrlEnabled', true),
    MjModeClearEnabled: readOptionBoolean(options, 'MjModeClearEnabled'),
    MjNotifyEnabled: readOptionBoolean(options, 'MjNotifyEnabled'),
  }
}

export function DrawingSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<DrawingDraft>({ saved: toDraft(optionsQuery.data) })

  const rows: { key: keyof DrawingDraft; label: string; description: string }[] = [
    {
      description: t('Publishes the drawing feature on the status endpoint. With it off the console hides its drawing pages.'),
      key: 'DrawingEnabled',
      label: t('Enable drawing'),
    },
    {
      description: t('Lets the gateway hand upstream Midjourney a callback URL. That URL contains this deployment’s address, so the upstream provider learns where the server is.'),
      key: 'MjNotifyEnabled',
      label: t('Allow upstream callbacks'),
    },
    {
      description: t('Honours the accountFilter parameter, which lets a request pick which upstream account serves it.'),
      key: 'MjAccountFilterEnabled',
      label: t('Allow the account filter parameter'),
    },
    {
      description: t('Rewrites callback URLs returned by the upstream so they point back at this server instead of the provider.'),
      key: 'MjForwardUrlEnabled',
      label: t('Rewrite callback URLs to this server'),
    },
    {
      description: t('Strips the mode flags — --fast, --relax, --turbo — out of the prompt before it is forwarded.'),
      key: 'MjModeClearEnabled',
      label: t('Remove mode flags from prompts'),
    },
    {
      description: t('Refuses an upscale or variation unless the drawing it refers to actually succeeded.'),
      key: 'MjActionCheckSuccessEnabled',
      label: t('Require the original job to have succeeded'),
    },
  ]

  return (
    <SettingsSection
      description={t('Image generation and its Midjourney options.')}
      form={form}
      note={t('The five Midjourney flags are read by the relay itself, so they apply to every client of this gateway and not only to this console.')}
      saveMode="field"
      title={t('Drawing')}
    >
      <div className="flex flex-col">
        {rows.map((row) => (
          <div aria-busy={form.isFieldSaving(row.key)} key={row.key}>
            <SwitchRow
              checked={form.values[row.key]}
              description={row.description}
              disabled={optionsQuery.isPending || form.isSaving}
              label={row.label}
              onCheckedChange={(checked) => form.commitField(row.key, checked)}
            />
          </div>
        ))}
      </div>
    </SettingsSection>
  )
}
