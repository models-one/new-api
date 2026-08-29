import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { FunctionComponent } from 'react'

/** Stubs for every destination the public frame can link to. */
const stubPaths = ['/about', '/privacy-policy', '/user-agreement', '/dashboard', '/setup'] as const

/**
 * Renders one public page at `initialPath` inside a memory router and a fresh query client,
 * so the page's own `Link`s resolve without pulling in the real route tree.
 */
export async function renderPublicPage(
  component: FunctionComponent,
  initialPath: string = '/',
): Promise<{ currentPath: () => string }> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  })

  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    component: initialPath === '/' ? component : () => <div data-testid="stub-home" />,
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const children = stubPaths.map((path) =>
    createRoute({
      component: path === initialPath ? component : () => <div data-testid={`stub${path}`} />,
      getParentRoute: () => rootRoute,
      path,
    }),
  )

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    routeTree: rootRoute.addChildren([indexRoute, ...children]),
  })

  await router.load()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { currentPath: () => router.state.location.pathname }
}
