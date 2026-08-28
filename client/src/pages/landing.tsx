import { useState } from 'react';
import EnhancedPlanningModal from "@/components/EnhancedPlanningModal";
import { LandingHero } from "@/components/landing/landing-hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { PlusOccasions } from "@/components/landing/plus-occasions";
import { EntryStrips } from "@/components/landing/entry-strips";
import { ExperiencesRail } from "@/components/landing/experiences-rail";
import { CitiesRail } from "@/components/landing/cities-rail";
import { NumbersStrip } from "@/components/landing/numbers-strip";
import { EarnSection } from "@/components/landing/earn-section";
import { FinalCta } from "@/components/landing/final-cta";
import { SEOHead } from "@/components/seo-head";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export default function LandingPage() {
  const [planningOpen, setPlanningOpen] = useState(false);

  const { data: currentUser } = useQuery<{ id: string } | null>({ queryKey: ["/api/auth/user"], queryFn: getQueryFn({ on401: "returnNull" }) });

  return (
    <>
    <div className="flex flex-col min-h-screen bg-background">
      <SEOHead
        title="Home"
        description="Plan unforgettable experiences with Traveloure. From romantic getaways to corporate events, our AI-powered platform connects you with expert travel planners and service providers worldwide."
        keywords={["travel platform", "AI travel planning", "event planning", "vacation booking", "travel services"]}
        url="/"
      />

      {/* HERO v2 (landing-build lane) — visual of record: docs/design/landing-earn-mock.html;
          behavior: docs/design/LANDING_SPEC.md. Plan-my-trip keeps the exact same handler
          (setPlanningOpen(true) → EnhancedPlanningModal). The old photo hero + CityTickerTape
          are replaced by the mock's live bento + beta pill / market caption. */}
      <LandingHero onPlanTrip={() => setPlanningOpen(true)} />

      {/* Ruled section order (LANDING_SPEC.md; the dispatch wins over the mock's DOM order):
          hero -> how-it-works+price -> Plus occasions -> where-to-begin -> experiences
          (degraded) -> cities rail -> numbers -> ways to earn -> final CTA. The old
          Experience-Categories / How-It-Works / stats / Testimonials / Earn-CTA / Final
          sections are replaced by these; the testimonials rail was already hidden until
          admin-curated reviews existed and the mock carries no testimonials section —
          revisit only with a ruling once curated reviews exist. */}
      <HowItWorks />
      <PlusOccasions />
      <EntryStrips />
      <ExperiencesRail />
      <CitiesRail />
      <NumbersStrip />
      <EarnSection />
      <FinalCta onPlanTrip={() => setPlanningOpen(true)} />
    </div>

    {planningOpen && (
      <EnhancedPlanningModal
        isOpen={planningOpen}
        onClose={() => setPlanningOpen(false)}
        userId={currentUser?.id || ""}
      />
    )}
    </>
  );
}
