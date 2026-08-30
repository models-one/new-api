import { useQuery } from '@tanstack/react-query'
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down'
import ChevronUpIcon from 'lucide-react/dist/esm/icons/chevron-up'
import ImageIcon from 'lucide-react/dist/esm/icons/image'
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
import { drawingTasksQuery, type DrawingTask, type DrawingTaskFilters } from '@/features/task-logs/api'
import {
  TaskDetailSection,
  TaskFreeText,
  TaskProgressCell,
  TaskScopeControl,
  TaskUrlValue,
  taskRangeStartSeconds,
  type TaskTimeRangeId,
} from '@/features/task-logs/components/TaskChrome'
import {
  DRAWING_ACTION_LABELS,
  DRAWING_STATUS_LABELS,
  DRAWING_SUBMIT_CODE_LABELS,
  drawingActionTone,
  drawingRowId,
  drawingStatusTone,
  drawingSubmitCodeTone,
  drawingTimeToSeconds,
  secondsToDrawingTime,
  taskDurationSeconds,
} from '@/features/task-logs/task-presentation'
import { useTaskScope } from '@/features/task-logs/use-task-scope'
import { useServerStatus } from '@/hooks/use-server-status'
import { formatDateTime, formatTime } from '@/lib/format'

const DEFAULT_PAGE_SIZE = 20

function DrawingDetailPanel(props: { task: DrawingTask }) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const { task } = props

  const submitSeconds = drawingTimeToSeconds(task.submit_time)
  const startSeconds = drawingTimeToSeconds(task.start_time)
  const finishSeconds = drawingTimeToSeconds(task.finish_time)
  const duration = taskDurationSeconds(submitSeconds, finishSeconds)

  const timingItems: DescriptionListItem[] = [
    {
      id: 'submit_time',
      term: t('Submitted'),
      description: (
        <span className="mono">
          {submitSeconds === 0 ? '—' : formatDateTime(submitSeconds, locale)}
        </span>
      ),
    },
    {
      id: 'start_time',
      term: t('Started'),
      description: (
        <span className="mono">
          {startSeconds === 0 ? t('Not started') : formatDateTime(startSeconds, locale)}
        </span>
      ),
    },
    {
      id: 'finish_time',
      term: t('Finished'),
      description: (
        <span className="mono">
          {finishSeconds === 0 ? t('Not finished') : formatDateTime(finishSeconds, locale)}
        </span>
      ),
    },
    {
      // Derived in the browser, so the formula is spelled out rather than implied.
      id: 'duration',
      term: t('Duration (finish − submit)'),
      description: (
        <span className="mono">
          {duration === undefined ? '—' : t('{{seconds}}s', { seconds: duration })}
        </span>
      ),
    },
    {
      id: 'mj_id',
      term: t('Task ID'),
      description:
        task.mj_id === '' ? (
          <span className="mono">—</span>
        ) : (
          <span className="flex items-center justify-end gap-1">
            <span className="mono truncate" title={task.mj_id}>
              {task.mj_id}
            </span>
            <CopyButton label={t('Copy task ID')} size="icon-xs" value={task.mj_id} />
          </span>
        ),
    },
    {
      id: 'row_id',
      term: t('Record ID'),
      description: <span className="mono">{task.id}</span>,
    },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-6">
        <TaskDetailSection title={t('Prompt')}>
          <TaskFreeText
            emptyLabel={t('This task recorded no prompt.')}
            value={task.prompt}
          />
        </TaskDetailSection>

        {task.prompt_en !== '' && task.prompt_en !== task.prompt ? (
          <TaskDetailSection title={t('Prompt (translated upstream)')}>
            <TaskFreeText emptyLabel={t('No translated prompt.')} value={task.prompt_en} />
          </TaskDetailSection>
        ) : null}

        {task.description.trim() !== '' ? (
          <TaskDetailSection title={t('Description')}>
            <TaskFreeText emptyLabel={t('No description.')} value={task.description} />
          </TaskDetailSection>
        ) : null}

        <TaskDetailSection title={t('Fail reason')}>
          <TaskFreeText
            emptyLabel={t('This task did not report a failure.')}
            value={task.fail_reason}
          />
        </TaskDetailSection>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <TaskDetailSection title={t('Timing and identifiers')}>
          <DescriptionList className="mt-3" items={timingItems} label={t('Timing and identifiers')} />
        </TaskDetailSection>

        <TaskDetailSection title={t('Image')}>
          <div className="mt-3">
            {task.image_url === '' ? (
              <p className="text-sm leading-6 text-muted">{t('This task produced no image URL.')}</p>
            ) : (
              <>
                <TaskUrlValue
                  copyLabel={t('Copy image URL')}
                  openLabel={t('Open the image in a new tab')}
                  url={task.image_url}
                />
                <p className="mt-2 text-xs leading-5 text-muted">
                  {t('The address is shown as text. The console never loads or renders content returned by the upstream provider.')}
                </p>
              </>
            )}
          </div>
        </TaskDetailSection>

        {task.video_url !== '' ? (
          <TaskDetailSection title={t('Video')}>
            <div className="mt-3">
              <TaskUrlValue
                copyLabel={t('Copy video URL')}
                openLabel={t('Open the video in a new tab')}
                url={task.video_url}
              />
            </div>
          </TaskDetailSection>
        ) : null}
      </div>
    </div>
  )
}

