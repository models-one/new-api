import { cn } from '@/lib/utils'

import { resolvePluginIcon, textAvatarClass } from '../lib/plugin-icon'

type PluginIconProps = {
  pluginKey: string
  name: string
  icon?: string
  hasIcon?: boolean
  /** A direct image (a marketplace logo or an upload preview) instead of the gateway-served one. */
  imageSrc?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASSES = {
  lg: 'size-12 text-lg',
  md: 'size-10 text-base',
  sm: 'size-7 text-xs',
} as const

/**
 * A plugin's mark: its own image when it ships one, otherwise a stable
 * two-letter avatar. Lobe brand names fall back to the avatar too, because this
 * console carries no brand-icon pack.
 */
export function PluginIcon(props: PluginIconProps) {
  const size = SIZE_CLASSES[props.size ?? 'md']
  const descriptor = resolvePluginIcon({
    hasIcon: props.hasIcon,
    icon: props.icon,
    iconSrc: props.imageSrc ?? undefined,
    key: props.pluginKey,
    name: props.name,
  })
  const imageSrc = descriptor.kind === 'image' ? descriptor.src : null

  if (imageSrc) {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface', size, props.className)}>
        <img alt="" className="size-full object-contain p-1" src={imageSrc} />
      </span>
    )
  }

  const text = descriptor.kind === 'text' ? descriptor.label : props.name.slice(0, 2).toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold',
        textAvatarClass(props.pluginKey),
        size,
        props.className
      )}
    >
      {text}
    </span>
  )
}
