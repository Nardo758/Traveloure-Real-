import { LandingHero } from "@/components/landing/landing-hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { EntryStrips } from "@/components/landing/entry-strips";
import { ExperiencesRail } from "@/components/landing/experiences-rail";
import { CitiesRail } from "@/components/landing/cities-rail";
import { NumbersStrip } from "@/components/landing/numbers-strip";
import { EarnSection } from "@/components/landing/earn-section";
import { FinalCta } from "@/components/landing/final-cta";
import { SEOHead } from "@/components/seo-head";
import { usePlanning } from "@/contexts/PlanningContext";

export default function LandingPage() {
  // Single planning entry (ruling 2026-08-28-single-planning-entry): the hero and
  // final CTA open the global chooser; the AI flow (the former direct
  // EnhancedPlanningModal mount here) is now the chooser's "Plan with AI" branch,
  // rendered once by PlanningProvider.
  const { open } = usePlanning();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <SEOHead
        title="Home"
        description="Plan unforgettable experiences with Traveloure. From romantic getaways to corporate events, our AI-powered platform connects you with expert travel planners and service providers worldwide."
        keywords={["travel platform", "AI travel planning", "event planning", "vacation booking", "travel services"]}
        url="/"
      />

      {/* HERO v2 (landing-build lane) — visual of record: docs/design/landing-earn-mock.html;
          behavior: docs/design/LANDING_SPEC.md, amended by the single-planning-entry ruling:
          Plan-my-trip opens the global chooser. The old photo hero + CityTickerTape
          are replaced by the mock's live bento + beta pill / market caption. */}
      <LandingHero onPlanTrip={() => open()} />

      {/* Ruled section order (LANDING_SPEC.md v2.5): hero -> [Moments (Lane 2, position 2)] ->
          how-it-works+price (with the Plus BAND folded in, ruling 2026-09-01-plus-in-pricing —
          the standalone PlusOccasions section is removed) -> where-to-begin -> experiences
          (degraded; absorbed into Moments in Lane 2) -> cities rail -> numbers -> ways to earn
          -> final CTA. The testimonials rail stays hidden until admin-curated reviews exist. */}
      <HowItWorks />
      <EntryStrips />
      <ExperiencesRail />
      <CitiesRail />
      <NumbersStrip />
      <EarnSection />
      <FinalCta onPlanTrip={() => open()} />
    </div>
  );
}
