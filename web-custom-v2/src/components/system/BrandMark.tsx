import { cn } from '@/lib/utils'

type BrandMarkProps = {
  /** The operator's logo URL from `/api/status`. Nothing is drawn when it is empty. */
  logo: string
  /** The operator's system name. */
  name: string
  className?: string
  /** Sizing for the mark. Constrain the HEIGHT and leave the width to the image. */
  markClassName?: string
  /** Typography for the name, so each frame keeps its own scale. */
  nameClassName?: string
}

/**
 * The deployment's mark and name, as every public frame and the sign-in page show them.
 *
 * The mark is sized by height with the width left to the image, and drawn with
 * `object-contain`. An operator pastes a URL for an arbitrary image: `object-cover` in a
 * square box cropped a wordmark to its middle, and `object-contain` in a square box
 * letterboxed a 512x160 wordmark into 28x9 of usable pixels. Fixing the height and
 * capping the width renders a square mark square and a wide one legibly wide.
 */
export function BrandMark(props: BrandMarkProps) {
  const logo = props.logo.trim()

  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', props.className)}>
      {logo === '' ? null : (
        <img
          alt=""
          className={cn('w-auto shrink-0 object-contain', props.markClassName ?? 'h-7 max-w-36')}
          src={logo}
        />
      )}
      <span className={cn('truncate', props.nameClassName)}>{props.name}</span>
    </span>
  )
}
