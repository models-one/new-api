// @vitest-environment happy-dom

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
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LandingPage } from '@/features/landing/LandingPage'
import { pricingQuery, type PricingResponse } from '@/lib/api/pricing'
import { serverStatusQuery, type ServerStatus } from '@/lib/api/status'

afterEach(cleanup)

const PRICING = {
  success: true,
  data: [{ model_name: 'claude-sonnet-4' }, { model_name: 'gpt-4o' }],
  vendors: [
    { id: 1, name: 'Anthropic' },
    { id: 2, name: 'OpenAI' },
  ],
} as PricingResponse

async function renderLandingPage() {
  const rootRoute = createRootRoute()
  const stubPaths = ['/dashboard', '/models', '/pricing', '/rankings', '/about', '/privacy-policy', '/user-agreement']
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
  } as ServerStatus)
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('LandingPage', () => {
  it('leads with the headline, both calls to action and the live catalogue size', async () => {
    await renderLandingPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The AI gateway built for production')
    expect(screen.getAllByRole('link', { name: 'Get started free' })[0]).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: 'Browse models' })).toHaveAttribute('href', '/models')
    expect(screen.getByText('2 models from 2 providers, available right now')).toBeInTheDocument()
    // The marquee's second copy is aria-hidden, so only the real list is exposed.
    const providers = within(screen.getByRole('list', { name: 'Models from every major provider' }))
    expect(providers.getByText('Anthropic')).toBeInTheDocument()
  })

  it('points the code sample at the configured server address and a real model', async () => {
    await renderLandingPage()

    expect(screen.getByRole('tab', { name: 'Python' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Node.js' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'cURL' })).toBeInTheDocument()
    const sample = screen.getByRole('tabpanel')
    expect(sample).toHaveTextContent('base_url="https://api.example.com/v1"')
    expect(sample).toHaveTextContent('model="claude-sonnet-4"')
  })

  it('keeps the feature sections, FAQ and footer attribution', async () => {
    await renderLandingPage()

    expect(screen.getByRole('heading', { name: 'Route every request' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'See where the money goes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Stay in control' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'How am I billed?' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/QuantumNous/new-api')
  })
})
