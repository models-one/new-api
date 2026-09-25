import { useCallback, useEffect, useRef, useState } from 'react'

export function useCopyToClipboard(resetDelay = 2000) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const copy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), resetDelay)
      return true
    } catch {
      setCopied(false)
      return false
    }
  }, [resetDelay])

  return { copied, copy }
}
