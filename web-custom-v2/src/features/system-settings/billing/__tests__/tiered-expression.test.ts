import { describe, expect, it } from 'vitest'

import {
  addRule,
  blankTieredDraft,
  findRuleIssues,
  moveRule,
  readTieredDraft,
  removeRule,
  ruleChain,
  writeTieredDraft,
  type TierNode,
  type TieredDraft,
} from '@/features/system-settings/billing/tiered-expression'
import { MATCH_EQ, MATCH_RANGE } from '@/lib/billing-expression/billing-expr'
import { evaluateBillingExpression } from '@/lib/billing-expression/runtime'

const LONG_CONTEXT =
  'len <= 32000 ? tier("short", p * 1.2 + c * 6) : len <= 128000 ? tier("mid", p * 2.4 + c * 12) : tier("long", p * 3 + c * 15)'

function draftOf(expression: string): TieredDraft {
  const draft = readTieredDraft(expression)
  if (draft === null) throw new Error(`not visual: ${expression}`)
  return draft
}

function written(draft: TieredDraft): string {
  const result = writeTieredDraft(draft)
  if (result.expression === undefined) throw new Error(JSON.stringify(result.issues))
  return result.expression
}

/** The tier a request of this many input tokens is billed at. */
function tierAt(expression: string, len: number): string {
  const result = evaluateBillingExpression(expression, { tokens: { c: 0, len, p: len } })
  if (result.status !== 'success') throw new Error(result.status)
  return result.matchedTier
}

describe('the tiered view of an expression', () => {
  it('writes an untouched expression back exactly as it was stored', () => {
    const stored = `${LONG_CONTEXT}`
    expect(written(draftOf(stored))).toBe(stored)
    const withRules = '(tier("base", p * 3 + c * 15)) * (header("anthropic-beta") != "" && has(header("anthropic-beta"), "fast") ? 6 : 1)'
    expect(written(draftOf(withRules))).toBe(withRules)
  })

  it('declines what it cannot show without losing information', () => {
    expect(readTieredDraft('max(p * 2, 100)')).toBeNull()
    expect(readTieredDraft('param("tier") == "pro" ? tier("pro", p * 4) : tier("base", p * 2)')).toBeNull()
  })

  it('reads a chain of conditions as ordered rules ending in the default price', () => {
    const chain = ruleChain(draftOf(LONG_CONTEXT).document.root)
    expect(chain.map((entry) => (entry.result as TierNode).label)).toEqual(['short', 'mid', 'long'])
    expect(chain[2].branch).toBeNull()
  })

  it('removes a rule so the requests it caught fall to the next one', () => {
    const draft = draftOf(LONG_CONTEXT)
    const short = ruleChain(draft.document.root)[0].branch
    const expression = written({ ...draft, document: { ...draft.document, root: removeRule(draft.document.root, short!.id) } })
    expect(tierAt(expression, 1000)).toBe('mid')
    expect(tierAt(expression, 200000)).toBe('long')
  })

  it('reorders rules, which changes which one a request matches first', () => {
    const draft = draftOf(LONG_CONTEXT)
    const mid = ruleChain(draft.document.root)[1].branch
    const expression = written({ ...draft, document: { ...draft.document, root: moveRule(draft.document.root, mid!.id, -1) } })
    // `len <= 128000` now comes first, so a short request is billed as mid.
    expect(tierAt(expression, 1000)).toBe('mid')
    expect(tierAt(expression, 200000)).toBe('long')
  })

  it('never moves the default price out of last place', () => {
    const draft = draftOf(LONG_CONTEXT)
    const mid = ruleChain(draft.document.root)[1].branch
    expect(moveRule(draft.document.root, mid!.id, 1)).toBe(draft.document.root)
  })

  it('adds a rule whose condition must be filled in before anything is written', () => {
    const draft = draftOf('tier("base", p * 2 + c * 8)')
    const root = addRule(draft.document.root)
    const chain = ruleChain(root)
    expect(chain).toHaveLength(2)
    expect((chain[0].result as TierNode).prices.map((price) => price.value)).toEqual(['2', '8'])
    const result = writeTieredDraft({ ...draft, document: { ...draft.document, root } })
    expect(result.expression).toBeUndefined()
    expect(result.issues.map((issue) => issue.message)).toContain('Enter a valid condition value.')
  })

  it('starts a new price with empty token prices, so free is never the silent default', () => {
    const result = writeTieredDraft(blankTieredDraft())
    expect(result.expression).toBeUndefined()
    expect(result.issues.map((issue) => issue.message)).toEqual([
      'Enter a finite, non-negative price.',
      'Enter a finite, non-negative price.',
    ])
  })

  it('refuses a negative price', () => {
    const draft = draftOf('tier("base", p * 2 + c * 8)')
    const tier = draft.document.root as TierNode
    const root = { ...tier, prices: tier.prices.map((price) => (price.variable === 'c' ? { ...price, value: '-1' } : price)) }
    expect(writeTieredDraft({ ...draft, document: { ...draft.document, root } }).expression).toBeUndefined()
  })
})

