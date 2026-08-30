import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { NumberInput, SwitchRow, Textarea } from '@/components/form'
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
import {
  compactJson,
  formatJsonForEditing,
  jsonErrorMessage,
  validateJsonText,
} from '@/features/system-settings/models-operations/json-text'

/**
 * `/system-settings/models/claude`
 *
 * Four keys, all present in `GET /api/option/`:
 *
 *   claude.model_headers_settings                    '{}'
 *   claude.default_max_tokens                        '{"default":8192}'
 *   claude.thinking_adapter_enabled                  'true'
 *   claude.thinking_adapter_budget_tokens_percentage '0.8'
 *
 * `claude.default_max_tokens` is validated server-side and the message is specific:
 * writing `{"default":"nope"}` answers
 * `"Claude default max tokens must be a JSON map of model to integer: json: cannot
 * unmarshal string into Go value of type int"` (verified live). The integer-map check below
 * catches that before the round trip; a refusal that still gets through is rendered per key
 * by the section wrapper.
 */

type ClaudeDraft = {
  'claude.model_headers_settings': string
  'claude.default_max_tokens': string
  'claude.thinking_adapter_enabled': boolean
  'claude.thinking_adapter_budget_tokens_percentage': number
}

function toDraft(options: SystemOptionMap | undefined): ClaudeDraft {
  return {
    'claude.default_max_tokens': formatJsonForEditing(
      readOptionString(options, 'claude.default_max_tokens', '{}'),
    ),
    'claude.model_headers_settings': formatJsonForEditing(
      readOptionString(options, 'claude.model_headers_settings', '{}'),
    ),
    'claude.thinking_adapter_budget_tokens_percentage': readOptionNumber(
      options,
      'claude.thinking_adapter_budget_tokens_percentage',
      0.8,
    ),
    'claude.thinking_adapter_enabled': readOptionBoolean(
      options,
      'claude.thinking_adapter_enabled',
      true,
    ),
  }
}

const serializeClaude = {
  'claude.default_max_tokens': (value: string | number | boolean) => compactJson(String(value), '{}'),
  'claude.model_headers_settings': (value: string | number | boolean) =>
    compactJson(String(value), '{}'),
}

export function ClaudeSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<ClaudeDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializeClaude,
    validate: (values) => {
      const errors: Partial<Record<keyof ClaudeDraft, string>> = {}

      errors['claude.model_headers_settings'] = jsonErrorMessage(
        validateJsonText(values['claude.model_headers_settings'], 'object'),
        t,
      )
      errors['claude.default_max_tokens'] = jsonErrorMessage(
        validateJsonText(values['claude.default_max_tokens'], 'integer-map'),
        t,
      )

      const budget = values['claude.thinking_adapter_budget_tokens_percentage']
      if (budget < 0.1 || budget > 1) {
        errors['claude.thinking_adapter_budget_tokens_percentage'] = t('Enter a fraction between {{min}} and {{max}}.', { max: 1, min: 0.1 })
      }
      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const adapterEnabled = form.values['claude.thinking_adapter_enabled']

  return (
    <SettingsSection
      description={t('Per-model request shaping applied to Anthropic upstreams.')}
      form={form}
      note={t('Both maps accept "default" as the entry that covers every model you do not name.')}
      saveMode="section"
      title={t('Claude')}
    >
      <Textarea
        description={t('A JSON object mapping a model name to the request headers sent with it. This is how a beta header — an extended context window, for instance — is turned on for one model without affecting the others.')}
        disabled={disabled}
        error={form.errors['claude.model_headers_settings']}
        invalid={form.errors['claude.model_headers_settings'] !== undefined}
        label={t('Request headers per model')}
        onChange={(event) => form.setField('claude.model_headers_settings', event.target.value)}
        rows={6}
        spellCheck={false}
        textareaClassName="mono text-xs"
        value={form.values['claude.model_headers_settings']}
      />

      <Textarea
        description={t('A JSON object mapping a model name to a whole number of tokens, used when the caller sends no max_tokens of its own. Every value must be a whole number — the server refuses the write otherwise.')}
        disabled={disabled}
        error={form.errors['claude.default_max_tokens']}
        invalid={form.errors['claude.default_max_tokens'] !== undefined}
        label={t('Default max tokens per model')}
        onChange={(event) => form.setField('claude.default_max_tokens', event.target.value)}
        rows={5}
        spellCheck={false}
        textareaClassName="mono text-xs"
        value={form.values['claude.default_max_tokens']}
      />

      <Separator />

      <SwitchRow
        checked={adapterEnabled}
        description={t('Turns a -thinking model name into a native Anthropic thinking request rather than passing the suffix upstream, so the same model name works across vendors.')}
        disabled={disabled}
        label={t('Handle -thinking model names')}
        onCheckedChange={(checked) => form.setField('claude.thinking_adapter_enabled', checked)}
      />

      <NumberInput
        description={t('Thinking budget = max tokens × this fraction. It caps what a thinking request may spend, so it is a direct lever on the cost of every -thinking call.')}
        disabled={disabled || !adapterEnabled}
        error={form.errors['claude.thinking_adapter_budget_tokens_percentage']}
        invalid={form.errors['claude.thinking_adapter_budget_tokens_percentage'] !== undefined}
        label={t('Thinking budget as a fraction of max tokens')}
        max={1}
        min={0.1}
        onValueChange={(value) =>
          form.setField('claude.thinking_adapter_budget_tokens_percentage', value ?? Number.NaN)
        }
        step="any"
        value={form.values['claude.thinking_adapter_budget_tokens_percentage']}
      />
    </SettingsSection>
  )
}
