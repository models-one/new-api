import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { pricingQuery } from '@/lib/api/pricing'

const MAX_VENDORS = 12

/** The vendors this deployment actually serves, read from the live catalogue. */
export function VendorWall() {
  const { t } = useTranslation()
  const pricing = useQuery(pricingQuery()).data
  const models = pricing?.data ?? []
  const vendors = (pricing?.vendors ?? [])
    .map((vendor) => ({
      name: vendor.name.trim(),
      modelCount: models.filter((model) => model.vendor_id === vendor.id).length,
    }))
    .filter((vendor) => vendor.name !== '' && vendor.modelCount > 0)
    .sort((left, right) => right.modelCount - left.modelCount)
    .slice(0, MAX_VENDORS)

  // Nothing is claimed before the catalogue says what is served.
  if (vendors.length === 0) return null

  return (
    <section aria-labelledby="home-vendors" className="border-y border-[var(--home-line)] bg-[var(--home-paper)] px-4 py-16 sm:px-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <h2 className="text-2xl font-bold text-[var(--home-ink)] sm:text-3xl" id="home-vendors">
            {t('Vendors on this platform')}
          </h2>
          <Link className="text-sm font-semibold text-[var(--home-blue)] hover:underline" to="/models">
            {t('See every model')}
          </Link>
        </div>

        {/* Shared hairlines rather than separate cards: this is one table of vendors, not a set of offers. */}
        <ul className="mt-8 grid grid-cols-2 overflow-hidden rounded-[10px] border border-[var(--home-line)] sm:grid-cols-3 lg:grid-cols-4">
          {vendors.map((vendor) => (
            <li
              className="-mb-px -mr-px border-b border-r border-[var(--home-line)] px-5 py-5"
              key={vendor.name}
            >
              <p className="truncate text-base font-bold text-[var(--home-ink)]">{vendor.name}</p>
              <p className="mt-1 text-sm text-[var(--home-faint)]">
                {t('{{count}} models', { count: vendor.modelCount })}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
