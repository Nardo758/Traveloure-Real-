/**
 * experiences-rail.tsx — "What people are planning" (landing-build Phase 2.5), DEGRADED.
 * Visual of record: docs/design/landing-earn-mock.html "EXPERIENCES: photo-led, no borders".
 *
 * The mock's full section ranks occasions by an `experience_starts` rollup and runs a
 * starts ticker above the rail. Phase 0 CONFIRMED that rollup does not exist (zero
 * references repo-wide), so this ships the mock's own degraded contract: STATIC curated
 * order, ticker hidden, and — §13 — no starts counts, no ranks, no "trending" arrows:
 * those are claims only the rollup can make. Cards link to /experiences/:slug (real
 * routes). When the rollup lands (filed, not built here), the live rail + ticker replace
 * this ordering and the rail joins the shared rotation utility.
 */
import { Link } from "wouter";
import { SectionHeader, OpenSection } from "./section-header";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// Curated order (the mock's five), slugs verified against /experiences/:slug routes.
const CURATED_EXPERIENCES = [
  { title: "Date nights", note: "romantic", slug: "date-night", bg: "linear-gradient(135deg,#E5C6B6,#B97C7C)" },
  { title: "Weddings", note: "luxury", slug: "wedding", bg: "linear-gradient(135deg,#B9C8D8,#7C97B4)" },
  { title: "Proposals", note: "surprise", slug: "proposal", bg: "linear-gradient(135deg,#F3E2B8,#D2A24C)" },
  { title: "Celebrations", note: "party", slug: "birthday", bg: "linear-gradient(135deg,#CFE3D3,#6FA383)" },
  { title: "Travel", note: "culture", slug: "travel", bg: "linear-gradient(135deg,#C9D3DC,#8A9AAA)" },
];

export function ExperiencesRail() {
  return (
    <OpenSection testId="section-experiences">
      <SectionHeader
        eyebrow="Popular on Traveloure"
        title="What people are planning"
        link={{ label: "See all experiences →", href: "/experiences/travel", testId: "link-see-all-experiences" }}
      />
      {/* Ticker deliberately absent: it reads experience_starts, which does not exist yet. */}
      <div className="grid gap-[22px] sm:grid-cols-2 lg:grid-cols-5" data-testid="experiences-rail">
        {CURATED_EXPERIENCES.map((exp) => (
          <Link
            key={exp.slug}
            href={`/experiences/${exp.slug}`}
            className="group block"
            data-testid={`experience-card-${exp.slug}`}
          >
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
