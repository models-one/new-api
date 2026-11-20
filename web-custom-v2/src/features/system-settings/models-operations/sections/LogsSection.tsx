import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NativeSelect, NumberInput, SwitchRow } from '@/components/form'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, DescriptionList, Panel, ProgressBar, Separator } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import {
  SYSTEM_TASK_TYPE_LOG_CLEANUP,
  cleanupServerLogFiles,
  currentSystemTaskQuery,
  findLatestTask,
  isTaskActive,
  readDeletedCount,
  readLogCleanupState,
  systemTaskStatusLabel,
  serverLogInfoQuery,
  startLogCleanup,
  systemTaskListQuery,
  type ServerLogCleanupMode,
  type SystemTaskStatus,
} from '@/features/system-settings/models-operations/api'
import { formatBytes } from '@/features/system-settings/models-operations/format-bytes'
import { formatDateTime, formatNumber, toUnixSeconds } from '@/lib/format'

/**
 * `/system-settings/operations/logs`
 *
 * One option key — `LogConsumeEnabled` ('true' on the dev server) — plus two destructive
 * operations that have nothing to do with the option store:
 *
 *   POST   /api/system-task/log-cleanup?target_timestamp=<unix seconds>
 *          Deletes every consumption log row created STRICTLY BEFORE that instant. There is
 *          no dry run, no undo and no bound on how many rows go. It runs as a background
 *          system task whose `state` reports {processed, progress, total} and whose `result`
 *          reports {deleted_count} — verified live.
 *   DELETE /api/performance/logs?mode=by_count|by_days&value=<n>
 *          Deletes rotated log FILES from disk. Different thing entirely, and the file being
 *          written right now is always skipped server-side.
 *
 * Both go through a ConfirmDialog that names exactly what is about to be destroyed. The
 * database purge additionally requires the cutoff to be typed back, because "before
 * 2026-08-30" and "before 2025-08-30" look identical at a glance and differ by a year of
 * billing history.
 */

const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS)
}

