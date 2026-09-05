import { describe, expect, it } from 'vitest'

import { createLinearScale, niceTicks, verticalTicks } from '@/components/chart/scales'

describe('niceTicks', () => {
  it('produces a readable ladder over a normal range', () => {
    expect(niceTicks(0, 120, 6)).toEqual([0, 20, 40, 60, 80, 100, 120])
  })

  it('does not invent negative ticks for an all-zero series', () => {
    // A user with no traffic yet has min === max === 0. Widening that to ±0.5 put
    // "-1" on the axis of a request count, which cannot be negative.
    const ticks = niceTicks(0, 0, 6)

    expect(ticks.every((tick) => tick >= 0)).toBe(true)
    expect(ticks[0]).toBe(0)
  })

  it('keeps an all-zero axis from repeating the same label', () => {
    const ticks = niceTicks(0, 0, 6)

    expect(new Set(ticks).size).toBe(ticks.length)
  })

  it('keeps an all-zero axis on whole numbers, since the formatter rounds', () => {
    // 0..1 split six ways gives 0.2, 0.4, … which all render as "0" or "1" on an axis
    // of request counts — the same label several times over.
    expect(niceTicks(0, 0, 6)).toEqual([0, 1])
    expect(niceTicks(0, 0, 3)).toEqual([0, 1])
  })

  it('still spreads a flat non-zero series so the line is not glued to an edge', () => {
    const ticks = niceTicks(50, 50, 5)

    expect(ticks.length).toBeGreaterThan(1)
    expect(Math.min(...ticks)).toBeLessThan(50)
    expect(Math.max(...ticks)).toBeGreaterThan(50)
  })

  it('allows negative ticks when the data genuinely goes below zero', () => {
    const ticks = niceTicks(-40, 40, 5)

    expect(Math.min(...ticks)).toBeLessThan(0)
  })
})

describe('verticalTicks', () => {
  const scale = createLinearScale([0, 1], [0, 100])

  it('drops ticks whose formatted label repeats the one before it', () => {
    // A 0..1 axis of request counts formats 0.2/0.4 as "0" and 0.6/0.8 as "1", which
    // renders the same label several times down the axis.
    const ticks = verticalTicks(scale, [0, 0.2, 0.4, 0.6, 0.8, 1], (value) =>
      String(Math.round(value)),
    )

    expect(ticks.map((tick) => tick.label)).toEqual(['0', '1'])
  })

  it('keeps every tick when the labels are distinct', () => {
    const ticks = verticalTicks(scale, [0, 0.25, 0.5, 0.75, 1], (value) => value.toFixed(2))

    expect(ticks).toHaveLength(5)
  })

  it('keeps each surviving tick at its own position', () => {
    const ticks = verticalTicks(scale, [0, 0.2, 1], (value) => String(Math.round(value)))

    expect(new Set(ticks.map((tick) => tick.position)).size).toBe(ticks.length)
  })
})
