import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { NumberInput, Switch, Textarea } from '@/components/form'
import { Button, Panel } from '@/components/ui'
import {
  PARAMETER_CONTROLS,
  normalizeParameterValue,
  type ParameterKey,
} from '@/features/playground/parameters'
import type { ParameterEnabled, PlaygroundConfig } from '@/features/playground/types'

/**
 * Range chrome, drawn by hand.
 *
 * `appearance-none` removes the platform slider, and the stylesheet has no
 * `::-webkit-slider-*` rules, so an unstyled range is an invisible track with the
 * browser's own accent-coloured thumb floating in it. The `.field` class must stay off
 * it too: its 40px min-height and border turned the control into an empty box.
 * The WebKit track has no progress pseudo-element, so the filled part is a gradient
 * stop driven by `--range-fill`; Firefox gets `::-moz-range-progress` instead.
 */
const rangeClasses = [
  'h-6 w-full min-w-0 cursor-pointer appearance-none bg-transparent p-0',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full',
  '[&::-webkit-slider-runnable-track]:bg-[image:var(--range-fill)]',
  '[&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-4',
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
  '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface',
  '[&::-webkit-slider-thumb]:bg-primary',
  '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-surface-high',
  '[&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-primary',
  '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full',
  '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:bg-primary',
].join(' ')

/** The two-stop gradient that paints the filled part of the WebKit track. */
function rangeFillStyle(value: number, min: number, max: number): CSSProperties {
  const span = max - min
  const ratio = span > 0 ? (value - min) / span : 0
  const percent = `${Math.min(100, Math.max(0, ratio * 100))}%`
  return {
    '--range-fill':
      `linear-gradient(to right, var(--color-primary) ${percent}, var(--color-surface-high) ${percent})`,
  } as CSSProperties
}

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
                      className={rangeClasses}
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
                      style={rangeFillStyle(
                        typeof value === 'number' ? value : control.min,
                        control.min,
                        control.max,
                      )}
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
