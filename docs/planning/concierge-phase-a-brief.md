# Concierge Phase A Execution Brief

**Source:** Concierge Implementation Plan (revised, 2026-06-05). Phase A only — pay-per-use AI Concierge + Expert escalation, à la carte. Phase B ($9 tier) and Phase C (Full/DFY transactional) are out of scope here.
**Target agent:** Claude Code, working in the repo working tree.

---

## DEPENDENCIES — DO NOT START WITHOUT THESE

1. **Launch-Blocker Phase 3 is merged.** `optimization.routes.ts` is mounted, `/api/optimization-preview` returns JSON (not the SPA), `/api/optimization-payments` is reachable, the ungated free public path to full LLM optimization is closed. If P3 isn't in, this brief does not start.
2. **Per-expert commission override is a HARD GATE on beta outreach, not on this brief.** No real beta-expert outreach with the §6.9 "20% vs 25%" language has gone out. Phase A may ship before that override exists. **However:** the override (one nullable `commissionRateOverride` column on the expert + one branch in `commission.ts:resolveCommissionRates:41-93` before the category fallback + admin field in the expert approval form) **must land before the first beta DM with the reduced-commission language is sent.** Track it as a known follow-up; do not roll it into Phase A; do not let beta recruitment kick off until it's in.

---

## HOW TO USE THIS BRIEF — READ BEFORE WRITING ANY CODE

1. **Read this entire document first.** Phases share context (the fee resolver, the concierge router, the new `concierge.routes.ts` module). The order is deliberate.
2. **Work strictly in phase order.** P1 → P2 → P3 → P4 → P5 → P6 → P7. Do not jump ahead or batch.
3. **Stop at each verification gate.** Every phase ends with a grep + `tsc --noEmit` check and a commit. If a gate fails, fix before moving on.
4. **File:line references are starting points, not gospel.** Confirm by reading the file before editing.
5. **One commit per phase**, message prefix `feat(CON-A.Pn): …`.

---

## OPEN DECISIONS — RESOLVED

| # | Decision | Resolution |
|---|---|---|
| D1 | Intent capture | Free-text + 4 chips: `intent`, `eventType` (optional), `destination` (optional), `dates` (optional) |
| D2 | Escalation CTA | Always visible, soft (not red/urgent), top of PlanCard + once per day-section |
| D3 | Concierge spend rail | Card-first; credits accepted on user toggle (Phase A: card only — credits toggle deferred to a follow-up) |
| D4 | Expert availability fallback | Queued with est. price + ETA when no in-market expert available |
| D5 | AI Concierge fee shape | Per-event-type mapping (FEE-A in P1); §4.8 defaults `$9.99 standard / $49.99 event / 5 credits / $0=off`. Event slugs that map to $49.99: `wedding`, `proposal`, `corporate` |
| D6 | Free preview | Guest, no auth (already true after LB-P3) |
| D7 | "One AI plan" unit | Per trip; free re-runs within 24h on the same trip (matches `optimization.routes.ts:91-105`) |
| D8 | Concierge entry placement | Primary header CTA + slot on every PlanCard |
| D9 | Old `/optimize` URL | 301 redirect `/optimize` → `/concierge?tier=ai` |

---

## GLOBAL "WHAT NOT TO DO"

- **Do not** introduce any hard-coded fee/rate/price literal. Every rate resolves from `optimization_fees`, `booking_fee_configs`, or the §4.8 defaults table as fallback. Per-event-type AI Concierge defaults live in the config table, not in code.
- **Do not** add new routes to `server/routes.ts`. All Concierge endpoints go in `server/routes/concierge.routes.ts` (new module).
- **Do not** repurpose `expertAiTasks` (`shared/schema.ts:2057`) — that's Expert Content Studio tooling. New table for traveler intent log.
- **Do not** auth-gate `/api/concierge/quote` (the price-quote endpoint) or any `/api/optimization-preview` path. The free heuristic + free quote is the guest hook.
- **Do not** build the $9 tier, subscription rail, allowance counter, overage logic, priority routing, or Full/DFY transactional flow. Those are Phase B/C.
- **Do not** add a per-expert commission override in this brief — it is sequenced separately (see Dependencies).
- **Do not** wire credits-as-payment in Phase A. Card-first per D3.
- **Do not** touch `commission.ts`'s hard-coded `EXPERT_SHARE_RATE`, `PLATFORM_FEE_RATE`, `AI_PLATFORM_FEE`, `AFFILIATE_PLATFORM_FEE` constants — those are the cross-cutting FEE workstream's problem.
- **Do not** refactor unrelated code "while you're in there."

