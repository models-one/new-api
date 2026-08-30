import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Input, NativeSelect, NumberInput, SwitchRow } from '@/components/form'
import { ConfirmDialog, toErrorMessage, toast } from '@/components/overlay'
import { Alert, Badge, Button, DescriptionList, Panel, Separator } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import {
  SYSTEM_TASK_TYPE_PRICE_SYNC,
  findLatestTask,
  isConflictError,
  readPriceSyncSummary,
  startPriceSync,
  systemTaskStatusLabel,
  systemTaskListQuery,
} from '@/features/system-settings/models-operations/api'
import { formatDateTime } from '@/lib/format'

/**
 * `/system-settings/models/price-sync`
 *
 * Seven keys, all present in `GET /api/option/`, plus the manual trigger
 * `POST /api/system-task/price-sync`.
 *
 * THE APPLY MODE IS THE WHOLE SECTION. `setting/ratio_setting/price_sync_setting.go`:
 *   decrease_only  a model is written only when NEITHER its input nor its output price
 *                  rises. Increases are recorded in the task result and left alone. This is
 *                  the default, and it is the only mode that cannot raise what customers pay
 *                  without a human looking first.
 *   all            every difference is written, increases included.
 *   dry_run        nothing is written at all, ever — the schedule only reports.
 * The ratios this job rewrites are the SELLING price, so the mode is rendered with its
 * consequence next to it and "Sync now" goes through a ConfirmDialog naming the mode.
 *
 * `min_source_models` is the guard against a truncated fetch: a source carrying fewer
 * models than this is treated as a failed fetch rather than merged, so a half-downloaded
 * table cannot wipe out prices.
 */

const APPLY_MODES = ['decrease_only', 'all', 'dry_run'] as const
type ApplyMode = (typeof APPLY_MODES)[number]

function toApplyMode(value: string): ApplyMode {
  return (APPLY_MODES as readonly string[]).includes(value) ? (value as ApplyMode) : 'decrease_only'
}

type PriceSyncDraft = {
  'price_sync_setting.enabled': boolean
  'price_sync_setting.apply_mode': string
  'price_sync_setting.interval_hours': number
  'price_sync_setting.source_url': string
  'price_sync_setting.exclude_models': string
  'price_sync_setting.only_known_models': boolean
  'price_sync_setting.min_source_models': number
}

function toDraft(options: SystemOptionMap | undefined): PriceSyncDraft {
  return {
    'price_sync_setting.apply_mode': toApplyMode(
      readOptionString(options, 'price_sync_setting.apply_mode', 'decrease_only'),
    ),
    'price_sync_setting.enabled': readOptionBoolean(options, 'price_sync_setting.enabled'),
    'price_sync_setting.exclude_models': readOptionString(
      options,
      'price_sync_setting.exclude_models',
    ),
    'price_sync_setting.interval_hours': readOptionNumber(
      options,
      'price_sync_setting.interval_hours',
      6,
    ),
    'price_sync_setting.min_source_models': readOptionNumber(
      options,
      'price_sync_setting.min_source_models',
      50,
    ),
    'price_sync_setting.only_known_models': readOptionBoolean(
      options,
      'price_sync_setting.only_known_models',
      true,
    ),
    'price_sync_setting.source_url': readOptionString(options, 'price_sync_setting.source_url'),
  }
}

