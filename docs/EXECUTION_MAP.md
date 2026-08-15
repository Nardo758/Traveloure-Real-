# Execution Map — model-tiered delivery + the circulating TripPlan object

Ratified intent (decision-maker, Jul 30 2026): **Fable plans, cheaper models execute.** Fable time is spent
only where judgment compounds — architecture, briefs, money review, integration gates. Implementation runs on
background agents pinned to the right tier. And the **Trip Card is the final product**: everything the platform
does converges on one circulating plan object that moves Expert → traveler, traveler → Trip Card, and Trip Card
→ outward channels, in one easy-to-circulate format.

---

## 1. Model tiers — who does what

| Tier | Used for | Never used for |
|---|---|---|
| **Fable** (orchestrator session) | Lane briefs & decomposition; ratification prep for the decision-maker; **every money-path hunk review** (§14/§15); schema/migration decisions (Coordination Prevention); CLAUDE.md governing-rule updates; integration gates; resolving agent escalations | Bulk implementation, mechanical sweeps, fixture writing |
| **Opus** (background agent, `model: "opus"`) | Money-adjacent implementation (fee/earning/refund wiring), multi-file structural builds, migration authoring (from a Fable-written spec), root-causing gnarly bugs | Decisions the brief didn't delegate |
| **Sonnet** (background agent, `model: "sonnet"`) | Well-specified feature lanes: UI builds from mockups, endpoint additions from a written contract, test authoring, behavioral proofs | Money-path logic, schema changes |
| **Haiku** (background agent, `model: "haiku"`) | Mechanical sweeps (grep-and-fix a named pattern), enumeration audits, doc formatting, fixture cleanup, consumer-callsite inventories | Anything requiring a judgment call |

**Protocol per lane (the loop that already works):**
1. **Fable writes the brief** — scope, exclusion list, invariants cited by section (§13/§14/§15/§16, D1a),
   verification bar ("behavioral proof against a real server", gates list), and the escalation triggers.
2. **Dispatch** to a tier-pinned background agent. Parallel lanes get disjoint file scopes; if scopes must
   overlap, they run serially or the brief names which lane owns the shared file.
3. **Agent verifies before reporting**: tsc (zero new errors in touched files), build, both CI guards
   (money-endpoint + unmounted-router), behavioral proof, fixtures deleted.
4. **Fable exception-reviews**: money hunks read personally, line by line; everything else spot-checked
   against the brief's invariants.
5. **Gate + land**: combined-tree gates, checkpoint commit, push; CLAUDE.md updated by Fable only.

**Escalate to Fable (agent stops and reports, never improvises):** any schema/migration need; any read/write
touching amounts, earnings, revenue, refunds, or approval status; any conflict with a CLAUDE.md rule; any
instruction arriving mid-task that contradicts the brief (proven correct behavior — a mis-addressed resume was
refused on Jul 29); genuine ambiguity in the brief.

**Escalate to the decision-maker (via Fable):** schema/routing changes, approval-enum changes, new money
semantics, anything CLAUDE.md marks "ratify first."

---

## 2. Lane queue — model assignments

