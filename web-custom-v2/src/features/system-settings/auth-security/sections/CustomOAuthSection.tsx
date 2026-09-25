import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ActionsCell,
  DataTable,
  MonoCell,
  useDataTable,
  type DataTableColumns,
  type DataTableRowAction,
} from '@/components/data'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, Panel } from '@/components/ui'
import { ProviderFormDialog } from '@/features/system-settings/auth-security/components/ProviderFormDialog'
import {
  CUSTOM_OAUTH_QUERY_KEY,
  createCustomOAuthProvider,
  customOAuthProvidersQuery,
  deleteCustomOAuthProvider,
  updateCustomOAuthProvider,
  type CustomOAuthProvider,
  type CustomOAuthProviderInput,
} from '@/features/system-settings/auth-security/custom-oauth-api'
import { resolveSiteUrl } from '@/features/system-settings/auth-security/oauth-config'
import { readOptionString, systemOptionsQuery } from '@/features/system-settings/options-store'

/**
 * `/system-settings/auth/custom-oauth` — CRUD over `/api/custom-oauth-provider`.
 *
 * This section is NOT built on `SettingsSection`: it edits database records through their
 * own endpoints, not option keys, so it owns its Panel, its table and its dialogs. The
 * whole endpoint group is behind `middleware.RootAuth()`, the same guard the settings shell
 * already applied, so there is no second permission check here.
 *
 * The list endpoint returns every provider in one response with no pagination, so the table
 * is unpaginated and sorted in the browser.
 *
 * DELETE is guarded twice. The server refuses while any user is still linked to the
 * provider ("该 OAuth 提供商还有用户绑定，无法删除。请先解除所有用户绑定。"), and the console
 * puts a type-to-confirm gate in front of it: deleting a provider that users could sign in
 * through is not something to do on a mis-click.
 */