export function DrawingTasksPage() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const statusQuery = useServerStatus()
  const { canViewEveryone, isResolving, scope, setScope, effectiveScope } = useTaskScope()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [taskId, setTaskId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [timeRange, setTimeRange] = useState<TaskTimeRangeId>('all')
  const [startSeconds, setStartSeconds] = useState(0)

  /**
   * `enable_drawing` on `GET /api/status` mirrors `common.DrawingEnabled`. The
   * routes should not be registered at all when it is off; this in-page notice is
   * the backstop for a deployment that flips the option while a tab is open.
   */
  const drawingEnabled = statusQuery.data?.enable_drawing !== false
  const isAdminView = effectiveScope === 'all'

  const filters = useMemo<DrawingTaskFilters>(() => {
    const next: DrawingTaskFilters = {}
    const term = taskId.trim()
    if (term !== '') next.mj_id = term
    // `/api/mj/*` compares start_timestamp against submit_time, which is stored
    // in MILLISECONDS. Sending seconds here would silently match every row.
    if (startSeconds > 0) next.start_timestamp = secondsToDrawingTime(startSeconds)
    // GetUserMidjourney never reads channel_id, so it would be a dead control
    // outside the admin scope.
    if (isAdminView && channelId.trim() !== '') next.channel_id = channelId.trim()
    return next
  }, [channelId, isAdminView, startSeconds, taskId])

  const tasksQuery = useQuery({
    ...drawingTasksQuery(filters, page, pageSize, effectiveScope),
    enabled: drawingEnabled && !isResolving,
  })
  const tasks = tasksQuery.data?.items
  const total = tasksQuery.data?.total

  const hasActiveFilters =
    taskId !== '' || timeRange !== 'all' || (isAdminView && channelId !== '')

  const columns = useMemo<DataTableColumns<DrawingTask>>(() => {
    const base: DataTableColumns<DrawingTask> = [
      {
        id: 'submit_time',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Submitted')} />,
        cell: ({ row }) => {
          const seconds = drawingTimeToSeconds(row.original.submit_time)
          return (
            <MonoCell
              title={seconds === 0 ? undefined : formatDateTime(seconds, locale)}
              value={seconds === 0 ? null : formatTime(seconds, locale)}
            />
          )
        },
        meta: { label: t('Submitted'), mono: true },
      },
      {
        id: 'action',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Type')} />,
        cell: ({ row }) => {
          const label = DRAWING_ACTION_LABELS[row.original.action]
          return (
            <BadgeCell
              label={label === undefined ? row.original.action : t(label)}
              mono={label === undefined}
              tone={drawingActionTone(row.original.action)}
            />
          )
        },
        meta: { label: t('Type') },
      },
      {
        id: 'mj_id',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Task ID')} />,
        cell: ({ row }) =>
          row.original.mj_id === '' ? (
            <MonoCell value={null} />
          ) : (
            <TruncatedCell maxWidthClassName="max-w-[11rem]" mono value={row.original.mj_id} />
          ),
        meta: { label: t('Task ID'), mobilePrimary: true, mono: true },
      },
      {
        id: 'code',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Submit result')} />,
        cell: ({ row }) => {
          const label = DRAWING_SUBMIT_CODE_LABELS[row.original.code]
          return (
            <BadgeCell
              label={label === undefined ? t('Code {{code}}', { code: row.original.code }) : t(label)}
              tone={drawingSubmitCodeTone(row.original.code)}
            />
          )
        },
        meta: { label: t('Submit result') },
      },
      {
        id: 'status',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Status')} />,
        cell: ({ row }) => {
          const label = DRAWING_STATUS_LABELS[row.original.status]
          return (
            <BadgeCell
              label={label === undefined ? row.original.status : t(label)}
              mono={label === undefined}
              tone={drawingStatusTone(row.original.status)}
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
            label={t('Progress for task {{id}}', { id: row.original.mj_id || row.original.id })}
            progress={row.original.progress}
            tone={drawingStatusTone(row.original.status)}
          />
        ),
        meta: { label: t('Progress') },
      },
    ]

    if (isAdminView) {
      base.push(
        {
          // model.Midjourney has no username column, so an id is all the API offers.
          id: 'user_id',
          enableSorting: false,
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('User ID')} />,
          cell: ({ row }) => <MonoCell value={row.original.user_id} />,
          meta: { label: t('User ID'), mono: true },
        },
        {
          id: 'channel_id',
          enableSorting: false,
          header: ({ column }) => <DataTableColumnHeader column={column} title={t('Channel')} />,
          cell: ({ row }) => <MonoCell value={row.original.channel_id} />,
          meta: { label: t('Channel'), mono: true },
        },
      )
    }

    base.push(
      {
        id: 'image_url',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Image')} />,
        cell: ({ row }) =>
          row.original.image_url === '' ? (
            <MonoCell value={null} />
          ) : (
            <BadgeCell
              icon={<ImageIcon aria-hidden="true" className="size-3" />}
              label={t('URL')}
              tone="info"
            />
          ),
        meta: { label: t('Image') },
      },
      {
        id: 'prompt',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Prompt')} />,
        cell: ({ row }) =>
          row.original.prompt === '' ? (
            <MonoCell value={null} />
          ) : (
            <TruncatedCell maxWidthClassName="max-w-[16rem]" value={row.original.prompt} />
          ),
        meta: { label: t('Prompt') },
      },
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
              maxWidthClassName="max-w-[14rem]"
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
            aria-label={t('Toggle drawing task details')}
            onClick={() => row.toggleExpanded()}
            size="icon-md"
            title={t('Toggle drawing task details')}
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

  const { table, paginationControls } = useDataTable<DrawingTask>({
    columns,
    data: tasks,
    enableExpanding: true,
    getRowId: drawingRowId,
    onPageChange: (query) => {
      setPage(query.p)
      setPageSize(query.page_size)
    },
    page,
    pageSize,
    total,
  })

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
    setChannelId('')
    handleTimeRangeChange('all')
  }

  const description = t('Midjourney jobs submitted through this gateway, with their upstream status and result.')

  if (statusQuery.data !== undefined && !drawingEnabled) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader description={description} title={t('Drawing tasks')} />
        <Alert
          icon={<PowerOffIcon aria-hidden="true" />}
          title={t('Drawing is turned off')}
          tone="warning"
        >
          {t('An administrator has disabled drawing on this deployment, so no Midjourney jobs can be submitted or listed.')}
        </Alert>
      </div>
    )
  }

  const emptyTitle = hasActiveFilters ? t('No matching drawing tasks') : t('No drawing tasks yet')

  /**
   * Three distinct empty states: filtered out, an idle deployment, and an account
   * that has never drawn anything. The seeded instance shows the last two, so they
   * have to read as a real answer rather than as a broken table.
   */
  let emptyDescription = t('You have not submitted a Midjourney job yet. Drawing requests you send through the API appear here.')
  if (hasActiveFilters) {
    emptyDescription = t('No drawing task matches these filters.')
  } else if (isAdminView) {
    emptyDescription = t('No Midjourney job has run on this deployment yet. Jobs appear here as soon as someone submits one.')
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader description={description} title={t('Drawing tasks')} />

      <Panel className="overflow-hidden">
        <DataTableToolbar
          actions={
            canViewEveryone ? (
              <TaskScopeControl
                disabled={isResolving}
                label={t('Drawing task scope')}
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
                className="w-40"
                hideLabel
                label={t('Time range')}
                onChange={(event) => handleTimeRangeChange(event.target.value as TaskTimeRangeId)}
                options={timeRangeOptions}
                size="sm"
                value={timeRange}
              />
              {isAdminView ? (
                <SearchInput
                  className="w-40"
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
          filtersLabel={t('Drawing task filters')}
          isResetDisabled={!hasActiveFilters}
          label={t('Drawing task filters')}
          onReset={handleReset}
          search={
            <SearchInput
              debounceMs={300}
              description={t('Exact match on the upstream Midjourney task ID.')}
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
              title={t('Could not load drawing tasks')}
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
              emptyIcon={<ImageIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={emptyTitle}
              isFetching={tasksQuery.isFetching}
              isLoading={tasksQuery.isLoading || isResolving}
              label={t('Drawing tasks')}
              loadingLabel={t('Loading drawing tasks')}
              minWidthClassName={isAdminView ? 'min-w-[92rem]' : 'min-w-[78rem]'}
              renderExpandedRow={(row) => <DrawingDetailPanel task={row.original} />}
              table={table}
            />

            <div className="p-4 md:hidden">
              <MobileCardList
                emptyDescription={emptyDescription}
                emptyIcon={<ImageIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
                emptyTitle={emptyTitle}
                isFetching={tasksQuery.isFetching}
                isLoading={tasksQuery.isLoading || isResolving}
                label={t('Drawing task cards')}
                loadingLabel={t('Loading drawing tasks')}
                renderExpandedRow={(row) => <DrawingDetailPanel task={row.original} />}
                table={table}
              />
            </div>

            <DataTablePagination
              {...paginationControls}
              isFetching={tasksQuery.isFetching}
              label={t('Drawing task pages')}
            />
          </>
        )}
      </Panel>
    </div>
  )
}
