import { LandingHero } from "@/components/landing/landing-hero";
import { MomentsSlot } from "@/components/landing/moments-slot";
import { HowItWorks } from "@/components/landing/how-it-works";
import { EventsStrip } from "@/components/landing/events-strip";
import { CitiesRail } from "@/components/landing/cities-rail";
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

      {/* Hero — behaviour contract docs/design/LANDING_SPEC.md; Plan-my-trip opens the one
          planning modal, and a billboard tile's "Start this plan" opens it pre-set. */}
      <LandingHero onPlanTrip={() => open()} onStartPlan={(source) => open(source)} />

      {/* Ruled order (landing reorder, ledger `2026-09-28-landing-reorder`): hero with the
          "Where do you want to begin?" pills -> the one-line How-it-works strip -> Some trips are
          one evening (MomentsSlot) -> Coming up in our cities (absent below three events) ->
          Cities with momentum -> Know a city well -> closing call to action. Removed by that
          ruling: the eight-tile entry section, the four-column how-it-works with its price rows,
          the Plus band and the numbers strip. No empty section and no placeholder on the page. */}
      <HowItWorks />
      <MomentsSlot />
      <EventsStrip onPlanAround={(source) => open(source)} />
      <CitiesRail />
      <EarnSection />
      <FinalCta onPlanTrip={() => open()} />
    </div>
  );
}
