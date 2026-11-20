import axios from 'axios'

import { putJson } from '@/lib/api/client'
import type { ApiRequestConfig } from '@/lib/http-client'

/**
 * `PUT /api/option/passkey/domains` (`controller.UpdatePasskeyDomains`): the relying-party
 * id, the legacy ids still accepted for older passkeys, and the trusted origins, changed
 * together in one transaction.
 *
 * With `preview: true` nothing is written; the answer says which relying-party ids the
 * change drops and how many stored passkeys use them (`affected_credentials`) or have no
 * recorded id at all (`unknown_credentials`). Those passkeys stop working. When any exist,
 * the change is refused with 409 unless `removal_confirmation` echoes the token from a
 * preview of exactly this change against exactly the current settings, so a confirmation
 * goes stale if anything moves in between.
 *
 * The server also keeps the previous relying-party id as a legacy id on its own when the id
 * changes, so existing passkeys keep working without the operator listing it.
 */

const silent: ApiRequestConfig = { skipBusinessError: true, skipErrorHandler: true }

export type PasskeyDomains = { rp_id: string; legacy_rp_ids: string; origins: string }

export type PasskeyDomainChange = PasskeyDomains & {
  previous_rp_id: string
  effective_rp_id: string
  removed_rp_ids: string[] | null
  affected_credentials: number
  unknown_credentials: number
  confirmation_required: boolean
  removal_confirmation: string
}

/** The settings or their impact changed after the preview; it has to be confirmed again. */
export class PasskeyRemovalStaleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PasskeyRemovalStaleError'
  }
}

export function previewPasskeyDomains(domains: PasskeyDomains): Promise<PasskeyDomainChange> {
  return putJson<PasskeyDomainChange>('/api/option/passkey/domains', { ...domains, preview: true }, silent)
}

export async function savePasskeyDomains(domains: PasskeyDomains, removalConfirmation: string): Promise<PasskeyDomainChange> {
  try {
    return await putJson<PasskeyDomainChange>('/api/option/passkey/domains', { ...domains, removal_confirmation: removalConfirmation }, silent)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const message = (error.response.data as { message?: unknown } | undefined)?.message
      throw new PasskeyRemovalStaleError(typeof message === 'string' ? message : 'Confirm the domain removal again.')
    }
    throw error
  }
}
