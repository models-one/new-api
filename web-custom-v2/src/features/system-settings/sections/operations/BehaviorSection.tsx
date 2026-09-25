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
 * `/system-settings/operations/behavior` — the pure-switch reference section.
 *
 * Three keys, all verified present in `GET /api/option/` on the running dev server and
 * all holding the STRING `'false'`, which is exactly the value that reads as `true` if
 * anybody branches on the raw payload. They go through `readOptionBoolean`.
 *
 *   DefaultCollapseSidebar   'false'
 *   DemoSiteEnabled          'false'
 *   SelfUseModeEnabled       'false'
 *
 * Saving is per FIELD here: a switch IS the decision, so `commitField` writes that one
 * key the moment it is flipped and the section carries no Save button. A refusal shows in
 * the section's failure alert and the switch snaps back to the server's value, because
 * the store is re-read after every write.
 *
 * What the three flags actually do, from the backend rather than the legacy labels:
 *   DefaultCollapseSidebar  published on `/api/status` as `default_collapse_sidebar`;
 *                           nothing else in the backend reads it.
 *   DemoSiteEnabled         published as `demo_site_enabled`. The gateway takes no other
 *                           action on it — it is a presentation flag.
 *   SelfUseModeEnabled      real behaviour: `ratio_setting.GetModelRatio` returns its
 *                           37.5 fallback as a FOUND ratio when this is on, so models
 *                           with no configured price stay listed and stay billable
 *                           (`controller.ListModels`, `setting/ratio_setting/model_ratio.go`).
 */

type BehaviorDraft = {
  DefaultCollapseSidebar: boolean
  DemoSiteEnabled: boolean
  SelfUseModeEnabled: boolean
}

function toDraft(options: SystemOptionMap | undefined): BehaviorDraft {
  return {
    DefaultCollapseSidebar: readOptionBoolean(options, 'DefaultCollapseSidebar'),
    DemoSiteEnabled: readOptionBoolean(options, 'DemoSiteEnabled'),
    SelfUseModeEnabled: readOptionBoolean(options, 'SelfUseModeEnabled'),
  }
}

export function BehaviorSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<BehaviorDraft>({ saved: toDraft(optionsQuery.data) })

  const rows: { key: keyof BehaviorDraft; label: string; description: string }[] = [
    {
      description: t('New visitors get the console sidebar collapsed. Anyone who has already opened or closed it keeps their own choice.'),
      key: 'DefaultCollapseSidebar',
      label: t('Collapse the sidebar by default'),
    },
    {
      description: t('Presents this deployment as a demonstration. The gateway itself does not change behaviour; the flag is published on the status endpoint for the console to read.'),
      key: 'DemoSiteEnabled',
      label: t('Demo site mode'),
    },
    {
      description: t('Models with no configured price stay listed and stay billable, charged at the built-in fallback ratio instead of being rejected. Intended for a single-operator deployment.'),
      key: 'SelfUseModeEnabled',
      label: t('Self-use mode'),
    },
  ]

  return (
    <SettingsSection
      description={t('Deployment-wide flags that change how the console and the gateway behave.')}
      form={form}
      saveMode="field"
      title={t('System behaviour')}
    >
      <div className="flex flex-col">
        {rows.map((row) => {
          const saving = form.isFieldSaving(row.key)
          return (
            <div aria-busy={saving} key={row.key}>
              <SwitchRow
                checked={form.values[row.key]}
                description={row.description}
                disabled={optionsQuery.isPending || form.isSaving}
                label={row.label}
                onCheckedChange={(checked) => form.commitField(row.key, checked)}
              />
            </div>
          )
        })}
      </div>
    </SettingsSection>
  )
}
