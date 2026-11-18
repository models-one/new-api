/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/overlay/ConfirmDialog'
import { CopyButton } from '@/components/ui/CopyButton'
import { DataTable } from '@/components/data/DataTable'
import { MobileCardList } from '@/components/data/MobileCardList'
import { useDataTable } from '@/components/data/use-data-table'
import { Dialog } from '@/components/overlay/Dialog'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/disclosure/Tabs'
import { intlLocale } from '@/i18n/language'
import { CHANNEL_ROOT_ROLE, useChannelsAccess } from '@/features/channels/access'
import { formatNumber } from '@/lib/format'

import {
  deleteRule,
  errorDetails,
  getPelicanStatus,
  getRules,
  getRuns,
  pelicanKeys,
  runRule,
} from './api'
import { ExecutionStatus } from './execution-status'
import { RuleEditor } from './rule-editor'
import { ServiceSettings } from './service-settings'
import { defaultRule, type PelicanRule } from './types'

export function PelicanAdmin() {
  const { t, i18n } = useTranslation()
  const locale = intlLocale(i18n.resolvedLanguage || i18n.language)
  const access = useChannelsAccess()
  const canOperate = access.can.operate
  const cache = useQueryClient()
  const [editing, setEditing] = useState<PelicanRule | null>(null)
  const [deleting, setDeleting] = useState<PelicanRule | null>(null)
  const [diagnostic, setDiagnostic] = useState('')
  const [serviceSettingsOpen, setServiceSettingsOpen] = useState(false)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const rules = useQuery({
    queryKey: ['pelican', 'rules'],
    queryFn: getRules,
    enabled: access.can.read,
  })
  const status = useQuery({
    queryKey: ['pelican', 'status'],
    queryFn: getPelicanStatus,
    enabled: access.can.read,
    staleTime: 30_000,
  })
  const runs = useQuery({
    queryKey: ['pelican', 'runs', pagination.pageIndex],
    queryFn: () => getRuns(pagination.pageIndex + 1),
    refetchInterval: 15_000,
    enabled: access.can.read,
  })
  const execute = useMutation({
    mutationFn: runRule,
    onSuccess: () => cache.invalidateQueries({ queryKey: pelicanKeys.all }),
    onError: (error) => setDiagnostic(errorDetails(error)),
  })
  const remove = useMutation({
    mutationFn: deleteRule,
    onSuccess: async () => {
      setDeleting(null)
      await cache.invalidateQueries({ queryKey: pelicanKeys.all })
    },
    onError: (error) => setDiagnostic(errorDetails(error)),
  })
  const rulesTable = useDataTable({
    data: rules.data ?? [],
    getRowId: (row) => String(row.id),
    columns: [
      {
        id: 'name',
        header: t('Name'),
        cell: ({ row: { original: rule } }) => (
          <div className="max-w-64">
            <p className="font-medium break-words">{rule.name}</p>
            <p className="text-muted text-xs break-all">
              #{rule.channel_id} / {rule.model}
            </p>
          </div>
        ),
      },
      {
        id: 'interval',
        header: t('Interval'),
        cell: ({ row: { original: rule } }) =>
          rule.interval_seconds
            ? t('Every {{minutes}} minutes', {
                minutes: formatNumber(rule.interval_seconds / 60),
              })
            : t('Manual only'),
      },
      {
        id: 'enabled',
        header: t('Status'),
        cell: ({ row: { original: rule } }) => (
          <div className="flex flex-wrap gap-1">
            <Badge>{rule.enabled ? t('Enabled') : t('Paused')}</Badge>
            {rule.published && <Badge tone="primary">{t('Visible to users')}</Badge>}
          </div>
        ),
      },
      {
        id: 'next',
        header: t('Next execution'),
        cell: ({ row: { original: rule } }) =>
          rule.next_run_at ? new Date(rule.next_run_at * 1000).toLocaleString(locale) : '—',
      },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row: { original: rule } }) => (
          <div className="flex flex-wrap gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!canOperate || execute.isPending || !status.data?.ready}
              onClick={() => execute.mutate(rule.id)}
            >
              {t('Run now')}
            </Button>
            <Button
              variant="quiet"
              size="sm"
              disabled={!canOperate}
              onClick={() => setEditing(rule)}
            >
              {t('Edit')}
            </Button>
            <Button
              variant="quiet"
              size="sm"
              disabled={!canOperate}
              onClick={() => setDeleting(rule)}
            >
              {t('Delete')}
            </Button>
          </div>
        ),
      },
    ],
  })
  const runsTable = useDataTable({
    data: runs.data?.items ?? [],
    getRowId: (row) => String(row.id),
    columns: [
      {
        id: 'target',
        header: t('Channel / model'),
        cell: ({ row: { original: run } }) => (
          <div className="max-w-72 break-words">
            {run.channel_name}
            <p className="text-muted font-mono text-xs">{run.model}</p>
          </div>
        ),
      },
      {
        id: 'time',
        header: t('Time'),
        cell: ({ row: { original: run } }) =>
          new Date(run.created_at * 1000).toLocaleString(locale),
      },
      {
        id: 'status',
        header: t('Execution status'),
        cell: ({ row: { original: run } }) => <ExecutionStatus status={run.status} />,
      },
      {
        id: 'details',
        header: t('Details'),
        cell: ({ row: { original: run } }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDiagnostic(JSON.stringify(run, null, 2))}
          >
            {t('Debug details')}
          </Button>
        ),
      },
    ],
  })

  if (access.state === 'checking') return <Spinner label={t('Checking your permissions')} />
  if (!access.can.read)
    return (
      <Alert
        tone="destructive"
        title={t('The channel:read grant is missing')}
        action={
          <Button variant="outline" onClick={access.retry}>
            {t('Retry')}
          </Button>
        }
      >
        {access.error
          ? errorDetails(access.error)
          : t(
              'Your administrator account does not hold the channel read permission, so the list cannot be requested.',
            )}
      </Alert>
    )
  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title={t('Pelican tests')}
        action={
          <>
            <Button variant="outline" render={<Link to="/pelican" />}>
              {t('View gallery')}
            </Button>
            <Button disabled={!canOperate} onClick={() => setEditing({ ...defaultRule })}>
              {t('Create test rule')}
            </Button>
          </>
        }
      />
      {status.isError && <Alert tone="destructive">{errorDetails(status.error)}</Alert>}
      <div className="bg-sunken flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="font-medium">
            {status.data?.ready
              ? t('Artifact service is ready')
              : t('Artifact service needs configuration')}
          </p>
          <p className="text-muted mt-1 text-sm">
            {t('Up to 20 artworks per group, retained for 7 days')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.role !== undefined && access.role >= CHANNEL_ROOT_ROLE && (
            <Button variant="outline" size="sm" onClick={() => setServiceSettingsOpen(true)}>
              {t('Artifact service settings')}
            </Button>
          )}
          {status.data?.error_detail && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDiagnostic(status.data?.error_detail ?? '')}
            >
              {t('Error details')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={status.isFetching}
            onClick={() => void status.refetch()}
          >
            {t('Check connection')}
          </Button>
        </div>
      </div>
      {status.data?.service_url && (
        <p className="text-muted break-all text-sm">
          {t('Artifact service URL')}: {status.data.service_url}
        </p>
      )}
      {!status.data?.ready && (
        <p className="text-muted text-sm">
          {t(
            'Set the artifact service address in service settings. Configure PELICAN_SERVICE_TOKEN and PELICAN_TEST_TOKEN_ID on the server.',
          )}
        </p>
      )}
      <Tabs defaultValue="rules">
        <Tabs.List className="overflow-y-hidden">
          <Tabs.Tab value="rules">{t('Test rules')}</Tabs.Tab>
          <Tabs.Tab value="runs">{t('Execution history')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="rules" className="mt-4">
          {rules.isLoading && <Spinner label={t('Loading')} />}
          {rules.isError && (
            <Alert
              tone="destructive"
              action={
                <Button variant="outline" onClick={() => void rules.refetch()}>
                  {t('Retry')}
                </Button>
              }
            >
              {errorDetails(rules.error)}
            </Alert>
          )}
          {!rules.isLoading && !rules.isError && (
            <>
              <DataTable
                className="hidden md:block"
                minWidthClassName="min-w-[680px]"
                table={rulesTable.table}
                label={t('Test rules')}
                emptyTitle={t('No results found')}
              />
              <MobileCardList
                className="md:hidden"
                table={rulesTable.table}
                label={t('Test rules')}
                emptyTitle={t('No results found')}
              />
            </>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="runs" className="mt-4 space-y-4">
          {runs.isLoading && <Spinner label={t('Loading')} />}
          {runs.isError && (
            <Alert
              tone="destructive"
              action={
                <Button variant="outline" onClick={() => void runs.refetch()}>
                  {t('Retry')}
                </Button>
              }
            >
              {errorDetails(runs.error)}
            </Alert>
          )}
          {!runs.isLoading && !runs.isError && (
            <>
              <DataTable
                className="hidden md:block"
                minWidthClassName="min-w-[680px]"
                table={runsTable.table}
                label={t('Execution history')}
                emptyTitle={t('No results found')}
              />
              <MobileCardList
                className="md:hidden"
                table={runsTable.table}
                label={t('Execution history')}
                emptyTitle={t('No results found')}
              />
            </>
          )}
          <Pagination
            page={pagination.pageIndex + 1}
            pageSize={20}
            total={runs.data?.total ?? 0}
            onPageChange={(page) => setPagination({ pageIndex: page - 1, pageSize: 20 })}
            compact
          />
        </Tabs.Panel>
      </Tabs>
      {serviceSettingsOpen && access.role !== undefined && access.role >= CHANNEL_ROOT_ROLE && (
        <ServiceSettings
          onClose={() => {
            setServiceSettingsOpen(false)
            void cache.invalidateQueries({ queryKey: pelicanKeys.all })
          }}
        />
      )}
      {editing && (
        <RuleEditor
          key={`${editing.id}:${editing.revision}`}
          rule={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('Delete test rule')}
        description={t(
          'Future executions stop and this rule disappears from the gallery. Existing files expire automatically.',
        )}
        destructive
        isLoading={remove.isPending}
        confirmLabel={t('Delete')}
        cancelLabel={t('Cancel')}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id)
        }}
      />
      <Dialog
        open={!!diagnostic}
        onOpenChange={(open) => {
          if (!open) setDiagnostic('')
        }}
        title={t('Debug details')}
        footer={<CopyButton value={diagnostic} label={t('Copy')} showLabel />}
      >
        <pre className="max-h-[65vh] overflow-auto font-mono text-xs break-all whitespace-pre-wrap">
          {diagnostic}
        </pre>
      </Dialog>
    </div>
  )
}
