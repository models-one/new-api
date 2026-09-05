import type { AxisTick } from '@/components/chart/types'
import { CHART_VIEWBOX_HEIGHT, CHART_VIEWBOX_WIDTH } from '@/components/chart/types'

export type LinearScale = {
  readonly domain: readonly [number, number]
  readonly range: readonly [number, number]
  /** Maps a domain value onto the range. */
  scale: (value: number) => number
  /** Maps a range position back onto the domain. */
  invert: (position: number) => number
  /** Evenly rounded ticks covering the domain. */
  ticks: (count?: number) => number[]
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Candidate spacings for {@link timeTicks}, ascending. */
const TIME_STEPS: readonly number[] = [
  SECOND,
  5 * SECOND,
  15 * SECOND,
  30 * SECOND,
  MINUTE,
  5 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  7 * DAY,
  14 * DAY,
  30 * DAY,
  90 * DAY,
  180 * DAY,
  365 * DAY,
]

export function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  if (value < minimum) return minimum
  if (value > maximum) return maximum
  return value
}

/** Smallest and largest finite value. Returns `[0, 0]` when nothing is finite. */
export function extent(values: readonly number[]): [number, number] {
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY

  for (const value of values) {
    if (!Number.isFinite(value)) continue
    if (value < minimum) minimum = value
    if (value > maximum) maximum = value
  }

  if (minimum === Number.POSITIVE_INFINITY) return [0, 0]
  return [minimum, maximum]
}

/**
 * Rounds `value` to the closest 1/2/5 x 10^n. With `round` the nearest such
 * number is used; otherwise the next one at or above `value`.
 */
export function niceNumber(value: number, round: boolean): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const exponent = Math.floor(Math.log10(value))
  const magnitude = 10 ** exponent
  const fraction = value / magnitude

  if (round) {
    if (fraction < 1.5) return magnitude
    if (fraction < 3) return 2 * magnitude
    if (fraction < 7) return 5 * magnitude
    return 10 * magnitude
  }

  if (fraction <= 1) return magnitude
  if (fraction <= 2) return 2 * magnitude
  if (fraction <= 5) return 5 * magnitude
  return 10 * magnitude
}

function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  return clamp(Math.ceil(-Math.log10(step)) + 1, 0, 12)
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Evenly spaced, human-readable ticks spanning `[min, max]`. The first and last
 * tick sit at or outside the input bounds so the axis closes on round numbers.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []

  const target = Math.max(2, Math.floor(count))
  let low = Math.min(min, max)
  let high = Math.max(min, max)

  if (low === high) {
    // A flat series still needs a span, or every tick collapses onto one label. An
    // all-zero one is the common case — a user with no traffic yet — and widening it
    // symmetrically would put negative ticks on an axis of counts, so it grows upward
    // only. A flat non-zero series keeps the symmetric spread.
    if (low === 0) {
      // Counts are whole numbers, and the axis formatter rounds. A 0..1 span asked for
      // six ticks yields 0.2, 0.4, … which all render as "0" or "1" — the same label
      // several times over. One step covering the whole span is the honest axis.
      return [0, 1]
    }
    const spread = Math.abs(low) / 2
    low -= spread
    high += spread
  }

  const step = niceNumber((high - low) / (target - 1), true)
  if (step <= 0) return [low, high]

  const decimals = decimalsForStep(step)
  const start = Math.floor(low / step) * step
  const end = Math.ceil(high / step) * step
  const ticks: number[] = []

  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(roundTo(value, decimals))
    if (ticks.length >= 200) break
  }

  return ticks
}

/** Expands `[min, max]` outward so both ends land on a {@link niceTicks} boundary. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  const ticks = niceTicks(min, max, count)
  if (ticks.length === 0) return [0, 1]

  const first = ticks[0]
  const last = ticks[ticks.length - 1]
  if (first === last) return [first, first + 1]
  return [first, last]
}

export function createLinearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): LinearScale {
  const [domainStart, domainEnd] = domain
  const [rangeStart, rangeEnd] = range
  const domainSpan = domainEnd - domainStart
  const rangeSpan = rangeEnd - rangeStart

  return {
    domain: [domainStart, domainEnd],
    range: [rangeStart, rangeEnd],
    scale: (value) => {
      if (!Number.isFinite(value)) return rangeStart
      if (domainSpan === 0) return rangeStart + rangeSpan / 2
      return rangeStart + ((value - domainStart) / domainSpan) * rangeSpan
    },
    invert: (position) => {
      if (rangeSpan === 0) return domainStart
      return domainStart + ((position - rangeStart) / rangeSpan) * domainSpan
    },
    ticks: (count = 5) => niceTicks(domainStart, domainEnd, count),
  }
}

/**
 * Ticks for a unix-millisecond domain, aligned to calendar-friendly spacings.
 * Month and year steps are approximated as 30 and 365 days.
 */
