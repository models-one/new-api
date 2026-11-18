import {
  buildRequestRuleExpr,
  combineBillingExpr,
  MATCH_CONTAINS,
  MATCH_EQ,
  MATCH_RANGE,
  type RequestRuleGroup,
} from '@/lib/billing-expression/billing-expr'

/**
 * Starting points for a tiered price, as the legacy console offers them. Prices are USD per
 * 1M tokens as published by each vendor when the template was written — a template is
 * edited before it is saved, never trusted as the vendor's current price.
 */

export type PricingTemplate = { key: string; label: string; expression: string }
export type PricingTemplateGroup = { group: string; templates: PricingTemplate[] }

function template(key: string, label: string, expression: string, rules: RequestRuleGroup[] = []): PricingTemplate {
  return { expression: combineBillingExpr(expression, buildRequestRuleExpr(rules)), key, label }
}

function timeRule(timeFunc: 'hour' | 'weekday', mode: string, value: string, range: [string, string], multiplier: string): RequestRuleGroup {
  return {
    conditions: [{ mode, rangeEnd: range[1], rangeStart: range[0], source: 'time', timeFunc, timezone: 'Asia/Shanghai', value }],
    multiplier,
  }
}

export const PRICING_TEMPLATES: PricingTemplateGroup[] = [
  {
    group: 'Fixed price',
    templates: [
      template('flat', 'Flat', 'tier("base", p * 2 + c * 4)'),
      template('claude-opus', 'Claude Opus 4.6', 'tier("base", p * 5 + c * 25 + cr * 0.5 + cc * 6.25 + cc1h * 10)'),
      template('gpt-5.4', 'GPT-5.4', 'len <= 272000 ? tier("standard", p * 2.5 + c * 15 + cr * 0.25) : tier("long_context", p * 5 + c * 22.5 + cr * 0.5)'),
    ],
  },
  {
    group: 'Tiered',
    templates: [
      template('claude-sonnet', 'Claude Sonnet 4.5', 'len <= 200000 ? tier("standard", p * 3 + c * 15 + cr * 0.3 + cc * 3.75 + cc1h * 6) : tier("long_context", p * 6 + c * 22.5 + cr * 0.6 + cc * 7.5 + cc1h * 12)'),
      template('qwen3-max', 'Qwen3 Max', 'len <= 32000 ? tier("short", p * 1.2 + c * 6 + cr * 0.24 + cc * 1.5) : len <= 128000 ? tier("mid", p * 2.4 + c * 12 + cr * 0.48 + cc * 3) : tier("long", p * 3 + c * 15 + cr * 0.6 + cc * 3.75)'),
      template('glm-4.5-air', 'GLM-4.5 Air', 'len < 32000 && c < 200 ? tier("short_output", p * 0.8 + c * 2 + cr * 0.16) : len < 32000 && c >= 200 ? tier("long_output", p * 0.8 + c * 6 + cr * 0.16) : tier("mid_context", p * 1.2 + c * 8 + cr * 0.24)'),
      template('doubao-seed-1.8', 'Doubao Seed 1.8', 'len <= 32000 && c <= 200 ? tier("discount", p * 0.8 + c * 2 + cr * 0.16 + cc * 0.17) : len <= 32000 ? tier("short", p * 0.8 + c * 8 + cr * 0.16 + cc * 0.17) : len <= 128000 ? tier("mid", p * 1.2 + c * 16 + cr * 0.16 + cc * 0.17) : tier("long", p * 2.4 + c * 24 + cr * 0.16 + cc * 0.17)'),
    ],
  },
  {
    group: 'Multimodal',
    templates: [
      template('gpt-image-1-mini', 'GPT Image 1 Mini', 'tier("base", p * 2 + c * 8 + img * 2.5)'),
      template('gemini-2.5-flash', 'Gemini 2.5 Flash', 'tier("base", p * 0.3 + c * 2.5 + cr * 0.03 + ai * 1.0)'),
      template('gemini-3-pro-image', 'Gemini 3 Pro Image', 'tier("base", p * 2 + c * 12 + img_o * 120)'),
      template('qwen3-omni-flash', 'Qwen3 Omni Flash', 'tier("base", p * 0.43 + c * 3.06 + img * 0.78 + ai * 3.81 + ao * 15.11)'),
    ],
  },
  {
    group: 'Request rule',
    templates: [
      template('claude-opus-fast', 'Claude Opus 4.6 Fast', 'tier("base", p * 5 + c * 25 + cr * 0.5 + cc * 6.25 + cc1h * 10)', [
        { conditions: [{ mode: MATCH_CONTAINS, path: 'anthropic-beta', source: 'header', value: 'fast-mode-2026-02-01' }], multiplier: '6' },
      ]),
      template('gpt-5.4-tiers', 'GPT-5.4 Priority/Flex', 'len <= 272000 ? tier("standard", p * 2.5 + c * 15 + cr * 0.25) : tier("long_context", p * 5 + c * 22.5 + cr * 0.5)', [
        { conditions: [{ mode: MATCH_EQ, path: 'service_tier', source: 'param', value: 'priority' }], multiplier: '2' },
        { conditions: [{ mode: MATCH_EQ, path: 'service_tier', source: 'param', value: 'flex' }], multiplier: '0.5' },
      ]),
    ],
  },
  {
    group: 'Time-based',
    templates: [
      template('night-discount', 'Night discount (50%)', 'tier("base", p * 3 + c * 15)', [timeRule('hour', MATCH_RANGE, '', ['21', '6'], '0.5')]),
      template('weekend-discount', 'Weekend discount (80%)', 'tier("base", p * 3 + c * 15)', [
        timeRule('weekday', MATCH_EQ, '0', ['', ''], '0.8'),
        timeRule('weekday', MATCH_EQ, '6', ['', ''], '0.8'),
      ]),
    ],
  },
]
