import ActivityIcon from 'lucide-react/dist/esm/icons/activity'
import ArrowRightIcon from 'lucide-react/dist/esm/icons/arrow-right'
import ChartColumnIcon from 'lucide-react/dist/esm/icons/chart-column'
import GaugeIcon from 'lucide-react/dist/esm/icons/gauge'
import KeyRoundIcon from 'lucide-react/dist/esm/icons/key-round'
import LayersIcon from 'lucide-react/dist/esm/icons/layers'
import ReceiptIcon from 'lucide-react/dist/esm/icons/receipt'
import RepeatIcon from 'lucide-react/dist/esm/icons/repeat'
import RouteIcon from 'lucide-react/dist/esm/icons/route'
import ScrollTextIcon from 'lucide-react/dist/esm/icons/scroll-text'
import UsersIcon from 'lucide-react/dist/esm/icons/users'
import WalletIcon from 'lucide-react/dist/esm/icons/wallet'
import { Link } from '@tanstack/react-router'
import type { CSSProperties, ComponentType, ReactNode, SVGProps } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionHeading } from '@/features/landing/components/SectionHeading'
import { cn } from '@/lib/utils'

type FeatureCard = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  description: string
}

type FeatureBlockProps = {
  id: string
  eyebrow: string
  title: string
  description: string
  cards: readonly FeatureCard[]
  link: { to: '/models' | '/pricing' | '/dashboard'; label: string }
  visual: ReactNode
  reversed?: boolean
}

