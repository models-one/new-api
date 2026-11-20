import { describe, expect, it } from 'vitest'

import { expressionNeeds, NO_EXTRA_TOKENS, simulate, type SimulationInput } from '@/features/system-settings/billing/price-simulation'

const NOW = new Date('2026-09-07T10:00:00+08:00')

function tokens(input: number, output: number, extra: Partial<typeof NO_EXTRA_TOKENS> = {}): Extract<SimulationInput, { kind: 'token' }> {
  return { extra: { ...NO_EXTRA_TOKENS, ...extra }, imageCount: 1, input, kind: 'token', length: null, now: NOW, output, time: null }
}

describe('trying a price', () => {
  it('charges a flat token price in USD per 1M tokens', () => {
    const result = simulate('tier("base", p * 2.5 + c * 10)', tokens(1_000_000, 500_000))
    expect(result.usd).toBeCloseTo(7.5)
  })

  it('picks the tier by the full input length, cache reads included', () => {
    const expr = 'len <= 32000 ? tier("short", p * 1 + cr * 0.1) : tier("long", p * 2 + cr * 0.2)'
    const short = simulate(expr, tokens(20_000, 0, { cacheReadTokens: 10_000 }))
    const long = simulate(expr, tokens(20_000, 0, { cacheReadTokens: 20_000 }))
    expect(short.evaluation?.status === 'success' && short.evaluation.matchedTier).toBe('short')
    expect(long.evaluation?.status === 'success' && long.evaluation.matchedTier).toBe('long')
    // An explicit length wins over the derived one.
    const forced = simulate(expr, { ...tokens(20_000, 0, { cacheReadTokens: 20_000 }), length: 1000 })
    expect(forced.evaluation?.status === 'success' && forced.evaluation.matchedTier).toBe('short')
  })

  it('applies a request multiplier only when the sample request matches', () => {
    const expr = '(tier("base", p * 2)) * (param("service_tier") == "priority" ? 2 : 1)'
    const plain = simulate(expr, { ...tokens(1_000_000, 0), request: { body: '{}', headers: '{}' } })
    const priority = simulate(expr, { ...tokens(1_000_000, 0), request: { body: '{"service_tier":"priority"}', headers: '{}' } })
    expect(plain.usd).toBeCloseTo(2)
    expect(priority.usd).toBeCloseTo(4)
    expect(priority.evaluation?.status === 'success' && priority.evaluation.requestRules.map((rule) => rule.matched)).toEqual([true])
  })

  it('uses the time it is given, in the expression’s own time zone', () => {
    const expr = '(tier("base", p * 2)) * (hour("Asia/Shanghai") >= 21 || hour("Asia/Shanghai") < 6 ? 0.5 : 1)'
    expect(simulate(expr, { ...tokens(1_000_000, 0), time: '2026-09-07T22:00:00+08:00' }).usd).toBeCloseTo(1)
    expect(simulate(expr, { ...tokens(1_000_000, 0), time: '2026-09-07T12:00:00+08:00' }).usd).toBeCloseTo(2)
    expect(simulate(expr, tokens(1_000_000, 0)).usd).toBeCloseTo(2)
  })

  it('charges a per-request tier as written, not per million', () => {
    expect(simulate('tier("call", fixed(0.04))', tokens(123, 456)).usd).toBeCloseTo(0.04)
  })

  it('prices a task from its usage facts', () => {
    const expr = 'u("resolution") == "4k" ? tier("4k", u("seconds") * 0.6) : tier("hd", u("seconds") * 0.2)'
    const input: SimulationInput = { kind: 'task', now: NOW, time: null, usage: { resolution: '4k', seconds: 8 } }
    expect(simulate(expr, input).usd).toBeCloseTo(4.8)
  })

  it('refuses malformed input instead of guessing', () => {
    expect(simulate('tier("base", p * 2)', { ...tokens(1, 0), request: { body: '[1]', headers: '{}' } }).inputError).toBe('Request body must be a JSON object.')
    expect(simulate('tier("base", p * 2)', { ...tokens(1, 0), request: { body: '{}', headers: '{"x":1}' } }).inputError).toBe('Request headers must be a JSON object with string values.')
    expect(simulate('tier("base", p * 2)', { ...tokens(1, 0), time: '2026-02-30T10:00:00+08:00' }).inputError).toBe('Enter an ISO date and time with a timezone offset.')
    expect(simulate('tier("base", p * 2)', { ...tokens(1, 0), time: '2026-09-07 10:00' }).inputError).toBe('Enter an ISO date and time with a timezone offset.')
    expect(simulate('tier("base", p * 2)', tokens(-1, 0)).inputError).toBe('Enter finite, non-negative token counts.')
  })

  it('reports what an expression reads', () => {
    const needs = expressionNeeds('(len > 1000 ? tier("a", p * 1 + cr * 0.1) : tier("b", p * 2)) * (header("x") == "y" && hour("UTC") > 3 ? 2 : 1)')
    expect(needs).toMatchObject({ usesImageCount: false, usesLength: true, usesRequest: true, usesTime: true })
    expect([...needs!.extraTokens]).toEqual(['cacheReadTokens'])
    expect(expressionNeeds('tier(')).toBeNull()
  })
})
