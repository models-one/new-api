import { useRouter } from '@tanstack/react-router'
import type { MouseEvent, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type SettingsNavLinkProps = {
  href: string
  active: boolean
  variant: 'group' | 'section'
  children: ReactNode
}

/**
 * A real anchor carrying a real `href`, so middle-click and "open in new tab" behave, with
 * a plain left click intercepted and pushed through the router's history to keep the
 * navigation client-side.
 *
 * `<Link to="/system-settings/$group/$section">` is not usable yet: these routes are
 * registered in `routes.tsx` by the integrator, so the router's generated path union does
 * not contain them while this feature stands on its own. `history.push` takes an ordinary
 * string and needs no such registration. The same approach is already used by the chat
 * preset directory.
 */
export function SettingsNavLink(props: SettingsNavLinkProps) {
  const router = useRouter()

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Leave modified and non-primary clicks to the browser.
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    if (event.defaultPrevented || modified || event.button !== 0) return
    event.preventDefault()
    router.history.push(props.href)
  }

  const groupClasses = cn(
    'inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-2.5 text-sm font-semibold transition-colors',
    props.active
      ? 'border-primary text-primary'
      : 'border-transparent text-muted hover:border-border-strong hover:text-foreground',
  )

  const sectionClasses = cn(
    'block shrink-0 whitespace-nowrap rounded-[4px] border px-3 py-2 text-sm transition-colors lg:whitespace-normal',
    props.active
      ? 'border-primary/40 bg-primary/10 font-semibold text-primary'
      : 'border-transparent text-muted hover:bg-surface-high hover:text-foreground',
  )

  return (
    <a
      aria-current={props.active ? 'page' : undefined}
      className={props.variant === 'group' ? groupClasses : sectionClasses}
      href={props.href}
      onClick={handleClick}
    >
      {props.children}
    </a>
  )
}
