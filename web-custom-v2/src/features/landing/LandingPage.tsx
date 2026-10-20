import { Capabilities } from '@/features/landing/components/Capabilities'
import { ClosingCta } from '@/features/landing/components/ClosingCta'
import { FaqSection } from '@/features/landing/components/FaqSection'
import { LandingFooter } from '@/features/landing/components/LandingFooter'
import { LandingHeader } from '@/features/landing/components/LandingHeader'
import { LandingHero } from '@/features/landing/components/LandingHero'
import { QuickStart } from '@/features/landing/components/QuickStart'
import { VendorWall } from '@/features/landing/components/VendorWall'

export function LandingPage() {
  return (
    <div className="home min-h-screen">
      <LandingHeader />
      <main>
        <LandingHero />
        <VendorWall />
        <QuickStart />
        <Capabilities />
        <FaqSection />
        <ClosingCta />
      </main>
      <LandingFooter />
    </div>
  )
}
