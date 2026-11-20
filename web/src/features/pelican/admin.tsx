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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import {
  DataTablePagination,
  StaticDataTable,
  useDataTable,
} from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toIntlLocale } from '@/i18n/languages'
import { hasPermission } from '@/lib/admin-permissions'
import { formatNumber } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

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
import { defaultRule, type PelicanRule } from './types'

export function PelicanAdmin() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const user = useAuthStore((state) => state.auth.user)
  const canOperate = hasPermission(user, 'channel', 'operate')
  const cache = useQueryClient()
  const [editing, setEditing] = useState<PelicanRule | null>(null)
  const [deleting, setDeleting] = useState<PelicanRule | null>(null)
  const [diagnostic, setDiagnostic] = useState('')
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const rules = useQuery({ queryKey: ['pelican', 'rules'], queryFn: getRules })
  const status = useQuery({
    queryKey: ['pelican', 'status'],
    queryFn: getPelicanStatus,
    staleTime: 30_000,
  })
  const runs = useQuery({
    queryKey: ['pelican', 'runs', pagination.pageIndex],
    queryFn: () => getRuns(pagination.pageIndex + 1),
    refetchInterval: 15_000,
  })
  const { table } = useDataTable({
    data: runs.data?.items ?? [],
    columns: [],
    manualPagination: true,
    totalCount: runs.data?.total ?? 0,
    pagination,
    onPaginationChange: setPagination,
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
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Pelican tests')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' render={<Link to='/pelican' />}>
          {t('View gallery')}
        </Button>
        <Button
          disabled={!canOperate}
          onClick={() => setEditing({ ...defaultRule })}
        >
          {t('Create test rule')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-5 p-3 sm:p-4'>
          <div className='bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4'>
            <div>
              <p className='font-medium'>
                {status.data?.ready
                  ? t('Artifact service is ready')
                  : t('Artifact service needs configuration')}
              </p>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t('Up to 20 artworks per group, retained for 7 days')}
              </p>
            </div>
            <div className='flex gap-2'>
              {status.data?.error_detail && (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setDiagnostic(status.data?.error_detail ?? '')}
                >
                  {t('Error details')}
                </Button>
              )}
              <Button
                variant='outline'
                size='sm'
                disabled={status.isFetching}
                onClick={() => void status.refetch()}
              >
                {t('Check connection')}
              </Button>
            </div>
          </div>
          {!status.data?.ready && (
            <p className='text-muted-foreground text-sm'>
              {t(
                'Configure PELICAN_SERVICE_URL, PELICAN_SERVICE_TOKEN and PELICAN_TEST_TOKEN_ID on the server.'
              )}
            </p>
          )}
          <Tabs defaultValue='rules'>
            <TabsList>
              <TabsTrigger value='rules'>{t('Test rules')}</TabsTrigger>
              <TabsTrigger value='runs'>{t('Execution history')}</TabsTrigger>
            </TabsList>
            <TabsContent value='rules' className='mt-4'>
              {rules.isLoading && <LoadingState />}
              {rules.isError && (
                <ErrorState onRetry={() => void rules.refetch()} />
              )}
              {!rules.isLoading && !rules.isError && (
                <StaticDataTable
                  data={rules.data ?? []}
                  getRowKey={(rule) => rule.id}
                  columns={[
                    {
                      id: 'name',
                      header: t('Name'),
                      cell: (rule) => (
                        <div className='max-w-64'>
                          <p className='font-medium break-words'>{rule.name}</p>
                          <p className='text-muted-foreground text-xs break-all'>
                            #{rule.channel_id} / {rule.model}
                          </p>
                        </div>
                      ),
                    },
                    {
                      id: 'interval',
                      header: t('Interval'),
                      cell: (rule) =>
                        rule.interval_seconds
                          ? t('Every {{minutes}} minutes', {
                              minutes: formatNumber(
                                rule.interval_seconds / 60,
                                locale
                              ),
                            })
                          : t('Manual only'),
                    },
                    {
                      id: 'enabled',
                      header: t('Status'),
                      cell: (rule) => (
                        <div className='flex flex-wrap gap-1'>
                          <Badge variant='secondary'>
                            {rule.enabled ? t('Enabled') : t('Paused')}
                          </Badge>
                          {rule.published && (
                            <Badge variant='outline'>
                              {t('Visible to users')}
                            </Badge>
                          )}
                        </div>
                      ),
                    },
                    {
                      id: 'next',
                      header: t('Next execution'),
                      cell: (rule) =>
                        rule.next_run_at
                          ? new Date(rule.next_run_at * 1000).toLocaleString(
                              locale
                            )
                          : '—',
                    },
                    {
                      id: 'actions',
                      header: t('Actions'),
                      cell: (rule) => (
                        <div className='flex flex-wrap gap-1'>
                          <Button
                            variant='outline'
                            size='sm'
                            disabled={
                              !canOperate ||
                              execute.isPending ||
                              !status.data?.ready
                            }
                            onClick={() => execute.mutate(rule.id)}
                          >
                            {t('Run now')}
                          </Button>
                          <Button
                            variant='ghost'
                            size='sm'
                            disabled={!canOperate}
                            onClick={() => setEditing(rule)}
                          >
                            {t('Edit')}
                          </Button>
                          <Button
                            variant='ghost'
                            size='sm'
                            disabled={!canOperate}
                            onClick={() => setDeleting(rule)}
                          >
                            {t('Delete')}
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </TabsContent>
            <TabsContent value='runs' className='mt-4 space-y-4'>
              {runs.isLoading && <LoadingState />}
              {runs.isError && (
                <ErrorState onRetry={() => void runs.refetch()} />
              )}
              {!runs.isLoading && !runs.isError && (
                <StaticDataTable
                  data={runs.data?.items ?? []}
                  getRowKey={(run) => run.id}
                  columns={[
                    {
                      id: 'target',
                      header: t('Channel / model'),
                      cell: (run) => (
                        <div className='max-w-72 break-words'>
                          {run.channel_name}
                          <p className='text-muted-foreground font-mono text-xs'>
                            {run.model}
                          </p>
                        </div>
                      ),
                    },
                    {
                      id: 'time',
                      header: t('Time'),
                      cell: (run) =>
                        new Date(run.created_at * 1000).toLocaleString(locale),
                    },
                    {
                      id: 'status',
                      header: t('Execution status'),
                      cell: (run) => <ExecutionStatus status={run.status} />,
                    },
                    {
                      id: 'details',
                      header: t('Details'),
                      cell: (run) => (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() =>
                            setDiagnostic(JSON.stringify(run, null, 2))
                          }
                        >
                          {t('Debug details')}
                        </Button>
                      ),
                    },
                  ]}
                />
              )}
              <DataTablePagination table={table} compact />
            </TabsContent>
          </Tabs>
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
            desc={t(
              'Future executions stop and this rule disappears from the gallery. Existing files expire automatically.'
            )}
            destructive
            isLoading={remove.isPending}
            handleConfirm={() => {
              if (deleting) remove.mutate(deleting.id)
            }}
          />
          <Dialog
            open={!!diagnostic}
            onOpenChange={(open) => {
              if (!open) setDiagnostic('')
            }}
            title={t('Debug details')}
            footer={<CopyButton value={diagnostic}>{t('Copy')}</CopyButton>}
          >
            <pre className='max-h-[65vh] overflow-auto font-mono text-xs break-all whitespace-pre-wrap'>
              {diagnostic}
            </pre>
          </Dialog>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
