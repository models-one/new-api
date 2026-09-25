import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

type SkipToMainProps = {
  /** Overrides the built-in link text. */
  label?: string
  /** Id of the element that receives focus. AppShell marks the content region `main-content`. */
  targetId?: string
  className?: string
}

export function SkipToMain(props: SkipToMainProps) {
  const { t } = useTranslation()
  const targetId = props.targetId ?? 'main-content'

  const focusTarget = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(targetId)
    if (target === null) return
    event.preventDefault()
    target.setAttribute('tabindex', '-1')
    target.focus()
  }

  return (
    <a
      className={cn(
        'sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-10 focus:items-center focus:rounded-[4px] focus:border focus:border-primary focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary',
        props.className,
      )}
      href={`#${targetId}`}
      onClick={focusTarget}
    >
      {props.label ?? t('Skip to main content')}
    </a>
  )
}
