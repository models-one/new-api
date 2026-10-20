import { useTranslation } from 'react-i18next'

// A real sequence, so the steps are numbered.
const STEPS = [
  {
    title: 'Create an account',
    description: 'Register, then top up as much as you need.',
  },
  {
    title: 'Create an API key',
    description: 'Give each project its own key, with its own spending limit, expiry date and allowed models.',
  },
  {
    title: 'Point your SDK at this site',
    description: 'Set base_url to this site’s address. The rest of your OpenAI SDK code stays as it is.',
  },
] as const

export function QuickStart() {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="home-quick-start" className="px-4 py-20 sm:px-8 lg:py-24">
      <div className="mx-auto max-w-[1200px]">
        <h2 className="text-2xl font-bold text-[var(--home-ink)] sm:text-3xl" id="home-quick-start">
          {t('Three steps to your first request')}
        </h2>

        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, index) => (
            <li className="border-t-2 border-[var(--home-blue)] pt-5" key={step.title}>
              <span className="text-sm font-bold tabular-nums text-[var(--home-blue)]">{index + 1}</span>
              <h3 className="mt-2 text-lg font-bold text-[var(--home-ink)]">{t(step.title)}</h3>
              <p className="mt-2 text-[15px] leading-7">{t(step.description)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
