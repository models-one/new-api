import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import FileTextIcon from 'lucide-react/dist/esm/icons/file-text'
import ScrollTextIcon from 'lucide-react/dist/esm/icons/scroll-text'
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTable,
  DataTableColumnHeader,
  MobileCardList,
  MonoCell,
  useDataTable,
  type DataTableColumns,
} from '@/components/data'
import { NativeSelect, NumberInput, type NativeSelectOption } from '@/components/form'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, Panel } from '@/components/ui'
import {
  cleanupLogFiles,
  logFilesQuery,
  type LogCleanupMode,
  type LogFileInfo,
} from '@/features/system-info/api'
import { PollStatus } from '@/features/system-info/components/PollStatus'
import { formatBytes, rfc3339ToUnixSeconds } from '@/features/system-info/presentation'
import { formatDateTime, formatNumber } from '@/lib/format'

/** `CleanupLogFiles` rejects anything below 1, so the control cannot offer less. */
const MIN_CLEANUP_VALUE = 1
const DEFAULT_KEEP_COUNT = 5

export function LogFilesPanel() {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<LogCleanupMode>('by_count')
  const [value, setValue] = useState<number | null>(DEFAULT_KEEP_COUNT)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const filesQuery = useQuery(logFilesQuery())
  const info = filesQuery.data
  const files = useMemo(() => info?.files ?? [], [info])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['performance', 'logs'] })
  }

  const cleanupMutation = useMutation({
    mutationFn: (input: { mode: LogCleanupMode; value: number }) =>
      cleanupLogFiles(input.mode, input.value),
    onError: (error: unknown) => toast.error(toErrorMessage(error)),
    onSuccess: (result) => {
      const summary = t('Deleted {{count}} log files, freeing {{size}}', {
        count: result.deleted_count,
        size: formatBytes(result.freed_bytes),
      })
      if (result.partialError !== undefined) {
        toast.warning(`${summary} — ${result.partialError}`)
      } else {
        toast.success(summary)
      }
      setConfirmOpen(false)
      refresh()
    },
  })

  const columns = useMemo<DataTableColumns<LogFileInfo>>(
    () => [
      {
        cell: ({ row }) => <MonoCell value={row.original.name} />,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('File')} />,
        id: 'name',
        meta: { label: t('File'), mobilePrimary: true, mono: true },
      },
      {
        cell: ({ row }) => (
          <MonoCell align="right" value={formatBytes(row.original.size)} />
        ),
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Size')} />,
        id: 'size',
        meta: { align: 'right', label: t('Size'), mono: true },
      },
      {
        cell: ({ row }) => {
          const seconds = rfc3339ToUnixSeconds(row.original.mod_time)
          return <MonoCell value={seconds === null ? undefined : formatDateTime(seconds, locale)} />
        },
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('Last modified')} />,
        id: 'mod_time',
        meta: { label: t('Last modified'), mono: true },
      },
    ],
    [locale, t],
  )

  const { table } = useDataTable<LogFileInfo>({
    columns,
    data: info?.files ?? undefined,
    getRowId: (row) => row.name,
  })

  const modeOptions: NativeSelectOption[] = [
    { label: t('Keep the newest N files'), value: 'by_count' },
    { label: t('Delete files older than N days'), value: 'by_days' },
  ]

  const loggingDisabled = filesQuery.isSuccess && info?.enabled === false
  const valueIsValid = value !== null && Number.isInteger(value) && value >= MIN_CLEANUP_VALUE
  const canCleanup = valueIsValid && !loggingDisabled && files.length > 0

  const oldest = rfc3339ToUnixSeconds(info?.oldest_time)
  const newest = rfc3339ToUnixSeconds(info?.newest_time)

  return (
    <Panel aria-labelledby="system-logs-heading" className="overflow-hidden">
      <Panel.Header
        actions={
          <PollStatus
            dataUpdatedAt={filesQuery.dataUpdatedAt}
            isFetching={filesQuery.isFetching}
            onRefresh={refresh}
            refreshLabel={t('Refresh log file list')}
          />
        }
        icon={<ScrollTextIcon aria-hidden="true" className="size-5 text-primary" />}
        title={t('Log files')}
        titleId="system-logs-heading"
      />

      {loggingDisabled ? (
        <Panel.Body>
          <Alert icon={<FileTextIcon aria-hidden="true" />} live="status" tone="info">
            {t('File logging is switched off on the responding node — LogDir is unset — so the server reports nothing but that fact. Nothing here can be listed or cleaned up.')}
          </Alert>
        </Panel.Body>
      ) : null}

      {filesQuery.isError ? (
        <div className="p-5">
          <Alert
            action={
              <Button
                aria-busy={filesQuery.isFetching}
                disabled={filesQuery.isFetching}
                onClick={() => void filesQuery.refetch()}
                variant="outline"
              >
                {t('Try again')}
              </Button>
            }
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('Could not load log files')}
            tone="destructive"
          >
            {toErrorMessage(filesQuery.error)}
          </Alert>
        </div>
      ) : null}

      {filesQuery.isError || loggingDisabled ? null : (
        <>
          <Panel.Body className="flex flex-wrap items-center gap-2 border-b border-border">
            <Badge tone="muted">
              {t('{{count}} files', { count: info?.file_count ?? files.length })}
            </Badge>
            <Badge tone="muted">{formatBytes(info?.total_size)}</Badge>
            {info?.log_dir ? (
              <span className="mono truncate text-xs text-muted" title={info.log_dir}>
                {info.log_dir}
              </span>
            ) : null}
            {oldest !== null && newest !== null ? (
              <span className="text-xs text-muted">
                {t('{{oldest}} → {{newest}}', {
                  newest: formatDateTime(newest, locale),
                  oldest: formatDateTime(oldest, locale),
                })}
              </span>
            ) : null}
          </Panel.Body>

          <DataTable
            className="hidden md:block"
            emptyDescription={t('The log directory is configured but holds no oneapi-*.log file yet.')}
            emptyIcon={<FileTextIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
            emptyTitle={t('No log files')}
            isFetching={filesQuery.isFetching}
            isLoading={filesQuery.isLoading}
            label={t('Log files on the responding node')}
            loadingLabel={t('Loading log files')}
            minWidthClassName="min-w-[40rem]"
            table={table}
          />

          <div className="p-4 md:hidden">
            <MobileCardList
              emptyDescription={t('The log directory is configured but holds no oneapi-*.log file yet.')}
              emptyIcon={<FileTextIcon aria-hidden="true" className="mx-auto size-7 text-muted" />}
              emptyTitle={t('No log files')}
              isFetching={filesQuery.isFetching}
              isLoading={filesQuery.isLoading}
              label={t('Log file cards')}
              loadingLabel={t('Loading log files')}
              table={table}
            />
          </div>
        </>
      )}

      <Panel.Footer align="between">
        <div className="flex flex-wrap items-end gap-3">
          <NativeSelect
            className="w-56"
            label={t('Cleanup rule')}
            onChange={(event) => setMode(event.target.value as LogCleanupMode)}
            options={modeOptions}
            size="sm"
            value={mode}
          />
          <NumberInput
            className="w-40"
            error={valueIsValid ? undefined : t('Enter a whole number of 1 or more.')}
            invalid={!valueIsValid}
            label={mode === 'by_count' ? t('Files to keep') : t('Days to keep')}
            min={MIN_CLEANUP_VALUE}
            onValueChange={setValue}
            size="sm"
            step={1}
            value={value ?? ''}
          />
          <Button
            disabled={!canCleanup}
            onClick={() => setConfirmOpen(true)}
            size="sm"
            variant="danger"
          >
            <Trash2Icon aria-hidden="true" />
            {t('Delete log files')}
          </Button>
        </div>
        <p className="max-w-md text-xs leading-5 text-muted">
          {t('Cleanup runs on the node that answers the call and only ever touches its own oneapi-*.log files. The file the logger is writing to right now is always kept.')}
        </p>
      </Panel.Footer>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Delete log files')}
        description={
          mode === 'by_count'
            ? t('The {{count}} newest log files are kept and every older one is deleted from disk. There are {{total}} files right now.', {
              count: formatNumber(value ?? 0),
              total: formatNumber(info?.file_count ?? files.length),
            })
            : t('Every log file last modified more than {{count}} days ago is deleted from disk. There are {{total}} files right now.', {
              count: formatNumber(value ?? 0),
              total: formatNumber(info?.file_count ?? files.length),
            })
        }
        destructive
        isLoading={cleanupMutation.isPending}
        onConfirm={() => {
          if (valueIsValid) cleanupMutation.mutate({ mode, value })
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title={t('Delete log files from disk?')}
      >
        <Alert icon={<TriangleAlertIcon aria-hidden="true" />} tone="warning">
          {t('Deleted log files cannot be recovered from this console. The server reports how many it removed and how many bytes it freed.')}
        </Alert>
      </ConfirmDialog>
    </Panel>
  )
}