---

## PHASE 0 — Orientation & Baseline (no code changes)

**Objective:** Confirm dependencies are met and capture a clean baseline.

**Steps**
1. Confirm working tree is clean and on a fresh branch off the main line.
2. Capture baseline typecheck: `npm run check` (or `tsc --noEmit`). Save the output — you need to know which errors pre-exist so you don't get blamed for them.
3. Verify LB-P3 prereqs are merged:
   ```
   grep -rn "optimization.routes\|optimizationRouter" server/         # expect a single registration
   grep -n "499\|999\|1999" server/routes/optimization.routes.ts      # expect §4.8 values, not the old defaults
   ```
4. Verify the old `/optimize` page still exists at `client/src/pages/optimize.tsx` (we will redirect it in P5, not delete it).
5. Confirm `expert_requests` table is present at `shared/schema.ts:5212` and `POST /api/expert-requests` is live at `server/routes/booking-actions.ts:104`.

**Verify / Gate:** Baseline captured; LB-P3 confirmed live; no code changed.

---

## PHASE 1 — FEE-A: Per-event-type AI Concierge fee config

**Objective:** §4.8 prescribes the AI Concierge fee as **per-experience-type** ($9.99 standard / $49.99 event / 5 credits / $0=off). The current `optimization_fees` table is keyed by complexity tier (`simple/standard/complex`), with the event-type-to-tier mapping hard-coded at `server/services/smart-sequencing.service.ts:915-921`. Make the mapping admin-editable and add the `$0=off` semantic.

**Files**
- `shared/schema.ts:876-885` (`optimization_fees` table — extend)
- `server/services/smart-sequencing.service.ts:915-921` (`complexityTier()` — read from DB, not hard-code)
- `server/routes/optimization.routes.ts:42-52` (`getFeeForTier` — respect `$0=off`)
- `client/src/pages/admin/fee-config.tsx:471-499` (admin UI — add event-type rows)
- `server/routes/admin.routes.ts:4208-4254` (admin endpoints — accept event-type field)
- Migration in `server/migrations/` (per CLAUDE.md)

**Steps**
1. **Schema:** add an `event_type` column to `optimization_fees` (nullable; null = the existing tier-level default). Keep `complexity_tier` for backwards-compat. Add an `is_disabled` boolean (the "$0=off" semantic — clearer than overloading a $0 price, which could legitimately mean a promo).
2. **Migration (per CLAUDE.md, `server/migrations/`)** — add the columns and seed §4.8 defaults: `$9.99` for the `standard` tier (no event-type), `$49.99` rows for event_types `wedding`, `proposal`, `corporate`. Existing `simple/standard/complex` rows stay.
3. **Resolver:** in `getFeeForTier` (`optimization.routes.ts:42-52`), accept an optional `eventType` arg. Prefer the row matching `(event_type = eventType AND is_active AND NOT is_disabled)`. Fall back to the tier match. If `is_disabled`, return a discriminated result and the caller refuses the charge (do NOT silently bill).
4. **Caller:** in the `POST /api/optimization-payments` handler, pass `eventType` from the trip/comparison context.
5. **`complexityTier()` mapping** (`smart-sequencing.service.ts:915-921`): replace the hard-coded switch with a DB read of an `experience_type_tier_map` (or reuse `experience_types` if a column exists — check first). If the mapping table doesn't exist yet, add a small one keyed by event-type slug. Default mapping mirrors current behavior: wedding/corporate → complex; proposal/anniversary/honeymoon/multi_city → standard; else simple.
6. **Admin UI:** in `fee-config.tsx:471-499`, render event-type rows beneath the tier rows, with a "Disable" toggle (sets `is_disabled`). The `499/999/1999` cent fallback constants at `fee-config.tsx:373-377` should now match §4.8 values from LB-P3.
7. **"5 credits" option:** §4.8 allows credits as an alternative. **Defer the actual credit-pay flow** (see global rules), but add an `accepts_credits` boolean to the config so the admin UI captures intent. Phase A only enforces the card path.

