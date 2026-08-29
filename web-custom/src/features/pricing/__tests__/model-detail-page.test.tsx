// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModelDetailPage } from '@/features/pricing/ModelDetailPage'
import { getJson, getRawJson } from '@/lib/api/client'
import type { PricingModel, PricingResponse } from '@/lib/api/pricing'

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }

let routeParams: Record<string, string> = { modelId: 'gpt-4o-mini' }

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: LinkProps) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useParams: () => routeParams,
}))

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  deleteJson: vi.fn(),
  getJson: vi.fn(),
  getRawJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
}))

const mockedGetJson = vi.mocked(getJson)
const mockedGetRawJson = vi.mocked(getRawJson)

const tokenModel: PricingModel = {
  model_name: 'gpt-4o-mini',
  vendor_id: 1,
  quota_type: 0,
  model_ratio: 0.075,
  model_price: 0,
  owner_by: '',
  completion_ratio: 4,
  cache_ratio: 0.5,
  enable_groups: ['default', 'vip'],
  supported_endpoint_types: ['openai'],
  pricing_version: '5a90f2b86c08bd983a9a2e6d66c255f4eaef9c4b',
}

const perRequestModel: PricingModel = {
  model_name: 'mj_imagine',
  quota_type: 1,
  model_ratio: 0,
  model_price: 0.1,
  owner_by: '',
  completion_ratio: 0,
  enable_groups: ['default'],
  supported_endpoint_types: ['openai'],
}

const tieredModel: PricingModel = {
  ...tokenModel,
  model_name: 'gemini-2.5-pro',
  billing_mode: 'tiered_expr',
  billing_expr: 'v2:len > 200000 ? tier("long", p * 2.5 + c * 20) : tier("base", p * 1.25 + c * 10)',
}

function buildPayload(models: PricingModel[]): PricingResponse {
  return {
    success: true,
    data: models,
    group_ratio: { default: 1, vip: 2 },
    usable_group: { default: '默认分组', vip: 'vip分组' },
    auto_groups: ['default'],
    supported_endpoint: { openai: { path: '/v1/chat/completions', method: 'POST' } },
    vendors: [{ id: 1, name: 'OpenAI', icon: 'OpenAI' }],
  }
}

function respondWith(options: {
  models?: PricingModel[]
  headerNavModules?: unknown
  pricingError?: Error
  metricsError?: Error
  groups?: unknown[]
}) {
  mockedGetJson.mockImplementation(async (url) => {
    if (url === '/api/status') {
      return { HeaderNavModules: options.headerNavModules ?? '' } as never
    }
    if (url === '/api/perf-metrics') {
      if (options.metricsError) throw options.metricsError
      return { model_name: 'gpt-4o-mini', groups: options.groups ?? [] } as never
    }
    throw new Error(`unexpected url ${url}`)
  })
  mockedGetRawJson.mockImplementation(async (url) => {
    if (url !== '/api/pricing') throw new Error(`unexpected url ${url}`)
    if (options.pricingError) throw options.pricingError
    return buildPayload(options.models ?? []) as never
  })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  })
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
  )
  return render(<ModelDetailPage />, { wrapper })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  routeParams = { modelId: 'gpt-4o-mini' }
})

