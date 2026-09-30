import CheckIcon from 'lucide-react/dist/esm/icons/check'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Tabs } from '@/components/disclosure/Tabs'
import { CopyButton } from '@/components/ui/CopyButton'
import { SectionHeading } from '@/features/landing/components/SectionHeading'
import { pricingQuery } from '@/lib/api/pricing'
import { serverStatusQuery } from '@/lib/api/status'

const FALLBACK_MODEL = 'gpt-4o-mini'

const HIGHLIGHTS = [
  'Works with the OpenAI SDKs you already use',
  'One key reaches every model in the catalogue',
  'Streaming, tool calls and vision pass straight through',
] as const

export function IntegrateSection() {
  const { t } = useTranslation()
  // `server_address` is what the operator configured; without one, the address the
  // visitor reached this page on is the best guess at the public API origin.
  const serverAddress = useQuery(serverStatusQuery()).data?.server_address?.trim() ?? ''
  const origin = serverAddress === '' ? window.location.origin : serverAddress.replace(/\/+$/, '')
  const apiBaseUrl = `${origin}/v1`
  const model = useQuery(pricingQuery()).data?.data?.[0]?.model_name ?? FALLBACK_MODEL

  const samples = [
    {
      value: 'python',
      label: 'Python',
      code: `from openai import OpenAI

client = OpenAI(
    base_url="${apiBaseUrl}",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`,
    },
    {
      value: 'node',
      label: 'Node.js',
      code: `import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '${apiBaseUrl}',
  apiKey: process.env.API_KEY,
})

const response = await client.chat.completions.create({
  model: '${model}',
  messages: [{ role: 'user', content: 'Hello!' }],
})
console.log(response.choices[0].message.content)`,
    },
    {
      value: 'curl',
      label: 'cURL',
      code: `curl ${apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
    },
  ]

  return (
    <section aria-labelledby="landing-integrate" className="landing-deferred-section px-4 py-24 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHeading
            description={t('Point any OpenAI-compatible SDK at this gateway. Change the base URL and the key — nothing else.')}
            eyebrow={t('Integration')}
            id="landing-integrate"
            title={t('Integrate in a minute')}
          />
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li className="flex items-start gap-3 text-sm text-[#dfe2f2]" key={item}>
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#90b6a0]/15 text-[#90b6a0]">
                  <CheckIcon aria-hidden="true" className="size-3.5" />
                </span>
                {t(item)}
              </li>
            ))}
          </ul>
        </div>

        <div className="landing-reveal overflow-hidden rounded-[8px] border border-white/10 bg-[#191b1e] [--landing-step:1]">
          <Tabs defaultValue="python">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4">
              <Tabs.List className="border-b-0" label={t('Code sample language')}>
                {samples.map((sample) => (
                  <Tabs.Tab key={sample.value} value={sample.value}>
                    {sample.label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </div>
            {samples.map((sample) => (
              <Tabs.Panel className="relative" key={sample.value} value={sample.value}>
                <CopyButton
                  className="absolute right-3 top-3"
                  label={t('Copy code')}
                  size="icon-sm"
                  value={sample.code}
                  variant="quiet"
                />
                <pre className="mono overflow-x-auto p-5 pr-14 text-[13px] leading-6 text-[#dfe2f2]">
                  <code>{sample.code}</code>
                </pre>
              </Tabs.Panel>
            ))}
          </Tabs>
        </div>
      </div>
    </section>
  )
}
