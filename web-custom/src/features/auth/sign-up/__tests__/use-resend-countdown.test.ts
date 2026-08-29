// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useResendCountdown } from '@/features/auth/sign-up/use-resend-countdown'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useResendCountdown', () => {
  it('is idle until it is started', () => {
    const { result } = renderHook(() => useResendCountdown(30))
    expect(result.current.isActive).toBe(false)
    expect(result.current.secondsLeft).toBe(0)
  })

  it('counts down and releases the lock at zero', () => {
    const { result } = renderHook(() => useResendCountdown(3))

    act(() => result.current.start())
    expect(result.current.secondsLeft).toBe(3)
    expect(result.current.isActive).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.secondsLeft).toBe(1)
    expect(result.current.isActive).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.secondsLeft).toBe(0)
    expect(result.current.isActive).toBe(false)
  })

  it('restarts from the top rather than stacking intervals', () => {
    const { result } = renderHook(() => useResendCountdown(5))

    act(() => result.current.start())
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.secondsLeft).toBe(3)

    act(() => result.current.start())
    expect(result.current.secondsLeft).toBe(5)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    // A stacked interval would have taken off two seconds here.
    expect(result.current.secondsLeft).toBe(4)
  })

  it('stops the timer when the component unmounts', () => {
    const clearInterval = vi.spyOn(window, 'clearInterval')
    const { result, unmount } = renderHook(() => useResendCountdown(30))

    act(() => result.current.start())
    unmount()

    expect(clearInterval).toHaveBeenCalled()
    clearInterval.mockRestore()
  })
})
