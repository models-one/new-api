import { buildEstimatorTokens, type ExtraTokenValues } from '@/lib/billing-expression/tier-expr'
import { compileBillingExpression } from '@/lib/billing-expression/parser'
import { evaluateBillingExpression } from '@/lib/billing-expression/runtime'
import { TIME_FUNCTIONS, type BillingEvaluationResult, type DiagnosticCode } from '@/lib/billing-expression/types'

/**
 * Trying a billing expression in the browser before it is saved, with the same
 * interpreter the console shares with the Go engine's contract tests. The result is the
 * expression's own price: group ratios and top-up rates are applied on top by the server
 * and are not part of it. Nothing is sent anywhere.
 */

/** What an expression reads, so the form only asks for what matters. */
export type ExpressionNeeds = {
  /** Token variables used besides p and c. */
  extraTokens: Set<keyof ExtraTokenValues>
  usesLength: boolean
  usesImageCount: boolean
  usesRequest: boolean
  usesTime: boolean
}

const EXTRA_TOKENS: Array<[string, keyof ExtraTokenValues]> = [
  ['cr', 'cacheReadTokens'],
  ['cc', 'cacheCreateTokens'],
  ['cc1h', 'cacheCreate1hTokens'],
  ['cc12h', 'cacheCreate12hTokens'],
  ['img', 'imageTokens'],
  ['img_cr', 'imageCacheTokens'],
  ['img_o', 'imageOutputTokens'],
  ['ai', 'audioInputTokens'],
  ['ao', 'audioOutputTokens'],
]

export const NO_EXTRA_TOKENS: ExtraTokenValues = {
  audioInputTokens: 0,
  audioOutputTokens: 0,
  cacheCreate12hTokens: 0,
  cacheCreate1hTokens: 0,
  cacheCreateTokens: 0,
  cacheReadTokens: 0,
  imageCacheTokens: 0,
  imageOutputTokens: 0,
  imageTokens: 0,
}

export function expressionNeeds(expression: string): ExpressionNeeds | null {
  const compiled = compileBillingExpression(expression)
  if (compiled.status !== 'ready') return null
  return {
    extraTokens: new Set(EXTRA_TOKENS.filter(([variable]) => compiled.variables.has(variable as never)).map(([, key]) => key)),
    usesImageCount: compiled.variables.has('image_count'),
    usesLength: compiled.variables.has('len'),
    usesRequest: ['param', 'header', 'has'].some((name) => compiled.functions.has(name)),
    usesTime: TIME_FUNCTIONS.some((name) => compiled.functions.has(name)),
  }
}

export type SimulationRequest = {
  /** JSON text of the request body. */
  body: string
  /** JSON text of `{"header": "value"}`. */
  headers: string
}

export type TokenSimulation = {
  kind: 'token'
  input: number
  output: number
  extra: ExtraTokenValues
  /** Overrides the full input length `len`; null derives it from the token counts. */
  length: number | null
  imageCount: number
}

export type TaskSimulation = { kind: 'task'; usage: Record<string, unknown> }

export type SimulationInput = (TokenSimulation | TaskSimulation) & {
  /** Present only when the expression reads the request. */
  request?: SimulationRequest
  /** ISO time with an offset, or null for now. */
  time: string | null
  now: Date
}

export type SimulationError =
  | 'Request body must be a JSON object.'
  | 'Request headers must be a JSON object with string values.'
  | 'Enter an ISO date and time with a timezone offset.'
  | 'Enter finite, non-negative token counts.'

export type SimulationResult =
  | { inputError: SimulationError; evaluation?: undefined; usd?: undefined }
  | { inputError?: undefined; evaluation: BillingEvaluationResult; usd?: number }

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

function readObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text.trim() === '' ? '{}' : text)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function readTime(text: string): Date | null {
  if (!ISO_WITH_OFFSET.test(text)) return null
  const date = new Date(text)
  // Reject dates the parser rolls over, such as 2026-02-30.
  const calendar = new Date(`${text.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || calendar.toISOString().slice(0, 10) !== text.slice(0, 10)) return null
  return date
}

const count = (value: number) => Number.isFinite(value) && value >= 0

/**
 * The cost of one request or task at this price. `usd` is the charge in USD: a token
 * expression's raw cost is per 1M tokens and is divided once; a task expression already
 * returns the charge.
 */
export function simulate(expression: string, input: SimulationInput): SimulationResult {
  let request: { body: unknown; headers: Record<string, string> } | undefined
  if (input.request) {
    const body = readObject(input.request.body)
    if (body === null) return { inputError: 'Request body must be a JSON object.' }
    const headers = readObject(input.request.headers)
    if (headers === null || Object.values(headers).some((value) => typeof value !== 'string')) {
      return { inputError: 'Request headers must be a JSON object with string values.' }
    }
    request = { body, headers: headers as Record<string, string> }
  }
  let now = input.now
  if (input.time !== null) {
    const fixed = readTime(input.time)
    if (fixed === null) return { inputError: 'Enter an ISO date and time with a timezone offset.' }
    now = fixed
  }

  if (input.kind === 'task') {
    const evaluation = evaluateBillingExpression(expression, { now, request, usage: input.usage })
    return { evaluation, usd: evaluation.status === 'success' ? evaluation.cost : undefined }
  }

  const tokens = [input.input, input.output, input.imageCount, ...Object.values(input.extra)]
  if (!tokens.every(count) || (input.length !== null && !count(input.length))) return { inputError: 'Enter finite, non-negative token counts.' }
  const built = buildEstimatorTokens(input.input, input.output, input.extra, expression)
  if (input.length !== null) built.len = input.length
  const evaluation = evaluateBillingExpression(expression, { imageCount: input.imageCount, now, request, tokens: built })
  if (evaluation.status !== 'success') return { evaluation }
  // Token expressions are per 1M tokens; the interpreter scales fixed() the same way, so
  // the raw cost is divided once whatever the tier's unit.
  return { evaluation, usd: evaluation.cost / 1_000_000 }
}

export const DIAGNOSTIC_TEXT: Record<DiagnosticCode, string> = {
  limit: 'This expression is too large to try in the browser.',
  missing_context: 'Something this expression reads is missing.',
  number: 'Billing values must be finite and non-negative.',
  syntax: 'The expression is not valid.',
  type: 'Expression argument types do not match.',
  unsupported: 'This expression cannot be tried in the browser; the server still bills it.',
}
