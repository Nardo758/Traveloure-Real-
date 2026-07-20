# Traveloure Build Roadmap

> Ratified by the decision-maker, Jul 17 2026. Consolidates the follow-ups from the
> Discover/Experts redesign (#218–#227), the planning-funnel audit + build (#228–#229),
> and the optimization-engine deep-dive. Update this file as items land — link the PR
> next to each item. Governing conventions: CLAUDE.md §8 (no fee literals), §13 (no
> fabricated data), §14 (server-derived money), §15 (idempotency), D1a (born-hidden).

## Context: what the funnel is now

- **Discover** (`/discover`): one header band — title, search, a single instructional
  ad ("browse services, add to cart — we assemble & optimize your trip"), tabs.
- **Cart** (`/cart`): the real planning tool — Cart → Trip details ("What are you
  planning?" drives the real fee tier) → Optimize (free preview metrics + paid full
  LLM optimization) → Itinerary → Payment. The cart step shows a §13-honest savings
  nudge from the free preview (#229).
- **Optimization engine**: `server/itinerary-optimizer.ts` (dual-LLM Grok→Claude,
  adaptive variant-strategy matrix keyed on eventType × travelStyles × budget,
  temporal-anchor constraints, two contrasting variants mapped to real bookable
  inventory) + `smart-sequencing.service.ts` (free heuristic metrics) +
  config-resolved fees with a 24h free re-run.

---

## Sprint 1 — Close the optimization loop

The thing we charge for (optimization) must convert "I don't like it" into a re-run
or an expert engagement, never a dead end.

| # | Item | Size | Notes |
|---|------|------|-------|
| 1.1 | ✅ **Dislike-feedback → strategy-mapped re-run** (PR #231; live-copy harvest in #235) | M | "Not happy?" chips on the result (too expensive / too packed / wrong vibe / wrong areas) map onto the EXISTING variant-strategy matrix (budget→cost-saver, pace→wellness, …) and trigger the free 24h re-run. Server: generate endpoint accepts feedback preferences merged into `TripPreferences`. The engine already supports strategy-driven regeneration — this is wiring. |
| 1.2 | ✅ **Comparison-aware expert handoff** (PR #231) | S–M | Attach `comparisonId` + selected variant + dislike notes to `POST /api/expert-booking-requests`; expert view shows the AI plan that was rejected. |
| 1.3 | ✅ **Result-page choice bar** (PR #231 — the dislike panel presents the escape hatches) | S | One strip presenting the four existing escape hatches as a set: Keep original · Try the other variant · Re-run free (24h) · Send to an expert. Unify the two escalation rails' copy (free-form request vs paid variant review). |

## Sprint 2 — Complete the expert rail + polish

| # | Item | Size | Notes |
|---|------|------|-------|
| 2.1 | ✅ **Pre-optimization plan handoff** (PR #235 — plan-snapshot endpoint + expert Trip Plan dialog + ?tripId= thread) | M | Expert receives the cart/plan snapshot. Consumes the `?tripId=` the cart already passes (#229); needs a share endpoint + expert-side view. With 1.2, experts see the plan at every escalation point. |
| 2.2 | ✅ **Nav "Cart" → "Trip plan"** (PR #236) | XS | Label/tooltip honesty — /cart is a 5-step planner, not a checkout. |
| 2.3 | ✅ **By-Date cards → shared CityCard** (By-Date destination cards now render the shared CityCard season variant; rich More-info modal preserved via controlled state) | S–M | Final visual unification of the calendar destination cards with the trending cards (sizing already fixed in place, #225). |

## Sprint 3 — Trust & hardening

| # | Item | Size | Notes |
|---|------|------|-------|
| 3.1 | ✅ **Require checkout idempotency key server-side** (already landed via PR #201 — entry was stale) | S | §15 residual: `/api/checkout` dedups only when the client sends a key. Require it (or add a natural-key dedup). |
| 3.2 | ✅ **Optimizer fabricated fallback ratings** (PR #237) | S | §13: the generate endpoint's data prep injects `rating: 4.5` fallbacks into LLM input. Feed honest nulls. |
| 3.3 | ✅ **`process-cart` AI-item price trust** (PR #237 — clamped [0,100000]; buyer's-own-charge residual stays filed) | S | §14 A3 residual; low severity (buyer's own charge), cheap to close. |
| 3.4 | ✅ **Decide `/api/discover/recommendations`** — DECIDED: removed (proven-dead-then-remove; restore from git history if the AI-matcher growth item revives it) | XS | Consumer-less since #228. |
| 3.5 | ✅ **Expert-level rating aggregate** (PR TBD — AVG/COUNT over the expert's APPROVED service reviews, attached to /api/experts list+detail; card & detail show real stars or honest "New"; the stub /api/experts/:id/reviews now returns real approved reviews) | M | Experts honestly show "New" today (service reviews are service-scoped). |

## Later — Growth (needs scoping with the decision-maker)

- **Social share kit** — push Ready Made Trips / expert content to social media.
- **Itinerary merchandising deep-dive** — how experts sell Ready Made Trips; further
  scrape-prevention beyond the existing purchase-gate redaction.
- **AI expert matcher, reintroduced properly** — role-scoped, honest metrics (the
  #219 removal rationale), once the Kyoto expert pool justifies it.

## Platform backlog

**Still open — genuinely gated (need environment access or real data, not buildable now):**
- Knowledge-Bar Phase 3: calibrate the scoring rubric on real Kyoto submissions.

**✅ D3 — DMO live scraping (LANDED Jul 19, 2026, Tavily-only):** built the ingestion wiring as a
  key-gated Tavily path (`dmo-ingestion.service.ts`) — Tavily does BOTH discover (`search`) and scrape
  (`extract`), so it runs on a single `TAVILY_API_KEY`, no Firecrawl/Brave needed. Enriches the seeded
  Kyoto stubs in place, born-hidden (D1a); no key ⇒ zero writes (§13). Triggers: admin button
  (`POST /api/admin/dmo/ingest-kyoto`, on `admin/data`) + a scheduler off unless `DMO_INGEST_ENABLED=1`.
  The live run happens at deploy (agent proxy blocks Tavily + source domains). Optional follow-up:
  Brave/Firecrawl discovery to reach content beyond the seeded set.

**↩️ D4 — REVERTED (Jul 19, 2026): DMO content is the expert's research library, not a traveler surface.**
  The decision-maker clarified that scraped DMO content is *ingredients* an expert uses to build Ready Made
  Trips (→ §10 admin approval → Discover), enhance client itineraries, or make social content — it is never
  pushed to travelers on its own. So the "Local guides on the Discover city page" surface (the reader
  service, the `GET /api/discover/location/:city/guides` route, the `LocalGuidesSection`) and the expert
  **"Publish to Discover" / reject** workflow that fed it were **removed**. The DMO Library is refocused on
  research → **Build Ready Made Trip** (the existing `/build-itinerary` bridge). Admin approval moves to
  **intake** (pre-filter what enters the library — filed). See CLAUDE.md §12 (DMO content model corrected).

**✅ Content-gap tracker + priority scraping (LANDED Jul 19, 2026):** the "track what content we have so we
  can tell the scraper what to prioritize" system. `content-gap.service.ts` counts `dmo_raw_content` per
  content type against a Kyoto editorial target profile (`KYOTO_CONTENT_PLAN` — attractions/venues/
  restaurants/events/neighborhoods, experience-planning lens §12) and reconciles `content_gap_alerts`
  idempotently (upsert unmet, auto-resolve met). `dmo-ingestion.service.ts` gains `ingestKyotoContentGaps`:
  reads the open gaps highest-severity-first and runs targeted Tavily *searches* (discovery only — cheaper
  than per-URL extract) to create NEW born-hidden stubs for the thin categories, deduped on
  `(source_url, source_id)`, key-gated (§13, no key ⇒ zero writes). So the scraper fills what's missing
  instead of re-scraping the 10 seeded sites; a second pass moves on to the next-thinnest categories
  (priority-driven). Admin surface on `/admin/data`: a coverage table + "Recalculate coverage" and
  "Fill gaps (Tavily)" (`GET /api/admin/dmo/gaps`, `POST /api/admin/dmo/analyze-gaps`,
  `POST /api/admin/dmo/ingest-gaps`, all admin-gated). No migration — `content_gap_alerts` exists (117).
  The Kyoto target numbers are editorial config, not fabricated content. Proven behaviorally: real counts,
  idempotent analyze, §13 keyless no-op, D1a on created rows, dedup at the DB, priority shift across passes.

**✅ Closed (were already resolved; backlog entries were stale — verified Jul 18, 2026):**
- ✅ Re-point legacy `/api/bookings/refund` onto `service_bookings` — done with the
  escrow Phase 4 work (§14 A2): the endpoint (`server/routes/bookings.ts`) already
  gates owner-or-admin, derives the amount from `service_bookings.total_amount`,
  refunds via `stripePaymentService.refundServiceBooking`, and reverses the earnings
  ledger + platform revenue.
- ✅ Replace mock-data demo arrays — resolved by the Discover consolidation:
  `explore.tsx` and the `help-me-decide` sample-package page were deleted (both routes
  now redirect to `/discover`); `chat.tsx` was wired to real experts; `provider/profile`
  carries no fabricated ratings. Zero `rating: 4.x` literals remain in the client.
