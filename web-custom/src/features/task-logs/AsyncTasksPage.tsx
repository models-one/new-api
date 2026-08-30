import { useQuery } from '@tanstack/react-query'
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down'
import ChevronUpIcon from 'lucide-react/dist/esm/icons/chevron-up'
import ListChecksIcon from 'lucide-react/dist/esm/icons/list-checks'
import PowerOffIcon from 'lucide-react/dist/esm/icons/power-off'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  BadgeCell,
  DataTable,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  MobileCardList,
  MonoCell,
  TruncatedCell,
  useDataTable,
  type DataTableColumns,
} from '@/components/data'
import { NativeSelect, SearchInput, type NativeSelectOption } from '@/components/form'
import { toErrorMessage } from '@/components/overlay'
import { Alert, Button, CopyButton, DescriptionList, PageHeader, Panel, type DescriptionListItem } from '@/components/ui'
import { asyncTasksQuery, type AsyncTask, type AsyncTaskFilters } from '@/features/task-logs/api'
import {
  TaskDetailSection,
  TaskFreeText,
  TaskProgressCell,
  TaskScopeControl,
  taskRangeStartSeconds,
  type TaskTimeRangeId,
} from '@/features/task-logs/components/TaskChrome'
import {
  ASYNC_ACTION_LABELS,
  ASYNC_ACTION_VALUES,
  ASYNC_PLATFORM_VALUES,
  ASYNC_STATUS_LABELS,
  ASYNC_STATUS_VALUES,
  asyncActionTone,
  asyncPlatformLabel,
  asyncPlatformTone,
  asyncRowId,
  asyncStatusTone,
  taskDurationSeconds,
} from '@/features/task-logs/task-presentation'
import { useTaskScope } from '@/features/task-logs/use-task-scope'
import { useServerStatus } from '@/hooks/use-server-status'
import { formatDateTime, formatTime } from '@/lib/format'

const DEFAULT_PAGE_SIZE = 20

