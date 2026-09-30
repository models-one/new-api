// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import '@/i18n/config'

const saveInterfaceLanguage = vi.fn()

vi.mock('@/features/profile/preferences/api', () => ({
  saveInterfaceLanguage: (value: string) => saveInterfaceLanguage(value),
}))

const { LanguageMenu } = await import('@/components/layout/LanguageMenu')

function renderMenu() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <LanguageMenu />
    </QueryClientProvider>,
  )
}

async function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /language|语言/i }))
  return screen.findByRole('menu')
}

beforeEach(() => {
  saveInterfaceLanguage.mockReset()
  saveInterfaceLanguage.mockResolvedValue(undefined)
  localStorage.clear()
})

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
  localStorage.clear()
})

describe('LanguageMenu', () => {
  it('lists every shipped language by its own name', async () => {
    renderMenu()
    await openMenu()

    for (const label of ['English', '简体中文', '繁體中文', 'Français', '日本語', 'Русский', 'Tiếng Việt']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(label) })).toBeTruthy()
    }
  })

  it('switches the console and saves the BCP-47 tag to the account', async () => {
    renderMenu()
    await openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: /简体中文/ }))

    await waitFor(() => {
      expect(i18n.language).toBe('zh')
    })
    // `zh-CN`, not `zh`: the legacy console maps a bare `zh` to English.
    expect(saveInterfaceLanguage).toHaveBeenCalledWith('zh-CN')
  })

  it('rolls the console back when the account rejects the save', async () => {
    saveInterfaceLanguage.mockRejectedValue(new Error('network down'))
    renderMenu()
    await openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: /简体中文/ }))

    await waitFor(() => {
      expect(saveInterfaceLanguage).toHaveBeenCalled()
    })
    // The screen must not claim a language the stored setting does not hold.
    await waitFor(() => {
      expect(i18n.language).toBe('en')
    })
  })

  it('does not save when the active language is picked again', async () => {
    renderMenu()
    await openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: /English/ }))

    expect(saveInterfaceLanguage).not.toHaveBeenCalled()
  })
})
