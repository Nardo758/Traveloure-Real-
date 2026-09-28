import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { motion } from "framer-motion";
import { PageLayout, PAGE_ACTION, SectionTitle, HEADING_STYLE } from "@/components/company/company-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plane, Heart, Gem, Diamond, HeartHandshake, Cake, Briefcase, Users, Sparkles, Calendar,
  ArrowRight, Star, MapPin, Clock, ChevronRight
} from "lucide-react";
import type { ExperienceType } from "@shared/schema";
import { SEOHead } from "@/components/seo-head";
import { IntakePanel } from "@/components/intake-panel";
// The ONE word for this action (ledger `2026-09-04-entry-unification`). This page's CTA said
// "Start a new plan" while every other entry said `START_PLAN_LABEL` — the exact three-words-for-
// one-action drift that constant exists to prevent (§18 rule 1). The button keeps its
// `data-testid`; only the copy is now derived.
import { START_PLAN_LABEL } from "@/lib/plan-vocabulary";

// Step counts per experience type
const stepCounts: Record<string, number> = {
  "travel": 5,
  "wedding": 14,
  "proposal": 10,
  "romance": 5,
  "birthday": 8,
  "corporate": 7,
  "boys-trip": 8,
  "girls-trip": 11,
};

const iconMap: Record<string, any> = {
  Plane: Plane,
  Heart: Heart,
  Gem: Gem,
  Diamond: Diamond,
  HeartHandshake: HeartHandshake,
  Cake: Cake,
  Briefcase: Briefcase,
  Users: Users,
  Sparkles: Sparkles,
  Calendar: Calendar,
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function Experiences() {
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const destinationParam = searchParams.get("destination");
  const countryParam = searchParams.get("country");
  const multiCityParam = searchParams.get("multiCity");
  const destinationsParam = searchParams.get("destinations");

  // Ruling 2026-08-28-single-planning-entry, extended by the walkthrough harness'
  // finding F-T1 (2026-08-30): a ROUTE never auto-opens the planning chooser/intake.
  // /experiences is a real, routed browse surface FIRST — the intake panel opens only
  // from this page's own CTA or an explicit ?plan=1 deep-link, never on bare arrival, so
  // a traveler who navigated here to browse is never blocked by a modal they didn't ask
  // for (the dead-end class the single-entry lane exists to remove).
  const [intakeOpen, setIntakeOpen] = useState(() => searchParams.get("plan") === "1");

  const { data: experienceTypes, isLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
  });
  
  const buildExperienceLink = (slug: string) => {
    const params = new URLSearchParams();
    if (destinationParam) params.set("destination", destinationParam);
    if (countryParam) params.set("country", countryParam);
    if (multiCityParam) params.set("multiCity", multiCityParam);
    if (destinationsParam) params.set("destinations", destinationsParam);
    const queryString = params.toString();
    return `/experiences/${slug}/new${queryString ? `?${queryString}` : ""}`;
  };

  return (
    <>
      <SEOHead 
        title="Experiences"
        description="Explore curated experience templates for weddings, travel, proposals, birthdays, corporate events, and more. Plan your perfect experience with expert guidance."
        keywords={["experience planning", "wedding planning", "trip templates", "event templates", "birthday planning", "corporate events"]}
        url="/experiences"
      />
      {/* Footer-pages ruling (Sep 28, 2026): the public layout for everyone — this page used to
          wrap itself in DashboardLayout, so a signed-out visitor saw the console sidebar. */}
      <PageLayout
        eyebrow="Occasions"
        title="Plan Your Perfect Experience"
        testId="page-experiences"
        lead={
          <>
            <p className="text-muted-foreground">
              Choose from 8 curated experience templates. Our guided wizards help you plan every detail,
              connect with expert providers, and create unforgettable moments.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Interactive Maps</span>
              <span className="flex items-center gap-2"><Star className="h-4 w-4 text-primary" />Expert Providers</span>
              <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />Step-by-Step Guidance</span>
            </div>
          </>
        }
        actions={
          <Button
            onClick={() => setIntakeOpen(true)}
            className={PAGE_ACTION.primary}
            data-testid="button-experiences-start-plan"
          >
            {START_PLAN_LABEL}
            <ArrowRight className="h-4 w-4" />
          </Button>
        }
      >
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-12 w-12 rounded-full mb-4" />
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full mb-4" />
                <Skeleton className="h-4 w-1/2" />
              </Card>
            ))}
          </div>
        ) : (
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {experienceTypes?.map((type) => {
              const IconComponent = type.icon ? iconMap[type.icon] || Sparkles : Sparkles;
              const totalSteps = stepCounts[type.slug] || 5;
              return (
                <motion.div key={type.id} variants={cardVariants}>
                  <Link href={buildExperienceLink(type.slug)}>
                    <Card 
                      className="group relative overflow-visible h-full cursor-pointer transition-all duration-300 hover-elevate"
                      data-testid={`card-experience-${type.slug}`}
                    >
                      <div className="p-6">
                        {/* One accent: the per-occasion colour column is no longer painted
                            (footer-pages ruling — brand tokens only, no second accent). */}
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--earn-coral-bg)] transition-transform group-hover:scale-110">
                          <IconComponent className="h-6 w-6 text-[color:var(--earn-coral-ink)]" />
                        </div>
                        <h3 className="mb-2 flex items-center gap-2 text-[18px] font-semibold" style={HEADING_STYLE}>
                          {type.name}
                          <ChevronRight className="h-4 w-4 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0 text-muted-foreground" />
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                          {type.description}
                        </p>
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">
                            {totalSteps} steps
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-[color:var(--earn-coral-ink)] transition-transform group-hover:translate-x-1" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        <Card className="p-8 text-center" style={{ background: "var(--earn-chip)" }}>
          <SectionTitle className="mb-2">Need Help Deciding?</SectionTitle>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            Connect with our local experts and trip planners who specialise in different experience types.
            They can help you choose and plan the perfect experience.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/experts" className={PAGE_ACTION.primary} data-testid="button-find-expert">
              Find an Expert
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/discover" className={PAGE_ACTION.secondary} data-testid="button-help-decide">
              Explore Packages
            </Link>
          </div>
        </Card>
      </PageLayout>

      {/* Locked Decision 42 (D13), ledger `2026-09-05-doors-source-fields`: A DOOR PASSES WHAT IT
          HOLDS. This page already parses `?destination=` and `?country=` — `buildExperienceLink`
          threads both into every card link — and then handed the intake panel nothing, so a
          traveler arriving from a city surface was asked for the city they had just come from.
          `destinationParam` is a CITY-shaped value here (it is what the city surfaces put on the
          query string); it is passed through verbatim and nothing is parsed out of it (§13).
          `null` from `URLSearchParams.get` becomes `undefined` — an absent prop is how the panel is
          told "not known", never an empty string standing in for an answer.

          PROPS ONLY: Locked Decision 42 (D11) collapses this panel into the ONE modal and turns its
          mounts into doors of it. That is a wave-3 lane and is NOT started here. */}
      <IntakePanel
        open={intakeOpen}
        onOpenChange={setIntakeOpen}
        city={destinationParam ?? undefined}
        country={countryParam ?? undefined}
      />
    </>
  );
}
