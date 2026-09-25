import MinusIcon from 'lucide-react/dist/esm/icons/minus'
import TrendingDownIcon from 'lucide-react/dist/esm/icons/trending-down'
import TrendingUpIcon from 'lucide-react/dist/esm/icons/trending-up'
import type { ReactNode } from 'react'

import { Panel } from '@/components/ui/Panel'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { toneTextClasses, type Tone } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

type DeltaDirection = 'up' | 'down' | 'flat'

type StatCardDelta = {
  /** Preformatted change, e.g. "+12.5%". */
  value: string
  direction: DeltaDirection
  /** Trailing context, e.g. "vs last period". */
  caption?: string
  /** Overrides the direction colour when up is not "good" (latency, spend). */
  tone?: Tone
}

type StatCardMeter = {
  value: number
  max?: number
  tone?: Tone
  /** Accessible name for the meter; falls back to the card label. */
  label?: string
  valueText?: string
}

type StatCardProps = {
  label: string
  /** ReactNode so a page can render "$4,250" with smaller cents. */
  value: ReactNode
  unit?: string
  icon?: ReactNode
  iconTone?: Tone
  delta?: StatCardDelta
  meter?: StatCardMeter
  footer?: ReactNode
  className?: string
}

const directionTone: Record<DeltaDirection, Tone> = {
  up: 'success',
  down: 'destructive',
  flat: 'muted',
}

const directionIcon: Record<DeltaDirection, typeof MinusIcon> = {
  up: TrendingUpIcon,
  down: TrendingDownIcon,
  flat: MinusIcon,
}

export function StatCard(props: StatCardProps) {
  const { label, value, unit, icon, iconTone = 'primary', delta, meter, footer, className } = props
  const DeltaIcon = delta ? directionIcon[delta.direction] : undefined

  return (
    <Panel as="div" className={cn('flex flex-col p-6', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {icon ? (
          <span aria-hidden="true" className={cn('shrink-0 [&_svg]:size-5', toneTextClasses[iconTone])}>
            {icon}
          </span>
        ) : null}
      </div>

      <p className="mono mt-4 text-4xl font-bold text-foreground">
        {value}
        {unit ? <span className="text-lg font-semibold text-muted">{unit}</span> : null}
      </p>

      {delta && DeltaIcon ? (
        <p
          className={cn(
            'mt-4 inline-flex items-center gap-1.5 text-sm font-semibold',
            toneTextClasses[delta.tone ?? directionTone[delta.direction]],
          )}
        >
          <DeltaIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="mono">{delta.value}</span>
          {delta.caption ? <span className="font-normal text-muted">{delta.caption}</span> : null}
        </p>
      ) : null}

      {meter ? (
        <ProgressBar
          className="mt-6"
          label={meter.label ?? label}
          max={meter.max}
          tone={meter.tone ?? 'primary'}
          value={meter.value}
          valueText={meter.valueText}
        />
      ) : null}

      {footer ? (
        <div className="mt-auto pt-5 text-sm text-muted empty:hidden">{footer}</div>
      ) : null}
    </Panel>
  )
}
