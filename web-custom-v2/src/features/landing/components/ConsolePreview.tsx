import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

const NAV_ITEMS = ['Dashboard', 'Usage logs', 'API keys', 'Models', 'Wallet'] as const

const METRICS = [
  { label: 'Requests', value: '1.28M', delta: '+12.4%' },
  { label: 'Spend', value: '$4,210', delta: '-3.1%' },
  { label: 'Tokens', value: '842M', delta: '+9.8%' },
  { label: 'Avg latency', value: '612 ms', delta: '-40 ms' },
] as const

const MODEL_SHARE = [
  { model: 'gpt-4o', share: 38 },
  { model: 'claude-sonnet-4', share: 27 },
  { model: 'gemini-2.5-pro', share: 19 },
  { model: 'deepseek-v3', share: 16 },
] as const

/**
 * A static picture of the console, the way a product screenshot would sit under
 * the hero. The numbers are illustrative, so the whole frame is one labelled image.
 */
export function ConsolePreview() {
  const { t } = useTranslation()

  return (
    <div
      aria-label={t('Preview of the usage console')}
      className="landing-glow-border relative mx-auto mt-16 max-w-[1120px] overflow-hidden rounded-[10px] bg-[#111214] shadow-[0_40px_120px_-40px_rgba(231,173,87,0.35)] [--landing-glow-fill:#111214]"
      role="img"
    >
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#191b1e] px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
      </div>

      <div className="grid md:grid-cols-[180px_1fr]">
        <div className="hidden border-r border-white/10 bg-[#191b1e]/60 p-3 md:block">
          {NAV_ITEMS.map((item, index) => (
            <div
              className={
                index === 0
                  ? 'rounded-[4px] bg-[#e7ad57]/12 px-3 py-2 text-left text-xs font-semibold text-[#e7ad57]'
                  : 'px-3 py-2 text-left text-xs text-[#989ca4]'
              }
              key={item}
            >
              {t(item)}
            </div>
          ))}
        </div>

        <div className="space-y-4 p-4 text-left sm:p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {METRICS.map((metric, index) => (
              <div
                className="landing-rise rounded-[6px] border border-white/10 bg-[#191b1e] p-3"
                key={metric.label}
                style={{ '--landing-delay': `${900 + index * 90}ms` } as CSSProperties}
              >
                <p className="text-[11px] text-[#989ca4]">{t(metric.label)}</p>
                <p className="mono mt-1 text-lg font-bold text-[#dfe2f2]">{metric.value}</p>
                <p className="mono mt-0.5 text-[11px] text-[#90b6a0]">{metric.delta}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-[6px] border border-white/10 bg-[#191b1e] p-4">
              <p className="text-xs font-semibold text-[#dfe2f2]">{t('Requests over time')}</p>
              <div className="relative mt-3">
                <svg className="landing-draw h-32 w-full" preserveAspectRatio="none" viewBox="0 0 400 120">
                  <defs>
                    <linearGradient id="landing-preview-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#e7ad57" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#e7ad57" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 92 C 30 88 50 70 80 74 C 110 78 130 52 160 56 C 190 60 210 40 240 44 C 270 48 290 26 320 30 C 350 34 370 18 400 14 L 400 120 L 0 120 Z"
                    fill="url(#landing-preview-fill)"
                  />
                  <path
                    d="M0 92 C 30 88 50 70 80 74 C 110 78 130 52 160 56 C 190 60 210 40 240 44 C 270 48 290 26 320 30 C 350 34 370 18 400 14"
                    fill="none"
                    stroke="#e7ad57"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {/* The line's last point (400, 14) sits 11.7% down the 120-unit viewBox. */}
                <span
                  aria-hidden="true"
                  className="landing-live-dot absolute right-0 top-[11.7%] size-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-[#e7ad57]"
                />
              </div>
            </div>

            <div className="rounded-[6px] border border-white/10 bg-[#191b1e] p-4">
              <p className="text-xs font-semibold text-[#dfe2f2]">{t('Usage by model')}</p>
              <div className="mt-3 space-y-3">
                {MODEL_SHARE.map((row, index) => (
                  <div key={row.model}>
                    <div className="flex justify-between text-[11px]">
                      <span className="mono text-[#b9cacb]">{row.model}</span>
                      <span className="mono text-[#989ca4]">{row.share}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/5">
                      <div
                        className="landing-grow-x h-full rounded-full bg-[#e7ad57]"
                        style={{ width: `${row.share}%`, '--landing-delay': `${1300 + index * 120}ms` } as CSSProperties}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
