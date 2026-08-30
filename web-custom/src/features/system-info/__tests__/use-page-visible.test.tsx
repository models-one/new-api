import '@testing-library/jest-dom/vitest'

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { pollingInterval, usePageVisible } from '@/features/system-info/use-page-visible'

const INTERVAL_MS = 30_000

function Probe() {
  const isVisible = usePageVisible()
  return <output>{String(pollingInterval(INTERVAL_MS, isVisible))}</output>
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

afterEach(() => {
  setVisibility('visible')
  cleanup()
})

describe('the visibility-aware poll', () => {
  it('polls on the named interval while the tab is on screen', () => {
    render(<Probe />)
    expect(screen.getByRole('status')).toHaveTextContent(String(INTERVAL_MS))
  })

  /**
   * This is the whole point of the hook: a health page left open overnight must stop
   * calling the server, and must start again the moment somebody looks at it.
   */
  it('switches the interval off when the tab is hidden and back on when it returns', () => {
    render(<Probe />)

    setVisibility('hidden')
    expect(screen.getByRole('status')).toHaveTextContent('false')

    setVisibility('visible')
    expect(screen.getByRole('status')).toHaveTextContent(String(INTERVAL_MS))
  })
})
