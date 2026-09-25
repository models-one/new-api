/**
 * Wire and view types for the model playground.
 *
 * Every shape here was read off the live dev server, not from documentation:
 *   - `POST /pg/chat/completions` streamed frames and non-streamed bodies
 *   - `GET /api/user/models?group=<group>` -> `{ success, data: string[] }`
 *   - `GET /api/user/self/groups` -> `{ success, data: { [group]: { desc, ratio } } }`
 */

export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageStatus = 'loading' | 'streaming' | 'complete' | 'error' | 'aborted'

/** Token accounting the relay appends to the final streamed chunk and to non-streamed bodies. */
export type CompletionUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

/**
 * A turn in the transcript. `content` is the visible answer; `reasoning` holds
 * `delta.reasoning_content` and any text unwrapped from `<think>` tags.
 */
export type PlaygroundMessage = {
  id: string
  role: MessageRole
  content: string
  reasoning: string
  status: MessageStatus
  /** Epoch milliseconds — a local clock value, never a backend timestamp. */
  createdAt: number
  startedAt?: number
  completedAt?: number
  usage?: CompletionUsage
  /** Model actually asked, recorded per message so switching models stays legible. */
  model?: string
  error?: RelayError
}

/** The OpenAI-shaped error envelope the relay returns on every failure path. */
export type RelayError = {
  message: string
  /** e.g. `model_price_error`, `model_not_found`, `invalid_api_key`, `invalid_request`. */
  code: string
  type: string
  /** HTTP status, when the failure carried one. */
  status?: number
}

export type ChatCompletionMessage = {
  role: MessageRole
  content: string
}

export type ChatCompletionRequest = {
  model: string
  /** Billing group. Consumed by the relay to pick a channel; never forwarded upstream. */
  group: string
  messages: ChatCompletionMessage[]
  stream: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number
  frequency_penalty?: number
  presence_penalty?: number
  seed?: number
}

export type ChatCompletionChunk = {
  choices?: {
    index?: number
    delta?: {
      role?: MessageRole
      content?: string | null
      reasoning_content?: string | null
    }
    finish_reason?: string | null
  }[]
  usage?: CompletionUsage | null
}

export type ChatCompletionResponse = {
  choices?: {
    index?: number
    message?: {
      role?: MessageRole
      content?: string | null
      reasoning_content?: string | null
    }
    finish_reason?: string | null
  }[]
  usage?: CompletionUsage | null
}

/** Request parameters the user can tune. Each one is opt-in via `ParameterEnabled`. */
export type PlaygroundConfig = {
  model: string
  group: string
  stream: boolean
  temperature: number
  top_p: number
  max_tokens: number
  frequency_penalty: number
  presence_penalty: number
  seed: number | null
}

export type ParameterEnabled = {
  temperature: boolean
  top_p: boolean
  max_tokens: boolean
  frequency_penalty: boolean
  presence_penalty: boolean
  seed: boolean
}

export type PlaygroundGroup = {
  value: string
  desc: string
  ratio: number
}
