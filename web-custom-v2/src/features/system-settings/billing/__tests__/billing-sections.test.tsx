// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const patch = vi.fn()
const del = vi.fn()

vi.mock('@/lib/http-client', () => ({ api: { get, post, put, patch, delete: del } }))

const { CheckinSection } = await import('@/features/system-settings/billing/CheckinSection')
const { CurrencySection } = await import('@/features/system-settings/billing/CurrencySection')
const { GroupPricingSection } = await import('@/features/system-settings/billing/GroupPricingSection')
const { ModelPricingSection } = await import('@/features/system-settings/billing/ModelPricingSection')
const { PaymentSection } = await import('@/features/system-settings/billing/PaymentSection')
const { QuotaSection } = await import('@/features/system-settings/billing/QuotaSection')

/**
 * THE BILLING SECTIONS, AGAINST THE PAYLOAD THE DEV SERVER ACTUALLY RETURNS.
 *
 * Every value below is a STRING, because every one of the 234 values in
 * `GET /api/option/` is. A refusal is HTTP 200 with `{success:false, message}`, not a 4xx,
 * so `server.refuse` models it that way.
 *
 * These tests are about branching that costs money if it is wrong: the compliance gate,
 * the divisor guard, the JSON blobs whose refused write corrupts the stored value, and
 * the write-only credentials.
 */
const seeded: Record<string, string> = {
  AudioCompletionRatio: '{}',
  AudioRatio: '{"gpt-4o-audio-preview":16}',
  AutoGroups: '["default"]',
  MaxTokenAutoGroups: '5',
  'billing_setting.billing_expr': '{}',
  'billing_setting.billing_mode': '{}',
  CacheRatio: '{}',
  'checkin_setting.enabled': 'false',
  'checkin_setting.max_quota': '10000',
  'checkin_setting.min_quota': '1000',
  CompletionRatio: '{"gpt-4-all":2}',
  CreateCacheRatio: '{}',
  CreemProducts: '[]',
  CreemTestMode: 'false',
  CustomCallbackAddress: '',
  DefaultUseAutoGroup: 'false',
  DisplayInCurrencyEnabled: 'true',
  DisplayTokenStatEnabled: 'true',
  EpayId: '',
  ExposeRatioEnabled: 'false',
  'general_setting.custom_currency_exchange_rate': '1',
  'general_setting.custom_currency_symbol': '¤',
  'general_setting.docs_link': 'https://docs.newapi.pro',
  'general_setting.quota_display_type': 'USD',
  'group_ratio_setting.group_special_usable_group': '{}',
  GroupGroupRatio: '{"vip":{"edit_this":0.9}}',
  GroupRatio: '{"default":1,"svip":1,"vip":1}',
  ImageRatio: '{"gpt-image-1":2}',
  MinTopUp: '1',
  ModelPrice: '{"dall-e-3":0.04}',
  ModelRatio: '{"gpt-4-all":15}',
  NowPaymentsFeePaidByUser: 'false',
  NowPaymentsMinTopUp: '1',
  NowPaymentsUnitPrice: '1',
  PayAddress: '',
  'payment_setting.amount_discount': '{}',
  'payment_setting.amount_options': '[10,20,50,100,200,500]',
  'payment_setting.compliance_confirmed': 'true',
  'payment_setting.compliance_confirmed_at': '1788047578',
  'payment_setting.compliance_confirmed_by': '1',
  'payment_setting.compliance_confirmed_ip': '127.0.0.1',
  'payment_setting.compliance_terms_version': 'v1',
  PayMethods: '[{"icon":"SiAlipay","name":"支付宝","type":"alipay"}]',
  PreConsumedQuota: '500',
  Price: '7.3',
  QuotaForInvitee: '0',
  QuotaForInviter: '0',
  QuotaForNewUser: '0',
  QuotaPerUnit: '500000',
  'quota_setting.enable_free_model_pre_consume': 'true',
  StripeMinTopUp: '1',
  StripePriceId: '',
  StripePromotionCodesEnabled: 'false',
  StripeUnitPrice: '8',
  'tool_price_setting.prices': '{}',
  TopUpLink: '',
  TopupGroupRatio: '{"default":1,"svip":1,"vip":1}',
  USDExchangeRate: '7.3',
  UserUsableGroups: '{"default":"默认分组","vip":"vip分组"}',
  WaffoCurrency: '',
  WaffoEnabled: 'false',
  WaffoMerchantId: '',
  WaffoMinTopUp: '1',
  WaffoNotifyUrl: '',
  WaffoPancakeMerchantID: '',
  WaffoPancakeMinTopUp: '1',
  WaffoPancakeProductID: '',
  WaffoPancakeReturnURL: '',
  WaffoPancakeStoreID: '',
  WaffoPancakeUnitPrice: '1',
  WaffoPayMethods: '[]',
  WaffoPublicCert: '',
  WaffoReturnUrl: '',
  WaffoSandbox: 'false',
  WaffoSandboxPublicCert: '',
  WaffoSubscriptionReturnUrl: '',
  WaffoUnitPrice: '3',
}

type ServerState = {
  stored: Record<string, string>
  /** Keys the server should refuse, mapped to the sentence it refuses them with. */
  refuse: Record<string, string>
  topUpFails: boolean
  /** `GET /api/channel/models_enabled`. Go serialises an empty slice as null. */
  enabledModels: string[] | null
  /** That endpoint sits behind channel:read, which root can be missing. */
  enabledModelsFails: boolean
  /** Models priced only by a built-in price: nothing stored, an effective price reported. */
  builtin: Record<string, Record<string, unknown>>
  /** Bumped on every stored change of a model; the version a save must match. */
  revisions: Record<string, number>
  /** Task plugins serving a model: `GET /api/option/model_pricing` plugin variants. */
  plugins: Record<string, Array<{ key: string; schema: Record<string, unknown>; relay?: boolean; stale?: boolean }>>
  /** `GET /api/option/model_pricing/issues`. */
  issues: Array<{ model_name: string; plugin_key: string; plugin_name: string; reason: string }>
}

let server: ServerState

function renderSection(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(node, { wrapper })
}

/** Every `{key, value}` a section has written, in order. */
function writes(): { key: string; value: string }[] {
  return put.mock.calls
    .filter((call) => call[0] === '/api/option/')
    .map((call) => call[1] as { key: string; value: string })
}

function writtenKeys(): string[] {
  return writes().map((write) => write.key)
}

async function save() {
  fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
}

/**
 * Waits for the option payload to land before the test touches anything.
 *
 * Every section renders immediately against `options === undefined` — the real loading
 * state — with its fields holding their fallbacks and every control disabled. Interacting
 * during that window quietly does nothing, so a test written without this waits on
 * nothing and passes for the wrong reason.
 *
 * It waits on a control being ENABLED rather than on a value, deliberately: several of
 * these settings have a fallback equal to what the dev server stores (`QuotaPerUnit` is
 * 500000 both ways, `MinTopUp` is 1 both ways), so a value assertion cannot tell the
 * loading state from the loaded one. Being enabled can only mean the payload arrived.
 */
async function settled(controlLabel: RegExp | string) {
  await waitFor(() => expect(screen.getByLabelText(controlLabel)).toBeEnabled())
}

