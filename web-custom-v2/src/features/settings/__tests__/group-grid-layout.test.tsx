// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GroupRouteGrid } from '@/features/settings/components/GroupRouteGrid'
import type { GroupRoute } from '@/features/settings/types'

afterEach(cleanup)

/** Shapes taken from a live `GET /api/user/self/groups` on the seeded dev server. */
const routes: GroupRoute[] = [
  { name: 'default', desc: '默认分组', ratio: 1 },
  { name: 'vip', desc: 'vip分组', ratio: 1 },
  { name: 'retired', desc: '', ratio: null },
]

function gridOf(routeName: string): HTMLElement | null {
  const section = screen.getByRole('heading', { name: routeName }).closest('section')
  return section?.parentElement ?? null
}

describe('GroupRouteGrid layout', () => {
  it('uses four compact columns on wide screens with responsive fallbacks', () => {
    render(
      <GroupRouteGrid crossGroupRetry={false} groupsKnown groupsPending={false} onEdit={vi.fn()} routes={routes} />,
    )

    expect(gridOf('default')).toHaveClass(
      'grid-cols-1',
      'sm:grid-cols-2',
      'lg:grid-cols-3',
      'xl:grid-cols-4',
    )

    const defaultCell = screen.getByRole('heading', { name: 'default' }).closest('section')
    expect(defaultCell).toHaveClass('px-3', 'py-2.5')
  })

  it('keeps every routed group visible in its own numbered cell, in priority order', () => {
    render(
      <GroupRouteGrid crossGroupRetry={false} groupsKnown groupsPending={false} onEdit={vi.fn()} routes={routes} />,
    )

    const cells = routes.map((route) => {
      const cell = screen.getByRole('heading', { name: route.name }).closest('section')
      expect(cell).not.toBeNull()
      return cell as HTMLElement
    })

    expect(within(cells[0]).getByText('1')).toBeVisible()
    expect(within(cells[1]).getByText('2')).toBeVisible()
    expect(within(cells[2]).getByText('3')).toBeVisible()
    expect(within(cells[0]).getByText('x1')).toBeVisible()
    expect(within(cells[0]).getByText('默认分组')).toBeVisible()
  })

  it('marks a group the caller cannot use instead of inventing a ratio for it', () => {
    render(
      <GroupRouteGrid crossGroupRetry={false} groupsKnown groupsPending={false} onEdit={vi.fn()} routes={routes} />,
    )

    const retiredCell = screen.getByRole('heading', { name: 'retired' }).closest('section')
    expect(retiredCell).not.toBeNull()
    expect(within(retiredCell as HTMLElement).getByText('Unavailable')).toBeVisible()
  })

  it('stays silent about availability when the group map never arrived', () => {
    render(
      <GroupRouteGrid
        crossGroupRetry={false}
        groupsKnown={false}
        groupsPending={false}
        onEdit={vi.fn()}
        routes={routes}
      />,
    )

    // A failed /api/user/self/groups means "ratio unknown", never "group unavailable".
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument()
    expect(screen.queryByText('x1')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'default' })).toBeVisible()
  })

  it('flags cross-group retry only when more than one group is routed', () => {
    const { rerender } = render(
      <GroupRouteGrid crossGroupRetry groupsKnown groupsPending={false} onEdit={vi.fn()} routes={routes} />,
    )
    expect(screen.getByText('Cross-group retry on')).toBeVisible()

    rerender(
      <GroupRouteGrid crossGroupRetry groupsKnown groupsPending={false} onEdit={vi.fn()} routes={[routes[0]]} />,
    )
    expect(screen.queryByText('Cross-group retry on')).not.toBeInTheDocument()
  })

  it('shows placeholders instead of ratios while /api/user/self/groups is still loading', () => {
    render(
      <GroupRouteGrid crossGroupRetry={false} groupsKnown groupsPending onEdit={vi.fn()} routes={routes} />,
    )

    expect(screen.queryByText('x1')).not.toBeInTheDocument()
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument()
  })
})