/** One "headline + four capability cards + illustration" band. */
function FeatureBlock(props: FeatureBlockProps) {
  const { t } = useTranslation()
  const { id, eyebrow, title, description, cards, link, visual, reversed = false } = props

  return (
    <section aria-labelledby={id} className="landing-deferred-section px-4 py-24 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1200px]">
        <SectionHeading description={t(description)} eyebrow={t(eyebrow)} id={id} title={t(title)} />

        <div className="mt-12 grid items-start gap-6 lg:grid-cols-2">
          <div className={cn('grid gap-4 sm:grid-cols-2', reversed && 'lg:order-2')}>
            {cards.map((card, index) => {
              const Icon = card.icon
              return (
                <div
                  className="landing-card landing-reveal rounded-[6px] border border-white/10 bg-[#191b1e] p-5"
                  key={card.title}
                  style={{ '--landing-step': index } as CSSProperties}
                >
                  <span className="landing-card-icon grid size-9 place-items-center rounded-[4px] bg-[#e7ad57]/12 text-[#e7ad57]">
                    <Icon aria-hidden="true" className="size-[18px]" />
                  </span>
                  <h3 className="mt-4 text-base font-bold text-[#dfe2f2]">{t(card.title)}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#b9cacb]">{t(card.description)}</p>
                </div>
              )
            })}
          </div>

          <div className="landing-reveal flex flex-col gap-4 [--landing-step:1] lg:sticky lg:top-28 lg:self-start">
            {visual}
            <Link className="landing-arrow-link inline-flex items-center gap-2 self-start text-sm font-semibold text-[#e7ad57] hover:text-[#f6c477]" to={link.to}>
              {t(link.label)}
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

const CHANNELS = [
  { name: 'Channel A', detail: 'Priority 1 · weight 70', share: 70, state: 'Serving' },
  { name: 'Channel B', detail: 'Priority 1 · weight 30', share: 30, state: 'Serving' },
  { name: 'Channel C', detail: 'Priority 2', share: 0, state: 'Standby for retries' },
] as const

function RoutingVisual() {
  const { t } = useTranslation()

  return (
    <div aria-label={t('Example of a request routed across channels')} className="rounded-[8px] border border-white/10 bg-[#111214] p-5" role="img">
      <div className="mono rounded-[4px] border border-white/10 bg-[#191b1e] px-3 py-2 text-xs text-[#dfe2f2]">
        POST /v1/chat/completions · <span className="text-[#e7ad57]">claude-sonnet-4</span>
      </div>
      <div aria-hidden="true" className="landing-flow ml-4 h-5 w-px" />
      <div className="space-y-2">
        {CHANNELS.map((channel, index) => (
          <div className="rounded-[4px] border border-white/10 bg-[#191b1e] px-3 py-2.5" key={channel.name}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-[#dfe2f2]">{t(channel.name)}</span>
              <span className={channel.share > 0 ? 'text-[#90b6a0]' : 'text-[#989ca4]'}>{t(channel.state)}</span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="mono text-[11px] text-[#989ca4]">{t(channel.detail)}</span>
              <div className="h-1 flex-1 rounded-full bg-white/5">
                <div
                  className={cn('landing-grow-x landing-on-view h-full rounded-full bg-[#e7ad57]', channel.share > 0 && 'landing-shine')}
                  style={{ width: `${channel.share}%`, '--landing-step': index } as CSSProperties}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const DAILY_SPEND = [42, 55, 48, 63, 71, 58, 80] as const

function SpendVisual() {
  const { t } = useTranslation()
  const peak = Math.max(...DAILY_SPEND)

  return (
    <div aria-label={t('Example of daily spend over a week')} className="rounded-[8px] border border-white/10 bg-[#111214] p-5" role="img">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-[#dfe2f2]">{t('Spend, last 7 days')}</p>
        <p className="mono text-lg font-bold text-[#dfe2f2]">$417.20</p>
      </div>
      <div className="mt-5 flex h-40 items-end gap-3">
        {DAILY_SPEND.map((value, index) => (
          <div className="flex h-full flex-1 flex-col justify-end" key={index}>
            <div
              className="landing-grow-y landing-on-view rounded-t-[3px] bg-[#e7ad57]/25"
              style={{ height: `${(value / peak) * 100}%`, '--landing-step': index / 3 } as CSSProperties}
            >
              <div className="h-1/2 rounded-t-[3px] bg-[#e7ad57]" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-5 text-[11px] text-[#989ca4]">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#e7ad57]" />
          {t('Prompt tokens')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#e7ad57]/25" />
          {t('Completion tokens')}
        </span>
      </div>
    </div>
  )
}

function KeyVisual() {
  const { t } = useTranslation()
  const rows = [
    { label: 'Models', value: 'gpt-4o, claude-sonnet-4' },
    { label: 'IP allowlist', value: '10.0.0.0/8' },
    { label: 'Expires', value: '2026-12-31' },
  ]

  return (
    <div aria-label={t('Example of an API key with limits')} className="rounded-[8px] border border-white/10 bg-[#111214] p-5" role="img">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#dfe2f2]">production-backend</p>
        <span className="rounded-full border border-[#90b6a0]/30 bg-[#90b6a0]/10 px-2 py-0.5 text-[11px] font-semibold text-[#90b6a0]">
          {t('Enabled')}
        </span>
      </div>
      <p className="mono mt-1 text-xs text-[#989ca4]">sk-••••••••3f9a</p>

      <div className="mt-5">
        <div className="flex justify-between text-xs">
          <span className="text-[#b9cacb]">{t('Quota used')}</span>
          <span className="mono text-[#dfe2f2]">$200 / $500</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-white/5">
          <div className="landing-grow-x landing-on-view landing-shine h-full w-2/5 rounded-full bg-[#e7ad57]" />
        </div>
      </div>

      <dl className="mt-5 divide-y divide-white/10 border-t border-white/10">
        {rows.map((row) => (
          <div className="flex justify-between gap-4 py-2.5 text-xs" key={row.label}>
            <dt className="text-[#989ca4]">{t(row.label)}</dt>
            <dd className="mono text-right text-[#dfe2f2]">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const ROUTING_CARDS: readonly FeatureCard[] = [
  { icon: RouteIcon, title: 'Weighted load balancing', description: 'Spread traffic across channels by priority and weight.' },
  { icon: RepeatIcon, title: 'Automatic retries', description: 'A failed upstream call is retried on another channel that serves the same model.' },
  { icon: LayersIcon, title: 'Model mapping', description: 'Publish one model name and send each provider the name it expects.' },
  { icon: ActivityIcon, title: 'Every major API format', description: 'OpenAI Chat and Responses, Claude Messages and Gemini requests on one endpoint.' },
]

const ANALYTICS_CARDS: readonly FeatureCard[] = [
  { icon: ChartColumnIcon, title: 'Usage dashboard', description: 'Requests, tokens and spend over time, broken down by model.' },
  { icon: ScrollTextIcon, title: 'Request logs', description: 'Every call with its model, token counts, latency and cost.' },
  { icon: ReceiptIcon, title: 'Published prices', description: 'Per-model prices are listed before you send a single request.' },
  { icon: UsersIcon, title: 'Group rates', description: 'Different user groups can carry their own price multipliers.' },
]

const CONTROL_CARDS: readonly FeatureCard[] = [
  { icon: KeyRoundIcon, title: 'Scoped API keys', description: 'Give each key its own quota, expiry date, allowed models and allowed IPs.' },
  { icon: GaugeIcon, title: 'Rate limits', description: 'Cap requests per user and per model to protect shared capacity.' },
  { icon: UsersIcon, title: 'Groups and access', description: 'Decide which user groups can reach which channels.' },
  { icon: WalletIcon, title: 'Balance and top-ups', description: 'Pay as you go with online top-ups or redemption codes.' },
]

export function FeatureSections() {
  return (
    <>
      <FeatureBlock
        cards={ROUTING_CARDS}
        description="Every request finds a healthy upstream. Balance load across channels and fail over without touching your code."
        eyebrow="Routing"
        id="landing-routing"
        link={{ to: '/models', label: 'Browse the model catalogue' }}
        title="Route every request"
        visual={<RoutingVisual />}
      />
      <FeatureBlock
        cards={ANALYTICS_CARDS}
        description="See exactly what each model, key and request costs, as it happens."
        eyebrow="Analytics"
        id="landing-analytics"
        link={{ to: '/pricing', label: 'See model pricing' }}
        reversed
        title="See where the money goes"
        visual={<SpendVisual />}
      />
      <FeatureBlock
        cards={CONTROL_CARDS}
        description="Decide who can call what, how often, and how much they can spend."
        eyebrow="Governance"
        id="landing-governance"
        link={{ to: '/dashboard', label: 'Open the console' }}
        title="Stay in control"
        visual={<KeyVisual />}
      />
    </>
  )
}