beforeEach(() => {
  server = {
    enabledModels: ['gpt-4-all', 'dall-e-3'],
    enabledModelsFails: false,
    refuse: {},
    stored: { ...seeded },
    topUpFails: false,
    builtin: {},
    issues: [],
    plugins: {},
    revisions: {},
  }

  get.mockReset()
  put.mockReset()
  patch.mockReset()
  post.mockReset()
  del.mockReset()

  get.mockImplementation((url: string) => {
    if (url === '/api/option/') {
      return Promise.resolve({
        data: {
          data: Object.entries(server.stored).map(([key, value]) => ({ key, value })),
          message: '',
          success: true,
        },
      })
    }
    if (url === '/api/option/model_pricing/issues') {
      return Promise.resolve({ data: { data: server.issues, message: '', success: true } })
    }
    if (url === '/api/option/model_pricing' || url.startsWith('/api/option/model_pricing?')) {
      const query = url.includes('?') ? new URLSearchParams(url.split('?')[1]).getAll('model') : null
      const names = query ?? storedModelNames()
      return Promise.resolve({
        data: { data: { empty_version: 'v0', entries: names.map(pricingEntry) }, message: '', success: true },
      })
    }
    if (url === '/api/status') {
      return Promise.resolve({
        data: { data: { quota_per_unit: 500_000 }, message: '', success: true },
      })
    }
    if (url === '/api/channel/models_enabled') {
      if (server.enabledModelsFails) {
        return Promise.resolve({
          data: { data: null, message: 'no permission for channel', success: false },
        })
      }
      return Promise.resolve({
        data: { data: server.enabledModels, message: '', success: true },
      })
    }
    if (url === '/api/user/topup/info') {
      if (server.topUpFails) return Promise.reject(new Error('the readiness check is down'))
      return Promise.resolve({
        data: {
          data: {
            amount_options: [10, 20],
            creem_products: '[]',
            discount: {},
            enable_creem_topup: false,
            enable_nowpayments_topup: false,
            enable_online_topup: false,
            enable_redemption: true,
            enable_stripe_topup: true,
            enable_waffo_pancake_topup: false,
            enable_waffo_topup: false,
            min_topup: 1,
            nowpayments_min_topup: 1,
            pay_methods: [],
            payment_compliance_confirmed: true,
            payment_compliance_terms_version: 'v1',
            stripe_min_topup: 1,
            topup_link: '',
            waffo_min_topup: 1,
            waffo_pancake_min_topup: 1,
            waffo_pay_methods: null,
          },
          message: '',
          success: true,
        },
      })
    }
    throw new Error(`unmocked GET ${url}`)
  })

  put.mockImplementation((url: string, body: { key: string; value: string }) => {
    if (url !== '/api/option/') throw new Error(`unmocked PUT ${url}`)
    const refusal = server.refuse[body.key]
    if (refusal !== undefined) {
      return Promise.resolve({ data: { message: refusal, success: false } })
    }
    server.stored[body.key] = body.value
    return Promise.resolve({ data: { message: '', success: true } })
  })

  post.mockImplementation(() => Promise.resolve({ data: { message: '', success: true } }))

  patch.mockImplementation((url: string, body: { changes: PricingChange[] }) => {
    if (url !== '/api/option/model_pricing') throw new Error(`unmocked PATCH ${url}`)
    // All or nothing, as `model.UpdateModelPricing` checks every version before writing.
    if (body.changes.some((change) => change.expected_version !== versionOf(change.model_name))) {
      return Promise.reject(
        Object.assign(new Error('Request failed with status code 409'), {
          isAxiosError: true,
          response: { data: { message: 'model pricing changed', success: false }, status: 409 },
        }),
      )
    }
    for (const change of body.changes) {
      for (const key of [...PRICING_KEYS, PLUGIN_KEY]) {
        const map = JSON.parse(server.stored[key] ?? '{}') as Record<string, unknown>
        if (key === PLUGIN_KEY) {
          for (const stored of Object.keys(map)) if (stored.endsWith(`::${change.model_name}`)) delete map[stored]
          const plugins = (change.pricing[PLUGIN_KEY] ?? {}) as Record<string, string>
          for (const [plugin, expr] of Object.entries(plugins)) map[`${plugin}::${change.model_name}`] = expr
        } else {
          delete map[change.model_name]
          if (key in change.pricing) map[change.model_name] = change.pricing[key]
        }
        server.stored[key] = JSON.stringify(map)
      }
      server.revisions[change.model_name] = (server.revisions[change.model_name] ?? 0) + 1
    }
    return Promise.resolve({ data: { data: {}, message: '', success: true } })
  })
})

const PRICING_KEYS = [
  'ModelPrice', 'ModelRatio', 'CompletionRatio', 'CacheRatio', 'CreateCacheRatio',
  'ImageRatio', 'AudioRatio', 'AudioCompletionRatio',
  'billing_setting.billing_mode', 'billing_setting.billing_expr',
]

const PLUGIN_KEY = 'billing_setting.plugin_billing_expr'

type PricingChange = { model_name: string; expected_version: string; pricing: Record<string, unknown>; reset?: boolean }

function versionOf(name: string): string {
  return `v${server.revisions[name] ?? 0}`
}

/** Every model with a stored price, then the built-in ones, in name order like the server. */
function storedModelNames(): string[] {
  const names = new Set<string>(Object.keys(server.builtin))
  for (const key of PRICING_KEYS) {
    for (const name of Object.keys(JSON.parse(server.stored[key] ?? '{}') as Record<string, unknown>)) names.add(name)
  }
  return [...names].sort()
}

/** One entry of `model.GetModelPricingSnapshot`: stored values, plus the effective price. */
function pricingEntry(name: string) {
  const configured: Record<string, unknown> = {}
  for (const key of PRICING_KEYS) {
    const map = JSON.parse(server.stored[key] ?? '{}') as Record<string, unknown>
    if (name in map) configured[key] = map[name]
  }
  const pluginPrices = JSON.parse(server.stored[PLUGIN_KEY] ?? '{}') as Record<string, string>
  const variants = Object.fromEntries(
    Object.entries(pluginPrices)
      .filter(([key]) => key.endsWith(`::${name}`))
      .map(([key, expr]) => [key.split('::')[0], expr]),
  )
  if (Object.keys(variants).length > 0) configured[PLUGIN_KEY] = variants
  const priced = Object.keys(configured).some((key) => key !== PLUGIN_KEY)
  return {
    configured,
    effective: priced ? configured : (server.builtin[name] ?? configured),
    model_name: name,
    plugin_variants: [
      ...(server.plugins[name] ?? []).map((plugin) => ({
        compatible: true,
        configured: variants[plugin.key] ?? '',
        effective: variants[plugin.key] ?? '',
        plugin_key: plugin.key,
        plugin_name: plugin.key,
        relay: plugin.relay,
        stale: plugin.stale,
        usage_schema: plugin.schema,
      })),
      ...Object.entries(variants)
        .filter(([plugin]) => !(server.plugins[name] ?? []).some((item) => item.key === plugin))
        .map(([plugin, expr]) => ({ compatible: true, configured: expr, effective: expr, plugin_key: plugin, plugin_name: plugin, usage_schema: {} })),
    ],
    version: versionOf(name),
  }
}