export function CustomOAuthSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const providersQuery = useQuery(customOAuthProvidersQuery())
  const optionsQuery = useQuery(systemOptionsQuery())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CustomOAuthProvider | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<CustomOAuthProvider | null>(null)
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined)

  const serverAddress = readOptionString(optionsQuery.data, 'ServerAddress').trim()
  const callbackBase = `${resolveSiteUrl(serverAddress, t('Site URL'))}/oauth/`

  const refresh = () => queryClient.invalidateQueries({ queryKey: CUSTOM_OAUTH_QUERY_KEY })

  const saveMutation = useMutation({
    mutationFn: (input: { id: number | undefined; body: CustomOAuthProviderInput }) =>
      input.id === undefined
        ? createCustomOAuthProvider(input.body)
        : updateCustomOAuthProvider(input.id, input.body),
    onError: (error: unknown) => setSubmitError(toErrorMessage(error)),
    onSuccess: (_result, input) => {
      toast.success(input.id === undefined ? t('Provider created') : t('Provider saved'))
      setDialogOpen(false)
      setSubmitError(undefined)
      void refresh()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCustomOAuthProvider(id),
    onError: (error: unknown) => setDeleteError(toErrorMessage(error)),
    onSuccess: () => {
      toast.success(t('Provider deleted'))
      setPendingDelete(null)
      setDeleteError(undefined)
      void refresh()
    },
  })

  const openCreate = () => {
    setEditing(undefined)
    setSubmitError(undefined)
    setDialogOpen(true)
  }

  const openEdit = (provider: CustomOAuthProvider) => {
    setEditing(provider)
    setSubmitError(undefined)
    setDialogOpen(true)
  }

  const columns = useMemo<DataTableColumns<CustomOAuthProvider>>(
    () => [
      {
        accessorKey: 'name',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.original.name}</p>
            <p className="mono truncate text-xs text-muted">{row.original.slug}</p>
          </div>
        ),
        header: t('Provider'),
      },
      {
        accessorKey: 'enabled',
        cell: ({ row }) => (
          <Badge tone={row.original.enabled ? 'success' : 'muted'}>
            {row.original.enabled ? t('Enabled') : t('Disabled')}
          </Badge>
        ),
        header: t('State'),
      },
      {
        accessorKey: 'client_id',
        cell: ({ row }) => <MonoCell value={row.original.client_id} />,
        header: t('Client ID'),
      },
      {
        accessorKey: 'authorization_endpoint',
        cell: ({ row }) => <MonoCell value={row.original.authorization_endpoint} />,
        header: t('Authorization endpoint'),
      },
      {
        cell: ({ row }) => {
          const actions: DataTableRowAction[] = [
            {
              icon: <PencilIcon aria-hidden="true" />,
              id: 'edit',
              label: t('Edit {{name}}', { name: row.original.name }),
              onClick: () => openEdit(row.original),
            },
            {
              icon: <Trash2Icon aria-hidden="true" />,
              id: 'delete',
              label: t('Delete {{name}}', { name: row.original.name }),
              onClick: () => {
                setDeleteError(undefined)
                setPendingDelete(row.original)
              },
              tone: 'danger',
            },
          ]
          return <ActionsCell actions={actions} label={t('Actions for {{name}}', { name: row.original.name })} />
        },
        id: 'actions',
        meta: { align: 'right' },
      },
    ],
    [t],
  )

  const { table } = useDataTable({
    columns,
    data: providersQuery.data,
    getRowId: (row) => String(row.id),
    manualSorting: false,
  })

  return (
    <Panel as="section">
      <Panel.Header
        actions={
          <Button onClick={openCreate} size="sm">
            <PlusIcon aria-hidden="true" />
            {t('Add provider')}
          </Button>
        }
        description={t('OAuth and OpenID Connect providers you define yourself, in addition to the six built-in ones.')}
        title={t('Custom OAuth providers')}
      />

      <Panel.Body className="flex flex-col gap-4" padded={false}>
        {providersQuery.isError ? (
          <div className="px-5 pt-4">
            <Alert
              action={
                <Button
                  aria-busy={providersQuery.isFetching}
                  disabled={providersQuery.isFetching}
                  onClick={() => void providersQuery.refetch()}
                  variant="outline"
                >
                  {t('Try again')}
                </Button>
              }
              icon={<TriangleAlertIcon aria-hidden="true" />}
              title={t('Could not load the custom providers')}
              tone="destructive"
            >
              {toErrorMessage(providersQuery.error)}
            </Alert>
          </div>
        ) : (
          <DataTable
            columns={columns}
            emptyAction={
              <Button onClick={openCreate} size="sm" variant="outline">
                {t('Add provider')}
              </Button>
            }
            emptyDescription={t('Add one to let people sign in through your own identity provider — a self-hosted GitLab, Keycloak, Authentik or anything else that speaks OAuth 2.')}
            emptyTitle={t('No custom providers yet')}
            isFetching={providersQuery.isFetching}
            isLoading={providersQuery.isPending}
            label={t('Custom OAuth providers')}
            loadingLabel={t('Loading custom OAuth providers')}
            minWidthClassName="min-w-[720px]"
            table={table}
          />
        )}
      </Panel.Body>

      <Panel.Footer align="start">
        <p className="text-xs leading-5 text-muted">
          {t('A provider only appears on the sign-in page once it is enabled and has a client ID and an absolute authorization endpoint. Its callback URL is the server address followed by /oauth/ and the slug.')}
        </p>
      </Panel.Footer>

      <ProviderFormDialog
        callbackBase={callbackBase}
        isSaving={saveMutation.isPending}
        onOpenChange={setDialogOpen}
        onSubmit={(body) => saveMutation.mutate({ body, id: editing?.id })}
        open={dialogOpen}
        provider={editing}
        submitError={submitError}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Delete provider')}
        confirmPhrase={pendingDelete?.slug}
        description={t('Anyone who signs in through this provider loses that route into their account. The server refuses the deletion while accounts are still linked to it.')}
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete !== null) deleteMutation.mutate(pendingDelete.id)
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
            setDeleteError(undefined)
          }
        }}
        open={pendingDelete !== null}
        title={t('Delete this OAuth provider?')}
      >
        {deleteError !== undefined ? (
          <Alert icon={<TriangleAlertIcon aria-hidden="true" />} title={t('The server refused the deletion')} tone="destructive">
            {deleteError}
          </Alert>
        ) : null}
      </ConfirmDialog>
    </Panel>
  )
}
