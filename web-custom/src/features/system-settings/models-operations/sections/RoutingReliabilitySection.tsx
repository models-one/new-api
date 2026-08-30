import { useQuery } from '@tanstack/react-query'
import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useTranslation } from 'react-i18next'

import { Input, NativeSelect, NumberInput, SwitchRow, Textarea } from '@/components/form'
import { Alert, Separator } from '@/components/ui'
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
  countStatusCodes,
  parseStatusCodeRules,
} from '@/features/system-settings/models-operations/status-code-rules'

/**
 * `/system-settings/models/routing-reliability`
 *
 * THE SECTION THAT CAN TAKE THE DEPLOYMENT OFFLINE. Auto-disable acts on a channel the
 * moment a rule matches, and a channel that is disabled serves nothing. The controls below
 * therefore say what each threshold DOES to a channel, not what it is called:
 *
 *   AutomaticDisableStatusCodes  every upstream response whose status falls in this set
 *                                disables the channel that produced it
 *                                (`controller/channel-test.go`). `401` alone is the seeded
 *                                value; widening it to `500-599` hands every upstream
 *                                hiccup the power to take a channel down.
 *   AutomaticDisableKeywords     a case-insensitive substring match on the upstream error
 *                                body, one phrase per line, with the same consequence.
 *   ChannelDisableThreshold      seconds; a scheduled test slower than this disables the
 *                                channel (the backend multiplies by 1000 for milliseconds).
 *   AutomaticEnableChannelEnabled the only thing that brings an auto-disabled channel back
 *                                on its own. Off means every disable is permanent until an
 *                                operator clears it by hand.
 *
 * Ten keys, all present in `GET /api/option/`. Saved per SECTION: retry, disable and test
 * settings are one policy and are set together.
 *
 * Both status-code keys are ALSO validated server-side —
 * `operation_setting.ParseHTTPStatusCodeRanges` refuses `999-abc` with
 * "invalid http status code rules: 999-abc" (verified live). The client parse below exists
 * to catch it first and to show the normalised text that will actually be stored.
 */

const CHANNEL_TEST_MODES = ['scheduled_all', 'passive_recovery'] as const
type ChannelTestMode = (typeof CHANNEL_TEST_MODES)[number]

function toChannelTestMode(value: string): ChannelTestMode {
  return value === 'passive_recovery' ? 'passive_recovery' : 'scheduled_all'
}

type RoutingDraft = {
  RetryTimes: number
  AutomaticRetryStatusCodes: string
  'monitor_setting.auto_test_channel_enabled': boolean
  'monitor_setting.channel_test_mode': string
  'monitor_setting.auto_test_channel_minutes': number
  AutomaticEnableChannelEnabled: boolean
  AutomaticDisableChannelEnabled: boolean
  ChannelDisableThreshold: number
  AutomaticDisableStatusCodes: string
  AutomaticDisableKeywords: string
}

function toDraft(options: SystemOptionMap | undefined): RoutingDraft {
  return {
    AutomaticDisableChannelEnabled: readOptionBoolean(options, 'AutomaticDisableChannelEnabled'),
    // Pasted from an editor this can arrive with CRLF; the backend matches on the raw text.
    AutomaticDisableKeywords: readOptionString(options, 'AutomaticDisableKeywords').replace(
      /\r\n/g,
      '\n',
    ),
    AutomaticDisableStatusCodes: readOptionString(options, 'AutomaticDisableStatusCodes'),
    AutomaticEnableChannelEnabled: readOptionBoolean(options, 'AutomaticEnableChannelEnabled'),
    AutomaticRetryStatusCodes: readOptionString(options, 'AutomaticRetryStatusCodes'),
    ChannelDisableThreshold: readOptionNumber(options, 'ChannelDisableThreshold', 5),
    'monitor_setting.auto_test_channel_enabled': readOptionBoolean(
      options,
      'monitor_setting.auto_test_channel_enabled',
    ),
    'monitor_setting.auto_test_channel_minutes': readOptionNumber(
      options,
      'monitor_setting.auto_test_channel_minutes',
      10,
    ),
    'monitor_setting.channel_test_mode': toChannelTestMode(
      readOptionString(options, 'monitor_setting.channel_test_mode', 'scheduled_all'),
    ),
    RetryTimes: readOptionNumber(options, 'RetryTimes'),
  }
}

/** Both rule strings are normalised on the way out, exactly as the server stores them. */
const serializeRouting = {
  AutomaticDisableKeywords: (value: string | number | boolean) =>
    String(value).replace(/\r\n/g, '\n'),
  AutomaticDisableStatusCodes: (value: string | number | boolean) =>
    parseStatusCodeRules(String(value)).normalized,
  AutomaticRetryStatusCodes: (value: string | number | boolean) =>
    parseStatusCodeRules(String(value)).normalized,
}

