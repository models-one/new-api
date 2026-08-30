import {
  buildRegistrationResult,
  createCredential,
  prepareCredentialCreationOptions,
} from '@/features/auth/passkey'
import {
  beginPasskeyRegistration,
  finishPasskeyRegistration,
} from '@/features/profile/security/api'
import { PasskeyCancelledError } from '@/features/profile/security/step-up'

/**
 * The WebAuthn registration ceremony, in the order the server expects it.
 *
 * `register/begin` mints a flow token alongside the creation options and the
 * server binds that token to this login session; `register/finish` consumes it.
 * A `proofToken` is threaded through BOTH calls because
 * `requirePasskeyRegistrationVerification` runs on each of them — passing it to
 * `finish` alone gets a 403 on `begin`, and the reverse loses the credential.
 *
 * The codec and credential shaping are the shared ones from
 * `features/auth/passkey`; this module only sequences the calls.
 */
export async function registerPasskey(proofToken?: string): Promise<void> {
  const challenge = await beginPasskeyRegistration(proofToken)
  const flowToken = challenge.flow_token
  if (!flowToken) throw new Error('The registration challenge did not include a flow token')

  const options = prepareCredentialCreationOptions(challenge.options ?? challenge)
  const credential = (await createCredential(options)) as PublicKeyCredential | null
  if (!credential) throw new PasskeyCancelledError()

  const attestation = buildRegistrationResult(credential)
  if (!attestation) throw new Error('The authenticator returned an unusable credential')

  await finishPasskeyRegistration(flowToken, attestation, proofToken)
}
