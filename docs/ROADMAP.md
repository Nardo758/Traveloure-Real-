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

**Filed follow-ups — durably tracked here so they don't evaporate (owner: decision-maker to schedule; unowned until then):**
- **CI gate-integrity audit** (condition of the Lane 2a Phase 1 approval, Jul 24, 2026). The journey-2
  Stage-3 exit gate was found green-while-never-firing: its `waitForResponse` matched a URL nothing
  produced, so it fell through `catch { test.skip() }` (misread as "AI key absent") — a *skipped* test
  greens the gate, so Stage-3 had stopped asserting. Lane 2a fixed journey-2 (matcher → the real
  `/api/ai/generate-itinerary`, corrected the response-shape assertion, proven RED-and-GREEN locally).
  **Residual + the audit:** the shape/status assertions still only run after a 200+redirect — an endpoint
  **500 → no redirect → the same `catch` degrades to `test.skip`, not red**. Audit scope: (1) sweep every
  `e2e/specs/*.spec.ts` for the `catch → test.skip` swallow pattern and classify each as legitimate
  data-conditional skip vs assertion-hiding softness; (2) decide a policy so endpoint failure fails the gate
  instead of skipping (e.g. distinguish "precondition absent" from "action fired but errored"). Owner-note:
  this is the class, not the single test — journey-2 is patched, the sweep is the real work.
- **Dedicated audit-log lane** (filed at Lane 0, Jul 2026). `authorizeTripLogistics` admin access is currently
  audit-logged via pino inline (`server/utils/trip-logistics-auth.ts`) as an interim; the durable
  structured audit-log surface (persisted, queryable) is its own lane.
- **tsc-debt burn-down.** Clean `origin/main` carries a 254-error tsc baseline; every lane is gated at
  "0 net-new" against it. Burning the 254 down (the `Server`/`PathParams` overload, the
  `Set<string>` downlevelIteration in `shared/selection-controls.ts`, the `provider_services`/`users`
  property drift) is a dedicated cleanup lane, not something any feature lane should absorb.

**Observed (noted, not blocked — durable record so it doesn't evaporate):**
- **Anchor free-text fields flow into generation prompts (Lane 2a, Jul 24, 2026).** A temporal anchor's
  user-authored `description`/`location` are now interpolated into the Claude/Grok itinerary prompts
  (`buildAnchorPromptBlock`). On an expert-assigned trip an *assigned expert* can therefore influence the
  traveler's generation prompt. Blast radius is **itinerary content only** (no money path, no data
  exfiltration surface) → noted-not-blocked. Same class as the email-template injection lesson: user-authored
  text reaching an LLM prompt. If anchor authorship ever widens or the prompt output ever feeds a
  higher-privilege action, revisit with sanitization/escaping.
- **Grok anchor fetch is owner-only; expert-triggered generation is anchor-blind (Lane 2a, Jul 24, 2026).**
  The anchor fetch in content.routes.ts (`POST /api/ai/generate-itinerary`) gates the query on `verifyTripOwnership`
  before calling `getTemporalAnchors()`. An expert generating an itinerary for an existing trip (not owner of that
  trip) hits a 403/404 before the anchor query fires → no anchor injection on expert-triggered generation.
  **Filed to Lane 4 (expert-flow queue):** wire anchor fetch to expert-role-and-trip-assignment check, so an
  expert coordinator can also inject anchors on a trip they're assigned to. Owner-note: the traveler tier
  (Lane 2a) is complete; the expert-assisted tier (Lane 4) must gate differently.
- **Claude dedup key carries user-authored anchor text as cross-user cache key material (Lane 2a, Jul 24, 2026).**
  The anchor block (`buildAnchorPromptBlock()` output) is folded verbatim into the Claude dedup key to avoid
  sharing cached generations across trips with different anchors. However, the anchor block contains user-authored
  field text (`description`, `location`) — if Claude's in-memory cache (currently per-request, ephemeral) ever
  becomes persistent (Redis, DB, across-server), the cache key becomes shared cross-user material. Blast radius:
  cache collision (wrong itinerary returned) and text visibility (user descriptions in cache keys). **Filed to
  Observed list:** revisit when cache persistence is designed, to decide whether to hash the anchor text or
  exclude user fields from the key. Interim note: current in-memory ephemeral cache is safe.

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

---

# Trip-Strip & Destination-Event Program (ratified Jul 24, 2026)

> Spec of record: the page-by-page mockup artifact (decision-maker ratified) + task queue
> #150–#154. Premise (decision-maker): a user plans an experience in ANOTHER COUNTRY and
> INVITES OTHERS — an organizer abroad plus guests traveling from their own origins. The
> trip strip is the state spine; the (fully built, fully dark) guest-invite system is the
> people spine. Governing rules: one mount / in-progress visibility / cart-in-strip /
> slim nav / one-control-per-fact / browse-never-writes.

## Phase P — TripContext spine