export function RoutingReliabilitySection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<RoutingDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializeRouting,
    validate: (values) => {
      const errors: Partial<Record<keyof RoutingDraft, string>> = {}

      const disableRules = parseStatusCodeRules(values.AutomaticDisableStatusCodes)
      if (!disableRules.ok) {
        errors.AutomaticDisableStatusCodes = t('Not a status code or range: {{tokens}}', {
          tokens: disableRules.invalidTokens.join(', '),
        })
      }

      const retryRules = parseStatusCodeRules(values.AutomaticRetryStatusCodes)
      if (!retryRules.ok) {
        errors.AutomaticRetryStatusCodes = t('Not a status code or range: {{tokens}}', {
          tokens: retryRules.invalidTokens.join(', '),
        })
      }

      if (values.RetryTimes < 0 || values.RetryTimes > 10) {
        errors.RetryTimes = t('Enter a whole number between 0 and 10.')
      }
      if (values.ChannelDisableThreshold < 0) {
        errors.ChannelDisableThreshold = t('Enter zero or more seconds.')
      }
      if (values['monitor_setting.auto_test_channel_minutes'] < 1) {
        errors['monitor_setting.auto_test_channel_minutes'] = t('Enter one minute or more.')
      }
      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const values = form.values

  const disableRules = parseStatusCodeRules(values.AutomaticDisableStatusCodes)
  const retryRules = parseStatusCodeRules(values.AutomaticRetryStatusCodes)
  const testMode = toChannelTestMode(values['monitor_setting.channel_test_mode'])
  const autoDisableOn = values.AutomaticDisableChannelEnabled

  const disableKeywordCount = values.AutomaticDisableKeywords.split('\n').filter(
    (line) => line.trim() !== '',
  ).length

  /**
   * Only for a field the operator has actually edited. The section writes its DIRTY keys
   * and nothing else, and `AutomaticRetryStatusCodes` ships with abutting ranges
   * (`409-499,500-503`) that this parser merges — so on a pristine section the hint would
   * announce a rewrite that is never going to happen.
   */
  const normalisedHint = (
    key: 'AutomaticDisableStatusCodes' | 'AutomaticRetryStatusCodes',
    parsed: ReturnType<typeof parseStatusCodeRules>,
  ) =>
    form.isFieldDirty(key) && parsed.ok && parsed.normalized !== values[key].trim()
      ? t('Stored as {{normalized}}.', { normalized: parsed.normalized })
      : undefined

  return (
    <SettingsSection
      description={t('How a failing upstream is retried, when a channel is taken out of rotation, and what brings it back.')}
      form={form}
      note={t('A disabled channel serves no traffic at all. If nothing here can re-enable a channel, every automatic disable has to be undone by hand on the channels page.')}
      saveMode="section"
      title={t('Routing reliability')}
    >
      {autoDisableOn && !values.AutomaticEnableChannelEnabled ? (
        <Alert
          icon={<TriangleAlertIcon aria-hidden="true" />}
          title={t('Auto-disable is on and nothing re-enables a channel')}
          tone="warning"
        >
          {t('A channel taken down by a matching status code, keyword or slow test stays down until someone re-enables it by hand. Turn on “Bring a channel back after a successful test” unless that is what you intend.')}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4">
        <p className="eyebrow">{t('Request retry')}</p>
        <div className="grid gap-5 md:grid-cols-2">
          <NumberInput
            description={t('How many other channels one failed request may be re-sent to before the caller gets the error. 0 means the first failure is returned.')}
            disabled={disabled}
            error={form.errors.RetryTimes}
            invalid={form.errors.RetryTimes !== undefined}
            label={t('Retry attempts')}
            max={10}
            min={0}
            onValueChange={(value) => form.setField('RetryTimes', value ?? Number.NaN)}
            step={1}
            value={values.RetryTimes}
          />
          <Input
            description={
              normalisedHint('AutomaticRetryStatusCodes', retryRules)
              ?? t('Comma separated codes and inclusive ranges, e.g. 429,500-599. A response in this set is retried on another channel; it does not disable anything.')
            }
            disabled={disabled}
            error={form.errors.AutomaticRetryStatusCodes}
            invalid={form.errors.AutomaticRetryStatusCodes !== undefined}
            label={t('Status codes that trigger a retry')}
            onChange={(event) => form.setField('AutomaticRetryStatusCodes', event.target.value)}
            placeholder="429,500-599"
            value={values.AutomaticRetryStatusCodes}
          />
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-4">
        <p className="eyebrow">{t('Channel health checks')}</p>
        <SwitchRow
          checked={values['monitor_setting.auto_test_channel_enabled']}
          description={t('Runs the channel test on a timer in the background. With auto-disable on, a failing or slow test is what takes a channel out of rotation.')}
          disabled={disabled}
          label={t('Test channels on a schedule')}
          onCheckedChange={(checked) =>
            form.setField('monitor_setting.auto_test_channel_enabled', checked)
          }
        />
        <SwitchRow
          checked={values.AutomaticEnableChannelEnabled}
          description={t('An automatically disabled channel is put back into rotation once it passes a test again. Channels disabled by hand are never re-enabled this way.')}
          disabled={disabled}
          label={t('Bring a channel back after a successful test')}
          onCheckedChange={(checked) => form.setField('AutomaticEnableChannelEnabled', checked)}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <NativeSelect
            description={
              testMode === 'passive_recovery'
                ? t('Only already auto-disabled channels are probed, to see whether they have recovered. Healthy channels are never touched.')
                : t('Every channel that was not disabled by hand is probed on each pass.')
            }
            disabled={disabled}
            label={t('What the scheduled test covers')}
            onChange={(event) =>
              form.setField('monitor_setting.channel_test_mode', event.target.value)
            }
            options={[
              { label: t('Test every channel'), value: 'scheduled_all' },
              { label: t('Only re-check disabled channels'), value: 'passive_recovery' },
            ]}
            value={testMode}
          />
          <NumberInput
            description={t('How often the scheduled pass runs.')}
            disabled={disabled || !values['monitor_setting.auto_test_channel_enabled']}
            error={form.errors['monitor_setting.auto_test_channel_minutes']}
            invalid={form.errors['monitor_setting.auto_test_channel_minutes'] !== undefined}
            label={t('Test interval (minutes)')}
            min={1}
            onValueChange={(value) =>
              form.setField('monitor_setting.auto_test_channel_minutes', value ?? Number.NaN)
            }
            step={1}
            value={values['monitor_setting.auto_test_channel_minutes']}
          />
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-4">
        <p className="eyebrow">{t('Automatic disabling')}</p>
        <SwitchRow
          checked={autoDisableOn}
          description={t('The master switch for the three rules below. With it off they are stored but nothing acts on them, and no channel is ever disabled automatically.')}
          disabled={disabled}
          label={t('Let the gateway disable a failing channel')}
          onCheckedChange={(checked) => form.setField('AutomaticDisableChannelEnabled', checked)}
        />

        <div className="grid gap-5 md:grid-cols-2">
          <Input
            description={
              normalisedHint('AutomaticDisableStatusCodes', disableRules)
              ?? (disableRules.ok && disableRules.ranges.length > 0
                ? t('{{count}} status code(s) will disable the channel that returned them.', {
                    count: countStatusCodes(disableRules.ranges),
                  })
                : t('Leave empty and no status code disables a channel on its own.'))
            }
            disabled={disabled}
            error={form.errors.AutomaticDisableStatusCodes}
            invalid={form.errors.AutomaticDisableStatusCodes !== undefined}
            label={t('Status codes that disable a channel')}
            onChange={(event) => form.setField('AutomaticDisableStatusCodes', event.target.value)}
            placeholder="401"
            value={values.AutomaticDisableStatusCodes}
          />
          <NumberInput
            description={t('A scheduled test slower than this disables the channel. It is measured against the test request only, not against live traffic.')}
            disabled={disabled}
            error={form.errors.ChannelDisableThreshold}
            invalid={form.errors.ChannelDisableThreshold !== undefined}
            label={t('Disable a channel slower than (seconds)')}
            min={0}
            onValueChange={(value) =>
              form.setField('ChannelDisableThreshold', value ?? Number.NaN)
            }
            step="any"
            value={values.ChannelDisableThreshold}
          />
        </div>

        <Textarea
          description={t('One phrase per line, matched case-insensitively inside the upstream error message. {{count}} phrase(s) are set; any one of them disables the channel that produced the error.', { count: disableKeywordCount })}
          disabled={disabled}
          label={t('Error phrases that disable a channel')}
          onChange={(event) => form.setField('AutomaticDisableKeywords', event.target.value)}
          // NOT translated, and deliberately not run through t(): this is one of the seeded
          // keywords, matched literally against the upstream's own English error body. A
          // localised placeholder would suggest typing a phrase that can never match.
          placeholder="You exceeded your current quota"
          rows={6}
          spellCheck={false}
          textareaClassName="mono text-xs"
          value={values.AutomaticDisableKeywords}
        />
      </div>
    </SettingsSection>
  )
}