describe('request rules in the tiered view', () => {
  const base = 'tier("base", p * 3 + c * 15)'

  it('keeps rules it cannot show as rows as text, and still writes them back', () => {
    const odd = `(${base}) * (param("n") > 2 || header("x") == "y" ? 2 : 1)`
    const draft = draftOf(odd)
    expect(draft.rulesEditable).toBe(false)
    expect(written(draft)).toBe(odd)
  })

  it('writes an edited rule as a multiplier on the base price', () => {
    const draft = draftOf(base)
    const expression = written({
      ...draft,
      rules: [{ conditions: [{ mode: MATCH_EQ, path: 'service_tier', source: 'param', value: 'priority' }], multiplier: '2' }],
      rulesEdited: true,
    })
    expect(expression).toBe(`(${base}) * (param("service_tier") == "priority" ? 2 : 1)`)
    const priority = evaluateBillingExpression(expression, { request: { body: { service_tier: 'priority' } }, tokens: { c: 0, p: 1_000_000 } })
    expect(priority.status === 'success' && priority.cost).toBe(6_000_000)
  })

  it('refuses a rule with no multiplier, a negative one, or an incomplete condition', () => {
    expect(findRuleIssues([{ conditions: [{ mode: MATCH_EQ, path: 'tier', source: 'param', value: 'x' }], multiplier: '' }]).map((issue) => issue.id)).toEqual(['rule-0:multiplier'])
    expect(findRuleIssues([{ conditions: [{ mode: MATCH_EQ, path: 'tier', source: 'param', value: 'x' }], multiplier: '-2' }]).map((issue) => issue.id)).toEqual(['rule-0:multiplier'])
    expect(findRuleIssues([{ conditions: [{ mode: MATCH_EQ, path: '', source: 'param', value: 'x' }], multiplier: '2' }]).map((issue) => issue.id)).toEqual(['rule-0:0'])
    expect(
      findRuleIssues([
        {
          conditions: [{ mode: MATCH_RANGE, rangeEnd: '6', rangeStart: '25', source: 'time', timeFunc: 'hour', timezone: 'Asia/Shanghai', value: '' }],
          multiplier: '0.5',
        },
      ]).map((issue) => issue.id),
    ).toEqual(['rule-0:0'])
  })

  it('does not write anything while a rule is incomplete', () => {
    const draft = draftOf(base)
    const result = writeTieredDraft({ ...draft, rules: [{ conditions: [{ mode: MATCH_EQ, path: '', source: 'header', value: '' }], multiplier: '2' }], rulesEdited: true })
    expect(result.expression).toBeUndefined()
  })
})

describe('pricing templates', () => {
  it('opens every template in the tiered view, rules included, and writes it back unchanged', async () => {
    const { PRICING_TEMPLATES } = await import('@/features/system-settings/billing/pricing-templates')
    for (const { templates } of PRICING_TEMPLATES) {
      for (const { expression, key } of templates) {
        const draft = readTieredDraft(expression)
        expect(draft, key).not.toBeNull()
        expect(draft!.rulesEditable, key).toBe(true)
        expect(written(draft!), key).toBe(expression)
      }
    }
  })

  it('refuses a time rule in a zone the server does not know', () => {
    expect(
      findRuleIssues([
        { conditions: [{ mode: MATCH_RANGE, rangeEnd: '6', rangeStart: '21', source: 'time', timeFunc: 'hour', timezone: 'Mars/Olympus', value: '' }], multiplier: '0.5' },
      ]).map((issue) => issue.id),
    ).toEqual(['rule-0:0'])
  })
})
