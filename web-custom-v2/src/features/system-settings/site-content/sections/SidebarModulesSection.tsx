import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { SwitchRow } from '@/components/form'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import { NavBlobEditor } from '@/features/system-settings/site-content/NavBlobEditor'
import {
  defaultSidebarConfig,
  parseSidebar,
  serializeSidebar,
  setSidebarModule,
  setSidebarSection,
  type NavIssue,
} from '@/features/system-settings/site-content/nav-model'
import { compactJson } from '@/features/system-settings/site-content/option-json'

/**
 * `/system-settings/site/sidebar-modules` — which modules appear in the console sidebar.
 *
 * ONE key, `SidebarModulesAdmin`, and like `HeaderNavModules` it is NOT seeded: it is
 * absent from `GET /api/option/` on a fresh deployment, appears only once somebody has
 * written it (the dev server holds it as `''`), and comes back as `''` from
 * `/api/status`, where `controller.GetStatus` republishes it verbatim. Absent and empty
 * are the same state, and `parseSidebar` treats them that way.
 *
 * NOTHING ON THE SERVER READS THIS VALUE. It is stored, republished, and interpreted
 * entirely by the console — there is no middleware, no route guard and no validation
 * behind any of these switches. Turning "Users" off hides the sidebar entry; it does not
 * close `/api/user/`, and an administrator who knows the URL still reaches the page. The
 * section says so, because an operator could otherwise reasonably read this as access
 * control. Per-account overrides live on the user record (`sidebar_modules` in
 * `controller/user.go`), not here; this is the deployment-wide default.
 *
 * Sections and modules that are stored but unknown to this build are kept, shown with
 * their raw key, and written back untouched — a newer console may have added one, and
 * dropping it here would remove it from every sidebar on the next save.
 */

type SidebarDraft = {
  SidebarModulesAdmin: string
}

function toDraft(options: SystemOptionMap | undefined): SidebarDraft {
  return { SidebarModulesAdmin: readOptionString(options, 'SidebarModulesAdmin') }
}

export function SidebarModulesSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const describe = (issue: NavIssue): string => {
    if (issue.kind === 'invalid-json') return t('The stored text is not valid JSON.')
    if (issue.kind === 'not-object') return t('The stored value must be a JSON object of sidebar sections.')
    return t('“{{path}}” holds something that is neither true nor false, so the console cannot tell what was intended.', { path: issue.path })
  }

  const form = useOptionSectionForm<SidebarDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: { SidebarModulesAdmin: (value) => compactJson(String(value)) },
    validate: (values) => {
      const parsed = parseSidebar(values.SidebarModulesAdmin)
      if (parsed.ok) return {}
      return { SidebarModulesAdmin: describe(parsed.issue) }
    },
  })

  const parsed = parseSidebar(form.values.SidebarModulesAdmin)
  const disabled = optionsQuery.isPending || form.isSaving

  const sectionLabels: Record<string, { label: string; description: string }> = {
    admin: { description: t('Administration, visible only to administrators.'), label: t('Administration') },
    chat: { description: t('The playground and the chat clients.'), label: t('Chat') },
    console: { description: t('Usage, keys and logs.'), label: t('Console') },
    personal: { description: t('Balance and profile.'), label: t('Personal') },
  }

  const moduleLabels: Record<string, string> = {
    channel: t('Channels'),
    chat: t('Chat'),
    detail: t('Usage dashboard'),
    log: t('Request logs'),
    midjourney: t('Drawing logs'),
    models: t('Models'),
    personal: t('Profile'),
    playground: t('Playground'),
    redemption: t('Redemption codes'),
    setting: t('System settings'),
    subscription: t('Subscriptions'),
    task: t('Task logs'),
    token: t('API keys'),
    topup: t('Balance and top-up'),
    user: t('Users'),
  }

  return (
    <SettingsSection
      description={t('Which modules appear in the console sidebar.')}
      form={form}
      note={t('These switches hide navigation, they do not restrict access: the pages and the endpoints behind them stay reachable to anyone whose role allows them. The server stores this value without checking it, which is why this form validates before saving.')}
      saveMode="section"
      title={t('Sidebar modules')}
    >
      <NavBlobEditor
        defaults={serializeSidebar(defaultSidebarConfig())}
        disabled={disabled}
        issue={parsed.ok ? undefined : describe(parsed.issue)}
        jsonDescription={t('The value exactly as the server stores it. On this deployment the key may not exist yet, in which case the box is empty and every module is shown.')}
        onChange={(next) => form.setField('SidebarModulesAdmin', next)}
        optionKey="SidebarModulesAdmin"
        resetDescription={t('Every section and every module is switched back on. Nothing is sent to the server until you save.')}
        resetTitle={t('Restore the default sidebar?')}
        value={form.values.SidebarModulesAdmin}
      >
        {parsed.ok ? (
          <div className="flex flex-col gap-6">
            {parsed.config.sections.map((section) => {
              const meta = sectionLabels[section.key]
              return (
                <div className="panel-muted rounded-[4px] p-4" key={section.key}>
                  <SwitchRow
                    checked={section.enabled}
                    description={meta?.description ?? t('A sidebar section this console does not recognise. It is kept exactly as stored.')}
                    disabled={disabled}
                    label={meta?.label ?? section.key}
                    onCheckedChange={(checked) =>
                      form.setField(
                        'SidebarModulesAdmin',
                        serializeSidebar(setSidebarSection(parsed.config, section.key, checked)),
                      )}
                  />

                  <div className="mt-2 grid gap-x-6 border-t border-border pt-2 pl-6 sm:grid-cols-2">
                    {section.modules.map((module) => (
                      <SwitchRow
                        checked={module.enabled}
                        disabled={disabled || !section.enabled}
                        key={module.key}
                        label={moduleLabels[module.key] ?? module.key}
                        onCheckedChange={(checked) =>
                          form.setField(
                            'SidebarModulesAdmin',
                            serializeSidebar(
                              setSidebarModule(parsed.config, section.key, module.key, checked),
                            ),
                          )}
                      />
                    ))}
                    {section.modules.length === 0 ? (
                      <p className="py-2 text-xs text-muted">{t('This section holds no modules.')}</p>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </NavBlobEditor>
    </SettingsSection>
  )
}
