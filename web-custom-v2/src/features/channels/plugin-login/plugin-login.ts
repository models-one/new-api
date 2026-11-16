import type { PluginLoginInput, PluginLoginStep } from '@/features/channels/api'

/**
 * State of one provider plugin login (docs/plugin-api/v1.md "login"). The server holds the
 * flow and decides every step; the browser only collects input, polls on the server's
 * interval, and listens for the callback tab. Secrets never pass through here: a `fields`
 * step posts its values straight to the server, and the summary that comes back carries
 * no credential.
 */

/** The callback page hands its result to the login dialog on this channel. */
export const PLUGIN_LOGIN_BROADCAST_CHANNEL = 'new-api-plugin-login'

/** RFC 8628 §3.2: clients poll every 5 seconds unless told otherwise. */
const DEFAULT_POLL_INTERVAL = 5

export type PluginLoginRequest = { kind: 'start' } | { kind: 'continue'; input: PluginLoginInput }

export type PluginLoginState = {
  flow: string | null
  /** The step on screen. A pending poll keeps the device code visible. */
  step: PluginLoginStep | null
  /** Seconds between polls while the vendor has not confirmed the login. */
  interval: number
  status: 'idle' | 'busy' | 'failed'
  /** The request in flight, or the failed one that Retry sends again. */
  request: PluginLoginRequest | null
  error: unknown
  /** The server ended this flow, so only a new login can go on. */
  ended: boolean
}

export type PluginLoginEvent =
  | { type: 'request'; request: PluginLoginRequest }
  | { type: 'started'; flow: string; step: PluginLoginStep }
  | { type: 'received'; step: PluginLoginStep }
  | { type: 'failed'; error: unknown; ended?: boolean }

export const INITIAL_PLUGIN_LOGIN_STATE: PluginLoginState = {
  ended: false,
  error: null,
  flow: null,
  interval: DEFAULT_POLL_INTERVAL,
  request: null,
  status: 'idle',
  step: null,
}

function pollInterval(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.max(1, value) : fallback
}

/** Steps the dialog keeps polling until the vendor confirms the login. */
export function isPluginLoginPolling(step: PluginLoginStep | null): boolean {
  return step?.type === 'device' || step?.type === 'pending'
}

function applyStep(state: PluginLoginState, step: PluginLoginStep): PluginLoginState {
  const settled = { ...state, ended: false, error: null, request: null, status: 'idle' as const }
  if (step.type === 'pending') {
    return {
      ...settled,
      interval: pollInterval(step.interval, state.interval),
      step: isPluginLoginPolling(state.step) ? state.step : step,
    }
  }
  return {
    ...settled,
    interval: step.type === 'device' ? pollInterval(step.interval, DEFAULT_POLL_INTERVAL) : state.interval,
    step,
  }
}

/**
 * Server answers that end a login: the flow is gone, or the server used it up before
 * rejecting the credential the plugin returned. Sending the same request again cannot
 * work, so the dialog offers a new login instead. These messages carry no parameters, so
 * the text the server sends is the key itself.
 */
const LOGIN_ENDING_MESSAGES = new Set([
  'Login flow is invalid or has expired',
  'The device code has expired',
  'Credential index out of range',
  'Logged in to a different account than the credential being replaced',
  'This account is already logged in on another credential of this plugin',
  "This channel's key cannot hold another account",
  "This channel's key format cannot hold plugin credentials",
  "This channel's plugin does not support login",
])

export function endsPluginLogin(error: unknown): boolean {
  return error instanceof Error && LOGIN_ENDING_MESSAGES.has(error.message.trim())
}

export function pluginLoginReducer(state: PluginLoginState, event: PluginLoginEvent): PluginLoginState {
  switch (event.type) {
    case 'request':
      // A new flow drops whatever the previous one left on screen.
      if (event.request.kind === 'start') return { ...INITIAL_PLUGIN_LOGIN_STATE, request: event.request, status: 'busy' }
      return { ...state, error: null, request: event.request, status: 'busy' }
    case 'started':
      return applyStep({ ...INITIAL_PLUGIN_LOGIN_STATE, flow: event.flow }, event.step)
    case 'received':
      // A finished login ignores late poll replies and repeated callbacks.
      if (state.step?.type === 'done') return state
      return applyStep(state, event.step)
    case 'failed':
      return { ...state, ended: event.ended ?? endsPluginLogin(event.error), error: event.error, status: 'failed' }
  }
}

const STEP_TYPES = new Set<string>(['redirect', 'paste', 'device', 'pending', 'fields', 'done'])

/**
 * Reads a callback page message for one channel. BroadcastChannel only delivers
 * same-origin messages, so the check covers shape and channel only.
 */
export function readPluginLoginMessage(data: unknown, channelId: number): PluginLoginStep | null {
  if (!data || typeof data !== 'object') return null
  const message = data as { channel_id?: unknown; step?: unknown }
  if (message.channel_id !== channelId) return null
  const step = message.step as { type?: unknown } | null | undefined
  if (!step || typeof step !== 'object' || typeof step.type !== 'string') return null
  return STEP_TYPES.has(step.type) ? (step as PluginLoginStep) : null
}

/**
 * Reads a failure the callback page reports. The page knows only the `state` the vendor
 * sent back, which is the flow token.
 */
export function readPluginLoginFailure(data: unknown, flow: string | null): string | null {
  if (!flow || !data || typeof data !== 'object') return null
  const message = data as { state?: unknown; error?: unknown }
  if (message.state !== flow || typeof message.error !== 'string') return null
  return message.error
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * The address the vendor sends the browser to after sign-in, read from the standard OAuth
 * `redirect_uri` parameter of the sign-in page address.
 */
export function readPluginLoginRedirect(url: string): string | null {
  let redirect: string | null
  try {
    redirect = new URL(url).searchParams.get('redirect_uri')
  } catch {
    return null
  }
  return redirect && isHttpUrl(redirect) ? redirect : null
}