| # | Item | Size | Status / Notes |
|---|------|------|-------|
| P1 | **TripContext module** — typed owner of the trip blob, merge-by-default, YYYY-MM-DD boundary; all 10 writers + 13 readers converted; fixes D1–D4 (concierge clobber, mobile slug drop, date drift, quick-start dead write) | M | ✅ Built + proven (13-check gate) — **PR #298 open, green, awaiting merge** |
| P2 | **Live propagation + EditTripPanel** — cart header on `useTripContext`; travelers fallback ctx→guestCount→2; build the shared **EditTripPanel** (destination · dates · party · trip name · "What are you planning?") — the durable artifact reused by P3's strip, template empty-state, and Continue-flow guard. Do NOT invest in the Trip Details step beyond hook-wiring (P3 deletes it). **Includes E2: server-persisted TripContext for signed-in users** (sessionStorage dies with the tab; persist via/alongside `user_experiences` so planning survives restarts + crosses devices — the precedence rule's server tier) | M–L | Task #151 |
| P3 | **The strip** (ratified Option A) — one mount in traveler layout; visible when any context set OR cart non-empty; **cart chip = the site's single cart display** (nav cart + template-ribbon cart removed); **Contact leaves the nav**; vocabulary classes Travel/Event/Couple; template reformat (delete the generic quartet from `/experiences/:slug`); **cart flow collapses to 4 steps** (Trip Details step deleted; Continue resolves from strip state; missing fields open EditTripPanel); server-truth mode post-tripId; edit-locked on checkout/payment; city-hero one-way "Set as trip destination"; calendar stays independent ("Use as trip date" only) | L | Task #152 · blocked by P2 |

## Phase A — Guest-invite activation (the "invite others" half)

Fully built, fully dark: `server/routes/guest-invites.ts` (~9 endpoints — organizer
create/list/stats, token RSVP, **guest origin capture**, travel plans, accommodation
prefs, per-guest recommendations) is never imported; `GuestInvitePage.tsx` unrouted;
`GuestInviteManager.tsx` zero importers. Activation, not construction.

| # | Item | Size | Status / Notes |
|---|------|------|-------|
| A0 | **Security audit then mount** — every endpoint reviewed against §14/§2 BEFORE mounting (predates the security passes; organizer endpoints must verify experience ownership; token endpoints deliberately public-by-token); mount per the §9 EA-console activation pattern. Also: extend the unmounted-router guard to catch **never-imported** route files (this find's class) | M | Task #153 · independent of P2/P3 — can run in parallel |
| A1 | **Route + surface** — `/invite/:token` → GuestInvitePage; GuestInviteManager into the Event-class template + trip page. Behavioral proof: create invite → token RSVP + origin → stats reflect | S–M | Task #153 |
| A2 | **TripContext `origin`** — organizer's home city/country; the international framing (destination abroad ≠ home) the templates' existing eSIM/flight logic reads | S | Task #154 · rides P3 |
| A3 | **Invite-aware Event-class strip** — party chip becomes live RSVP state ("✉️ 60 invited · 41 going" → manager); "Invite guests" action in EditTripPanel | S–M | Task #154 · blocked by A0/A1 + P3 |

## Phase E — Destination-event enhancements (value order; scope each with decision-maker before build)

| # | Item | Size | Notes |
|---|------|------|-------|
| E1 | **Guest cost-splitting** — each guest pays their share via their invite page (per-person budget / cost-split / deposit-schedule fields already seeded in template tabs; Stripe + escrow rails exist). Every §14/§15 rule applies: server-derived per-guest amounts, idempotent collection. The monetization multiplier — every guest becomes a payer | L | After A-phase; own money lane + decision-maker ratification of the split model |
| E2 | **Server-persisted TripContext** | — | Folded into P2 (above) |
| E3 | **Date polling** — guests vote on date windows from the invite page before dates lock; poll close writes the winning window into TripContext; strip shows "📅 Polling 12 guests…" | M | After A1; pairs with invite flow |
| E4 | **Group arrival dashboard** — organizer view over `guest_travel_plans` (who lands when, arrival waves, unbooked guests); `multi-person-coordination.tsx` exists as a base. Justifies the §7 coordination fee visibly | M | After A1 |
| E5 | **Per-guest visa flags** — cross guest origins × destination against visa requirements ("3 of your guests need a visa for Japan"); visa-help page exists; dark visa endpoint family in experts.routes.ts needs its own A0-style triage first | M | After A1 + visa-family triage |
| E6 | **Hotel-block management** — organizer reserves a block (provider inventory/Amadeus); guests pick into it from the invite page (`hotel_block` accommodation pref already in the schema). Routes guest lodging spend through the marketplace | L | After A1; supply-side scoping (Kyoto wedge §12) |
| E7 | **Guest read-only itinerary** — attach the live itinerary-share view (trips.routes' 32 live endpoints) to the invite token so RSVP'd guests watch the event plan evolve | S | After A1 |
| E8 | **Trip switcher on the strip** — multiple in-progress experiences (Kyoto wedding + NYC trip) without context clobber; dropdown on the strip lead; cheap once E2's server persistence provides the list | S–M | After P3 + P2/E2 |

**Honorable mentions (unscoped):** RSVP-deadline nudges (rides the filed email cluster);
gift registry / honeymoon fund (EA gifting DNA); coordinator visibility on the guest
invite page (trust + §16 disintermediation-resistance).

**Sequencing picture:** P1 (merge) → P2+E2 ∥ A0/A1 → P3 → A2/A3 → E1/E3/E4 (then E5–E8
by value). Each phase lands via its own PR + gates; money-touching items (E1, E6) get
their own security lanes per §14/§15.
