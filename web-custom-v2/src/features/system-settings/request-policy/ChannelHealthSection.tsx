import TriangleAlertIcon from 'lucide-react/dist/esm/icons/triangle-alert'
import { useTranslation } from 'react-i18next'

import { Input, NativeSelect, NumberInput, SwitchRow, Textarea } from '@/components/form'
import { Alert, Separator } from '@/components/ui'
import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import {
  readOptionBoolean,
  readOptionNumber,
  readOptionString,
  type SystemOptionMap,
} from '@/features/system-settings/options-store'
import { usePolicySectionForm } from '@/features/system-settings/request-policy/api'
import {
  countStatusCodes,
  parseStatusCodeRules,
} from '@/features/system-settings/models-operations/status-code-rules'

/**
 * `/system-settings/request-policies/health`
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
 * Read from and saved through `/api/option/request_policy`, which validates the whole
 * policy before writing any key. Retries live with session affinity in the routing section.
 *
 * Both status-code keys are ALSO validated server-side —
 * `operation_setting.ParseHTTPStatusCodeRanges` refuses `999-abc` with
 * "invalid http status code rules: 999-abc" (verified live). The client parse below exists
 * to catch it first and to show the normalised text that will actually be stored.
 */

/** `operation_setting.ChannelTestMode*`; the server reads anything else as `scheduled_all`. */
const CHANNEL_TEST_MODES = ['scheduled_all', 'auto_ban_only', 'passive_recovery'] as const
type ChannelTestMode = (typeof CHANNEL_TEST_MODES)[number]

export function toChannelTestMode(value: string): ChannelTestMode {
  return (CHANNEL_TEST_MODES as readonly string[]).includes(value) ? (value as ChannelTestMode) : 'scheduled_all'
}

type HealthDraft = {
  'monitor_setting.channel_test_concurrency': number
  'monitor_setting.auto_test_channel_enabled': boolean
  'monitor_setting.channel_test_mode': string
  'monitor_setting.auto_test_channel_minutes': number
  AutomaticEnableChannelEnabled: boolean
  AutomaticDisableChannelEnabled: boolean
  ChannelDisableThreshold: number
  AutomaticDisableStatusCodes: string
  AutomaticDisableKeywords: string
}

function toDraft(options: SystemOptionMap | undefined): HealthDraft {
  return {
    AutomaticDisableChannelEnabled: readOptionBoolean(options, 'AutomaticDisableChannelEnabled'),
    // Pasted from an editor this can arrive with CRLF; the backend matches on the raw text.
    AutomaticDisableKeywords: readOptionString(options, 'AutomaticDisableKeywords').replace(
      /\r\n/g,
      '\n',
    ),
    AutomaticDisableStatusCodes: readOptionString(options, 'AutomaticDisableStatusCodes'),
    AutomaticEnableChannelEnabled: readOptionBoolean(options, 'AutomaticEnableChannelEnabled'),
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
    'monitor_setting.channel_test_concurrency': readOptionNumber(options, 'monitor_setting.channel_test_concurrency', 1),
  }
}

/** Both rule strings are normalised on the way out, exactly as the server stores them. */
const serializeHealth = {
  AutomaticDisableKeywords: (value: string | number | boolean) =>
    String(value).replace(/\r\n/g, '\n'),
  AutomaticDisableStatusCodes: (value: string | number | boolean) =>
    parseStatusCodeRules(String(value)).normalized,
}

export function ChannelHealthSection() {
  const { t } = useTranslation()

  const { form, isPending } = usePolicySectionForm<HealthDraft>({
    serialize: serializeHealth,
    toDraft,
    validate: (values) => {
      const errors: Partial<Record<keyof HealthDraft, string>> = {}

      const disableRules = parseStatusCodeRules(values.AutomaticDisableStatusCodes)
      if (!disableRules.ok) {
        errors.AutomaticDisableStatusCodes = t('Not a status code or range: {{tokens}}', {
          tokens: disableRules.invalidTokens.join(', '),
        })
      }

      const concurrency = values['monitor_setting.channel_test_concurrency']
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
        errors['monitor_setting.channel_test_concurrency'] = t('Enter a whole number between 1 and 32.')
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

  const disabled = isPending || form.isSaving
  const values = form.values

  const disableRules = parseStatusCodeRules(values.AutomaticDisableStatusCodes)
  const testMode = toChannelTestMode(values['monitor_setting.channel_test_mode'])
  const TEST_MODE_DESCRIPTIONS: Record<ChannelTestMode, string> = {
    auto_ban_only: t('Periodically checks only channels with auto-disable enabled, excluding manually disabled channels.'),
    passive_recovery: t('Only already auto-disabled channels are probed, to see whether they have recovered. Healthy channels are never touched.'),
    scheduled_all: t('Every channel that was not disabled by hand is probed on each pass.'),
  }
  const testModeDescription = TEST_MODE_DESCRIPTIONS[testMode]
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
    key: 'AutomaticDisableStatusCodes',
    parsed: ReturnType<typeof parseStatusCodeRules>,
  ) =>
    form.isFieldDirty(key) && parsed.ok && parsed.normalized !== values[key].trim()
      ? t('Stored as {{normalized}}.', { normalized: parsed.normalized })
      : undefined

  return (
    <SettingsSection
      description={t('When a channel is taken out of rotation, how channels are tested, and what brings one back.')}
      form={form}
      note={t('A disabled channel serves no traffic at all. If nothing here can re-enable a channel, every automatic disable has to be undone by hand on the channels page.')}
      atomic
      saveMode="section"
      title={t('Channel health')}
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
            description={testModeDescription}
            disabled={disabled}
            label={t('What the scheduled test covers')}
            onChange={(event) =>
              form.setField('monitor_setting.channel_test_mode', event.target.value)
            }
            options={[
              { label: t('Test every channel'), value: 'scheduled_all' },
              { label: t('Actively check auto-disable-enabled channels'), value: 'auto_ban_only' },
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
          <NumberInput
            description={t('How many channels a test pass checks at once, 1 to 32. Higher finishes sooner but sends more test requests at the same time.')}
            disabled={disabled}
            error={form.errors['monitor_setting.channel_test_concurrency']}
            invalid={form.errors['monitor_setting.channel_test_concurrency'] !== undefined}
            label={t('Channels tested at once')}
            max={32}
            min={1}
            onValueChange={(value) => form.setField('monitor_setting.channel_test_concurrency', value ?? Number.NaN)}
            step={1}
            value={values['monitor_setting.channel_test_concurrency']}
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
