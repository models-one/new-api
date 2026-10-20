import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/ui/CopyButton'
import { pricingQuery } from '@/lib/api/pricing'
import { serverStatusQuery } from '@/lib/api/status'
import { cn } from '@/lib/utils'

type VendorSample = { vendor: string; model: string }

// Shown until the catalogue loads, or when the operator has not assigned vendors to models.
const FALLBACK_SAMPLES: readonly VendorSample[] = [
  { vendor: 'DeepSeek', model: 'deepseek-chat' },
  { vendor: '通义千问', model: 'qwen-plus' },
  { vendor: '智谱 GLM', model: 'glm-4-plus' },
  { vendor: 'Kimi', model: 'kimi-k2' },
  { vendor: 'MiniMax', model: 'MiniMax-M1' },
  { vendor: '豆包', model: 'doubao-seed-1.6' },
]

const MAX_SAMPLES = 6
const CYCLE_MS = 3200

/**
 * The homepage's one demonstration: the same request against different vendors, where only
 * the `model` line changes. It cycles on its own until the visitor picks a vendor, and never
 * when reduced motion is requested.
 */
export function ModelSwitchCard() {
  const { t } = useTranslation()
  const pricing = useQuery(pricingQuery()).data
  // `server_address` is what the operator configured; without one, the address the
  // visitor reached this page on is the best guess at the public API origin.
  const serverAddress = useQuery(serverStatusQuery()).data?.server_address?.trim() ?? ''
  const origin = serverAddress === '' ? window.location.origin : serverAddress.replace(/\/+$/, '')

  const catalogueSamples: VendorSample[] = []
  for (const vendor of pricing?.vendors ?? []) {
    const model = pricing?.data?.find((entry) => entry.vendor_id === vendor.id)
    if (model === undefined || vendor.name.trim() === '') continue
    catalogueSamples.push({ vendor: vendor.name.trim(), model: model.model_name })
    if (catalogueSamples.length === MAX_SAMPLES) break
  }
  const samples = catalogueSamples.length === 0 ? FALLBACK_SAMPLES : catalogueSamples

  const [selected, setSelected] = useState(0)
  const [pickedByVisitor, setPickedByVisitor] = useState(false)
  const active = samples[selected % samples.length]

  useEffect(() => {
    if (pickedByVisitor || samples.length < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setSelected((index) => (index + 1) % samples.length), CYCLE_MS)
    return () => window.clearInterval(timer)
  }, [pickedByVisitor, samples.length])

  const lines = [
    'from openai import OpenAI',
    '',
    'client = OpenAI(',
    `    base_url="${origin}/v1",`,
    '    api_key="YOUR_API_KEY",',
    ')',
    '',
    'reply = client.chat.completions.create(',
    `    model="${active.model}",`,
    '    messages=[{"role": "user", "content": "你好"}],',
    ')',
  ]
  const modelLine = 8

  return (
    <div className="rounded-[14px] border border-[var(--home-line)] bg-[var(--home-paper)] p-2 shadow-[0_30px_60px_-30px_rgba(11,31,68,0.35)]">
      <div aria-label={t('Pick a vendor')} className="flex flex-wrap gap-1.5 p-2" role="group">
        {samples.map((sample, index) => {
          const isActive = index === selected % samples.length
          return (
            <button
              aria-pressed={isActive}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
                isActive
                  ? 'border-[var(--home-blue)] bg-[var(--home-blue)] text-white'
                  : 'border-[var(--home-line)] bg-[var(--home-paper)] text-[var(--home-ink)] hover:border-[var(--home-blue)] hover:text-[var(--home-blue)]',
              )}
              key={sample.vendor}
              onClick={() => {
                setPickedByVisitor(true)
                setSelected(index)
              }}
              type="button"
            >
              {sample.vendor}
            </button>
          )
        })}
      </div>

      <div className="relative overflow-hidden rounded-[10px] bg-[var(--home-code)]">
        <CopyButton
          className="absolute right-3 top-3 text-[#9fb4d9] hover:text-white"
          label={t('Copy code')}
          size="icon-sm"
          value={lines.join('\n')}
        />
        <pre className="mono overflow-x-auto px-5 py-5 pr-14 text-[13px] leading-6 text-[#d6e2ff]">
          <code>
            {lines.map((line, index) =>
              index === modelLine ? (
                <span className="home-changed-line block" key={active.model}>
                  {line}
                </span>
              ) : (
                <span className="block" key={index}>
                  {line === '' ? ' ' : line}
                </span>
              ),
            )}
          </code>
        </pre>
      </div>

      <p className="px-3 pb-2 pt-3 text-sm text-[var(--home-faint)]">
        {t('Switching vendors changes only the highlighted line.')}
      </p>
    </div>
  )
}
