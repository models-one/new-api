import { useQuery } from '@tanstack/react-query'
import InfoIcon from 'lucide-react/dist/esm/icons/info'
import { useTranslation } from 'react-i18next'

import { NumberInput, SwitchRow } from '@/components/form'
import { Alert } from '@/components/ui'
import { RateLimitGroupEditor } from '@/features/system-settings/auth-security/components/RateLimitGroupEditor'
import {
  MAX_RATE_LIMIT,
  validateRateLimitGroups,
} from '@/features/system-settings/auth-security/validation'
import { useValidationMessages } from '@/features/system-settings/auth-security/validation-messages'
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
 * `/system-settings/security/rate-limit` — the per-account model request limiter.
 *
 * Five keys, all verified present in `GET /api/option/`:
 *
 *   ModelRequestRateLimitEnabled          'false'
 *   ModelRequestRateLimitDurationMinutes  '1'
 *   ModelRequestRateLimitCount            '0'
 *   ModelRequestRateLimitSuccessCount     '1000'
 *   ModelRequestRateLimitGroup            '{}'
 *
 * WHAT THE TWO COUNTS ACTUALLY DO (`middleware/model-rate-limit.go`, both the Redis and
 * the in-memory handler):
 *   - the SUCCESS count is checked on every request and recorded only when the response
 *     status is under 400. It is always enforced; there is no "0 means unlimited" path,
 *     so setting it to 0 blocks every request.
 *   - the TOTAL count covers failures as well, and is skipped entirely when it is 0
 *     (`if totalMaxCount > 0`). 0 is the shipped default and means "do not count failures".
 * Only `/v1` model traffic passes through this middleware. Console and admin API
 * throttling is configured by environment variables and is not editable here.
 *
 * `ModelRequestRateLimitGroup` overrides both counts for one group, as
 * `{"vip": [total, success]}`. The server validates it with
 * `setting.CheckModelRequestRateLimitGroup` and refuses bad JSON with its own message
 * (verified live: `"not json"` comes back as a parse error), so the client-side check here
 * is a courtesy that saves a round trip, not the only guard. It is edited through
 * `RateLimitGroupEditor`, which offers the legacy console's table and its raw JSON box.
 *
 * AN EMPTY BOX IS SERIALISED TO `{}`. `json.Unmarshal("")` fails server-side, so clearing
 * the overrides and saving answers "unexpected end of JSON input" (verified live). The
 * legacy console sent the empty string and surfaced that refusal to the operator.
 */

type RateLimitDraft = {
  ModelRequestRateLimitEnabled: boolean
  ModelRequestRateLimitDurationMinutes: number
  ModelRequestRateLimitCount: number
  ModelRequestRateLimitSuccessCount: number
  ModelRequestRateLimitGroup: string
}

function toDraft(options: SystemOptionMap | undefined): RateLimitDraft {
  return {
    ModelRequestRateLimitCount: readOptionNumber(options, 'ModelRequestRateLimitCount', 0),
    ModelRequestRateLimitDurationMinutes: readOptionNumber(
      options,
      'ModelRequestRateLimitDurationMinutes',
      1,
    ),
    ModelRequestRateLimitEnabled: readOptionBoolean(options, 'ModelRequestRateLimitEnabled'),
    ModelRequestRateLimitGroup: readOptionString(options, 'ModelRequestRateLimitGroup', '{}'),
    ModelRequestRateLimitSuccessCount: readOptionNumber(
      options,
      'ModelRequestRateLimitSuccessCount',
      1000,
    ),
  }
}