**Acceptance criteria**
- New `optimization_fees` rows for `wedding`, `proposal`, `corporate` event types exist and resolve at $49.99.
- A row marked `is_disabled` causes `getFeeForTier` to refuse — no $0 charge silently created.
- `complexityTier()` reads the mapping from the DB, not a switch.
- No new hard-coded fee literal exists. The `499/999/1999` cents now live in the config row's `priceCents`, not in code.
- Admin UI shows the event-type rows alongside the tier rows.

**Verify / Gate**
```
grep -rn "wedding.*complex\|corporate.*complex" server/services/smart-sequencing.service.ts   # expect 0 (DB-driven now)
grep -rn "499\|999\|1999\|9\\.99\|49\\.99" server/routes/optimization.routes.ts                # expect 0 hard-coded prices
grep -rn "is_disabled\|event_type" shared/schema.ts                                            # expect new columns
npm run check
```
Commit: `feat(CON-A.P1): per-event-type AI Concierge fee config + $0=off semantic`

---

## PHASE 2 — N5: `concierge_requests` intent log

**Objective:** Persist intent + selected tier + quoted price so we can attribute revenue to the Concierge funnel and resume abandoned requests. Lightweight log, not a workflow engine.

**Files**
- `shared/schema.ts`
- Migration in `server/migrations/`

