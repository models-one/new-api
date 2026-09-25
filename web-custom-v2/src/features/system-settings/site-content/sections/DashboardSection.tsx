import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { NativeSelect, NumberInput, SwitchRow } from '@/components/form'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  systemOptionsQuery,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { useOptionSectionForm } from '@/features/system-settings/section-form'

/**
 * `/system-settings/content/dashboard` — what the usage dashboard aggregates and how often.
 *
 * Three keys, all verified present in `GET /api/option/` on the running dev server:
 *
 *   DataExportEnabled      'true'   runs the aggregation loop at all
 *   DataExportInterval     '5'      MINUTES between aggregation passes
 *   DataExportDefaultTime  'hour'   the granularity the dashboard opens on
 *
 * `DataExportEnabled` is not a display toggle. `model/usedata.go` runs a goroutine that
 * sleeps `DataExportInterval` minutes and flushes the in-memory usage buckets to the
 * database on each pass, and `model/log.go` only accumulates those buckets while the flag
 * is on. Turning it off stops the usage dashboard being fed, not merely being shown.
 *
 * THE INTERVAL IS WHY THIS SECTION VALIDATES AT ALL. `model.UpdateOption` parses it with
 * `strconv.Atoi(value)` and DISCARDS THE ERROR, so the server accepts the literal text
 * `abc` and the aggregation loop then sleeps zero minutes and spins — verified live on
 * the dev server, which stored `'abc'` without complaint. Nothing on the backend will
 * refuse a bad value here, so this form has to.
 */

type DashboardDraft = {
  DataExportEnabled: boolean
  DataExportInterval: number
  DataExportDefaultTime: string
}

/** The three granularities `common.DataExportDefaultTime` is documented for. */
const GRANULARITIES = ['hour', 'day', 'week'] as const

function toDraft(options: SystemOptionMap | undefined): DashboardDraft {
  return {
    DataExportDefaultTime: readOptionString(options, 'DataExportDefaultTime', 'hour'),
    DataExportEnabled: readOptionBoolean(options, 'DataExportEnabled', true),
    DataExportInterval: readOptionNumber(options, 'DataExportInterval', 5),
  }
}

export function DashboardSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<DashboardDraft>({
    saved: toDraft(optionsQuery.data),
    validate: (values) => {
      const errors: Partial<Record<keyof DashboardDraft, string>> = {}
      if (!Number.isInteger(values.DataExportInterval)) {
        errors.DataExportInterval = t('Enter a whole number of minutes.')
      } else if (values.DataExportInterval < 1 || values.DataExportInterval > 1440) {
        errors.DataExportInterval = t('Between 1 and 1440 minutes. Zero would make the aggregation loop spin without pausing.')
      }
      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const granularity = form.values.DataExportDefaultTime

  return (
    <SettingsSection
      description={t('What the usage dashboard aggregates and how often.')}
      form={form}
      note={t('The server does not check the interval it is given: a value it cannot read becomes zero and the aggregation loop then runs without pausing. That is why this form insists on a whole number of minutes.')}
      saveMode="section"
      title={t('Data dashboard')}
    >
      <SwitchRow
        checked={form.values.DataExportEnabled}
        description={t('While this is off the gateway stops collecting usage buckets altogether, so the dashboard has nothing to show for that period even after it is turned back on.')}
        disabled={disabled}
        label={t('Collect usage data')}
        onCheckedChange={(checked) => form.setField('DataExportEnabled', checked)}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <NumberInput
          description={t('How long the gateway waits between flushing usage buckets to the database.')}
          disabled={disabled || !form.values.DataExportEnabled}
          error={form.errors.DataExportInterval}
          invalid={form.errors.DataExportInterval !== undefined}
          label={t('Aggregation interval (minutes)')}
          max={1440}
          min={1}
          onValueChange={(value) => form.setField('DataExportInterval', value ?? Number.NaN)}
          step={1}
          value={form.values.DataExportInterval}
        />

        <NativeSelect
          description={t('Which bucket size the dashboard opens on. Data is always stored hourly; this only chooses the default view.')}
          disabled={disabled || !form.values.DataExportEnabled}
          label={t('Default granularity')}
          onChange={(event) => form.setField('DataExportDefaultTime', event.target.value)}
          options={[
            { label: t('Hour'), value: 'hour' },
            { label: t('Day'), value: 'day' },
            { label: t('Week'), value: 'week' },
            // A deployment can hold something else — the server stores this key verbatim
            // — and dropping it from the list would silently rewrite it on the next save.
            ...(GRANULARITIES.some((value) => value === granularity)
              ? []
              : [{ label: t('{{value}} (stored on this deployment)', { value: granularity }), value: granularity }]),
          ]}
          value={granularity}
        />
      </div>
    </SettingsSection>
  )
}
