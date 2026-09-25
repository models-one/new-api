import { CapabilitiesSection } from '@/features/landing/components/CapabilitiesSection'
import { LandingFooter } from '@/features/landing/components/LandingFooter'
import { LandingHeader } from '@/features/landing/components/LandingHeader'
import { LandingHero } from '@/features/landing/components/LandingHero'

export function LandingPage() {
  return (
    <div className="landing-page min-h-screen text-foreground">
      <LandingHeader />
      <main>
        <LandingHero />
        <CapabilitiesSection />
      </main>
      <LandingFooter />
    </div>
  )
}
