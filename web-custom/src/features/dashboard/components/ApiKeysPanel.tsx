import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ActionsCell, DataTable, MonoCell, useDataTable } from '@/components/data'
import type { DataTableColumns, DataTableRowAction } from '@/components/data'
import { ConfirmDialog, toast } from '@/components/overlay'
import { Button, CopyButton, Panel, StatusBadge, statusToTone } from '@/components/ui'
import {
  TOKEN_STATUS,
  deleteToken,
  revealTokenKey,
  tokenListQuery,
  type ApiToken,
} from '@/lib/api/tokens'
import { QueryErrorAlert } from '@/features/dashboard/components/QueryErrorAlert'

/** The dashboard shows a preview; `/settings` owns the full, paginated list. */
export const KEY_PREVIEW_SIZE = 5

const statusLabelKeys: Record<number, string> = {
  [TOKEN_STATUS.enabled]: 'Enabled',
  [TOKEN_STATUS.disabled]: 'Disabled',
  [TOKEN_STATUS.expired]: 'Expired',
  [TOKEN_STATUS.exhausted]: 'Exhausted',
}

/**
 * Owns one row's secret handling: the list endpoint only ever returns a masked
 * key, so copying means asking the server for the full value first, and deleting
 * goes through a confirmation instead of firing on the click itself.
 */
function TokenRowActions(props: { token: ApiToken }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [fullKey, setFullKey] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const reveal = useMutation({
    mutationFn: () => revealTokenKey(props.token.id),
    onSuccess: (key) => setFullKey(key),
  })

  const remove = useMutation({
    mutationFn: () => deleteToken(props.token.id),
    onSuccess: async () => {
      setConfirmOpen(false)
      toast.success(t('API key deleted'))
      await queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
  })

  const actions: DataTableRowAction[] = []
  if (fullKey === null) {
    actions.push({
      id: 'reveal',
      label: t('Retrieve key'),
      icon: <KeyRoundIcon />,
      onClick: () => reveal.mutate(),
      busy: reveal.isPending,
    })
  }
  actions.push({
    id: 'delete',
    label: t('Delete key'),
    icon: <Trash2Icon />,
    onClick: () => setConfirmOpen(true),
    tone: 'danger',
    busy: remove.isPending,
  })

  return (
    <>
      <ActionsCell actions={actions} label={t('Key actions')}>
        {fullKey === null ? null : <CopyButton label={t('Copy key')} value={fullKey} />}
      </ActionsCell>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Delete key')}
        description={t('Deleting {{name}} immediately breaks any application still using it.', {
          name: props.token.name,
        })}
        destructive
        isLoading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title={t('Delete key')}
      />
    </>
  )
}

export function ApiKeysPanel() {
  const { t } = useTranslation()
  const keys = useQuery(tokenListQuery(1, KEY_PREVIEW_SIZE))

  const columns = useMemo<DataTableColumns<ApiToken>>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: t('Key name'),
        meta: { label: t('Key name'), mobilePrimary: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'key',
        accessorKey: 'key',
        header: t('Key preview'),
        meta: { label: t('Key preview'), mono: true },
        // The list endpoint masks the middle and drops the prefix; the console re-adds it.
        cell: ({ row }) => <MonoCell className="text-muted" value={`sk-${row.original.key}`} />,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('Status'),
        meta: { label: t('Status') },
        cell: ({ row }) => {
          const labelKey = statusLabelKeys[row.original.status]
          if (labelKey === undefined) return <MonoCell value={row.original.status} />
          return (
            <StatusBadge tone={statusToTone(row.original.status)}>{t(labelKey)}</StatusBadge>
          )
        },
      },
      {
        id: 'actions',
        header: t('Actions'),
        meta: { align: 'right', label: t('Actions') },
        cell: ({ row }) => <TokenRowActions token={row.original} />,
      },
    ],
    [t],
  )

  const { table } = useDataTable<ApiToken>({
    columns,
    data: keys.data?.items,
    defaultPageSize: KEY_PREVIEW_SIZE,
    getRowId: (row) => String(row.id),
    total: keys.data?.total,
  })

  const manageKeysLink = (
    <Button render={<Link to="/settings" />} variant="quiet">
      {t('View all keys')}
    </Button>
  )

  return (
    <Panel className="overflow-hidden">
      <Panel.Header
        actions={manageKeysLink}
        description={keys.data
          ? t('Newest {{count}} of {{total}} keys', {
            count: keys.data.items.length,
            total: keys.data.total,
          })
          : undefined}
        icon={<KeyRoundIcon aria-hidden="true" className="text-primary" />}
        title={t('API keys')}
      />

      {keys.isError ? (
        <Panel.Body>
          <QueryErrorAlert
            error={keys.error}
            isRetrying={keys.isFetching}
            onRetry={() => void keys.refetch()}
          />
        </Panel.Body>
      ) : (
        <DataTable
          columns={columns}
          emptyAction={manageKeysLink}
          emptyDescription={t('Create a key to start routing requests.')}
          emptyTitle={t('No API keys yet')}
          isFetching={keys.isFetching}
          isLoading={keys.isPending}
          label={t('API keys')}
          minWidthClassName="min-w-[720px]"
          skeletonRows={KEY_PREVIEW_SIZE}
          table={table}
        />
      )}
    </Panel>
  )
}