/** `<input type="datetime-local">` wants local wall-clock text, not an ISO instant. */
function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseLocalInputValue(value: string): Date | undefined {
  if (value === '') return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function taskStatusTone(status: SystemTaskStatus): 'success' | 'destructive' | 'warning' {
  if (status === 'succeeded') return 'success'
  if (status === 'failed') return 'destructive'
  return 'warning'
}

type LogsDraft = {
  LogConsumeEnabled: boolean
}

function toDraft(options: SystemOptionMap | undefined): LogsDraft {
  return { LogConsumeEnabled: readOptionBoolean(options, 'LogConsumeEnabled', true) }
}

/**
 * How far users reach into their logs (`operation_setting.LogSetting`) and how long system
 * task history is kept (`SystemTaskSetting`). Both day counts are refused below 1 by the
 * server (`ValidateLogMaxRangeDays`, `ValidateSystemTaskRetentionDays`).
 */
type LogAccessDraft = {
  'log_setting.user_export_enabled': boolean
  'log_setting.max_range_days': number
  'system_task_setting.retention_days': number
}

function toAccessDraft(options: SystemOptionMap | undefined): LogAccessDraft {
  return {
    'log_setting.max_range_days': readOptionNumber(options, 'log_setting.max_range_days', 365),
    'log_setting.user_export_enabled': readOptionBoolean(options, 'log_setting.user_export_enabled', true),
    'system_task_setting.retention_days': readOptionNumber(options, 'system_task_setting.retention_days', 30),
  }
}

export function LogsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<LogsDraft>({ saved: toDraft(optionsQuery.data) })
  const accessForm = useOptionSectionForm<LogAccessDraft>({
    saved: toAccessDraft(optionsQuery.data),
    validate: (values) => {
      const errors: Partial<Record<keyof LogAccessDraft, string>> = {}
      for (const key of ['log_setting.max_range_days', 'system_task_setting.retention_days'] as const) {
        if (!Number.isInteger(values[key]) || values[key] < 1) errors[key] = t('Enter a whole number of days, at least 1.')
      }
      return errors
    },
  })
  const accessDisabled = optionsQuery.isPending || accessForm.isSaving

  const [cutoffText, setCutoffText] = useState(() => toLocalInputValue(daysAgo(30)))
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false)
  const [fileMode, setFileMode] = useState<ServerLogCleanupMode>('by_count')
  const [fileValue, setFileValue] = useState(10)
  const [fileConfirmOpen, setFileConfirmOpen] = useState(false)

  const ready = !optionsQuery.isPending
  const currentTaskQuery = useQuery(currentSystemTaskQuery(SYSTEM_TASK_TYPE_LOG_CLEANUP, ready))
  const recentTasksQuery = useQuery(systemTaskListQuery(20, ready))
  const logFilesQuery = useQuery(serverLogInfoQuery(ready))

  // `current` is null the moment the task finishes, so the finished run comes from the list.
  const activeTask = isTaskActive(currentTaskQuery.data) ? currentTaskQuery.data : undefined
  const lastTask = findLatestTask(recentTasksQuery.data, SYSTEM_TASK_TYPE_LOG_CLEANUP)

  const cutoffDate = parseLocalInputValue(cutoffText)
  const cutoffSeconds = cutoffDate === undefined ? undefined : toUnixSeconds(cutoffDate)
  const cutoffLabel = cutoffSeconds === undefined ? '' : formatDateTime(cutoffSeconds)
  const cutoffInFuture = cutoffDate !== undefined && cutoffDate.getTime() > Date.now()

  const purgeMutation = useMutation({
    mutationFn: (timestamp: number) => startLogCleanup(timestamp),
    onError: (error) => toast.error(toErrorMessage(error)),
    onSuccess: async () => {
      toast.success(t('The log purge has started.'))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['system-settings', 'system-task', 'current'] }),
        queryClient.invalidateQueries({ queryKey: ['system-settings', 'system-task', 'list'] }),
      ])
    },
  })

  const fileCleanupMutation = useMutation({
    mutationFn: () => cleanupServerLogFiles(fileMode, fileValue),
    onError: (error) => toast.error(toErrorMessage(error)),
    onSuccess: async (result) => {
      toast.success(
        t('{{count}} log files deleted, {{size}} freed.', {
          count: result.deleted_count,
          size: formatBytes(result.freed_bytes),
        }),
      )
      await queryClient.invalidateQueries({
        queryKey: ['system-settings', 'performance', 'logs'],
      })
    },
  })

  const purgeState = readLogCleanupState(activeTask?.state ?? lastTask?.state)
  const lastDeleted = lastTask === undefined ? undefined : readDeletedCount(lastTask.result)
  const purgeRunning = activeTask !== undefined || purgeMutation.isPending
  const logFiles = logFilesQuery.data

  /**
   * Four states apart: "no log directory configured" is a deployment fact, while a failed
   * read is not — offering the delete controls in either case would be wrong for different
   * reasons.
   */
  const logFilePanel = ((): ReactNode => {
    if (logFilesQuery.isPending) {
      return (
        <p className="text-xs text-muted" role="status">
          {t('Reading the log directory…')}
        </p>
      )
    }

    if (logFilesQuery.isError) {
      return (
        <Alert
          action={
            <Button
              aria-busy={logFilesQuery.isFetching}
              disabled={logFilesQuery.isFetching}
              onClick={() => void logFilesQuery.refetch()}
              variant="outline"
            >
              {t('Try again')}
            </Button>
          }
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('The log directory could not be read')}
          tone="destructive"
        >
          {toErrorMessage(logFilesQuery.error)}
        </Alert>
      )
    }

    if (logFiles === undefined || !logFiles.enabled) {
      return (
        <Alert title={t('This deployment writes no log files')} tone="warning">
          {t('It was started without a log directory, so there is nothing on disk to clean up. Output goes to the container log instead.')}
        </Alert>
      )
    }

    return (
            <>
              <DescriptionList
                items={[
                  { description: <span className="mono text-xs">{logFiles.log_dir}</span>, term: t('Directory') },
                  { description: formatNumber(logFiles.file_count), term: t('Files') },
                  { description: formatBytes(logFiles.total_size), term: t('Total size') },
                ]}
                label={t('Server log directory')}
              />

              <Separator />

              <div className="grid gap-5 md:grid-cols-2">
                <NativeSelect
                  description={t('What is kept. Everything else in the directory is deleted, except the file being written right now.')}
                  disabled={fileCleanupMutation.isPending}
                  label={t('Keep by')}
                  onChange={(event) =>
                    setFileMode(event.target.value === 'by_days' ? 'by_days' : 'by_count')
                  }
                  options={[
                    { label: t('The newest N files'), value: 'by_count' },
                    { label: t('The last N days'), value: 'by_days' },
                  ]}
                  value={fileMode}
                />
                <NumberInput
                  description={
                    fileMode === 'by_count'
                      ? t('Files beyond the newest {{count}} are deleted.', { count: fileValue })
                      : t('Files last written more than {{count}} days ago are deleted.', { count: fileValue })
                  }
                  disabled={fileCleanupMutation.isPending}
                  label={fileMode === 'by_count' ? t('Files to keep') : t('Days to keep')}
                  max={fileMode === 'by_count' ? 1000 : 3650}
                  min={1}
                  onValueChange={(value) => setFileValue(value ?? Number.NaN)}
                  step={1}
                  value={fileValue}
                />
              </div>
            </>
    )
  })()

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        description={t('Whether each request is recorded, and how the recorded history is pruned.')}
        form={form}
        saveMode="field"
        title={t('Log maintenance')}
      >
        <SwitchRow
          checked={form.values.LogConsumeEnabled}
          description={t('Writes one row per billed request. Every usage chart, per-token breakdown and consumption export is built from these rows, so turning this off silently empties all of them from that moment on. It is the single biggest write load this deployment carries.')}
          disabled={optionsQuery.isPending || form.isSaving}
          label={t('Record a log row for every request')}
          onCheckedChange={(checked) => form.commitField('LogConsumeEnabled', checked)}
        />
      </SettingsSection>

      <SettingsSection
        description={t('What users may do with their own logs, and how long system task history is kept.')}
        form={accessForm}
        saveMode="section"
        title={t('Log access and history')}
      >
        <SwitchRow
          checked={accessForm.values['log_setting.user_export_enabled']}
          description={t('Lets users export their own usage logs. Administrators can always export.')}
          disabled={accessDisabled}
          label={t('Users can export their logs')}
          onCheckedChange={(checked) => accessForm.setField('log_setting.user_export_enabled', checked)}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <NumberInput
            description={t('The longest time range a user can search in their logs and dashboard, and the longest any export can cover.')}
            disabled={accessDisabled}
            error={accessForm.errors['log_setting.max_range_days']}
            invalid={accessForm.errors['log_setting.max_range_days'] !== undefined}
            label={t('Longest log range (days)')}
            min={1}
            onValueChange={(value) => accessForm.setField('log_setting.max_range_days', value ?? Number.NaN)}
            step={1}
            value={accessForm.values['log_setting.max_range_days']}
          />
          <NumberInput
            description={t('Finished system tasks older than this are deleted by a daily task.')}
            disabled={accessDisabled}
            error={accessForm.errors['system_task_setting.retention_days']}
            invalid={accessForm.errors['system_task_setting.retention_days'] !== undefined}
            label={t('Keep system task history (days)')}
            min={1}
            onValueChange={(value) => accessForm.setField('system_task_setting.retention_days', value ?? Number.NaN)}
            step={1}
            value={accessForm.values['system_task_setting.retention_days']}
          />
        </div>
      </SettingsSection>

      <Panel as="section">
        <Panel.Header
          description={t('Deletes consumption log rows from the database. There is no undo and no export step.')}
          title={t('Purge log history')}
        />
        <Panel.Body className="flex flex-col gap-4">
          <Alert
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('This permanently deletes billing history')}
            tone="destructive"
          >
            {t('Every log row older than the cutoff is removed, however many that is. Usage charts, per-user consumption and any reconciliation that depends on those rows lose that period for good.')}
          </Alert>

          <div className="grid gap-5 md:grid-cols-2">
            <Input
              description={t('Everything created strictly before this instant is deleted. The time is read in your own timezone.')}
              disabled={purgeRunning}
              error={cutoffInFuture ? t('That is in the future — it would delete the entire log.') : undefined}
              invalid={cutoffInFuture}
              label={t('Delete log rows older than')}
              max={toLocalInputValue(new Date())}
              onChange={(event) => setCutoffText(event.target.value)}
              type="datetime-local"
              value={cutoffText}
            />
            <div className="flex flex-col gap-2">
              <p className="eyebrow">{t('Common cutoffs')}</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { days: 1, label: t('1 day ago') },
                  { days: 7, label: t('7 days ago') },
                  { days: 30, label: t('30 days ago') },
                  { days: 90, label: t('90 days ago') },
                ].map((option) => (
                  <Button
                    disabled={purgeRunning}
                    key={option.days}
                    onClick={() => setCutoffText(toLocalInputValue(daysAgo(option.days)))}
                    size="sm"
                    variant="outline"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {activeTask !== undefined ? (
            <div className="flex flex-col gap-2" role="status">
              <ProgressBar
                label={t('Log purge progress')}
                showValue
                value={Math.min(Math.max(purgeState.progress, 0), 100)}
                valueText={t('{{processed}} of {{total}} rows processed', {
                  processed: formatNumber(purgeState.processed),
                  total: formatNumber(purgeState.total),
                })}
              />
            </div>
          ) : null}

          {lastTask !== undefined && activeTask === undefined ? (
            <DescriptionList
              items={[
                { description: formatDateTime(lastTask.created_at), term: t('Last purge started') },
                {
                  description: (
                    <Badge size="sm" tone={taskStatusTone(lastTask.status)}>
                      {t(systemTaskStatusLabel(lastTask.status))}
                    </Badge>
                  ),
                  term: t('Outcome'),
                },
                {
                  description:
                    lastDeleted === undefined
                      ? t('Not reported')
                      : t('{{count}} rows deleted', { count: lastDeleted }),
                  term: t('Rows removed'),
                },
                ...(lastTask.error === ''
                  ? []
                  : [{ description: lastTask.error, term: t('Error') }]),
              ]}
              label={t('Last log purge')}
            />
          ) : null}
        </Panel.Body>

        <Panel.Footer align="between">
          <p className="text-xs text-muted" role="status">
            {purgeRunning
              ? t('A purge is running. Progress is polled from the server.')
              : t('No purge is running.')}
          </p>
          <Button
            aria-busy={purgeRunning}
            disabled={purgeRunning || cutoffSeconds === undefined || cutoffInFuture}
            onClick={() => setPurgeConfirmOpen(true)}
            size="sm"
            variant="danger"
          >
            {t('Purge log history')}
          </Button>
        </Panel.Footer>
      </Panel>

      <Panel as="section">
        <Panel.Header
          description={t('Rotated log files on the server’s disk. Separate from the database rows above.')}
          title={t('Server log files')}
        />
        <Panel.Body className="flex flex-col gap-4">
          {logFilePanel}
        </Panel.Body>

        {logFiles !== undefined && logFiles.enabled ? (
          <Panel.Footer align="end">
            <Button
              aria-busy={fileCleanupMutation.isPending}
              disabled={
                fileCleanupMutation.isPending || !Number.isFinite(fileValue) || fileValue < 1
              }
              onClick={() => setFileConfirmOpen(true)}
              size="sm"
              variant="danger"
            >
              {t('Delete old log files')}
            </Button>
          </Panel.Footer>
        ) : null}
      </Panel>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Delete these log rows')}
        confirmPhrase={cutoffLabel}
        confirmPhraseLabel={t('Type the cutoff back to confirm: {{cutoff}}', { cutoff: cutoffLabel })}
        description={t('Every consumption log row created before {{cutoff}} will be deleted from the database. The number of rows is not known in advance, there is no undo, and no copy is kept.', { cutoff: cutoffLabel })}
        destructive
        isLoading={purgeMutation.isPending}
        onConfirm={() => {
          if (cutoffSeconds === undefined) return
          setPurgeConfirmOpen(false)
          purgeMutation.mutate(cutoffSeconds)
        }}
        onOpenChange={setPurgeConfirmOpen}
        open={purgeConfirmOpen}
        size="md"
        title={t('Permanently delete log history?')}
      />

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Delete old log files')}
        description={
          fileMode === 'by_count'
            ? t('Only the newest {{count}} log files are kept; every older file in the directory is deleted from disk.', { count: fileValue })
            : t('Every log file last written more than {{count}} days ago is deleted from disk.', { count: fileValue })
        }
        destructive
        isLoading={fileCleanupMutation.isPending}
        onConfirm={() => {
          setFileConfirmOpen(false)
          fileCleanupMutation.mutate()
        }}
        onOpenChange={setFileConfirmOpen}
        open={fileConfirmOpen}
        title={t('Delete log files from disk?')}
      />
    </div>
  )
}
