import { afterEach, describe, expect, it, vi } from 'vitest'

import { requireConsoleAuthentication } from '@/lib/console-auth-guard'
import { useAuthStore } from '@/stores/auth-store'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  useAuthStore.getState().auth.reset('idle')
})

describe('console authentication guard', () => {
  it('allows local UI preview without a running authentication backend', async () => {
    const replace = vi.fn()
    vi.stubGlobal('window', {
      location: {
        href: 'http://localhost:4173/dashboard',
        origin: 'http://localhost:4173',
        replace,
      },
    })
    useAuthStore.getState().auth.reset('complete')

    await expect(requireConsoleAuthentication('/dashboard')).resolves.toBeUndefined()
    expect(replace).not.toHaveBeenCalled()
  })

  it.each(['/settings', '/pelican', '/pelican-management'])('redirects anonymous visitors from %s to sign-in', async (target) => {
    vi.stubEnv('PUBLIC_PREVIEW_MODE', 'false')
    const replace = vi.fn()
    vi.stubGlobal('window', {
      location: {
        href: 'https://console.example/settings',
        origin: 'https://console.example',
        replace,
      },
    })
    useAuthStore.getState().auth.reset('complete')

    const navigation = requireConsoleAuthentication(target)
    let settled = false
    void navigation.finally(() => {
      settled = true
    })
    await Promise.resolve()

    expect(replace).toHaveBeenCalledWith(
      `https://console.example/sign-in?redirect=${encodeURIComponent(target)}`,
    )
    expect(settled).toBe(false)
  })
})
