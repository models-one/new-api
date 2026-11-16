// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post } }))

const { PluginLoginDialog } = await import('@/features/channels/plugin-login/PluginLoginDialog')
const { INITIAL_PLUGIN_LOGIN_STATE, pluginLoginReducer, readPluginLoginMessage } = await import(
  '@/features/channels/plugin-login/plugin-login'
)

function ok(data: unknown) {
  return Promise.resolve({ data: { data, message: '', success: true } })
}

function refused(message: string) {
  return Promise.resolve({ data: { message, message_key: message, success: false } })
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

afterEach(cleanup)

describe('the login flow state', () => {
  const device = { type: 'device' as const, user_code: 'ABCD-1234', verification_uri: 'https://vendor.example/device' }

  it('keeps the device code on screen while the vendor has not confirmed, at the interval it asks for', () => {
    const started = pluginLoginReducer(INITIAL_PLUGIN_LOGIN_STATE, { flow: 'f1', step: device, type: 'started' })
    const waiting = pluginLoginReducer(started, { step: { interval: 9, type: 'pending' }, type: 'received' })
    expect(waiting.step).toEqual(device)
    expect(waiting.interval).toBe(9)
  })

  it('ignores a late poll reply once the login is done', () => {
    const done = pluginLoginReducer(INITIAL_PLUGIN_LOGIN_STATE, { flow: 'f1', step: { type: 'done' }, type: 'started' })
    expect(pluginLoginReducer(done, { step: device, type: 'received' })).toBe(done)
  })

  it('only accepts a callback message for its own channel', () => {
    expect(readPluginLoginMessage({ channel_id: 7, step: { type: 'done' } }, 7)).toEqual({ type: 'done' })
    expect(readPluginLoginMessage({ channel_id: 8, step: { type: 'done' } }, 7)).toBeNull()
    expect(readPluginLoginMessage({ channel_id: 7, step: { type: 'script' } }, 7)).toBeNull()
  })
})

describe('PluginLoginDialog', () => {
  it('posts the fields a plugin asks for to the flow and reports the account it logged in', async () => {
    post.mockImplementation((url: string) => {
      if (url === '/api/channel/7/plugin_login') {
        return ok({
          flow: 'f1',
          step: { fields: [{ label: { en: 'Access key' }, name: 'access_key', required: true, type: 'password' }], type: 'fields' },
        })
      }
      return ok({ step: { credential: { account_id: 'ops@acme', index: 0 }, type: 'done' } })
    })
    const onDone = vi.fn()
    render(<PluginLoginDialog onClose={() => {}} onDone={onDone} target={{ channelId: 7, keyIndex: null, pluginName: 'Acme' }} />)

    const field = await screen.findByLabelText(/^Access key/)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('This field is required')).toBeInTheDocument()

    fireEvent.change(field, { target: { value: 'ak-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('ops@acme')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/api/channel/7/plugin_login', { key_index: null }, expect.anything())
    expect(post).toHaveBeenCalledWith(
      '/api/channel/7/plugin_login/continue',
      { flow: 'f1', input: { fields: { access_key: 'ak-secret' } } },
      expect.anything(),
    )
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('offers a new login, not a retry, when the server has ended the flow', async () => {
    post.mockImplementation((url: string) => {
      if (url === '/api/channel/7/plugin_login') {
        return ok({ flow: 'f1', step: { type: 'paste', url: 'https://vendor.example/auth?redirect_uri=https%3A%2F%2Fgw.example%2Fcb' } })
      }
      return refused('Login flow is invalid or has expired')
    })
    render(<PluginLoginDialog onClose={() => {}} target={{ channelId: 7, keyIndex: 0, pluginName: 'Acme' }} />)

    expect(await screen.findByText('https://gw.example/cb')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^Address after sign-in/), {
      target: { value: 'https://gw.example/cb?code=c&state=f1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('button', { name: 'Start again' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(post).toHaveBeenCalledWith(
      '/api/channel/7/plugin_login/continue',
      { flow: 'f1', input: { callback_url: 'https://gw.example/cb?code=c&state=f1' } },
      expect.anything(),
    )
  })
})
