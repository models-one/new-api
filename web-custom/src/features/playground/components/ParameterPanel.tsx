import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw'
import { useTranslation } from 'react-i18next'

import { NumberInput, Switch, Textarea } from '@/components/form'
import { Button, Panel } from '@/components/ui'
import {
  PARAMETER_CONTROLS,
  normalizeParameterValue,
  type ParameterKey,
} from '@/features/playground/parameters'
import type { ParameterEnabled, PlaygroundConfig } from '@/features/playground/types'

type ParameterPanelProps = {
  config: PlaygroundConfig
  enabled: ParameterEnabled
  systemPrompt: string
  onConfigChange: <K extends keyof PlaygroundConfig>(key: K, value: PlaygroundConfig[K]) => void
  onEnabledChange: (key: ParameterKey, value: boolean) => void
  onSystemPromptChange: (value: string) => void
  onReset: () => void
}

/**
 * Request parameters.
 *
 * Each parameter has an on/off switch as well as a value, mirroring the legacy console:
 * a disabled parameter is OMITTED from the request body entirely rather than sent at its
 * default, because some upstreams reject `max_tokens` or `seed` outright and others
 * behave differently when a parameter is absent versus set to its neutral value.
 */
export function ParameterPanel(props: ParameterPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <Panel.Header
          headingLevel={3}
          title={t('System prompt')}
          description={t('Sent as the first message of every request.')}
        />
        <Panel.Body>
          <Textarea
            description={t('Leave empty to send no system message.')}
            hideLabel
            label={t('System prompt')}
            onChange={(event) => props.onSystemPromptChange(event.target.value)}
            placeholder={t('You are a helpful assistant.')}
            rows={4}
            value={props.systemPrompt}
          />
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Header
          headingLevel={3}
          title={t('Parameters')}
          description={t('Switched-off parameters are left out of the request.')}
          actions={
            <Button aria-label={t('Reset parameters')} onClick={props.onReset} size="sm" variant="quiet">
              <RotateCcwIcon aria-hidden="true" />
              {t('Reset')}
            </Button>
          }
        />

        <Panel.Body className="flex flex-col gap-5">
          <Switch
            checked={props.config.stream}
            description={t('Render the reply token by token over SSE.')}
            label={t('Stream the response')}
            onCheckedChange={(checked) => props.onConfigChange('stream', checked)}
          />

          {PARAMETER_CONTROLS.map((control) => {
            const isOn = props.enabled[control.key]
            const value = props.config[control.key]
            const inputId = `playground-param-${control.key}`

            return (
              <div className="flex flex-col gap-2 border-t border-border pt-4" key={control.key}>
                <Switch
                  checked={isOn}
                  description={t(control.description)}
                  label={t(control.label)}
                  onCheckedChange={(checked) => props.onEnabledChange(control.key, checked)}
                  size="sm"
                />

                {control.kind === 'slider' ? (
                  <div className="flex items-center gap-3 pl-12">
                    <input
                      aria-label={t(control.label)}
                      className="field h-2 w-full cursor-pointer appearance-none p-0 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!isOn}
                      id={inputId}
                      max={control.max}
                      min={control.min}
                      onChange={(event) =>
                        props.onConfigChange(
                          control.key,
                          normalizeParameterValue(control.key, event.target.value) ?? control.min,
                        )
                      }
                      step={control.step}
                      type="range"
                      value={typeof value === 'number' ? value : control.min}
                    />
                    <output
                      className="mono w-12 shrink-0 text-right text-xs text-muted"
                      htmlFor={inputId}
                    >
                      {typeof value === 'number' ? value : control.min}
                    </output>
                  </div>
                ) : (
                  <div className="pl-12">
                    <NumberInput
                      disabled={!isOn}
                      hideLabel
                      id={inputId}
                      label={t(control.label)}
                      max={control.max}
                      min={control.min}
                      onValueChange={(next) => {
                        const normalized = normalizeParameterValue(
                          control.key,
                          next === null ? '' : next,
                        )
                        // `seed` is the only parameter with a legitimate null state;
                        // branching here keeps both writes exactly typed.
                        if (control.key === 'seed') props.onConfigChange('seed', normalized)
                        else if (normalized !== null) {
                          props.onConfigChange(control.key, normalized)
                        }
                      }}
                      placeholder={control.key === 'seed' ? t('Not set') : undefined}
                      step={control.step}
                      value={value === null ? '' : value}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </Panel.Body>
      </Panel>
    </div>
  )
}