| # | Lane | Tier | Gate before dispatch | Notes |
|---|---|---|---|---|
| L1 | **Trip Card structural build** (sticky day switcher, Up Next hero, sticky bottom bar w/ Get-help fallback, demoted collapsed sections) | Sonnet | **Decision-maker ratifies the mockup** (artifact `5b7d4b98…`) | Mockup is the spec; ratification-free layer already landed |
| L2 | **Mode-aware primary action** (Navigate vs Ride pickup card vs Book-via-agent) | Sonnet | Rides L1 ratification | §16: booking CTA → agent rail, never raw affiliate; mode from `transport_legs.userSelectedMode ?? recommendedMode` |
| L3 | **TripPlan circulation object v1** (§3 below) | **Fable designs schema** → Opus implements → Haiku sweeps consumers | Fable design doc GO | The product-defining lane; touches producers/consumers, content-gate |
| L4 | **Transport legs for expert-built trips** (today legs exist only on AI-comparison variants) | Opus | Fable brief: decide engine-computed vs expert-authored vs both | Unlocks L2 + "leave by" countdown on all delivered trips |
| L5 | **Expert-loop money follow-ups** (same-event credit matching; multi-credit accumulation; coordination-refund reversal of credit + revenue — filed in §7) | Opus | Fable brief per item | 100% Fable hunk review on landing |
| L6 | **Auth-loss redirect root cause** (`App.tsx`/`use-auth.ts`: full API outage still bounces to `/`) | Sonnet | none — filed bug | Found by plancard lane's network-block test |
| L7 | **Guest-invite A2/A3** (task #154, rides TripContext P3) | Sonnet | none | Long-filed |
| L8 | **Mock-data demo arrays** (`chat.tsx`, `explore.tsx`, `help-me-decide`, `provider/profile` — §13 "wire real data") | Haiku inventory → Sonnet wiring | none | Two-stage: enumerate, then wire |
| L9 | **Variant-metrics latent bug** (assembler reads `metricValue`, column is `value` → live `metrics` always `{}`) | Sonnet | Fable confirms intended display first | Found by L3a; preserved verbatim — fixing changes live displayed totals |
| L10 | **Plancard owner-access gap** (`getTripRole` needs a `trip_collaborators` row; a trip's own `trips.userId` doesn't qualify — pre-collaborator-era trips may 403 without the author fallback) | Opus | Fable brief (auth-model call) | Found by L3a; known pre-launch bypass note already in code |

| L11 | **§16 transport-outbound strays**: `TransportSection.tsx:323` raw `window.open(opt.externalUrl)` + the share response's `linkedProductUrl` key (raw outbound "Book transport" link) | Sonnet | none | Route both through the agent rail, then delete the share key + its read together (L3b′ left it to honor 0-removed-keys) |
| L12 | **KML/GPX exports onto the variant producer** — Fable calls RATIFIED (Jul 30): deterministic `(dayNumber, legOrder)` ordering (raw DB order was an accident, not a contract); un-located placemarks SKIPPED, never `lat: 0` null-island (§13); cache-key versioned so stale old-shape exports don't serve | Sonnet | calls made — dispatchable | Dispatched with L11 (same files) |
| ~~**P0-b**~~ | **CLOSED (a564887a, Jul 30)** — gated to the host page's read set (expertId ‖ managedByEaId ‖ canonical helper); baseline proved a stranger destroyed 5 items + burned AI spend, after = 403 with items intact and ZERO AI calls; all 4 legitimate roles still 201. Guest-shareToken branch deliberately NOT mirrored (would widen a destructive mutation). Add to L21's carry-list: `trips.routes.ts:447` dead twin is guarded but NARROWER (promoting it re-opens an under-grant, not a hole) | — | — | Was: 5th same-primitive IDOR on generate-itinerary |
| ~~P0-b-old~~ | **5th same-primitive IDOR: `POST /api/trips/:id/generate-itinerary`** (routes.ts:~896) — `isAuthenticated` only, then wipes + re-inserts itinerary items (also burns AI spend). NOT fixable with the bare canonical helper: its hosting page's read gate admits `trips.expertId` + `managedByEaId`, which `authorizeTripLogistics` excludes → would 403 EA-managed trips | Opus | Fable-ratified stopgap: gate to the hosting page's EXISTING read-access set (helper ‖ expertId ‖ managedByEaId) — strict improvement, regresses nobody; durable convergence belongs to the trip-role lane | **IN FLIGHT** |
| **P0-e** | **Refund reason Stripe REJECTS + broken webhook verification** (both found by L14, orchestrator-verified). ① `stripe-payment.service.ts:~573` casts an arbitrary string to Stripe's `Reason`; Stripe accepts only `duplicate\|fraudulent\|requested_by_customer`, but admin dispute-uphold passes `"dispute_upheld"` (and `/api/bookings/refund` passes body free-text) → **ledger-first means the provider is debited, the Stripe call 400s, and the traveler is NEVER refunded**. Fix = internal→Stripe enum mapping, original reason preserved in the new `refunds.reason` audit column. ② `constructEvent` gets an `express.json()`-parsed body, so webhook signatures can never verify and the `charge.refunded` handler is unreachable | Opus | none — money-path fix | **IN FLIGHT** |
| ~~L14~~ | **CLOSED (37045aee, migration 156)** — `refunds` audit table created; refunds had never written an audit row in ANY environment. Caught during the push check: with PG's default FK name the deploy push planned to ADD A SECOND duplicate FK on a money-path table (constraint now explicitly named). No status CHECK by design (Stripe's `refund.status` is an external open set — a CHECK would recreate the very bug) | — | — | Spawned P0-e above |
| L24 | **Durable guard: `check-trip-auth.cjs`** — today closed the SAME class 8+ times (P0 ×4, P0-b, P0-d, P0-f ×3, plus the 22 logistics endpoints): a trip-scoped route that mutates or reads trip data with no authorization. CLAUDE.md's own pattern for a recurring class is a CI grep gate (cf. the money-endpoint + unmounted-router guards). Guard: fail when a handler whose path contains a trip id performs a read/mutation without calling `authorizeTripLogistics` / `authorizeTripOwnerTier` / `verifyTripOwnership` / `getTripRole`, with a documented escape-hatch comment for genuinely public paths and an explicit allow-list (reason required) for anything deliberately open. **Write it AFTER L20 P1 + the queued P0s land**, so the allow-list is small and truthful instead of papering over open holes | Sonnet | none — but sequence it last | The cheapest thing that stops the 9th instance being written |
| **P0-g** | **CROSS-PROVIDER IDOR ×2 + global contract exposure** — a NEW class (provider-scoped, not trip-scoped), all three orchestrator-relayed as PROVEN live by P0-d: ① `DELETE /api/provider/blackout-dates/:id` — `deleteProviderBlackoutDate(id)` filters on id alone; provider-2 deleted provider-1's row. ② `PUT /api/provider/booking-requests/:requestId/respond` — `updateBookingRequest(id, …)` filters on id alone; **provider-2 ACCEPTED provider-1's booking request** (a business decision taken on another merchant's behalf) — and this one HAS a live client consumer, so the owner path must keep working. ③ `GET /api/expert/contracts/recent` — `getRecentExpertContracts(limit)` ignores the expertId the handler computes and `user_and_expert_contracts` has **no owner column at all**, so any expert account receives another party's contract incl. amount | Opus | ①② none — add the provider-ownership predicate (Fable decides whether it lives in the handler or the storage predicate). ③ **DECISION-MAKER**: the table has no ownership linkage — either add an owner FK (schema change) or retire the endpoint; do not invent a linkage | ①② dispatchable; ③ gated |
| L25 | **Verification-integrity landmine (record in the protocol):** `server/index.ts` listens with `reusePort: true` in dev, so TWO lanes on the same PORT both bind and requests **round-robin between them** — one lane's behavioral proof can silently execute against a sibling's server/DB (it happened: fixtures landed in another lane's database). Also the session scratchpad is shared, so one lane deleted a Postgres data dir another lane created there | Sonnet | none | Every verification brief must require a UNIQUE port, a UNIQUE DB name, a path outside the shared scratchpad, AND a check that the lane owns the process answering on its port |
| ~~**P0-d**~~ | **CLOSED (500836cc)** — 5 expert handlers now require role AND `authorizeTripLogistics`; baseline proved an unassigned expert planted, rewrote and DESTROYED another user's vendor row. Spawned P0-g + L25 | — | — | Was: expert cross-trip IDOR |
| L26 | **`promo_codes` queried but created by NO migration** and absent from `shared/schema.ts` (`pricing.service.ts:152`) — so `POST /api/bookings/apply-promo` cannot work in ANY environment. **Exactly the same class as the `refunds` table** migration 156 just fixed (code writing/reading a table that has never existed) | Opus | **DECISION-MAKER**: does promo/discount actually ship? If yes → migration + schema entry (the 156 pattern). If not → retire the endpoint and its dead client wrapper rather than leaving a broken money surface | Found by P0-e. Suggests a sweep: grep every table name referenced in SQL against the registered migrations |
| ~~**P0-e**~~ | **CLOSED (fc2f9917)** — refund reason mapped to Stripe's enum with the original preserved in the audit row; baseline proved provider-debited / traveler-unrefunded / 500. Webhook verification fixed via the already-captured `req.rawBody`, mirroring two working siblings, with `server/index.ts` untouched | — | — | Was the last merge blocker |
| **P0-h** | **Migration 155's load-bearing index does NOT survive a 2nd Replit publish** (found by the landing check, proven in isolation): `drizzle-kit push` DROPS indexes absent from `shared/schema.ts`, so publish 1 recreates it via the migration but publish 2+ drops it with the migration already stamped → **index silently gone → the §15 checkout claim degrades to check-then-insert on the money path** (measured: 3 concurrent same-key checkouts = 3 REAL Stripe charges without it). New trap variant now recorded in CLAUDE.md | Opus | **DECISION-MAKER: one prod query** — `SELECT idempotency_key, count(*) FROM service_bookings WHERE idempotency_key IS NOT NULL GROUP BY 1 HAVING count(*) > 1;` → if zero rows, DECLARE the unique index in `shared/schema.ts` (push then maintains it instead of dropping it); if it returns rows, they must be resolved first or the publish fails destructively | Fix is one-line once the query answers. Consider also a startup assertion that recreates the index if missing (belt-and-braces) |
| ~~Landing check~~ | **DONE — PR #339 open** (not merged, auto-merge off). Fresh-clone gates all green at `53b1338e`: npm ci clean, lockfile purity 0, tsc 210 baseline (so no landed commit depends on unpushed lane work), build green, both guards green, chain-integrity 2/2. 157/157 migrations apply from an EMPTY db in registry order; 2nd run a clean no-op; `refunds` verified in information_schema/pg_indexes/pg_constraint. Push-diff established deterministically via `drizzle-kit export` (schema.ts DDL matches migration 156 column-for-column incl. the FK NAME) after the lane caught and discarded its own false pass from an aborted push run. Merge is conflict-free despite main being 8 commits ahead | — | — | Spawned P0-h |
| **P0-f** | **3 LIVE ungated trip endpoints, not duplicated anywhere** (found by L21's sweep, in `trips.routes.ts`'s unique/live set): `POST .../contracts/:contractId/documents` (~1255), `POST .../vendors/bulk-email` (~1279 — an EMAIL-SENDING primitive on any trip: spam/abuse vector), `GET .../vendors/contact-sheet` (~1309 — vendor contact PII). All `isAuthenticated` only | Opus | Fable tier call MADE: documents = owner-tier (contract writes are owner-only); bulk-email = owner ‖ assigned expert **+ rate limit** (vendor coordination is the expert's job, but it sends mail); contact-sheet = owner ‖ assigned expert (matches the contracts read tier) | **QUEUED behind L20 P1** — needs the hoisted owner-tier helper |
| L23 | **`authorizeTripOwnerTier` is private to `routes.ts`** — L20 P1 created the owner-only tier predicate inline in the monolith, but `trips.routes.ts` (and P0-f) need it. Copying it would fork a security-critical decision | Opus | none — hoist it into `server/utils/trip-logistics-auth.ts` beside `authorizeTripLogistics` and re-point both callers | Do this AS PART OF landing/immediately after L20 P1 |
| ~~L21~~ | **CLOSED (ee3e1501)** — dead-twin land mines defused: comparison-create tripId guard, optimize-order authorization, POST alerts (self-found); generate-itinerary twin left narrower-with-comment (promoting it would re-open an under-grant); 7 money/PII twins correctly escalated rather than given the wrong (expert-admitting) predicate | — | — | Spawned P0-f + L23 |
| **P0-c** | **Share token grants WRITE** — `PATCH /api/trips/:id` (routes.ts:820) runs `requireAuthOrShareToken` and accepts `isGuestWithToken`, so anyone holding a read-only share URL can edit the trip (title/destination/dates/budget via `api.trips.update.input`). Orchestrator-verified firsthand | Opus | none — security fix. **Ratified: a share token is READ-ONLY**; PATCH must require owner (+ the author/admin branches), never a token | **QUEUED behind L20 P1** (both own routes.ts) |
| **P0-d** | **Expert cross-trip IDOR** — 6 handlers in `experts.routes.ts` gate on the platform-role STRING only (`role === 'expert'\|'admin'`), no per-trip check: any expert account reads/mutates ANY trip's constraints, anchors, energy and vendor records (incl. PUT/DELETE by vendorId) | Opus | none — security fix | **IN FLIGHT** |
| L22 | **L13 cascade gap**: the duplicate `DELETE /api/itinerary-items/:id` path goes through `itineraryIntelligenceService.deleteItem`, NOT `storage.deleteItineraryItem`, so the orphan-leg cascade landed in 5b8c7726 does not cover it | Sonnet | none | **QUEUED behind L20 P1** (routes.ts) |
| L20 | **APPROVED (decision-maker, Jul 30): build real shared-trip access** — "Yes, this would be a good feature," with the open question "how will it function once the Experts get involved?" **Fable's answer = a TIERED model, not one policy for all 10 endpoints** (recorded in CLAUDE.md §13): shared-ledger APPEND (transactions) = owner ‖ participant ‖ assigned expert; ledger-DEFINING acts (split ratios, deletions) = owner only; emergency data = owner ‖ participant write, assigned expert READ + raise-alert (safety, their real job); social graph (`participants/bulk-invite`) = owner ‖ managing EA only; contracts = owner-only accept; the 3 ungated AI reads = anyone with trip access (must be gated at all — AI spend). Phase 0 ground-truth IN FLIGHT (does a participant even have a `users` row? no code creates collaborator rows today — the model may need plumbing before policy) | Opus | phase 0 first, then Fable ratifies the tier table against the facts | Was: decision-gated |
| L20-old | **(superseded) 7 ungated trip-mutation endpoints, no client callers** (`transactions`, `transactions/split`, `participants/bulk-invite`, `contracts`, `emergency-contacts`, `emergency/initialize`, `alerts`) + 3 ungated reads (`itinerary/schedules|analyze|recommendations` — info disclosure + AI spend) | Opus | **DECISION-MAKER**: trip *participants* legitimately share budget/emergency ledgers, but `authorizeTripLogistics` excludes the collaborator/`friend` role — the correct policy is a real design call, not a mechanical stamp | Found by the P0 lane; backends without surfaces, so no live exposure via the UI |
| L21 | **Dead §9 twins carry the P0 holes**: `trips.routes.ts:544` (comparison-create, no tripId check) and `:1500` (optimize-order, no auth) are born-dead today but would RE-OPEN both holes if the filed 57-duplicate reconciliation ever promotes them | Sonnet | none | Must be carried in the same change as that sweep — note added here so it can't be lost |
| **P0** | **Trip-data IDOR cluster** — `apply-to-trip` destroys any trip's itinerary (comparison-ownership gate only); comparison-create accepts an unchecked caller-supplied `tripId`; `itinerary/reorder` + `itinerary/optimize-order` have zero trip auth. Details in CLAUDE.md §13 | Opus | none — security fix | **IN FLIGHT** (Jul 30). Verified firsthand before dispatch |
| ~~L17~~ | **`TrendingCities` numbers — VERIFIED REAL, CLOSED NO-CHANGE (Jul 30).** All 12 displayed values trace to `travelPulseCities` columns via `GET /api/travelpulse/cities` → `getTrendingCities()`, refreshed by the real `travelPulseScheduler` pipeline; zero fabricated, zero plausible-substitute fallbacks (the `?? 0` guards sit on non-null-default integer columns, so absence genuinely IS 0). The L8 flag did not hold up — **do not re-audit** | — | — | Lane changed nothing; determination WAS the deliverable |
| ~~L19~~ | **CLOSED (12468855, Jul 30): toggle REMOVED, not wired** — evidence-based call: `travelPulseScheduler` refreshes on a hard-coded 24-HOUR interval, so a 60s "live" poll would be theatre against day-stale data. Vestigial helpers + 6 unused imports also removed (each grep-confirmed unused) | — | — | Precedent for the class: check the data's real cadence before wiring a "live" control |
| ~~L19-old~~ | **Dead "Live Updates" toggle** in `TrendingCities.tsx:120-134` — sets `liveUpdates` state that is never wired to `refetchInterval`/polling, so it does nothing (the no-dead-affordance class from Fix #6 batch B); plus vestigial post-refactor dead imports/helpers (`vibeTagColors`, `getCrowdColor`, `getPulseColor`, 6 unused icons) | Sonnet | none | Found by L17 while verifying; either wire the toggle to real polling or remove it |
| L18 | **Two fully-orphaned pages**: `partner-with-us.tsx` + `optimize.tsx` (never imported; App.tsx redirects past them) still carry fabricated earnings claims and sample plans in live-looking JSX. L8 correctly refused to trim a const inside dead files | Sonnet | Fable: confirm whole-file deletion is right vs reviving either page | Also `ui/testimonial-card.tsx` now has zero consumers |
| L16 | **DEFERRED TO BETA (decision-maker, Jul 30): "We will get some real testimonials during the beta testing period."** So the landing page stays without social proof until beta produces REAL reviews — do NOT build a placeholder feed, do NOT re-add fabrications, and do NOT build the per-type stat aggregates speculatively. **Trigger to revisit:** first real beta testimonials exist → then build the curated feed (curation mechanism = admin-approved featured `service_reviews`, to be specified then) | Sonnet when triggered | ratified: wait for beta | Was: "real social proof + per-experience-type stats" |
| L16-old | **(superseded) Real social proof + per-experience-type stats** — after L8 phase 1 strips the landing-page fabrications, the page has no social proof and categories have no stats. Needs: a curated testimonial feed (which real `service_reviews` get featured is EDITORIAL) and/or per-type aggregates (trending, rate ranges, gem/active counts) | Opus | **DECISION-MAKER**: is featured-review curation admin-approved? which stats are worth aggregating? | Do NOT invent either source; honest absence is correct until ratified |
| L14 | **`refunds` table has NO Postgres DDL anywhere** (not in schema.ts, not in any migration — only SQLite-syntax prose in BOOKING_SYSTEM_SETUP.md), yet `refundServiceBooking` + admin dispute-uphold both INSERT into it. If absent on prod: Stripe refund succeeds, audit row 500s (recoverable post-L5 ledger-first, but still a hole) | Opus | **DECISION-MAKER**: prod existence check, then ratify the migration + schema.ts entry | Found by L5; do NOT cut the migration without the prod check — new-table-absent-from-schema.ts interacts with deploy push |
| L15 | **L5 minor residue**: claim-race loser leaves one inert `user_and_expert_contracts` orphan row (contract created before booking insert); cart.tsx key is per-mount (hard-failed attempt returns `duplicate` until remount); prod dup-key check before ever adding the 096/155 index to schema.ts | Sonnet | none | Low severity, well-bounded |
| L13 | **L4a filed follow-ups**: itinerary-item delete orphans legs (`from_activity_id` plain varchar, no FK); trip-leg mutations write no `itinerary_changes`; `/status` (traveler dismiss) 404s on trip legs; **L3a geocode city-centre fallback** (item with no location geocodes to `destination` alone and persists — §13 smell) | Sonnet | Fable brief (change-log role decision; geocode fix is ratification-free) | The geocode fix is the priority item |

*L3a LANDED (commit 4b3686b4, Jul 30): DTO + assembler + full/teaser/preview proven; response backward-compatible
(0 removed / 0 changed keys); gate byte-identical. L3b is unblocked.*
*L1+L2 LANDED (commit 3a5acf07, Jul 30): all five §18 structural items on the real components; 34/34 behavioral
checks incl. all four mode-aware CTA states + desktop regression; sticky-context finding fixed client-side
(DashboardLayout overflow frame no-ops position:sticky — day list got its own scroll container, `sm:contents`
keeps desktop DOM unchanged). L4 (transport legs for expert trips + the leg pickup/booking field mapping) is now
the unlock for the pickup/book-ride CTA states firing on real trips.*
*BATCH 2 LANDED (Jul 30): L13 (5b8c7726 — geocode honesty, trip-leg change-log, orphan-leg cascade),
L5 (c3a0be03 — checkout key required + atomic claim + P0 multi-item fix + migration 155 load-bearing index;
refund ledger-first; legacy createRefund deleted), L11+L12 (22d3c2cb — last §16 transport strays gone,
KML/GPX on the variant producer with deterministic order/no-null-island/versioned cache). Queue now:
**L14 (DECISION-GATED: refunds-table DDL — needs prod existence check)**, L6 (variant-metrics fix, needs
Fable display call), L7 (owner-access auth brief), L8 (mock-data sweep), L15 (minor residue).
Ops note: the mid-run `git stash`/`reset` clobber was traced to the L11+L12 agent's baseline-diff attempt —
both affected lanes recovered surgically and re-verified; standing lane-brief text now forbids git tree
mutations in the shared sandbox.*
*L4b LANDED (commit f48c73c1, Jul 30): Workstation TransportLegsPanel — the L4 loop is COMPLETE end-to-end
(expert builds → generate proposes → expert confirms modes/pickups → traveler Trip Card renders the mode-aware
command center from real confirmed legs). §18's Trip-Card-as-final-product program: L1+L2, L3a, L3b′, L4a, L4b
all landed. Remaining queue: L4 traveler-side data now real → nothing gated; next unblocked lanes are L5 (money
follow-ups, Opus + Fable review), L11 (§16 strays), L13 (geocode smell priority), L12 (needs Fable call), L6-L8.*
*L4a LANDED (commit d0ba3e5b, migration 154, Jul 30): trip-scoped legs live — generate (born-proposed) /
confirm / edit / delete on `authorizeTripLogistics`; assembler emits confirmed legs only (proposals invisible to
every traveler surface, proven); §9 collision resolved by extending the live GET in place; SECURITY FIX: the
`/mode` endpoint's variantOwner-skip hole closed (any-authed-user mutation → 403). L4b (Workstation transport
editor, Sonnet) is the remaining piece of the loop.*
*L3b′ LANDED (commit ed19b0eb, Jul 30): variant producer built (snapshot-only reads, sourceRef, nullable tripId);
share endpoint + OG migrated with an EMPTY before/after response diff (0 removed / 0 changed) and byte-identical
token/expiry/redaction behavior; 69 lines of bespoke assembly deleted; /navigate stays (single-row lookup —
migration would regress); KML/GPX deferred → L12. Circulation state: plancard, share view, and OG all flow
through the ONE assembler with level-appropriate redaction.*
*L3b GROUND-TRUTH OUTCOME (Jul 30, zero code changed — correct escalation): the itinerary-share/OG family serves
`shared_itineraries → itinerary_variants` (variant snapshots, `tripId` nullable via comparison), NOT trips —
cross-data-home; storefront OG is offerings-only (skip); ready-made teasers read the frozen listing snapshot by
design (skip). Resolution: build the §3-named **variant producer adapter** (L3b′) — TripPlan assembled FROM a
variant, keyed on variantId so a share link keeps rendering the exact variant that was shared — then the share/OG
migration becomes in-scope and semantically safe. Not an §3 amendment: "variant + legs" is already a listed producer.*

Lanes L1+L2 are one dispatch once ratified (same files). L3 is the strategic lane and should lead.

---

## 3. The circulating TripPlan object (L3 design frame)

**Premise (decision-maker, Jul 30):** the Trip Card is the final product. The plan must move around the
platform — expert to traveler, traveler surface to traveler surface, Trip Card outward to share/store/social —
as **one object in one format**, not as N ad-hoc shapes.

**Today's fragmentation (why this lane exists):** the same trip renders from at least four shapes —
`trips` + `itinerary_items` (canonical rows), `generated_itineraries` JSON (AI output; no vendor linkage —
found by the plancard lane: vendor phone/confirmation can't render from it), `itinerary_variants` +
`transport_legs` (optimizer), and the assembled `/api/trips/:tripId/plancard` response. Ready-made trips add a
fifth (snapshot inside the store product). Each consumer re-assembles differently; features land on one shape
and silently miss the others.

**Design rule: ONE assembled interchange DTO — `TripPlan` — produced server-side by one assembler, consumed
by every renderer and every channel.**

```
TripPlan v1 (shared/trip-plan.ts — versioned envelope)
├─ meta: { tripPlanVersion: 1, tripId, title, destination, dates, status,
│          origin (content-origin taxonomy), deliveredBy? { expertId, name, avatar } }
├─ days[]: { dayNumber, date, activities[] }
│    └─ activity: { id, title, startTime/endTime, location, lat/lng, mapsUrl?,
│                   meetingPoint, confirmationNumber?, vendorPhone?,
│                   expertNote?, visited, source (platform|expert|sourced-derived|affiliate) }
├─ legs[]: { fromActivityId, toActivityId, mode, durationMin, distance,
│            booked? { pickupPoint, pickupTime, rideRef }, bookVia? 'agent-rail' }
├─ tripNote?: expert trip-level note
├─ budget?: { currency, planned, spentBreakdown[] }
└─ changeLogRef: tripId-scoped (fetched separately — heavy)
```

**Circulation contract:**
- **Circulate by REFERENCE, render from the assembler.** The object that moves between surfaces is
  `tripId` (authed surfaces) or a **share token** (`shared_itineraries` — already exists) — never a copied
  JSON blob. One home per plan; consumers can't drift stale.
- **Snapshot ONLY at money events** (ratified posture): a Ready-Made purchase and a bundle booking freeze a
  TripPlan snapshot into the purchase/booking row. Everything else is live-by-reference.
- **Channel = redaction level, applied by the assembler** (the §10 content-gate generalized):
  `full` (owner / delivered traveler / assigned expert / admin) · `teaser` (store: day + title only, the
  `redactTemplateContent` posture) · `preview` (Direct/OG link cards: title, dates, day count, hero, expert
  attribution — no itinerary body) · `social` (the §17 story/carousel pack — real content only, §13).
- **Producers normalize INTO TripPlan** (assembler adapters): canonical rows; `generated_itineraries` (until
  its consumers migrate to rows — the adapter marks capability gaps honestly: no vendor linkage → fields
  null, never fabricated); variant + legs; ready-made snapshot.
- **Consumers render FROM TripPlan only:** Trip Card (mobile + desktop + `embedded`), expert Workstation
  preview, store product page, itinerary-share view, OG injection, social pack, WhatsApp/Direct link.
- **§17 alignment:** TripPlan is the *payload*; the ratified distribution formats (channel × type × market)
  are the *renderers*. This lane builds the payload once so the format system has one input shape.
- **Versioned envelope** (`tripPlanVersion`) so circulated/snapshotted objects survive schema evolution.

**Build order (after Fable design GO):**
- **L3a (Opus):** `shared/trip-plan.ts` types + server assembler (refactor of the existing plancard
  assembly — it is already 80% of `full`) + redaction levels. No consumer breaks: plancard endpoint returns
  the same shape, now typed as `TripPlan`.
- **L3b (Sonnet):** migrate share-view + OG + store-teaser reads onto assembler levels (delete their
  bespoke assemblies).
- **L3c (Haiku):** consumer-callsite sweep — enumerate every remaining ad-hoc trip-shape read, file each for
  migration or explicit exemption.
- **L3d (Sonnet):** purchase-time snapshot writes `TripPlan` (versioned) into the ready-made purchase row.

**Not in v1:** multi-currency (Stage-2), collaborative cursors, offline sync. The DTO is additive — no
migration required for v1 (snapshot columns exist; `expert_note`, vendor phone, confirmation already land).

---

## 4. Standing rules for this map

- Fable never runs a lane it can brief. An agent never decides what a brief reserved.
- A lane isn't done until: gates green on the **combined** tree, behavioral proof shown, money hunks
  Fable-read, checkpoint pushed.
- This file is the routing table for future sessions: pick the top unblocked lane, honor the tier column.
- Amendments to §3's contract are decision-maker calls (it defines the product's core object).

## 4b. Testing protocol — Fable-minimized (ratified Aug 1, 2026)

Same economics as the build side: **cheap models run and summarize; Fable reads verdicts and
triages money-path failures only.** Rules:

1. **Journeys are repo artifacts, not prompts.** Every browser journey lives as a self-contained
   driver in `scripts/journeys/` (Playwright, `executablePath` from `/opt/pw-browsers`, two-context
   multi-role support, idempotent fixture seeding, JSON verdict output). Writing a NEW journey is a
   one-time Sonnet job; RE-running one is a Haiku job ("run scripts/journeys/X, report the verdict
   table"). Never re-brief a journey that already exists as a script.
2. **Report contract (what reaches Fable):** a per-step verdict table (step · action · UI · DB proof ·
   PASS/FAIL), ≤40 lines, screenshots referenced by filename and attached **only for FAILs** plus at
   most 3 story shots. Full transcripts stay in the runner's output file; Fable never reads them
   unless a verdict is disputed.
3. **Triage tiering:** UI-only failures → Sonnet fixes directly (Fable sees the PR diffstat, not the
   hunks). Anything touching §14/§15 surfaces (payments, routing writes, projections, approvals) →
   Fable reads the failing step + the fix hunks, nothing more.
4. **Two tracks, no overlap:** the sandbox runs everything structural (roles, routing, projections,
   approvals — full site, dummy external keys). The Replit dev tester owns anything needing REAL
   external services (Stripe test-mode confirms via the connector, Maps, AI keys). A journey step
   that needs a real key is marked `EXTERNAL` in the driver and skipped locally, not faked (§13).
5. **DB-proof is mandatory** for every mutation step — a screenshot alone never counts as PASS.
6. Sandbox boot recipe (postgres in /var/tmp + `tsx server/index.ts` with dummy env) is embedded in
   each driver's header so any model or human can run it cold.

## Hole-closing sweep — status board (Jul 30, 2026)

Decision-maker directive: **"lets fix all the holes you have found."** Every known hole is either landed, in
flight, or queued below. Nothing found is being left unaddressed; the queue exists only because lanes that
share a file must serialize (the concurrent-edit clobber earlier today is why).

**LANDED:** P0 (4 trip-data IDOR holes, 4d26971b) · P0-b (generate-itinerary, a564887a) · L5 money hardening
incl. the never-working multi-item checkout + migration 155 (c3a0be03) · L6 metrics (dcde45fb) · L8 landing-page
fabrications (cfecf26a) · L11+L12 §16 strays + exports (22d3c2cb) · L13 geocode/change-log/orphan-cascade
(5b8c7726) · L17 verified-clean-no-change · L19 dead toggle (12468855) · the whole §18 Trip Card program ·
the supply-funnel 401 that lost every guest application (a8d59b27) · **L27-P3** provider location write path +
the `/api/search/experiences` platform-arm reader (346f1139) · **`ai_cost_tracking` declared in `schema.ts`**
before a publish drops it (bacce659).

**L27-P3 out-of-scope findings (filed, NOT fixed in that lane):**
1. **`city` is still client-settable on `provider_services`** — proven: a PATCH persisted `"Fabricated City"`.
   Migration 129 sets `city` only from a real `city_neighborhoods` match precisely so it can't be invented;
   the write path doesn't enforce that. Small fix, own lane (derive from `neighborhood` or drop from the
   editable allow-set).
2. **`duplicateService` copies `location_precision='exact'`** onto the copy along with the coordinates. If the
   duplicate is then re-addressed by free text, it carries a confirmed-pin claim for a point nobody confirmed
   (§13). Either carry both columns or neither — deciding which is a one-line call in that function.
3. **Stale comment in `expert/workspace.tsx`** about platform inventory having no coordinates — true when
   written, false now that the platform arm emits them. Leaving it means the next auditor re-litigates this
   (the `PlanCard.tsx:943` lesson).
4. **`.dark .console-scope` renders dark-on-dark text** — platform-wide, not L27-specific: the warm console
   palette's `--console-fg` isn't inverted under the dark class, so console pages in dark mode lose contrast.
   Affects every back-office page, so it wants its own token lane rather than a per-page patch.

**IN FLIGHT:** L14 refunds audit table (migration 156) · L20 Phase 1 (canonical advisor predicate + 22 ungated
logistics endpoints + 5 hardening items) · P0-d expert cross-trip IDOR · L21 dead-twin holes · L18 orphaned
fabricated pages.

**QUEUED (serialized behind L20 Phase 1, which owns `routes.ts`):**
1. **P0-c** share-token write hole — ratified: a share token is READ-ONLY.
2. **L10 owner-access** — the paying-customer bug: `getTripRole` never reads `trips`, so a bare owner 403s on
   4 live gates, and 3 live paths still mint owner-less trips (a traveler who BUYS a ready-made trip gets
   "Access denied" on the itinerary they paid for). Design = owner row-value branch + harden the 3 write paths
   + the advisor unification L20 P1 is already doing. Must land AFTER L20 P1 so it builds on the fixed predicate.
3. **L22** itinerary-item delete cascade gap.
4. **L15** L5 residue (claim-race orphan contract row; per-mount checkout key).

**§13 round 2 — what it found beyond `/careers` (landed e11dfe30 where actionable, filed where not):**
- **FIXED:** `provider/resources.tsx` "support team available 24/7" behind two handler-less buttons, one offering
  a non-existent community · the "expert will contact you within 24 hours" SLA on `itinerary-comparison.tsx` +
  `itinerary.tsx` (traced first: the endpoint notifies matching experts and creates a `pending` row — no
  assignment, no timer, nobody on a 24h hook; the accurate no-charge-now half was kept, not stripped with it).
- **🔴 `/terms` claims an insurance tier that has not shipped** (`terms.tsx:170`, "Tier 3 … $1,000,000+
  comprehensive coverage"). §6 says the admin-validated `insurance_tier` is FEE-2 Phase 1, unbuilt — today
  insurance is a self-attested boolean. A legal document asserting coverage bands the platform cannot verify is
  the §13 class with legal weight attached, and I will not edit a legal document unilaterally. **Decision-maker
  call.** Same file also carries §8-adjacent rate literals outside `fee_bands` (`:204` 5-15% referral, `:248`
  15-20%, `:300` 75-85%/15-25% expert split, `:303` 4-12% provider) — those are policy statements, not code, so
  they are a separate question from the §8 grep gate.
- **🔴 Seed fixtures would publish as real listing copy if a seed ever runs in prod:** `server/seeds/` holds demo
  provider services claiming "Available 24/7 with flight tracking" / "24/7 WhatsApp support", plus ~16 fictional
  `<surname>@traveloure.com` expert accounts. Harmless as dev fixtures; indistinguishable from real inventory if
  seeded. Worth a "never in prod" guard rather than a copy edit.
- **Judgment calls left alone:** `how-it-works.tsx:65` "24/7 AI assistance" (defensible for always-on software,
  but support-hours-shaped) · GDPR/CCPA boilerplate in `privacy.tsx`.
- **§16, not §13:** `/transportation`'s 12Go deep link sends the traveller off-site for a booking and tracking
  could not be confirmed (the sibling iVisa CTA IS tracked via `/api/affiliates/track`). §16 prohibits untracked
  raw outbound booking CTAs — needs a look.
- **Verified clean** (so nobody re-audits them): `/deals`, `/hidden-gems`, `/transportation`, `/visa-help`,
  `/features`. All data-backed, no mock arrays, no fabricated stats.

**DECISION-GATED (not holes — genuine calls):** L16 real testimonials (deferred to beta by the decision-maker) ·
L20 Phase 2 participant invite→accept plumbing (the feature half of the approved shared-trip access) ·
the remaining trust-claims arms (the `90/10` commission literal, hardcoded cancellation/support copy,
the 2-character-neighbourhood empty-result trap).

## Systematic IDOR sweep — full findings (Jul 30, 2026)

Coverage stated honestly by the sweep: **988 route registrations enumerated**, 58 shadowed/born-dead (56 in
`trips.routes.ts`, matching §9's ~57) → **930 live**; 438 live param-taking endpoints; 174 excluded as
`/api/admin` blanket-guarded (guard verified live); ~207 hand-read; ~162 inferred class-A with ~15 spot-checked.
**NOT covered (a real gap, and it holds bugs — see #13):** resources identified by QUERY PARAM or BODY rather
than a path param. Classes: **A** resource-scoped · **B** role-string only · **C** session-only · **D** no auth
at all · **E** authorizes a DIFFERENT resource than it mutates (the most dangerous shape).

**Confirmed landed today:** `apply-to-trip` authorizes before the delete; inline comparison-create guarded; the
whole L20 22-endpoint logistics cluster on the canonical helpers.

### P0 — destructive / money / reachable
| # | Endpoint | Class | Scenario | State |
|---|---|---|---|---|
| 1 | `PATCH /api/concierge/requests/:id` (`concierge.routes.ts:123`) | **D** | **Unauthenticated.** Anyone flips any user's tier to `full` and **creates a billable `coordination_states` engagement** in their name (§7 $499/8% path). Sibling `/claim` requires an HMAC token — proof of oversight | **IN FLIGHT** |
| 2 | `POST /api/trips/:tripId/vendors/bulk-email` (`trips.routes.ts:1279`) | **E** | Sends attacker-authored mail to another user's real vendors; `contractIds` also caller-supplied and untied to the trip (2nd IDOR) | **IN FLIGHT** |
| 3 | `POST /api/trips/:tripId/contracts/:contractId/documents` (`:1255`) | **E** | `tripId` never read; forged file attached to ANY vendor contract | **IN FLIGHT** |
| 4 | ~~`POST /api/vendor-availability/:id/book`~~ | C | Exhausted a provider's sellable inventory free — no booking row, no payment, no release path | **CLOSED — ENDPOINT DELETED** (provider money-hardening lane, ruling 42 / audit AC-1). No consumer + irreversible effect ⇒ deleted, not gated. `storage.bookSlot` survives as the checkout spine's atomic claim |
| 5 | `DELETE /api/provider/blackout-dates/:id` (`experts.routes.ts:473`) | **B** | Provider deletes another provider's blackout row | **IN FLIGHT** |
| 6 | `PUT /api/provider/booking-requests/:requestId/respond` (`:507`) | **B** | **Provider ACCEPTS another provider's booking request** (live client consumer) | **IN FLIGHT** |
| 7 | `PATCH /api/affiliate-booking-requests/:id` (`content.routes.ts:6803`) | **B** | **Any expert self-assigns another's request and rewrites `price`** — §16 commission rail. Body was hardened against mass-assign; no ownership check added | QUEUED (content.routes.ts busy) |
| 8 | `PATCH\|DELETE\|POST /api/affiliate/partners/:id[/scrape]` (`content.routes.ts:7297,7314,7328,7340`) | C | **Any authenticated traveler deletes platform affiliate partners** / triggers billable crawls. Admin-page-only intent | QUEUED |

### P1
| # | Endpoint | Class | Note |
|---|---|---|---|
| 9 | `DELETE /api/notifications/:id` (`content.routes.ts:2365`) | C | Destructive; **sibling `/read` DOES check ownership** |
| 10-12 | `DELETE\|PATCH /api/user-experience-items/:id`, `GET /api/user-experiences/:id` | C | **Every other sibling checks `experience.userId`**; PATCH also raw-body mass-assign |
| 13 | `GET /api/trips/:tripId/vendors/contact-sheet` (`trips.routes.ts:1309`) | C | Bulk vendor PII (JSON/CSV/PDF) — **IN FLIGHT** |
| 14 | `GET /api/itinerary/:tripId/transport-hub` (`transport-hub.routes.ts:29`) | C | Either comparison-id or trip-id works; 3 live callers — **IN FLIGHT** |
| 15 | `POST /api/transport-booking-options/seed/:variantId` (`:436`) | C | "dev/test" but mounted live — **IN FLIGHT** |
| 16 | `PATCH /api/notifications/:id/read` (`content.routes.ts:2346`) | — | **Check-AFTER-mutate**: write executes, then 403; no rollback. The `apply-to-trip` lesson in miniature |

### P2 (data exposure / integrity)
17 `GET /api/trips/:tripId/expert-request-status` · 18 `GET /api/analytics/expert-match-trends/:expertId` ·
19 `POST /api/recommendations/:id/convert` (client-supplied `revenueGenerated` → analytics poisoning) ·
20 `POST /api/recommendations/:id/dismiss` · 21 `GET /api/custom-venues/:id` (class D; PATCH/DELETE are gated) ·
22 `POST /api/recommendations/refresh/:city` (compute abuse).

### ~~DECISION-MAKER GATED — no ownership column exists~~ → CLOSED (migration 157, ebcdb452)
Decision-maker ratified adding the column. Two corrections to the original filing, both material:
① this was **not** unowned legacy — `/api/checkout` is a **live writer** creating one contract row per cart
item, so the exposure grows with volume, and **both** readers are live (`experts.routes.ts` is mounted; §9's
"imported-but-unmounted" note is stale for that file). Retiring the endpoints was therefore never viable —
the rows accumulate whether or not anything reads them. ② the backfill is a **deterministic join, not a
heuristic**: `service_bookings.contract_id` already links each contract to the booking carrying both
principals, so historical attribution is recovered by foreign key. Rows with no booking stay NULL and both
gates treat NULL as **admin-only**. `createContract` now takes both principals as required keys (L28) —
proven by sensitivity (TS2345 when omitted). Full 4-actor × 2-row gate matrix proven on a throwaway DB.
**Also fixed en route:** `POST /api/visa/requirements` called an undefined `visaRateLimit(ip)`, so every call
to that public unauthenticated (billable) endpoint threw a ReferenceError — the undefined-`requireProviderRole`
shape §9 records. Implemented with the real `createRateLimiter`.

### DECISION-MAKER GATED (other) — no ownership column exists
**`user_and_expert_contracts`** (`shared/schema.ts:1004-1015`) has **no `userId`/`expertId`/`tripId`**. So
`GET /api/contracts/:id` (`routes.ts:5719`) returns any contract's title, **amount**, `paymentUrl` and
`attachment`, and **cannot be fixed at the route** (live caller `contract-view.tsx:53`). Same root cause as
`GET /api/expert/contracts/recent`. **Either add an owner FK + backfill, or retire both endpoints.** Do not
invent a linkage.

### L28 — THE SYSTEMIC ROOT CAUSE (the highest-leverage item on this board)
**75 `server/storage.ts` functions fetch/mutate by bare id with no owner predicate** (39 mutating, 36 reading).
Most are safe *today* only because callers fetch-then-check — and every provider hole above is a case where that
discipline lapsed. Already load-bearing in live holes: `deleteProviderBlackoutDate:4607`, `updateBookingRequest:4647`,
`bookSlot:2449`, `getContract:2117`, `deleteNotification:2184`, `markAsRead:2170`, `getUserExperience:2283`,
`updateUserExperienceItem:2330`, `removeUserExperienceItem:2338`. Highest-risk currently-safe destructive mutators:
`deleteTrip:784`, `deleteItineraryItem:4842`, `deleteProviderService:1223`, `deleteCoordinationState:2557`,
`deleteCoordinationBooking:2600`, `deleteVendorAvailabilitySlot:2439`, `deleteExpertTemplate:3250`,
`deleteActivityComment:4796`, and the two payout claims `:3882`/`:3890` (money).
**Ratified direction: require the actor id in destructive storage signatures** so the gate is a COMPILE ERROR
rather than a review item — the EA subsystem already does this (`getEaClientRelationshipById(id, eaUserId)`) and
is the only subsystem the sweep found clean throughout. Roll out incrementally, starting with the functions the
P0 lanes are already touching; grep callers before each signature change.

### L29 — the uncovered surface
Enumerate and classify endpoints whose resource id arrives by **query param or request body** (`?tripId=`,
`body.tripId`, `body.contractIds`). The sweep explicitly did not cover these, and finding #2's `contractIds`
proves the class is live.

## Table-existence sweep — results (Jul 30, 2026)

Method disclosed by the sweep as necessarily approximate (ORM-variable scan has false negatives — e.g.
`trip_contexts` shows 0 hits because its router uses raw SQL), **but every MISSING claim was hand-verified by
reading the file/line.** No dynamically-constructed table names found. ~250 EXISTS-IN-BOTH.

### MISSING-FROM-BOTH — 8 tables, all in three legacy service files parallel to the canonical booking system
The valuable part is the **reachability tracing**, which downgrades most of these:
| Tables | Where | Live-reachable in prod? |
|---|---|---|
| `affiliate_links`, `affiliate_conversions` | `affiliate.service.ts:312,344,362,369,393,405` | **YES — the only genuinely live one.** `trackLinkGeneration` runs from `processCart` for any `bookingType:'external'` item, and `ItineraryComparisonWithBooking.tsx:63-66` sets that for transport/accommodation items. **Failure is fully silent** (internal try/catch → `console.error`; the caller still returns a valid link), so **every affiliate link generated this way is never persisted — no row, no click/conversion attribution.** Real invisible data loss, low severity, no crash |
| `service_providers`, `dynamic_pricing` | `pricing.service.ts:62,92`; `availability.service.ts:30,76` | Route live + money-adjacent (`POST /api/bookings/process-cart`) but **no traced prod UI feeds it a real `providerId`** — the live caller always sends `undefined`; the one that doesn't is dev-only-gated. `checkAvailability` FAILS OPEN. `getAvailabilityCalendar` returns a real 500 |
| `promo_codes`, `promo_code_usage` | `pricing.service.ts:152,167,208,215` | **Doubly dead** — broken AND unreachable: the only client caller is `client/src/lib/bookingAPI.ts`, which has ZERO importers. Raw Postgres error text leaks to the client as JSON when reached. **Downgrades L26** — it is not a live 500 for users |
| `capacity_reservations`, `blocked_dates` | `availability.service.ts:146,172,192,195,244,262` | No — all six methods have zero callers anywhere |

### 🔴 The important structural finding — now recorded in CLAUDE.md
The drizzle-push trap **applies to TABLES too**. `ai_cost_tracking` (migration `025b`, absent from `schema.ts`)
is on a real hot path — ~7 writers plus an admin reader — and would be silently, permanently lost on a publish
that drops it, because the migration is already stamped. **Action: declare `ai_cost_tracking` (and
`service_demand_requests`) in `shared/schema.ts`**, same fix pattern as the migration-155 index. This is the
cheapest high-value item on the board.

**LANDED (bacce659) — and the mechanism is now proven, not inferred.** With `service_demand_requests` present
in the DB but undeclared, the push plan emitted exactly `ALTER TABLE … DISABLE ROW LEVEL SECURITY;` +
`DROP TABLE "service_demand_requests" CASCADE;` — the loss mechanism verbatim, for a TABLE. `ai_cost_tracking`
is declared to match `025b`'s DDL exactly; the residual push plan now mentions it zero times, verified both in
isolation and with the full schema materialized then the table re-created from the migration. One trap worth
carrying forward to any future index declaration: **drizzle's bare `.desc()` emits `DESC NULLS LAST`, but
Postgres defaults `DESC` to `NULLS FIRST`** — so declaring a `created_at DESC` index without `.nullsFirst()`
makes the push DROP + CREATE it on *every* publish. Measured, not theorized.

**BOTH CLOSED (3bb1f291), premises confirmed against prod AND dev by the decision-maker.**
- **Idempotency index DECLARED.** 0 duplicate non-NULL keys in either environment (prod: 0 of 7 rows even
  carry a key; dev: 2, both distinct), and the live `indexdef` matches what the declaration emits — so the
  publish cannot fail on it and the destructive copy-over prompt cannot be triggered.
  **Method warning worth carrying forward: `drizzle-kit push --strict` gave a FALSE PASS here** — it reported
  zero idempotency statements for the correct declaration AND for a deliberately wrong one (the plan renders
  the FK phase and aborts at the TTY prompt before index diffing). Do not use push-plan silence as index
  evidence. `drizzle-kit export` IS sensitive (it distinguished correct / missing-predicate / non-unique), and
  the decisive check is that Postgres normalizes drizzle's emitted DDL and the live `pg_indexes.indexdef` to
  byte-identical text — same object, no churn.
- **`service_demand_requests` RETIRED** by migration 158 rather than left for the push to drop silently: 0 rows
  + 0 FK dependents in both environments. Guarded — it REFUSES to drop a non-empty table and raises the row
  count instead, so the retirement can't destroy data if the premise changes before it applies. All three
  branches proven (drop / already-absent / refuse).

**(historical) `service_demand_requests` — DECISION-MAKER GATED, and the clock is the next publish.** Deliberately NOT
declared: zero code references either way (so a drop loses no data), and it is redundant against the live
`service_demand_signals` and migration-123 `service_requests`. Declaring it would pin dead weight into the
canonical schema and quietly ratify keeping it forever. But the drop is one-way — migration 080 is stamped, so
`runMigrations()` will never recreate it. **If the intent is to keep it for a future demand-request feature it
must be declared before the next publish; otherwise the deploy tool makes the retirement decision by default.**
Recommendation: let it go, and retire migration 080 to a no-op with a note.

### Automated drift guard — `scripts/check-undeclared-tables.cjs`

**Registered as a CI validation workflow** (`check-undeclared-tables` in `.replit`). Run it any time before a publish:

```
node scripts/check-undeclared-tables.cjs              # uses DATABASE_URL
node scripts/check-undeclared-tables.cjs "<url>"      # explicit connection string
node scripts/check-undeclared-tables.cjs --self-test  # no DB needed
```

The script scans **all `.ts` files under `shared/`** for `pgTable("name")` declarations (covering `schema.ts`, `models/auth.ts`, `models/chat.ts`, `guest-invites-schema.ts`, and any future split-outs), then queries `information_schema.tables` for every `public` BASE TABLE in the dev DB, and exits non-zero on any table present in the DB but absent from the declarations — those are the objects drizzle-kit push would silently DROP.

**Known-excluded lists in the script:**
- `RETIRED_TABLES` — tables physically removed by a recorded guarded migration (013, 158, 167, 168, 176). Add here only *after* the DROP migration is written and applied.
- `SYSTEM_TABLES` — `schema_migrations` (migration ledger) and `sessions` (connect-pg-simple self-creates).

**Maintaining the lists:** when you retire a table via a guarded migration, add it to `RETIRED_TABLES`. When you declare a new table in `shared/schema.ts` (or any file under `shared/`), the script picks it up automatically — no list update needed.

**Status (Aug 2026):** dev and prod both clean — `node scripts/check-undeclared-tables.cjs` exits 0. The only finding from the initial run (`_deprecated_expert_city_queues`) was retired by migration 226 (archive-then-guarded-drop, following the migration-158 pattern; all 10 rows were empty seed records archived to `legacy_archives`). The unregistered `server/migrations/scheduled_drop_deprecated_city_queues.sql` is now superseded by migration 226 and can be ignored.

### Housekeeping
- ~31 tables exist with zero code references (INFERRED, not hand-verified per table): `board_items` (migration 133's
  ready-made "boards" feature has no reader/writer at all), `affiliate_platforms`,
  `expert_handoffs`, `platform_fees`, `trip_selected_*`, etc.
- `sessions` being schema-only is **correct, not a gap** — deliberately excluded from the baseline dump because
  `connect-pg-simple` self-creates it.
- Top-level `migrations/` dir: **no live gap remains** (all 4 tables it creates are in the baseline). 5 files sit
  in `server/migrations/` unregistered; **none create tables** (verified) — the documented duplicate plus 3
  superseded seed/restore files plus a not-yet-due future DROP.

---

## TRIP-CANON — the consolidated program (Jul 31, 2026)

**Master brief: `docs/planning/TRIP_CANON_MASTER_BRIEF.md`** — synthesizes the item-lifecycle map, the
Trip-Gravity audit, the reconcile brief, the Phase 1 scope, and the routing-state contract into ONE gap
registry (19 findings, each mapped to exactly one lane) and one dependency-ordered plan (merge → Lane 1
reconcile 1a–1d → Lanes 4/5/6; Lanes 2/7/G parallel; Lane 3 gated on its own decision-maker brief).
Supersedes the per-document reading order for execution purposes; the sources stay authoritative for their
own detail.

## MP — Marketplace bridge program (proposed Jul 30, 2026; awaiting decision-maker sign-off)

**Origin:** the decision-maker's design question — *"Discover becomes the bridge connecting both stores; push the
most popular product to Ready Made Trips and the most popular services to Browse Services, leading users to each
store."* The bridge instinct is right and half-built. Two corrections came out of ground-truthing it, and they
change the shape of the work.

### Ground truth that reshaped the proposal

**① The two lanes are NOT role-separated.** `provider_services` is role-agnostic (CLAUDE.md "one builder" —
`ServiceForm` serves both roles), and the storefront services lane filters on `userId`. So an **expert's** service
listings appear in Browse Services alongside providers'. The real split is: expert = services + ready-made trips;
provider = services only. Consequence: "popular services → routes users to providers" is false — it routes to
whoever owns the listing, often an expert. The nav's "Service Providers" label for `?tab=services` is therefore
already wrong.

**② Ready-made authorship is expert-only, by construction.** `AUTHOR_ROLES = {local_expert, travel_expert, admin}`
(`ready-made.routes.ts:33`, DB role lookup). A ready-made trip is born from a Workstation `trips` row
(`sourceTripId NOT NULL`), and §17 gives the provider console no Workstation — so a provider has nothing to ship.
Their storefront runs the ready-made lane, finds zero rows for their `authorId`, and the section doesn't render.
Empty by construction, not hidden by a flag. **Nothing to build here; this is correct as-is.**

**③ The bridge's RETURN PATH is the actual gap.** Discover already renders the ready-made shelf from
`/api/ready-made` in the packages tab, sectioned by author type, hidden when empty. But there are only **two**
inbound links to `/p/:handle` in the entire client — the service-detail breadcrumb and an expert-detail redirect.
**No Discover card links to a storefront.** A traveler can find an item and has no path from "I like this" to
"show me everything this person offers." That is the compounding piece and it is missing.

**④ "Most popular" is a §13 hazard at current volume — RECOMMEND DEFERRING.** Prod holds **7 `service_bookings`
total, 0 with an idempotency key** (verified by the decision-maker Jul 30) — effectively no completed purchase
history. `/api/ready-made` orders by `desc(reviewedAt)` (approval recency) and has no sales signal at all. Ranking
by popularity over n≈0 produces an arbitrary order wearing a credibility label: real data, false impression — the
same class as the sparse plan map (L27) and the fabricated ratings (§13, PR #177). There is also a marketplace
dynamics problem: popularity ranking is rich-get-richer, so in a supply-constrained one-market wedge (§12) the
first seller to land a sale locks the top slot and sellers 2..n never get impressions. Editorial curation is both
more honest and better for liquidity at Kyoto scale.

### Phases

| # | Phase | Tier | Depends on | Ships |
|---|---|---|---|---|
| MP-1 | Nav + vocabulary honesty | Haiku | — | all four tabs listed, store lane findable |
| MP-2 | Storefront return path | Sonnet | — | item → `/p/:handle` from every card/detail |
| MP-3 | Honest curation (Featured, not "Popular") | Sonnet | MP-1 | admin-curated shelves, honest labels |
| MP-4 | Providers credited inside ready-made trips | Sonnet | MP-2 | expert lane → provider storefronts |
| MP-5 | Real popularity ranking | Sonnet | **GATED on volume** | deferred, see threshold |

**MP-1 — nav + vocabulary (cheapest, unblocks everything).** `client/src/lib/nav-config.ts` is the single source
of truth for every navbar href. Changes: (a) add **Ready Made Trips** → `/discover?tab=packages` to the Discover
BROWSE section — today the entire expert store lane has NO nav entry anywhere; (b) move the services entry into
the Discover group and rename it off "Service Providers" (per ①, experts sell there too) — proposed **"Browse
Services"**, matching the decision-maker's own vocabulary; (c) align **"By Date"** with the tab it opens.
*Recommended:* nav → **"By Event"**, since the tab, the content (`destination_events`), and the `?tab=events`
routing token all already say events — a label-only change with nothing else to move. Renaming the tab to
"By Date" instead would re-open the label/token gap §10 hit with `packages`. **Routing tokens do NOT change**
(`?tab=packages`/`?tab=services`/`?tab=events` are the URL contract, §10 label-standard precedent).

**MP-1b — the page name (DECISION-MAKER CALL, blocks nothing else).** "Discover" says nothing about two of the
four tabs being purchases. *Recommendation:* **Marketplace** — it pairs with the already-ratified seller-side
vocabulary (store / storefront / "ship to store", §17) and covers all four tabs. Alternatives: **Explore**
(warmer, same weakness as Discover), **Book** (strongest commerce signal but reads as an action while two tabs are
browsing), or keep "Discover" and treat the nav gap alone as the defect. **Route stays `/discover`** whatever is
chosen — label only, no redirect, no URL contract change.

**MP-2 — the storefront return path (the compounding piece).** Add "More from this expert/provider" →
`/p/:handle` on: ready-made detail, expert-template detail, service detail (breadcrumb exists — make it a real
section), and the Discover cards for all three lanes. **`users.handle` is nullable** — an earner who hasn't
claimed one has no page, so the link must be conditional and absent (never a dead link); `service-detail.tsx`
already carries that guard as the precedent to copy. Storefront reads are already approval-gated per lane, so no
new read-gate work. §13: no "12 other offerings" count unless it is a real count.

**MP-3 — honest curation.** `isFeatured` already exists on the services/templates tables (real admin-set flag) and
`ready_made_trips` has `badge`. Order shelves `featured → recency` and label them **"Featured in Kyoto"** — an
editorial choice the platform stands behind — NOT "Most popular," a demand claim the data cannot support. Show a
real rating only when `reviewCount > 0`, else "New" (the PR #177 pattern). Needs an admin toggle for
`ready_made_trips` if we want it curated (it has `badge` but no `isFeatured`) — additive nullable if so.

**MP-4 — providers credited inside ready-made trips (the stronger bridge).** The lanes are not economically
independent: a ready-made trip is built from the Workstation Add panel, which sources **platform services**, so a
trip can literally contain provider inventory. Crediting those providers on the trip detail page ("services inside
this trip, by …" → their storefront) drives expert-lane traffic into provider storefronts on a **real
relationship**, not a popularity heuristic — and it is the direction §17's one-content-network model already
points. Scope check first: `insideCounts` is a count snapshot, so per-provider attribution may need the itinerary
join rather than the snapshot.

**MP-5 — real popularity ranking, GATED.** Not a build, a threshold. The infrastructure already exists
(`salesCount`, `reviewCount`, `averageRating`, `content_impressions` for click-through). Turn it on when a lane
has enough completed purchases that an ordering is a *finding* rather than noise — proposed floor: **≥25 completed
purchases in the lane and ≥5 distinct sellers**, so it cannot be one seller's three sales. Until then MP-3's
editorial shelf holds. Revisit after beta (ties to the L16 real-testimonials deferral — same "wait for real
volume" posture).

### Status (Jul 30, 2026)

**MP-1 + MP-2 LANDED** (`1573e18e`). Nav lists all four tabs under "Marketplace" (decision-maker
confirmed the page name); the shared `StorefrontLink` return path is on ready-made + service detail.
Two scope calls recorded there: the expert-template detail page was skipped (§10 forbids new features
on that sunsetting lane) and Discover cards were skipped (already `<Link>`-wrapped — nesting would emit
invalid anchors). The planned "By Date"→"By Event" rename was DROPPED: nav and tab already agree, and
only the internal `?tab=events` token differs, which is the URL contract, not a label.

**MP-3 LANDED** (`c56036c8`) — and it was bigger than "sort by featured", because the one query it
touched carried two live defects:
- **F2 read-gate leak (P1).** `GET /api/discover/location/:city` is public + unauthenticated +
  `Cache-Control: public`, and filtered only `status='active'` — so born-`submitted` listings were
  being served on the public city page (2 rows, proven on a real DB). `status` is the owner's on/off
  switch, never an approval. Gated on `approval_status='approved'`.
- **Inverted featured sort.** `.orderBy(isFeatured)` is ASC, and Postgres orders `false < true`, so
  admin-featured services sank to the BOTTOM. Replaced with the existing bounded-boost primitive
  rather than `desc()` (which is the naive ranking that primitive exists to prevent).
- **featured-sort itself had a young-marketplace bug:** it treated UNMEASURED (no reviews) the same as
  measured-below-floor, so every item scored 0 and the editorial boost could never land. Unmeasured now
  takes the boost; measured-but-low still forfeits it.
- **Ready-made curation lever was dead:** `badge` was read on all four public DTOs and rendered, with
  **zero writers** anywhere in the repo. Added an admin-only, approved-only PATCH validated against a
  new CLOSED vocabulary (`shared/ready-made-badges.ts`) that deliberately excludes "Most popular"/
  "Best selling" (§13 — the lane has no rating/review/sales aggregate to back a demand claim), plus a
  Store-curation section on the admin approvals page. Feed orders badged-first, then recency.

**MP-4 — SUPERSEDED (Jul 31, 2026): absorbed into the item-lifecycle program.** Hand-testing found four
defects (share-link renderer, no add-card flow, dead preference chips, cart→trip losing the ability to pay)
that trace to one missing design: the item lifecycle across the commerce/planning seam. Full map, hole
inventory (H1–H8, receipts per edge), and the ratification-gated fix program: `docs/E2E_ITEM_LIFECYCLE.md`.
MP-4's TripPlan amendment ask is now that program's L-D — one ratification closes both.

### MP-4 — why it stopped, and the decision it needs

MP-4 (credit the providers whose services sit inside a ready-made trip) is buildable — the data path is
real: `ready_made_trips.sourceTripId` → `itinerary_items.providerServiceId` (a live FK, written by the
Workstation's service picker) → `provider_services` → the owner's storefront. But **both** ways to
surface it cross a ratified boundary, so neither is mine to choose:

- **Public credit on the store detail page** (the version that drives the most traffic) would list the
  vendors inside a trip to anyone, unpaid. That is a partial disclosure of the paid product (§10's
  content-gate — the itinerary is what the buyer is buying) and it is a **disintermediation vector**:
  a visitor could read off the vendor list and book each one directly, which is exactly what the §16
  agent-booking rail exists to prevent. The public DTO currently exposes only `insideCounts` (counts by
  type) — deliberately, and that restraint looks correct.
- **Buyer-side credit** (link each provider-backed item in the buyer's own trip to its service page,
  which then reaches the storefront via MP-2) leaks nothing — the buyer already owns the content. But
  `providerServiceId` is **not in the TripPlan DTO**, and §18 makes TripPlan a ratified contract whose
  **amendments are decision-maker calls**. Adding a field is an amendment.

**Recommendation: build the buyer-side version**, i.e. amend TripPlan to carry `providerServiceId` at
the `full` redaction level only. It keeps the content-gate and the anti-disintermediation posture
intact, it composes with MP-2 instead of duplicating it, and it credits providers on a real
relationship (this trip actually contains their service) rather than a popularity heuristic. The public
version should stay unbuilt unless you decide the marketing value outweighs the disintermediation risk.

### Explicitly NOT in this program
Provider-authored ready-made trips (structurally correct as-is, ②) · any change to routing tokens · the
`AUTHOR_ROLES` role-list question (filed separately below) · multi-market expansion (§12 paused).
