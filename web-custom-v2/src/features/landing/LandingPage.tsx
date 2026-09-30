import { ClosingCta } from '@/features/landing/components/ClosingCta'
import { FaqSection } from '@/features/landing/components/FaqSection'
import { FeatureSections } from '@/features/landing/components/FeatureSections'
import { IntegrateSection } from '@/features/landing/components/IntegrateSection'
import { LandingFooter } from '@/features/landing/components/LandingFooter'
import { LandingHeader } from '@/features/landing/components/LandingHeader'
import { LandingHero } from '@/features/landing/components/LandingHero'
import { ProviderStrip } from '@/features/landing/components/ProviderStrip'
import { ScrollStatement } from '@/features/landing/components/ScrollStatement'

export function LandingPage() {
  return (
    <div className="landing-page min-h-screen text-foreground">
      <LandingHeader />
      <main>
        <LandingHero />
        <ProviderStrip />
        <ScrollStatement />
        <IntegrateSection />
        <FeatureSections />
        <FaqSection />
        <ClosingCta />
      </main>
      <LandingFooter />
    </div>
  )
}
