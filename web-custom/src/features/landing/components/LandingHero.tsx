import ArrowRightIcon from 'lucide-react/dist/esm/icons/arrow-right'
import BookOpenIcon from 'lucide-react/dist/esm/icons/book-open'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import modelsOneMark from '@/assets/models-one-mark.png'

export function LandingHero() {
  const { t } = useTranslation()

  return (
    <section className="mx-auto grid min-h-[700px] max-w-[1440px] items-center gap-12 px-4 pb-16 pt-32 sm:px-8 lg:grid-cols-[1.06fr_0.94fr] lg:px-12 lg:pb-10 lg:pt-36">
      <div className="relative z-10 max-w-[720px]">
        <div className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-[#171b27] px-4 py-1.5">
          <span aria-hidden="true" className="landing-status-dot size-2 rounded-full bg-[#00f0ff]" />
          <span className="text-xs font-semibold uppercase text-[#00f0ff]">{t('Now in Public Beta')}</span>
        </div>

        <h1 className="max-w-[760px] text-5xl font-extrabold leading-[1.08] text-[#dfe2f2] sm:text-6xl lg:text-[72px]">
          {t('Unified API Gateway for a')}
          <span className="mt-2 block bg-gradient-to-r from-[#00f0ff] via-[#52b6ff] to-[#a855f7] bg-clip-text text-transparent [text-shadow:0_0_20px_rgba(0,240,255,0.14)]">
            {t('Vast Range of AI Models')}
          </span>
        </h1>

        <p className="mt-7 max-w-2xl text-base leading-7 text-[#b9cacb] sm:text-lg">
          {t('Integrate, orchestrate, and deploy top-tier AI models through a single, high-performance endpoint. Built for developers who demand speed, reliability, and scale.')}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Link
            className="inline-flex min-h-13 items-center justify-center gap-2 rounded-[6px] bg-[#00f0ff] px-7 py-3.5 text-sm font-bold text-[#05070a] transition-[box-shadow,background-color] hover:bg-[#7df4ff] hover:shadow-[0_0_22px_rgba(0,240,255,0.48)]"
            to="/dashboard"
          >
            {t('Start Building Free')}
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
          <a
            className="inline-flex min-h-13 items-center justify-center gap-2 rounded-[6px] border border-white/10 bg-[#0f131e]/70 px-7 py-3.5 text-sm font-semibold text-foreground transition-[border-color,color,background-color] hover:border-[#00f0ff]/40 hover:bg-[#171b27] hover:text-[#00f0ff]"
            href="#integration"
          >
            <BookOpenIcon aria-hidden="true" className="size-4" />
            {t('Read Documentation')}
          </a>
        </div>

        <dl className="mt-10 grid max-w-[630px] grid-cols-2 border-t border-white/20 pt-6 sm:max-w-[520px]">
          <div>
            <dd className="text-2xl font-bold text-[#00f0ff]">99.99%</dd>
            <dt className="mt-1 text-[10px] font-semibold uppercase text-[#b9cacb]">{t('Uptime SLA')}</dt>
          </div>
          <div className="border-l border-white/10 pl-6">
            <dd className="text-2xl font-bold text-[#dfe2f2]">Sub-50ms</dd>
            <dt className="mt-1 text-[10px] font-semibold uppercase text-[#b9cacb]">{t('Global Latency')}</dt>
          </div>
        </dl>
      </div>

      <div className="landing-logo-stage relative mx-auto grid aspect-square w-full max-w-[560px] place-items-center" aria-hidden="true">
        <div className="landing-orbit landing-orbit-outer absolute size-[88%] rounded-full border border-[#00f0ff]/10" />
        <div className="landing-orbit landing-orbit-inner absolute size-[70%] rounded-full border border-white/10" />
        <div className="absolute size-[78%] rounded-[8px] border border-[#00f0ff]/15 bg-[#05070a]/60" />
        <div className="absolute size-[62%] rounded-[8px] border border-white/15 bg-[#080c14]/86 shadow-[inset_0_0_42px_rgba(0,240,255,0.035)]" />
        <div className="landing-logo-float relative z-10 size-[58%]">
          <img alt="" className="size-full object-contain drop-shadow-[0_0_34px_rgba(0,240,255,0.3)]" src={modelsOneMark} />
        </div>
      </div>
    </section>
  )
}
