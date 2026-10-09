/**
 * /experiences — THE START PAGE, with PlanEntry INLINE (E3, ledger `2026-10-09-e3-experiences-inline`;
 * decision-maker rulings 1–4, Oct 9, 2026). Before: step 8a's two halves (`2026-10-06-step8a-experiences-entry`)
 * and Lane E1's zero-question Continue (`2026-10-08-e1-zero-questions`).
 *
 * The page is the SECOND container of the one PlanEntry (the pop-up is the first): the same steps —
 * "Plan around…" a place · a date · an event → the occasion → Start a plan — and the same mint, reached
 * through `usePlanning().start` (ruling 1). A guest's Start a plan writes PlanEntry's sign-in record and
 * opens the guest map; a picked date stamps confirmed dates. There is no Continue and no pop-up hop.
 *
 * The Place picker is the page's own (ruling 2): the static Natural Earth map with eight pins placed from
 * `OPERATING_MARKETS` lat/lng, and the eight city cards — two credited photos, six typographic. No Google
 * map on an entry page; nothing billed on load.
 *
 * Deep links (ruling 3) seed the panel and NEVER start a plan — a visit writes nothing:
 *   `?destination=` / `?city=` pre-pick a city only on an EXACT match of the eight (ruling 4 of 8a);
 *   `/experiences/:slug` carries that occasion (a slug the catalog does not carry is asked, never trusted);
 *   `?group=` opens on that group (an exact key of the five).
 * A city and an occasion together land on Step 2 with Start a plan ready — one click.
 * `?destinations=&multiCity=true` (TripQueueIndicator) is ignored; recorded in FOLLOWUPS.md.
 */
import { useMemo } from "react";
import { Link, useSearch } from "wouter";
import { EXPERIENCES_PAGE_DESCRIPTION, OPERATING_MARKETS } from "@shared/operating-markets";
import { PageLayout, PAGE_ACTION, HEADING_STYLE } from "@/components/company/company-page";
import { SEOHead } from "@/components/seo-head";
import { PlanEntryPanel } from "@/components/plan/PlanEntry";
import { usePlanning } from "@/contexts/PlanningContext";
import type { PlanEntrySource } from "@/lib/plan-entry";
import {
  WORLD_MAP,
  cityPhotoFor,
  preselectedGroup,
  preselectedMarket,
  projectToWorldMap,
} from "@/lib/experiences-entry";

/** The page's Place picker: the world map with eight pins, then the eight city cards. */
function PlacePicker({ picked, pick }: { picked: string | null; pick: (marketKey: string) => void }) {
  return (
    <div className="space-y-4" data-testid="experiences-where">
      <figure>
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
            const on = m.marketKey === picked;
            return (
              <button
                key={m.marketKey}
                type="button"
                onClick={() => pick(m.marketKey)}
                aria-label={`${m.cityName}, ${m.country}`}
                aria-pressed={on}
                className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${
                  on ? "bg-primary" : "bg-foreground/70"
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
          const on = m.marketKey === picked;
          const photo = cityPhotoFor(m.marketKey);
          return (
            <button
              key={m.marketKey}
              type="button"
              onClick={() => pick(m.marketKey)}
              aria-pressed={on}
              className={`flex flex-col overflow-hidden rounded-xl border text-left transition-colors ${
                on ? "border-primary ring-2 ring-primary" : "border-border hover:bg-muted"
              }`}
              data-testid={`city-card-${m.marketKey}`}
              data-photo={photo ? "credited" : "none"}
            >
              {photo ? (
                <div className="relative aspect-[4/3] w-full">
                  <img src={photo.src} alt={m.cityName} className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute bottom-0 right-0 bg-black/55 px-1 text-[9px] text-white">{photo.credit}</span>
                </div>
              ) : (
                // Ruling 3 (8a): no photo of this city is in the repo, so the card is typographic —
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
    </div>
  );
}

export default function Experiences({ occasionSlug: routeSlug = null }: { occasionSlug?: string | null } = {}) {
  const searchString = useSearch();
  const planning = usePlanning();

  // What the URL holds, handed to PlanEntry as a door would (D13: a door passes what it holds).
  const source = useMemo<PlanEntrySource>(() => {
    const params = new URLSearchParams(searchString);
    const market = preselectedMarket(params);
    const group = preselectedGroup(params);
    return {
      ...(market ? { city: market.cityName, country: market.country } : {}),
      ...(routeSlug ? { experienceSlug: routeSlug } : {}),
      ...(group ? { group } : {}),
    };
  }, [searchString, routeSlug]);

  return (
    <>
      <SEOHead
        title="What are you planning?"
        description={EXPERIENCES_PAGE_DESCRIPTION}
        keywords={["trip planning", "event planning", "wedding planning", "date night", "group trip", "celebration planning"]}
        url="/experiences"
      />
      <PageLayout eyebrow="Start a plan" title="What are you planning?" testId="page-experiences">
        <section className="relative" data-testid="plan-entry-inline">
          <PlanEntryPanel
            active
            container="page"
            source={source}
            onStart={(start) => planning.start(start, { door: "experiences", newPlan: true })}
            placePicker={(picked, pick) => <PlacePicker picked={picked} pick={pick} />}
          />
        </section>

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
