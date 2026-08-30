/**
 * The announcement publish date is stored as RFC 3339 and edited with a native
 * `datetime-local` control, which speaks `YYYY-MM-DDTHH:mm` in the VIEWER'S time zone and
 * carries no offset of its own.
 *
 * These two functions are the whole conversion, and the time zone is the reason they
 * exist: `new Date(iso).toISOString().slice(0, 16)` looks like it would work and is wrong
 * — it hands the control a UTC wall clock, so an operator in UTC+8 sets 09:00 and the
 * console shows 01:00 back to them. The local getters below produce the local wall clock,
 * and `new Date('2026-01-02T03:04')` parses a bare date-time as local, so the round trip
 * closes.
 */

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

/** RFC 3339 → the `datetime-local` value. `''` for anything unparseable. */
export function toDateTimeLocal(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return (
    `${pad(parsed.getFullYear(), 4)}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}` +
    `T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
  )
}

/**
 * The `datetime-local` value → RFC 3339 in UTC, the shape `time.Parse(time.RFC3339, …)`
 * accepts. `''` when the control is empty or holds something unparseable, which the
 * field's required check then reports.
 */
export function fromDateTimeLocal(value: string): string {
  if (value.trim() === '') return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

/** Now, as the stored format. Used to seed a new announcement. */
export function nowRfc3339(): string {
  return new Date().toISOString()
}
