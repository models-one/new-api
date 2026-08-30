import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down'
import ArrowUpIcon from 'lucide-react/dist/esm/icons/arrow-up'
import CoinsIcon from 'lucide-react/dist/esm/icons/coins'
import EllipsisIcon from 'lucide-react/dist/esm/icons/ellipsis'
import PencilIcon from 'lucide-react/dist/esm/icons/pencil'
import PlusIcon from 'lucide-react/dist/esm/icons/plus'
import PowerIcon from 'lucide-react/dist/esm/icons/power'
import PowerOffIcon from 'lucide-react/dist/esm/icons/power-off'
import ShieldAlertIcon from 'lucide-react/dist/esm/icons/shield-alert'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import UsersIcon from 'lucide-react/dist/esm/icons/users'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ActionsCell,
  BadgeCell,
  DataTable,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  MobileCardList,
  MonoCell,
  useDataTable,
  type DataTableColumns,
  type DataTableRowAction,
} from '@/components/data'
import { NativeSelect, SearchInput, type NativeSelectOption } from '@/components/form'
import { ConfirmDialog, DropdownMenu, toErrorMessage, toast, type DropdownMenuItem } from '@/components/overlay'
import { Alert, Badge, Button, PageHeader, Panel, ProgressBar, StatusBadge } from '@/components/ui'
import { useUsersAccess } from '@/features/users/access'
import {
  deleteUser,
  EMPTY_USER_FILTERS,
  hasActiveUserFilters,
  isUserSortColumn,
  manageUser,
  MANAGE_ACTION,
  usersQuery,
  userGroupNamesQuery,
  type AdminUser,
  type ManageAction,
  type UserFilters,
} from '@/features/users/api'
import { QuotaDialog } from '@/features/users/components/QuotaDialog'
import { UserDrawer } from '@/features/users/components/UserDrawer'
import {
  DELETED_STATUS_FILTER,
  quotaShareTone,
  remainingQuotaShare,
  resolveUserActions,
  USER_ACTION_DENIAL_HINT,
  USER_ROLE,
  USER_STATE_LABEL,
  USER_STATE_TONE,
  USER_STATUS,
  userRoleLabel,
  userRoleTone,
  userRowState,
  type UserActionAvailability,
} from '@/features/users/user-presentation'
import { useQuotaPerUnit } from '@/hooks/use-server-status'
import { formatDateTime, formatNumber, formatPercent, formatQuota } from '@/lib/format'

const DEFAULT_PAGE_SIZE = 20

/** A row-level action that needs a named confirmation before it is sent. */
type PendingAction = {
  kind: 'delete' | 'demote' | 'disable'
  user: AdminUser
}