export function RateLimitSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const messages = useValidationMessages()

  const form = useOptionSectionForm<RateLimitDraft>({
    saved: toDraft(optionsQuery.data),
    // A cleared box means "no overrides", which the server spells `{}`; the empty string
    // it would otherwise receive is refused outright.
    serialize: {
      ModelRequestRateLimitGroup: (value: string | number | boolean) => {
        const trimmed = String(value).trim()
        return trimmed === '' ? '{}' : trimmed
      },
    },
    validate: (values) => {
      const errors: Partial<Record<keyof RateLimitDraft & string, string>> = {}

      if (
        !Number.isInteger(values.ModelRequestRateLimitDurationMinutes) ||
        values.ModelRequestRateLimitDurationMinutes < 1
      ) {
        errors.ModelRequestRateLimitDurationMinutes = t('Enter a whole number of 1 or more.')
      }
      if (
        !Number.isInteger(values.ModelRequestRateLimitCount) ||
        values.ModelRequestRateLimitCount < 0 ||
        values.ModelRequestRateLimitCount > MAX_RATE_LIMIT
      ) {
        errors.ModelRequestRateLimitCount = t('Enter a whole number between 0 and 2147483647.')
      }
      if (
        !Number.isInteger(values.ModelRequestRateLimitSuccessCount) ||
        values.ModelRequestRateLimitSuccessCount < 1 ||
        values.ModelRequestRateLimitSuccessCount > MAX_RATE_LIMIT
      ) {
        errors.ModelRequestRateLimitSuccessCount = t('Enter a whole number between 1 and 2147483647.')
      }

      const groupError = validateRateLimitGroups(values.ModelRequestRateLimitGroup)
      if (groupError !== undefined) errors.ModelRequestRateLimitGroup = messages[groupError]

      return errors
    },
  })

  const values = form.values
  const disabled = optionsQuery.isPending || form.isSaving

  return (
    <SettingsSection
      description={t('How many model requests one account may make in a rolling window, and which groups get their own allowance.')}
      form={form}
      note={t('These limits apply to model traffic only. Throttling of the console and the admin API is configured by environment variables and cannot be changed here.')}
      saveMode="section"
      title={t('Rate limiting')}
    >
      <SwitchRow
        checked={values.ModelRequestRateLimitEnabled}
        description={t('While this is off, none of the values below are consulted and model requests are not counted.')}
        disabled={disabled}
        label={t('Limit model requests')}
        onCheckedChange={(checked) => form.setField('ModelRequestRateLimitEnabled', checked)}
      />

      <div className="grid gap-5 md:grid-cols-3">
        <NumberInput
          description={t('The length of the rolling window, in minutes.')}
          disabled={disabled}
          error={form.errors.ModelRequestRateLimitDurationMinutes}
          invalid={form.errors.ModelRequestRateLimitDurationMinutes !== undefined}
          label={t('Window (minutes)')}
          min={1}
          onValueChange={(value) =>
            form.setField('ModelRequestRateLimitDurationMinutes', value ?? Number.NaN)
          }
          step={1}
          value={values.ModelRequestRateLimitDurationMinutes}
        />
        <NumberInput
          description={t('Requests that returned a result. Always enforced — 0 here blocks everything, it does not mean unlimited.')}
          disabled={disabled}
          error={form.errors.ModelRequestRateLimitSuccessCount}
          invalid={form.errors.ModelRequestRateLimitSuccessCount !== undefined}
          label={t('Successful requests per window')}
          min={1}
          onValueChange={(value) =>
            form.setField('ModelRequestRateLimitSuccessCount', value ?? Number.NaN)
          }
          step={1}
          value={values.ModelRequestRateLimitSuccessCount}
        />
        <NumberInput
          description={t('Every request including the ones that failed. 0 turns this second limit off entirely.')}
          disabled={disabled}
          error={form.errors.ModelRequestRateLimitCount}
          invalid={form.errors.ModelRequestRateLimitCount !== undefined}
          label={t('Total requests per window')}
          min={0}
          onValueChange={(value) => form.setField('ModelRequestRateLimitCount', value ?? Number.NaN)}
          step={1}
          value={values.ModelRequestRateLimitCount}
        />
      </div>

      {values.ModelRequestRateLimitEnabled && values.ModelRequestRateLimitSuccessCount === 0 ? (
        <Alert icon={<InfoIcon aria-hidden="true" />} live="status" title={t('This blocks every request')} tone="warning">
          {t('The successful-request limit has no “unlimited” value. At 0, the very first model request of each window is refused with 429.')}
        </Alert>
      ) : null}

      <RateLimitGroupEditor
        disabled={disabled}
        error={form.errors.ModelRequestRateLimitGroup}
        onChange={(next) => form.setField('ModelRequestRateLimitGroup', next)}
        value={values.ModelRequestRateLimitGroup}
      />
    </SettingsSection>
  )
}
