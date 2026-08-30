import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { NumberInput, SwitchRow, Textarea } from '@/components/form'
import { Badge } from '@/components/ui'
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
  compactJson,
  formatJsonForEditing,
  jsonErrorMessage,
  validateJsonText,
} from '@/features/system-settings/models-operations/json-text'

/**
 * `/system-settings/models/global`
 *
 * Five keys, all present in `GET /api/option/` on the dev server:
 *
 *   global.pass_through_request_enabled            'false'
 *   global.thinking_model_blacklist                '["moonshotai/kimi-k2-thinking","kimi-k2-thinking"]'
 *   global.chat_completions_to_responses_policy    '{"enabled":false,"all_channels":true}'
 *   general_setting.ping_interval_enabled          'false'
 *   general_setting.ping_interval_seconds          '60'
 *
 * Saved per SECTION: the two JSON blobs are edited as text and a per-keystroke commit
 * would write half-typed JSON. Neither of these two keys is validated server-side (unlike
 * `gemini.safety_settings`), so the browser is the only thing standing between a typo and
 * a stored blob the gateway will silently fail to parse — hence the shape checks below.
 */

type GlobalDraft = {
  'global.pass_through_request_enabled': boolean
  'global.thinking_model_blacklist': string
  'global.chat_completions_to_responses_policy': string
  'general_setting.ping_interval_enabled': boolean
  'general_setting.ping_interval_seconds': number
}

function toDraft(options: SystemOptionMap | undefined): GlobalDraft {
  return {
    'general_setting.ping_interval_enabled': readOptionBoolean(
      options,
      'general_setting.ping_interval_enabled',
    ),
    'general_setting.ping_interval_seconds': readOptionNumber(
      options,
      'general_setting.ping_interval_seconds',
      60,
    ),
    'global.chat_completions_to_responses_policy': formatJsonForEditing(
      readOptionString(options, 'global.chat_completions_to_responses_policy', '{}'),
    ),
    'global.pass_through_request_enabled': readOptionBoolean(
      options,
      'global.pass_through_request_enabled',
    ),
    'global.thinking_model_blacklist': formatJsonForEditing(
      readOptionString(options, 'global.thinking_model_blacklist', '[]'),
    ),
  }
}

/** Compacted on the way out so re-indenting the same JSON is not a change. */
const serializeGlobal = {
  'global.chat_completions_to_responses_policy': (value: string | number | boolean) =>
    compactJson(String(value), '{}'),
  'global.thinking_model_blacklist': (value: string | number | boolean) =>
    compactJson(String(value), '[]'),
}

export function GlobalModelsSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<GlobalDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializeGlobal,
    validate: (values) => {
      const errors: Partial<Record<keyof GlobalDraft, string>> = {}

      errors['global.thinking_model_blacklist'] = jsonErrorMessage(
        validateJsonText(values['global.thinking_model_blacklist'], 'string-array'),
        t,
      )
      errors['global.chat_completions_to_responses_policy'] = jsonErrorMessage(
        validateJsonText(values['global.chat_completions_to_responses_policy'], 'object'),
        t,
      )

      if (values['general_setting.ping_interval_seconds'] < 1) {
        errors['general_setting.ping_interval_seconds'] = t('Enter one second or more.')
      }
      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const pingEnabled = form.values['general_setting.ping_interval_enabled']

  return (
    <SettingsSection
      description={t('Behaviour applied to every upstream request, whichever vendor serves it.')}
      form={form}
      note={t('An empty blacklist is written as [] and an empty policy as {}, never as an empty value.')}
      saveMode="section"
      title={t('Global model configuration')}
    >
      <SwitchRow
        checked={form.values['global.pass_through_request_enabled']}
        description={t('Forwards the request body to the upstream provider untouched. Suffix handling, parameter rewriting and response normalisation are all skipped, so anything this console does to make vendors interchangeable stops applying.')}
        disabled={disabled}
        label={t('Pass requests through unmodified')}
        onCheckedChange={(checked) => form.setField('global.pass_through_request_enabled', checked)}
      />

      <Textarea
        description={t('A JSON array of model names. These models never have a -thinking or -nothinking suffix added or stripped, so the name reaches the upstream exactly as the caller wrote it.')}
        disabled={disabled}
        error={form.errors['global.thinking_model_blacklist']}
        invalid={form.errors['global.thinking_model_blacklist'] !== undefined}
        label={t('Models that skip thinking-suffix handling')}
        onChange={(event) => form.setField('global.thinking_model_blacklist', event.target.value)}
        rows={5}
        spellCheck={false}
        textareaClassName="mono text-xs"
        value={form.values['global.thinking_model_blacklist']}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">
            {t('Chat Completions to Responses compatibility')}
          </p>
          <Badge size="sm" tone="warning">
            {t('Preview')}
          </Badge>
        </div>
        <Textarea
          description={t('A JSON object: enabled, all_channels, and optionally channel_ids and model_patterns. This rewrites matching /v1/chat/completions traffic onto the upstream Responses API — an experimental path whose configuration shape may still change.')}
          disabled={disabled}
          error={form.errors['global.chat_completions_to_responses_policy']}
          hideLabel
          invalid={form.errors['global.chat_completions_to_responses_policy'] !== undefined}
          label={t('Chat Completions to Responses policy')}
          onChange={(event) =>
            form.setField('global.chat_completions_to_responses_policy', event.target.value)
          }
          rows={6}
          spellCheck={false}
          textareaClassName="mono text-xs"
          value={form.values['global.chat_completions_to_responses_policy']}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <SwitchRow
          checked={pingEnabled}
          description={t('Sends a periodic ping frame on a streaming response so an idle proxy does not drop the connection.')}
          disabled={disabled}
          label={t('Keep-alive ping on streaming responses')}
          onCheckedChange={(checked) =>
            form.setField('general_setting.ping_interval_enabled', checked)
          }
        />
        <NumberInput
          description={t('Kept high on purpose: a short interval can look like abuse to an upstream and get the deployment throttled.')}
          disabled={disabled || !pingEnabled}
          error={form.errors['general_setting.ping_interval_seconds']}
          invalid={form.errors['general_setting.ping_interval_seconds'] !== undefined}
          label={t('Ping interval (seconds)')}
          min={1}
          onValueChange={(value) =>
            form.setField('general_setting.ping_interval_seconds', value ?? Number.NaN)
          }
          step={1}
          value={form.values['general_setting.ping_interval_seconds']}
        />
      </div>
    </SettingsSection>
  )
}
