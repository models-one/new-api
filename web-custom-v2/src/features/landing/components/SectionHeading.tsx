import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type SectionHeadingProps = {
  id?: string
  eyebrow: string
  title: string
  description?: ReactNode
  align?: 'start' | 'center'
  className?: string
}

/** The eyebrow / title / lede stack every landing section opens with. */
export function SectionHeading(props: SectionHeadingProps) {
  const { id, eyebrow, title, description, align = 'start', className } = props

  return (
    <div className={cn('landing-reveal max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#e7ad57]">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold leading-tight text-[#dfe2f2] sm:text-4xl" id={id}>
        {title}
      </h2>
      {description === undefined ? null : (
        <p className="mt-4 text-base leading-7 text-[#b9cacb]">{description}</p>
      )}
    </div>
  )
}
