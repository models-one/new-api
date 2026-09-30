import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

export function ScrollStatement() {
  const { t } = useTranslation()
  const statement = t(
    'Stop juggling provider keys, SDKs and invoices. One gateway routes every request, fails over when a provider breaks, and shows what every call costs.',
  )
  // Languages written without spaces light up one character at a time.
  const spaced = statement.includes(' ')
  const words = spaced ? statement.split(' ') : Array.from(statement)

  return (
    <section className="landing-statement px-4 sm:px-8 lg:px-12">
      <div className="landing-statement-pin mx-auto grid max-w-[1000px] place-items-center py-28">
        <p
          className="text-3xl font-bold leading-snug text-[#dfe2f2] sm:text-4xl lg:text-5xl lg:leading-tight"
          style={{ '--landing-word-count': words.length } as CSSProperties}
        >
          {words.map((word, index) => (
            // The sentence never reorders, so a word's position is its identity.
            // oxlint-disable-next-line react/no-array-index-key
            <span className="landing-statement-word" key={index} style={{ '--landing-word-index': index } as CSSProperties}>
              {spaced && index < words.length - 1 ? `${word} ` : word}
            </span>
          ))}
        </p>
      </div>
    </section>
  )
}