describe('ModelDetailPage', () => {
  it('shows the real attributes of the row and nothing the payload does not carry', async () => {
    respondWith({ models: [tokenModel] })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'gpt-4o-mini' })).toBeInTheDocument()
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Token-based')).toBeInTheDocument()
    expect(screen.getByText('openai')).toBeInTheDocument()
    expect(screen.getByText('5a90f2b86c08bd983a9a2e6d66c255f4eaef9c4b')).toBeInTheDocument()

    // Every non-null multiplier the row publishes, and only those.
    expect(screen.getByText('Billing multipliers')).toBeInTheDocument()
    expect(screen.getByText('Model ratio')).toBeInTheDocument()
    expect(screen.getByText('Cached input ratio')).toBeInTheDocument()
    expect(screen.queryByText('Audio input ratio')).not.toBeInTheDocument()
    expect(screen.queryByText('Image ratio')).not.toBeInTheDocument()

    // owner_by is empty on the seeded row, and description is absent.
    expect(screen.queryByText('Owned by')).not.toBeInTheDocument()
    expect(screen.queryByText('Tags')).not.toBeInTheDocument()
  })

  it('quotes each price at the selected group ratio', async () => {
    respondWith({ models: [tokenModel] })
    renderPage()

    expect(await screen.findByText('$0.15')).toBeInTheDocument()
    expect(screen.getByText('$0.60')).toBeInTheDocument()
    // cache_ratio 0.5 -> 0.15 * 0.5.
    expect(screen.getByText('$0.075')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Quote prices for'), { target: { value: 'vip' } })
    await waitFor(() => expect(screen.getByText('$0.30')).toBeInTheDocument())
    expect(screen.getByText('$1.20')).toBeInTheDocument()
  })

  it('shows the flat charge and no token multipliers for a per-request model', async () => {
    routeParams = { modelId: 'mj_imagine' }
    respondWith({ models: [perRequestModel] })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'mj_imagine' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'This model charges a flat amount per request; token counts do not affect the price.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('$0.10')).toBeInTheDocument()
    // model_ratio 0 and completion_ratio 0 price nothing here, so neither is listed.
    expect(screen.queryByText('Billing multipliers')).not.toBeInTheDocument()
    expect(screen.queryByText('Fallback multipliers')).not.toBeInTheDocument()
  })

  it('shows every tier of an expression-billed model instead of one wrong number', async () => {
    routeParams = { modelId: 'gemini-2.5-pro' }
    respondWith({ models: [tieredModel] })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'gemini-2.5-pro' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'This model bills from an expression: which tier applies depends on the request, so there is no single rate.',
      ),
    ).toBeInTheDocument()

    // The tier coefficients are the real rate, at the resolved group ratio of 1.
    expect(screen.getByText('long')).toBeInTheDocument()
    expect(screen.getByText('len > 200,000')).toBeInTheDocument()
    expect(screen.getByText('$2.50')).toBeInTheDocument()
    expect(screen.getByText('$20.00')).toBeInTheDocument()
    expect(screen.getByText('base')).toBeInTheDocument()
    expect(screen.getByText('$1.25')).toBeInTheDocument()
    expect(screen.getByText('$10.00')).toBeInTheDocument()

    // model_ratio 0.075 would render as $0.15; it may never stand in for the tiered rate.
    expect(screen.queryByText('$0.15')).not.toBeInTheDocument()
    // It is still published, but only as the fallback it is.
    expect(screen.getByText('Fallback multipliers')).toBeInTheDocument()
    expect(
      screen.getByText('Used only if the billing expression cannot be evaluated for a request.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Billing multipliers')).not.toBeInTheDocument()
    expect(screen.getByText(tieredModel.billing_expr as string)).toBeInTheDocument()
  })

  it('prices every group the model is enabled for in the group tab', async () => {
    respondWith({ models: [tokenModel] })
    renderPage()

    fireEvent.click(await screen.findByRole('tab', { name: 'Pricing by group' }))

    const table = await screen.findByRole('table', { name: 'Price by pricing group' })
    const cellsOf = (group: string) => {
      const row = within(table).getByText(group).closest('tr')
      return within(row as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    }

    // Group, ratio, then one column per price row the model publishes a ratio for:
    // input, output and cached input — never the ratios it leaves null.
    expect(cellsOf('default')).toEqual(['default默认分组In auto fallback', '×1', '$0.15', '$0.60', '$0.075'])
    expect(cellsOf('vip')).toEqual(['vipvip分组', '×2', '$0.30', '$1.20', '$0.15'])
  })

  it('labels the performance figures as service-wide and empties honestly', async () => {
    respondWith({ models: [tokenModel], groups: [] })
    renderPage()

    fireEvent.click(await screen.findByRole('tab', { name: 'Performance' }))

    expect(
      await screen.findByText(
        'Measured across all traffic this gateway relayed for this model in the last 24 hours — not your own usage.',
      ),
    ).toBeInTheDocument()
    // The live server answers `groups: []` for a model with no recorded relays.
    expect(await screen.findByText('No performance data yet')).toBeInTheDocument()
    expect(screen.queryByText('0.00%')).not.toBeInTheDocument()
  })

  it('reports the service-wide figures the endpoint does return, per group and in total', async () => {
    respondWith({
      models: [tokenModel],
      groups: [
        {
          group: 'default',
          avg_ttft_ms: 320,
          avg_latency_ms: 1500,
          success_rate: 99.5,
          avg_tps: 42.5,
          series: [],
        },
        {
          group: 'vip',
          avg_ttft_ms: 480,
          avg_latency_ms: 2500,
          success_rate: 90.5,
          avg_tps: 57.5,
          series: [],
        },
      ],
    })
    renderPage()

    fireEvent.click(await screen.findByRole('tab', { name: 'Performance' }))

    const table = await screen.findByRole('table', { name: 'Performance by pricing group' })
    const cellsOf = (group: string) => {
      const row = within(table).getByText(group).closest('tr')
      return within(row as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    }
    expect(cellsOf('default')).toEqual(['default', '42.5 t/s', '320ms', '1.50s', '99.50%'])
    expect(cellsOf('vip')).toEqual(['vip', '57.5 t/s', '480ms', '2.50s', '90.50%'])

    // The headline tiles average the reported groups, so they match neither row exactly.
    expect(screen.getByText('50.0 t/s')).toBeInTheDocument()
    expect(screen.getByText('400ms')).toBeInTheDocument()
    expect(screen.getByText('2.00s')).toBeInTheDocument()
    expect(screen.getByText('95.00%')).toBeInTheDocument()
  })

  it('offers a retry when only the performance request fails', async () => {
    respondWith({ models: [tokenModel], metricsError: new Error('metrics down') })
    renderPage()

    fireEvent.click(await screen.findByRole('tab', { name: 'Performance' }))

    expect(await screen.findByText('Could not load performance metrics')).toBeInTheDocument()
    // The rest of the page is unaffected.
    expect(screen.getByRole('heading', { name: 'gpt-4o-mini' })).toBeInTheDocument()
  })

  it('says so when the gateway does not publish the requested model', async () => {
    routeParams = { modelId: 'not-a-model' }
    respondWith({ models: [tokenModel] })
    renderPage()

    expect(await screen.findByText('Model not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse all models' })).toBeInTheDocument()
  })

  it('decodes a model name whose path segment had to be escaped', async () => {
    const slashed = { ...tokenModel, model_name: 'qwen/qwen-max' }
    routeParams = { modelId: 'qwen%2Fqwen-max' }
    respondWith({ models: [slashed] })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'qwen/qwen-max' })).toBeInTheDocument()
  })

  it('never requests the catalogue when the module is turned off', async () => {
    respondWith({ models: [tokenModel], headerNavModules: JSON.stringify({ pricing: false }) })
    renderPage()

    expect(await screen.findByText('Pricing is not published here')).toBeInTheDocument()
    expect(mockedGetRawJson).not.toHaveBeenCalled()
  })

  it('offers a sign-in link when the module requires authentication', async () => {
    respondWith({
      headerNavModules: JSON.stringify({ pricing: { requireAuth: true } }),
      pricingError: new Error('unauthorized'),
    })
    renderPage()

    expect(await screen.findByText('Sign in to see pricing')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})