export function UsersPage() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const quotaPerUnit = useQuotaPerUnit()
  const queryClient = useQueryClient()
  const access = useUsersAccess()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [filters, setFilters] = useState<UserFilters>(EMPTY_USER_FILTERS)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUser | undefined>(undefined)
  const [quotaTarget, setQuotaTarget] = useState<AdminUser | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)

  const isAdmin = access.state === 'granted'
  const viewerRole = access.role ?? USER_ROLE.guest

  const [sortBy, setSortBy] = useState<string | undefined>(undefined)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(undefined)
  const sort = useMemo(
    () => (sortBy === undefined ? {} : { sort_by: sortBy, sort_order: sortOrder }),
    [sortBy, sortOrder],
  )

  const listQuery = useQuery({
    ...usersQuery(filters, page, pageSize, sort),
    enabled: isAdmin,
  })
  const users = listQuery.data?.items
  const total = listQuery.data?.total

  /** `GET /api/group/` feeds the group facet; it sits behind the same admin guard. */
  const groupsQuery = useQuery({ ...userGroupNamesQuery(), enabled: isAdmin })

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['users'] })
  }, [queryClient])

  const manageMutation = useMutation({
    mutationFn: (input: { id: number; action: ManageAction }) =>
      manageUser(input.id, input.action),
    onSuccess: (_data, input) => {
      const messages: Record<ManageAction, string> = {
        add_quota: t('Balance adjusted'),
        demote: t('Account demoted to a regular user'),
        disable: t('Account disabled'),
        enable: t('Account enabled'),
        promote: t('Account promoted to administrator'),
      }
      toast.success(messages[input.action])
      setPending(null)
      refresh()
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      toast.success(t('Account deleted'))
      setPending(null)
      refresh()
    },
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
  })

  const openCreate = useCallback(() => {
    setEditing(undefined)
    setDrawerOpen(true)
  }, [])

  const openEdit = useCallback((user: AdminUser) => {
    setEditing(user)
    setDrawerOpen(true)
  }, [])

  // `mutate` is referentially stable in react-query v5, so the column memo can
  // depend on it without rebuilding on every render.
  const runManage = manageMutation.mutate
  const pendingManageId = manageMutation.isPending ? manageMutation.variables?.id : undefined

  const columns = useMemo<DataTableColumns<AdminUser>>(
    () => {
      /** A control's accessible name carries the refusal when the server would decline. */
      const describe = (base: string, availability: UserActionAvailability): string => {
        if (availability.allowed || availability.denial === undefined) return base
        return t('{{action}} — {{reason}}', {
          action: base,
          reason: t(USER_ACTION_DENIAL_HINT[availability.denial]),
        })
      }

      return [
        {
          accessorKey: 'id',
          id: 'id',
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('ID')} />,
          cell: ({ row }) => <MonoCell value={row.original.id} />,
          meta: { label: t('ID'), mono: true },
        },
        {
          accessorKey: 'username',
          id: 'username',
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Account')} />,
          cell: ({ row }) => {
            const user = row.original
            const showDisplayName = user.display_name !== '' && user.display_name !== user.username
            return (
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="mono truncate font-semibold text-foreground">{user.username}</span>
                  {user.remark === undefined || user.remark === '' ? null : (
                    <Badge className="max-w-40" size="sm" title={user.remark} tone="info">
                      <span className="truncate">{user.remark}</span>
                    </Badge>
                  )}
                </span>
                {showDisplayName ? (
                  <span className="truncate text-xs text-muted">{user.display_name}</span>
                ) : null}
              </span>
            )
          },
          meta: { label: t('Account'), mobilePrimary: true },
        },
        {
          id: 'status',
          enableSorting: false,
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Status')} />,
          cell: ({ row }) => {
            const state = userRowState(row.original)
            return (
              <StatusBadge tone={USER_STATE_TONE[state]}>{t(USER_STATE_LABEL[state])}</StatusBadge>
            )
          },
          meta: { label: t('Status') },
        },
        {
          id: 'role',
          enableSorting: false,
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Role')} />,
          cell: ({ row }) => (
            <BadgeCell label={t(userRoleLabel(row.original.role))} tone={userRoleTone(row.original.role)} />
          ),
          meta: { label: t('Role') },
        },
        {
          accessorKey: 'group',
          id: 'group',
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Group')} />,
          cell: ({ row }) => <BadgeCell label={row.original.group} mono tone="muted" />,
          meta: { label: t('Group') },
        },
        {
          accessorKey: 'quota',
          id: 'quota',
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Balance')} />,
          cell: ({ row }) => {
            const user = row.original
            const lifetime = user.quota + user.used_quota
            if (lifetime === 0) return <BadgeCell label={t('Never funded')} tone="muted" />
            const share = remainingQuotaShare(user)
            return (
              <div className="flex min-w-40 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="mono text-foreground">{formatQuota(user.quota, quotaPerUnit)}</span>
                  <span className="mono text-muted">
                    {t('of {{total}}', { total: formatQuota(lifetime, quotaPerUnit) })}
                  </span>
                </div>
                <ProgressBar
                  label={t('Balance left for {{username}}', { username: user.username })}
                  size="xs"
                  tone={quotaShareTone(share)}
                  value={share}
                  valueText={formatPercent(share)}
                />
              </div>
            )
          },
          meta: { label: t('Balance') },
        },
        {
          id: 'request_count',
          enableSorting: false,
          header: ({ column }) => (
            <DataTableColumnHeader align="right" column={column} title={t('Requests')} />
          ),
          cell: ({ row }) => <MonoCell align="right" value={formatNumber(row.original.request_count)} />,
          meta: { align: 'right', label: t('Requests'), mono: true },
        },
        {
          id: 'invites',
          enableSorting: false,
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Invites')} />,
          cell: ({ row }) => {
            const user = row.original
            return (
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge size="sm" tone="muted">
                  {t('{{count}} invited', { count: user.aff_count })}
                </Badge>
                <Badge size="sm" tone="muted">
                  <span className="mono">{formatQuota(user.aff_history_quota, quotaPerUnit)}</span>
                  {t('earned')}
                </Badge>
                {user.inviter_id > 0 ? (
                  <Badge size="sm" tone="info">
                    {t('via #{{id}}', { id: user.inviter_id })}
                  </Badge>
                ) : null}
              </span>
            )
          },
          meta: { hideOnMobile: true, label: t('Invites') },
        },
        {
          accessorKey: 'created_at',
          id: 'created_at',
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Created')} />,
          cell: ({ row }) => <MonoCell value={formatDateTime(row.original.created_at, locale)} />,
          meta: { hideOnMobile: true, label: t('Created'), mono: true },
        },
        {
          accessorKey: 'last_login_at',
          id: 'last_login_at',
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Last sign-in')} />,
          cell: ({ row }) => {
            const at = row.original.last_login_at
            if (at === 0) return <MonoCell fallback={t('Never')} value={null} />
            return <MonoCell value={formatDateTime(at, locale)} />
          },
          meta: { hideOnMobile: true, label: t('Last sign-in'), mono: true },
        },
        {
          id: 'actions',
          enableSorting: false,
          header: () => <span className="sr-only">{t('Actions')}</span>,
          cell: ({ row }) => {
            const user = row.original
            const can = resolveUserActions(user, viewerRole)
            const busy = pendingManageId === user.id

            const actions: DataTableRowAction[] = [
              {
                disabled: !can.edit.allowed,
                icon: <PencilIcon />,
                id: 'edit',
                label: describe(t('Edit {{username}}', { username: user.username }), can.edit),
                onClick: () => openEdit(user),
              },
              {
                disabled: !can.quota.allowed,
                icon: <CoinsIcon />,
                id: 'quota',
                label: describe(
                  t('Adjust the balance of {{username}}', { username: user.username }),
                  can.quota,
                ),
                onClick: () => setQuotaTarget(user),
              },
            ]

            const menuItems: DropdownMenuItem[] = [
              {
                disabled: !can.enable.allowed || busy,
                icon: <PowerIcon />,
                id: 'enable',
                hint: can.enable.denial ? t(USER_ACTION_DENIAL_HINT[can.enable.denial]) : undefined,
                label: t('Enable'),
                onSelect: () => runManage({ action: MANAGE_ACTION.enable, id: user.id }),
              },
              {
                disabled: !can.disable.allowed || busy,
                icon: <PowerOffIcon />,
                id: 'disable',
                hint: can.disable.denial ? t(USER_ACTION_DENIAL_HINT[can.disable.denial]) : undefined,
                label: t('Disable'),
                onSelect: () => setPending({ kind: 'disable', user }),
              },
              {
                disabled: !can.promote.allowed || busy,
                icon: <ArrowUpIcon />,
                id: 'promote',
                hint: can.promote.denial ? t(USER_ACTION_DENIAL_HINT[can.promote.denial]) : undefined,
                label: t('Promote to admin'),
                separatorBefore: true,
                onSelect: () => runManage({ action: MANAGE_ACTION.promote, id: user.id }),
              },
              {
                disabled: !can.demote.allowed || busy,
                icon: <ArrowDownIcon />,
                id: 'demote',
                hint: can.demote.denial ? t(USER_ACTION_DENIAL_HINT[can.demote.denial]) : undefined,
                label: t('Demote to user'),
                onSelect: () => setPending({ kind: 'demote', user }),
              },
              {
                destructive: true,
                disabled: !can.delete.allowed || busy,
                icon: <Trash2Icon />,
                id: 'delete',
                hint: can.delete.denial ? t(USER_ACTION_DENIAL_HINT[can.delete.denial]) : undefined,
                label: t('Delete permanently'),
                separatorBefore: true,
                onSelect: () => setPending({ kind: 'delete', user }),
              },
            ]

            const menuLabel = t('More actions for {{username}}', { username: user.username })

            return (
              <ActionsCell
                actions={actions}
                label={t('Actions for {{username}}', { username: user.username })}
              >
                <DropdownMenu
                  items={menuItems}
                  trigger={
                    <Button aria-label={menuLabel} size="icon-md" title={menuLabel} variant="quiet">
                      <EllipsisIcon aria-hidden="true" />
                    </Button>
                  }
                />
              </ActionsCell>
            )
          },
          meta: { align: 'right', label: t('Actions') },
        },
      ]
    },
    [locale, openEdit, pendingManageId, quotaPerUnit, runManage, t, viewerRole],
  )

  const { table, paginationControls } = useDataTable<AdminUser>({
    columns,
    data: users,
    getRowId: (row) => String(row.id),
    onPageChange: (query) => {
      setPage(query.p)
      setPageSize(query.page_size)
    },
    onSortingChange: (sorting) => {
      const [first] = sorting
      // `model.NewUserSortOptions` silently falls back to `id desc` for anything
      // outside its six columns, so an unsupported id is dropped rather than sent.
      if (first === undefined || !isUserSortColumn(first.id)) {
        setSortBy(undefined)
        setSortOrder(undefined)
        return
      }
      setSortBy(first.id)
      setSortOrder(first.desc ? 'desc' : 'asc')
    },
    page,
    pageSize,
    total,
  })

  const updateFilters = (next: Partial<UserFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }))
    setPage(1)
  }

  const roleOptions: NativeSelectOption[] = [
    { value: '', label: t('All roles') },
    { value: String(USER_ROLE.common), label: t('User') },
    { value: String(USER_ROLE.admin), label: t('Admin') },
    { value: String(USER_ROLE.root), label: t('Root') },
  ]

  const statusOptions: NativeSelectOption[] = [
    { value: '', label: t('All statuses') },
    { value: String(USER_STATUS.enabled), label: t('Enabled') },
    { value: String(USER_STATUS.disabled), label: t('Disabled') },
    { value: DELETED_STATUS_FILTER, label: t('Deleted') },
  ]

  const groupOptions: NativeSelectOption[] = [
    { value: '', label: t('All groups') },
    ...(groupsQuery.data ?? []).map((group) => ({ label: group, value: group })),
  ]

  const filtered = hasActiveUserFilters(filters)
  const emptyTitle = filtered ? t('No matching accounts') : t('No accounts yet')
  const emptyDescription = filtered
    ? t('No account matches this search and these facets.')
    : t('Accounts appear here as soon as somebody registers or you create one.')

  const pageTitle = t('Users')
  const pageDescription = t('Every account on this deployment, with its role, balance and invite record.')

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
          title={t('Administrator access required')}
          tone="warning"
        >
          {t('Every account endpoint sits behind the administrator guard, so this page has nothing to show for your account.')}
        </Alert>
      </div>
    )
  }

  const confirmCopy = ((): { title: string; description: string; confirm: string } => {
    if (pending === null) return { confirm: '', description: '', title: '' }
    const username = pending.user.username
    const id = pending.user.id
    if (pending.kind === 'delete') {
      return {
        confirm: t('Delete account'),
        description: t('“{{username}}” (id {{id}}) is removed from the database for good, along with its balance. This cannot be undone.', { id, username }),
        title: t('Delete this account permanently?'),
      }
    }
    if (pending.kind === 'demote') {
      return {
        confirm: t('Demote account'),
        description: t('“{{username}}” (id {{id}}) drops to a regular user. Its administrator permissions are cleared and every signed-in session is revoked.', { id, username }),
        title: t('Demote this administrator?'),
      }
    }
    return {
      confirm: t('Disable account'),
      description: t('“{{username}}” (id {{id}}) can no longer sign in and its API keys stop working immediately. It can be enabled again later.', { id, username }),
      title: t('Disable this account?'),
    }
  })()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        action={
          <Button onClick={openCreate} variant="primary">
            <PlusIcon aria-hidden="true" />
            {t('New account')}
          </Button>
        }
        description={pageDescription}
        title={pageTitle}
      />

      <Panel className="overflow-hidden">
        <DataTableToolbar
          filters={
            <>
              <NativeSelect
                className="w-40"
                hideLabel
                label={t('Role')}
                onChange={(event) => updateFilters({ role: event.target.value })}
                options={roleOptions}
                size="sm"
                value={filters.role}
              />
              <NativeSelect
                className="w-40"
                hideLabel
                label={t('Status')}
                onChange={(event) => updateFilters({ status: event.target.value })}
                options={statusOptions}
                size="sm"
                value={filters.status}
              />
              <NativeSelect
                className="w-40"
                disabled={groupsQuery.data === undefined}
                hideLabel
                label={t('Group')}
                onChange={(event) => updateFilters({ group: event.target.value })}
                options={groupOptions}
                size="sm"
                value={filters.group}
              />
            </>
          }
          filtersLabel={t('Account facets')}
          isResetDisabled={!filtered}
          label={t('Account filters')}
          onReset={() => {
            setFilters(EMPTY_USER_FILTERS)
            setPage(1)
          }}
          search={
            <SearchInput
              debounceMs={300}
              description={t('Matches an exact id, or part of a username, display name or e-mail.')}
              hideLabel
              label={t('Search accounts')}
              onValueChange={(next) => updateFilters({ keyword: next })}
              placeholder={t('Username, name, e-mail or id')}
              size="sm"
              value={filters.keyword}
            />
          }
        />

        {listQuery.isError ? (
          <div className="p-5">
            <Alert
              action={
                <Button
                  aria-busy={listQuery.isFetching}
                  disabled={listQuery.isFetching}
                  onClick={() => void listQuery.refetch()}
                  variant="outline"
                >
                  {t('Try again')}
                </Button>
              }
              icon={<TriangleAlertIcon aria-hidden="true" />}
              title={t('Could not load the accounts')}
              tone="destructive"
            >
              {toErrorMessage(listQuery.error)}
            </Alert>
          </div>
        ) : (
          <>
            <DataTable
              className="hidden md:block"
              emptyAction={
                filtered ? undefined : (
                  <Button onClick={openCreate} variant="outline">
                    {t('New account')}
                  </Button>
                )
              }
              emptyDescription={emptyDescription}
              emptyIcon={<UsersIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={emptyTitle}
              isFetching={listQuery.isFetching}
              isLoading={listQuery.isLoading}
              label={t('Accounts')}
              loadingLabel={t('Loading accounts')}
              minWidthClassName="min-w-[96rem]"
              table={table}
            />

            <div className="p-4 md:hidden">
              <MobileCardList
                emptyDescription={emptyDescription}
                emptyIcon={<UsersIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
                emptyTitle={emptyTitle}
                isFetching={listQuery.isFetching}
                isLoading={listQuery.isLoading}
                label={t('Account cards')}
                loadingLabel={t('Loading accounts')}
                table={table}
              />
            </div>

            <DataTablePagination
              {...paginationControls}
              isFetching={listQuery.isFetching}
              label={t('Account pages')}
            />
          </>
        )}
      </Panel>

      <p className="text-xs leading-5 text-muted">
        {t('Two figures are worked out in this page rather than sent by the server. The balance meter is quota ÷ (quota + used_quota). Money is quota ÷ QUOTA_PER_UNIT ({{perUnit}}), the quota_per_unit value from /api/status. Everything else is shown exactly as the account endpoints return it.', {
          perUnit: formatNumber(quotaPerUnit),
        })}
      </p>

      <UserDrawer
        onChanged={refresh}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) setEditing(undefined)
        }}
        open={drawerOpen}
        user={editing}
        viewerRole={viewerRole}
      />

      <QuotaDialog
        onChanged={refresh}
        onOpenChange={(open) => {
          if (!open) setQuotaTarget(null)
        }}
        open={quotaTarget !== null}
        user={quotaTarget}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={confirmCopy.confirm}
        confirmPhrase={pending?.kind === 'delete' ? pending.user.username : undefined}
        description={pending === null ? undefined : confirmCopy.description}
        destructive
        isLoading={deleteMutation.isPending || manageMutation.isPending}
        onConfirm={() => {
          if (pending === null) return
          if (pending.kind === 'delete') {
            deleteMutation.mutate(pending.user.id)
            return
          }
          runManage({
            action: pending.kind === 'demote' ? MANAGE_ACTION.demote : MANAGE_ACTION.disable,
            id: pending.user.id,
          })
        }}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        open={pending !== null}
        title={confirmCopy.title}
      />
    </div>
  )
}
