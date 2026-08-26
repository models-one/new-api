// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProviderGroupGrid } from '@/features/settings/components/ProviderGroupGrid'

afterEach(cleanup)

describe('ProviderGroupGrid layout', () => {
  it('uses four compact columns on wide screens with responsive fallbacks', () => {
    render(<ProviderGroupGrid groupIds={[]} onEdit={vi.fn()} />)

    const grid = screen.getByRole('heading', { name: 'OpenAI' }).parentElement?.parentElement?.parentElement
    expect(grid).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3', 'xl:grid-cols-4')

    const openAiSection = screen.getByRole('heading', { name: 'OpenAI' }).closest('section')
    expect(openAiSection).toHaveClass('px-3', 'py-2.5')
  })

  it('keeps every assigned group visible in a compact provider cell', () => {
    render(
      <ProviderGroupGrid
        groupIds={['gpt-priority', 'gpt-lowcost', 'gpt-image']}
        onEdit={vi.fn()}
      />,
    )

    const openAiSection = screen.getByRole('heading', { name: 'OpenAI' }).closest('section')
    expect(openAiSection).not.toBeNull()
    expect(within(openAiSection!).getByText('gpt-priority')).toBeVisible()
    expect(within(openAiSection!).getByText('gpt-lowcost')).toBeVisible()
    expect(within(openAiSection!).getByText('gpt-image')).toBeVisible()
  })
})
