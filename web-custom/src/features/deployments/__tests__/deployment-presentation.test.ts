import { describe, expect, it } from 'vitest'

import {
  COMPLETED_PERCENT_MAX,
  deploymentStatusLabel,
  deploymentStatusText,
  deploymentStatusTone,
  DEPLOYMENT_STATUSES,
  formatIoNetAmount,
  formatRemainingMinutes,
  hardwareSummary,
  isBlankName,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  normalizeDeploymentStatus,
  parseEnvObject,
  remainingPercent,
  splitCommandTokens,
} from '@/features/deployments/deployment-presentation'

/** Stands in for i18next: the console renders English source strings unchanged. */
const t = (key: string) => key

describe('deployment status', () => {
  it('covers exactly the statuses controller.computeStatusCounts seeds', () => {
    expect([...DEPLOYMENT_STATUSES]).toEqual([
      'running',
      'completed',
      'failed',
      'deployment requested',
      'termination requested',
      'destroyed',
    ])
    for (const status of DEPLOYMENT_STATUSES) {
      expect(deploymentStatusLabel(status)).not.toBe('')
    }
  })

  it('matches the server, which lower-cases every status before sending it', () => {
    expect(normalizeDeploymentStatus('  Running ')).toBe('running')
    expect(deploymentStatusLabel('RUNNING')).toBe('Running')
  })

  it('echoes an unknown status rather than flattening it to Unknown', () => {
    expect(deploymentStatusText('paused-by-provider', t)).toBe('paused-by-provider')
    expect(deploymentStatusTone('paused-by-provider')).toBe('muted')
  })

  it('falls back to Unknown only when the status is genuinely empty', () => {
    expect(deploymentStatusText('   ', t)).toBe('Unknown')
  })

  it('treats error as a failure, the way the legacy status map did', () => {
    expect(deploymentStatusLabel('error')).toBe('Failed')
    expect(deploymentStatusTone('error')).toBe('destructive')
    expect(deploymentStatusTone('termination requested')).toBe('warning')
  })
})

describe('remaining time', () => {
  it('converts compute_minutes_remaining with the named constants', () => {
    expect(MINUTES_PER_HOUR).toBe(60)
    expect(MINUTES_PER_DAY).toBe(1440)
    expect(formatRemainingMinutes(MINUTES_PER_DAY + 2 * MINUTES_PER_HOUR + 15)).toBe('1d 2h 15m')
    expect(formatRemainingMinutes(45)).toBe('45m')
    expect(formatRemainingMinutes(120)).toBe('2h')
    expect(formatRemainingMinutes(0)).toBe('0m')
  })

  it('returns null for a value that is not a finite number, so the caller can fall back', () => {
    expect(formatRemainingMinutes(Number.NaN)).toBeNull()
    expect(formatRemainingMinutes(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('clamps a negative minute count rather than printing a negative duration', () => {
    expect(formatRemainingMinutes(-30)).toBe('0m')
  })
})

describe('remaining percent', () => {
  it('is derived as COMPLETED_PERCENT_MAX minus the consumed share', () => {
    expect(COMPLETED_PERCENT_MAX).toBe(100)
    expect(remainingPercent(25)).toBe(75)
    expect(remainingPercent(0)).toBe(100)
  })

  it('clamps a value outside 0–100 instead of reporting a share above the whole', () => {
    expect(remainingPercent(140)).toBe(0)
    expect(remainingPercent(-10)).toBe(100)
  })

  it('is null when io.net sent no usable percentage', () => {
    expect(remainingPercent(Number.NaN)).toBeNull()
  })
})

describe('money', () => {
  it('prints the provider currency code and never a dollar sign', () => {
    expect(formatIoNetAmount(12.5, 'usdc')).toBe('12.5000 USDC')
    expect(formatIoNetAmount(0, 'USDC')).toBe('0.0000 USDC')
  })

  it('drops the code when the server sent none', () => {
    expect(formatIoNetAmount(1, '')).toBe('1.0000')
  })
})

describe('hardware summary', () => {
  it('joins the brand, the model and the quantity', () => {
    expect(hardwareSummary('NVIDIA', 'A100', 8)).toBe('NVIDIA A100 ×8')
  })

  it('is empty when io.net named neither, so the caller can use hardware_info instead', () => {
    expect(hardwareSummary('', '', 4)).toBe('')
    expect(hardwareSummary('', 'RTX4090', 2)).toBe('RTX4090 ×2')
  })
})

describe('command tokens', () => {
  it('splits on any whitespace and drops the empties', () => {
    expect(splitCommandTokens('  serve   --port 8000 ')).toEqual(['serve', '--port', '8000'])
    expect(splitCommandTokens('   ')).toEqual([])
  })
})

describe('environment JSON', () => {
  it('treats an empty field as "send nothing"', () => {
    expect(parseEnvObject('   ')).toEqual({ ok: true, value: undefined })
  })

  it('stringifies non-string values because io.net types the map as string to string', () => {
    expect(parseEnvObject('{"PORT":8000,"DEBUG":true,"NAME":"x"}')).toEqual({
      ok: true,
      value: { DEBUG: 'true', NAME: 'x', PORT: '8000' },
    })
  })

  it('refuses anything that is not a JSON object', () => {
    expect(parseEnvObject('[1,2]')).toEqual({ ok: false, reason: 'not-an-object' })
    expect(parseEnvObject('"a"')).toEqual({ ok: false, reason: 'not-an-object' })
    expect(parseEnvObject('null')).toEqual({ ok: false, reason: 'not-an-object' })
    expect(parseEnvObject('{oops')).toEqual({ ok: false, reason: 'invalid-json' })
  })
})

describe('name checks', () => {
  it('treats a whitespace-only name as blank, so check-name is never asked about it', () => {
    expect(isBlankName('   ')).toBe(true)
    expect(isBlankName(' a ')).toBe(false)
  })
})