function AsyncDetailPanel(props: { task: AsyncTask; isAdminView: boolean }) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const { task, isAdminView } = props

  const duration = taskDurationSeconds(task.submit_time, task.finish_time)
  const platformName = asyncPlatformLabel(task.platform)

  const items: DescriptionListItem[] = [
    {
      id: 'task_id',
      term: t('Task ID'),
      description:
        task.task_id === '' ? (
          <span className="mono">—</span>
        ) : (
          <span className="flex items-center justify-end gap-1">
            <span className="mono truncate" title={task.task_id}>
              {task.task_id}
            </span>
            <CopyButton label={t('Copy task ID')} size="icon-xs" value={task.task_id} />
          </span>
        ),
    },
    {
      id: 'platform',
      term: t('Platform'),
      description: (
        <span className="mono">
          {platformName === undefined
            ? task.platform
            : t('{{name}} ({{raw}})', { name: platformName, raw: task.platform })}
        </span>
      ),
    },
    {
      id: 'group',
      term: t('Group'),
      description: <span className="mono">{task.group === '' ? '—' : task.group}</span>,
    },
    {
      id: 'submit_time',
      term: t('Submitted'),
      description: (
        <span className="mono">
          {task.submit_time === 0 ? '—' : formatDateTime(task.submit_time, locale)}
        </span>
      ),
    },
    {
      id: 'start_time',
      term: t('Started'),
      description: (
        <span className="mono">
          {task.start_time === 0 ? t('Not started') : formatDateTime(task.start_time, locale)}
        </span>
      ),
    },
    {
      id: 'finish_time',
      term: t('Finished'),
      description: (
        <span className="mono">
          {task.finish_time === 0 ? t('Not finished') : formatDateTime(task.finish_time, locale)}
        </span>
      ),
    },
    {
      // Derived in the browser; the formula is named rather than left implicit.
      id: 'duration',
      term: t('Duration (finish − submit)'),
      description: (
        <span className="mono">
          {duration === undefined ? '—' : t('{{seconds}}s', { seconds: duration })}
        </span>
      ),
    },
    {
      id: 'record_id',
      term: t('Record ID'),
      description: <span className="mono">{task.id}</span>,
    },
  ]

  if (isAdminView) {
    items.push({
      id: 'channel_id',
      term: t('Channel'),
      description: <span className="mono">{task.channel_id === 0 ? '—' : task.channel_id}</span>,
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-6">
        <TaskDetailSection title={t('Prompt')}>
          <TaskFreeText
            emptyLabel={t('The backend recorded no prompt for this task.')}
            value={task.properties?.input ?? ''}
          />
        </TaskDetailSection>

        <TaskDetailSection title={t('Fail reason')}>
          <TaskFreeText
            emptyLabel={t('This task did not report a failure.')}
            value={task.fail_reason}
          />
        </TaskDetailSection>
      </div>

      <TaskDetailSection title={t('Task details')}>
        <DescriptionList className="mt-3" items={items} label={t('Task details')} />
      </TaskDetailSection>
    </div>
  )
}

export function AsyncTasksPage() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const statusQuery = useServerStatus()
  const { canViewEveryone, isResolving, scope, setScope, effectiveScope } = useTaskScope()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [taskId, setTaskId] = useState('')
  const [platform, setPlatform] = useState('')
  const [status, setStatus] = useState('')
  const [action, setAction] = useState('')
  const [channelId, setChannelId] = useState('')
  const [timeRange, setTimeRange] = useState<TaskTimeRangeId>('all')
  const [startSeconds, setStartSeconds] = useState(0)

  /** `enable_task` on `GET /api/status`, mirroring `common.TaskEnabled`. */
  const taskEnabled = statusQuery.data?.enable_task !== false
  const isAdminView = effectiveScope === 'all'

  const filters = useMemo<AsyncTaskFilters>(() => {
    const next: AsyncTaskFilters = {}
    const term = taskId.trim()
    if (term !== '') next.task_id = term
    if (platform !== '') next.platform = platform
    if (status !== '') next.status = status
    if (action !== '') next.action = action
    // These timestamps compare against submit_time, which model.InitTask writes
    // in unix SECONDS — unlike the drawing table, no conversion is needed.
    if (startSeconds > 0) next.start_timestamp = startSeconds
    // GetUserTask never reads channel_id; only the admin listing filters on it.
    if (isAdminView && channelId.trim() !== '') next.channel_id = channelId.trim()
    return next
  }, [action, channelId, isAdminView, platform, startSeconds, status, taskId])

  const tasksQuery = useQuery({
    ...asyncTasksQuery(filters, page, pageSize, effectiveScope),
    enabled: taskEnabled && !isResolving,
  })
  const tasks = tasksQuery.data?.items
  const total = tasksQuery.data?.total

  const hasActiveFilters =
    taskId !== '' ||
    platform !== '' ||
    status !== '' ||
    action !== '' ||
    timeRange !== 'all' ||
    (isAdminView && channelId !== '')

  const columns = useMemo<DataTableColumns<AsyncTask>>(() => {
    const base: DataTableColumns<AsyncTask> = [
      {
        id: 'submit_time',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Submitted')} />,
        cell: ({ row }) => (
          <MonoCell
            title={row.original.submit_time === 0 ? undefined : formatDateTime(row.original.submit_time, locale)}
            value={row.original.submit_time === 0 ? null : formatTime(row.original.submit_time, locale)}
          />
        ),
        meta: { label: t('Submitted'), mono: true },
      },
      {
        id: 'platform',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Platform')} />,
        cell: ({ row }) => {
          const label = asyncPlatformLabel(row.original.platform)
          return (
            <BadgeCell
              // An unmapped value is shown verbatim: the raw channel-type number is
              // the only thing that identifies it, and "Unknown" would hide it.
              label={label ?? row.original.platform}
              mono={label === undefined}
              tone={asyncPlatformTone(row.original.platform)}
            />
          )
        },
        meta: { label: t('Platform') },
      },
      {
        id: 'action',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Action')} />,
        cell: ({ row }) => {
          const label = ASYNC_ACTION_LABELS[row.original.action]
          return (
            <BadgeCell
              label={label === undefined ? row.original.action : t(label)}
              mono={label === undefined}
              tone={asyncActionTone(row.original.action)}
            />
          )
        },
        meta: { label: t('Action') },
      },
      {
        id: 'task_id',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Task ID')} />,
        cell: ({ row }) =>
          row.original.task_id === '' ? (
            <MonoCell value={null} />
          ) : (
            <TruncatedCell maxWidthClassName="max-w-[13rem]" mono value={row.original.task_id} />
          ),
        meta: { label: t('Task ID'), mobilePrimary: true, mono: true },
      },
      {
        id: 'status',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Status')} />,
        cell: ({ row }) => {
          const label = ASYNC_STATUS_LABELS[row.original.status]
          return (
            <BadgeCell
              label={label === undefined ? row.original.status : t(label)}
              mono={label === undefined}
              tone={asyncStatusTone(row.original.status)}
            />
          )
        },
        meta: { label: t('Status') },
      },
      {
        id: 'progress',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Progress')} />,
        cell: ({ row }) => (
          <TaskProgressCell
            label={t('Progress for task {{id}}', { id: row.original.task_id || row.original.id })}
            progress={row.original.progress}
            tone={asyncStatusTone(row.original.status)}
          />
        ),
        meta: { label: t('Progress') },
      },
      {
        id: 'finish_time',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Finished')} />,
        cell: ({ row }) => (
          <MonoCell
            title={row.original.finish_time === 0 ? undefined : formatDateTime(row.original.finish_time, locale)}
            value={row.original.finish_time === 0 ? null : formatTime(row.original.finish_time, locale)}
          />
        ),
        meta: { label: t('Finished'), mono: true },
      },
    ]

    if (isAdminView) {
      base.push(
        {
          // Filled only by tasksToDto(fillUser=true); the key is absent for a
          // non-admin, so this column exists only in the admin scope.
          id: 'username',
          enableSorting: false,
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('User')} />,
          cell: ({ row }) => (
            <MonoCell
              title={t('User ID {{id}}', { id: row.original.user_id })}
              value={row.original.username ?? row.original.user_id}
            />
          ),
          meta: { label: t('User'), mono: true },
        },
        {
          // model.TaskGetAllUserTask omits this column, so a non-admin always
          // reads 0 — a withheld value, not channel zero.
          id: 'channel_id',
          enableSorting: false,
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Channel')} />,
          cell: ({ row }) => <MonoCell value={row.original.channel_id === 0 ? null : row.original.channel_id} />,
          meta: { label: t('Channel'), mono: true },
        },
      )
    }

    base.push(
      {
        id: 'fail_reason',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Fail reason')} />,
        cell: ({ row }) =>
          row.original.fail_reason === '' ? (
            <MonoCell value={null} />
          ) : (
            <TruncatedCell
              className="text-destructive"
              maxWidthClassName="max-w-[16rem]"
              value={row.original.fail_reason}
            />
          ),
        meta: { label: t('Fail reason') },
      },
      {
        id: 'expander',
        enableSorting: false,
        header: () => <span className="sr-only">{t('Details')}</span>,
        cell: ({ row }) => (
          <Button
            aria-expanded={row.getIsExpanded()}
            aria-label={t('Toggle task details')}
            onClick={() => row.toggleExpanded()}
            size="icon-md"
            title={t('Toggle task details')}
            variant="quiet"
          >
            {row.getIsExpanded() ? (
              <ChevronUpIcon aria-hidden="true" />
            ) : (
              <ChevronDownIcon aria-hidden="true" />
            )}
          </Button>
        ),
        meta: { align: 'right', label: t('Details') },
      },
    )

    return base
  }, [isAdminView, locale, t])

  const { table, paginationControls } = useDataTable<AsyncTask>({
    columns,
    data: tasks,
    enableExpanding: true,
    getRowId: asyncRowId,
    onPageChange: (query) => {
      setPage(query.p)
      setPageSize(query.page_size)
    },
    page,
    pageSize,
    total,
  })

  const platformOptions: NativeSelectOption[] = [
    { value: '', label: t('All platforms') },
    ...ASYNC_PLATFORM_VALUES.map((value) => {
      return { value, label: asyncPlatformLabel(value) ?? value }
    }),
  ]

  const statusOptions: NativeSelectOption[] = [
    { value: '', label: t('All statuses') },
    ...ASYNC_STATUS_VALUES.map((value) => ({ value, label: t(ASYNC_STATUS_LABELS[value] ?? value) })),
  ]

  const actionOptions: NativeSelectOption[] = [
    { value: '', label: t('All actions') },
    ...ASYNC_ACTION_VALUES.map((value) => ({ value, label: t(ASYNC_ACTION_LABELS[value] ?? value) })),
  ]

  const timeRangeOptions: NativeSelectOption[] = [
    { value: 'all', label: t('All time') },
    { value: '24h', label: t('Last 24 hours') },
    { value: '7d', label: t('Last 7 days') },
    { value: '30d', label: t('Last 30 days') },
  ]

  const handleTimeRangeChange = (next: TaskTimeRangeId) => {
    setTimeRange(next)
    setStartSeconds(taskRangeStartSeconds(next))
    setPage(1)
  }

  const handleReset = () => {
    setTaskId('')
    setPlatform('')
    setStatus('')
    setAction('')
    setChannelId('')
    handleTimeRangeChange('all')
  }

  const description = t('Long-running jobs — music, lyrics and video — that the gateway polls until the provider finishes them.')

  if (statusQuery.data !== undefined && !taskEnabled) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={description} title={t('Async tasks')} />
        <Alert
          icon={<PowerOffIcon aria-hidden="true" />}
          title={t('Async tasks are turned off')}
          tone="warning"
        >
          {t('An administrator has disabled asynchronous tasks on this deployment, so no jobs can be submitted or listed.')}
        </Alert>
      </div>
    )
  }

  const emptyTitle = hasActiveFilters ? t('No matching tasks') : t('No async tasks yet')

  /**
   * Three distinct empty states: filtered out, an idle deployment, and an account
   * that has never run a job. The seeded instance shows the last two, so they have
   * to read as a real answer rather than as a broken table.
   */
  let emptyDescription = t('You have not submitted an asynchronous job yet. Music and video requests you send through the API appear here.')
  if (hasActiveFilters) {
    emptyDescription = t('No task matches these filters.')
  } else if (isAdminView) {
    emptyDescription = t('No asynchronous job has run on this deployment yet. Suno, Kling and the other video providers appear here once someone submits one.')
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader description={description} title={t('Async tasks')} />

      <Panel className="overflow-hidden">
        <DataTableToolbar
          actions={
            canViewEveryone ? (
              <TaskScopeControl
                disabled={isResolving}
                label={t('Task scope')}
                onChange={(next) => {
                  setScope(next)
                  setPage(1)
                }}
                scope={scope}
              />
            ) : undefined
          }
          filters={
            <>
              <NativeSelect
                className="w-36"
                hideLabel
                label={t('Platform')}
                onChange={(event) => {
                  setPlatform(event.target.value)
                  setPage(1)
                }}
                options={platformOptions}
                size="sm"
                value={platform}
              />
              <NativeSelect
                className="w-36"
                hideLabel
                label={t('Status')}
                onChange={(event) => {
                  setStatus(event.target.value)
                  setPage(1)
                }}
                options={statusOptions}
                size="sm"
                value={status}
              />
              <NativeSelect
                className="w-44"
                hideLabel
                label={t('Action')}
                onChange={(event) => {
                  setAction(event.target.value)
                  setPage(1)
                }}
                options={actionOptions}
                size="sm"
                value={action}
              />
              <NativeSelect
                className="w-36"
                hideLabel
                label={t('Time range')}
                onChange={(event) => handleTimeRangeChange(event.target.value as TaskTimeRangeId)}
                options={timeRangeOptions}
                size="sm"
                value={timeRange}
              />
              {isAdminView ? (
                <SearchInput
                  className="w-36"
                  debounceMs={300}
                  hideLabel
                  label={t('Channel ID')}
                  onValueChange={(next) => {
                    setChannelId(next)
                    setPage(1)
                  }}
                  placeholder={t('Channel ID')}
                  size="sm"
                  value={channelId}
                />
              ) : null}
            </>
          }
          filtersLabel={t('Async task filters')}
          isResetDisabled={!hasActiveFilters}
          label={t('Async task filters')}
          onReset={handleReset}
          search={
            <SearchInput
              debounceMs={300}
              description={t('Exact match on the task ID.')}
              hideLabel
              label={t('Task ID')}
              onValueChange={(next) => {
                setTaskId(next)
                setPage(1)
              }}
              placeholder={t('Exact task ID')}
              size="sm"
              value={taskId}
            />
          }
        />

        {tasksQuery.isError ? (
          <div className="p-5">
            <Alert
              action={
                <Button
                  aria-busy={tasksQuery.isFetching}
                  disabled={tasksQuery.isFetching}
                  onClick={() => void tasksQuery.refetch()}
                  variant="outline"
                >
                  {t('Try again')}
                </Button>
              }
              icon={<TriangleAlertIcon aria-hidden="true" />}
              title={t('Could not load tasks')}
              tone="destructive"
            >
              {toErrorMessage(tasksQuery.error)}
            </Alert>
          </div>
        ) : (
          <>
            <DataTable
              className="hidden md:block"
              emptyDescription={emptyDescription}
              emptyIcon={<ListChecksIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={emptyTitle}
              isFetching={tasksQuery.isFetching}
              isLoading={tasksQuery.isLoading || isResolving}
              label={t('Async tasks')}
              loadingLabel={t('Loading tasks')}
              minWidthClassName={isAdminView ? 'min-w-[88rem]' : 'min-w-[72rem]'}
              renderExpandedRow={(row) => (
                <AsyncDetailPanel isAdminView={isAdminView} task={row.original} />
              )}
              table={table}
            />

            <div className="p-4 md:hidden">
              <MobileCardList
                emptyDescription={emptyDescription}
                emptyIcon={<ListChecksIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
                emptyTitle={emptyTitle}
                isFetching={tasksQuery.isFetching}
                isLoading={tasksQuery.isLoading || isResolving}
                label={t('Async task cards')}
                loadingLabel={t('Loading tasks')}
                renderExpandedRow={(row) => (
                  <AsyncDetailPanel isAdminView={isAdminView} task={row.original} />
                )}
                table={table}
              />
            </div>

            <DataTablePagination
              {...paginationControls}
              isFetching={tasksQuery.isFetching}
              label={t('Async task pages')}
            />
          </>
        )}
      </Panel>
    </div>
  )
}
