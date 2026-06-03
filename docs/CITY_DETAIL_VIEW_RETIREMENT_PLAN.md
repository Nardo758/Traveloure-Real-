# CityDetailView Retirement Plan (Decision #5 — Replace)

> Decision: the Phase 3 location view **replaces** CityDetailView. This
> document captures the honest tab-by-tab content audit, the section
> mapping into the new view, and the call-site swap order so the
> replacement is real, not a hand-wave.

## Why this document exists

The v2 spec's Phase 3 calls for "one coherent location page per city."
The natural reading is "the new location view absorbs CityDetailView,"
and that's the right call — but only if every substantive tab actually
has a home. An audit-before-retire prevents lossy folds.

## The audit (what CityDetailView actually contains)

CityDetailView is at
`client/src/components/travelpulse/CityDetailView.tsx` (1500+ lines).
Above its tabs sits an **Overview header** (hero-ish: city name, country,
quick stats). Then six tabs:

| Tab | Lines | Content | Folds cleanly? |
|---|---|---|---|
| **Hidden Gems** | 947-1008 | Gems list with score, type, why-locals-love-it. | Yes — into a gems-by-neighborhood section in the new view. |
| **Recommendations** | 1010-1013 | AI-enriched recommendations (`<CityRecommendations />`). | Yes — into the woven-supply marquee / recommendations rail. |
| **Happening Now** | 1015-1068 | Live events strip with venue, time, status. | Yes — into a hero strip + a happening-now panel. |
| **Live Activity** | 1070-1114 | Real-time traveller-activity feed. | Yes — lighter weight, can be a strip in the happening-now section. |
| **Media** | 1116-1297 | **Destination videos grid + photo gallery**. ~180 lines of structured media UI. | **NO — needs its own section.** Folding into hero loses the gallery. |
| **AI Insights** | 1299-1504 | **9 distinct subcards**: Best Time, Optimal Duration, Budget Estimate (budget / mid-range / luxury), Must-See Attractions, Travel Tips, Local Insights, Safety Notes, Seasonal Highlights, + Updated timestamp. ~200 lines. | **NO — needs its own panel.** Folding 9 subcards into a hero is lossy. |

## Honest section mapping for the new location view

Earlier sketches said "Media → hero/gallery" and "AI Insights → folded
into hero." Audit shows that's not enough. The new view needs **at least
five sections**, not three:

1. **Hero** — Overview header content + Happening Now strip (top 1-3
   live events). Quick stats, current weather, live signal.
2. **Supply rail** (woven) — featured providers + recommendations,
   sorted by `featured-sort` guardrail (Phase 1b-4).
3. **By Neighborhood** — gems and services rolled up by
   `city_neighborhoods` slug (Phase 1b-1). Each neighborhood becomes the
   ecosystem unit the spec §5.1 describes.
4. **Media** — videos grid + photo gallery. Carries over CityDetailView's
   Media tab content essentially verbatim, just embedded inline rather
   than tab-hidden.
5. **Insights panel** — all 9 AI Insights subcards. Best Time, Budget,
   Travel Tips, Safety, etc. Carries over CityDetailView's AI Insights
   tab content. Position TBD (likely below supply, above Media, so it's
   reachable without scrolling past everything).

Live Activity is a strip inside section 1 (Hero / Happening Now), not its
own section — it's a feed, not a destination surface.

## Call-site swap order (Phase 3)

CityDetailView is **component-embedded, not routed**. No `/city/:slug`
URL exists, so no redirect is needed. Two embed sites swap to the new
location view component:

- `client/src/components/travelpulse/CityGrid.tsx:569` — used in the
  TravelPulse city browser. Swap last; this is the primary public
  entry point.
- `client/src/components/travelpulse/GlobalCalendar.tsx:306` — used in
  the Global Calendar drill-down. Swap first; lower-traffic surface,
  good canary.

Swap procedure:

1. New location view component lands and proves all five sections
   render correctly for Kyoto + Paris.
2. Swap GlobalCalendar's embed first. Ship. Watch for regressions.
3. Swap CityGrid's embed. Ship. Watch for regressions.
4. After both embed sites have used the new view in production for at
   least one release cycle without regressions, delete
   `CityDetailView.tsx`. Not before.

## The "don't delete until absorbed" rule

CityDetailView code stays in the repo throughout Phase 3 implementation.
A TODO marker at its top points to this document. The code is only
removed in Phase 3's closing commit, after both embed sites have been
swapped and verified. Replace the destination, not the code, in one
commit — exactly the user's guardrail #2 from the Phase 1b-5 decision.

## Open questions for Phase 3 implementation

- **Insights panel placement**: above-the-fold or below the supply rail?
  Argues both ways: above gives the AI work prominence; below keeps the
  hero clean. Decide when wireframes hit.
- **Mobile**: 5 sections is fine on desktop. On mobile, AI Insights and
  Media may need progressive disclosure (collapsed-by-default sections)
  so scroll length stays sane.
- **Empty-state behavior per section**: each section needs an explicit
  empty state. The orchestrator (Phase 1b-3) returns `{ data, error }`
  per source, so this is the natural place to render it — never blank
  cards, never silent failure.
