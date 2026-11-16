let sampleImage: string | null | undefined

/**
 * A dusk landscape drawn once per page: a PNG of about 690 KB that a lossless
 * WebP makes much smaller, so image plugins show their work with defaults.
 */
export function drawSampleImage(): string | null {
  if (sampleImage !== undefined) return sampleImage
  sampleImage = null
  const width = 2000
  const height = 1250
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  const sky = context.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#1e3a8a')
  sky.addColorStop(0.45, '#7c3aed')
  sky.addColorStop(0.75, '#f472b6')
  sky.addColorStop(1, '#fdba74')
  context.fillStyle = sky
  context.fillRect(0, 0, width, height)
  const sun = context.createRadialGradient(
    width * 0.7,
    height * 0.62,
    0,
    width * 0.7,
    height * 0.62,
    height * 0.35
  )
  sun.addColorStop(0, 'rgba(255, 237, 160, 1)')
  sun.addColorStop(0.3, 'rgba(253, 186, 116, 0.8)')
  sun.addColorStop(1, 'rgba(253, 186, 116, 0)')
  context.fillStyle = sun
  context.fillRect(0, 0, width, height)
  const hills: [string, number, number][] = [
    ['#4c1d95', 0.7, 0.08],
    ['#3b0764', 0.8, 0.06],
    ['#1e1b4b', 0.9, 0.05],
  ]
  for (const [color, base, amplitude] of hills) {
    context.beginPath()
    context.moveTo(0, height)
    for (let x = 0; x <= width; x += 8) {
      const wave =
        Math.sin((x / width) * 9 + base * 10) + Math.sin((x / width) * 23) * 0.3
      context.lineTo(x, height * base + wave * height * amplitude)
    }
    context.lineTo(width, height)
    context.closePath()
    context.fillStyle = color
    context.fill()
  }
  sampleImage = canvas.toDataURL('image/png')
  return sampleImage
}
