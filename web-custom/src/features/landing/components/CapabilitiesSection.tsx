import CodeXmlIcon from 'lucide-react/dist/esm/icons/code-xml'
import NetworkIcon from 'lucide-react/dist/esm/icons/network'
import WaypointsIcon from 'lucide-react/dist/esm/icons/waypoints'
import { useTranslation } from 'react-i18next'

const providerModels = [
  { color: 'bg-[#35d6a0]', name: 'GPT-4o' },
  { color: 'bg-[#f0a35d]', name: 'Claude 3.5' },
  { color: 'bg-[#70a5ff]', name: 'Llama 3' },
]

export function CapabilitiesSection() {
  const { t } = useTranslation()

  return (
    <section className="landing-deferred-section mx-auto max-w-[1440px] px-4 py-20 sm:px-8 lg:px-12 lg:pb-24 lg:pt-12" id="capabilities">
      <div className="mb-10 lg:mb-12">
        <h2 className="text-3xl font-bold text-[#dfe2f2] sm:text-4xl lg:text-5xl">{t('Scale Without Friction')}</h2>
        <p className="mt-4 text-base text-[#b9cacb] sm:text-lg">{t('One integration gives you access to the entire AI ecosystem.')}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:auto-rows-[280px] lg:gap-6">
        <article className="landing-bento group relative flex min-h-[300px] flex-col justify-between overflow-hidden p-6 md:col-span-2 md:min-h-0 lg:p-8">
          <div className="relative z-10">
            <NetworkIcon aria-hidden="true" className="mb-5 size-8 text-[#00f0ff]" />
            <h3 className="text-3xl font-bold text-[#dfe2f2] sm:text-4xl">{t('100+ Model Support')}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#b9cacb] sm:text-base">
              {t('Instantly switch between OpenAI, Anthropic, Meta, Mistral, and specialized open-source models with a single parameter change.')}
            </p>
          </div>
          <ul aria-label={t('Models')} className="relative z-10 mt-7 flex flex-wrap gap-3 text-xs text-[#dfe2f2] sm:text-sm">
            {providerModels.map((model) => (
              <li className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2" key={model.name}>
                <span aria-hidden="true" className={`size-2 rounded-full ${model.color}`} />
                {model.name}
              </li>
            ))}
          </ul>
        </article>

        <article className="landing-bento flex min-h-[240px] flex-col justify-between p-6 md:min-h-0 lg:p-8">
          <div>
            <WaypointsIcon aria-hidden="true" className="mb-5 size-8 text-[#a855f7]" />
            <h3 className="text-2xl font-bold text-[#dfe2f2] sm:text-3xl">{t('50+ Upstream Services')}</h3>
          </div>
          <p className="mt-6 text-sm leading-6 text-[#b9cacb]">
            {t('Automated load balancing and failover across multiple providers ensures your application never goes down.')}
          </p>
        </article>

        <article className="landing-bento relative flex min-h-[240px] flex-col justify-between overflow-hidden p-6 md:min-h-0 lg:p-8">
          <div className="relative z-10">
            <CodeXmlIcon aria-hidden="true" className="mb-5 size-8 text-[#00f0ff]" />
            <h3 className="text-2xl font-bold text-[#dfe2f2] sm:text-3xl">{t('Drop-in Replacement')}</h3>
          </div>
          <p className="relative z-10 mt-6 text-sm leading-6 text-[#b9cacb]">
            {t("Fully compatible with standard OpenAI SDKs. Change your base URL and API key, and you're ready.")}
          </p>
          <CodeXmlIcon aria-hidden="true" className="absolute -bottom-2 right-3 size-24 text-white/[0.035]" />
        </article>

        <article className="landing-code-card min-h-[350px] overflow-hidden md:col-span-2 md:min-h-0" id="integration">
          <div className="flex h-11 items-center gap-2 border-b border-white/10 bg-[#0b0f1a] px-4">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[#e55454]" />
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[#d8ad35]" />
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[#35b969]" />
            <span className="ml-3 font-mono text-xs text-[#b9cacb]">integration.ts</span>
          </div>
          <div className="overflow-x-auto p-5 sm:p-6">
            <pre className="font-mono text-[12px] leading-6 text-[#b9cacb] sm:text-[13px]"><code><span className="text-[#a855f7]">import</span>{' { OpenAI } '}<span className="text-[#a855f7]">from</span>{' '}<span className="text-[#6ee7a8]">'openai'</span>{';\n\n'}<span className="text-[#849495]">// Simply point to Models.one gateway</span>{'\n'}<span className="text-[#a855f7]">const</span>{' client = '}<span className="text-[#00f0ff]">new</span>{' OpenAI({\n  baseURL: '}<span className="text-[#6ee7a8]">'https://api.models.one/v1'</span>{',\n  apiKey: process.env.'}<span className="text-[#70a5ff]">MODELS_ONE_API_KEY</span>{',\n});\n\n'}<span className="text-[#a855f7]">const</span>{' response = '}<span className="text-[#00f0ff]">await</span>{' client.chat.completions.'}<span className="text-[#70a5ff]">create</span>{'({\n  model: '}<span className="text-[#6ee7a8]">'anthropic/claude-3-opus'</span>{',\n  messages: [{ role: '}<span className="text-[#6ee7a8]">'user'</span>{', content: '}<span className="text-[#6ee7a8]">'Initialize core systems.'</span>{' }],\n});'}</code></pre>
          </div>
        </article>
      </div>
    </section>
  )
}