function pricingChanges(): PricingChange[] {
  return patch.mock.calls.flatMap((call) => (call[1] as { changes: PricingChange[] }).changes)
}

afterEach(cleanup)

/** The model pricing page shows one tab at a time. */
async function openTab(name: string) {
  fireEvent.click(await screen.findByRole('tab', { name }))
}

describe('QuotaSection and the payment-compliance gate', () => {
  it('reads the amounts off a payload in which every value is a string', async () => {
    renderSection(<QuotaSection />)
    await settled(/New account balance/)

    expect(screen.getByLabelText(/New account balance/)).toHaveValue(0)
    expect(screen.getByRole('switch', { name: /Pre-consume quota for free models/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('writes a positive invitation reward while the compliance terms are accepted', async () => {
    renderSection(<QuotaSection />)
    await settled(/New account balance/)

    fireEvent.change(screen.getByLabelText(/Reward for the inviter/), { target: { value: '1000' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'QuotaForInviter', value: '1000' })
  })

  it('will not even attempt a positive reward while the terms are unaccepted', async () => {
    // controller/option.go refuses QuotaForInviter/Invitee for a positive value until
    // IsPaymentComplianceConfirmed(). Firing a write that is certain to come back refused
    // teaches the operator nothing, so the gate is named in the field instead.
    server.stored['payment_setting.compliance_confirmed'] = 'false'
    renderSection(<QuotaSection />)

    expect(await screen.findByText('Invitation rewards are locked')).toBeInTheDocument()
    await settled(/New account balance/)

    fireEvent.change(screen.getByLabelText(/Reward for the inviter/), { target: { value: '1000' } })
    await save()

    expect(
      await screen.findByText(
        'The server refuses a reward above zero until the payment compliance terms are accepted, under Billing → Payment gateway.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('still lets a reward be set back to zero while the gate is closed', async () => {
    // Zero is always accepted server-side, so the gate must not block the way out.
    server.stored['payment_setting.compliance_confirmed'] = 'false'
    server.stored.QuotaForInviter = '5000'
    renderSection(<QuotaSection />)
    await settled(/Reward for the inviter/)
    expect(screen.getByLabelText(/Reward for the inviter/)).toHaveValue(5000)

    fireEvent.change(screen.getByLabelText(/Reward for the inviter/), { target: { value: '0' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'QuotaForInviter', value: '0' })
  })

  it('treats an accepted-but-stale terms version as a closed gate', async () => {
    server.stored['payment_setting.compliance_terms_version'] = 'v0'
    renderSection(<QuotaSection />)
    expect(await screen.findByText('Invitation rewards are locked')).toBeInTheDocument()
  })

  it('surfaces the server’s own sentence when the gate closes underneath the form', async () => {
    // A stale read, or a second operator. The optimistic value must not stand.
    server.refuse.QuotaForInviter = '请先确认支付合规条款'
    renderSection(<QuotaSection />)
    await settled(/New account balance/)

    fireEvent.change(screen.getByLabelText(/Reward for the inviter/), { target: { value: '1000' } })
    await save()

    expect(await screen.findByText('The server refused some of these settings')).toBeInTheDocument()
    expect(screen.getByText('请先确认支付合规条款')).toBeInTheDocument()
    // The refused key keeps the operator's value so a second Save retries only that one.
    expect(screen.getByLabelText(/Reward for the inviter/)).toHaveValue(1000)
  })

  it('rejects a top-up link that is not an absolute http address', async () => {
    renderSection(<QuotaSection />)
    await settled(/New account balance/)

    fireEvent.change(screen.getByLabelText(/Top-up link/), { target: { value: 'example.com/topup' } })
    await save()

    expect(
      await screen.findByText('Enter a full http:// or https:// address, or leave this empty.'),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })
})

describe('QuotaSection and what a request reserves before it runs', () => {
  it('shows the stored bypass threshold and multiplier, and writes only the one that changed', async () => {
    server.stored['quota_setting.trust_quota_usd'] = '10'
    server.stored['quota_setting.pre_consume_multiplier'] = '1'
    renderSection(<QuotaSection />)
    await settled('Input pre-consume multiplier')

    expect(screen.getByLabelText('Wallet pre-consume bypass threshold (USD)')).toHaveValue(10)
    fireEvent.change(screen.getByLabelText('Input pre-consume multiplier'), { target: { value: '1.5' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'quota_setting.pre_consume_multiplier', value: '1.5' })
  })

  it('refuses a zero multiplier, which the server rejects, but lets the threshold be 0 to always reserve', async () => {
    renderSection(<QuotaSection />)
    await settled('Input pre-consume multiplier')

    fireEvent.change(screen.getByLabelText('Input pre-consume multiplier'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Wallet pre-consume bypass threshold (USD)'), { target: { value: '0' } })
    await save()

    expect(await screen.findByText('Enter a number greater than zero.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Input pre-consume multiplier'), { target: { value: '1' } })
    await save()
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'quota_setting.trust_quota_usd', value: '0' })
  })
})

describe('CurrencySection and the divisor everything is expressed with', () => {
  it('refuses a divisor of zero, which the server accepts without complaint', async () => {
    // model/option.go: `common.QuotaPerUnit, _ = strconv.ParseFloat(value, 64)` — the
    // error is DISCARDED. Verified live: "0" and "abc" both answer success:true and leave
    // every currency figure in the deployment dividing by zero.
    renderSection(<CurrencySection />)
    await settled(/Quota divisor/)

    fireEvent.change(screen.getByLabelText(/Quota divisor/), { target: { value: '0' } })
    await save()

    expect(
      await screen.findByText(
        'The divisor must be greater than zero. The server accepts zero without complaint and every currency figure then divides by it.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('spells out the repricing before a legal change is saved', async () => {
    renderSection(<CurrencySection />)
    await settled(/Quota divisor/)

    expect(screen.queryByText('This reprices every figure in the console')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Quota divisor/), { target: { value: '100000' } })

    expect(await screen.findByText('This reprices every figure in the console')).toBeInTheDocument()
    await save()
    await waitFor(() => expect(writes()).toEqual([{ key: 'QuotaPerUnit', value: '100000' }]))
  })

  it('only asks for a custom symbol and rate once a custom currency is chosen', async () => {
    renderSection(<CurrencySection />)
    await settled(/Quota divisor/)
    expect(screen.queryByLabelText(/Custom currency symbol/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Balance display/), { target: { value: 'CUSTOM' } })
    expect(await screen.findByLabelText(/Custom currency symbol/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Custom currency symbol/), { target: { value: '  ' } })
    await save()
    expect(await screen.findByText('A custom display needs a symbol.')).toBeInTheDocument()
    expect(writtenKeys()).not.toContain('general_setting.custom_currency_symbol')
  })

  it('writes the explicit display choice after the flag the server derives it from', async () => {
    // Writing DisplayInCurrencyEnabled makes the server ALSO set quota_display_type
    // (true -> USD, false -> TOKENS). Keys are written in sorted order, and
    // 'DisplayInCurrencyEnabled' sorts before 'general_setting.quota_display_type', so the
    // operator's explicit choice is written last and wins.
    renderSection(<CurrencySection />)
    await settled(/Quota divisor/)

    fireEvent.click(screen.getByRole('switch', { name: /Show balances as money/ }))
    fireEvent.change(screen.getByLabelText(/Balance display/), { target: { value: 'CNY' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writtenKeys()).toEqual(['DisplayInCurrencyEnabled', 'general_setting.quota_display_type'])
    expect(server.stored['general_setting.quota_display_type']).toBe('CNY')
  })
})

describe('CheckinSection', () => {
  it('reads the string “false” as an off switch rather than as truthy', async () => {
    renderSection(<CheckinSection />)
    expect(await screen.findByRole('switch', { name: /Allow daily check-in/ })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(
      screen.getByText('Check-in is currently switched off, so nobody can claim these amounts.'),
    ).toBeInTheDocument()
  })

  it('rejects an inverted reward range, which the server stores without a word', async () => {
    renderSection(<CheckinSection />)
    await settled(/Largest reward/)

    fireEvent.change(screen.getByLabelText(/Largest reward/), { target: { value: '500' } })
    await save()

    expect(await screen.findByText('The maximum cannot be below the minimum.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('saves an equal minimum and maximum as a fixed reward', async () => {
    renderSection(<CheckinSection />)
    await settled(/Largest reward/)

    fireEvent.change(screen.getByLabelText(/Largest reward/), { target: { value: '1000' } })
    await save()
    await waitFor(() =>
      expect(writes()).toEqual([{ key: 'checkin_setting.max_quota', value: '1000' }]),
    )
  })
})

describe('ModelPricingSection', () => {
  /** Opens the per-model editor from the table and returns the dialog. */
  async function openEditor(model: string) {
    const button = await screen.findByRole('button', { name: `Edit pricing for ${model}` })
    fireEvent.click(button)
    return screen.findByRole('dialog')
  }

  it('lists every priced model with the price it is actually charged', async () => {
    server.builtin['claude-x'] = {
      'billing_setting.billing_expr': 'tier("base", p * 3 + c * 15)',
      'billing_setting.billing_mode': 'tiered_expr',
    }
    renderSection(<ModelPricingSection />)

    const table = await screen.findByRole('table', { name: 'Configured model prices' })
    await waitFor(() => expect(within(table).getByText('dall-e-3')).toBeInTheDocument())
    // ModelRatio 15 at a quota unit of 500000 is $30 per 1M input tokens; CompletionRatio 2 doubles it.
    expect(within(table).getByText('Input $30 · Output $60 per 1M tokens')).toBeInTheDocument()
    expect(within(table).getByText('$0.04 per request')).toBeInTheDocument()
    // A model priced only by a built-in expression is listed, and says so.
    const builtin = within(table).getByText('claude-x').closest('tr') as HTMLElement
    expect(within(builtin).getByText('Built-in or default price')).toBeInTheDocument()
    expect(within(builtin).getByText(/\$3/)).toBeInTheDocument()
    // Only the legacy modes are marked deprecated.
    expect(within(builtin).queryByText('Deprecated')).not.toBeInTheDocument()
    const legacy = within(table).getByText('gpt-4-all').closest('tr') as HTMLElement
    expect(within(legacy).getByText('Deprecated')).toBeInTheDocument()
  })

  it('saves one model through the per-model endpoint, against the version it read', async () => {
    renderSection(<ModelPricingSection />)
    const dialog = await openEditor('gpt-4-all')

    fireEvent.change(within(dialog).getByLabelText('Model ratio'), { target: { value: '30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    expect(pricingChanges()[0]).toEqual({
      expected_version: 'v0',
      model_name: 'gpt-4-all',
      pricing: { 'billing_setting.billing_mode': 'ratio', CompletionRatio: 2, ModelRatio: 30 },
    })
    // The whole-map PUT is never used for pricing.
    expect(writes()).toHaveLength(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps a model’s per-plugin prices, which the server would otherwise drop', async () => {
    server.stored[PLUGIN_KEY] = '{"acme::gpt-4-all":"p * 3"}'
    renderSection(<ModelPricingSection />)
    const dialog = await openEditor('gpt-4-all')

    fireEvent.change(within(dialog).getByLabelText('Model ratio'), { target: { value: '30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    expect(pricingChanges()[0].pricing[PLUGIN_KEY]).toEqual({ acme: 'p * 3' })
  })

  it('never stores a built-in price it was only shown', async () => {
    server.builtin['claude-x'] = {
      'billing_setting.billing_expr': 'tier("base", p * 3 + c * 15)',
      'billing_setting.billing_mode': 'tiered_expr',
    }
    renderSection(<ModelPricingSection />)
    const dialog = await openEditor('claude-x')

    // It opens on the built-in expression, as simple prices, with nothing to save.
    expect(within(dialog).getByLabelText('Input (USD / 1M tokens)')).toHaveValue(3)
    const saveButton = within(dialog).getByRole('button', { name: 'Save' })
    expect(saveButton).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText('Input (USD / 1M tokens)'), { target: { value: '2.5' } })
    expect(saveButton).toBeEnabled()
    fireEvent.click(saveButton)

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    expect(pricingChanges()[0].pricing).toEqual({
      'billing_setting.billing_expr': 'tier("base", p * 2.5 + c * 15)',
      'billing_setting.billing_mode': 'tiered_expr',
    })
  })

  it('refuses a negative price before the server sees it', async () => {
    renderSection(<ModelPricingSection />)
    const dialog = await openEditor('dall-e-3')

    fireEvent.change(within(dialog).getByLabelText('Price per request (USD)'), { target: { value: '-1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByText('Enter a finite, non-negative price')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
  })

  it('says the price was changed elsewhere instead of overwriting it', async () => {
    renderSection(<ModelPricingSection />)
    const dialog = await openEditor('gpt-4-all')
    // Someone saves the model after this console read it.
    server.revisions['gpt-4-all'] = 1

    fireEvent.change(within(dialog).getByLabelText('Model ratio'), { target: { value: '30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByText('This price was changed elsewhere')).toBeInTheDocument()
    expect(JSON.parse(server.stored.ModelRatio)).toEqual({ 'gpt-4-all': 15 })
  })

  it('converts a legacy price to the same price as an expression', async () => {
    post.mockImplementation((url: string) => {
      if (url !== '/api/option/model_pricing/convert') throw new Error(`unmocked POST ${url}`)
      return Promise.resolve({
        data: { data: { expression: 'tier("base", p * 30 + c * 60)' }, message: '', success: true },
      })
    })
    renderSection(<ModelPricingSection />)
    const dialog = await openEditor('gpt-4-all')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Convert to expression' }))
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Use this expression' }))

    expect(within(dialog).getByLabelText('Input (USD / 1M tokens)')).toHaveValue(30)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    // The ratios stay stored, so the model can be switched back.
    expect(pricingChanges()[0].pricing).toEqual({
      'billing_setting.billing_expr': 'tier("base", p * 30 + c * 60)',
      'billing_setting.billing_mode': 'tiered_expr',
      CompletionRatio: 2,
      ModelRatio: 15,
    })
  })

  it('restores the selected models to their default price against fresh versions', async () => {
    renderSection(<ModelPricingSection />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select gpt-4-all' }))
    // Changed after the list was read; the restore reads the version again.
    server.revisions['gpt-4-all'] = 3

    fireEvent.click(screen.getByRole('button', { name: 'Restore default price for 1 selected' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore default price' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    expect(pricingChanges()[0]).toEqual({ expected_version: 'v3', model_name: 'gpt-4-all', pricing: {}, reset: true })
    // It leaves the table; with no built-in price it is now listed as unpriced instead.
    const table = screen.getByRole('table', { name: 'Configured model prices' })
    await waitFor(() => expect(within(table).queryByText('gpt-4-all')).not.toBeInTheDocument())
    await openTab('Unpriced models')
    expect(await screen.findByRole('button', { name: 'Set a price for gpt-4-all' })).toBeInTheDocument()
  })

  it('does not offer to restore a model that has nothing stored', async () => {
    server.builtin['claude-x'] = { ModelRatio: 1 }
    renderSection(<ModelPricingSection />)

    expect(await screen.findByRole('checkbox', { name: 'Select claude-x' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('checkbox', { name: 'Select gpt-4-all' })).not.toHaveAttribute('aria-disabled')
  })

  it('names a servable model that nothing prices, and says what the gateway does about it', async () => {
    // A built-in price counts: claude-x is priced although nothing is stored for it.
    server.builtin['claude-x'] = { ModelRatio: 1 }
    server.enabledModels = ['gpt-4-all', 'dall-e-3', 'claude-x', 'gpt-5-preview']
    renderSection(<ModelPricingSection />)
    await openTab('Unpriced models')

    expect(await screen.findByRole('button', { name: 'Set a price for gpt-5-preview' })).toBeInTheDocument()
    expect(screen.getByText(/A request for one of them is refused/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set a price for claude-x' })).not.toBeInTheDocument()
  })

  it('opens the editor with the servable model’s own name, not a blank one', async () => {
    server.enabledModels = ['gpt-5-preview']
    renderSection(<ModelPricingSection />)
    await openTab('Unpriced models')

    fireEvent.click(await screen.findByRole('button', { name: 'Set a price for gpt-5-preview' }))

    const dialog = await screen.findByRole('dialog')
    const name = within(dialog).getByLabelText(/^Model name/)
    expect(name).toHaveValue('gpt-5-preview')
    // The gateway supplied the name, so it must not be retypeable into a different one.
    expect(name).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText('Input (USD / 1M tokens)'), { target: { value: '1' } })
    fireEvent.change(within(dialog).getByLabelText('Output (USD / 1M tokens)'), { target: { value: '4' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    expect(pricingChanges()[0]).toMatchObject({ expected_version: 'v0', model_name: 'gpt-5-preview' })
  })

  it('says everything is priced rather than showing an empty list', async () => {
    server.enabledModels = ['gpt-4-all', 'dall-e-3']
    renderSection(<ModelPricingSection />)
    await openTab('Unpriced models')

    expect(await screen.findByText(/All 2 servable model\(s\) have a base price\./)).toBeInTheDocument()
  })

  it('separates “no channel is enabled” from “everything is priced”', async () => {
    server.enabledModels = null
    renderSection(<ModelPricingSection />)
    await openTab('Unpriced models')

    expect(
      await screen.findByText(/No channel is enabled, so nothing is servable yet/),
    ).toBeInTheDocument()
  })

  it('keeps the pricing table working when the servable-model check is refused', async () => {
    // /api/channel/models_enabled is behind channel:read, which is separate from the root
    // gate the rest of this page sits behind. Losing it must not take the table with it.
    server.enabledModelsFails = true
    renderSection(<ModelPricingSection />)
    await openTab('Unpriced models')

    expect(await screen.findByText('no permission for channel')).toBeInTheDocument()
    await openTab('Models')
    expect(await screen.findByText('dall-e-3')).toBeInTheDocument()
  })

  it('sorts the whole model list, not just the twenty rows on screen', async () => {
    // The table is fed one page at a time, so leaving the sort to the table would reverse
    // those twenty rows and leave the rest where they were — an order that looks sorted
    // and is not. With 25 models, descending must start at model-25, never at model-20.
    const many: Record<string, number> = {}
    for (let index = 1; index <= 25; index += 1) {
      many[`model-${String(index).padStart(2, '0')}`] = index
    }
    server.stored.ModelRatio = JSON.stringify(many)
    server.stored.ModelPrice = '{}'
    server.stored.CompletionRatio = '{}'

    renderSection(<ModelPricingSection />)
    expect(await screen.findByText('model-01')).toBeInTheDocument()
    expect(screen.queryByText('model-25')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))

    expect(await screen.findByText('model-25')).toBeInTheDocument()
    expect(screen.queryByText('model-01')).not.toBeInTheDocument()
  })

  it('gates the server-side ratio reset behind typing the key name', async () => {
    // POST /api/option/rest_model_ratio replaces the whole ModelRatio map immediately,
    // with no save step and no undo.
    renderSection(<ModelPricingSection />)
    const trigger = await screen.findByRole('button', { name: 'Reset model ratios' })
    await waitFor(() => expect(trigger).toBeEnabled())
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Reset model ratios' })
    expect(confirm).toBeDisabled()

    // The gate only opens on the exact key name, so a mistyped one still cannot fire it.
    fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: 'ModelPrice' } })
    expect(confirm).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: 'ModelRatio' } })
    expect(confirm).toBeEnabled()
    expect(post).not.toHaveBeenCalled()
  })
})

describe('ModelPricingSection, tiered prices', () => {
  const LONG_CONTEXT = 'len <= 200000 ? tier("standard", p * 3 + c * 15) : tier("long_context", p * 6 + c * 22.5)'

  async function openTiered() {
    server.stored['billing_setting.billing_mode'] = '{"claude-x":"tiered_expr"}'
    server.stored['billing_setting.billing_expr'] = JSON.stringify({ 'claude-x': LONG_CONTEXT })
    renderSection(<ModelPricingSection />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit pricing for claude-x' }))
    return screen.findByRole('dialog')
  }

  it('opens a tiered price as ordered rules and saves nothing when nothing changed', async () => {
    const dialog = await openTiered()

    expect(within(dialog).getByRole('button', { name: 'Tiered' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByText('Rule 1')).toBeInTheDocument()
    expect(within(dialog).getByText('Otherwise')).toBeInTheDocument()
    expect(within(dialog).getAllByLabelText('Tier name').map((input) => (input as HTMLInputElement).value)).toEqual(['standard', 'long_context'])
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('changes one price and leaves the rest of the expression as it was written', async () => {
    const dialog = await openTiered()

    const outputs = within(dialog).getAllByLabelText('Completion price (USD / 1M)')
    fireEvent.change(outputs[1], { target: { value: '25' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    expect(pricingChanges()[0].pricing['billing_setting.billing_expr']).toBe(
      'len <= 200000 ? tier("standard", p * 3 + c * 15) : tier("long_context", p * 6 + c * 25)',
    )
  })

  it('refuses to save an incomplete multiplier rather than dropping it', async () => {
    const dialog = await openTiered()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add a multiplier' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByText('Complete this condition.')).toBeInTheDocument()
    expect(within(dialog).getByText('Enter a finite, non-negative multiplier.')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
    // Switching away would lose the unfinished rule, so it waits until the rule is complete.
    expect(within(dialog).getByRole('button', { name: 'Text' })).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText('Field path'), { target: { value: 'service_tier' } })
    fireEvent.change(within(dialog).getByLabelText('Value'), { target: { value: 'priority' } })
    fireEvent.change(within(dialog).getByLabelText('Multiply the price by'), { target: { value: '2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    expect(pricingChanges()[0].pricing['billing_setting.billing_expr']).toBe(`(${LONG_CONTEXT}) * (param("service_tier") == "priority" ? 2 : 1)`)
  })

  it('starts a new model from a template', async () => {
    renderSection(<ModelPricingSection />)
    const add = await screen.findByRole('button', { name: 'Add a model' })
    await waitFor(() => expect(add).toBeEnabled())
    fireEvent.click(add)
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/^Model name/), { target: { value: 'night-model' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiered' }))
    fireEvent.change(within(dialog).getByLabelText('Start from a template'), { target: { value: 'night-discount' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    expect(pricingChanges()[0].pricing['billing_setting.billing_expr']).toBe(
      '(tier("base", p * 3 + c * 15)) * (hour("Asia/Shanghai") >= 21 || hour("Asia/Shanghai") < 6 ? 0.5 : 1)',
    )
  })
})

describe('ModelPricingSection, task plugin prices', () => {
  const VIDEO = { resolution: { enum: ['720p', '1080p'], type: 'number' }, seconds: { type: 'number', unit: 'second' } }

  function serveVideo() {
    server.stored.ModelPrice = '{"veo-3":0.5}'
    server.plugins['veo-3'] = [{ key: 'vertex', schema: VIDEO }]
  }

  async function openVeo() {
    renderSection(<ModelPricingSection />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit pricing for veo-3' }))
    return screen.findByRole('dialog')
  }

  it('flags the models a plugin cannot charge, and narrows the list to them', async () => {
    serveVideo()
    server.issues = [{ model_name: 'veo-3', plugin_key: 'vertex', plugin_name: 'Vertex', reason: 'unconfigured' }]
    renderSection(<ModelPricingSection />)

    expect(await screen.findByText('1 model(s) need a plugin price')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Configured model prices' })
    expect(within(table).getByText('Plugin price needed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    await waitFor(() => expect(within(table).queryByText('gpt-4-all')).not.toBeInTheDocument())
    expect(within(table).getByText('veo-3')).toBeInTheDocument()
  })

  it('opens a model that only has an issue, read fresh from the server', async () => {
    server.plugins['kling-v2'] = [{ key: 'kling', schema: VIDEO }]
    server.issues = [{ model_name: 'kling-v2', plugin_key: 'kling', plugin_name: 'Kling', reason: 'unconfigured' }]
    renderSection(<ModelPricingSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Set a price for kling-v2' }))

    const dialog = await screen.findByRole('dialog', { name: 'Price of kling-v2' })
    expect(within(dialog).getByText('No price can charge this plugin’s tasks. Set a separate price for it below.')).toBeInTheDocument()
  })

  it('prices a plugin per second and resolution, refusing to save until every price is typed', async () => {
    serveVideo()
    const dialog = await openVeo()

    // An own price starts as an empty table: nothing is charged at a price nobody typed.
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Set a separate price for this plugin' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByText('Enter every unit price — 0 for free — with no negative values.')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByLabelText('seconds price, row 1'), { target: { value: '0.25' } })
    fireEvent.change(within(dialog).getByLabelText('seconds price, row 2'), { target: { value: '0.1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    // Rows follow the schema’s enum order with the last one as the fallback.
    expect(pricingChanges()[0].pricing).toEqual({
      'billing_setting.billing_mode': 'ratio',
      'billing_setting.plugin_billing_expr': {
        vertex: 'u("resolution") == "720p" ? tier("720p", u("seconds") * 0.25) : tier("1080p", u("seconds") * 0.1)',
      },
      ModelPrice: 0.5,
    })
  })

  it('stops charging a plugin its own price when it is switched back to the model price', async () => {
    serveVideo()
    server.stored[PLUGIN_KEY] = '{"vertex::veo-3":"tier(\\"base\\", u(\\"seconds\\") * 0.2)"}'
    const dialog = await openVeo()

    expect(within(dialog).getByText('Own price')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Set a separate price for this plugin' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    expect(pricingChanges()[0].pricing).toEqual({ 'billing_setting.billing_mode': 'ratio', ModelPrice: 0.5 })
  })

  it('says when the model price cannot charge a plugin’s tasks', async () => {
    server.stored['billing_setting.billing_mode'] = '{"veo-3":"tiered_expr"}'
    server.stored['billing_setting.billing_expr'] = '{"veo-3":"tier(\\"base\\", p * 2 + c * 8)"}'
    server.plugins['veo-3'] = [{ key: 'vertex', schema: VIDEO }]
    const dialog = await openVeo()

    expect(within(dialog).getByText('The model price above cannot charge this plugin’s tasks, so they are refused until it has its own price.')).toBeInTheDocument()
  })

  it('removes the saved price of a plugin that no longer offers the model', async () => {
    serveVideo()
    server.plugins['veo-3'] = [{ key: 'vertex', schema: VIDEO, stale: true }]
    server.stored[PLUGIN_KEY] = '{"vertex::veo-3":"tier(\\"base\\", u(\\"seconds\\") * 0.2)"}'
    const dialog = await openVeo()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove saved price' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    expect(pricingChanges()[0].pricing[PLUGIN_KEY]).toBeUndefined()
  })
})

describe('ModelPricingSection, tool prices', () => {
  function storedToolPrices(): Record<string, number> {
    const write = writes().find((item) => item.key === 'tool_price_setting.prices')
    return JSON.parse(write?.value ?? 'null') as Record<string, number>
  }

  it('stores only the prices changed or added, never an untouched built-in', async () => {
    server.stored['tool_price_setting.prices'] = '{"custom_tool":3}'
    renderSection(<ModelPricingSection />)
    await openTab('Tool prices')

    // Built-ins are listed for reference; nothing changed, so nothing can be saved.
    expect(await screen.findByLabelText('Price of web_search')).toHaveValue('10')
    expect(screen.getByRole('button', { name: 'Save tool prices' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Price of file_search'), { target: { value: '0' } })
    expect(screen.getByText('Overrides built-in 2.5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save tool prices' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(storedToolPrices()).toEqual({ custom_tool: 3, file_search: 0 })
  })

  it('goes back to a built-in price by dropping the override', async () => {
    server.stored['tool_price_setting.prices'] = '{"web_search":8}'
    renderSection(<ModelPricingSection />)
    await openTab('Tool prices')

    fireEvent.click(await screen.findByRole('button', { name: 'Use the built-in price for web_search' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save tool prices' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(storedToolPrices()).toEqual({})
  })

  it('adds a price for a model prefix, and refuses a negative or empty one', async () => {
    renderSection(<ModelPricingSection />)
    await openTab('Tool prices')

    fireEvent.click(await screen.findByRole('button', { name: 'Add a tool price' }))
    fireEvent.change(screen.getByLabelText('Tool name of new tool'), { target: { value: 'web_search' } })
    fireEvent.change(screen.getByLabelText('Model prefix of web_search'), { target: { value: 'gpt-5*' } })
    fireEvent.change(screen.getByLabelText('Price of web_search:gpt-5*'), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save tool prices' }))

    expect(await screen.findByText('Enter a finite, non-negative price (0 makes it free).')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Price of web_search:gpt-5*'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save tool prices' }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(storedToolPrices()).toEqual({ 'web_search:gpt-5*': 12 })
  })
})

describe('ModelPricingSection, upstream sync', () => {
  const SOURCE = 'up-a(3)'

  beforeEach(() => {
    const fallback = get.getMockImplementation()!
    get.mockImplementation((url: string) => {
      if (url === '/api/ratio_sync/channels') {
        return Promise.resolve({
          data: {
            data: [
              { base_url: 'https://a.example', id: 3, name: 'up-a', status: 1, type: 1 },
              { base_url: 'https://basellm.github.io', id: -100, name: '官方倍率预设', status: 1, type: 0 },
            ],
            message: '',
            success: true,
          },
        })
      }
      return fallback(url)
    })
    post.mockImplementation((url: string) => {
      if (url !== '/api/ratio_sync/fetch') throw new Error(`unmocked POST ${url}`)
      return Promise.resolve({
        data: {
          data: {
            differences: { 'gpt-4-all': {} },
            prices: {
              'dall-e-3': { current: { model_price: 0.04 }, upstreams: { [SOURCE]: { model_price: 0.04 } } },
              'gpt-4-all': { current: { completion_ratio: 2, model_ratio: 15 }, upstreams: { [SOURCE]: { completion_ratio: 2, model_ratio: 10 } } },
            },
            test_results: [{ name: SOURCE, status: 'success' }],
          },
          message: '',
          success: true,
        },
      })
    })
  })

  async function compare() {
    renderSection(<ModelPricingSection />)
    await openTab('Upstream sync')
    fireEvent.click(await screen.findByRole('checkbox', { name: /up-a/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Compare prices' }))
    await screen.findByRole('list', { name: 'Models to compare' })
  }

  it('reads the chosen sources server-side and lists only the models that differ', async () => {
    await compare()

    expect(post).toHaveBeenCalledWith(
      '/api/ratio_sync/fetch',
      { include_unchanged: true, timeout: 10, upstreams: [{ base_url: 'https://a.example', endpoint: '/api/pricing', id: 3, name: 'up-a' }] },
      expect.anything(),
    )
    const list = screen.getByRole('list', { name: 'Models to compare' })
    expect(within(list).getByText('gpt-4-all')).toBeInTheDocument()
    expect(within(list).queryByText('dall-e-3')).not.toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
  })

  it('imports a chosen price for that model only, against the version read with the comparison', async () => {
    server.stored[PLUGIN_KEY] = '{"acme::gpt-4-all":"tier(\\"base\\", u(\\"n\\") * 1)"}'
    await compare()

    fireEvent.click(screen.getByRole('radio', { name: /^up-a\(3\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 change(s)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import these prices?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import 1 price(s)' }))

    await waitFor(() => expect(pricingChanges()).toHaveLength(1))
    expect(pricingChanges()[0]).toEqual({
      expected_version: 'v0',
      model_name: 'gpt-4-all',
      pricing: {
        'billing_setting.billing_mode': 'ratio',
        'billing_setting.plugin_billing_expr': { acme: 'tier("base", u("n") * 1)' },
        CompletionRatio: 2,
        ModelRatio: 10,
      },
    })
  })

  it('refuses to import over a price changed after the comparison', async () => {
    await compare()
    server.revisions['gpt-4-all'] = 1

    fireEvent.click(screen.getByRole('radio', { name: /^up-a\(3\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 change(s)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import these prices?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import 1 price(s)' }))

    expect(await within(dialog).findByText('Prices changed since the comparison')).toBeInTheDocument()
    expect(JSON.parse(server.stored.ModelRatio)).toEqual({ 'gpt-4-all': 15 })
  })
})

describe('GroupPricingSection', () => {
  it('shows a group that is priced but that no user can select', async () => {
    renderSection(<GroupPricingSection />)

    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getByText('svip')).toBeInTheDocument())
    expect(within(table).getByRole('checkbox', { name: 'Users may select “vip”' })).toBeChecked()
    expect(
      within(table).getByRole('checkbox', { name: 'Users may select “svip”' }),
    ).not.toBeChecked()
  })

  it('writes only the group keys whose content actually changed', async () => {
    renderSection(<GroupPricingSection />)
    await settled('Billing multiplier for vip')

    fireEvent.change(screen.getByLabelText('Billing multiplier for vip'), { target: { value: '0.5' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'GroupRatio', value: '{"default":1,"svip":1,"vip":0.5}' })
  })

  it('refuses a negative multiplier before the server has to', async () => {
    renderSection(<GroupPricingSection />)
    await settled('Billing multiplier for vip')

    fireEvent.change(screen.getByLabelText('Billing multiplier for vip'), { target: { value: '-1' } })
    await save()

    expect(
      await screen.findByText(
        '“vip” has a negative multiplier. The server rejects a negative group ratio.',
      ),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('edits a special ratio rule in place and adds one for another billing group', async () => {
    renderSection(<GroupPricingSection />)
    await settled('Billing multiplier for vip')
    fireEvent.click(screen.getByRole('tab', { name: 'Special ratio rules' }))

    // The seeded rule names a group that is not in the pricing table; it is shown, flagged.
    expect(await screen.findByText('Users in vip')).toBeInTheDocument()
    expect(screen.getByText('Not in pricing table')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Ratio when users in vip are billed as edit_this'), { target: { value: '0.7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add ratio override' }))
    expect(await screen.findByText('(instead of 1)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Ratio when users in vip are billed as default'), { target: { value: '0.5' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'GroupGroupRatio', value: '{"vip":{"edit_this":0.7,"default":0.5}}' })
  })

  it('refuses a negative special ratio, which would turn a charge into a credit', async () => {
    renderSection(<GroupPricingSection />)
    await settled('Billing multiplier for vip')
    fireEvent.click(screen.getByRole('tab', { name: 'Special ratio rules' }))

    fireEvent.change(await screen.findByLabelText('Ratio when users in vip are billed as edit_this'), { target: { value: '-1' } })
    await save()

    expect(
      await screen.findByText('The ratio for users in “vip” billed as “edit_this” must be a number that is not negative.'),
    ).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('shows one group to the users of another, and hides one, as the server reads the rules', async () => {
    renderSection(<GroupPricingSection />)
    await settled('Billing multiplier for vip')
    fireEvent.click(screen.getByRole('tab', { name: 'Group visibility' }))

    fireEvent.change(await screen.findByLabelText('Add rules for a user group'), { target: { value: 'vip' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Add rule' }))
    fireEvent.change(screen.getByLabelText('Label of default for users in vip'), { target: { value: 'Shared pool' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))
    fireEvent.change(screen.getByLabelText('Visibility of svip for users in vip'), { target: { value: 'hidden' } })
    // A user group added and then left empty is not stored.
    fireEvent.change(screen.getByLabelText('Add rules for a user group'), { target: { value: 'svip' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      key: 'group_ratio_setting.group_special_usable_group',
      value: '{"vip":{"+:default":"Shared pool","-:svip":""}}',
    })
  })

  it('saves the auto groups in the order they were arranged, not alphabetically', async () => {
    renderSection(<GroupPricingSection />)
    await settled('Billing multiplier for vip')
    fireEvent.click(screen.getByRole('tab', { name: 'Auto group order' }))

    fireEvent.change(await screen.findByLabelText('Add a group to the auto order'), { target: { value: 'vip' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Move vip up' }))
    fireEvent.change(screen.getByLabelText('Maximum custom groups per token'), { target: { value: '3' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes()).toEqual(
      expect.arrayContaining([
        { key: 'AutoGroups', value: '["vip","default"]' },
        { key: 'MaxTokenAutoGroups', value: '3' },
      ]),
    )
  })

  it('takes a group removal through a confirmation and holds it in the draft', async () => {
    renderSection(<GroupPricingSection />)
    await settled('Billing multiplier for vip')

    fireEvent.click(screen.getByRole('button', { name: 'Remove group svip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove group' }))

    // Nothing is written until the section is saved.
    expect(writes()).toHaveLength(0)
    await waitFor(() =>
      expect(screen.queryByLabelText('Billing multiplier for svip')).not.toBeInTheDocument(),
    )

    await save()
    await waitFor(() => expect(writes().length).toBeGreaterThan(0))
    expect(writes().find((write) => write.key === 'GroupRatio')?.value).toBe(
      '{"default":1,"vip":1}',
    )
  })
})

describe('PaymentSection', () => {
  it('shows the stored Waffo unit price rather than an empty box', async () => {
    // Regression: WaffoUnitPrice was declared in the draft type, validated and bound to
    // this input while `toDraft` never read it, so the field rendered blank against a
    // stored price. The draft is now a plain literal, and TypeScript catches the next one.
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.click(screen.getByRole('tab', { name: 'Waffo' }))
    await settled('Waffo unit price')
    expect(screen.getByLabelText('Waffo unit price')).toHaveValue(3)
  })

  it('leaves the write-only credential boxes empty and writes nothing for an untouched one', async () => {
    // controller.GetOptions skips every key ending in Key/Secret, so they are ABSENT from
    // the payload rather than masked. An empty box therefore means "unknown", and an
    // untouched one must not write the empty string over a working credential.
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.click(screen.getByRole('tab', { name: 'Stripe' }))
    // Exact, not a regex: the clear action's accessible name also names the credential.
    expect(await screen.findByLabelText('Stripe API secret')).toHaveValue('')

    fireEvent.change(screen.getByLabelText('Stripe price id'), { target: { value: 'price_123' } })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writtenKeys()).toEqual(['StripePriceId'])
  })

  it('writes a credential only once it has been typed into', async () => {
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.click(screen.getByRole('tab', { name: 'Stripe' }))
    fireEvent.change(await screen.findByLabelText('Stripe API secret'), {
      target: { value: 'sk_live_example' },
    })
    await save()

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({ key: 'StripeApiSecret', value: 'sk_live_example' })
  })

  it('blocks a numeric min_topup, the write that is refused after it destroys the list', async () => {
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.change(screen.getByLabelText('Payment methods'), {
      target: { value: '[{"name":"probe","type":"alipay","min_topup":50}]' },
    })
    await save()

    expect(
      await screen.findAllByText(
        'Every value must be text, including min_topup. A number here is refused and destroys the stored list.',
      ),
    ).toHaveLength(2)
    expect(screen.getByText('General · Payment methods')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('rejects a fractional minimum, which the server silently stores as zero', async () => {
    // model/option.go reads MinTopUp with strconv.Atoi and discards the error.
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.change(screen.getByLabelText(/Minimum top-up/), { target: { value: '2.5' } })
    await save()

    expect(
      await screen.findAllByText(
        'This must be a whole number. The server stores a fractional value as zero without saying so.',
      ),
    ).toHaveLength(2)
    expect(writes()).toHaveLength(0)
  })

  it('names the tab a blocking field is on, and switches to it on request', async () => {
    // Tabs.Panel unmounts the panel that is not showing. A bad Waffo unit price therefore
    // stops the save while its message is not rendered anywhere, which is indistinguishable
    // from a dead Save button unless the section says so itself.
    renderSection(<PaymentSection />)
    await settled(/Minimum top-up/)

    fireEvent.click(screen.getByRole('tab', { name: 'Waffo' }))
    fireEvent.change(await screen.findByLabelText('Waffo unit price'), { target: { value: '0' } })

    fireEvent.click(screen.getByRole('tab', { name: 'General' }))
    await waitFor(() => expect(screen.queryByLabelText('Waffo unit price')).not.toBeInTheDocument())
    await save()

    expect(writes()).toHaveLength(0)
    const notice = screen.getByText('Waffo · Waffo unit price').closest('li')
    expect(notice).not.toBeNull()
    if (notice === null) return

    fireEvent.click(within(notice).getByRole('button', { name: 'Open Waffo · Waffo unit price' }))
    expect(await screen.findByLabelText('Waffo unit price')).toBeInTheDocument()
  })

  it('reads gateway readiness from the server rather than guessing it from the form', async () => {
    // Readiness depends on credentials this page cannot read back, so no honest badge can
    // be derived here. /api/user/topup/info answers it authoritatively.
    renderSection(<PaymentSection />)
    expect(await screen.findByText('Stripe is live')).toBeInTheDocument()
    expect(screen.getByText('Epay is off')).toBeInTheDocument()
  })

  it('offers a retry instead of a blank panel when the readiness check fails', async () => {
    server.topUpFails = true
    renderSection(<PaymentSection />)

    expect(await screen.findByText(/The readiness check could not be loaded/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('never offers to change the compliance record through the settings endpoint', async () => {
    // PUT /api/option/ refuses every payment_setting.compliance_* key outright, so this
    // section must not present one as editable.
    renderSection(<PaymentSection />)

    expect(await screen.findByText('Accepted')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Review and accept the terms' }),
    ).not.toBeInTheDocument()
  })

  it('sends the acceptance to its own endpoint, behind a typed confirmation', async () => {
    server.stored['payment_setting.compliance_confirmed'] = 'false'
    renderSection(<PaymentSection />)

    const trigger = await screen.findByRole('button', { name: 'Review and accept the terms' })
    await waitFor(() => expect(trigger).toBeEnabled())
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Accept the terms' })
    expect(confirm).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: 'I ACCEPT' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    // Its own endpoint — never PUT /api/option/, which refuses these five keys outright.
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/option/payment_compliance',
        { confirmed: true },
        expect.anything(),
      ),
    )
    expect(writtenKeys()).not.toContain('payment_setting.compliance_confirmed')
  })
})
