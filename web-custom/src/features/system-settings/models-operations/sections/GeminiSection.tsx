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
 * `/system-settings/models/gemini`
 *
 * Seven keys, all present in `GET /api/option/`:
 *
 *   gemini.safety_settings                          '{"default":"OFF"}'
 *   gemini.version_settings                         '{"default":"v1beta","gemini-1.0-pro":"v1"}'
 *   gemini.supported_imagine_models                 '["gemini-2.0-flash-exp-image-generation",…]'
 *   gemini.thinking_adapter_enabled                 'false'
 *   gemini.thinking_adapter_budget_tokens_percentage '0.6'
 *   gemini.function_call_thought_signature_enabled  'true'
 *   gemini.remove_function_response_id_enabled      'true'
 *
 * `gemini.safety_settings` is the one key here the SERVER validates: writing `{"default":`
 * comes back as HTTP 200 with
 * `{"success":false,"message":"Gemini safety settings must be a JSON string map: unexpected
 * end of JSON input"}` (verified live). The other two blobs are stored unchecked, so the
 * browser is the only validation they get — all three are shape-checked before the write.
 */

type GeminiDraft = {
  'gemini.safety_settings': string
  'gemini.version_settings': string
  'gemini.supported_imagine_models': string
  'gemini.thinking_adapter_enabled': boolean
  'gemini.thinking_adapter_budget_tokens_percentage': number
  'gemini.function_call_thought_signature_enabled': boolean
  'gemini.remove_function_response_id_enabled': boolean
}

function toDraft(options: SystemOptionMap | undefined): GeminiDraft {
  return {
    'gemini.function_call_thought_signature_enabled': readOptionBoolean(
      options,
      'gemini.function_call_thought_signature_enabled',
      true,
    ),
    'gemini.remove_function_response_id_enabled': readOptionBoolean(
      options,
      'gemini.remove_function_response_id_enabled',
      true,
    ),
    'gemini.safety_settings': formatJsonForEditing(
      readOptionString(options, 'gemini.safety_settings', '{}'),
    ),
    'gemini.supported_imagine_models': formatJsonForEditing(
      readOptionString(options, 'gemini.supported_imagine_models', '[]'),
    ),
    'gemini.thinking_adapter_budget_tokens_percentage': readOptionNumber(
      options,
      'gemini.thinking_adapter_budget_tokens_percentage',
      0.6,
    ),
    'gemini.thinking_adapter_enabled': readOptionBoolean(
      options,
      'gemini.thinking_adapter_enabled',
    ),
    'gemini.version_settings': formatJsonForEditing(
      readOptionString(options, 'gemini.version_settings', '{}'),
    ),
  }
}

const serializeGemini = {
  'gemini.safety_settings': (value: string | number | boolean) => compactJson(String(value), '{}'),
  'gemini.supported_imagine_models': (value: string | number | boolean) =>
    compactJson(String(value), '[]'),
  'gemini.version_settings': (value: string | number | boolean) => compactJson(String(value), '{}'),
}

