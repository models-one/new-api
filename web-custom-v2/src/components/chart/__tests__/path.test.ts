import { describe, expect, it } from 'vitest'

import { buildLinePath } from '@/components/chart/path'

/** Every coordinate pair after the command letter, as [x, y]. */
function coordinates(path: string): Array<[number, number]> {
  const numbers = path.replace(/[MC]/g, ' ').trim().split(/\s+/).map(Number)
  const pairs: Array<[number, number]> = []
  for (let index = 0; index < numbers.length; index += 2) pairs.push([numbers[index], numbers[index + 1]])
  return pairs
}

describe('smooth line path', () => {
  // Sparse hourly buckets: two readings an hour apart, then one a day later. The
  // old Catmull-Rom curve reached back past the first point and looped over the axis.
  it('stays inside the plotted x range when samples are unevenly spaced', () => {
    const path = buildLinePath(
      [
        { x: 60, y: 460 },
        { x: 70, y: 390 },
        { x: 1260, y: 460 },
      ],
      'smooth',
    )

    for (const [x] of coordinates(path)) {
      expect(x).toBeGreaterThanOrEqual(60)
      expect(x).toBeLessThanOrEqual(1260)
    }
  })

  // Two zero readings around a peak must not dip below the zero baseline.
  it('does not overshoot the data vertically', () => {
    const path = buildLinePath(
      [
        { x: 0, y: 200 },
        { x: 100, y: 20 },
        { x: 200, y: 200 },
        { x: 300, y: 200 },
      ],
      'smooth',
    )

    for (const [, y] of coordinates(path)) {
      expect(y).toBeGreaterThanOrEqual(20)
      expect(y).toBeLessThanOrEqual(200)
    }
  })
})
