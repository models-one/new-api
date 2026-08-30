import { useSyncExternalStore } from 'react'

function subscribe(onStoreChange: () => void): () => void {
  document.addEventListener('visibilitychange', onStoreChange)
  return () => document.removeEventListener('visibilitychange', onStoreChange)
}

function getSnapshot(): boolean {
  return document.visibilityState !== 'hidden'
}

/**
 * `true` while this tab is on screen.
 *
 * A health page is the kind of tab people leave open for days, so the polling
 * queries multiply their interval by this: hidden tab, `refetchInterval: false`,
 * no traffic. Returning to the tab fires `visibilitychange`, the interval comes
 * back, and react-query refetches immediately because the data is stale.
 *
 * This is deliberately not `refetchIntervalInBackground` — that flag keys off
 * window FOCUS, so a visible-but-unfocused window (a second monitor, this tab
 * beside an editor) would stop updating while the operator is watching it.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}

/** `refetchInterval` for a poll that must go quiet while the tab is hidden. */
export function pollingInterval(intervalMs: number, isVisible: boolean): number | false {
  return isVisible ? intervalMs : false
}
