import { describe, expect, it } from 'vitest'

import type { SystemInstance } from '@/features/system-info/api'
import {
  DEFAULT_PERFORMANCE_WINDOW_HOURS,
  formatSuccessRate,
  formatThroughput,
  isPerformanceWindow,
  rollupModelPerformance,
  SUCCESS_RATE_TONE,
  successRateLevel,
} from '@/features/system-info/model-performance'
import {
  countInstances,
  diskCacheUsagePercent,
  formatBytes,
  formatDuration,
  heartbeatAgeSeconds,
  instanceHostname,
  instanceNodeName,
  instancePlatform,
  isAutoNamedInstance,
  isMasterInstance,
  RESOURCE_CRITICAL_PERCENT,
  RESOURCE_WARNING_PERCENT,
  resourceTone,
  rfc3339ToUnixSeconds,
  uptimeSeconds,
} from '@/features/system-info/presentation'
import { pollingInterval } from '@/features/system-info/use-page-visible'

/** Verbatim from `GET /api/system-info/instances` on the dev server. */
const onlineNode: SystemInstance = {
  info: {
    host: { hostname: 'MacBook-Air.local' },
    node: {
      manually_configured: false,
      name: 'MacBook-Air.local',
      should_configure_manually: true,
      source: 'hostname',
    },
    resources: {
      cpu: { usage_percent: 17.504019292608263 },
      memory: { usage_percent: 47.417593002319336 },
      storage: {
        free_bytes: 61_318_922_240,
        total_bytes: 494_384_795_648,
        used_bytes: 433_065_873_408,
        used_percent: 87.59692393864418,
      },
    },
    role: { is_master: true },
    runtime: { goarch: 'arm64', goos: 'darwin', started_at: 1_788_048_328, version: 'v0.0.0' },
    schema_version: 1,
  },
  last_seen_at: 1_788_048_779,
  node_name: 'MacBook-Air.local',
  stale_after_seconds: 90,
  started_at: 1_788_048_328,
  status: 'online',
}

/** A second node, worker, stale, and stored before the info column was populated. */
const staleWorker: SystemInstance = {
  info: null,
  last_seen_at: 1_788_040_000,
  node_name: 'worker-2',
  stale_after_seconds: 90,
  started_at: 1_788_000_000,
  status: 'stale',
}

describe('byte and duration formatting', () => {
  it('uses binary units so 1073741824 reads back as the 1024 MB the server configured', () => {
    expect(formatBytes(1_073_741_824)).toBe('1 GB')
    expect(formatBytes(10_485_760)).toBe('10 MB')
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
  })

  it('returns a dash rather than NaN for a field the payload omitted', () => {
    expect(formatBytes(undefined)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
  })

  it('keeps a duration to its two largest units', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(3_720)).toBe('1h 2m')
    expect(formatDuration(90_061)).toBe('1d 1h')
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(-10)).toBe('0s')
  })
})

describe('resource meter thresholds', () => {
  it('changes tone exactly at the two declared constants', () => {
    expect(resourceTone(RESOURCE_WARNING_PERCENT - 0.1)).toBe('success')
    expect(resourceTone(RESOURCE_WARNING_PERCENT)).toBe('warning')
    expect(resourceTone(RESOURCE_CRITICAL_PERCENT - 0.1)).toBe('warning')
    expect(resourceTone(RESOURCE_CRITICAL_PERCENT)).toBe('destructive')
  })

  it('falls back to muted when the node reported no percentage at all', () => {
    expect(resourceTone(undefined)).toBe('muted')
    expect(resourceTone(Number.NaN)).toBe('muted')
  })
})

describe('instance field access', () => {
  it('prefers the reported node name and falls back to the row key', () => {
    expect(instanceNodeName(onlineNode)).toBe('MacBook-Air.local')
    expect(instanceNodeName(staleWorker)).toBe('worker-2')
  })

  it('survives a row whose info column is null instead of inventing values', () => {
    expect(instanceHostname(staleWorker)).toBeUndefined()
    expect(instancePlatform(staleWorker)).toBeUndefined()
    expect(isMasterInstance(staleWorker)).toBe(false)
    expect(isAutoNamedInstance(staleWorker)).toBe(false)
  })

  it('reads the platform pair and the auto-named flag when they are present', () => {
    expect(instancePlatform(onlineNode)).toBe('darwin/arm64')
    expect(isMasterInstance(onlineNode)).toBe(true)
    expect(isAutoNamedInstance(onlineNode)).toBe(true)
  })

  it('measures uptime and heartbeat age against the clock it is handed', () => {
    const now = 1_788_048_800
    expect(uptimeSeconds(onlineNode, now)).toBe(472)
    expect(heartbeatAgeSeconds(onlineNode, now)).toBe(21)
    // A clock that lags the server must never produce a negative age.
    expect(heartbeatAgeSeconds(onlineNode, 1_788_048_000)).toBe(0)
  })

  it('counts the roles the multi-node warning depends on', () => {
    expect(countInstances([])).toEqual({ master: 0, online: 0, stale: 0, total: 0 })
    expect(countInstances([onlineNode, staleWorker])).toEqual({
      master: 1,
      online: 1,
      stale: 1,
      total: 2,
    })
  })
})