export function GeminiSection() {
  const { t } = useTranslation()
  const optionsQuery = useQuery(systemOptionsQuery())

  const form = useOptionSectionForm<GeminiDraft>({
    saved: toDraft(optionsQuery.data),
    serialize: serializeGemini,
    validate: (values) => {
      const errors: Partial<Record<keyof GeminiDraft, string>> = {}

      errors['gemini.safety_settings'] = jsonErrorMessage(
        validateJsonText(values['gemini.safety_settings'], 'string-map'),
        t,
      )
      errors['gemini.version_settings'] = jsonErrorMessage(
        validateJsonText(values['gemini.version_settings'], 'string-map'),
        t,
      )
      errors['gemini.supported_imagine_models'] = jsonErrorMessage(
        validateJsonText(values['gemini.supported_imagine_models'], 'string-array'),
        t,
      )

      const budget = values['gemini.thinking_adapter_budget_tokens_percentage']
      if (budget < 0.002 || budget > 1) {
        errors['gemini.thinking_adapter_budget_tokens_percentage'] = t('Enter a fraction between {{min}} and {{max}}.', { max: 1, min: 0.002 })
      }
      return errors
    },
  })

  const disabled = optionsQuery.isPending || form.isSaving
  const adapterEnabled = form.values['gemini.thinking_adapter_enabled']

  return (
    <SettingsSection
      description={t('Per-model overrides and request adaptations applied to Gemini upstreams.')}
      form={form}
      note={t('An empty map is written as {} and an empty list as [], so clearing a field restores the built-in behaviour rather than storing nothing.')}
      saveMode="section"
      title={t('Gemini')}
    >
      <Textarea
        description={t('A JSON object mapping a safety category to a threshold, with "default" as the fallback for every category you do not name. The server rejects anything that is not a map of strings.')}
        disabled={disabled}
        error={form.errors['gemini.safety_settings']}
        invalid={form.errors['gemini.safety_settings'] !== undefined}
        label={t('Safety category overrides')}
        onChange={(event) => form.setField('gemini.safety_settings', event.target.value)}
        rows={5}
        spellCheck={false}
        textareaClassName="mono text-xs"
        value={form.values['gemini.safety_settings']}
      />

      <Textarea
        description={t('A JSON object mapping a model name to the Gemini API version used for it, with "default" covering the rest.')}
        disabled={disabled}
        error={form.errors['gemini.version_settings']}
        invalid={form.errors['gemini.version_settings'] !== undefined}
        label={t('API version per model')}
        onChange={(event) => form.setField('gemini.version_settings', event.target.value)}
        rows={5}
        spellCheck={false}
        textareaClassName="mono text-xs"
        value={form.values['gemini.version_settings']}
      />

      <Textarea
        description={t('A JSON array of model names that are allowed to serve image generation requests. A model missing from this list is not offered the image path.')}
        disabled={disabled}
        error={form.errors['gemini.supported_imagine_models']}
        invalid={form.errors['gemini.supported_imagine_models'] !== undefined}
        label={t('Models that can generate images')}
        onChange={(event) => form.setField('gemini.supported_imagine_models', event.target.value)}
        rows={6}
        spellCheck={false}
        textareaClassName="mono text-xs"
        value={form.values['gemini.supported_imagine_models']}
      />

      <Separator />

      <SwitchRow
        checked={adapterEnabled}
        description={t('Turns a -thinking model name into a native Gemini thinking request instead of passing the suffix upstream, so the same model name works across vendors.')}
        disabled={disabled}
        label={t('Handle -thinking model names')}
        onCheckedChange={(checked) => form.setField('gemini.thinking_adapter_enabled', checked)}
      />

      <NumberInput
        description={t('Thinking budget = max tokens × this fraction. It caps what a thinking request may spend, so it is a direct lever on the cost of every -thinking call.')}
        disabled={disabled || !adapterEnabled}
        error={form.errors['gemini.thinking_adapter_budget_tokens_percentage']}
        invalid={form.errors['gemini.thinking_adapter_budget_tokens_percentage'] !== undefined}
        label={t('Thinking budget as a fraction of max tokens')}
        max={1}
        min={0.002}
        onValueChange={(value) =>
          form.setField('gemini.thinking_adapter_budget_tokens_percentage', value ?? Number.NaN)
        }
        step="any"
        value={form.values['gemini.thinking_adapter_budget_tokens_percentage']}
      />

      <Separator />

      <SwitchRow
        checked={form.values['gemini.function_call_thought_signature_enabled']}
        description={t('Fills in the thoughtSignature field on a function call so a multi-turn tool conversation keeps working when the caller does not send one back.')}
        disabled={disabled}
        label={t('Fill in the function-call thought signature')}
        onCheckedChange={(checked) =>
          form.setField('gemini.function_call_thought_signature_enabled', checked)
        }
      />

      <SwitchRow
        checked={form.values['gemini.remove_function_response_id_enabled']}
        description={t('Strips the id field from a functionResponse before it is forwarded. Gemini rejects some ids that other vendors accept, so removing it keeps a cross-vendor tool call working.')}
        disabled={disabled}
        label={t('Remove the functionResponse id')}
        onCheckedChange={(checked) =>
          form.setField('gemini.remove_function_response_id_enabled', checked)
        }
      />
    </SettingsSection>
  )
}
