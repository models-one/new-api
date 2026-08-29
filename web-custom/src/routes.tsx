import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

import { AppShell } from '@/components/layout/AppShell'
import { NotFoundPage } from '@/components/system/NotFoundPage'
import { RouteErrorPage } from '@/components/system/RouteErrorPage'
import { RouteLoading } from '@/components/system/RouteLoading'
import { requireConsoleAuthentication } from '@/lib/console-auth-guard'
import { queryClient } from '@/lib/query-client'

type RouterContext = {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  errorComponent: RouteErrorPage,
  notFoundComponent: NotFoundPage,
})

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('@/features/landing/LandingPage'), 'LandingPage'),
})

const consoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'console',
  beforeLoad: ({ location }) => requireConsoleAuthentication(location.href),
  component: AppShell,
})

const dashboardRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/dashboard',
  component: lazyRouteComponent(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage'),
})

const settingsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('@/features/settings/SettingsPage'), 'SettingsPage'),
})

const modelsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/models',
  component: lazyRouteComponent(() => import('@/features/models/ModelsPage'), 'ModelsPage'),
})

const usageRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/usage',
  component: lazyRouteComponent(() => import('@/features/usage/UsagePage'), 'UsagePage'),
})

const analyticsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/analytics',
  component: lazyRouteComponent(() => import('@/features/analytics/AnalyticsPage'), 'AnalyticsPage'),
})

const logsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/logs',
  component: lazyRouteComponent(() => import('@/features/logs/LogsPage'), 'LogsPage'),
})

/**
 * The referral page. The URL stays `/organization` on purpose: `router/web-router.go`
 * only serves this custom console for a fixed whitelist of paths, and `/referral` is not
 * on it — moving the URL would make a hard refresh fall back to the legacy dashboard.
 * Renaming it needs that Go whitelist updated first.
 */
const referralRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/organization',
  component: lazyRouteComponent(
    () => import('@/features/referral/ReferralPage'),
    'ReferralPage',
  ),
})

const walletRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: '/wallet',
  component: lazyRouteComponent(() => import('@/features/wallet/WalletPage'), 'WalletPage'),
})

const routeTree = rootRoute.addChildren([
  landingRoute,
  consoleRoute.addChildren([
    dashboardRoute,
    settingsRoute,
    modelsRoute,
    usageRoute,
    analyticsRoute,
    logsRoute,
    referralRoute,
    walletRoute,
  ]),
])

export const router = createRouter({
  context: { queryClient },
  routeTree,
  defaultPreload: 'intent',
  defaultPendingComponent: RouteLoading,
  defaultPendingMs: 150,
  defaultPendingMinMs: 250,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
