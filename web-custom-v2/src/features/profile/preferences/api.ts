import { putJson } from '@/lib/api/client'
import type { ApiRequestConfig } from '@/lib/http-client'

/** These surfaces render server messages inline, so the shared toast is skipped. */
const inlineErrors: ApiRequestConfig = { skipBusinessError: true, skipErrorHandler: true }

/**
 * `PUT /api/user/setting` — the notification preferences.
 *
 * VERIFIED DESTRUCTIVE BEHAVIOUR. `controller.UpdateUserSetting` does not merge.
 * It constructs a brand-new `dto.UserSetting` from the request and writes it over
 * the whole column, so three fields it never reads are wiped on every save:
 * `language`, `sidebar_modules` and `billing_preference`. Reproduced on the dev
 * server: with `{"language":"zh"}` stored, one save of the notification form left
 * `setting` as `{"notify_type":...}` with no `language` key.
 *
 * `preserve` puts back the two that `PUT /api/user/self` can restore. That
 * endpoint checks `sidebar_modules` first and RETURNS, then checks `language` and
 * returns, so the two values cannot travel in one request — hence two calls.
 *
 * `billing_preference` is not restored here: its only writer is the subscription
 * surface's own endpoint, and reaching into it from the preferences form would be
 * worse than the bug. It is reported as a backend defect instead.
 */
export async function saveNotificationPreferences(
  payload: Record<string, unknown>,
  preserve: { language?: string; sidebarModules?: string },
): Promise<void> {
  await putJson<unknown>('/api/user/setting', payload, inlineErrors)

  if (preserve.sidebarModules !== undefined && preserve.sidebarModules !== '') {
    await putJson<unknown>('/api/user/self', { sidebar_modules: preserve.sidebarModules }, inlineErrors)
  }
  if (preserve.language !== undefined && preserve.language !== '') {
    await putJson<unknown>('/api/user/self', { language: preserve.language }, inlineErrors)
  }
}

/**
 * `PUT /api/user/self` with a `language` key.
 *
 * This branch of `controller.UpdateSelf` MERGES: it loads the stored settings,
 * replaces `Language` and writes the rest back untouched. It is safe on its own.
 */
export function saveInterfaceLanguage(language: string): Promise<unknown> {
  return putJson<unknown>('/api/user/self', { language }, inlineErrors)
}
