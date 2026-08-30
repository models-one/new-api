import {
  beginPasskeyVerification,
  finishPasskeyVerification,
  verifyWithTotp,
  type SecurityProof,
  type SecurityProofScope,
  type VerificationMethod,
} from '@/features/profile/security/api'
import {
  buildAssertionResult,
  getCredential,
  prepareCredentialRequestOptions,
} from '@/features/auth/passkey'

/**
 * Step-up verification: how the console earns an `X-Security-Proof` token.
 *
 * WHICH METHOD THE SERVER WILL ACCEPT is not a preference, it is fixed per
 * scope by `controller/passkey.go`:
 *
 *   passkey.register — required only while 2FA is enabled, and then the proof
 *                      must come from 2FA (`requirePasskeyRegistrationVerification`).
 *   passkey.delete   — 2FA enabled: the proof must come from 2FA.
 *                      2FA disabled: the proof must come from the passkey itself
 *                      (`requirePasskeyDeleteVerification`).
 *
 * `requiredMethodFor` is that table, so no surface has to re-derive it, and the
 * verification dialog never offers a method the server would reject.
 */

export type StepUpRequirement =
  | { kind: 'none' }
  | { kind: 'method'; method: VerificationMethod }

export function requiredMethodFor(
  scope: SecurityProofScope,
  state: { twoFactorEnabled: boolean; passkeyEnabled: boolean },
): StepUpRequirement {
  if (scope === 'passkey.register') {
    return state.twoFactorEnabled ? { kind: 'method', method: '2fa' } : { kind: 'none' }
  }

  if (state.twoFactorEnabled) return { kind: 'method', method: '2fa' }
  if (state.passkeyEnabled) return { kind: 'method', method: 'passkey' }
  // Nothing to remove, and nothing that could prove ownership of it.
  return { kind: 'none' }
}

export class PasskeyCancelledError extends Error {
  constructor() {
    super('Passkey ceremony was cancelled')
    this.name = 'PasskeyCancelledError'
  }
}

/** True for the `NotAllowedError` the browser raises when the user dismisses the prompt. */
export function isPasskeyCancellation(error: unknown): boolean {
  if (error instanceof PasskeyCancelledError) return true
  return error instanceof DOMException && error.name === 'NotAllowedError'
}

export function proveWithTotp(
  scope: SecurityProofScope,
  code: string,
): Promise<SecurityProof> {
  return verifyWithTotp(scope, code.trim())
}

/**
 * Runs the WebAuthn assertion ceremony for a step-up proof.
 *
 * The base64url codec and credential shaping come from `features/auth/passkey`
 * — the sign-in surface and this one must agree byte for byte, and a second
 * implementation is exactly how they drift apart.
 */
export async function proveWithPasskey(scope: SecurityProofScope): Promise<SecurityProof> {
  const challenge = await beginPasskeyVerification(scope)
  const flowToken = challenge.flow_token
  if (!flowToken) throw new Error('The verification challenge did not include a flow token')

  const options = prepareCredentialRequestOptions(challenge.options ?? challenge)
  const credential = (await getCredential(options)) as PublicKeyCredential | null
  if (!credential) throw new PasskeyCancelledError()

  const assertion = buildAssertionResult(credential)
  if (!assertion) throw new Error('The authenticator returned an unusable assertion')

  return finishPasskeyVerification(flowToken, assertion)
}
