import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/system/EmptyState'
import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, PageHeader, Panel, Skeleton } from '@/components/ui'
import { useSystemSettingsAccess } from '@/features/system-settings/access'
import { SectionPlaceholder } from '@/features/system-settings/components/SectionPlaceholder'
import { SettingsNavLink } from '@/features/system-settings/components/SettingsNavLink'
import {
  SETTINGS_GROUPS,
  resolveSettingsLocation,
  settingsSectionPath,
} from '@/features/system-settings/groups/registry'
import { systemOptionsQuery } from '@/features/system-settings/options-store'

/**
 * The system settings shell: the role guard, the navigation over the seven groups and
 * their 41 leaf sections, and the one read of the option store every section shares.
 *
 * ROOT ONLY. `router/api-router.go` puts the whole `/api/option` group behind
 * `middleware.RootAuth()` (role 100), so an administrator at role 10 can neither read nor
 * write a single setting here. The guard renders one denial instead of letting 41 panels
 * fail — see `access.ts`.
 *
 * The URL is `/system-settings/<group>/<section>`, the same shape the legacy console
 * used, so existing bookmarks keep working. A missing or unknown segment resolves to the
 * first group and its first section rather than a 404, and the URL is left alone: the
 * routes are registered by the integrator and this page does not assume which of them
 * exist yet.
 */
export function SystemSettingsPage() {
  const { t } = useTranslation()
  const access = useSystemSettingsAccess()

  const params: Record<string, unknown> = useParams({ strict: false })
  const groupParam = typeof params.group === 'string' ? params.group : undefined
  const sectionParam = typeof params.section === 'string' ? params.section : undefined
  const { group, section } = resolveSettingsLocation(groupParam, sectionParam)

  const isRoot = access.state === 'granted'
  const optionsQuery = useQuery({ ...systemOptionsQuery(), enabled: isRoot })

  const pageTitle = t('System settings')
  const pageDescription = t('Every server-side option on this deployment, grouped the way the platform stores them. Each setting is written on its own request.')

  if (access.state === 'checking') {
    return (
      <div aria-busy="true" className="flex flex-col gap-8" role="status">
        <span className="sr-only">{t('Checking your permissions')}</span>
        <PageHeader description={pageDescription} title={pageTitle} />
      </div>
    )
  }

  if (access.state === 'unavailable') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={pageDescription} title={pageTitle} />
        <Alert
          action={
            <Button
              aria-busy={access.isRefetching}
              disabled={access.isRefetching}
              onClick={access.retry}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Could not confirm your permissions')}
          tone="destructive"
        >
          {toErrorMessage(access.error)}
        </Alert>
      </div>
    )
  }

  if (access.state === 'denied') {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={pageDescription} title={pageTitle} />
        <Alert
          icon={<ShieldAlertIcon aria-hidden="true" />}
          title={t('Root access required')}
          tone="warning"
        >
          {t('The settings endpoint is restricted to the root account, so an administrator account cannot read or change anything here.')}
        </Alert>
      </div>
    )
  }

  const SectionComponent = section.Component

  const content = ((): ReactNode => {
    if (optionsQuery.isPending) {
      return (
        <Panel as="section">
          <Panel.Body aria-busy="true" className="flex flex-col gap-4" role="status">
            <span className="sr-only">{t('Loading settings')}</span>
            <Skeleton height={20} variant="block" width="40%" />
            <Skeleton height={40} variant="block" />
            <Skeleton height={40} variant="block" />
            <Skeleton height={40} variant="block" />
          </Panel.Body>
        </Panel>
      )
    }

    if (optionsQuery.isError) {
      return (
        <Alert
          action={
            <Button
              aria-busy={optionsQuery.isFetching}
              disabled={optionsQuery.isFetching}
              onClick={() => void optionsQuery.refetch()}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('The settings could not be loaded')}
          tone="destructive"
        >
          {toErrorMessage(optionsQuery.error)}
        </Alert>
      )
    }

    if (Object.keys(optionsQuery.data ?? {}).length === 0) {
      return (
        <Panel as="section">
          <EmptyState
            description={t('The server answered with no settings at all. Nothing can be shown or changed until it returns its option list.')}
            headingLevel={2}
            title={t('This deployment reported no settings')}
          />
        </Panel>
      )
    }

    if (SectionComponent === undefined) {
      return (
        <SectionPlaceholder
          legacyPath={settingsSectionPath(group.id, section.id)}
          title={t(section.title)}
        />
      )
    }

    return <SectionComponent />
  })()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader description={pageDescription} eyebrow={t('Root only')} title={pageTitle} />

      <nav aria-label={t('Settings groups')}>
        <ul className="-mb-px flex gap-6 overflow-x-auto border-b border-border">
          {SETTINGS_GROUPS.map((candidate) => {
            const Icon = candidate.Icon
            return (
              <li key={candidate.id}>
                <SettingsNavLink
                  active={candidate.id === group.id}
                  href={settingsSectionPath(candidate.id, candidate.sections[0].id)}
                  variant="group"
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {t(candidate.title)}
                </SettingsNavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label={t('Settings sections')} className="min-w-0">
          <p className="eyebrow mb-2 px-3">{t(group.title)}</p>
          <p className="mb-3 px-3 text-xs leading-5 text-muted">{t(group.description)}</p>
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {group.sections.map((candidate) => (
              <li key={candidate.id}>
                <SettingsNavLink
                  active={candidate.id === section.id}
                  href={settingsSectionPath(group.id, candidate.id)}
                  variant="section"
                >
                  {t(candidate.title)}
                </SettingsNavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">{content}</div>
      </div>
    </div>
  )
}