const serializePriceSync = {
  'price_sync_setting.exclude_models': (value: string | number | boolean) => String(value).trim(),
  'price_sync_setting.source_url': (value: string | number | boolean) => String(value).trim(),
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function PriceSyncSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const optionsQuery = useQuery(systemOptionsQuery())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const form = useOptionSectionForm<PriceSyncDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializePriceSync,
    validate: (values) => {
      const errors: Partial<Record<keyof PriceSyncDraft, string>> = {}
      const url = values['price_sync_setting.source_url'].trim()
      if (url !== '' && !isHttpUrl(url)) {
        errors['price_sync_setting.source_url'] = t('Enter a full http:// or https:// address, or leave this empty.')
      }
      if (values['price_sync_setting.interval_hours'] < 1) {
        errors['price_sync_setting.interval_hours'] = t('Enter one hour or more.')
      }
      if (values['price_sync_setting.min_source_models'] < 0) {
        errors['price_sync_setting.min_source_models'] = t('Enter zero or more models.')
      }
      return errors
    },
  })

  // The trigger runs against what the SERVER has stored, so an unsaved apply mode would
  // make the confirmation describe a different run from the one about to happen.
  const runsQuery = useQuery(systemTaskListQuery(20, !optionsQuery.isPending))
  const lastRun = findLatestTask(runsQuery.data, SYSTEM_TASK_TYPE_PRICE_SYNC)
  const summary = readPriceSyncSummary(lastRun?.result)

  const triggerMutation = useMutation({
    mutationFn: (dryRun: boolean) => startPriceSync(dryRun),
    onError: (error) => {
      toast.error(
        isConflictError(error)
          ? t('A price sync is already queued or running.')
          : toErrorMessage(error),
      )
    },
    onSuccess: async (_task, dryRun) => {
      toast.success(
        dryRun
          ? t('Dry run started. Its result appears below once it finishes.')
          : t('Price sync started. Its result appears below once it finishes.'),
      )
      await queryClient.invalidateQueries({
        queryKey: ['system-settings', 'system-task', 'list'],
      })
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const applyMode = toApplyMode(form.values['price_sync_setting.apply_mode'])
  const isTriggering = triggerMutation.isPending
  const blockedByEdits = form.isDirty

  const applyModeConsequence = ((): string => {
    if (applyMode === 'all') {
      return t('Every difference is written to the live prices, price INCREASES included. Customers can start paying more without anyone reviewing the change.')
    }
    if (applyMode === 'dry_run') {
      return t('Nothing is ever written. Each run only records what it would have changed.')
    }
    return t('Only price decreases are written. An increase is recorded in the run result and left for you to apply by hand.')
  })()

  const runStatusTone = ((): 'success' | 'destructive' | 'warning' | 'muted' => {
    if (lastRun === undefined) return 'muted'
    if (lastRun.status === 'succeeded') return 'success'
    if (lastRun.status === 'failed') return 'destructive'
    return 'warning'
  })()

  const runHint = ((): string => {
    if (blockedByEdits) {
      return t('Save your changes first — a run would use the stored settings, not the ones on screen.')
    }
    if (applyMode === 'dry_run') {
      return t('The apply mode is set to report only, so a writing run is not offered.')
    }
    return t('The preview runs the whole merge and records what it would change, without touching a single price.')
  })()

  const runItems = ((): { term: string; description: string }[] => {
    if (lastRun === undefined) return []
    const items: { term: string; description: string }[] = [
      { description: formatDateTime(lastRun.created_at), term: t('Started') },
    ]
    if (summary?.apply_mode !== undefined) {
      items.push({ description: summary.apply_mode, term: t('Apply mode used') })
    }
    if (summary?.source_models !== undefined) {
      items.push({
        description: String(summary.source_models),
        term: t('Models in the source table'),
      })
    }
    if (summary?.applied !== undefined) {
      items.push({ description: String(summary.applied), term: t('Prices written') })
    }
    if (summary?.deferred_increases !== undefined) {
      items.push({
        description: String(summary.deferred_increases),
        term: t('Increases left unapplied'),
      })
    }
    if (lastRun.error !== '') items.push({ description: lastRun.error, term: t('Error') })
    return items
  })()

  /**
   * Four states, kept apart on purpose: a failed read of the run history must not be
   * rendered as "no run yet" — one means the deployment has never synced, the other means
   * we do not know whether it has.
   */
  const lastRunPanel = ((): ReactNode => {
    if (runsQuery.isPending) {
      return (
        <p className="text-xs text-muted" role="status">
          {t('Loading the run history…')}
        </p>
      )
    }

    if (runsQuery.isError) {
      return (
        <Alert
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('The run history could not be read')}
          tone="destructive"
        >
          {toErrorMessage(runsQuery.error)}
        </Alert>
      )
    }

    if (lastRun === undefined) {
      return (
        <p className="text-xs leading-5 text-muted">
          {t('This deployment has not recorded a price sync yet.')}
        </p>
      )
    }

    return <DescriptionList items={runItems} label={t('Last price sync run')} />
  })()

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        description={t('Pulls a LiteLLM-format price table on a schedule and merges the derived ratios into this deployment’s model pricing.')}
        form={form}
        note={t('The ratios this job rewrites are your selling price, not your cost. Preview a run before you let it write anything.')}
        saveMode="section"
        title={t('Model price sync')}
      >
        {applyMode === 'all' ? (
          <Alert
            icon={<TriangleAlertIcon aria-hidden="true" />}
            title={t('This mode can raise prices without review')}
            tone="warning"
          >
            {applyModeConsequence}
          </Alert>
        ) : null}

        <SwitchRow
          checked={form.values['price_sync_setting.enabled']}
          description={t('Runs the sync on the interval below, on the master node only. With it off you can still trigger a run by hand from this page.')}
          disabled={disabled}
          label={t('Run the price sync on a schedule')}
          onCheckedChange={(checked) => form.setField('price_sync_setting.enabled', checked)}
        />

        <div className="grid gap-5 md:grid-cols-2">
          <NativeSelect
            description={applyModeConsequence}
            disabled={disabled}
            label={t('What a run is allowed to write')}
            onChange={(event) => form.setField('price_sync_setting.apply_mode', event.target.value)}
            options={[
              { label: t('Write price decreases only'), value: 'decrease_only' },
              { label: t('Write every difference, increases included'), value: 'all' },
              { label: t('Write nothing, only report'), value: 'dry_run' },
            ]}
            value={applyMode}
          />
          <NumberInput
            description={t('How long the scheduled job waits between runs.')}
            disabled={disabled || !form.values['price_sync_setting.enabled']}
            error={form.errors['price_sync_setting.interval_hours']}
            invalid={form.errors['price_sync_setting.interval_hours'] !== undefined}
            label={t('Sync interval (hours)')}
            min={1}
            onValueChange={(value) =>
              form.setField('price_sync_setting.interval_hours', value ?? Number.NaN)
            }
            step={1}
            value={form.values['price_sync_setting.interval_hours']}
          />
        </div>

        <Separator />

        <Input
          description={t('A LiteLLM-format price table. Leave empty to use the built-in source.')}
          disabled={disabled}
          error={form.errors['price_sync_setting.source_url']}
          invalid={form.errors['price_sync_setting.source_url'] !== undefined}
          label={t('Price table URL')}
          onChange={(event) => form.setField('price_sync_setting.source_url', event.target.value)}
          placeholder="https://example.com/model_prices_and_context_window.json"
          value={form.values['price_sync_setting.source_url']}
        />

        <div className="grid gap-5 md:grid-cols-2">
          <Input
            description={t('Comma separated. A trailing * matches by prefix, so deepseek-* covers the whole family. These models are never touched by a sync.')}
            disabled={disabled}
            label={t('Models to leave alone')}
            onChange={(event) =>
              form.setField('price_sync_setting.exclude_models', event.target.value)
            }
            placeholder="deepseek-*, gpt-4o"
            value={form.values['price_sync_setting.exclude_models']}
          />
          <NumberInput
            description={t('A source carrying fewer models than this is treated as truncated and the whole run is rejected. It is what stops a half-downloaded table from rewriting your prices.')}
            disabled={disabled}
            error={form.errors['price_sync_setting.min_source_models']}
            invalid={form.errors['price_sync_setting.min_source_models'] !== undefined}
            label={t('Reject a source with fewer models than')}
            min={0}
            onValueChange={(value) =>
              form.setField('price_sync_setting.min_source_models', value ?? Number.NaN)
            }
            step={1}
            value={form.values['price_sync_setting.min_source_models']}
          />
        </div>

        <SwitchRow
          checked={form.values['price_sync_setting.only_known_models']}
          description={t('A model the source prices but this deployment does not is skipped rather than added. Turning this off lets a run introduce models you have never listed.')}
          disabled={disabled}
          label={t('Only update models this site already prices')}
          onCheckedChange={(checked) =>
            form.setField('price_sync_setting.only_known_models', checked)
          }
        />
      </SettingsSection>

      <Panel as="section">
        <Panel.Header
          description={t('A run uses the settings the server has stored, not the unsaved ones in the form above.')}
          title={t('Run a sync now')}
        />
        <Panel.Body className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-busy={isTriggering}
              disabled={isTriggering || blockedByEdits}
              onClick={() => triggerMutation.mutate(true)}
              variant="outline"
            >
              {t('Preview without writing')}
            </Button>
            <Button
              aria-busy={isTriggering}
              disabled={isTriggering || blockedByEdits || applyMode === 'dry_run'}
              onClick={() => setConfirmOpen(true)}
              variant="danger"
            >
              {t('Sync and write prices')}
            </Button>
            <Button
              aria-busy={runsQuery.isFetching}
              aria-label={t('Refresh the last run')}
              disabled={runsQuery.isFetching}
              onClick={() => void runsQuery.refetch()}
              size="icon-md"
              title={t('Refresh the last run')}
              variant="quiet"
            >
              <RefreshCwIcon aria-hidden="true" />
            </Button>
          </div>

          <p className="text-xs leading-5 text-muted">{runHint}</p>

          <Separator />

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <p className="eyebrow">{t('Last recorded run')}</p>
              {lastRun !== undefined ? (
                <Badge size="sm" tone={runStatusTone}>
                  {t(systemTaskStatusLabel(lastRun.status))}
                </Badge>
              ) : null}
            </div>

            {lastRunPanel}
          </div>
        </Panel.Body>
      </Panel>

      <ConfirmDialog
        cancelLabel={t('Cancel')}
        confirmLabel={t('Sync and write prices')}
        description={
          applyMode === 'all'
            ? t('This writes every difference from the upstream table to the live model pricing, price increases included. It cannot be undone from this page.')
            : t('This writes the upstream price decreases to the live model pricing. Increases are only recorded. It cannot be undone from this page.')
        }
        destructive
        isLoading={isTriggering}
        onConfirm={() => {
          setConfirmOpen(false)
          triggerMutation.mutate(false)
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title={t('Apply upstream prices now?')}
      />
    </div>
  )
}
