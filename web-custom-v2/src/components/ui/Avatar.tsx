import { useState } from 'react'

import { toneSurfaceClasses, type Tone } from '@/components/ui/tone'
import { cn } from '@/lib/utils'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

type AvatarProps = {
  /** Used for the initials, the deterministic tone, and the accessible name. */
  name: string
  src?: string
  size?: AvatarSize
  /** Overrides the tone derived from `name`. */
  tone?: Tone
  /** Set when the name is already rendered next to the avatar. */
  decorative?: boolean
  className?: string
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'size-7 text-[0.625rem]',
  sm: 'size-8 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-11 text-base',
}

const deterministicTones: Tone[] = ['primary', 'secondary', 'info', 'success', 'warning', 'destructive']

function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = [...words[0]]
  if (words.length === 1) return first.slice(0, 2).join('').toUpperCase()
  const last = [...words[words.length - 1]]
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
}

function toneFrom(name: string): Tone {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return deterministicTones[hash % deterministicTones.length]
}

export function Avatar(props: AvatarProps) {
  const { name, src, size = 'md', tone, decorative = false, className } = props
  const [imageFailed, setImageFailed] = useState(false)

  const semantics = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ 'aria-label': name, role: 'img' } as const)

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full border font-bold uppercase',
        sizeClasses[size],
        toneSurfaceClasses[tone ?? toneFrom(name)],
        className,
      )}
      {...semantics}
    >
      {src && !imageFailed ? (
        <img
          alt=""
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
          src={src}
        />
      ) : (
        initialsFrom(name)
      )}
    </span>
  )
}
