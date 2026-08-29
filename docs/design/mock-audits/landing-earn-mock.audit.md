# Audit brief — Landing Page Earn Grammar (v2.4)

**Mock:** `docs/design/landing-earn-mock.html` (open in a browser; theme-aware light/dark)
**Ledger:** `2026-08-25-landing-after-marketplace` (sequencing — landing is lane 5, after marketplace lanes 1–4); `2026-08-27-plus-is-delivery` and the coral-at-flip ruling recorded 2026-08-29 in `docs/design/LANDING_SPEC.md` (not yet a separate `docs/DECISIONS.md` row at time of writing — treat the spec's own "Coral-at-flip" section as the citation of record for that specific rule)
**Status:** spec-of-record pairing. Companion spec `docs/design/LANDING_SPEC.md` (v2.4 reissue, `audited@3bd36b49`) is authoritative on SCOPE and the ruled section order; **where the mock's own DOM order and the spec's ruled order disagree, the spec wins** (the spec explicitly calls out this delta: the mock file orders ENTRY → EXPERIENCES → OCCASIONS in its HTML comments, but the ruled build order moves OCCASIONS to slot 3). Visual grammar defers to `docs/design/marketplace-experts-earn-grammar-mock.html`.
**Live surfaces:**
- `client/src/pages/landing.tsx`
- `client/src/components/travelpulse/CityCard.tsx` (`TrendingCities`, needs a `density` prop per the spec — verify it exists)
- `GET /api/pricing` (public, unauthenticated) — carries `plusSalesEnabled`
- `GET /api/travelpulse/cities`, `GET /api/discover/location/:city`, `GET /api/platform/stats`

## Behaviors the mock ratifies

1. **Ruled section order** (spec wins over mock DOM order): Hero (live bento + typed search) → How it works + price strip → Plus occasions → Where to begin (entry strips) → What people are planning (experiences ticker, degraded) → Cities with momentum → Numbers → Ways to earn → Final CTA.
2. **Coral count is 3 while `PLUS_SALES_ENABLED` is off**: hero, earn section, final CTA. The Plus section's CTA renders a coming-soon state, NOT coral, while the flag is off.
3. **Coral-at-flip**: when `PLUS_SALES_ENABLED` turns on, the Plus occasions section's Join-Plus CTA becomes an accepted FOURTH coral (matching the mock's own "one coral per section" note) — this is the flip's built-in visual change, not a separate decision each time the flag moves, and no lane may add a fourth coral for any other reason. Chrome's own coral budget (Sign In + strip eyebrow + BETA pill, `2026-08-28-chrome-alignment`) is a SEPARATE budget unaffected by this flip.
4. Every landing number is a **live-row read**, never a literal: hero city data from `/api/travelpulse/cities`; hero anchor-expert/gem/service data from the city feed; price strip and Plus price from `/api/pricing`; platform Numbers from `/api/platform/stats`.
5. §13 honest-collapse specifics: a city's `trendingScore` of 0 (below confidence floor) renders **no "hot" badge**, never a fake one. The Numbers section renders honest `—` for an empty stat, not a `"0+"` fallback (this is a RULED CHANGE from the current page's `formatStat` behavior — the mock's spec explicitly calls out this must change with the section rebuild).
6. The hero anchor-expert, gem, wanted-slot, and service fields are each **independently nullable** — a null anchor expert (dev Kyoto: 10 neighborhoods, zero carry one, per the spec's own verified finding) must degrade honestly, never fabricate a placeholder expert.
7. Typed-search titles are a **static curated list**, one per operating market, phrased as searches a traveler would type — explicitly ruled NO user-generated content (the decision-maker ruled this at the Phase 0 stop; `service_requests` has no public read and its only free text is traveler-authored). The rotation stops on focus; submit navigates to `/services?q=&location=` and **never writes trip context**.
8. Rotation (typed search, cities rail, and the experiences ticker once it exists) is driven by **one shared rotation utility** (8s advance, pause on hover/focus, disabled under `prefers-reduced-motion`) — not per-surface reimplementations. The spec notes this utility does not exist yet and must be created once, not three times.
9. The experiences ticker section is explicitly **degraded** (static curated order, ticker hidden) because the `experience_starts` rollup table does not exist — this is filed, not built, and must not be faked with a live-looking ticker.
10. Preserve exactly, no handler changes: hero `Plan my trip` → `setPlanningOpen(true)` → `EnhancedPlanningModal`; earn links keep their `?track=provider` / `?track=expert` aliases.
11. No stock photos anywhere — real listing/gem/expert photos where rows have them, tinted gradient fallback otherwise.
12. `/pricing`'s Join-Plus CTA (a separate surface, cited here because it shares the same gate) reads `PLUS_SALES_ENABLED` via `/api/pricing` and shows a coming-soon state until the flag is on (CLAUDE.md §26) — the landing's Plus section and `/pricing`'s CTA must agree on this gate, never one showing live-purchase while the other shows coming-soon.

## Visual grammar

Same tokens as the marketplace/experts mock: `--earn-*` palette, Fraunces headings, Geist Mono for eyebrows/numbers/labels, Inter body. Coral is the ONE primary CTA per section (see coral-count rule above — this is the section-by-section instance of that same "coral once per panel" rule from the marketplace grammar spec).

## How to audit

```bash
# Coral count on the landing page — expect exactly 3 coral CTAs while the flag is off
grep -n "earn-coral" client/src/pages/landing.tsx

# PLUS_SALES_ENABLED gates both the landing Plus CTA and /pricing's CTA identically
grep -rn "plusSalesEnabled\|PLUS_SALES_ENABLED" client/src/pages/landing.tsx client/src/pages/pricing.tsx server/config/plus-sales.ts

# Honest-collapse: no "0+" fallback should remain on Numbers after the rebuild
grep -n "formatStat\|0+" client/src/pages/landing.tsx

# Static curated typed-search list, not a live/UGC query
grep -n "typed-search\|rainy-day tea\|Porto wine cellars" client/src/pages/landing.tsx

# Shared rotation utility used by more than one surface (not three separate intervals)
grep -rln "useRotation\|rotation" client/src/pages/landing.tsx client/src/lib/

# Preserved handlers unchanged
grep -n "setPlanningOpen\|EnhancedPlanningModal" client/src/pages/landing.tsx
grep -n "track=provider\|track=expert" client/src/pages/landing.tsx

# CityCard density prop exists for the compact rail variant
grep -n "density" client/src/components/travelpulse/CityCard.tsx
```

Route to open: `/` (landing). Toggle `PLUS_SALES_ENABLED` (via `/api/pricing` response or the server config) to confirm the coral count moves from 3 to 4 exactly at the Plus section's CTA, nowhere else.

## Known divergences / notes

- The mock file's own DOM order (ENTRY → EXPERIENCES → OCCASIONS) is superseded by the dispatch's ruled order (OCCASIONS moved to slot 3) — build to the ruled order in LANDING_SPEC.md, and do not flag the mock's literal HTML ordering as the target.
- `docs/audits/landing-routing-phase-0.md`, cited by the original dispatch, does **not exist on `main`** per the spec's own verification — do not search for it; the spec itself is the citation of record for the preserved-handler chain.
- The experiences ticker's degraded (non-live) state is intentional, not a partial-implementation bug.
