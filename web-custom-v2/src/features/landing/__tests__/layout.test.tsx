// @vitest-environment jsdom
// jsdom, not happy-dom: DOMPurify cannot sanitise against happy-dom, and the footer HTML goes through it.

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LandingPage } from '@/features/landing/LandingPage'
import { pricingQuery, type PricingResponse } from '@/lib/api/pricing'
import { serverStatusQuery, type ServerStatus } from '@/lib/api/status'

afterEach(cleanup)

const PRICING = {
  success: true,
  data: [
    { model_name: 'deepseek-chat', vendor_id: 1 },
    { model_name: 'deepseek-reasoner', vendor_id: 1 },
    { model_name: 'qwen-plus', vendor_id: 2 },
  ],
  vendors: [
    { id: 1, name: 'DeepSeek' },
    { id: 2, name: '通义千问' },
  ],
} as PricingResponse

async function renderLandingPage() {
  const rootRoute = createRootRoute()
  const stubPaths = ['/sign-in', '/sign-up', '/models', '/pricing', '/rankings', '/about', '/privacy-policy', '/user-agreement']
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: LandingPage }),
      ...stubPaths.map((path) => createRoute({ getParentRoute: () => rootRoute, path, component: () => <div /> })),
    ]),
  })

  await router.load()
  // The hero stats, provider strip and code samples read the live catalogue and the
  // operator's server address, so seed both the way `/api/pricing` and `/api/status` return them.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(pricingQuery().queryKey, PRICING)
  queryClient.setQueryData(serverStatusQuery().queryKey, {
    system_name: 'Gateway',
    server_address: 'https://api.example.com/',
    footer_html: '<a href="https://beian.miit.gov.cn/">京ICP备00000000号</a><script>alert(1)</script>',
  } as ServerStatus)
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('LandingPage', () => {
  it('leads with the headline, sign-up and the live catalogue size', async () => {
    await renderLandingPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chinese large models,one API for all of them')
    expect(screen.getAllByRole('link', { name: 'Sign up free' })[0]).toHaveAttribute('href', '/sign-up')
    expect(screen.getByRole('link', { name: 'Browse models' })).toHaveAttribute('href', '/models')
    expect(screen.getByText('3 models from 2 providers, available right now')).toBeInTheDocument()
  })

  it('switches the sample request between the catalogue vendors', async () => {
    await renderLandingPage()

    const vendors = within(screen.getByRole('group', { name: 'Pick a vendor' }))
    expect(vendors.getByRole('button', { name: 'DeepSeek' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('base_url="https://api.example.com/v1",')).toBeInTheDocument()
    expect(screen.getByText('model="deepseek-chat",')).toBeInTheDocument()

    fireEvent.click(vendors.getByRole('button', { name: '通义千问' }))
    expect(vendors.getByRole('button', { name: '通义千问' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('model="qwen-plus",')).toBeInTheDocument()
  })

  it('lists only vendors that serve models, with their model counts', async () => {
    await renderLandingPage()

    const wall = within(screen.getByRole('region', { name: 'Vendors on this platform' }))
    expect(wall.getByText('DeepSeek')).toBeInTheDocument()
    expect(wall.getByText('2 models')).toBeInTheDocument()
  })

  it('shows the operator footer filing text sanitised, with the attribution link', async () => {
    await renderLandingPage()

    expect(screen.getByRole('link', { name: '京ICP备00000000号' })).toHaveAttribute('href', 'https://beian.miit.gov.cn/')
    expect(document.querySelector('footer script')).toBeNull()
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/QuantumNous/new-api')
  })
})
