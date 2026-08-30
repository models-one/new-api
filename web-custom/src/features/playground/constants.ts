import type { ParameterEnabled, PlaygroundConfig } from '@/features/playground/types'

/**
 * The playground relay endpoint.
 *
 * NOT `/v1/chat/completions`. `router/relay-router.go` mounts `/pg` behind
 * `middleware.UserAuth()` and `controller/playground.go` mints a throwaway
 * `model.Token` for the signed-in user, so the playground needs NO API key of the
 * user's own — the console session is the credential. `/v1` sits behind
 * `middleware.TokenAuth()` and would require an `sk-` key instead.
 *
 * `controller/playground.go` also refuses personal access tokens outright
 * ("暂不支持使用 access token"), which only affects PAT holders, not the console's
 * own login token.
 */
export const PLAYGROUND_ENDPOINT = '/pg/chat/completions'

/** `middleware.AdminAuth` gates on `common.RoleAdminUser` = 10. 100 is root. */
export const ADMIN_ROLE = 10

/**
 * The relay's code for "this model has no price configured". `controller` returns it
 * with HTTP 400 before any channel is touched, and only an admin can fix it.
 */
export const MODEL_PRICE_ERROR_CODE = 'model_price_error'

/**
 * Lives on the LEGACY console, which still serves every path outside the custom
 * console's whitelist in `router/web-router.go`. A full-page anchor, not a router link.
 */
export const LEGACY_MODEL_PRICING_PATH = '/system-settings/billing/model-pricing'

/** Batching window for streamed deltas, so a fast stream does not re-render per token. */
export const STREAM_FLUSH_MS = 60

export const DEFAULT_GROUP = 'default'

export const DEFAULT_CONFIG: PlaygroundConfig = {
  model: '',
  group: DEFAULT_GROUP,
  stream: true,
  temperature: 0.7,
  top_p: 1,
  max_tokens: 4096,
  frequency_penalty: 0,
  presence_penalty: 0,
  seed: null,
}

/**
 * Matches the legacy defaults: only the parameters that are safe on every upstream are
 * sent unless the user opts in. `max_tokens` and `seed` are off because some models
 * reject them outright.
 */
export const DEFAULT_PARAMETER_ENABLED: ParameterEnabled = {
  temperature: true,
  top_p: true,
  max_tokens: false,
  frequency_penalty: true,
  presence_penalty: true,
  seed: false,
}

export const STORAGE_KEYS = {
  config: 'models-one.playground.config',
  parameters: 'models-one.playground.parameters',
  messages: 'models-one.playground.messages',
  systemPrompt: 'models-one.playground.system-prompt',
} as const

/** Transcripts are kept in localStorage; this caps what a runaway session can store. */
export const MAX_STORED_MESSAGES = 100
