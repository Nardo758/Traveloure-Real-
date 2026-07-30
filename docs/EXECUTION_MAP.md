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

## Hole-closing sweep — status board (Jul 30, 2026)

Decision-maker directive: **"lets fix all the holes you have found."** Every known hole is either landed, in
flight, or queued below. Nothing found is being left unaddressed; the queue exists only because lanes that
share a file must serialize (the concurrent-edit clobber earlier today is why).

**LANDED:** P0 (4 trip-data IDOR holes, 4d26971b) · P0-b (generate-itinerary, a564887a) · L5 money hardening
incl. the never-working multi-item checkout + migration 155 (c3a0be03) · L6 metrics (dcde45fb) · L8 landing-page
fabrications (cfecf26a) · L11+L12 §16 strays + exports (22d3c2cb) · L13 geocode/change-log/orphan-cascade
(5b8c7726) · L17 verified-clean-no-change · L19 dead toggle (12468855) · the whole §18 Trip Card program.

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

**DECISION-GATED (not holes — genuine calls):** L16 real testimonials (deferred to beta by the decision-maker) ·
L20 Phase 2 participant invite→accept plumbing (the feature half of the approved shared-trip access) ·
the remaining trust-claims arms (the `90/10` commission literal, hardcoded cancellation/support copy,
the 2-character-neighbourhood empty-result trap).
