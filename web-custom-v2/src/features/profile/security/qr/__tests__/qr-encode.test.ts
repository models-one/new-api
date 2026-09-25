import { describe, expect, it } from 'vitest'

import dataCodewordsPerVersion from '@/features/profile/security/qr/__tests__/qr-data-codewords-m.json'
import fixtures from '@/features/profile/security/qr/__tests__/qr-fixtures.json'
import {
  QrEncodeError,
  byteCapacity,
  dataCodewordCount,
  encodeQr,
} from '@/features/profile/security/qr/qr-encode'

/**
 * How these fixtures were established, because a QR encoder cannot be tested by
 * eye — a wrong block table, a bad Reed-Solomon divisor or an off-by-one in the
 * zigzag walk all yield a symbol that still looks like a QR code and simply
 * refuses to scan.
 *
 * `qr-fixtures.json` holds this encoder's own output, but every entry was first
 * rendered to a bitmap and DECODED with OpenCV's `cv2.QRCodeDetector`; all 19
 * decoded back to the exact input string. The set spans versions 1, 4, 5, 7, 10,
 * 15 and 26 (so: the 8-bit and the 16-bit character-count field, symbols with and
 * without alignment patterns, and symbols with and without the version-information
 * block), all eight data masks pinned explicitly, a UTF-8 payload with CJK
 * characters, and a 1000-byte payload. So the file is a decode-verified golden
 * output, and this suite is the regression guard on it.
 *
 * `qr-data-codewords-m.json` is independent of this implementation: it is
 * `segno.consts.SYMBOL_CAPACITY[version][M] / 8` for all 40 versions, taken from
 * the `segno` reference encoder. It pins the two hand-transcribed block tables.
 *
 * Note for anyone re-generating fixtures with segno: its `write_padding_bits`
 * appends a whole zero codeword when the bit stream ALREADY ends on a codeword
 * boundary, which for byte mode is always. Symbols still scan (a decoder stops at
 * the character count) but the codewords, and therefore the chosen mask, differ
 * from a strict ISO/IEC 18004 §7.4.10 encoder like this one. Do not "fix" this
 * encoder to match segno byte for byte.
 */

type Fixture = {
  text: string
  mask: number
  forcedMask: number | null
  version: number
  rows: string[]
}

describe('encodeQr', () => {
  const cases = fixtures as Fixture[]

  it.each(cases.map((fixture, index) => [index, fixture.text.slice(0, 24), fixture] as const))(
    'reproduces the decode-verified symbol for case %i (%s)',
    (_index, _label, fixture) => {
      const matrix = encodeQr(fixture.text, fixture.forcedMask ?? undefined)

      expect(matrix.version).toBe(fixture.version)
      expect(matrix.mask).toBe(fixture.mask)
      expect(matrix.size).toBe(fixture.version * 4 + 17)
      expect(matrix.modules.map((row) => row.map((cell) => (cell ? '1' : '0')).join(''))).toEqual(
        fixture.rows,
      )
    },
  )

  it('derives the same data-codeword count as the reference encoder, for all 40 versions', () => {
    for (const [version, count] of Object.entries(dataCodewordsPerVersion)) {
      expect(dataCodewordCount(Number(version))).toBe(count)
    }
  })

  it('selects the smallest version that fits the payload', () => {
    expect(byteCapacity(1)).toBe(14)
    expect(byteCapacity(10)).toBe(213)
    expect(byteCapacity(40)).toBe(2331)

    expect(encodeQr('a'.repeat(14)).version).toBe(1)
    expect(encodeQr('a'.repeat(15)).version).toBe(2)
    expect(encodeQr('a'.repeat(26)).version).toBe(2)
    expect(encodeQr('a'.repeat(27)).version).toBe(3)
  })

  it('counts multi-byte characters as their UTF-8 length', () => {
    // Five CJK characters are 15 UTF-8 bytes, one past version 1's 14-byte limit.
    expect(encodeQr('两步验证码').version).toBe(2)
  })

  it('refuses content that no version can hold', () => {
    expect(() => encodeQr('a'.repeat(byteCapacity(40) + 1))).toThrow(QrEncodeError)
  })

  it('emits a square matrix with every row at full width', () => {
    const matrix = encodeQr('otpauth://totp/demo?secret=ABCDEFGHIJKLMNOP')
    expect(matrix.modules).toHaveLength(matrix.size)
    for (const row of matrix.modules) expect(row).toHaveLength(matrix.size)
  })

  it('places the three finder patterns', () => {
    const { modules, size } = encodeQr('finder')
    for (const [originX, originY] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      for (let dy = 0; dy < 7; dy += 1) {
        for (let dx = 0; dx < 7; dx += 1) {
          const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
          expect(modules[originY + dy][originX + dx]).toBe(ring !== 2)
        }
      }
    }
  })
})
