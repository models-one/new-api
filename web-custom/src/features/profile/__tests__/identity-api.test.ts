import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { delete: del, get, post, put } }))

const {
  bindEmail,
  bindWeChat,
  changePassword,
  checkinMonthKey,
  checkinStatusQuery,
  customOAuthBindingsQuery,
  deleteSelfAccount,
  generateAccessToken,
  performCheckin,
  startTelegramBind,
  unbindCustomOAuth,
  updateDisplayName,
} = await import('@/features/profile/identity-api')

const ok = (data: unknown) => Promise.resolve({ data: { data, message: '', success: true } })
const refused = (message: string) => Promise.resolve({ data: { message, success: false } })

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
  del.mockReset()
})

describe('updateDisplayName', () => {
  it('sends display_name alone, so it can never hit the setting branches of UpdateSelf', async () => {
    put.mockReturnValue(ok(null))
    await updateDisplayName('Root User')

    const [url, body] = put.mock.calls[0]
    expect(url).toBe('/api/user/self')
    expect(body).toEqual({ display_name: 'Root User' })
    expect(Object.keys(body as object)).not.toContain('language')
    expect(Object.keys(body as object)).not.toContain('sidebar_modules')
  })
})

describe('changePassword', () => {
  it('sends both passwords and opts in to the token rotation the handler answers with', async () => {
    put.mockReturnValue(ok({
      access_expires_at: 1788017932,
      access_token: 'rotated',
      session: { current: true, sid: 'c5bf' },
      token_type: 'Bearer',
    }))

    const rotation = await changePassword({ newPassword: 'new-one-11', originalPassword: 'old-one-1' })

    const [url, body, config] = put.mock.calls[0]
    expect(url).toBe('/api/user/self')
    expect(body).toEqual({ original_password: 'old-one-1', password: 'new-one-11' })
    // Without this the change succeeds and the session dies on the next request.
    expect((config as { acceptAuthRotation?: boolean }).acceptAuthRotation).toBe(true)
    expect(rotation.access_token).toBe('rotated')
  })

  it('surfaces the server refusal for a wrong original password', async () => {
    put.mockReturnValue(refused('Original password is incorrect'))
    await expect(changePassword({ newPassword: 'new-one-11', originalPassword: 'nope' }))
      .rejects.toThrow('Original password is incorrect')
  })
})

describe('deleteSelfAccount', () => {
  it('sends no body, because DeleteSelf reads the id off the session', async () => {
    del.mockReturnValue(ok(null))
    await deleteSelfAccount()

    const [url, config] = del.mock.calls[0]
    expect(url).toBe('/api/user/self')
    expect(config).not.toHaveProperty('data')
  })

  it('surfaces the root-account refusal instead of pretending it worked', async () => {
    del.mockReturnValue(refused('Cannot delete super administrator account'))
    await expect(deleteSelfAccount()).rejects.toThrow('Cannot delete super administrator account')
  })
})

describe('generateAccessToken', () => {
  it('mints through GET and opts out of the in-flight GET de-duplication', async () => {
    get.mockReturnValue(ok('rlNdl8GnZoYzicHfGWeGxFLRmR2Zlgo='))
    const token = await generateAccessToken()

    const [url, config] = get.mock.calls[0]
    expect(url).toBe('/api/user/token')
    expect((config as { disableDuplicate?: boolean }).disableDuplicate).toBe(true)
    expect(token).toBe('rlNdl8GnZoYzicHfGWeGxFLRmR2Zlgo=')
  })
})

