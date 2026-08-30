import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { SwitchRow } from '@/components/form'
import { Badge } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import { NavBlobEditor } from '@/features/system-settings/site-content/NavBlobEditor'
import { compactJson } from '@/features/system-settings/site-content/option-json'
import {
  HEADER_NAV_ACCESS_KEYS,
  HEADER_NAV_DEFAULT,
  HEADER_NAV_SIMPLE_KEYS,
  parseHeaderNav,
  serializeHeaderNav,
  type HeaderNavAccessKey,
  type HeaderNavConfig,
  type HeaderNavSimpleKey,
  type NavIssue,
} from '@/features/system-settings/site-content/nav-model'

/**
 * `/system-settings/site/header-navigation` — which modules appear in the top navigation.
 *
 * ONE key, `HeaderNavModules`. `model.InitOptionMap` never seeds it — the name appears
 * nowhere in `model/option.go` — so on a fresh deployment it is simply ABSENT from
 * `GET /api/option/`, and it only turns up in the payload once somebody has written it
 * (the dev server currently returns it as `''`, which is what a write-then-clear leaves
 * behind). Absent and empty must therefore mean the same thing, and they do: "every
 * module on, none of them gated". That is the backend's own fallback in
 * `middleware.getHeaderNavAccess`, not a guess made here.
 *
 * WHAT IS ACTUALLY ENFORCED, AND WHAT IS ONLY PRESENTATION. `router/api-router.go` wraps
 * exactly two endpoints in this setting:
 *   GET /api/pricing            middleware.HeaderNavModuleAuth("pricing")
 *   GET /api/rankings           middleware.HeaderNavModuleAuth("rankings")
 *   GET /api/pricing/perf_*     middleware.HeaderNavModulePublicOrUserAuth("pricing")
 * Turning either off makes the gateway answer 403 to anyone, and "require sign-in" makes
 * it demand a session. `home`, `console`, `docs` and `about` reach no middleware at all —
 * they are published on `/api/status` for the console to hide links with, and switching
 * one off hides the link without closing anything behind it. The section says so rather
 * than presenting six switches that look equally consequential.
 */

type HeaderNavDraft = {
  HeaderNavModules: string
}

function toDraft(options: SystemOptionMap | undefined): HeaderNavDraft {
  return { HeaderNavModules: readOptionString(options, 'HeaderNavModules') }
}

export function HeaderNavigationSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const describe = (issue: NavIssue): string => {
    if (issue.kind === 'invalid-json') return t('The stored text is not valid JSON.')
    if (issue.kind === 'not-object') return t('The stored value must be a JSON object of module names.')
    return t('“{{path}}” holds something that is neither true nor false, so the gateway ignores it and falls back to the default.', { path: issue.path })
  }

  const form = useOptionSectionForm<HeaderNavDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: { HeaderNavModules: (value) => compactJson(String(value)) },
    validate: (values) => {
      const parsed = parseHeaderNav(values.HeaderNavModules)
      if (parsed.ok) return {}
      return { HeaderNavModules: describe(parsed.issue) }
    },
  })

  const parsed = parseHeaderNav(form.values.HeaderNavModules)
  const disabled = optionsQuery.isPending || form.isSaving

  const write = (next: HeaderNavConfig) =>
    form.setField('HeaderNavModules', serializeHeaderNav(next))

  const simpleLabels: Record<HeaderNavSimpleKey, { label: string; description: string }> = {
    about: {
      description: t('The About page built from the “About” setting.'),
      label: t('About'),
    },
    console: {
      description: t('The link into the signed-in console.'),
      label: t('Console'),
    },
    docs: {
      description: t('The documentation link, pointing at the address in the general settings.'),
      label: t('Docs'),
    },
    home: {
      description: t('The public landing page.'),
      label: t('Home'),
    },
  }

  const accessLabels: Record<HeaderNavAccessKey, { label: string; description: string; authLabel: string; authDescription: string }> = {
    pricing: {
      authDescription: t('Anonymous visitors get 403 from the pricing endpoint and from the model performance metrics that go with it.'),
      authLabel: t('Require sign-in for the model catalogue'),
      description: t('The public model catalogue and its prices. The gateway refuses this endpoint outright while it is off.'),
      label: t('Model catalogue'),
    },
    rankings: {
      authDescription: t('Anonymous visitors get 403 from the rankings endpoint.'),
      authLabel: t('Require sign-in for the rankings'),
      description: t('The public usage rankings. The gateway refuses this endpoint outright while it is off.'),
      label: t('Rankings'),
    },
  }

  return (
    <SettingsSection
      description={t('Which modules appear in the top navigation.')}
      form={form}
      note={t('This setting is stored without any checking by the server: an unreadable value makes the gateway fall back to showing everything, with no warning anywhere. That is why this form refuses to save one.')}
      saveMode="section"
      title={t('Header navigation')}
    >
      <NavBlobEditor
        defaults={serializeHeaderNav(HEADER_NAV_DEFAULT)}
        disabled={disabled}
        issue={parsed.ok ? undefined : describe(parsed.issue)}
        jsonDescription={t('The value exactly as the server stores it. On this deployment the key may not exist yet, in which case the box is empty and every module is on.')}
        onChange={(next) => form.setField('HeaderNavModules', next)}
        optionKey="HeaderNavModules"
        resetDescription={t('Every module is switched back on and neither the catalogue nor the rankings will require a sign-in. Nothing is sent to the server until you save.')}
        resetTitle={t('Restore the default navigation?')}
        value={form.values.HeaderNavModules}
      >
        {parsed.ok ? (
          <div className="flex flex-col gap-6">
            <div>
              <p className="eyebrow mb-2">{t('Enforced by the gateway')}</p>
              <div className="flex flex-col">
                {HEADER_NAV_ACCESS_KEYS.map((key) => {
                  const access = parsed.config[key]
                  return (
                    <div className="border-b border-border py-1 last:border-b-0" key={key}>
                      <SwitchRow
                        checked={access.enabled}
                        description={accessLabels[key].description}
                        disabled={disabled}
                        label={accessLabels[key].label}
                        onCheckedChange={(checked) =>
                          write({ ...parsed.config, [key]: { ...access, enabled: checked } })}
                      />
                      <div className="pl-6">
                        <SwitchRow
                          checked={access.requireAuth}
                          description={accessLabels[key].authDescription}
                          disabled={disabled || !access.enabled}
                          label={accessLabels[key].authLabel}
                          onCheckedChange={(checked) =>
                            write({ ...parsed.config, [key]: { ...access, requireAuth: checked } })}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="eyebrow mb-2 flex items-center gap-2">
                {t('Console links only')}
                <Badge size="sm" tone="muted">{t('not enforced server-side')}</Badge>
              </p>
              <div className="flex flex-col">
                {HEADER_NAV_SIMPLE_KEYS.map((key) => (
                  <SwitchRow
                    checked={parsed.config[key]}
                    description={simpleLabels[key].description}
                    disabled={disabled}
                    key={key}
                    label={simpleLabels[key].label}
                    onCheckedChange={(checked) => write({ ...parsed.config, [key]: checked })}
                  />
                ))}
              </div>
            </div>

            {Object.keys(parsed.config.extra).length > 0 ? (
              <p className="text-xs leading-5 text-muted">
                {t('This value also holds {{count}} setting(s) this editor does not model. They are left untouched when you save; the JSON tab shows them.', { count: Object.keys(parsed.config.extra).length })}
              </p>
            ) : null}
          </div>
        ) : null}
      </NavBlobEditor>
    </SettingsSection>
  )
}
