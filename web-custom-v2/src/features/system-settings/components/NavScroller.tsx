import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type NavScrollerProps = {
  /** The strip itself — usually a `<ul>` that is wider than the phone it is read on. */
  children: ReactNode
  className?: string
}

const FADE = '2rem'

/**
 * A horizontal strip that admits it scrolls.
 *
 * Both settings navigations are wider than a 390px phone. A bare `overflow-x-auto` there
 * slices the last tab in half against the viewport edge and stops: macOS draws no overlay
 * scrollbar until something moves, so a cut label reads as a rendering fault rather than
 * an invitation to swipe. Fading whichever edge still has content behind it says "there
 * is more this way", and the fade disappears at the ends so a strip that fits — the
 * section list once it stacks vertically at `lg` — looks untouched.
 */
export function NavScroller(props: NavScrollerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const node = scrollRef.current
    if (node === null) return
    const update = () => {
      const maxScroll = node.scrollWidth - node.clientWidth
      setEdges({
        left: node.scrollLeft > 1,
        right: node.scrollLeft < maxScroll - 1,
      })
    }
    update()
    node.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(node)
    for (const child of Array.from(node.children)) observer.observe(child)
    return () => {
      node.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  // A mask rather than a gradient overlay: the strips sit straight on the page
  // background, and a mask needs no colour to match.
  const mask = ((): CSSProperties => {
    if (!edges.left && !edges.right) return {}
    const stops = [
      edges.left ? `transparent, black ${FADE}` : 'black 0',
      edges.right ? `black calc(100% - ${FADE}), transparent` : 'black 100%',
    ].join(', ')
    const image = `linear-gradient(to right, ${stops})`
    return { maskImage: image, WebkitMaskImage: image }
  })()

  return (
    <div className={cn('scroll-x-hint min-w-0', props.className)} ref={scrollRef} style={mask}>
      {props.children}
    </div>
  )
}
