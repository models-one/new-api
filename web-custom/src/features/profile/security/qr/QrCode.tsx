import { useMemo } from 'react'

import { encodeQr } from '@/features/profile/security/qr/qr-encode'
import { cn } from '@/lib/utils'

type QrCodeProps = {
  /** The payload. For 2FA this is the `otpauth_url` the setup endpoint returns. */
  value: string
  /**
   * Accessible name. A QR code is an image of a URI the user cannot read, so the
   * label describes its purpose; the URI itself is offered as copyable text
   * elsewhere on the surface.
   */
  label: string
  /** Rendered side length in CSS pixels, excluding the quiet zone. */
  size?: number
  className?: string
  /** Rendered instead of the code when the payload cannot be encoded. */
  fallback?: React.ReactNode
}

/** Four light modules on every side, mandated by ISO/IEC 18004 for scanning. */
const QUIET_ZONE_MODULES = 4

/**
 * Renders a QR code as inline SVG.
 *
 * The modules are emitted as one `<path>` of per-module rectangles rather than
 * thousands of `<rect>` elements: a version-26 symbol is 121x121, and one path
 * keeps the DOM small enough to re-render without jank.
 *
 * The light background is painted explicitly in white rather than inherited from
 * the theme. Scanners need the dark-on-light polarity, and a dark-theme surface
 * behind dark modules is unreadable.
 */
export function QrCode(props: QrCodeProps) {
  const { value, label, size = 208, className, fallback = null } = props

  const matrix = useMemo(() => {
    try {
      return encodeQr(value)
    } catch {
      return null
    }
  }, [value])

  if (!matrix) return <>{fallback}</>

  const span = matrix.size + QUIET_ZONE_MODULES * 2
  let path = ''
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (!matrix.modules[y][x]) continue
      path += `M${x + QUIET_ZONE_MODULES} ${y + QUIET_ZONE_MODULES}h1v1h-1z`
    }
  }

  return (
    <svg
      aria-label={label}
      className={cn('block', className)}
      height={size}
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${span} ${span}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#ffffff" height={span} width={span} x="0" y="0" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