describe('log file timestamps', () => {
  it('converts the RFC 3339 strings this one endpoint uses into unix seconds', () => {
    expect(rfc3339ToUnixSeconds('2026-08-30T08:13:28.137042061+08:00')).toBe(1_788_048_808)
    expect(rfc3339ToUnixSeconds(undefined)).toBeNull()
    expect(rfc3339ToUnixSeconds('not a date')).toBeNull()
  })
})

describe('disk cache usage', () => {
  it('expresses held bytes as a share of the configured maximum', () => {
    expect(diskCacheUsagePercent(536_870_912, 1_073_741_824)).toBe(50)
    expect(diskCacheUsagePercent(0, 1_073_741_824)).toBe(0)
  })

  it('refuses to divide by an unconfigured maximum', () => {
    expect(diskCacheUsagePercent(1_000, 0)).toBeNull()
  })
})

describe('polling interval', () => {
  it('switches the interval off entirely while the tab is hidden', () => {
    expect(pollingInterval(30_000, true)).toBe(30_000)
    expect(pollingInterval(30_000, false)).toBe(false)
  })
})

describe('model performance grading', () => {
  it('grades on the same boundaries the legacy module used', () => {
    expect(successRateLevel(100)).toBe('excellent')
    expect(successRateLevel(99.99)).toBe('good')
    expect(successRateLevel(90)).toBe('good')
    expect(successRateLevel(89.99)).toBe('warning')
    expect(successRateLevel(70)).toBe('warning')
    expect(successRateLevel(69.99)).toBe('critical')
    expect(successRateLevel(0)).toBe('critical')
    expect(successRateLevel(Number.NaN)).toBe('unknown')
  })

  it('maps every level onto a tone the kit knows', () => {
    expect(SUCCESS_RATE_TONE.excellent).toBe('success')
    expect(SUCCESS_RATE_TONE.warning).toBe('warning')
    expect(SUCCESS_RATE_TONE.critical).toBe('destructive')
    expect(SUCCESS_RATE_TONE.unknown).toBe('muted')
  })

  it('formats throughput and success rate the way the legacy module did', () => {
    expect(formatThroughput(0)).toBe('—')
    expect(formatThroughput(4.5)).toBe('4.50 t/s')
    expect(formatThroughput(42.5)).toBe('42.5 t/s')
    expect(formatThroughput(2_500)).toBe('2.5K t/s')
    expect(formatSuccessRate(99.5)).toBe('99.50%')
    expect(formatSuccessRate(Number.NaN)).toBe('—')
  })

  it('takes an unweighted mean and skips zeros for latency and throughput only', () => {
    const rollup = rollupModelPerformance([
      { avg_latency_ms: 745, avg_tps: 0, model_name: 'gpt-4o-mini', success_rate: 0 },
      { avg_latency_ms: 255, avg_tps: 30, model_name: 'gpt-4o', success_rate: 100 },
    ])

    // Latency: (745 + 255) / 2. Throughput: 30 / 1, because the zero is skipped.
    expect(rollup.avgLatencyMs).toBe(500)
    expect(rollup.avgTps).toBe(30)
    // Success rate keeps the zero — a failing model must drag the average down.
    expect(rollup.successRate).toBe(50)
    expect(rollup.modelCount).toBe(2)
  })

  it('reports NaN, not zero, when there is nothing to average', () => {
    const rollup = rollupModelPerformance([])
    expect(Number.isNaN(rollup.avgLatencyMs)).toBe(true)
    expect(Number.isNaN(rollup.successRate)).toBe(true)
    expect(rollup.modelCount).toBe(0)
  })

  it('only offers windows the endpoint accepts', () => {
    expect(isPerformanceWindow(DEFAULT_PERFORMANCE_WINDOW_HOURS)).toBe(true)
    expect(isPerformanceWindow(720)).toBe(true)
    expect(isPerformanceWindow(5_000)).toBe(false)
  })
})
