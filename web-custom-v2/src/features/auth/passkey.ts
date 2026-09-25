/**
 * WebAuthn helpers.
 *
 * The base64url codec below is ported byte for byte from the legacy console. It
 * is the only thing standing between a server challenge and the authenticator:
 * a padding or alphabet mistake here does not throw, it produces a credential
 * the server silently rejects. Change it only with a round-trip test.
 */

type NodeBufferCtor = {
  from(input: string, encoding: string): { toString(encoding: string): string }
}

type GlobalWithBuffer = typeof globalThis & { Buffer?: NodeBufferCtor }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Converts a base64url string into the ArrayBuffer WebAuthn expects. */
export function base64UrlToArrayBuffer(value?: string | null): ArrayBuffer {
  if (!value) return new ArrayBuffer(0)

  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')

  const globalRef = globalThis as GlobalWithBuffer
  const decode = typeof globalRef.atob === 'function'
    ? globalRef.atob.bind(globalRef)
    : (input: string) => {
      if (typeof globalRef.Buffer !== 'undefined') {
        return globalRef.Buffer.from(input, 'base64').toString('binary')
      }
      throw new Error('Base64 decoding is not supported in this environment')
    }

  const binary = decode(base64)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return buffer
}

/** Converts an ArrayBuffer into the unpadded base64url string the server expects. */
export function arrayBufferToBase64Url(buffer?: ArrayBuffer | ArrayBufferLike | null): string {
  if (!buffer) return ''

  const globalRef = globalThis as GlobalWithBuffer
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }

  const encode = typeof globalRef.btoa === 'function'
    ? globalRef.btoa.bind(globalRef)
    : (input: string) => {
      if (typeof globalRef.Buffer !== 'undefined') {
        return globalRef.Buffer.from(input, 'binary').toString('base64')
      }
      throw new Error('Base64 encoding is not supported in this environment')
    }

  return encode(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

/**
 * Digs the WebAuthn options out of a `passkey/*\/begin` payload.
 *
 * `POST /api/user/passkey/login/begin` answers `{ options, flow_token, expires_at }`
 * where `options` is Go's `protocol.CredentialAssertion`, i.e. `{ publicKey: {...} }`.
 * The alias chain covers the other casings the backend has used.
 */
function resolveOptions(payload: unknown, failure: string): Record<string, unknown> {
  let source = payload
  if (isRecord(source) && isRecord(source.options)) source = source.options
  if (!isRecord(source)) throw new Error(failure)

  const options = source.publicKey ?? source.PublicKey ?? source.response ?? source.Response
  if (!isRecord(options)) throw new Error(failure)
  return options
}

function mapCredentialDescriptors(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((item) => {
    if (!isRecord(item)) return item
    return { ...item, id: base64UrlToArrayBuffer(readString(item.id)) }
  })
}

/** Shapes a registration challenge into `navigator.credentials.create` options. */
export function prepareCredentialCreationOptions(payload: unknown): PublicKeyCredentialCreationOptions {
  const options = resolveOptions(payload, 'Unable to parse Passkey registration options from response')
  const user = isRecord(options.user) ? options.user : {}

  const publicKey: Record<string, unknown> = {
    ...options,
    challenge: base64UrlToArrayBuffer(readString(options.challenge)),
    user: { ...user, id: base64UrlToArrayBuffer(readString(user.id)) },
  }

  const excludeCredentials = mapCredentialDescriptors(options.excludeCredentials)
  if (excludeCredentials) publicKey.excludeCredentials = excludeCredentials

  // An empty list means "no preference", but Safari rejects the empty array.
  if (Array.isArray(options.attestationFormats) && options.attestationFormats.length === 0) {
    delete publicKey.attestationFormats
  }

  return publicKey as unknown as PublicKeyCredentialCreationOptions
}

/** Shapes a login challenge into `navigator.credentials.get` options. */
export function prepareCredentialRequestOptions(payload: unknown): PublicKeyCredentialRequestOptions {
  const options = resolveOptions(payload, 'Unable to parse Passkey login options from response')

  const publicKey: Record<string, unknown> = {
    ...options,
    challenge: base64UrlToArrayBuffer(readString(options.challenge)),
  }

  const allowCredentials = mapCredentialDescriptors(options.allowCredentials)
  if (allowCredentials) publicKey.allowCredentials = allowCredentials

  return publicKey as unknown as PublicKeyCredentialRequestOptions
}

/** Encodes a newly created credential for `passkey/register/finish`. */
export function buildRegistrationResult(
  credential: PublicKeyCredential | null,
): Record<string, unknown> | null {
  if (!credential) return null

  const response = credential.response as AuthenticatorAttestationResponse & {
    getTransports?: () => string[]
  }
  const transports = typeof response.getTransports === 'function' ? response.getTransports() : undefined

  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      transports,
    },
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
  }
}

/** Encodes an assertion for `passkey/login/finish`. */
export function buildAssertionResult(
  credential: PublicKeyCredential | null,
): Record<string, unknown> | null {
  if (!credential) return null

  const response = credential.response as AuthenticatorAssertionResponse

  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64Url(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
  }
}

/** Whether this browser can run a passkey ceremony at all. */
export async function isPasskeySupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const { PublicKeyCredential } = window
  if (!PublicKeyCredential) return false

  if (typeof PublicKeyCredential.isConditionalMediationAvailable === 'function') {
    try {
      const available = await PublicKeyCredential.isConditionalMediationAvailable()
      if (available) return true
    } catch {
      // Fall through to the platform-authenticator probe.
    }
  }

  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    } catch {
      return false
    }
  }

  return true
}

export function createCredential(options: PublicKeyCredentialCreationOptions) {
  return navigator.credentials.create({ publicKey: options })
}

export function getCredential(options: PublicKeyCredentialRequestOptions) {
  return navigator.credentials.get({ publicKey: options })
}
