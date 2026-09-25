// @vitest-environment happy-dom

import '@/i18n/config'

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('@/components/overlay', () => ({
  toErrorMessage: (value: unknown) => String(value),
  toast: { error: toastError, success: toastSuccess },
}))

const { OAUTH_BIND_CALLBACK_MESSAGE, OAUTH_BIND_RESULT_MESSAGE } =
  await import('@/features/auth/callback/bind-window')
const { useOAuthBind } = await import('@/features/profile/use-oauth-bind')

import type { OAuthProviderDescriptor } from '@/features/auth/oauth-providers'

const descriptor: OAuthProviderDescriptor = {
  buildAuthorizationUrl: ({ state }) => `https://github.com/login/oauth/authorize?state=${state}`,
  icon: 'github',
  id: 'github',
  kind: 'redirect',
  name: 'GitHub',
  provider: 'github',
}

type FakePopup = {
  closed: boolean
  close: ReturnType<typeof vi.fn>
  location: { replace: ReturnType<typeof vi.fn> }
  postMessage: ReturnType<typeof vi.fn>
}

function fakePopup(): FakePopup {
  return {
    close: vi.fn(),
    closed: false,
    location: { replace: vi.fn() },
    postMessage: vi.fn(),
  }
}

/** happy-dom refuses a plain object as MessageEvent.source, so it is attached afterwards. */
function postFromPopup(popup: FakePopup, data: unknown) {
  const event = new MessageEvent('message', { data, origin: window.location.origin })
  Object.defineProperty(event, 'source', { value: popup })
  window.dispatchEvent(event)
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  toastError.mockReset()
  toastSuccess.mockReset()
})

describe('useOAuthBind', () => {
  it('never asks for a state token when the pop-up was blocked', async () => {
    const onBound = vi.fn()
    const { result } = renderHook(() => useOAuthBind({ onBound, openWindow: () => null }))

    act(() => result.current.start(descriptor))

    expect(post).not.toHaveBeenCalled()
    expect(result.current.pendingProviderId).toBeNull()
    expect(toastError).toHaveBeenCalled()
  })

  it('mints a BIND state and sends the pop-up to the provider', async () => {
    post.mockResolvedValue({ data: { data: { flow_token: 'flow-1' }, success: true } })
    const popup = fakePopup()
    const { result } = renderHook(() => useOAuthBind({ onBound: vi.fn(), openWindow: () => popup as never }))

    act(() => result.current.start(descriptor))
    expect(result.current.pendingProviderId).toBe('github')

    await waitFor(() => expect(popup.location.replace).toHaveBeenCalled())
    expect(post.mock.calls[0][0]).toBe('/api/oauth/state')
    // `bind`, not `login`: a login state would let the callback create a NEW session.
    expect(post.mock.calls[0][1]).toMatchObject({ intent: 'bind', provider: 'github' })
    expect(popup.location.replace).toHaveBeenCalledWith(
      'https://github.com/login/oauth/authorize?state=flow-1',
    )
  })

  it('performs the exchange itself and answers the pop-up, because the pop-up has no session', async () => {
    post.mockResolvedValue({ data: { data: { flow_token: 'flow-1' }, success: true } })
    get.mockResolvedValue({ data: { message: '', success: true } })
    const onBound = vi.fn()
    const popup = fakePopup()
    const { result } = renderHook(() => useOAuthBind({ onBound, openWindow: () => popup as never }))

    act(() => result.current.start(descriptor))
    await waitFor(() => expect(popup.location.replace).toHaveBeenCalled())

    act(() => postFromPopup(popup, {
      code: 'auth-code',
      provider: 'github',
      state: 'flow-1',
      type: OAUTH_BIND_CALLBACK_MESSAGE,
    }))

    await waitFor(() => expect(onBound).toHaveBeenCalledWith(descriptor))
    expect(get.mock.calls[0][0]).toBe('/api/oauth/github')
    expect(popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'github', state: 'flow-1', success: true, type: OAUTH_BIND_RESULT_MESSAGE }),
      window.location.origin,
    )
    expect(result.current.pendingProviderId).toBeNull()
  })

  it('tells the pop-up the exchange failed and does not refresh the account', async () => {
    post.mockResolvedValue({ data: { data: { flow_token: 'flow-1' }, success: true } })
    get.mockResolvedValue({ data: { message: 'State parameter is empty or mismatched', success: false } })
    const onBound = vi.fn()
    const popup = fakePopup()
    const { result } = renderHook(() => useOAuthBind({ onBound, openWindow: () => popup as never }))

    act(() => result.current.start(descriptor))
    await waitFor(() => expect(popup.location.replace).toHaveBeenCalled())

    act(() => postFromPopup(popup, {
      code: 'auth-code',
      provider: 'github',
      state: 'flow-1',
      type: OAUTH_BIND_CALLBACK_MESSAGE,
    }))

    await waitFor(() => expect(popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
      window.location.origin,
    ))
    expect(onBound).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('State parameter is empty or mismatched')
  })

  it('ignores a message carrying a state this page never minted', async () => {
    post.mockResolvedValue({ data: { data: { flow_token: 'flow-1' }, success: true } })
    const popup = fakePopup()
    const { result } = renderHook(() => useOAuthBind({ onBound: vi.fn(), openWindow: () => popup as never }))

    act(() => result.current.start(descriptor))
    await waitFor(() => expect(popup.location.replace).toHaveBeenCalled())

    act(() => postFromPopup(popup, {
      code: 'auth-code',
      provider: 'github',
      state: 'not-our-flow',
      type: OAUTH_BIND_CALLBACK_MESSAGE,
    }))

    expect(get).not.toHaveBeenCalled()
    expect(result.current.pendingProviderId).toBe('github')
  })
})
