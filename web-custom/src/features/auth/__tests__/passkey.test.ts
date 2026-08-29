// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'

import {
  arrayBufferToBase64Url,
  base64UrlToArrayBuffer,
  buildAssertionResult,
  buildRegistrationResult,
  prepareCredentialCreationOptions,
  prepareCredentialRequestOptions,
} from '@/features/auth/passkey'

function bytesOf(buffer: unknown): number[] {
  return Array.from(new Uint8Array(buffer as ArrayBuffer))
}

function bufferOf(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer
}

describe('base64url codec', () => {
  it('decodes and encodes the standard alphabet', () => {
    expect(bytesOf(base64UrlToArrayBuffer('AQID'))).toEqual([1, 2, 3])
    expect(arrayBufferToBase64Url(bufferOf([1, 2, 3]))).toBe('AQID')
  })

  it('uses the url-safe alphabet instead of + and /', () => {
    expect(arrayBufferToBase64Url(bufferOf([251, 255, 190]))).toBe('-_--')
    expect(bytesOf(base64UrlToArrayBuffer('-_--'))).toEqual([251, 255, 190])
  })

  it('strips padding when encoding and restores it when decoding', () => {
    expect(arrayBufferToBase64Url(bufferOf([255]))).toBe('_w')
    expect(bytesOf(base64UrlToArrayBuffer('_w'))).toEqual([255])

    expect(arrayBufferToBase64Url(bufferOf([1, 2]))).toBe('AQI')
    expect(bytesOf(base64UrlToArrayBuffer('AQI'))).toEqual([1, 2])
  })

  it('round-trips every byte value', () => {
    const all = Array.from({ length: 256 }, (_unused, index) => index)
    expect(bytesOf(base64UrlToArrayBuffer(arrayBufferToBase64Url(bufferOf(all))))).toEqual(all)
  })

  it('treats empty and missing values as an empty buffer', () => {
    expect(base64UrlToArrayBuffer('').byteLength).toBe(0)
    expect(base64UrlToArrayBuffer(null).byteLength).toBe(0)
    expect(base64UrlToArrayBuffer(undefined).byteLength).toBe(0)
    expect(arrayBufferToBase64Url(null)).toBe('')
  })
})

describe('prepareCredentialRequestOptions', () => {
  /** Shape of `POST /api/user/passkey/login/begin` — `options` is Go's CredentialAssertion. */
  const challenge = {
    options: {
      publicKey: {
        challenge: 'AQID',
        rpId: 'localhost:3000',
        userVerification: 'preferred',
        allowCredentials: [{ id: '_w', type: 'public-key', transports: ['internal'] }],
      },
    },
    flow_token: 'flow',
    expires_at: 1788004087,
  }

  it('decodes the challenge and credential ids while keeping every other field', () => {
    const options = prepareCredentialRequestOptions(challenge)

    expect(bytesOf(options.challenge)).toEqual([1, 2, 3])
    expect(options.rpId).toBe('localhost:3000')
    expect(options.userVerification).toBe('preferred')
    expect(bytesOf(options.allowCredentials?.[0].id)).toEqual([255])
    expect(options.allowCredentials?.[0].transports).toEqual(['internal'])
  })

  it('accepts the unwrapped options object as well', () => {
    const options = prepareCredentialRequestOptions(challenge.options)
    expect(bytesOf(options.challenge)).toEqual([1, 2, 3])
  })

  it('leaves allowCredentials absent when the server sent none', () => {
    const options = prepareCredentialRequestOptions({ publicKey: { challenge: 'AQID' } })
    expect(options.allowCredentials).toBeUndefined()
  })

  it('throws when the payload carries no options', () => {
    expect(() => prepareCredentialRequestOptions({ flow_token: 'flow' })).toThrow()
    expect(() => prepareCredentialRequestOptions(null)).toThrow()
  })
})

describe('prepareCredentialCreationOptions', () => {
  it('decodes the challenge, the user handle and excluded credentials', () => {
    const options = prepareCredentialCreationOptions({
      publicKey: {
        challenge: 'AQID',
        rp: { id: 'localhost', name: 'New API' },
        user: { id: '_w', name: 'root', displayName: 'root' },
        excludeCredentials: [{ id: 'AQI', type: 'public-key' }],
      },
    })

    expect(bytesOf(options.challenge)).toEqual([1, 2, 3])
    expect(bytesOf(options.user.id)).toEqual([255])
    expect(options.user.name).toBe('root')
    expect(bytesOf(options.excludeCredentials?.[0].id)).toEqual([1, 2])
  })

  it('drops an empty attestationFormats list that browsers reject', () => {
    const options = prepareCredentialCreationOptions({
      publicKey: { challenge: 'AQID', user: { id: 'AQI' }, attestationFormats: [] },
    })

    expect('attestationFormats' in options).toBe(false)
  })
})

describe('credential result builders', () => {
  it('returns null when the ceremony produced no credential', () => {
    expect(buildAssertionResult(null)).toBeNull()
    expect(buildRegistrationResult(null)).toBeNull()
  })

  it('base64url-encodes every binary field of an assertion', () => {
    const credential = {
      id: 'credential-id',
      rawId: bufferOf([1, 2, 3]),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        authenticatorData: bufferOf([255]),
        clientDataJSON: bufferOf([1, 2]),
        signature: bufferOf([251, 255, 190]),
        userHandle: null,
      },
      getClientExtensionResults: () => ({}),
    } as unknown as PublicKeyCredential

    expect(buildAssertionResult(credential)).toEqual({
      id: 'credential-id',
      rawId: 'AQID',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        authenticatorData: '_w',
        clientDataJSON: 'AQI',
        signature: '-_--',
        userHandle: null,
      },
      clientExtensionResults: {},
    })
  })

  it('includes authenticator transports when the browser reports them', () => {
    const credential = {
      id: 'credential-id',
      rawId: bufferOf([1, 2, 3]),
      type: 'public-key',
      authenticatorAttachment: null,
      response: {
        attestationObject: bufferOf([1, 2]),
        clientDataJSON: bufferOf([255]),
        getTransports: () => ['internal', 'hybrid'],
      },
      getClientExtensionResults: () => ({}),
    } as unknown as PublicKeyCredential

    const result = buildRegistrationResult(credential)
    expect(result?.response).toEqual({
      attestationObject: 'AQI',
      clientDataJSON: '_w',
      transports: ['internal', 'hybrid'],
    })
  })
})
