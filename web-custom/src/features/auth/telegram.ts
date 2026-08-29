/**
 * The Telegram login widget hands its callback an arbitrary object. Only the
 * signed fields may be forwarded to `GET /api/oauth/telegram/login`, and the
 * hash must survive untouched — the server recomputes it.
 */
export type TelegramAuthorization = {
  id: string | number
  auth_date: string | number
  hash: string
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  lang?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readTelegramNumber(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value
  return null
}

const optionalTelegramFields = ['first_name', 'last_name', 'username', 'photo_url', 'lang'] as const

/** Returns the authorization when the widget payload carries every signed field, else null. */
export function pickTelegramAuthorization(value: unknown): TelegramAuthorization | null {
  if (!isRecord(value)) return null

  const id = readTelegramNumber(value.id)
  const authDate = readTelegramNumber(value.auth_date)
  const hash = typeof value.hash === 'string' ? value.hash.trim() : ''
  if (id === null || authDate === null || !hash) return null

  const authorization: TelegramAuthorization = { id, auth_date: authDate, hash }

  for (const field of optionalTelegramFields) {
    const fieldValue = value[field]
    if (typeof fieldValue === 'string' && fieldValue) authorization[field] = fieldValue
  }

  return authorization
}
