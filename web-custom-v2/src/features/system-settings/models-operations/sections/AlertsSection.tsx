import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { NativeSelect, NumberInput, SwitchRow } from '@/components/form'
import { Separator } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'
import { formatQuota } from '@/lib/format'
import { useQuotaPerUnit } from '@/hooks/use-server-status'

/**
 * `/system-settings/operations/alerts`
 *
 * Five keys, all present in `GET /api/option/`:
 *
 *   QuotaRemindThreshold                 '1000'
 *   perf_metrics_setting.enabled         'true'
 *   perf_metrics_setting.flush_interval  '5'
 *   perf_metrics_setting.bucket_time     'hour'
 *   perf_metrics_setting.retention_days  '0'
 *
 * `QuotaRemindThreshold` is in RAW QUOTA UNITS, not currency — the e-mail goes out when a
 * user's remaining quota drops below it. The currency equivalent is shown underneath using
 * `quota_per_unit` from `/api/status`, never a hardcoded divisor.
 *
 * `bucket_time` is a closed set: `perf_metrics_setting.GetBucketSeconds` recognises
 * 'minute', '5min' and 'hour' and falls back to an hour for anything else, so it is a
 * select rather than a free text field.
 */

const BUCKET_TIMES = ['minute', '5min', 'hour'] as const

function toBucketTime(value: string): string {
  return (BUCKET_TIMES as readonly string[]).includes(value) ? value : 'hour'
}

type AlertsDraft = {
  QuotaRemindThreshold: number
  'perf_metrics_setting.enabled': boolean
  'perf_metrics_setting.flush_interval': number
  'perf_metrics_setting.bucket_time': string
  'perf_metrics_setting.retention_days': number
}

function toDraft(options: SystemOptionMap | undefined): AlertsDraft {
  return {
    'perf_metrics_setting.bucket_time': toBucketTime(
      readOptionString(options, 'perf_metrics_setting.bucket_time', 'hour'),
    ),
    'perf_metrics_setting.enabled': readOptionBoolean(options, 'perf_metrics_setting.enabled', true),
    'perf_metrics_setting.flush_interval': readOptionNumber(
      options,
      'perf_metrics_setting.flush_interval',
      5,
    ),
    'perf_metrics_setting.retention_days': readOptionNumber(
      options,
      'perf_metrics_setting.retention_days',
      0,
    ),
    QuotaRemindThreshold: readOptionNumber(options, 'QuotaRemindThreshold', 1000),
  }
}

export function AlertsSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())
  const quotaPerUnit = useQuotaPerUnit()

  const form = useOptionSectionForm<AlertsDraft>({
    saved: toDraft(optionsQuery.data),
    validate: (values) => {
      const errors: Partial<Record<keyof AlertsDraft, string>> = {}
      if (values.QuotaRemindThreshold < 0) {
        errors.QuotaRemindThreshold = t('Enter zero or more.')
      }
      if (values['perf_metrics_setting.flush_interval'] < 1) {
        errors['perf_metrics_setting.flush_interval'] = t('Enter one minute or more.')
      }
      if (values['perf_metrics_setting.retention_days'] < 0) {
        errors['perf_metrics_setting.retention_days'] = t('Enter zero or more days.')
      }
      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const metricsEnabled = form.values['perf_metrics_setting.enabled']
  const retentionDays = form.values['perf_metrics_setting.retention_days']

  return (
    <SettingsSection
      description={t('When a user is warned about their balance, and what the console records about model performance.')}
      form={form}
      saveMode="section"
      title={t('Monitoring and alerts')}
    >
      <NumberInput
        description={t('A user whose remaining quota falls below this gets a low-balance e-mail. That is roughly {{amount}} at this deployment’s current rate. It needs working SMTP settings to reach anyone.', {
          amount: formatQuota(form.values.QuotaRemindThreshold, quotaPerUnit),
        })}
        disabled={disabled}
        error={form.errors.QuotaRemindThreshold}
        invalid={form.errors.QuotaRemindThreshold !== undefined}
        label={t('Warn a user below this quota')}
        min={0}
        onValueChange={(value) => form.setField('QuotaRemindThreshold', value ?? Number.NaN)}
        step={1}
        value={form.values.QuotaRemindThreshold}
      />

      <Separator />

      <SwitchRow
        checked={metricsEnabled}
        description={t('Records the latency and success rate of each relayed request so the model listing can show how a model is actually performing here. It adds a write per aggregation window, not per request.')}
        disabled={disabled}
        label={t('Collect model performance metrics')}
        onCheckedChange={(checked) => form.setField('perf_metrics_setting.enabled', checked)}
      />

      <div className="grid gap-5 md:grid-cols-3">
        <NumberInput
          description={t('How often the buffered measurements are written to the database.')}
          disabled={disabled || !metricsEnabled}
          error={form.errors['perf_metrics_setting.flush_interval']}
          invalid={form.errors['perf_metrics_setting.flush_interval'] !== undefined}
          label={t('Write interval (minutes)')}
          min={1}
          onValueChange={(value) =>
            form.setField('perf_metrics_setting.flush_interval', value ?? Number.NaN)
          }
          step={1}
          value={form.values['perf_metrics_setting.flush_interval']}
        />
        <NativeSelect
          description={t('The window measurements are grouped into. A finer window is more precise and stores proportionally more rows.')}
          disabled={disabled || !metricsEnabled}
          label={t('Aggregation window')}
          onChange={(event) =>
            form.setField('perf_metrics_setting.bucket_time', event.target.value)
          }
          options={[
            { label: t('One minute'), value: 'minute' },
            { label: t('Five minutes'), value: '5min' },
            { label: t('One hour'), value: 'hour' },
          ]}
          value={toBucketTime(form.values['perf_metrics_setting.bucket_time'])}
        />
        <NumberInput
          description={
            retentionDays === 0
              ? t('0 keeps every measurement forever. Nothing prunes this table on its own.')
              : t('Measurements older than this are removed.')
          }
          disabled={disabled || !metricsEnabled}
          error={form.errors['perf_metrics_setting.retention_days']}
          invalid={form.errors['perf_metrics_setting.retention_days'] !== undefined}
          label={t('Keep measurements for (days)')}
          min={0}
          onValueChange={(value) =>
            form.setField('perf_metrics_setting.retention_days', value ?? Number.NaN)
          }
          step={1}
          value={retentionDays}
        />
      </div>
    </SettingsSection>
  )
}
