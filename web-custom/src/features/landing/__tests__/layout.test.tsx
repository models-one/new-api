// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LandingPage } from '@/features/landing/LandingPage'

afterEach(cleanup)

async function renderLandingPage() {
  const rootRoute = createRootRoute()
  const landingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: LandingPage,
  })
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: () => <div>Dashboard</div>,
  })
  const modelsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/models',
    component: () => <div>Models</div>,
  })
  const organizationRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/organization',
    component: () => <div>Organization</div>,
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute.addChildren([landingRoute, dashboardRoute, modelsRoute, organizationRoute]),
  })

  await router.load()
  render(<RouterProvider router={router} />)
}

describe('LandingPage', () => {
  it('keeps the complete Stitch landing page content below the hero', async () => {
    await renderLandingPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Unified API Gateway for a')
    expect(screen.getByRole('heading', { name: 'Scale Without Friction' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '100+ Model Support' })).toBeInTheDocument()
    expect(screen.getByText('integration.ts')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Built for the future of AI.')
  })

  it('renders both animated logo orbits and the floating mark', async () => {
    await renderLandingPage()

    const animatedStage = document.querySelector('.landing-logo-stage')
    expect(animatedStage?.querySelectorAll('.landing-orbit')).toHaveLength(2)
    expect(animatedStage?.querySelector('.landing-logo-float')).toBeInTheDocument()
  })
})
