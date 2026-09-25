import type { ParameterEnabled, PlaygroundConfig } from '@/features/playground/types'

/**
 * The tunable request parameters, with the ranges the legacy console used.
 *
 * Every one of these was confirmed to reach the upstream verbatim through
 * `/pg/chat/completions` on the dev server:
 *   {"model":"gpt-4o-mini","messages":[...],"stream":false,"max_tokens":100,
 *    "temperature":0.5,"top_p":0.9,"frequency_penalty":0.2,"presence_penalty":0.1,"seed":42}
 */

export type ParameterKey = keyof ParameterEnabled

export type ParameterControl = {
  key: ParameterKey
  /** English source string; passed through `t()` at the call site. */
  label: string
  description: string
  kind: 'slider' | 'number'
  min: number
  max: number
  step: number
}

export const PARAMETER_CONTROLS: readonly ParameterControl[] = [
  {
    description: 'Higher values make the reply more random.',
    key: 'temperature',
    kind: 'slider',
    label: 'Temperature',
    max: 2,
    min: 0,
    step: 0.1,
  },
  {
    description: 'Considers only the most likely tokens adding up to this probability.',
    key: 'top_p',
    kind: 'slider',
    label: 'Top P',
    max: 1,
    min: 0,
    step: 0.05,
  },
  {
    description: 'Discourages the model from repeating the same wording.',
    key: 'frequency_penalty',
    kind: 'slider',
    label: 'Frequency penalty',
    max: 2,
    min: -2,
    step: 0.1,
  },
  {
    description: 'Encourages the model to raise new topics.',
    key: 'presence_penalty',
    kind: 'slider',
    label: 'Presence penalty',
    max: 2,
    min: -2,
    step: 0.1,
  },
  {
    description: 'Caps the length of the reply. Some models reject this parameter.',
    key: 'max_tokens',
    kind: 'number',
    label: 'Max tokens',
    max: 200_000,
    min: 1,
    step: 1,
  },
  {
    description: 'Makes replies more repeatable where the model supports it.',
    key: 'seed',
    kind: 'number',
    label: 'Seed',
    max: 2_147_483_647,
    min: 0,
    step: 1,
  },
]

export function findControl(key: ParameterKey): ParameterControl | undefined {
  return PARAMETER_CONTROLS.find((control) => control.key === key)
}

/**
 * Clamps a typed value into its control's range.
 *
 * Clearing the field yields null for `seed` (which is legitimately "unset") and the
 * control's minimum for everything else, because those parameters have no unset state
 * once their toggle is on.
 */
export function normalizeParameterValue(key: ParameterKey, raw: string | number): number | null {
  const control = findControl(key)
  if (!control) return key === 'seed' ? null : 0

  if (raw === '') return key === 'seed' ? null : control.min

  const parsed = typeof raw === 'number' ? raw : Number.parseFloat(raw)
  if (Number.isNaN(parsed)) return key === 'seed' ? null : control.min

  const clamped = Math.min(control.max, Math.max(control.min, parsed))
  if (control.step >= 1) return Math.trunc(clamped)

  // Round to the step's precision so 0.1 increments do not accumulate float noise.
  const precision = String(control.step).split('.')[1]?.length ?? 0
  return Number(clamped.toFixed(precision))
}

export function parameterValue(config: PlaygroundConfig, key: ParameterKey): number | null {
  return config[key]
}