**Steps**
1. New table `concierge_requests`:
   - `id` (uuid, pk)
   - `userId` (nullable — guests can request before sign-up)
   - `guestSessionId` (nullable — pairs with cart's guest-session pattern from G2)
   - `intent` (text — free-form prompt)
   - `eventType` (text, nullable)
   - `destination` (text, nullable)
   - `dates` (jsonb, nullable — `{from, to}`)
   - `tripId` (varchar, FK to `trips`, nullable)
   - `cartId` (varchar, nullable)
   - `quotedAiPriceCents`, `quotedExpertPriceCents`, `quotedFullPriceCents` (nullable ints)
   - `expertAvailable` (boolean — captured at quote time)
   - `selectedTier` (text enum: `ai` | `expert` | `full` | `none`, default `none`)
   - `status` (text enum: `draft` | `quoted` | `selected` | `paid` | `delivered` | `abandoned`, default `draft`)
   - `optimizationPaymentId` (text, nullable — links to Stripe PI for AI tier)
   - `expertRequestId` (uuid, nullable — links to `expert_requests.id` for Expert tier)
   - `createdAt`, `updatedAt`
   - Indexes on `userId`, `guestSessionId`, `status`
2. Migration registered in `server/migrations/run-migrations.ts` per CLAUDE.md.
3. No endpoints in this phase. Routes are added in P4.

**Acceptance criteria**
- Table exists and migrates cleanly on a fresh DB.
- Migration is registered in `MIGRATION_FILES`.
- No code reads/writes the table yet — that lands in P4.

**Verify / Gate**
```
grep -rn "concierge_requests" shared/schema.ts server/migrations/    # expect schema + migration
npm run check
```
Commit: `feat(CON-A.P2): concierge_requests intent log table`

---

## PHASE 3 — N4: Expert-availability service

**Objective:** A cheap "is there an expert available for `{destination, eventType}`?" lookup. Phase A consumers (P4, P6) need it to flip the expert option between "book now" and "request expert review (queued)".

**Files**
- `server/services/expert-availability.service.ts` (new)
- Reads existing: `expert_city_queues` (`shared/schema.ts:5231`), `provider_services` (`shared/schema.ts:486`), `users`

**Steps**
1. Export `checkExpertAvailability({ destination, eventType }) → { available: boolean, queueDepth: number, etaDays: number | null, sampleExpertIds: string[] }`.
2. Resolution order:
   - Look up `expert_city_queues` row for the destination's city. If `activeRequests` is meaningfully below the cohort size, `available = true`.
   - Otherwise, count distinct expert `userId`s with at least one approved `provider_services` row in that city/event-type and `last_active_at` within 7 days. If ≥1, `available = true`.
   - If neither, `available = false`, `etaDays` = derived from queue depth (queue empty → 1 day; deep → N).
3. Single DB call ideally; max two. Cache for 60s in-memory per `(city, eventType)` key.
4. No write side. Pure read service.

**Acceptance criteria**
- Function returns a result for any `destination` string without throwing.
- Returns `available=false, etaDays=null` cleanly for cities with no queue + no active experts (don't pretend there's an ETA).
- No new DB tables.

**Verify / Gate**
```
grep -rn "checkExpertAvailability\|expert-availability.service" server/   # expect service exists and is exported
npm run check
```
Commit: `feat(CON-A.P3): expert-availability service`

---

## PHASE 4 — N2: Concierge router service + `concierge.routes.ts`

**Objective:** A single price-quote endpoint that takes intent + context and returns prices for all three tiers, sourced through the existing resolvers — no constants. This is the server-side answer to "show price before commit."

**Files**
- `server/routes/concierge.routes.ts` (new — register via the existing router-registration site, **not** `server/routes.ts`)
- `server/services/concierge-router.service.ts` (new)
- Reads: `getFeeForTier` (`optimization.routes.ts:42`), `checkExpertAvailability` (P3), `resolveCommissionRates` (`commission.ts:41`), `provider_services`
- Writes: `concierge_requests` (P2)

**Steps**
1. `POST /api/concierge/quote` — body `{ intent: string, eventType?: string, destination?: string, dates?: {from,to}, tripId?: string, cartId?: string }`:
   - Resolve `eventType` from explicit input → trip → cart (best-effort).
   - Persist a `concierge_requests` row in `status=draft`.
   - **AI price:** call `getFeeForTier` with the resolved event-type. If `is_disabled`, return `aiPrice: null` with `aiAvailable: false`.
   - **Expert price:** if `eventType` and `destination` resolve, call `checkExpertAvailability`. If available, look up the median `price` from approved `provider_services` matching the event-type in that city; that becomes the indicative `expertPriceCents`. Mark `expertAvailable: true`. Otherwise `expertAvailable: false`, `expertPriceCents: null`, with a `queuedEtaDays` field.
   - **Full price:** look up matching rows in `event_packages` (P7) by event-type + destination. If any exist, return their `basePriceCents` range or `quoteOnly: true`. If none, `fullAvailable: false`. (P7 adds the table; until then, return `fullAvailable: false`.)
   - Persist quoted prices on the `concierge_requests` row, set `status=quoted`.
   - Response: `{ requestId, ai: {priceCents, available, isPreview: boolean}, expert: {priceCents, available, queuedEtaDays}, full: {available, priceRange, quoteOnly}, recommended: 'ai' | 'expert' | 'full' }`.
   - **No auth required** — Concierge is à la carte for guests too.
2. `POST /api/concierge/select` — body `{ requestId, tier: 'ai' | 'expert' | 'full' }`:
   - Update `selectedTier`, `status=selected`.
   - For `tier=ai`: response includes the `/api/optimization-payments` payload shape so the client can immediately move to checkout.
   - For `tier=expert`: server creates the `expert_requests` row via the same code path as `POST /api/expert-requests` (or calls it internally), pre-filling `optimizationContext` with the intent + dates + any cart snapshot. Set `concierge_requests.expertRequestId`. Response includes the queue position.
   - For `tier=full`: response returns `{ quoteOnly: true }` and the request is left in `status=selected` for admin pickup. (P7 wires the UI; Phase C wires the transactional flow.)
3. `GET /api/concierge/requests/:id` — owner or guest-session match required; returns the row.
4. Recommendation logic (`recommended`): if event-type ∈ {wedding, proposal, corporate} → `full` if available else `expert`; else → `ai` if AI-available else `expert`.

**Acceptance criteria**
- All three endpoints exist in `concierge.routes.ts`, mounted via the existing registration site (not in `server/routes.ts`).
- `/api/concierge/quote` is reachable without auth.
- Every price in the response originates from `optimization_fees`, `provider_services`, or `event_packages` — no constant anywhere in `concierge-router.service.ts`.
- Selecting `tier=expert` creates a real `expert_requests` row with `optimizationContext` populated.

**Verify / Gate**
```
grep -rn "/api/concierge" server/                                 # expect mounted in concierge.routes.ts only
grep -rn "concierge.routes\|conciergeRouter" server/              # expect a single app.use
grep -rn "[0-9]\\.99\\|priceCents.*=.*[0-9]" server/services/concierge-router.service.ts   # expect 0 literals
npm run check
```
Commit: `feat(CON-A.P4): concierge router service + /api/concierge/{quote,select,requests}`

---

## PHASE 5 — N1: Concierge entry page (`/concierge`) + `/optimize` redirect

**Objective:** The single user-facing surface. Replaces the static `/optimize` Paris mock with a real Concierge entry: intent capture, live price-quote, three delivery options. **All prices come from `/api/concierge/quote` — no client-side fee constants.**

**Files**
- `client/src/pages/concierge/index.tsx` (new)
- `client/src/components/concierge/IntentForm.tsx` (new)
- `client/src/components/concierge/DeliveryOptions.tsx` (new)
- `client/src/App.tsx` — register `/concierge` route; redirect `/optimize` → `/concierge?tier=ai`
- `client/src/pages/optimize.tsx` — replace body with `<Redirect to="/concierge?tier=ai" />` (do not delete the file — preserves inbound links)
- `client/src/components/layout/Header.tsx` (or wherever the primary nav lives) — add Concierge CTA per D8

**Steps**
1. **`/concierge` page layout** (per v4 wireframe lines 540–685, adapted for one surface):
   - Hero: "What do you want to plan?"
   - **IntentForm** — free-text intent + 4 chips: `eventType` (dropdown of slugs), `destination` (typeahead), `dates` (date range), `partySize` (number). All optional except intent.
   - On submit (or on chip change with debounce 500ms): POST `/api/concierge/quote`, render results.
   - **DeliveryOptions** — three cards: AI Concierge / Expert Concierge / Full Service:
     - AI card: price from response.ai.priceCents, "Free preview" link (calls `/api/optimization-preview` with the cart/intent context), CTA "Get plan — $X.XX".
     - Expert card: if `expertAvailable`, price + CTA "Request expert — $X.XX". If not, secondary CTA "Join queue (~N days)".
     - Full card: if `fullAvailable`, price range + CTA "Request quote". If not, hidden with a small "Available for weddings, proposals, corporate" footnote.
   - "Recommended" badge driven by `response.recommended`.
2. **Header CTA:** add a primary-style "Concierge" link/button in the main nav.
3. **`/optimize` redirect:** keep the file present, replace body with `<Redirect to="/concierge?tier=ai" />` (wouter). When the page mounts with `?tier=ai`, the Concierge page can pre-highlight the AI card.
4. **Free preview wiring:** the IntentForm's "See free preview" calls `/api/optimization-preview` directly (already mounted by LB-P3). Render the % + cost delta only — do not render the rearranged itinerary (matches `UNIFIED_PLANNING_FLOW_SPEC §5`).
5. **No fee constants in client code.** All `$X.XX` text reads from the API response.

**Acceptance criteria**
- Visiting `/optimize` redirects to `/concierge?tier=ai`.
- The page loads for a guest (no auth required for the quote).
- Intent + chips → three priced options. Changing the eventType chip changes the AI price (cheap → $9.99 standard, wedding/proposal/corporate → $49.99) — confirms the FEE-A pipeline is end-to-end.
- No price literal in client files; everything sourced from the response.
- The static Paris mock at `client/src/pages/optimize.tsx` is gone (file remains, body is the redirect).

**Verify / Gate**
```
grep -rn "9\\.99\\|49\\.99\\|19\\.99\\|199" client/src/pages/concierge/ client/src/components/concierge/   # expect 0 literals
grep -n "Paris\\|paris" client/src/pages/optimize.tsx                                                       # expect 0 (mock content gone)
grep -rn "/concierge" client/src/App.tsx                                                                    # expect route registered
npm run check
```
Commit: `feat(CON-A.P5): /concierge entry page + intent capture + /optimize redirect`

---

## PHASE 6 — N3: PlanCard escalation CTA ("Have an expert polish this")

**Objective:** Weave the Expert Concierge into every AI deliverable. Per D2, the CTA is always visible (soft style), placed at the top of the PlanCard and once per day-section. It pre-fills an `expert_request` with the AI output snapshot via the existing `POST /api/expert-requests` endpoint, with `optimizationContext` populated from the trip.

**Files**
- `client/src/components/plancard/EscalationCTA.tsx` (new)
- `client/src/components/plancard/PlanCard.tsx` (wire in)
- `client/src/components/plancard/ActivitiesSection.tsx` (per-day insertion)
- Existing API: `POST /api/expert-requests` (`server/routes/booking-actions.ts:104`) — no server changes

**Steps**
1. **EscalationCTA component:** soft-styled card ("Have an expert polish this — from $X.XX") with a CTA button. Reads price live from `/api/concierge/quote` (or a thin helper that calls it with `{tripId, intent: 'polish_plan'}`).
2. **Availability check:** if `/api/concierge/quote` returns `expertAvailable: false`, show "Request expert review (queued, ETA ~N days)" instead — both states bookable per D4.
3. **On click:**
   - Confirm modal showing the price + a free-text "Anything specific you want them to look at?" field.
   - Submit: `POST /api/expert-requests` with body matching the existing schema (`tripId`, `requestType: 'review'`, `notes`, `optimizationContext: { source: 'plancard_escalation', planSnapshot: {…} }`).
   - On success, surface a success state and link to the user's `concierge_requests` (or `expert_requests` list).
4. **Placement:**
   - Top of PlanCard, below Hero/StatsRow, before SectionTabs.
   - Once per day inside ActivitiesSection (per `EscalationCTA` placement notes), styled smaller/inline.
5. **Stages:** show on `stage=full` PlanCard. Hide on `stage=summary` (no AI plan yet) and `stage=viewer` (read-only share).
6. **No PlanCard mutation logic.** The CTA is a sibling element; do not refactor PlanCard internals.

**Acceptance criteria**
- CTA is visible on every full-stage PlanCard.
- Clicking it submits to the existing `POST /api/expert-requests` and creates a row.
- Price text is driven by `/api/concierge/quote`, never a constant.
- Available vs queued state is reflected in the CTA copy.

**Verify / Gate**
```
grep -rn "EscalationCTA" client/src/components/plancard/   # expect imported + used in PlanCard.tsx
grep -rn "expert-requests" client/src/components/plancard/EscalationCTA.tsx
grep -rn "[0-9]+\\.[0-9]{2}" client/src/components/plancard/EscalationCTA.tsx   # expect 0 price literals
npm run check
```
Commit: `feat(CON-A.P6): PlanCard escalation CTA → /api/expert-requests`

---

## PHASE 7 — N6: `event_packages` catalog (quote-on-request listings only)

**Objective:** Stand up the catalog for Full/Done-for-You event packages so the Concierge entry page can list "wedding / proposal / corporate" options as quote-on-request, even though the transactional flow (C1) is Phase C. Catalog + admin CRUD only.

**Files**
- `shared/schema.ts` (new table)
- Migration in `server/migrations/`
- `server/routes/admin.routes.ts` — add admin CRUD endpoints for `event_packages`
- `client/src/pages/admin/event-packages.tsx` (new) — admin CRUD UI

**Steps**
1. New table `event_packages`:
   - `id` (uuid, pk)
   - `expertId` (varchar, FK to `users.id`, nullable — admin-curated packages can have no expert until matched)
   - `eventType` (text — slug: `wedding` / `proposal` / `corporate` / etc.)
   - `destination` (text — city)
   - `title` (text)
   - `description` (text)
   - `priceModel` (text enum: `quote` | `fixed`, default `quote`)
   - `basePriceCents` (int, nullable — required if `priceModel = fixed`)
   - `inclusionsJson` (jsonb — array of `{title, description}` items)
   - `isActive` (boolean, default true)
   - `createdAt`, `updatedAt`
   - Indexes on `(eventType, destination, isActive)`
2. Admin endpoints: `GET/POST/PATCH/DELETE /api/admin/event-packages` in `admin.routes.ts`.
3. Admin UI page: list + create/edit form. Add to admin nav.
4. **Wire P4 reader:** in `concierge-router.service.ts`, replace the P4 placeholder `fullAvailable: false` with a real lookup on `(eventType, destination, isActive)`. Return the lowest `basePriceCents` (or null for quote-only) and `quoteOnly: true` when none have a fixed price.
5. **Wire P5 display:** the Full card on `/concierge` now shows price-range or "Request quote" based on the response. Clicking it calls `POST /api/concierge/select` with `tier=full` — no Stripe path in Phase A (per the brief), the request lands in `concierge_requests` with `status=selected` and admin handles offline. The success UI says "An admin will follow up with a quote."

**Acceptance criteria**
- Table + admin CRUD + admin nav entry exist.
- `/api/concierge/quote` returns real Full results when matching `event_packages` rows exist.
- `/concierge` Full card renders price-range or quote-only based on the response.
- Selecting `tier=full` writes to `concierge_requests` and renders the "we'll follow up" UI — no payment attempt.

**Verify / Gate**
```
grep -rn "event_packages\\|eventPackages" shared/schema.ts server/migrations/   # expect schema + migration
grep -rn "/api/admin/event-packages" server/routes/admin.routes.ts             # expect 4 endpoints
grep -rn "/admin/event-packages" client/src/                                    # expect route + nav entry
npm run check
```
Commit: `feat(CON-A.P7): event_packages catalog + admin CRUD + Concierge Full card`

---

## FINAL VERIFICATION CHECKLIST (run before declaring done)

- [ ] **P0** — LB-P3 confirmed live; baseline typecheck captured.
- [ ] **P1** — `optimization_fees` has event-type rows; `complexityTier()` reads from DB; `is_disabled` honored; no hard-coded prices in `optimization.routes.ts`.
- [ ] **P2** — `concierge_requests` table + migration registered.
- [ ] **P3** — `checkExpertAvailability` returns a result for any destination without throwing.
- [ ] **P4** — `/api/concierge/{quote,select,requests/:id}` mounted via `concierge.routes.ts`; quote is guest-reachable; no fee literals in the router service.
- [ ] **P5** — `/concierge` page live; `/optimize` 301s to it; intent + chips drive real prices end-to-end; no client-side price literals; header CTA in place.
- [ ] **P6** — Escalation CTA on every full-stage PlanCard; creates `expert_requests` row with `optimizationContext`; available/queued state reflected.
- [ ] **P7** — `event_packages` table + admin CRUD live; Full card on `/concierge` driven by real catalog; `tier=full` selection lands in `concierge_requests` with no payment attempt.
- [ ] `npm run check` shows **no new errors** vs P0 baseline.
- [ ] No new hard-coded fee/rate/price literal introduced.
- [ ] No new route added to `server/routes.ts`.
- [ ] All Concierge endpoints live in `server/routes/concierge.routes.ts`.

---

## KNOWN FOLLOW-UPS (NOT IN THIS BRIEF)

- **Per-expert commission override** — nullable `commissionRateOverride` column on the expert + one branch in `commission.ts:resolveCommissionRates:41-93` reading it before the category fallback + admin field in the expert approval form. **Must land before beta outreach with the §6.9 "20% vs 25%" language is sent.** Hard gate on recruitment, not on this brief. Owner: CON workstream.
- **Premium feature fee row in §4.8** — restored as Deferred-P2 in the latest plan; tracker bookkeeping, not engineering.
- **Credits as Concierge payment rail** — toggleable second path alongside card. Deferred from Phase A per D3.

## OUT OF SCOPE (Phase B / Phase C briefs)

$9 concierge tier (subscription rail, included-allowance counter, overage logic, priority-routing for members, admin tier config) · Full/DFY transactional flow (quote → approve → PI → workspace + provider bundle) · per-expert/`expertTier` system · provider insurance-tier capture + tier-based commission · fee override hierarchy (global→market→tier→entity) · effective-dating · fee-change audit trail · affiliate `behaviorMode` (retain/markup/rebate) · native-first browse sort · KYC/AML hooks · background-check + appeals · email-verification send/confirm · cart multi-currency + sharing · review-specific moderation queue · `server/routes.ts` defragmentation.
