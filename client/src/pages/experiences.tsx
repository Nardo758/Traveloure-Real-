/**
 * /experiences — THE START STATE (step 8a, ledger `2026-10-06-step8a-experiences-entry`; step 8 brief rev
 * 3.1, 8a items 2, 3 and 6; board `docs/design/experiences-map-planner/Experiences.dc.html`).
 *
 * Two halves, both answered ON the page:
 *   · left  — the ONE occasion picker (`OccasionPicker`, shared with the planning modal's step 1);
 *   · right — Where: the eight operating cities as cards, plus a static Natural Earth map with eight pins
 *     placed from `OPERATING_MARKETS` lat/lng. No Google map on an entry page; nothing billed on load.
 * Continue enables only with both answers and opens the ONE planning modal through the `experiences` door
 * at When (step 8 D1 — Where stays reachable by Back). The route never auto-opens anything (F-T1), so
 * the old `?plan=1` deep-link is gone with the intake panel this page no longer mounts (ruling 1).
 *
 * `?destination=` / `?city=` pre-pick a card only on an EXACT match of the eight (ruling 4).
 * `?destinations=&multiCity=true` (TripQueueIndicator) is ignored; recorded in FOLLOWUPS.md.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { ArrowRight } from "lucide-react";
import type { ExperienceType } from "@shared/schema";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { PageLayout, PAGE_ACTION, HEADING_STYLE, EYEBROW_CLASS, EYEBROW_STYLE } from "@/components/company/company-page";
import { SEOHead } from "@/components/seo-head";
import { OccasionPicker } from "@/components/plan/OccasionPicker";
import { usePlanning } from "@/contexts/PlanningContext";
import {
  WORLD_MAP,
  canContinue,
  cityPhotoFor,
  preselectedGroup,
  preselectedMarket,
  projectToWorldMap,
} from "@/lib/experiences-entry";

export default function Experiences({ occasionSlug: routeSlug = null }: { occasionSlug?: string | null } = {}) {
  const searchString = useSearch();
  const preselect = useMemo(() => preselectedMarket(new URLSearchParams(searchString)), [searchString]);
  // The nav's `?group=` opens that group's tab — an exact key only (ledger `2026-10-07-nav-experience-groups`).
  const preselectGroup = useMemo(() => preselectedGroup(new URLSearchParams(searchString)), [searchString]);
  const { open: openPlanning } = usePlanning();

  const { data: occasions, isLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
  });

  // Step 8b-2 (D5): `/experiences/:slug` arrives with that occasion picked. Only a slug the catalog
  // carries is shown as picked and lets Continue enable (`canContinue`); `photo`, `transport` and the
  // like pick nothing — never a nearest occasion. A visit writes nothing.
  const [occasionSlug, setOccasionSlug] = useState(routeSlug ?? "");
  const [marketKey, setMarketKey] = useState<string | null>(() => preselect?.marketKey ?? null);
  const market = OPERATING_MARKETS.find((m) => m.marketKey === marketKey) ?? null;
  const ready = canContinue(occasionSlug, occasions, marketKey);

  const onContinue = () => {
    if (!ready || !market) return;
    openPlanning({
      door: "experiences",
      experienceSlug: occasionSlug,
      city: market.cityName,
      country: market.country,
      newPlan: true,
      focusStep: "when",
    });
  };

  return (
    <>
      <SEOHead
        title="What are you planning?"
        description="Pick what you're planning — a trip, one evening, a celebration, a hosted event or a group getaway — and one of our eight cities, then plan it with AI, with a local expert, or yourself."
        keywords={["trip planning", "event planning", "wedding planning", "date night", "group trip", "celebration planning"]}
        url="/experiences"
      />
      <PageLayout eyebrow="Start a plan" title="What are you planning?" testId="page-experiences">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* ── Left · the occasion ─────────────────────────────────────────────────────────── */}
          <section aria-labelledby="exp-occasion" data-testid="experiences-occasion">
            <p className={EYEBROW_CLASS} style={EYEBROW_STYLE}>Step 1</p>
            <h2 id="exp-occasion" className="mb-4 text-[22px] font-semibold" style={HEADING_STYLE}>
              The occasion
            </h2>
            <OccasionPicker
              key={preselectGroup ?? "none"}
              occasions={occasions}
              loading={isLoading}
              value={occasionSlug}
              onPick={setOccasionSlug}
              initialGroup={preselectGroup}
            />
          </section>

          {/* ── Right · Where ───────────────────────────────────────────────────────────────── */}
          <section aria-labelledby="exp-where" data-testid="experiences-where">
            <p className={EYEBROW_CLASS} style={EYEBROW_STYLE}>Step 2</p>
            <h2 id="exp-where" className="mb-4 text-[22px] font-semibold" style={HEADING_STYLE}>
              Where
            </h2>

            <figure className="mb-4">
              <div className="relative w-full overflow-hidden rounded-xl border border-border" data-testid="experiences-map">
                <img
                  src={WORLD_MAP.src}
                  width={WORLD_MAP.width}
                  height={WORLD_MAP.height}
                  alt="World map with the eight cities we plan in"
                  className="block h-auto w-full"
                />
                {OPERATING_MARKETS.map((m) => {
                  const { xPct, yPct } = projectToWorldMap(m.lat, m.lng);
                  const picked = m.marketKey === marketKey;
                  return (
                    <button
                      key={m.marketKey}
                      type="button"
                      onClick={() => setMarketKey(m.marketKey)}
                      aria-label={`${m.cityName}, ${m.country}`}
                      aria-pressed={picked}
                      className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${
                        picked ? "bg-primary" : "bg-foreground/70"
                      }`}
                      style={{ left: `${xPct}%`, top: `${yPct}%` }}
                      data-testid={`map-pin-${m.marketKey}`}
                    />
                  );
                })}
              </div>
              <figcaption className="mt-1 text-[11px] text-muted-foreground" data-testid="experiences-map-credit">
                {WORLD_MAP.credit}
              </figcaption>
            </figure>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {OPERATING_MARKETS.map((m) => {
                const picked = m.marketKey === marketKey;
                const photo = cityPhotoFor(m.marketKey);
                return (
                  <button
                    key={m.marketKey}
                    type="button"
                    onClick={() => setMarketKey(m.marketKey)}
                    aria-pressed={picked}
                    className={`flex flex-col overflow-hidden rounded-xl border text-left transition-colors ${
                      picked ? "border-primary ring-2 ring-primary" : "border-border hover:bg-muted"
                    }`}
                    data-testid={`city-card-${m.marketKey}`}
                    data-photo={photo ? "credited" : "none"}
                  >
                    {photo ? (
                      <div className="relative aspect-[4/3] w-full">
                        <img src={photo.src} alt={m.cityName} className="h-full w-full object-cover" loading="lazy" />
                        <span className="absolute bottom-0 right-0 bg-black/55 px-1 text-[9px] text-white">
                          {photo.credit}
                        </span>
                      </div>
                    ) : (
                      // Ruling 3: no photo of this city is in the repo, so the card is typographic —
                      // never stock, never AI, never a Google photo.
                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted px-2">
                        <span className="text-center text-[17px] font-semibold" style={HEADING_STYLE}>
                          {m.cityName}
                        </span>
                      </div>
                    )}
                    <span className="px-2.5 py-2">
                      <span className="block text-sm font-semibold text-foreground">{m.cityName}</span>
                      <span className="block text-xs text-muted-foreground">{m.country}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onContinue}
            disabled={!ready}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="button-experiences-continue"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
          {!ready && (
            <span className="text-sm text-muted-foreground" data-testid="experiences-continue-hint">
              Pick an occasion and a city to continue.
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/experts" className={PAGE_ACTION.secondary} data-testid="button-find-expert">
            Find a local expert
          </Link>
          <Link href="/ready-made" className={PAGE_ACTION.secondary} data-testid="button-browse-ready-made">
            Browse Ready-Made Trips
          </Link>
        </div>
      </PageLayout>
    </>
  );
}
