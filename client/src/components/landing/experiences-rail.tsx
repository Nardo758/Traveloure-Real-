/**
 * experiences-rail.tsx — "Recent plans in {marquee city}" (R3-12, round 3 ruling, Nov 5, 2026; ledger
 * `2026-11-05-r3-entry-city`). Formerly "What people are planning" with an "On Traveloure now" eyebrow and a static
 * curated order, which read like a popularity feed.
 * Visual of record: docs/design/landing-earn-mock.html "EXPERIENCES: photo-led, no borders".
 *
 * The occasions are the ONE shared list (`RECENT_PLANS_OCCASION_SLUGS`), ordered by their newest plan in the marquee
 * market (`GET /api/landing/recent-plans`). §13: no count, rank, eyebrow or "trending" cue; an occasion with no recent
 * plan is not drawn, and until the order answers (or when nothing was planned) the rail draws nothing. Cards link to
 * /experiences/:slug (real routes).
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SectionHeader, OpenSection } from "./section-header";
import { useMarqueeMarket } from "@/lib/signup-mode";
import { recentPlansHeading, RECENT_PLANS_OCCASION_SLUGS, type RecentPlansOccasionSlug } from "@shared/landing-recent-plans";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// Presentation per slug (the mock's five); the order comes from the server.
export const RECENT_PLAN_CARDS: Record<RecentPlansOccasionSlug, { title: string; note: string; bg: string }> = {
  "date-night": { title: "Date nights", note: "romantic", bg: "var(--landing-swatch-date-night)" },
  wedding: { title: "Weddings", note: "luxury", bg: "var(--landing-swatch-wedding)" },
  proposal: { title: "Proposals", note: "surprise", bg: "var(--landing-swatch-proposal)" },
  birthday: { title: "Celebrations", note: "party", bg: "var(--landing-swatch-birthday)" },
  travel: { title: "Travel", note: "culture", bg: "var(--landing-swatch-travel)" },
};

/** Pure: the cards to draw for a server order (unknown slugs dropped, order kept). */
export function recentPlanCards(order: readonly string[] | null | undefined): Array<{ slug: RecentPlansOccasionSlug; title: string; note: string; bg: string }> {
  const allowed = new Set<string>(RECENT_PLANS_OCCASION_SLUGS);
  return (order ?? []).filter((s): s is RecentPlansOccasionSlug => allowed.has(s)).map((slug) => ({ slug, ...RECENT_PLAN_CARDS[slug] }));
}

export function ExperiencesRailView({ city, order }: { city: string; order: readonly string[] | null | undefined }) {
  const cards = recentPlanCards(order);
  if (cards.length === 0) return null;
  return (
    <OpenSection testId="section-experiences">
      <SectionHeader
        title={recentPlansHeading(city)}
        link={{ label: "See all experiences →", href: "/experiences/travel", testId: "link-see-all-experiences" }}
      />
      <div className="grid gap-[22px] sm:grid-cols-2 lg:grid-cols-5" data-testid="experiences-rail">
        {cards.map((exp) => (
          <Link key={exp.slug} href={`/experiences/${exp.slug}`} className="group block" data-testid={`experience-card-${exp.slug}`}>
            <div className="h-[110px] rounded-[12px]" style={{ background: exp.bg }} />
            <b className="mt-2 block text-[14px]" style={{ color: "var(--earn-ink)" }}>
              {exp.title}
            </b>
            <small className="text-[10.5px]" style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}>
              {exp.note}
            </small>
          </Link>
        ))}
      </div>
    </OpenSection>
  );
}

export function ExperiencesRail() {
  const marquee = useMarqueeMarket();
  const { data } = useQuery<{ occasions: string[] }>({
    queryKey: [`/api/landing/recent-plans?market=${encodeURIComponent(marquee.slug)}`],
    staleTime: 5 * 60_000,
  });
  return <ExperiencesRailView city={marquee.cityName} order={data?.occasions} />;
}