describe('binding calls', () => {
  it('posts the address and code to the e-mail bind route', async () => {
    post.mockReturnValue(ok(null))
    await bindEmail('root@example.com', 'a1b2c3')
    expect(post.mock.calls[0][0]).toBe('/api/oauth/email/bind')
    expect(post.mock.calls[0][1]).toEqual({ code: 'a1b2c3', email: 'root@example.com' })
  })

  it('reports a rejected verification code rather than closing quietly', async () => {
    post.mockReturnValue(refused('Verification code is incorrect or has expired'))
    await expect(bindEmail('root@example.com', '000000'))
      .rejects.toThrow('Verification code is incorrect or has expired')
  })

  it('posts the WeChat verification code, not an OAuth code', async () => {
    post.mockReturnValue(ok(null))
    await bindWeChat('123456')
    expect(post.mock.calls[0][0]).toBe('/api/oauth/wechat/bind')
    expect(post.mock.calls[0][1]).toEqual({ code: '123456' })
  })

  it('starts the Telegram flow and returns the callback the widget needs', async () => {
    post.mockReturnValue(ok({
      callback_url: '/api/oauth/telegram/bind/flow-1',
      expires_at: 1788020000,
      flow_token: 'flow-1',
    }))
    const flow = await startTelegramBind()
    expect(post.mock.calls[0][0]).toBe('/api/oauth/telegram/bind/start')
    expect(flow.callback_url).toBe('/api/oauth/telegram/bind/flow-1')
  })

  it('reads custom bindings from the one route that lists them', async () => {
    get.mockReturnValue(ok([]))
    await customOAuthBindingsQuery().queryFn?.({} as never)
    expect(get.mock.calls[0][0]).toBe('/api/user/oauth/bindings')
  })

  it('unbinds a custom provider by its numeric id', async () => {
    del.mockReturnValue(ok(null))
    await unbindCustomOAuth(7)
    expect(del.mock.calls[0][0]).toBe('/api/user/oauth/bindings/7')
  })
})

describe('check-in', () => {
  it('builds the YYYY-MM month key the handler expects', () => {
    expect(checkinMonthKey(new Date(2026, 7, 29))).toBe('2026-08')
    expect(checkinMonthKey(new Date(2026, 11, 1))).toBe('2026-12')
  })

  it('asks for one month and unwraps the stats block', async () => {
    get.mockReturnValue(ok({
      enabled: true,
      max_quota: 10000,
      min_quota: 1000,
      stats: {
        checked_in_today: true,
        checkin_count: 1,
        records: [{ checkin_date: '2026-08-29', quota_awarded: 3227 }],
        total_checkins: 1,
        total_quota: 3227,
      },
    }))

    const status = await checkinStatusQuery('2026-08').queryFn?.({} as never)

    expect(get.mock.calls[0][0]).toBe('/api/user/checkin')
    expect((get.mock.calls[0][1] as { params: { month: string } }).params).toEqual({ month: '2026-08' })
    expect(status?.stats.total_quota).toBe(3227)
  })

  it('turns the disabled-instance refusal into an error rather than an empty panel', async () => {
    get.mockReturnValue(refused('签到功能未启用'))
    await expect(checkinStatusQuery('2026-08').queryFn?.({} as never)).rejects.toThrow('签到功能未启用')
  })

  it('omits the turnstile parameter when the deployment does not ask for one', async () => {
    post.mockReturnValue(ok({ checkin_date: '2026-08-29', quota_awarded: 3227 }))
    await performCheckin('')
    expect((post.mock.calls[0][2] as { params?: unknown }).params).toBeUndefined()
  })

  it('puts the turnstile token in the QUERY string, which is where the middleware reads it', async () => {
    post.mockReturnValue(ok({ checkin_date: '2026-08-29', quota_awarded: 3227 }))
    await performCheckin('cf-token')
    expect(post.mock.calls[0][1]).toBeUndefined()
    expect((post.mock.calls[0][2] as { params: { turnstile: string } }).params)
      .toEqual({ turnstile: 'cf-token' })
  })

  it('reports "already claimed" instead of silently succeeding', async () => {
    post.mockReturnValue(refused('今日已签到'))
    await expect(performCheckin('')).rejects.toThrow('今日已签到')
  })
})