export function timeTicks(startMs: number, endMs: number, count = 5): number[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return []

  const target = Math.max(2, Math.floor(count))
  const low = Math.min(startMs, endMs)
  const high = Math.max(startMs, endMs)
  if (low === high) return [low]

  const desired = (high - low) / (target - 1)
  const step = TIME_STEPS.find((candidate) => candidate >= desired) ?? TIME_STEPS[TIME_STEPS.length - 1]
  const ticks: number[] = []

  for (let value = Math.ceil(low / step) * step; value <= high; value += step) {
    ticks.push(value)
    if (ticks.length >= 200) break
  }

  if (ticks.length === 0) return [low, high]
  return ticks
}

/**
 * A time axis over unix milliseconds. `ticks()` returns calendar-aligned
 * millisecond values rather than raw rounded numbers.
 */
export function createTimeScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): LinearScale {
  const linear = createLinearScale(domain, range)
  return {
    ...linear,
    ticks: (count = 5) => timeTicks(domain[0], domain[1], count),
  }
}

/** Picks a tick format that suits the visible time span. */
export function formatTimeTick(milliseconds: number, spanMs: number, locale?: string): string {
  if (!Number.isFinite(milliseconds)) return '—'
  const date = new Date(milliseconds)

  if (spanMs <= 2 * DAY) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  if (spanMs <= 365 * DAY) {
    return date.toLocaleDateString(locale, { month: 'short', day: '2-digit' })
  }
  return date.toLocaleDateString(locale, { month: 'short', year: 'numeric' })
}

export type PlotProjection = {
  x: LinearScale
  y: LinearScale
  width: number
  height: number
}

/**
 * Builds the x/y scales that map data onto the shared viewBox. `y` is inverted
 * (domain maximum at the top) and inset vertically so strokes are not clipped.
 */
export function createPlotProjection(options: {
  xDomain: readonly [number, number]
  yDomain: readonly [number, number]
  width?: number
  height?: number
  inset?: number
}): PlotProjection {
  const width = options.width ?? CHART_VIEWBOX_WIDTH
  const height = options.height ?? CHART_VIEWBOX_HEIGHT
  const inset = clamp(options.inset ?? 2, 0, height / 4)

  return {
    width,
    height,
    x: createLinearScale(options.xDomain, [0, width]),
    y: createLinearScale(options.yDomain, [height - inset, inset]),
  }
}

/** Converts a projected y coordinate into the 0..1 bottom-up fraction axes use. */
export function verticalFraction(projected: number, height = CHART_VIEWBOX_HEIGHT): number {
  if (height === 0) return 0
  return clamp(1 - projected / height, 0, 1)
}

/** Converts a projected x coordinate into the 0..1 left-to-right fraction axes use. */
export function horizontalFraction(projected: number, width = CHART_VIEWBOX_WIDTH): number {
  if (width === 0) return 0
  return clamp(projected / width, 0, 1)
}

/** Axis labels for values on the y (vertical) scale, positioned bottom-up. */
export function verticalTicks(
  scale: LinearScale,
  values: readonly number[],
  format: (value: number, index: number) => string,
  height = CHART_VIEWBOX_HEIGHT,
): AxisTick[] {
  return dropRepeatedLabels(
    values.map((value, index) => ({
      key: `${index}-${value}`,
      position: verticalFraction(scale.scale(value), height),
      label: format(value, index),
    })),
  )
}

/**
 * Axis values are spaced on the underlying number, but the label is what a reader sees.
 * A count axis spanning 0..1 formats 0.2 and 0.4 both as "0", so the same label lands
 * several times down the axis; keeping the first of each run leaves the axis honest
 * without moving any tick that survives.
 */
function dropRepeatedLabels(ticks: readonly AxisTick[]): AxisTick[] {
  const kept: AxisTick[] = []
  for (const tick of ticks) {
    if (kept[kept.length - 1]?.label === tick.label) continue
    kept.push(tick)
  }
  return kept
}

/** Axis labels for values on the x (horizontal) scale, positioned left-to-right. */
export function horizontalTicks(
  scale: LinearScale,
  values: readonly number[],
  format: (value: number, index: number) => string,
  width = CHART_VIEWBOX_WIDTH,
): AxisTick[] {
  return dropRepeatedLabels(
    values.map((value, index) => ({
    key: `${index}-${value}`,
    position: horizontalFraction(scale.scale(value), width),
    label: format(value, index),
    })),
  )
}

/** `count` evenly spaced values spanning the domain, used when data is dense. */
export function sampleDomain(domain: readonly [number, number], count: number): number[] {
  const total = Math.max(2, Math.floor(count))
  const [start, end] = domain
  if (start === end) return [start]
  return Array.from({ length: total }, (_, index) => start + ((end - start) * index) / (total - 1))
}
