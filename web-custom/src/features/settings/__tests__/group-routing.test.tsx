// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import '@/i18n/config'

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SettingsPage } from '@/features/settings/SettingsPage'

afterEach(cleanup)

describe('SettingsPage group routing', () => {
  it('shows multiple provider groups on one API key', () => {
    render(<SettingsPage />)

    const productionKey = screen.getByRole('heading', { name: 'Production Router' }).closest('article')
    expect(productionKey).not.toBeNull()
    expect(within(productionKey!).getAllByText('gpt-priority').length).toBeGreaterThan(0)
    expect(within(productionKey!).getAllByText('claude-priority').length).toBeGreaterThan(0)
    expect(within(productionKey!).getAllByText('gemini-standard').length).toBeGreaterThan(0)
  })

  it('filters keys by an assigned model group', () => {
    render(<SettingsPage />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search key name or group' }), {
      target: { value: 'deepseek-economy' },
    })

    expect(screen.getByRole('heading', { name: 'Cost Optimized' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Production Router' })).not.toBeInTheDocument()
  })

  it('collapses and expands every key from the shared control', () => {
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all keys' }))
    expect(screen.queryByRole('heading', { name: 'OpenAI' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand all keys' }))
    expect(screen.getAllByRole('heading', { name: 'OpenAI' })).toHaveLength(3)
  })

  it('creates a key after selecting a model group', () => {
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'New API key' }))
    const dialog = screen.getByRole('dialog', { name: 'New API key' })
    const createButton = within(dialog).getByRole('button', { name: 'Create key' })
    expect(createButton).toBeDisabled()

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Key name' }), {
      target: { value: 'Realtime Gateway' },
    })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'grok-realtime x1.2' }))
    expect(createButton).toBeEnabled()
    fireEvent.click(createButton)

    const createdKey = screen.getByRole('heading', { name: 'Realtime Gateway' }).closest('article')
    expect(createdKey).not.toBeNull()
    expect(within(createdKey!).getAllByText('grok-realtime').length).toBeGreaterThan(0)
  })
})
