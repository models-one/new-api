import type { Tone } from '@/components/ui/tone'

/**
 * Series colours are design tokens, never hex literals: an SVG `stroke` of
 * `var(--color-primary)` inherits the same value the CSS classes resolve to, so
 * a token change repaints the charts with everything else.
 */
export const toneColorVariables: Record<Tone, string> = {
  primary: 'var(--color-primary)',
  secondary: 'var(--color-secondary)',
  info: 'var(--color-info)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  destructive: 'var(--color-destructive)',
  muted: 'var(--color-muted)',
}

/** Slot order used when a series does not name its own tone. */
export const chartToneOrder: readonly Tone[] = [
  'primary',
  'secondary',
  'info',
  'success',
  'warning',
  'destructive',
  'muted',
]

/** The empty track behind donut slices and bar backgrounds. */
export const chartTrackColor = 'var(--color-surface-high)'

/** Axis and baseline strokes drawn inside the plot. */
export const chartAxisColor = 'var(--color-border-strong)'

export function seriesTone(index: number): Tone {
  const safeIndex = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0
  return chartToneOrder[safeIndex % chartToneOrder.length]
}

export function toneColor(tone: Tone): string {
  return toneColorVariables[tone]
}

/** Resolves the colour for a series: its own tone when set, otherwise its slot. */
export function seriesColor(index: number, tone?: Tone): string {
  return toneColorVariables[tone ?? seriesTone(index)]
}
