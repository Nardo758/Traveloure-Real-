# Traveloure Codebase Architecture

This document captures architectural decisions to maintain consistency across code changes. Updates require approval from the designated decision-maker.

**Architectural Decision-Maker:** User (explicit confirmation required for schema/routing changes).

---

## Locked Decisions & Current Intent (updated Jul 12, 2026)

> This section carries **intent** — how the platform is *supposed* to work — from the decision-maker's sessions, which the
> repo alone can't convey. Where a "⚠️ current code" note appears, the code **diverges from intent**; that is a tracked
> **bug**, not the design. Do not "fix" the doc to match a divergence — fix the code (or leave it flagged).

1. **Approval lifecycle (D1a) — CLOSED by F2 (migration 111).** Offerings are born `submitted`, **never born-approved**.
   Lifecycle: `draft → submitted → approved`. The `provider_services` admin approve/reject/list queue already exists
   (`GET /api/admin/provider-services/pending` + `POST …/:id/approve|reject`, all operating on `provider_services` via
   `mapProviderServiceToListing` → `ProviderServiceListing`; these were **renamed from the misnamed `custom-services`
   vocabulary** — endpoints, storage fns, and the `ExpertCustomService` DTO all now carry provider-service names). **F2
   resolution (ratified Jul 14, 2026):** ① the born default is
   flipped `approved → submitted` at BOTH the ORM (`shared/schema.ts:578`) and the DB column (migration 111
   `ALTER COLUMN approval_status SET DEFAULT 'submitted'`, **future-inserts-only — NO backfill, existing rows grandfathered
   `approved`**); ② `createProviderService` clamps the born state server-side to non-approved (`draft`/`submitted`, default
   `submitted`) so a client can't self-approve via the still-open `insertProviderServiceSchema` (the mass-assign twin of
   marketplace Gap 2), and the duplicate path resets `approvalStatus` (was inheriting the original's `approved`);
   ③ the **read gate is completed on ALL public `provider_services` surfaces** (they filter `approval_status = 'approved'`)
   so a `submitted` listing cannot leak publicly — while the **expert-own console and admin reads stay intentionally
   ungated** (owner sees their own pipeline; admin sees the queue). **F2 extension (Jul 15, 2026): the upsell engine's
   two INDIRECT reads were missed surfaces, now gated** — `loadCoveringInventory` (a born-`submitted`-but-`active`
   service counted as covering inventory, unlocking public recommendations + feeding price into the earnings calc) and
   `resolveEndorsedKeysFromProviders` (an unapproved listing could power an expert-endorsement ranking boost). Both now
   require `approval_status = 'approved'`; proven behaviorally both directions (submitted excluded, approved+verified
   included). The supply→engine pipeline is otherwise automatic: ServiceForm create/update writes
   `provider_neighborhood_coverage` rows inline, and the engine reads them per-request — no batch step. Grandfather + full-read-gate = complete integrity with
   zero catalog outage (grandfathered rows are `approved` → pass the gate → stay visible; new rows are `submitted` → hidden
   publicly until approved). `GET /api/expert/services` (`server/routes.ts`) is the owner console — correctly ungated
   (filters by `userId` + the active/paused `status` param, never approval).
2. **Admin auth = default-deny.** `/api/admin/*` is protected by a **blanket `requireAdmin`** guard
   (`app.use("/api/admin", …)` in `server/routes.ts`, DB role lookup on the session; 401/403; no bypass) — **landed via
   #141**; the previously world-writable `POST /api/admin/fee-config` hole is **closed on `main`**. Do **not** reintroduce
   per-endpoint opt-in — that pattern is what leaked.
3. **Delivery-method vocabulary = the 7.** Canonical set is `pdf, video, call, in_person, voice_notes, async_messaging,
   hybrid` — enforced by both `deliveryMethodEnum` (`shared/schema.ts:523`) and the migration-109 DB CHECK on
   `provider_services` + `service_templates`. No `document`/`digital`/hyphenated variants; the `CANONICAL_TEMPLATES` seeder
   must emit canonical values.
4. **Two parallel offering catalogs, never merged.** `expert_offering_types` (`serviceTier` + `deliveryFormats`) and
   `service_offering_types` (`categoryKey` → `service_categories`) are strictly separate. **Experts are NOT a
   `service_category`.** `offering_type_key` is persisted via **two separate FKs** (migration 107), `ON DELETE SET NULL`.
5. **One builder; selection-only signup.** `ServiceForm` is the single offering-creation surface for **both** roles; the
   expert create wizard is retired (Phase 3). Signup is **selection-only** — listing creation is deferred to the
   post-approval console. 🔄 **Phase 2 IN PROGRESS** (`claude/phase2-serviceform-absorption`): `ServiceForm` absorbs the
   wizard's two unique capabilities — the from-template **gallery entry** (writing via the canonical
   `POST /api/provider/services` with `approvalStatus` `draft`/`submitted`, **never** the born-approved
   `POST /api/expert/services/from-template/:id`) and the **`requirements`** field. Also lands a pre-existing P1 fix
   (Step 0.5): ServiceForm's delivery vocab is canonicalized at the write boundary (`in-person`→`in_person`,
   `video-call`→`video`, keep `hybrid`) so writes satisfy the migration-109 CHECK — before this, ServiceForm creates with
   those two values failed on insert. Every create path stays `draft`/`submitted`, never born-approved (D1a). The wizard is
   **not deleted** in Phase 2 — its retirement is Phase 3. Filed for Phase 3: retire/redirect the born-approved
   `from-template/:id` route; and **evaluate** (do not add mechanically) exposing the not-yet-in-picker canonical
   delivery methods (`call`, `voice_notes`, `async_messaging`, `pdf`) — confirm **each** is a delivery type a
   provider/expert should be able to *choose* in ServiceForm before adding it. In particular `pdf` (the written-deliverable
   method the wizard's `document` mapped to) may be a template-/offering-only concept, not a picker option; adding a picker
   option the rest of the create/booking flow doesn't support would be a new "surface-without-a-backend" trap.
6. **Insurance.** `has_insurance` (provider self-attestation, `service_provider_forms`, migration 108) is the **sole**
   provider insurance field; the "023 insurance evidence" was a never-shipped plan. When FEE-2 Phase 1 ships the
   admin-validated `insurance_tier`, a **boolean-vs-tier precedence rule must be written here before both coexist.**
   - **Interim insurance config source (FEE-2 Phase 2, migration 124):** `platform_settings` now holds three keys —
     `insurance_enabled` (`"false"`), `insurance_rate_percent` (`"0"`), `insurance_applies_to` (`"[]"`) — as the
     **interim** source for `commission.ts:resolveInsuranceFromCategory`. Defaults match the `booking_fee_configs`
     column defaults exactly (behavior-neutral on apply). `booking_fee_configs` is retained for its other 7 readers
     (transport commission, startup seed, tip commission); only the commission.ts insurance read path was migrated.
     This is a **deliberate interim home**, not a third permanent insurance location: when FEE-2 Phase 1 ships
     `insurance_tier`, update `commission.ts:resolveInsuranceFromCategory` to read from `insurance_tier` instead,
     and write the boolean-vs-tier precedence rule here before both coexist. *Recorded per Coordination Prevention;
     commit: "insurance read relocated commission.ts booking_fee_configs→platform_settings (migration 124, additive
     false/0 defaults); booking_fee_configs retained for its other 7 readers; closes the #819/FEE-2 gate."*
7. **Coordination fee.** Fee logic lives in the service (`optimization-fee.service.ts`); rates resolve via config, no
   literals; the optimize credit is **payment-gated — never credit an unpaid optimize fee**. **Resolved (interim, #144):**
   the fee reads the event budget from the existing `coordination_states.budget` jsonb column
   (`{ amount: <dollars>, currency }`, written at create/patch from the request's `metadata.budget`, read ×100), **not**
   `total_estimated_cost` (that means *cost*, not budget); absent/`{}` budget → intentional floor-only. Full contract in
   the "Recorded change — Coordination-fee" note below.
   - **Quote-only → CAPTURED — RATIFIED Jul 22, 2026 (decision-maker sign-off; the deliberate §7 flip Phase 2 was gated
     on).** The coordination fee is **no longer quote-only** — it is charged for real, mirroring the `optimization-payments`
     pattern. `POST /api/coordination-states/:id/pay` (server-derives the fee — §14 — from the state's own
     `experienceType` + `budget`; a client-sent amount is never read) creates a Stripe PaymentIntent
     (`type=coordination_fee`, ownership-verified against `state.userId`); `POST …/:id/pay/confirm` verifies the intent
     (`status==='succeeded'` + type + `coordinationId`/`userId` match) and records `platform_revenue` (100%-platform via
     the `coordination_fee` source tier = `AI_PLATFORM_FEE`). **§15 idempotent both ways:** the pay claim is an atomic
     conditional `UPDATE … SET fee_payment_status='pending' WHERE fee_payment_status IN (NULL,'unpaid')` (a lost claim
     returns the in-flight PI, never a second charge) + deterministic Stripe `idempotencyKey` `coord-fee-<id>`; confirm
     transitions `… SET fee_payment_status='paid' WHERE fee_payment_status <> 'paid'` and records revenue only if a row
     flipped (dup confirm → `alreadyPaid`, no double revenue) + revenue idempotent on `sourceId=<PI>`. Fee-payment state
     lives on **new `coordination_states` columns** (`fee_payment_status` DB-CHECK `unpaid|pending|paid`,
     `fee_payment_intent_id`, `fee_amount_cents` = net charged, `fee_credit_cents`, `fee_paid_at`; migration 125 —
     new columns default `unpaid`, so the CHECK has no legacy rows to violate → no publish-time push trap).
   - **Paid-signal ledger — BUILT (closes the filed follow-up).** The optimize credit is now applied **only when a real
     paid optimize fee exists**, via a dedicated ledger `coordination_fee_credits` (migration 125, new table):
     `optimization-payments/confirm` inserts a credit row (`source_payment_intent_id` UNIQUE → idempotent; `amount_cents`
     from Stripe; `user_id` from session) **only for Event-branch optimizers** (`isEventOptimizer(eventType)` — the same
     branches whose `creditTowardCoordination` is true, i.e. wedding/corporate). At **pay** time the newest **unconsumed**
     credit for the traveler is claimed atomically (`UPDATE … SET consumed_by_coordination_id=:id WHERE
     consumed_by_coordination_id IS NULL RETURNING amount_cents`) and applied: **charge = max(floor, percent) − paid
     optimize credit** (this is the `/pricing` "Event $19.99 credited-toward-coordination" promise, now honored honestly).
     `resolveCoordinationFee(eventType, budgetCents, availableCreditCents=0)` gained the credit param but stays a **pure
     function** — the credit is looked up/claimed by the caller (route), never queried inside the resolver. The `/fee`
     quote surfaces the available credit read-only (no consume); consumption happens only under the pay claim. Credit is
     capped at the fee (`min(credit, rawFee)`), so a credit can never make the charge negative. **Filed follow-ups:**
     tighten credit matching to same-event (currently user + unconsumed, defensible since every credit is a paid
     Event-branch optimize); accumulate multiple credits (today claims one — the singular `/pricing` promise); reverse the
     consumed credit + `platform_revenue` on a coordination refund (mirrors the escrow reversal spine).
8. **No fee/commission/margin literals** anywhere outside `fee_bands`/config — grep-gated every phase. A hardcoded rate in
   touched code is a defect (see §13). **Phase 4.1 LANDED (migration 122):** the `499`/`8%` coordination constants —
   formerly the pre-existing §8 exception — are now admin-editable `fee_bands` rows (`coordination_floor` flat-dollars
   `499.00`; `coordination_percent` fraction `0.08`). `resolveCoordinationFee` reads them via the two bands and **falls
   back to the same code constants when a row is absent/non-positive** (a fee floor's safe failure mode), so the seed is
   behavior-neutral on apply and the constants survive only as the documented fallback default (`fee-literal-ok`,
   matching the `getFee` DEFAULT_FEE_CENTS fallback posture). Idempotent `ON CONFLICT DO NOTHING`; no schema/CHECK change
   → no publish-time push trap.
9. **Routing realities.** `server/routes/experts.routes.ts` is **imported-but-unmounted (dark)** except the two ported
   endpoints; ~24 endpoint families are dead in production pending the dark-families triage. **Dead endpoints return
   200-HTML (the Vite catch-all), NOT 404** — never use a 404 as a "route is dead" signal.
   - **Route-shadow class — SWEPT (Jul 15, 2026).** The 237 inline `routes.ts` registrations that duplicated a path
     already served by an earlier-mounted router (202 content.routes, 29 admin.routes, 6 payments.routes — including
     the §10 `/api/discover` and §15 `/api/checkout` landmines) were **diffed pair-by-pair and deleted**; 6 superior
     deltas found only on the dead copies were **harvested into the live copies first** (custom-venues IDOR ownership
     ×2, the `/api/services/:id` F2 read-gate, the global-calendar country-season fallback, the admin-notifications DB
     role lookup, the discover-location `date` passthrough). Full pair table + unresolved remainders in
     `docs/audits/shadow-route-sweep.md`. **Rule going forward: never register a path inline in `routes.ts` that a
     mounted router already serves** — the router copy wins on mount order and the inline copy is born dead (this class
     ate at least three real fixes: bf93f45e, 571b593f, 23ece804 all landed on dead copies). New endpoints belong in
     the appropriate `server/routes/*.ts` router.
   - **Route-shadow REVERSE landmine — trips.routes.ts mount, CORRECTED (Jul 23, 2026).** A later change mounted the
     formerly-dark `trips.routes.ts` at the TOP of `registerRoutes` (before the inline routes) to activate its
     consumer-backed logistics/anchor/transport/itinerary-share families — but that **wholesale mount shadowed 57 inline
     handlers** the router also declares (core trip CRUD via `api.trips.*.path`, `generate-itinerary`,
     `itinerary-comparisons/*`, participants, **budget/transactions/contracts**, emergency, alerts). Because the router
     mounted *before* the inline copies, the **stale router copies silently won** — and they are NOT identical: they
     carry a **different auth model** (`getTripRole`/`canMutateTrip` vs the inline `verifyTripOwnership`/
     `isExpertAssignedToTrip`) and **drop side-effects** the inline copies have (e.g. expert-notify-on-item-add). The
     mounting commit's comment asserted the copies were "identical" — they are not. **Fix (this change):** the inline
     copies are the documented-canonical, long-lived ones, so `app.use(tripsRoutes)` was moved to the **very end of
     `registerRoutes`** (just before `return httpServer`) — Express matches in registration order, so the earlier inline
     routes now win the 57 shared paths, while `trips.routes.ts` still serves its **32 UNIQUE, consumer-backed** endpoints
     (anchors, day-boundaries, transport-legs, itinerary-share exports/navigate, expert-review, logistics presets,
     itinerary-variants, vendor contact-sheet/bulk-email, `/api/trips/:tripId/itinerary-items/:itemId`). `experts.routes.ts`
     (24 unique / 0 collisions) and `cross-sell.routes.ts` (3 / 0) are collision-free and stay mounted where they are.
     Allow-list emptied (all three routers are mounted now → `unmounted-router-guard` green again — it was RED because
     the trio was mounted but still allow-listed). **Filed follow-up (a real careful sweep, not mechanical):** delete the
     57 duplicate handlers from `trips.routes.ts`, reconciling the divergent auth model per-handler first (which model is
     intended) — until then the router keeps 57 born-dead duplicates that lose the mount-order race. Do NOT auto-strip
     them: the copies are semantically divergent, not stale-vs-fixed.
   - **Ground-truth correction (Jul 14, 2026): the "mostly-dark supply side" headline was overstated.** Re-verified on
     `origin/main`, three surfaces the maps inferred were dark are actually **LIVE on origin/main** (not even
     deploy-only): the **recommender** (real `server/services/recommendation.service.ts` → `getExpertRecommendations`/
     `getProviderRecommendations`, mounted at `/api/recommendations/expert|provider|user` — **mounted, but the endpoints
     were 500ing on 13 stale dynamic-imports of the deleted pre-unification engine files; repointed to the unified service
     in PR #174, so "live" holds post-#174**), **provider discovery**
     (`/service-providers` + the full `/provider/*` route set in `App.tsx`), and the **expert workspace**
     (`/expert/workspace/:tripId`, expert-gated). What IS genuinely dark stays the `experts.routes.ts` families above
     (import present, no `app.use`). The maps were **inference**; treat these four as re-verified fact. The remaining
     demand/supply map claims still need reconciliation against the ground-truth corrections table.
   - **EA console — ACTIVATED (Jul 14, 2026).** The ~32 `/api/ea/*` executive-assistant endpoints (client roster,
     executives, events, travel, gifts, saved venues, communications, AI tasks + client push) were part of the dark
     `experts.routes.ts` set — the **client console was fully routed** (`client/src/pages/ea/*` behind
     `ProtectedRoute requiredRole="executive_assistant"` in `App.tsx`) but every call hit the Vite catch-all (200-HTML),
     so the console rendered but held no real data. Extracted **verbatim** into a new **mounted** router
     `server/routes/ea.routes.ts` (`app.use(eaRoutes)` in `routes.ts`), guarded by a **router-level `isEA` RBAC**
     (`router.use("/api/ea", isEA)` — executive_assistant OR admin, DB role lookup; §2-style default-deny for the
     namespace). No endpoint logic changed; the block was removed from the dark file (0 `/api/ea` remain there). This is
     a **surface-with-a-backend** activation (client already existed), not a new build. **Filed (not activated here):**
     the remaining dark `experts.routes.ts` families (expert workspace/vendors, knowledge-nuggets, visa, role) stay dark
     pending their own triage.
   - **Kyoto supply tools — `GET/PATCH /api/provider/settings` ACTIVATED (Jul 14, 2026).** Same surface-without-a-backend
     pattern: the provider settings page (`client/src/pages/provider/settings.tsx`, routed behind
     `ProtectedRoute requiredRole="provider"`) GET/PATCHes `/api/provider/settings`, but those handlers were dark in
     `experts.routes.ts` **and** referenced an **undefined `requireProviderRole`** (a latent bug — they'd have thrown even
     if reached). Extracted into a new **mounted** `server/routes/provider.routes.ts` (`app.use(providerRoutes)`),
     writing a real `requireProviderRole` (DB role lookup, provider-or-admin, mirroring `isEA`). **Not money-path:**
     settings are self-scoped by `userId` (unique per user); PATCH is a **zod allow-list of the 7 editable fields**
     (never raw `req.body`), so identity columns can't be mass-assigned. `payoutFrequency`/`minimumPayoutAmount` are
     provider *preferences*, not a charge/transfer amount — no Stripe/earning write. The money-endpoint guard passes
     (file is not money-named and the handler performs no money operation).
   - **Provider earnings family — NOW LIVE (stale note corrected Aug 2, 2026; was "deliberately NOT mounted").**
     `GET /api/provider/earnings`, `/earnings/summary`, `/earnings/details` and `/api/expert/earnings/details` became
     live as a side effect of the Jul 23 route-shadow correction mounting `experts.routes.ts` in full (see the
     "Route-shadow REVERSE landmine" entry above — "all three routers are mounted now"). The original scoping decision
     ("activate only alongside a real consumer") is retroactively satisfied: the expert money page consumes
     `/api/expert/earnings/details` (payout history + escrow breakdown), and the provider money page consumes
     `/api/provider/earnings/summary` + the session-scoped `GET /api/payouts` (task #142). Do not re-darken.
   - **Expert workspace endpoints — REPAIRED (Jul 19, 2026).** `trips.routes.ts` is a **third** imported-but-unmounted
     router (alongside `experts.routes.ts`/`cross-sell.routes.ts`); the expert trip workspace (`workspace.tsx`) called 8
     handlers that lived only there / in the dark `experts.routes.ts`, so notes, commission, my-assignment,
     workspace-constraints, calculate-energy, generate-presets, and the `draft→in_review→delivered` status advance all
     silently hit the Vite catch-all (200-HTML) — the deliver workflow was dead even for an accepted trip. All 8 were
     **ported verbatim into the mounted `booking-actions.ts`** (`app.use("/api", …)`, which already serves the
     workspace's live `assigned-trips`/`traveler-profile`) and **deleted from the dark files** (no stale twin — the §9
     shadow-route rule). Also added the missing **trip-accept** action (`POST /api/expert/assignments/:id/accept`,
     owner-gated, atomic pending→accepted — §15) + an Accept button on `assigned-trips.tsx`, so a *pending* assignment
     now has a path into the workspace (the first half of the `pending→accepted` then `draft→…→delivered` lifecycle,
     which had no UI/endpoint). `trips.routes.ts`/`experts.routes.ts` stay unmounted with their *other* dark handlers.
   - **Unmounted-router guard — LANDED (Jul 19, 2026), the durable fix for this recurring class.**
     `scripts/check-unmounted-routers.cjs` (CI job `unmounted-router-guard` in `build.yml`, mirroring the
     money-endpoint guard) fails when a `server/routes/*.ts` module is default-imported into `routes.ts` but
     never `app.use`d — i.e. dead (200-HTML). Comment-stripped scan so a commented-out mount doesn't count.
     Known-intentionally-dark routers (`expertsRoutes`, `crossSellRoutes`, `tripsRoutes`) are an explicit
     `ALLOWED_UNMOUNTED` allow-list, each with a reason; a new offender fails until mounted (or added to the
     list with a reason). **First catch (a real bug):** `savedItemsRoutes` was imported-but-unmounted while
     the dashboard **Wishlist** (`WishlistSection.tsx`) actively GET/POST/DELETEs `/api/saved-items` — so the
     Wishlist silently hit the catch-all and never loaded. Now **mounted** (`app.use(savedItemsRoutes)`);
     handlers are session-scoped + owner-gated, no shadow. Proven: guard passes on main, fails on a
     removed-or-commented mount.
10. **Expert-template marketplace — SELLER-SIDE SUNSET RATIFIED (Jul 27, 2026; supersedes "activation in progress" for the SELLER surface only).**
    The `expert_templates` lane sunsets in favor of the `ready_made_trips` store lane ("one store, stocked from
    the Workstation"). **Phase 2a (this program) retires ONLY the seller surface**: the `/expert/templates` seller
    page + its create path are removed and NEW listings are blocked; the DMO Library's "Build Ready Made Trip"
    misroute (it created an `expert_templates` row) is repointed at the real store lane. **INTACT and untouched:
    the consumer read/purchase surface, buyers' purchased content (`/api/my-purchased-templates`), owner reads
    (My Offerings lane 2, storefront lane 2), admin queues, and the §15 purchase/confirm money endpoints.** The
    consumer wind-down is a SEPARATE decision-maker-read phase gated on PROD counts (dev counts were test
    fixtures only; the test-email filter must include %@test.dev / %@t.test / **%@example.com** — the last
    added Aug 2, 2026 when invariant triage found the seed-expert-services personas live there; RFC 2606
    reserved, always fixtures). Do not build new features on
    `expert_templates`. Historical §10 record below stands for the still-live consumer surface.
    **(Historical) ACTIVATION record:** (`claude/marketplace-phaseA-gate` and follow-ons).
    Replit commit `3ceeffc3` replaced the old ledger stub with a **real two-step Stripe checkout**: `POST
    /api/expert-templates/:id/purchase` creates a `pending_payment` purchase + Stripe PaymentIntent (no earning yet),
    and `POST /api/expert-templates/:id/purchase/confirm` server-verifies the intent (`status === 'succeeded'`, IDOR +
    ownership + idempotency guards) before marking complete and recording the earning. The payment **guards are sound**
    and there is no dual-path/cart leak. **But the checkout is unsafe to surface until three gaps close, and is currently
    kept unreachable only by an orphaned purchase UI** (the `/expert-templates/:id` route is unregistered in `App.tsx`;
    the `/discover` `packages` tab is hidden). **Governing rule: safety before surfacing — the purchase path must not
    become reachable until Gap 1 (approval) and Gap 2 (field whitelist) hold.**
    - **Gap 1 — approval gate: BUILT (migration 110 + shared queue).** `expert_templates` now carries the same approval
      column set as `provider_services` (`approval_status` draft→submitted→approved/rejected, `submitted_at`/`reviewed_at`/
      `reviewed_by`/`rejection_reason`), with a DB CHECK on the status set. The purchase gate (`routes.ts`) is now
      **`approval_status === 'approved' AND isPublished === true`** — approval is the gate the expert cannot self-satisfy;
      `isPublished` stays the expert's own visibility toggle (approved-but-unpublished respects the hide; published-but-
      unapproved is not purchasable). Admin approve/reject endpoints (`/api/admin/expert-templates/:id/approve|reject`,
      reject-reason required) ride the blanket `adminApiGuard` (§2). Experts submit via `POST /api/expert/templates/:id/submit`.
      **A3 material-change re-review:** changing `price`/`currency` on an approved template drops it back to `submitted`.
      **This is the shared queue = Phase 4's queue** — built once, **do not fork** a template-only path (§4/§10).
      **Backfill effect (recorded, not silent):** existing `is_published=true` templates were backfilled to `submitted`,
      so they need admin approval before they can sell — zero live impact today (purchase UI still orphaned, Gap 3).
      **Phase 4's scope is now REDUCED** to: wire the `provider_services` read-gate to this existing queue + decide the
      grandfather/backfill + born-`approved` default flip (`provider_services` was intentionally left untouched here —
      it already has the columns, grandfathered `approved`). Phase 4 **wires, does not rebuild.**
    - **Gap 2 — mass-assignment.** BOTH the create (`routes.ts:4396`) and PATCH (`routes.ts:4420`) endpoints spread raw
      `req.body`, so `isPublished`/`approvalStatus`/`expertId`/earnings columns are self-settable. Fix (A1, landed on
      this branch, **decision-independent**): write only an explicit expert-editable allow-set on both paths; never raw
      `req.body`; force `isPublished` false at create.
    - **Gap 3 — surfacing (Phase B, LAST). 🔄 IN PROGRESS (Jul 14, 2026) — scope CORRECTED by the action-map pass.**
      The full buy-loop action map (expert build → submit → approve → browse → view → purchase → **receive** → review)
      was ground-truthed and found Phase B is **bigger than "register a route + un-hide a tab"** — three client surfaces
      don't exist at all: ① the expert builder (`/expert/templates`, routed + working CRUD) had **no submit-for-review
      action and didn't show `approvalStatus`** — the pipeline was dead at step 1 (nothing could ever reach the admin
      queue from the UI); ② **no public detail page or purchase UI exists anywhere** (the earlier "page wired to Stripe"
      claim was wrong — client grep finds zero callers of `/purchase` or `/purchase/confirm`); ③ **no buyer delivery
      surface** — `GET /api/my-purchased-templates` (live, returns purchases + full template incl. `itineraryData`) has
      zero client consumers, so a buyer would pay and have nowhere to see what they bought. Server needs ~nothing: all
      12 endpoints live + gated; review-create is already purchase-gated. **Build order (safety: delivery before
      surfacing):** B1 builder submit + status (landed on `claude/marketplace-phaseB-b1` — submit/resubmit button,
      approval badges + rejection reason, publish toggle only post-approval, dead born-published switch removed, and the
      fake client `80%`/`×0.8` earnings literals replaced with real per-purchase `expertEarnings` sums — §8: the real
      split is config-resolved server-side via `resolveCommissionRates`); B2 public `/expert-templates/:id` detail page
      + purchase flow; B3 buyer's purchased-packages view (the delivery); B4 un-hide the `packages` tab **last, only
      when the loop closes end-to-end**. Only admin-approved packages surface, at the approved/locked price.
      **B2 landed (+ a Gap 4 it found): the itinerary content-gate.** Both public reads (`GET /api/expert-templates`
      + `/:id`) and the purchase 202 were returning the **full `itineraryData` — the entire paid product — to anyone,
      unauthenticated**. Public reads now return a TEASER (`itineraryPreview`: day + title only, via
      `redactTemplateContent`); the full content returns only to a **completed** purchaser
      (`hasUserPurchasedTemplate` — proven behaviorally: `pending_payment` does NOT unlock), the owner, or an admin.
      The buy surface is the new public `/expert-templates/:id` page (`expert-template-detail.tsx`, registered in
      `App.tsx`): content-gated detail + reviews + the existing safe 2-step purchase (POST `/purchase` 202 →
      Stripe Elements via the shared `StripeCheckout` → POST `/purchase/confirm`); the client never sends an amount
      (§14). Proven against a local DB: anonymous list/detail leak-free; purchaser unlock; `/api/my-purchased-templates`
      returns full content (B3's data source).
      **B3 landed (same branch): the delivery surface.** `/my-bookings` gains a **Packages** tab (first consumer of
      `/api/my-purchased-templates`): purchase status (Purchased / Payment pending / Refunded) + "View itinerary" →
      the B2 detail page, which unlocks full content for the purchaser. A buyer with only package purchases (no
      bookings) now lands on the Packages tab instead of the "No bookings yet" dead-end. **B4 (three surfaces, scoped
      by the surface map):** un-hide the Discover `packages` tab (cards already built, already link to the B2 page);
      expert-profile packages section (`/experts/:id`, via the existing `?expertId=` filter); service-detail
      same-owner cross-sell. **Search-indexing CLOSED (packages-in-discovery, post-B4):** `unifiedSearch` now also
      returns matching **packages** (approved+published only; query vs title/description/destination; location vs
      destination; price filters; skipped on category-locked browses — template categories ≠ `service_categories`),
      rendered as a strip in `ServiceBrowser`, and the public packages feed is **quality-ordered** (featured →
      salesCount → rating → recency, was raw insertion order). Route-shadow catch #2 (same class as the §15
      `/api/checkout` landmine): `/api/discover` was duplicated — `content.routes.ts` is the LIVE one (mount order);
      the shadowed `routes.ts` copy is **deleted by the §9 shadow-route sweep (Jul 15, 2026)**. The content-gate
      redaction lives in the shared `server/utils/template-content-gate.ts` and the live copy applies it (proven
      behaviorally: search results carry teaser only, no `itineraryData`). **Recommender ranks packages — RESOLVED
      (Jul 16, 2026).** The demand-signal recommender is **demand-signal-typed** (recommends service *types*), and
      packages live in a separate taxonomy (§10) — so rather than force a taxonomy bridge, package ranking was added
      in the layer that fits: `getRecommendedPackagesForUser(city, prefs)` in `recommendation.service.ts` ranks
      **approved+published** packages by **destination match** (the city the recommender already has) then real
      quality (`isFeatured → salesCount → averageRating → recency`), returns **teaser fields only** (no
      `itineraryData` — content-gate), and rides `GET /api/recommendations/user` as an **additive `packages` field**
      (existing consumers read `.recommendations`, unaffected). Surfaced in `template-recommendations.tsx` as a
      "Ready-made packages for `<city>`" strip → the B2 detail page; honest rating ("New" when `reviewCount=0`).
      This is also the destination-aware ordering the packages feed wanted — done in the recommender, not a
      duplicate feed sort. **Still filed:** `help-me-decide` mock packages. **Naming:** each package is expert-titled (free text, reviewed at approval);
      category/destination/duration are structured. **Label standard (ratified, superseded Jul 16, 2026):
      **Nav extension (MP-1, Jul 30 2026):** the same label standard now governs `nav-config.ts`. The Discover
      group is renamed **"Marketplace"** and lists ALL FOUR tabs — previously it listed two, and "Ready Made
      Trips" had **no nav entry anywhere on the site**, so the entire expert store lane was nav-invisible. The
      services entry moved out of "Experts & Services" and is renamed **"Browse Services"**, NOT "Service
      Providers": `provider_services` is role-agnostic (the "one builder" rule), so experts list services in
      that tab too and naming it after one role was wrong about who sells there. **"By Date" is deliberate**
      and pairs with "By Location" as the two browse AXES — do not "align" it to the `?tab=events` token.
      **Routing tokens and the `/discover` route are UNCHANGED** — label-only, per this standard.
      traveler-facing = "Ready Made Trips"** (Discover tab/header, my-bookings tab, detail page) — renamed from
      "Packages" because "Packages" read ambiguously against services/bookings and obscured that these are
      pre-made, expert-authored *trips* the traveler buys. The seller console keeps "Itinerary Templates" (same
      product, seller-side vocabulary — the Airbnb listings/homes split). **Routing key unchanged:** the tab
      `value="packages"` + `?tab=packages` deep-link + `VISIBLE_TABS` routing token stay `packages` (URL/routing
      contract); only the human-readable label text changes to "Ready Made Trips". **B4 LANDED (Phase B complete):** Discover
      `packages` TabsTrigger restored (feed is server-gated + teaser-redacted); `/experts/:id` gains a Packages tab
      (`?expertId=` filter, hidden when the expert has none); `/services/:id` gains a "Packages by this expert"
      same-owner cross-sell (top 3, hidden when none). All three link into the B2 detail page.
      - **Read-gate — CLOSED on the server (PR #172), independent of surfacing.** A ground-truth pass found the purchase
        path is **reachable on the deployed tree** (route registered, page wired to Stripe, marketplace nav link live) —
        i.e. Gap 3 is largely surfaced there, NOT orphaned as this doc assumed. The buy was already gated
        (`approvalStatus==='approved' && isPublished`), but the **public reads were not**: `GET /api/expert-templates`
        filtered only `isPublished` (a self-published-but-`submitted`/`rejected` template surfaced in the feed) and
        `GET /api/expert-templates/:id` had **no gate**. Both now require `approved` (+ `isPublished`); the owner console
        (`GET /api/expert/templates`, expertId-scoped) and admin reads stay ungated — the **F2 `provider_services`
        read-gate pattern**. So "only admin-approved packages surface" now holds at the API regardless of which client
        renders it.
      - **Tree divergence — RECONCILED (Jul 14, 2026): the surfacing does NOT exist anywhere.** The Replit workspace and
        `origin/main` were fully synced two-way (workspace pulled `main`, then pushed its local commits back —
        `3fcf19c6..ee81ff05`). The workspace's un-pushed commits turned out to be the **role-RBAC backstop + UI tweaks**,
        NOT Phase-B surfacing. Verified on reconciled main: no public `/expert-templates/:id` route in `App.tsx` (only
        the admin route), `packages` tab still hidden in `discover.tsx` ("hidden in Phase 1a"). So the earlier
        ground-truth claim that the purchase path was "reachable on the deployed tree" was **wrong** (or described a
        stale deploy artifact) — the purchase UI is **unregistered everywhere**, which is *safer* than this doc assumed.
        Once the workspace redeploys from the synced tree, deploy = main definitively. Phase B (Gap 3 surfacing) remains
        genuinely un-built and stays gated behind Phase A holding.
    - **Currency (decision 2 = A):** validate against the single platform currency (USD) now + keep per-listing
      `price`/`currency`; whitelist the currency field to a known set. Conversion infra exists (`budgetService`) but is
      budget-scoped; **Stage-2 multi-currency layers on later** — do not build it here.
    - **State machine at the DB (decision 3 = A):** add a CHECK on `template_purchases.status` (and the new template
      approval-status) to the valid set — the migration-109 lesson — and **flip the `status` default off `'completed'`**
      to a pre-payment state. Enforce the money state machine at the DB, not just app code.
    - **Price is locked at create** (`routes.ts` create reads `template.price` into the PaymentIntent + stores
      `expertEarnings` on the purchase row; `/confirm` records from the stored row, never re-reads `template.price`) —
      A3 adds "material `price`/`currency` change to an approved template re-enters review."
    - **Filed follow-up — refund path (not built).** `'refunded'` is **already in the migration-110
      `template_purchases_status_check`** as forward-compat (a status CHECK's failure mode is asymmetric: allowing an
      unwritten value never 500s, omitting a written one does). When the refund path is built: **do not** re-add
      `'refunded'` to the CHECK (it's already allowed — a second ADD would hit "constraint already allows this"); wire the
      actual `status = 'refunded'` write **plus the earning reversal** (undo the `template_sale` `expert_earning`). No
      `failed`/`cancelled`/`processing` were added — don't add a status nothing writes (a state with no transition in/out
      is a trap); add one only with its write path.
11. **Auth/env.** Passport serializers register in **all** environments, not just Replit (fix #133) — email/password login
    works off-Replit. The `package-lock.json` `replit.local` pollution is scrubbed durably (#134; see Lockfile purity).
12. **Market wedge — RATIFIED Jul 14, 2026: ONE market, KYOTO.** The launch is a **single-market wedge**, not the
    8-market breadth. Ground truth that informed it: the "8 launch markets" exist only as **content-source scaffolding**
    (`server/content/providers/DMOSourceRegistry.ts` — DMO ingestion across 8 markets), while the **real depth** (seeded
    vendor inventory + neighborhood density) is already concentrated on **Kyoto** (`phase-d-kyoto-vendors.seed.ts`,
    `verify-phase-1b.ts` "Kyoto is the launch market", `city-neighborhoods.seed.ts`). So Kyoto is the de-facto wedge with
    actual liquidity; the other 7 are thin. **This one decision resolves three coupled ones** (all point the same way):
    (a) **liquidity** — concentrate density in Kyoto, don't spread; (b) **guild-vs-talent Knowledge-Bar** — talent-selection
    (the strong, hard-to-disintermediate moat) is feasible in ONE market, so vet for deep local Kyoto talent rather than
    fall back to the leakable guild-document model breadth would force; (c) **Knowledge-Bar standard + expertise gate** —
    define the *Kyoto* standard and extend the existing local-expert Knowledge-Proof (essays + tenure) into a **scored**
    expertise gate for Kyoto. **Roadmap consequence:** marketplace build sequences behind Kyoto density; the other-7-market
    breadth is **paused, not built out**; surfaces should reflect Kyoto depth, not thin content for 7 near-empty markets.
    Full roadmap in `docs/audits/marketplace-maps-groundtruthed.md`. Ratified by the decision-maker (one-wedge-Kyoto).
    - **Knowledge-Bar scored expertise gate — Phase 1 landed (migration 114).** The onboarding Knowledge-Proof (3
      judgment-probing essays + `localityProof` tenure) is now **AI-scored** against a 4-dimension rubric (weighted /
      current-local / negative-steer-away / personalization), Kyoto-tuned scoring context, result stored in
      `local_expert_forms.knowledge_score` (jsonb) + `knowledge_scored_at`. Mechanism = **AI-scored + admin-confirm,
      launched ADVISORY** (ratified): the score is decision support surfaced to the admin queue; it does **not** auto-gate
      approval (approval still flows through `updateLocalExpertFormStatus`). Best-effort: no API key / API error /
      unparseable output → `unscored` verdict, never blocks onboarding. Scoring is fire-and-forget after form create
      (`server/services/expertise-scoring.service.ts`). **Phase 2 landed:** the score + per-answer rubric breakdown is
      surfaced in the admin review queue (`admin/experts.tsx`, `knowledge-score-<id>`), labelled advisory. **Phase 2 also
      fixed a Phase-1 shape bug:** the scorer read `knowledgeProofAnswers` as `string[]`, but onboarding stores
      `{question, answer}` objects — it now normalizes both, so scoring actually runs on real submissions. **Filed
      follow-ups:** Phase 3 = calibrate the rubric on real Kyoto submissions, then decide whether to tighten from advisory
      to a harder gate; refine the Kyoto scoring context (currently a first-draft seed).
    - **Experience-planning lens — ADOPTED WITHIN KYOTO (ratified Jul 16, 2026).** The BP reframe
      (`research/traveloure_bp_reframed_analysis.md`) recasts Traveloure as a destination
      *experience/event-planning* platform (weddings/proposals/birthdays/corporate events) rather than a
      tour marketplace — transactions are $5K–$50K events, not $50–$200 tours. **The LENS is adopted;
      the reframe's 8-market breadth is NOT** — §12's one-wedge-Kyoto (ratified *later*, Jul 14)
      supersedes it. So the lens applies **within Kyoto** ("plan your Kyoto experience"), the other 7
      markets stay paused. The codebase already carries the DNA (`/experiences/:slug`
      wedding/proposal/birthday, coordination-fee engine, `getExperienceSuggestionsForCity`).
      **Acquisition funnel — SEO slice LANDED (Jul 16, 2026):** the experience-template page
      (`/experiences/:slug`) had **no SEO at all**; it now emits destination-aware `SEOHead` meta —
      title/description/keywords targeting the high-intent "`<city> <event>`" search the reframe flags
      (e.g. `?destination=Kyoto` on the wedding slug → "Plan Your Kyoto Wedding", keywords `kyoto wedding`,
      `kyoto destination wedding`, `wedding planner kyoto`, …); falls back to an event-specific title with
      no destination. Client-side (same SPA `SEOHead` mechanism the rest of the app uses). The
      experience-template optimize upsell now also carries a "See planning & coordination fees" link to
      `/pricing` (fee transparency in the planning flow; no fee literals duplicated — they resolve from
      config). **Event-tier pricing — NOT a gap (corrected Jul 16, 2026):** it is already surfaced on the
      live, globally-linked `/pricing` page (Pay-Per-Use section: Trip/Experience $5.99, Event $19.99
      credited-toward-coordination, Coordination 8%-or-$499, all `fee-literal-ok` config-resolved display
      strings). **AI optimization fee — ALREADY BUILT + BILLED (corrected Jul 16, 2026):** billing the
      optimize is not a gap — the free path (`/api/optimization-preview`) returns a metrics *teaser* only,
      and the **full LLM optimization is delivered behind the paid gate**: `POST /api/optimization-payments`
      resolves the fee **server-side** via `getFee(eventType, tier)` (complexity-tiered; 24h free re-run;
      Stripe PaymentIntent `type=optimization_fee`, ownership-verified — §14-clean), then
      `POST /api/optimization-payments/confirm` verifies the intent and records `platform_revenue`. Client
      pays via cart.tsx / the Concierge UI. Amounts config-resolved (§8). See §7 (payment-gated optimize
      credit). **Still filed (not built):** Pinterest hooks, hotel-concierge B2B.
      **CORRECTION + FIX (Jul 31, 2026, Trip-Canon Lane 5a): "BILLED" was true of the payment RAIL, not the
      RUN.** The Lane 5 Phase-0 audit found the gate lived only in the §9 mount-order-DEAD `trips.routes.ts`
      twin of `POST /api/itinerary-comparisons` — the LIVE inline handler (and `/:id/generate`) fired the
      costly LLM run with ZERO payment verification, so any authenticated caller could run the paid optimize
      free by API (the client happened to pay first; the server never checked). **Fixed by the §9 harvest
      pattern:** the twin's verification (`verifyOptimizationPayment` — PI reuse-rejection, `succeeded`
      check, PI→user + PI→target binding, fee re-derived server-side via `getFee`, §14) now guards the live
      create (comparison row still created, born `pending_payment`, LLM gated) and regenerate (24h free
      re-run on the same clock as `/api/optimization-payments` ‖ this row's own paid run in-window ‖ a fresh
      PI claimed by atomic conditional update, §15); the dead twin handler is DELETED (no born-dead
      duplicate). Same lane: apply-to-trip's wipe became routing-status-aware (deletes `in_planning` only —
      routed/`purchased` rows and their `booking_id` survive), and the optimizer finally persists
      `providerServiceId` onto variant items (AI `originalServiceId` honoured only when it matches a service
      actually offered to it — an invented id stays NULL, §13), which un-breaks apply-to-cart's
      always-0-items behavior. The cart→trip re-point itself is Lane 5b, gated on
      `docs/briefs/L5-optimizer-repoint-brief.md` (decision-maker).
    - **Concierge→coordination FULFILLMENT wire — Phase 1a LANDED (Jul 22, 2026).** The event-coordination
      engine was fully built but **unwired**: `coordination_states` (status machine, `assigned_expert_id`
      coordinator field, budget/dates/vendors/timeline/cost) + full CRUD + `GET …/:id/fee`
      (`resolveCoordinationFee`, §7) + `coordination_bookings` + the expert coordinator workspace all existed,
      but the concierge **Full / done-for-you** tier never created a coordination state — "we'll follow up"
      dead-ended (only the admin visibility queue from the Fix-#5 pass saw it). **Phase 1a (this change):**
      the concierge `PATCH /api/concierge/requests/:id` now, when a **signed-in** traveler picks `full`,
      spins up (or reuses) a real `coordination_states` row (`experience_type` from the request's eventType,
      `status='intake'`, `path='concierge'`, `user_request` carries `{conciergeRequestId, intent}` as the
      link). **Idempotent** — one engagement per concierge request (dedup on `user_request->>'conciergeRequestId'`);
      **guests stay request-only** (coordination_states.userId is NOT NULL). No schema change, no migration.
      Proven behaviorally: Full-pick → engagement created; re-PATCH → same id; `/fee` resolves ($499 floor at
      empty budget, 8% tier when budget set).
      **Phase 1b — LANDED (Jul 22, 2026): traveler engagements surface.** New `/my-events` page
      (`client/src/pages/my-events.tsx`, ProtectedRoute + "My events" sidebar entry) lists the traveler's
      coordination engagements with status + the credit-aware server-quoted fee (`GET …/:id/fee`) and a **Pay**
      button that runs the Phase-2 flow via the shared Stripe `StripeCheckout` (`POST /pay` → Elements →
      `POST /pay/confirm`; client never sends an amount). The concierge Full-pick now links straight to
      `/my-events` (was a dead-end "we'll follow up"). Empty state → `/concierge`.
      **Phase 1c — LANDED (Jul 22, 2026): admin coordinator assignment.** The admin concierge queue
      (`/admin/concierge-requests`) now joins each Full request's coordination engagement (status + fee status +
      current coordinator) and offers a coordinator picker: `GET /api/admin/coordinators` (expert/local_expert/
      travel_expert, non-suspended/non-deleted) + `POST /api/admin/coordination-states/:id/assign-coordinator`
      (adminApiGuard §2 + explicit admin check; validates the target is an expert role; sets `assigned_expert_id`
      so the expert coordinator workspace picks it up). No migration.
      **Phase 2 — LANDED (Jul 22, 2026, decision-maker RATIFIED, migration 125): the coordination fee is now
      CHARGED, credit-aware.** The §7 quote-only→captured flip shipped: `POST /api/coordination-states/:id/pay`
      (+ `/pay/confirm`) charges the server-derived fee via Stripe (§14 amount from the state's own
      `experienceType`+`budget`, never body; §15 atomic-claim + `idempotencyKey` both directions; records
      `platform_revenue` 100%-platform), and the paid-signal ledger (`coordination_fee_credits`) applies the paid
      Event-branch optimize fee as a real credit — **charge = max(floor, percent) − paid optimize credit**, honoring
      the `/pricing` "Event $19.99 credited-toward-coordination" promise only when the optimize fee was actually paid.
      Full contract in §7 ("Quote-only → CAPTURED" + "Paid-signal ledger").
    - **DMO content layer — BUILT-BUT-DARK, ACTIVATED Kyoto-first (migration 117, Jul 16, 2026).** The
      8-market DMO ingestion spine (`research/traveloure_dmo_implementation_map.md` + `_addendum.md`) was
      already coded + schema-complete (7 tables: `dmo_sources`, `dmo_raw_content`,
      `expert_dmo_collections`, `expert_dmo_collection_items`, `expert_dmo_edits`, `content_gap_alerts`,
      `dmo_scrape_jobs`; `DMOSourceRegistry` (62 sources), `DMOCrawler` (Firecrawl/Tavily/Brave), mounted
      `/api/expert-workspace` with `requireExpert`) but **effectively dark and broken**: the table-creating
      migration lived UNREGISTERED in the legacy top-level `migrations/0010_add_dmo_content_layer.sql`, so
      the tables never existed at runtime and every DB-backed endpoint errored. **D0 (this change):**
      relocated → `server/migrations/117_add_dmo_content_layer.sql`, registered in `migration-files.ts`,
      **made the FK `ADD CONSTRAINT`s idempotent** (`DO/EXCEPTION WHEN duplicate_object` — the tables may
      already exist from a publish-time drizzle push, and the runner is fail-fast); added
      `server/seeds/dmo-sources.seed.ts` (mirrors the registry into `dmo_sources` so `dmo_scrape_jobs`
      FKs resolve; idempotent upsert on `(domain, market)`; registry `id` as PK), wired at startup. The
      born-hidden design (`discover_page_visible=false` until expert review) **already matches D1a** — raw
      machine/DMO content never reaches travelers without expert review. **Ingestion stays Kyoto-scoped
      per §12**; seeding all-market source *definitions* is inert scaffolding (a definition does nothing
      until a scrape job runs). **D1 LANDED (seed, Jul 16, 2026):** live UNESCO/crawler ingestion is gated
      on outbound network to the DMO domains + API keys (the agent proxy 403s `whc.unesco.org`; Firecrawl/
      Tavily/Brave keys absent), so it can only run at deploy — `server/seeds/dmo-kyoto-heritage.seed.ts`
      instead bootstraps the pipeline with 10 REAL, born-hidden Kyoto UNESCO component sites (WHC #688,
      Uji/Otsu excluded per §12) as thin factual `dmo_raw_content` stubs (`pending_expert_review`,
      `discover_page_visible=false` — experts enrich before publish). Idempotent on `(source_url, source_id)`,
      wired after the sources seed (FK). **D2 LANDED (Jul 16, 2026):** the Expert Workspace DMO Library UI
      (`client/src/pages/expert/dmo-library.tsx`, routed `/expert/dmo-library` behind `requiredRole="expert"`,
      linked in the expert sidebar) — the previously-missing client consumer. Kyoto-scoped
      (`?city=Kyoto`); browse pending/published/rejected tabs → review & enrich (name/description/tags) →
      the loop the server already enforced: `POST /content/:id/edit` then `PATCH /edits/:id/submit` then
      `POST /content/:id/publish` (publish is server-gated on a submitted edit existing — D1a) or
      `POST /content/:id/reject`. Rides the already-mounted `/api/expert-workspace` endpoints, no server
      change. **D3 LANDED (Jul 19, 2026) — Tavily-only Kyoto ingestion.** The live scrape wiring is built
      as an **isolated, key-gated** path (`server/services/dmo-ingestion.service.ts`) that uses **Tavily for
      BOTH stages** — `tavily.search` (discover the best source per site) + `tavily.extract` (scrape) — so
      the whole pipeline runs on a **single `TAVILY_API_KEY`, no Firecrawl/Brave key required**. The
      Firecrawl-coupled `DMOCrawler` is left untouched. `ingestKyotoHeritage()` enriches the D1-seeded Kyoto
      stubs **in place**, born-hidden (D1a preserved: `status='pending_expert_review'` +
      `discover_page_visible=false` are never touched); the not-force query filters out already-Tavily-enriched
      rows so passes progress through the set and re-runs are a true no-op (idempotent). **§13-safe:** no
      `TAVILY_API_KEY` ⇒ `ready:false`, **zero writes, never fabricates**. Triggers (both, per decision):
      admin **button** (`POST /api/admin/dmo/ingest-kyoto`, adminApiGuard, on `admin/data`) for on-demand
      controlled spend, **and** a **scheduler** (`dmo-ingest-scheduler.service.ts`, daily) that is **OFF unless
      `DMO_INGEST_ENABLED=1` AND a Tavily key is set**. Proven behaviorally against the real seed (no-key gate,
      10/10 enrich, D1a preserved, idempotent re-run, force). **Live run is deploy-only** (the agent proxy
      403s Tavily + source domains). **Still filed:** Brave/Firecrawl discovery for content *beyond* the seeded
      set (optional — add keys to enable auto-discovery); Smartvel/ATDW per-API clients; other-market ingestion
      (paused per §12). Migration 117 has **no CHECK constraints** → no publish-time push trap.
    - **Content-gap tracker + priority scraping — LANDED (Jul 19, 2026).** The "track what content we have
      so we can tell the scraper what to prioritize" system. `content-gap.service.ts` counts
      `dmo_raw_content` per content type against a Kyoto editorial target (`KYOTO_CONTENT_PLAN` —
      attractions/venues/restaurants/events/neighborhoods, experience-planning lens) and reconciles
      `content_gap_alerts` idempotently (upsert unmet, auto-resolve met — the queue self-clears). The plan
      is the SINGLE source of truth shared with ingestion: each entry carries the target count, the
      `dmo_sources.id` discovered rows attach to, and the Tavily discovery queries. `ingestKyotoContentGaps`
      (in `dmo-ingestion.service.ts`) reads the open gaps highest-severity-first and runs targeted Tavily
      **searches** (discovery only, cheaper than per-URL extract) to create NEW **born-hidden** stubs
      (D1a: `pending_expert_review` + `discover_page_visible=false`, `scraped_by='tavily:gap'`,
      `confidence 0.40`) for the thin categories — deduped on `(source_url, source_id)`, key-gated (§13,
      no key ⇒ zero writes), spend-capped (default ≤3 gaps × ≤6 stubs/pass). A second pass fills the
      next-thinnest categories (priority-driven), so we stop re-scraping the 10 seeded heritage sites.
      Admin surface on `/admin/data`: coverage table + Recalculate/Fill buttons
      (`GET /api/admin/dmo/gaps`, `POST /api/admin/dmo/analyze-gaps`, `POST /api/admin/dmo/ingest-gaps`,
      admin-gated). **No migration** — `content_gap_alerts` exists (117). Kyoto target numbers are
      editorial config, not fabricated content (§13). Live gap-fill runs at deploy (proxy blocks Tavily).
    - **DMO content model — CORRECTED & RATIFIED (Jul 19, 2026): scraped content is the expert's raw
      research library, NOT a traveler surface.** The decision-maker clarified the intent: DMO content is
      *ingredients* an expert uses to (a) build/enhance **client itineraries** (private, in the workspace),
      (b) build **Ready Made Trips** that publish to Discover via the §10 admin template-approval queue, or
      (c) create **social** content. The raw/curated scraped content is **never surfaced to travelers on its
      own** — it is always transformed into one of those three outputs first. Admin approval sits at
      **intake** (admin pre-filters what raw scraped content enters the expert library — ratified "B"),
      not at a per-item publish-to-Discover step.
    - **DMO in the CENTRAL content system — LANDED (approach A, migration 132; ratified Jul 24, 2026).**
      Decision-maker directive: DMO/scraped content **is included in the central content system** (so there
      is ONE content system with a complete origin taxonomy) **but only surfaces in the Expert Workspace +
      the rest of the content flows normally** — i.e. DMO is the **`sourced`** origin
      (`shared/content-origin.ts`), EXPERT-WORKSPACE-ONLY, **never a traveler surface**. Mechanism: migration
      132 adds `dmo_content` to the `content_type` enum (idempotent ADD VALUE, migration-0009 pattern); DMO
      rows are mirrored into `content_registry` as `contentType='dmo_content'` (origin `sourced`) by
      `dmo-registry-sync.service.ts` — **register-on-approve** (the admin intake-approve endpoint registers
      the row it approves) + an idempotent **backfill** (`POST /api/admin/dmo/sync-registry`). `dmo_raw_content`
      remains the working store + the Expert Workspace read path (unchanged); the registry mirror is additive,
      for one-system admin visibility / reporting / tracking-number lineage. **HARD INVARIANT (enforced two
      ways):** `sourced` never reaches a traveler surface — (1) no `SURFACE_DEFAULT_CONTENT_TYPES` lists
      `dmo_content`, and (2) the traveler resolver (`content-query.service.ts` `getContentRegistryByLocation`
      + `getContentRegistryByIds`) **hard-excludes** any type whose `contentOriginFor` is `sourced`, even if a
      placement rule or surface map ever points at it. Registering DMO centrally does NOT make it
      traveler-visible; it becomes a Discover surface only after an expert transforms it into a
      platform-origin trip / Ready Made Trip (the §10 queue). Additive, no CHECK → no publish-time push trap.
    - **Admin intake gate — LANDED (Jul 19, 2026, migration 118).** Scraped/DMO content is now born
      **hidden from experts** (`dmo_raw_content.expert_workspace_visible` default flipped `true → false` at
      both the ORM `shared/schema.ts` and the DB column, migration 118 — default-only, **no backfill, no
      CHECK**, no publish-time push trap). All three create sites set it FALSE explicitly (heritage seed,
      Tavily gap-fill, DMOCrawler). An admin approves raw content **into** the library via a queue on
      `/admin/data`: `GET /api/admin/dmo/intake` (lists hidden, non-rejected Kyoto content),
      `POST …/intake/:id/approve` (atomic conditional flip → `expert_workspace_visible=true`; idempotent —
      a second approve matches 0 rows → 409), `POST …/intake/:id/reject` (`status='rejected'`, stays hidden),
      all `adminApiGuard`-gated. The expert DMO Library reads `expert_workspace_visible=true`, so approved
      content appears and rejected/pending content never does. **Grandfather (F2 pattern):** existing
      pre-gate rows keep their current visibility (the seed heritage rows stay expert-visible, out of the
      queue). This is the **intake** gate; the §10 template-approval queue remains the separate gate on the
      finished Ready Made Trip. Proven behaviorally: born-hidden, in-queue, approve→in-library/out-of-queue,
      idempotent re-approve, reject→stays-out, grandfather. **Filed:** persist `reviewed_by`/`reviewed_at`
      on intake decisions (columns exist); optional rejection-reason UI.
    - **D4 — REVERTED (Jul 19, 2026).** The earlier "traveler-facing Local guides on the Discover city page"
      surface (getPublishedGuidesForCity + `GET /api/discover/location/:city/guides` + the
      `LocalGuidesSection`) was built on the wrong assumption that scraped content publishes directly to
      travelers. Per the corrected model above it was **removed**: the reader service, the public route, and
      the Discover section are deleted. The **expert "Publish to Discover" / reject workflow** that fed it
      (the D2 `POST /api/expert-workspace/content/:id/publish|reject` endpoints + the DMO Library publish
      buttons/tabs) is **also removed** — there is no direct DMO→Discover path. The DMO Library
      (`dmo-library.tsx`) is refocused as a research surface: browse Kyoto content → **Review & refine**
      (still writes `expert_dmo_edits`) → **Add to trip → Build Ready Made Trip** (the `/build-itinerary`
      bridge, unchanged; the trip then rides the §10 admin approval to sell). The admin intake-approval
      queue that gates raw content into this library is **built** (see "Admin intake gate" above). The
      **"Add to client itinerary"** action is **built** — the expert trip workspace (`workspace.tsx`) has an
      "Add from DMO Library" picker (`components/expert/dmo-picker-modal.tsx`) that drops an admin-approved
      DMO place onto the current trip's itinerary via the live `POST /api/trips/:tripId/itinerary-items`
      (no new server surface). The no-trip workspace is also now a **launchpad** (Assigned Trips / Ready Made
      Trips / DMO Library / Content Studio) instead of a dead-end. **Filed follow-ups:** wire refinement
      (`expert_dmo_edits`) into the built trip's content; "Create social post" action.

### §13 — Known Defects (these are BUGS, not intended behavior — do not describe them as how the platform works)

- **P0 trip-data IDOR cluster — FIXED on main (re-verified Aug 2, 2026; the "fix in flight" note below is
  historical).** All four holes are closed: apply-to-trip authorizes the TARGET TRIP via `authorizeTripLogistics`
  (`plancard.routes.ts` — the IDOR closed in 4d26971b), and `itinerary/reorder` + `optimize-order` (`routes.ts`)
  both run `authorizeTripLogistics` before any write. The durable lesson stands unchanged. Original record:
  Three live holes, all
  orchestrator-verified in code, none previously documented: ① **destructive cross-trip IDOR** —
  `POST /api/itinerary-comparisons/:id/apply-to-trip` (`plancard.routes.ts:27`) gates ONLY on
  `comparison.userId`, then `deleteItineraryItemsByTrip(comparison.tripId)` + bulk-inserts; **the trip is never
  ownership-checked**, and ① b the live inline `POST /api/itinerary-comparisons` (`routes.ts:~5627`) writes a
  **caller-supplied `tripId`** with no check on that trip — so any authenticated user can point a comparison at
  someone else's trip and wipe/overwrite its entire itinerary. ② `POST /api/trips/:tripId/itinerary/reorder`
  (`routes.ts:8164`) and ③ `.../itinerary/optimize-order` (`routes.ts:~8176`) have **`isAuthenticated` only — zero
  trip authorization**; ② also hardcodes `"owner"` as the change-log role (a lie for a non-owner caller). Fix =
  the canonical `authorizeTripLogistics` on all four, authorizing BEFORE the destructive delete. **Lesson (the
  durable point): the risk surface was never `getTripRole` — it is the ~15 "model C" ad-hoc/omitted trip gates.
  A new trip endpoint MUST use `authorizeTripLogistics` (or the inline owner→assigned→author chain), never a
  bespoke `trip.userId !== userId` and never nothing.**
- **Trip-access model divergence + owner under-grant (L10) — ground-truthed Jul 30, 2026.** `getTripRole`
  (`utils/trip-role.ts`) reads ONLY `trip_collaborators` + `trip_expert_advisors` — it **never reads `trips`**, so a
  trip's own owner (`trips.userId`) gets **no role** and 403s on the 4 live model-A gates (plancard read, transport-leg
  `/status`, per-item PATCH/DELETE) while the SAME user succeeds on every `authorizeTripLogistics`/inline-chain
  endpoint (add items, anchors, legs, budget). The `createTrip` owner-row fix (`storage.ts:747-758`, commit
  `32787272`) closed the common path, but **three live paths still mint owner-less trips**:
  `ready-made-purchase.service.ts:69-80` (**a traveler who just BOUGHT a ready-made trip 403s on their own Trip
  Card** — the highest-probability real victim), `booking.service.ts:93-96` (cart-checkout auto-trip) and
  `:993-1002` (saved-trip conversion) — all raw-SQL, all bypassing the helper; the `seedTripOwnership` backfill only
  repairs them at the next boot. Also: **no `expert`/`friend` collaborator row is EVER created by any code path**
  (the 3-tier model of migration 026 is schema-only; `canMutateTrip`'s `friend` branch is unreachable), and
  `storage.isExpertAssignedToTrip` (`storage.ts:4610-4615`) is **status-blind** while the other two
  implementations of the same concept filter `status IN ('pending','accepted')` — so a **rejected advisor still
  passes model B**. `trips.managedByEaId` grants access in no model. The "known pre-launch bypass" comments
  (4 sites) denote this **under-grant**, not an over-grant — the historical platform-role over-grant is already
  fixed (`trip-role.ts:4-7`). Full map: the L7 phase-0 audit; remediation is Fable-designed (owner row-value
  branch + write-side hardening + unify the advisor lookup), NOT a mechanical convergence — Option 3
  (converge model A onto `authorizeTripLogistics`) would inherit the status-blind over-grant and must not ship
  before that is fixed.
  **STATUS UPDATE (Aug 2, 2026 — role-hygiene lane, slip-dispatch ruling 13): the L10 remediation is LANDED,
  invariant-held.** ① The advisor lookup is UNIFIED on the canonical `isTripAdvisor`
  (`server/utils/trip-advisor.ts` — closed allow-list `pending|accepted|assigned` pass, `rejected`/unknown/NULL
  DENY, fail-closed); `storage.isExpertAssignedToTrip` now delegates to it and `getTripRole` consumes it, so the
  status-blind over-grant and the `'assigned'`-excluded under-grant are both gone, and item create/PATCH/DELETE
  agree on who an advisor is (the "expert can add but not edit" asymmetry no longer exists). ② All owner-bearing
  trip mint paths write the owner `trip_collaborators` row in the same operation (`storage.createTrip`,
  `ready-made-purchase.service.ts`, both `booking.service.ts` raw-SQL sites, and the e2e seed — fixed this lane);
  the boot backfill (`trip-ownership.seed.ts`) remains a defensive repair, not the mechanism of record. ③ The
  invariant is now CI-enforced: `scripts/check-trip-mint-owner-access.cjs` (`trip-mint-owner-guard` in
  `build.yml`) fails any new trips-INSERT that skips the owner row, with a `trip-mint-owner-ok` annotation as the
  escape hatch for deliberate NULL-owner authoring-mode inserts (which have no owner principal; access rides
  `authorId`/`isTripAuthor`). **Owner access is still invariant-held, not architectural** — `getTripRole` never
  reads `trips.userId`; the owner row-value branch inside `getTripRole` stays the NAMED FOLLOW-UP, and until it
  lands the guard is the load-bearing protection. The ~12 bespoke `trip.userId !== userId` gates consolidation
  is likewise a named follow-up (dispatch ruling 13).

- **Shared-trip access (L20) — APPROVED Jul 30, 2026 by the decision-maker ("Yes, this would be a good feature"), with
  the ratified tier design below.** Phase-0 ground truth corrected the scope in three important ways: ① the ungated
  logistics surface is **22 endpoints**, not the 10 first reported (all `isAuthenticated`-only in `routes.ts`: contracts
  ×5, transactions/budget ×7, emergency/alerts ×7, the 3 AI reads, bulk-invite); ② **a "friend"/"participant" principal
  is NOT EXPRESSIBLE today** — no code path ever writes a `role='expert'|'friend'` `trip_collaborators` row, and
  `trip_participants.userId` is left NULL by the only automated writer (`bulkInvite`), with no email→account
  reconciliation, so participants are email-only RSVP records with no session; real participant access needs a
  **Phase 2 invite→accept flow that mints collaborator rows** (a genuine feature build, deliberately NOT bundled into
  the hole-closing); ③ **there is NO correct "is assigned expert?" predicate in the codebase** — `storage.isExpertAssignedToTrip`
  is status-blind (a **rejected** advisor passes, and `authorizeTripLogistics` uses it), while the two filtered
  implementations exclude `'assigned'`, which `admin-query.service.ts` writes when an admin confirms a lead. **Ratified
  canonical predicate: `pending|accepted|assigned` PASS, `rejected` DENIES, unknown status DENIES (fail closed)** — this
  is a PREREQUISITE, since widening expert reach on a predicate that admits rejected advisors is the biggest hazard here.
  **Ratified tier table** (only owner / assigned expert / author / admin are expressible): money-between-people
  (transactions, splits, budget summary/categories/settle-up) = **owner-only** (the settle-up graph decides who owes whom;
  the expert has their own commission view); vendor contracts = **read owner ‖ expert, write owner-only** (coordination is
  their job, creating a financial/legal artifact is not); emergency = **read owner ‖ expert, write owner-only EXCEPT
  `POST alerts` which the expert may raise** (the local fixer must reach your people in a crisis without being able to
  rewrite who they are); participant PII (dietary/accessibility/phone/amount-owed) = **owner-only, never expert** (a
  materially larger disclosure than any existing expert surface); the 3 AI reads = owner ‖ expert ‖ author ‖ admin **and
  rate-limited** (`itinerary/recommendations` makes a real OpenAI call behind no limiter). Also filed-and-fixed in the same
  lane: `bulk-invite` array/cap validation, `emergency/initialize` idempotency (it appends duplicate embassy rows every
  call), the caller-supplied `userId` on `POST participants` (a future self-service authorization grant), the zero-participant
  NaN in `calculate-split`, and cross-trip participant ids in `transactions/split`. **Correction worth recording:**
  `trips.managedByEaId` has **zero production writers** (only a CI seed), so the read-gates honouring it — including the
  P0-b stopgap — gate on a column that is always NULL in prod; that branch is inert, not load-bearing.
- **Trust-claims cluster** (on `/experts`, `/experts/:id`, `/services/:id`), awaiting the dedicated brief. **Two arms
  FIXED:** ① the `verified || true` bug (every expert rendered "Verified") is closed by Replit commit `139d3f71` —
  `expert-detail.tsx` now uses `verified === true`. ② **fabricated `4.9`/`4.5` ratings on LIVE surfaces — closed (PR #177).**
  The server was already honest (review create is booking-gated; `provider_services.averageRating`/`reviewCount` are real
  aggregates, `null`/`0` with no reviews). The fabrication was **client-side** — hardcoded `const rating = 4.9` in the
  expert/match/provider cards + `avgRating ?? "4.9"` / `averageRating || "4.5"` fallbacks that invented a score over the
  honest null. All live sites now show the **real** rating when `reviewCount > 0`, else an honest **"New"** (never a fake
  number). **Still filed (separate, NOT the same as fabrication):** (a) a real **expert-level rating aggregate** doesn't
  exist yet (experts have no rating source — service reviews are service-scoped), so expert cards honestly show "New";
  (b) **mock-data demo arrays — REGISTRY CORRECTED (Jul 30, 2026; the old list was STALE).** Ground-truthed: `chat.tsx`
  and `provider/profile.tsx` are **already honest** (explicit §13 comments; real review-backed rating or `null`, never a
  fabricated number), and `explore.tsx` / a `help-me-decide` page **no longer exist**. The real remaining offender the old
  list MISSED is the **public landing page** (`client/src/pages/landing.tsx`): fabricated `testimonials` (invented expert
  names + "$2,400 saved" / "$65-120/hr" earnings claims, no `service_reviews` aggregate behind them) and invented
  per-category stats (`trending` / `expertRates` / `hiddenGems` / `activeCount`, while `/api/experience-types` returns
  metadata only). Its `impactStats` block is **already correctly wired** to the live `/api/platform/stats` — that one is
  the right pattern, leave it. Fabrication removal is §13-mandated (not a taste call); **building a curated real
  testimonial feed + per-experience-type stat aggregates is a separate DECISION-MAKER call** (which reviews get featured
  is editorial), filed — do not invent either source. **Still open (other cluster arms):** the `90/10` commission **literal**, hardcoded "free cancellation / instant
  confirmation / 24-7 support" copy, and a 2-character-neighbourhood empty-result trap. Do not mark §13 resolved — the
  `verified` + live-ratings arms are done. **New arm found by the data-capture audit (Jul 15, 2026), CLOSED same day
  (migration 115 + guard):** the unconfigured Fever integration **fabricated calendar events** — without
  `IMPACT_ACCOUNT_SID`/`IMPACT_AUTH_TOKEN`, `feverService.searchEvents` returned generated mock events and the daily
  cache-scheduler tick wrote them into `destination_events` **born-`approved`** (ids `mock-<city>-<n>`, fake dates/
  ratings), which the public By-Date calendar served as real. Fix: `fever-cache.service` now skips entirely when
  `feverService.isReady()` is false (the Booking.com/OpenTable "skipping live fetch" sibling pattern); migration 115
  purges the already-written `mock-%` rows. **CLOSED (Jul 15, 2026 — decision ratified):** AI (Grok) and Fever events
  are now **born-`pending`**, not `approved` — the D1a born-approved lesson applied to machine content (AI can
  hallucinate events, so it doesn't self-publish to the public By-Date calendar). Both machine insert sites flipped
  (`travelpulse.service.ts` AI arm, `partner-events-cache.service.ts` Fever arm); they land in the **existing**
  `getPendingDestinationEvents` admin queue alongside user-submitted events. The queue was **headless** (approve/reject
  endpoints existed, zero client consumer) — built the admin UI (`client/src/pages/admin/destination-events.tsx`,
  "Event Review", source-badged AI/Partner/User, approve + reject-with-reason). Grandfather: existing `approved` rows
  untouched (no calendar outage). Proven behaviorally: born-pending → hidden from the public calendar, visible in the
  queue → approve → live, out of queue. Full pipeline audit verdicts in the data-capture report
  (docs/audits/, feed/calendar data-capture).
- **Approval divergences** (§1) — tracked (D1a/Phase 2). *(The coordination-fee $0-budget bug was fixed by #144 — see §7.)*
- **`trips.status` — DEAD write-once field, do not read, do not write (Lane 3 Option B, ratified Jul 31, 2026).**
  Born `draft`/`planning` at creation; nothing ever advances it. Trip PHASE is **date-derived everywhere**
  (`startDate`/`endDate` vs now — the convention `client/src/pages/my-trips.tsx` already used; both columns are
  NOT NULL so the derivation is total). **Fixed:** the admin trips dashboard's `statusCounts`
  (`server/routes/admin.routes.ts`) plus two independently-discovered believing readers —
  `customers.routes.ts`'s `hasActiveTrip` (was structurally always true) and `executive-assistant.tsx`'s stats
  (a `completed` count structurally always 0) — now derive from dates; the "Add to a Trip" pickers' no-op
  status filter now excludes genuinely-finished trips by `endDate`. The column and `tripStatusEnum` stay
  physically in place (no schema change). **The named future owner of a real trip lifecycle is the Phase 4
  convert-to-ready-made brief** — the field's revival path is documented in the same place as its deprecation;
  status ownership gets built when Phase 4 gives it a customer. Full record incl. the pass-through echo list
  and filed latent readers (`storage.getTrips(status)` branch, dead `getAdminTripsList`):
  `docs/briefs/L3-trips-status-brief.md`.
- **`expert_service_categories` — NOT a bug (corrected Jul 15, 2026).** Earlier drafts called this a "dropped-by-013
  but still referenced" latent bug. **That premise was factually wrong:** migration 013 explicitly retains it
  (`-- 4. expert_service_categories: intentionally NOT dropped here.`) and migration **030**
  (`030_restore_expert_service_categories.sql`, registered + startup-run) recreates and seeds it (7 rows + FK). The
  table is **live** — it's the read-only ESO onboarding catalog. The **one real defect** was
  `storage.getExpertServiceCategories()` hardcoded to `return []` on that false premise, which left
  `GET /api/expert-service-categories` permanently empty (the expert service-listings + travel-expert onboarding
  category pickers had no options). **Fixed** — the method now queries the live table.

### §14 — Money-endpoint server-derivation rule (client-trusted amount/identity cluster)

**GOVERNING RULE (convention — enforce on every money/ownership endpoint):** a money endpoint derives the
charge/refund **amount from the server-side catalog/record**, and the **acting user from the session** — **NEVER**
from `req.body`. `req.body.amount` / `req.body.price` / `req.body.userId` must never reach a payment or ownership
decision. This class appeared **seven times** (coordination-fee $0-budget, template mass-assignment $0.01 price,
world-writable fee-config, then the four below); the rule closes the class so the eighth can't be written.

**Closed (client-trusted money cluster, own security branch):**
- **A1 🔴 `POST /api/expert-requests/payment-intent`** — was charging the client-sent `amount` verbatim (pay 1¢ for a
  Full Concierge) with `userId` from body. Now: acting user from session; amount **server-derived** via
  `resolveExpertReviewAmount(serviceType, variant.totalCost)` (`booking-actions.service.ts`) from the variant's stored
  cost; ownership (IDOR) enforced against `getVariantOwnerAndCost`. The tier constants ($50/$50+5%/$100+8%) were
  relocated **server-side** from the client, and **migrated to `fee_bands` by migration 137 (Jul 26, 2026)** — admin-editable
  rows (`expert_review_flat`/`expert_review_book_flat`+`_percent`/`full_concierge_flat`+`_percent`); the code constants
  survive only as the documented safe-failure fallback (§8 coordination-floor posture). Same change ledgered the fee:
  `expert_review_fee` platform_revenue recorded idempotently at both completion paths (was collected, never recorded).
  **Split now actually credited (ratified Jul 30, 2026):** the R6 split logic existed but had zero real trigger
  (`PATCH /api/expert-requests/:id/complete` had no callers); the expert's share of a PAID request is now credited as
  a **held** escrow earning (7-day clearance window, `expert_review_fee` surface key) at the `trip_expert_advisors`
  `workspaceStatus → 'delivered'` transition, reusing `completeExpertRequest`/`creditExpertReviewSplit` verbatim.
- **A2 🔴 `POST /api/bookings/refund`** — was auth-only (any user could refund any booking for any amount). Now:
  **owner-or-admin gate**; amount **server-derived** from the booking's `total_amount` (client `amount` ignored).
  **Earnings-reversal fast-follow — CLOSED by escrow Phase 4 (PR #170):** the refund now also calls
  `storage.reverseEarningsForBooking` + `reversePlatformRevenueForBooking`, so a refunded booking no longer leaves the
  provider/expert credited or the platform revenue recognised. Reversal is **held/releasable → `reversed` only**;
  `paid_out` earnings are **never auto-clawed-back** (ratified "reversal only while in escrow") — surfaced as
  `skippedPaidOut` for manual handling. Platform-revenue reversal is a **compensating negative `platform_revenue` row**
  (double-entry — the summaries sum every row regardless of status, and also flow through the daily summary, so the net
  is correct with no reader change); the original row is flipped `status='reversed'` as the idempotency guard. **Still
  filed (separate):** the standalone endpoint's `createRefund` targets the legacy `bookings` table (real bookings live in
  `service_bookings`) — Phase 4 added a correct **service-booking** refund (`stripePaymentService.refundServiceBooking`,
  used by dispute-uphold) but did not re-point this legacy endpoint.
- **A3 🔴 `POST /api/bookings/process-cart`** — `userId` from body (IDOR). Now: session user. **Filed fast-follow:**
  AI-generated cart items (no `providerId`) still trust `item.price` — server has no catalog price for them; low
  severity (buyer's own charge, no payout theft; real-provider items already re-read DB price).
- **A4 (found during the fix) `POST /api/bookings/apply-promo`** — `userId` from body (per-user promo-limit probe/bypass
  class). Now: session user. Preview-only (no money moves, no usage recorded here — `recordPromoUsage` runs at checkout;
  the real charge + promo re-derive server-side at `/api/checkout`).

**Guard:** `scripts/check-money-endpoints.cjs` (grep gate) fails if a payment/ownership route reads
`req.body.amount`/`price`/`userId` into a money decision — the cheapest durable catch for the next instance. Do not
remove it. **Now operation-scoped (hardened Jul 14, 2026 — wired into CI via `.github/workflows/build.yml`):** it scans
**every** `.ts` under `server/routes` + `server/services` **plus the `server/routes.ts` monolith**, and flags a
body-sourced amount/price/userId when EITHER the file is money-named (original coverage, no regression) OR the **enclosing
route handler performs a money operation** (Stripe call / transfer / refund / charge / payout / earning-or-revenue write /
capture-confirm). Handler-scoping keeps the monolith from flagging unrelated reads. Escape hatch unchanged: a genuinely
safe read (e.g. a server-capped payout *withdrawal* of the user's own balance, or a preview that never charges) carries a
`money-derive-ok` comment on the line. (First catch on landing: the two dark `payouts/request` handlers in
`experts.routes.ts` — a non-money-named file the old guard never scanned — reviewed as safe withdrawals, annotated.)
**NOT in this cluster (named, separate lanes):** F2 born-approved wizard (D1a/Phase-3, root cause = the
`provider_services.approvalStatus` default); the idempotency cluster (payout double-transfer, `/confirm` TOCTOU,
`/checkout` dup-bookings — see §15); marketplace Phase B surfacing.

### §15 — Money-safety idempotency invariant (double-spend on retry/race)

**GOVERNING INVARIANT:** any endpoint that moves money or creates a purchase/booking must be **idempotent** — a
retry / double-click / replay produces the **same single effect**, enforced by BOTH (a) a Stripe `idempotencyKey` on
the external call and (b) an **atomic conditional DB update** (`UPDATE … WHERE status = <expected>`) so the state
transition itself is the concurrency guard. A check-then-update (`if status==X { update }`) is the TOCTOU bug, **not**
a guard. Claim the row atomically **first**, then make the external call — so a concurrent caller can't also pass.

**Closed (money-safety idempotency cluster, own branch):**
- **FIX 1 🔴 Payout double-transfer** (`PATCH /api/admin/payouts/:id`, `admin.routes.ts`): was no idempotency key +
  no atomic guard → a retry/double-click re-ran a **real Stripe transfer**. Now: `storage.claim{Expert,Provider}PayoutForProcessing`
  atomically flips `→'processing'` only if `status NOT IN ('completed','processing')` (returns undefined → 409, no
  transfer); `createTransfer` takes a deterministic `idempotencyKey` (`payout-<type>-<id>`). Proven: 2nd invocation
  claims 0 rows → one transfer.
- **FIX 3 `/confirm` TOCTOU** (marketplace, `routes.ts`): the confirm now transitions via
  `UPDATE template_purchases SET status='completed' WHERE id=:id AND status='pending_payment'` and records the earning
  **only if a row was updated**; a concurrent/duplicate confirm updates 0 rows → returns `alreadyCompleted`, no double
  credit. Proven at the DB. (Latent today — purchase UI orphaned — but race-safe before Phase B surfaces it.)
- **FIX 2 `/checkout` — premise did NOT reproduce.** The live `/api/checkout` (`payments.routes.ts:283`) **already
  dedups** on `service_bookings.idempotency_key`. The shadowed `routes.ts` `/api/checkout` duplicate (the route-order
  landmine with no idempotency) is **deleted by the §9 shadow-route sweep (Jul 15, 2026)**. Residual (filed, not fixed):
  the key is **optional** (`if (idempotencyKey)`) so a client omitting it bypasses dedup. Recommend: require the key
  (or add a natural-key server dedup) — a small hardening, not "add idempotency."
- **Coordination cancel-reversal — CLEAN.** No earning is ever credited for coordination (the fee is quote-only, never
  captured; no `createExpertEarning` tied to coordination/`booking_concierge`). Nothing to reverse on cancel. Closed.

### §16 — Affiliate-outbound rule (agent-booking, ratified Jul 23, 2026)

**GOVERNING RULE (decision-maker directive):** affiliate/partner content must behave like the Discover feeds —
**no surface may send the traveler off-site with a raw `window.open(affiliateUrl)`**. Any "book" action on
partner-fulfilled content routes through the in-platform **booking-agent rail**:
`POST /api/affiliate-booking-requests` (the rail Discover's `unified-result-card` already uses) — the server
auto-assigns a booking agent (expert), **keeps the affiliate URL server-side** (it is deliberately never returned
to the client; the agent books through it, preserving commission and preventing disintermediation), and the
confirmed booking is logged onto the traveler's trip (migration 051 `affiliate_booking_requests.trip_id`).
Tracked *informational* outbound (e.g. the curated-content `POST /api/content/affiliate-redirect`, which records
into `affiliate_clicks` before redirecting) remains allowed — the prohibition is on **untracked raw outbound and
off-site *booking* CTAs**. First application: all 10 Travelpayouts card types
(`client/src/components/travelpayouts/*Card.tsx`) — previously every card's "Book" was a raw
`window.open(affiliateUrl || bookingUrl)` (untracked, funnel-leaking, inconsistent with the Amadeus add-to-cart
hotels on the same page); now they share `useAgentBooking` → the booking-agent rail. **Filed (architectural,
per the same directive):** fold the parallel `/api/catalog/*` Travelpayouts feed into the CENTRAL content system
(content registry / `affiliate_products` + placement rules) so all content lives in one system — a design job
(live-priced API feeds vs registry rows), not a mechanical move; do not build a third content home in the interim.

### §17 — Back-office / loop-closing program (ratified Jul 27, 2026)

Governing spec: `docs/backoffice/mockups/mockup-unified-workspace.html` (v9). Locked decisions:
- **Build-first / distribute-later.** ONE Workstation entry ("New build" + the builds list); client/store/
  social are DISTRIBUTION CHANNELS with independent state on one build, chosen after building, never at
  creation. Distribute channels: Client / Store / Social / **Direct (WhatsApp + trackable booking links —
  short-links + `booking_acquisition_ref` attribution, already captured)**. A store listing is created FROM
  an existing build ("ship to store"), not listing-then-trip.
- **Add panel = the Central Content network.** Source pills map the registry origin taxonomy: DMO Library
  (sourced — expert-workspace-only, invariant untouched) · Platform content · Platform services (ALL
  F2-approved provider offerings) · Partner inventory · My services · Custom. One registry-backed search;
  no third content home. The DMO pill keeps joining the expert-edits store.
- **8-module console IA** (16 tabs → Today · Workstation · Inbox · Catalog · Money · Customers ·
  Performance · Settings). Programming rule: ONE owning endpoint per number, ONE home per list — modules
  reference, never re-render. Honest surfaces only (§13). Provider console inherits the same 8 modules.
- **Two palettes BY DESIGN.** Traveler surface keeps global `--primary #FF385C` + cool greys; the earner
  back office runs the warm console palette (#E85D55 + #1A1A18/#7A7A72/#E8E8E2/#FAFAF8) via the
  `.console-scope` token block on BackofficeShell. Never restyle console pages with raw hex — use tokens.
- **Provider offering linkage GO:** additive nullable `provider_services.service_offering_type_id` FK
  (migration-057 pattern) + offering-first provider create (pick the /earn offering; category derives from
  the catalog's `category_key`; chip↔picker vocabulary break closed). Expert tier becomes required;
  the tier picker partitions by role; `aff_*`/legacy categories filtered from the provider picker.
- **Shareable-link landing = the Yuki spec** (`docs/backoffice/mockups/mockup-offering-page.html`):
  `/services/:id` is rebuilt to it — one page for marketplace browsing AND all shared/booking links
  (breadcrumb into /p/, Direct-Booking trust panel, migration-144 cancellation policy, honest reviews,
  Book Now → existing checkout rail). Short links keep redirecting there.
- **Distribution formats (CORRECTED + re-ratified Jul 27, 2026): one Trip Card is NOT the universal
  renderer — and "destination" means the DISTRIBUTION destination (the channel), not geography.** The
  first ratification same day mis-read the axis as geographic; the decision-maker corrected it: a build's
  rendering FORMAT is driven by **where the plan is going** — the §17 distribution channels — flavored by
  experience type and styled by market. Resolution axes (all three, ratified "option 1 & 3"):
  **channel × experience type × market**, fallback chain
  `(channel, type, market) → (channel, type) → (channel, market) → channel default`. The CHANNEL picks
  the structure: **Client** = the full Workstation itinerary (Trip Card `embedded`; the Kyoto
  neighborhood-grouped / venue-timeline structures live HERE as market×type entries) · **Store** = the
  Ready Made Trip product page (teaser-gated; consumes the format's `storeLayout`) · **Social** = a
  social-media-driven format producing BOTH (ratified) a story/carousel-style visual rendering of the
  plan AND the caption + share-image pack (extends the existing `promo-text.service.ts` + share-image
  ready-made layout — do not build a parallel caption engine) · **Direct** = link-preview/OG format for
  WhatsApp + trackable booking short-links (extends the existing storefront OG-injection pattern).
  Mechanism unchanged from the first record where still true: pure client/registry resolution derived
  from fields the build+surface already know (channel is intrinsic to the rendering surface;
  `trips.destination`/`eventType` supply market/type) — no schema change, no migration; the shallow
  `getTemplateConfig(eventType)` (client/src/components/plancard/plancard-types.tsx) is absorbed as the
  vocabulary layer. A format defines STRUCTURE + vocabulary + per-channel layout, not just labels.
  §12: Kyoto market entries first; §13: social/story slots render only real content. Design doc:
  `docs/backoffice/DISTRIBUTION_FORMATS.md` (renamed from DESTINATION_FORMATS.md with the correction).
  PlanCard's `embedded` mode is orthogonal and stays.

- **Console IA — 17→9 collapse + Channel Calendar (ratified Jul 28, 2026; amends the 8-module IA to NINE).**
  Modules: Today · **Calendar (new 9th)** · Workstation · Inbox · Catalog · Money · Customers · Performance ·
  Settings. Absorptions (redirects, never deletions): Bookings/Assigned Trips/Messages → Inbox; My Offerings/
  Store Listings → Catalog; DMO Library/Local Guides → Workstation Add-panel source drawers; Analytics +
  Share&Promote's link views → Performance (creation actions already live on builds in Distribute); Profile →
  Settings; Earnings renamed Money. **Calendar rules:** ONE channel-filtered calendar (never per-channel
  calendars); event lanes inbound (bookings/agent requests/store purchases) · outbound (client deliveries,
  coordination milestones) · availability (Catalog slots) · store lifecycle; every event backed by a real row
  (§13 — social scheduling lane renders empty until the kit really schedules); events REFERENCE their owning
  module, never re-render (the one-home rule). **Catalog = the storefront's management home** (/p/:handle
  header + lanes + availability editing). **Customers = honest self-scoped aggregation** from this earner's
  real bookings/purchases/trips — no invented CRM fields without ratification. **Provider console = the same
  NINE, with Workstation = the Product Builder** (corrected from "minus Workstation"): product shapes = single
  service (ServiceForm, exists) · **bundle** (own approved services composed under ONE price; unlocks at 2+
  approved services; components must be approved — no unapproved service hides inside a sellable bundle) ·
  **property** (accommodation deepened: photos, per-night pricing, room availability). **Creation ladder**
  (/earn → service → catalog → bundle → property): one door growing with the merchant, progressive reveal,
  every rung through the SAME F2 approval queue/storefront/Calendar/Distribute rails. **GATED separately (not
  ratified yet, own briefs before code):** the bundle's component-linkage schema (provider_services stays
  canonical — no new service table; join rows vs jsonb is a decision-maker schema call) and the bundle money
  path (booking = ONE server-derived price from the stored product, §14; one booking row; component
  fulfillment design). Design doc: docs/backoffice/mockups/mockup-console-pages.html. Build = PR-C: C1 sidebar
  collapse+redirects → C2 Catalog storefront header+availability → C3 Calendar (read-only aggregate first) →
  C4 Customers → C5 Money rename + Settings/Profile merge → C6 provider nine-module stamp; the Product Builder
  is its own post-PR-C lane gated on the bundle ratifications. Open taste calls: Messages (folded into Inbox
  by default) and AI Assistant (kept as a utility row by default).
  - **PR-Ca LANDED (#319, Jul 28, 2026):** Catalog completed (storefront header mirroring the /p/:handle
    read-gates; Edit/Pause/Duplicate wired; Share&Promote's creation half via shared `share-tools.tsx`;
    My Offerings + Share&Promote → Catalog redirects), the Channel Calendar (`GET /api/me/calendar`,
    read-only 62-day aggregate, §14 session-scoped; coordination dates OMITTED — the §7 never-written
    `dates` jsonb, §13), Customers (`GET /api/me/customers`, gross booked-value labeled NOT earnings),
    and the C1 honest first cut (Store Listings retired; every kept entry's unique functions enumerated
    in sidebar comments — the absorb-first/collapse-last discipline).
  - **PR-Cb LANDED (Jul 28, 2026): the expert sidebar reaches the NINE.** C5: Inbox (touched once)
    absorbed the Bookings uniques (history tab + stats, visa-status dialog, trip-plan snapshot — on the
    VERIFIED `GET /api/expert/bookings` shape, fixing the old page's never-rendered traveler names) and
    the Assigned Trips list+accept; its Messages tab is a real recent-threads queue over `GET /api/chats`
    (the /chat endpoint) deep-linking `/chat?clientId=`; the traveler-approval Suggest flow moved to its
    semantic home, the Workstation Distribute→Client card (assignment branch only). Retired:
    /expert/bookings → Inbox history, /expert/assigned-trips → Inbox assignments, Messages entry
    (/chat stays the thread home); /expert/clients(+/:id) → /expert/customers. C6: Performance hosts the
    intact ~1100-line Analytics page as an embedded lazy tab — host owns `?tab=`, the embedded 9-tab
    picker rides `?sub=` (param-collision seam); /expert/analytics, /expert/revenue-optimization,
    /expert/leaderboard redirect in. C7: DmoPickerCore (the Workstation Add-panel DMO drawer) gained
    review-and-refine (the exact `expert_dmo_edits` content/:id/edit → edits/:id/submit writes) AND the
    Factory-wire-B per-item Create-social-post prefill (no-function-loss carry); /expert/dmo-library →
    /expert/workspace; `sourced` stays expert-workspace-only. C8: Earnings renamed Money
    (/expert/money; inbound links + notification/email strings re-pointed; provider branch stays
    /provider/earnings until C9); Profile merged as Settings' FIRST tab (embedded seam, Verification
    stays the default; `?tab=` deep-linking added). Retired routes stay listed in role-routes-config
    (the gate exercises redirect + landing). Final sidebar: Today · Calendar · Inbox · Workstation |
    Catalog · Content Studio · Customers · Performance · Money | AI Assistant · Settings — the NINE
    modules + the two recorded-default extras. PR-Cc (C9 provider stamp) remains.
  - **PR-Cc LANDED (Jul 28, 2026): the provider console reaches the NINE (minus the separately-gated
    Workstation/Product Builder — deliberately absent, no placeholder).** Today = /provider/dashboard
    (label-only rename; the page already leads with today's bookings + action items). Calendar =
    /provider/calendar REPLACED with the Channel Calendar (expert C3 pattern on the role-aware
    `GET /api/me/calendar`; chips are the provider-real subset All/Bookings/Availability — the
    agent-request/store/delivery lanes are expert-only server-side, and a chip over a lane that can
    never populate would be a dead control). **The old page's "availability editor" was found to be a
    NON-PERSISTING local preview** ("coming soon", Save disabled — no backend write), so nothing real
    was lost; REAL slot editing moved to its ratified Catalog home: /provider/services absorbed the
    expert catalog's AvailabilitySection verbatim (the role-agnostic, ownership-gated
    `/api/me/services/:id/slots` CRUD) plus the storefront header (/p/:handle management, F2-gated
    Live chip) plus Share & Promote's creation half (per-service share-kit dialog + Posting
    Opportunities via the shared `share-tools.tsx`) — so **/provider/share-promote redirects to
    /provider/services and the SharePromote page is DELETED** (both consoles' Catalogs now compose
    the shared primitives; C2's "until C9" note resolved). Customers = new /provider/customers on the
    same `GET /api/me/customers` aggregate (bookings lane live; purchases/trips lanes structurally
    empty for providers, rendered data-driven, never faked). Performance hosts the intact Analytics
    page as an embedded lazy tab (?tab=analytics; no ?sub= seam needed — the provider analytics page
    has no internal tab picker); /provider/analytics redirects in. Money = /provider/earnings →
    /provider/money (page unchanged; re-pointed: stripe-connect-reminder provider branch + its test,
    the two admin.routes.ts notification links, the provider-approval email, admin/providers.tsx
    Earnings button, SetupChecklistCard payouts step). Profile merged as Settings' FIRST tab
    (embedded seam, settings-content stays default, ?tab=profile; /provider/profile redirects).
    **KEEPS (absorb-first discipline):** "Bookings" stays the honestly-labeled Inbox-module seat
    (accept/decline, visa-status dialog, stats — no provider Inbox page exists yet; relabeling
    without absorption would be a costume) and "Messages" stays, pointing straight at /chat (the
    provider console has no recent-threads tab; without the entry /chat is only reachable via
    per-booking buttons). /provider/resources stays routed but sidebar-unlisted (static guide copy,
    not one of the NINE, no honest home to retire it into). SetupChecklistCard availability/share
    steps re-pointed at each console's Catalog (the calendar is read-only on both consoles now).
    Final provider sidebar: Today · Calendar · Bookings · Messages | Catalog · Customers ·
    Performance · Money | Settings.
  - **Product Builder — the two gated calls RATIFIED (Jul 28, 2026, decision-maker):** ① bundle
    component linkage = **JOIN TABLE** (`bundle_components`, migration 151: `bundle_service_id`
    FK→`provider_services` ON DELETE CASCADE, `component_service_id` FK ON DELETE **RESTRICT** — a
    service inside a bundle can't be deleted until removed from it; UNIQUE pair + no-self CHECK;
    new table → no publish-push trap). A bundle IS a `provider_services` row
    (`product_shape='bundle'`, additive nullable column, NULL = single service) so the F2 queue,
    storefront read-gates, and checkout rails work unchanged — no new service table (FAQ
    prohibition holds). ② bundle money path = ONE booking row against the bundle's own
    `provider_services` row at its stored price (§14 server-derived; all components belong to the
    SAME provider → single earning, no split), with the component list **SNAPSHOT into
    bookingDetails at checkout** (contents + price locked at purchase — the ready-made snapshot
    posture); at booking time the server re-verifies every component is still
    `approved`+`active` (409 otherwise — F2: no unapproved service hides inside a sellable
    bundle). ③ build order = **BUNDLE FIRST** (property — per-night pricing, room availability —
    is a later phase with its own money brief). Bundle create is server-clamped born-`submitted`
    (D1a), requires ≥2 components, all owned by the session user and `approved`+`active`;
    price/component-set changes to an approved bundle re-enter review (the A3 material-change
    rule). Bundle create UI unlocks at 2+ approved services (the §17 creation ladder).
  - **Product Builder — PROPERTY rung RATIFIED (Jul 29, 2026, decision-maker; the "later phase with
    its own money brief" above, now briefed + locked, four calls):** ① **availability = per-night
    slots on the EXISTING `vendor_availability_slots` rail** — date-only slots (no times),
    `capacity` = units available that night, double-booking prevented by the proven §15 atomic
    `bookSlot` claim (migration 145's slot-aware checkout); a multi-night stay claims **all nights
    atomically, all-or-nothing** (any night full → 409, already-claimed nights released); the night
    range is SNAPSHOT into `bookingDetails` (the bundle/ready-made posture) and the first-night
    `slot_id` stamped on the booking. NO new availability table, no new overlap machinery.
    ② **nightly rate = the existing `price` column + additive nullable `pricing_unit` marker**
    (`'per_night'`; NULL = flat — every existing row untouched). Charge = nights × rate, **§14
    fully server-derived** from the stored row + requested dates; seasonal per-date overrides are a
    LATER phase riding the slot row's existing `pricing` jsonb (no new tables). ③ **multi-room
    inventory in the first cut** (decision-maker overrode the single-unit recommendation), via
    ④ **child service rows**: each room type IS a `provider_services` row
    (`product_shape='property_room'`) with an additive nullable **`parent_service_id` self-FK**
    (migration 153, `ON DELETE RESTRICT` — a property can't be deleted while rooms exist, the
    bundle-RESTRICT posture) to the property row (`product_shape='property'`). Rooms inherit
    night-slots through the existing `serviceId` slot rail and rates through `price`/`pricing_unit`
    — F2 approval, checkout, §15 claim, and earnings all work per-room with NO parallel plumbing;
    the property row is the storefront listing, rooms are its bookable children. NOT ratified /
    do not build without a new brief: deposits/partial capture (full charge at booking through the
    existing rail; cancellation = existing `cancellation_policy` free-text + migration-144
    `cancellation_policy_type` badge; escrow unchanged), seasonal rates, room-level photos beyond
    the existing images field.
  - **Workstation audit fixes (Jul 28, 2026, decision-maker-reported gaps ground-truthed then built):**
    ① day management — the Add panel's day-focus control already existed; added the "+ Day"
    affordance and a move-item-between-days action (existing item PATCH, no new endpoint).
    ② **Transport source pill — ADDED to the §17 Add-panel taxonomy** (decision-maker requested):
    a DMO-style drawer listing affiliate transport from the EXISTING catalog endpoints
    (`/api/catalog/ground-transport` etc.); **§16 holds** — the drawer never renders or stores an
    affiliate URL client-side (the itinerary item is informational; booking routes through the
    booking-agent rail), and it must NOT reuse `POST /api/transport-booking-options/:id/click`
    (that path returns a redirectUrl to the client). ③ per-item expert notes — migration 152 adds
    additive-nullable `itinerary_items.expert_note` (PlanCard already rendered it; the builder
    gains authoring; the item-PATCH allow-list gains the field). Trip-level notes already existed
    (PATCH /api/trips/:tripId/expert-notes). ④ the Platform-services pill's Google-Maps block is
    error-bounded (a Maps billing/key failure collapses to list-only results instead of blanking
    the whole workspace — the audit's only P1).

### §18 — Trip Card command center + TripPlan circulation object (ratified Jul 30, 2026)

**The Trip Card is the FINAL PRODUCT** (decision-maker directive): every platform flow converges on one
circulating plan object. Two ratifications:
- **Mobile command-center structure (mockup-ratified):** ① sticky day switcher (today highlighted); ② "Up Next"
  hero at top of screen (countdown, meeting point, expert note, primary action); ③ sticky bottom action bar
  (Map · Message expert · Share; "Message" → "Get help" when no accepted advisor); ④ Map/Transport/Budget/
  Change-history demoted to collapsed peers below the day list, plus a trip-level "Note from your expert"
  section; ⑤ **mode-aware primary action** — the next activity's inbound `transport_legs` mode decides the CTA:
  self-directed (walk/transit/bicycle/rental) → Navigate deep-linked with that mode; **booked** chauffeured
  (taxi/rideshare/private driver) → pickup card (point, time, ride details, call driver) from REAL booking data
  only; recommended-but-unbooked chauffeured → destination address + Book-via-agent CTA (**§16: never a raw
  Uber/affiliate link**); no leg → destination-only Navigate (honest fallback, §13 — never fabricate a mode or
  a booking). Expert notes (per-item `expert_note` migration 152 + trip-level) are REAL data restyled, not new.
- **TripPlan circulation object v1 (contract in `docs/EXECUTION_MAP.md` §3 — the governing doc):** ONE
  versioned interchange DTO (`shared/trip-plan.ts`) assembled server-side by ONE assembler (formalizing the
  `/api/trips/:tripId/plancard` assembly); every renderer/channel consumes TripPlan. **Circulate by REFERENCE**
  (tripId / share token), never by JSON copy; **snapshot only at money events** (ready-made purchase, bundle
  booking — the ratified snapshot posture). **Channel = redaction level applied by the assembler**: `full`
  (owner / delivered traveler / assigned expert / admin) · `teaser` (store; day+title, the §10
  `redactTemplateContent` posture) · `preview` (Direct/OG link cards; no itinerary body) · `social` (§17 story
  pack; real content only). Amendments to this contract are decision-maker calls. Model-tiered execution
  protocol + lane queue also live in `docs/EXECUTION_MAP.md` (Fable plans/reviews; Opus/Sonnet/Haiku execute).
- **Transport legs for expert-built trips — RATIFIED "BOTH" (Jul 30, 2026, decision-maker option 3):** the
  engine PROPOSES legs (reusing the existing variant leg-computation over the trip's itinerary coordinates,
  expert-triggered — never auto-published), the expert CONFIRMS/EDITS (mode, pickup point/time for chauffeured)
  in the Workstation, and **only confirmed legs reach traveler surfaces** (the D1a born-approved lesson applied
  to machine transport: a machine-guessed mode never renders on an expert-branded plan unconfirmed, §13).
  Mechanism: `transport_legs` gains trip scope — additive nullable `trip_id` FK (+ `variant_id` drops NOT NULL;
  app-level exactly-one-of, NO cross-column CHECK), additive nullable `pickup_point`/`pickup_time`, and
  `proposal_status` (`proposed|confirmed`, NULL = legacy variant legs grandfathered; if a CHECK is added it must
  allow NULL and be registered in the preflight `CONSTRAINT_MANIFEST`). Full spec: `docs/briefs/L4-transport-legs.md`.

The earning ledger is an escrow state machine: **`held → releasable → paid_out`**, plus **`reversed`**, with a
`dispute_state`. All phases are **landed on `main`** (Jul 14, 2026):
- **Phase 1 (#163, migration 112):** unified both `expert_earnings` + `provider_earnings` onto the one vocabulary
  (`earning_status` CHECK = `held|releasable|paid_out|reversed`) + `dispute_state`; releasability-preserving backfill.
- **Phase 2a (#167):** `releaseMaturedEarnings` job (`held → releasable` once the per-surface clearance window passes and
  no dispute is open) + `server/config/earnings-hold.config.ts` windows (env-overridable) + hourly scheduler.
- **Phase 2b (#169, migration 113):** retroactive `available_at` backfill for the Phase-1 `held`-NULL rows so they clear.
- **Phase 3 (#168):** traveler `POST /api/bookings/:id/confirm-completion` (early release) + `/dispute` (block, pulls
  `releasable → held+open`, enforcing "disputed ⟹ held") + admin `/api/admin/disputes/:id/reject`; owner-gated on
  `service_bookings.traveler_id`; disputes list reads `service_bookings`.
  - **Dispute-window enforcement (escrow decision 3, landed later).** `/dispute` now REJECTS a dispute raised after the
    clearance window closes (`now > completedAt + holdWindowDays('service_booking')`, default 7d, env-overridable → the
    same clock the release job uses) with `409 dispute_window_closed`. Previously the endpoint enforced no window — a
    traveler could dispute a `completed` booking indefinitely, which is precisely the situation decision 4's manual
    post-payout claw-back exists to cover. Enforcing the window aligns the dispute cutoff with the payout timing, so a
    refund can't be raised after payout → **decision 4's "no automated post-`paid_out` claw-back" limitation is
    now essentially unreachable by design, not a live hole.** `completedAt` null (not yet completed) → window not applied.
    Client (`my-bookings.tsx`) surfaces the window-closed message; the server is authoritative (no client-side window literal).
- **Phase 4 (#170) — reversal terminal.** `storage.reverseEarningsForBooking` (held/releasable → `reversed`; `paid_out`
  **never auto-clawed-back** — ratified "reversal only while in escrow"; returns `skippedPaidOut` for manual handling) +
  `reversePlatformRevenueForBooking` (compensating **negative** `platform_revenue` row — double-entry nets both the
  summary and the daily rollup; original flipped `status='reversed'` as the idempotency guard). Admin
  **`POST /api/admin/disputes/:bookingId/uphold`** reverses the ledger **then** refunds the traveler via
  `stripePaymentService.refundServiceBooking` (service-booking-native refund off the row's own payment intent;
  deterministic `idempotencyKey` + atomic status claim — §15). Ledger-first, Stripe-second, so a retry after a Stripe
  failure re-runs cleanly. This closes **§14 A2**'s earnings-reversal gap (also wired into the standalone `/refund`).
  **No migration** — `reversed` was already in the migration-112 CHECK; `platform_revenue`/`service_bookings` status have
  no CHECK. **Filed (not built):** automated **post-payout** clawback (deliberately manual); re-pointing the legacy
  `createRefund`/`/api/bookings/refund` off the `bookings` table onto `service_bookings`.

### Payout rail — model of record (decided Jul 14, 2026)

**Admin-initiated payout is the current payout model.** An admin creates a payout for a provider/expert via
`POST /api/admin/payouts` (amount **server-derived** from the recipient's available earnings, capped, $10 min) and
processes it via `PATCH /api/admin/payouts/:id` (idempotency-safe Stripe transfer — §15 FIX 1). This path is live,
mounted, and money-safe. The payout **storage layer** (`create{Provider,Expert}Payout`, `get{Provider,Expert}Payouts`,
`claim…ForProcessing`, `getAll…Payouts`) stays — it backs the admin path + revenue-tracking.

**Provider/expert SELF-SERVICE payout requests are RETIRED, not deferred-in-place.** The self-service surface was
inert dead code — dark `POST /api/{provider,expert}/payouts/request` + `GET /api/{provider,expert}/payouts` (unmounted
`experts.routes.ts`, **zero callers** — the buttons never even POSTed), an **unrouted** `provider/payouts.tsx`, and
~4 **decorative** "Request Payout" buttons (no `onClick`) on live dashboards/earnings pages. All removed
(proven-dead-then-remove, folded into the List-A dead-code lane). **Rationale (the important part):** payout is the
*release* half of an **escrow/hold/release spine that has not been designed yet** (today's model credits earnings
early, no hold). Building a self-service "Request Payout" flow now would build the release-request UI against a payout
architecture that's about to change underneath it — the "reinvent the same logic separately" trap. So self-service
payout requests are **deferred to the escrow-spine design**, where release (and any request UI it needs) gets built
once, correctly. This is *not* "cut a feature" — it's declining to build the release UI before release is designed.
Leaving admin-initiated as the honest model keeps the payout rail from constraining that future escrow decision.
**Self-service payout REQUESTS — LANDED (now that the escrow spine defines a real cleared balance).** The deferral
condition ("payout is the release half of an escrow spine not yet designed") is resolved — the spine is built (#163–170)
and the dispute window is enforced (#210), so an earner's `available` = their `releasable` earnings is now a real,
well-defined number. `POST /api/payouts/request` (mounted in `payments.routes.ts`, role-aware provider/expert) lets an
earner REQUEST a payout of their own cleared balance: **§14** acting user + amount are **server-derived**
(`get{Provider,Expert}EarningsSummary(session).available`, never `req.body` — the documented "server-capped withdrawal
of the user's own balance" money-derive-ok case); **§15** a `pending`/`processing` payout blocks a duplicate request
($10 min, mirrors the admin path). It creates a `pending` payout via the existing `create{Provider,Expert}Payout` →
lands in the **admin queue**, processed by the unchanged idempotent transfer (`PATCH /api/admin/payouts/:id`, §15 FIX 1).
**The processing model of record stays admin-initiated** — this only adds the request half; no new payout mechanics, no
Stripe change. Client: a real "Request Payout" button on `provider/earnings.tsx` + `expert/earnings.tsx` (the retired
decorative buttons' honest replacement).

*(Orphaned-component observation, filed separately — not payout-scoped: `client/src/components/shared/earnings-card.tsx`
has no importers; its "Request Payout →" span never renders. A dead-code-lane candidate, left untouched here.)*

---

## Service Model: Canonical Table

### Decision: `provider_services` is the canonical service source (NOT `expert_service_offerings`)

**Why:**
- `service_bookings.serviceId` and `service_reviews.serviceId` both FK to `provider_services.id`
- This creates an immutable structural dependency: transactions *must* reference provider_services
- Making a different table canonical (e.g., ESO) would fragment the booking/review/payment path
- The data itself has already converged: wizard writes to provider_services, bookings FK there

**What This Means:**
- All **service** creation (expert custom, provider, and the `service_templates` seed catalog) writes to `provider_services`.
  **Do not conflate with expert *itinerary* templates:** those are a separate product living in the `expert_templates` table (marketplace), **not** `provider_services` — see Known Decisions & Divergences §10.
- The approval workflow (draft → submitted → approved) is stored as `approval_status` on `provider_services`, not elsewhere.
  **F2-CLOSED (migration 111):** offerings are now born `submitted` — `provider_services.approval_status` defaults `"submitted"`
  at both the ORM (`shared/schema.ts:578`) and the DB column; existing rows grandfathered `approved` (no backfill). See §1 (D1a).
- `expert_service_offerings` (ESO) remains a read-only template/offerings catalog for the signup flow
- ESO is NOT a transaction source; it's a convenience catalog for onboarding

**Transport-commerce exception (`service_bookings.service_id` is nullable):**
- The `serviceId → provider_services` FK and the dependency above **still hold for provider-service bookings/reviews.**
- The one documented exception: **transport-commerce bookings** (`bookingDetails.bookingType = "transport"`) reference a `transport_booking_options` row, not a `provider_services` row, so they carry a NULL `service_id`.
- `service_id` was made nullable by migration `050_service_bookings_service_id_nullable.sql` (the strand fix in PR #46 inserts these rows; the change previously lived only in `shared/schema.ts` + a hand-run dev ALTER with no migration, so prod still rejected the insert).
- Recorded here per the Coordination Prevention rule; ratified by the decision-maker by merging the PR that carries this note + migration 050. Any **further** loosening of this FK requires explicit decision-maker approval.

**Consolidation Timeline:**
- **Phase 1+2 (DONE):** Migrations 011-012 add schema columns and consolidate `expert_custom_services` → `provider_services` with category mapping
- **Phase 3 (DONE):** Build shared ServiceForm component targeting provider_services (role-aware, both expert and provider)
- **Phase 4 (DONE):** Apply User Console theme to expert pages (#1A1A18, #7A7A72, #E8E8E2, #FAFAF8)
- **Phase 5 (DONE):** Migration 013 drops deprecated tables/columns: expert_custom_services, expert_selected_services, ESO workflow columns. **NOTE (corrected Jul 15, 2026):** `expert_service_categories` was **intentionally NOT dropped** by 013 and is **restored/seeded by migration 030** as the read-only ESO onboarding catalog — do not list it among the dropped tables.

**What Was Deprecated:**
- Commit `bfc3db2` made ESO canonical by adding workflow columns. This contradicted the booking-FK fact and is superseded by this document.
- The `runEsoBackfill()` startup migration is disabled; migrations 011-012 handle schema + data consolidation to provider_services.
- Deprecated tables (expert_custom_services, expert_selected_services) and ESO workflow columns are dropped by migration 013. (`expert_service_categories` is **NOT** dropped — retained by 013, restored/seeded by migration 030 as the ESO onboarding catalog; corrected Jul 15, 2026.)

---

## Service Creation Consolidation

All service creation routes converge on one destination: `POST /api/provider/services` writes to `provider_services`.

- Experts creating custom services use the same route/schema as providers
- Role-based filtering happens at read time. **F2-CLOSED (migration 111):** the read-side approval gate is now implemented on
  all **public** `provider_services` surfaces (they filter `approval_status = 'approved'`). `GET /api/expert/services`
  (`server/routes.ts` → `storage.getProviderServicesByStatus`) is the **owner console** and stays **intentionally ungated**
  — it filters by `userId` + the active/paused `status` param so an owner sees their own `submitted`/unapproved listings.
  Admin reads (the review queue) are likewise ungated. Only public/non-owner reads gate on `approved`. See §1 (D1a).
- No separate tables; no separate approval workflows

---

## Category Mapping (historical — one-time consolidation, completed)

> **Status note (Jul 2026; corrected Jul 15, 2026):** this describes the one-time migration 011–012 consolidation.
> Its source table `expert_service_categories` was **NOT dropped** — migration 013 explicitly retains it
> (`-- 4. expert_service_categories: intentionally NOT dropped here.`) and migration 030 recreates/seeds it (7 rows +
> FK) as the read-only ESO onboarding catalog. (Earlier drafts said "dropped by 013"; that was factually wrong — there
> is no code-internal drift, the table is live.) The one real defect — `storage.getExpertServiceCategories()`
> returning `[]` on that false premise — is **fixed**; it now queries the live table.

When migrating services from expert taxonomy (`expert_service_categories`) to canonical (`service_categories`):

1. Attempt deterministic name-match: `LOWER(TRIM(expert_cat.name)) = LOWER(TRIM(service_cat.name))`
2. If no match found, leave `categoryId` NULL (fallback acceptable, but ideally avoid)
3. This is critical: without category mapping, migrated services become invisible to:
   - Category-filtered browse (feed filters by categoryId)
   - Gem feed matching
   - Marketplace recommendations

If you see `categoryId IS NULL` rows on provider_services, it's likely a category mapping miss — investigate the source expert_service_categories row.

---

## Coordination Prevention

**If you are making changes that affect:**
- Service creation routes (`POST /api/provider/services`) — note the `expert_custom_services` **table** is **dropped**
  (migration 013); do not re-add it. The former `/api/expert/custom-services` and `/api/admin/custom-services` **routes**
  operated on `provider_services` (via the mapper) and were **renamed** to `/api/expert/service-listings` and
  `/api/admin/provider-services` (the misnomer fix, Jul 14 2026) — the `custom-services` vocabulary is retired in code
- Service schema (`provider_services`; `expert_service_offerings` = read-only catalog; `expert_templates` = marketplace)
- The two offering catalogs (`expert_offering_types` / `service_offering_types`) — never merge them (see §4)
- Approval workflows (status enums, submission logic)
- Fee/commission config (`fee_bands`) — no rate literals in code (see §8)
- Service category taxonomy
- **Database migrations** (schema or data)

**Then:**
1. Update this document FIRST with the decision and rationale
2. Reference this document in your commit message
3. If you find this document conflicts with your plan, escalate to the decision-maker (user) rather than overriding

**CRITICAL: Migration Directory**
- All SQL migrations must go in `server/migrations/` (NOT `migrations/`)
- Register each migration in `server/migrations/migration-files.ts` — the **canonical registry** for both runtime and the
  chain-integrity test. `run-migrations.ts` imports this list rather than carrying its own copy (see the migration-chain
  repair note below). Registry order is authoritative; numeric filename order is not.
- Migrations are applied at server startup via `runMigrations()` (server/index.ts)
- `/migrations/` is for Drizzle-only migrations; `server/migrations/` is the active set

**CRITICAL: Replit deploy-push vs. our migrations (the "publish-time CHECK failure" trap)**
- Replit's Autoscale deploy runs an **automatic drizzle-kit schema-push** from `shared/schema.ts` at publish —
  and it enforces the schema's CHECK constraints **WITHOUT** running our migrations' value-remap steps first.
  So a migration that adds a CHECK over a column still holding legacy values on prod fails the deploy mid-push
  (`check constraint … violated by some row`) and offers the **DESTRUCTIVE** "copy dev database over production"
  option. **Never accept that option** — it overwrites prod with dev. This bit us twice on the Jul 15 publish
  (`expert_earnings.status='pending'`, `service_templates.delivery_method='document'`).
- **SECOND VARIANT OF THE SAME TRAP — the deploy push also DROPS INDEXES that `shared/schema.ts` does not
  declare (found Jul 30, 2026; proven in isolation: a single `DROP INDEX "sb_idempotency_key_idx"` statement).**
  This makes an index-only migration **non-durable across publishes**: publish 1 → push drops it → the migration
  runs for the first time → recreated; **publish 2+ → push drops it → the migration is already stamped → it is
  NEVER recreated → the index is silently gone.** Live instance: migration 155's UNIQUE partial index on
  `service_bookings.idempotency_key`, deliberately left out of `schema.ts` to avoid a duplicate-key push failure —
  which is measurably **load-bearing** (without it, 3 concurrent same-key checkouts produced **3 real Stripe
  charges**; with it, 1). **Rule: an index the code depends on must be DECLARED in `shared/schema.ts`, not only
  created in a migration** — otherwise the deploy push is authoritative and will remove it. Before declaring a
  UNIQUE index, check prod for existing duplicates (`SELECT <col>, count(*) … GROUP BY 1 HAVING count(*) > 1`),
  since a violated UNIQUE fails the publish and offers the destructive "copy dev over production" option.
  **THE SAME MECHANISM APPLIES TO TABLES, not just indexes (found Jul 30, 2026 by the table-existence sweep).**
  A table created by a registered migration but **absent from `shared/schema.ts`** is the same shape of object the
  push targets. Live instance: **`ai_cost_tracking`** (created by `025b_ai_cost_tracking.sql`, missing from
  `schema.ts`) is written from ~7 call sites (`claude.service.ts`, `itinerary-optimizer.ts`, chat routes,
  content/experts/trips routers, `routes.ts`) and read by `lead-routing.service.ts` for the admin cost breakdown.
  If a publish drops it, the migration is already stamped so `runMigrations()` will **never recreate it** — silent,
  permanent loss of AI-cost observability. (`service_demand_requests` was dead and has since been RETIRED deliberately by migration 158 — dropped in both environments.) **Rule
  generalized: any DB object the code depends on — index OR table — must be declared in `shared/schema.ts`, or the
  deploy push is authoritative and will remove it.**
- Guard: **before publishing any migration that adds/changes a CHECK**, run
  `node scripts/preflight-prod-constraints.cjs "<PROD_DATABASE_URL>"` — it reports every row that will violate a
  declared CHECK and prints the remap to apply on prod first (see `docs/RELEASE.md`). When you add a new CHECK
  migration, add its column to that script's `CONSTRAINT_MANIFEST`. The real fix (disable the deploy-push so
  `runMigrations()` is authoritative) is a Replit deployment setting, filed.

**CRITICAL: Drizzle push has TWO schema entry points — do not collapse to one**
- `drizzle.config.ts` `schema` is an **array**: `["./shared/schema.ts", "./shared/guest-invites-schema.ts"]`.
  Both are required. `shared/schema.ts` does **not** re-export `guest-invites-schema.ts` (that file imports *from*
  `schema.ts`, so a re-export would be circular), so its 4 tables — `event_invites`, `guest_travel_plans`,
  `invite_templates`, `invite_send_log` — are only reachable by push through the explicit second array entry.
- **Do not "simplify" this back to a single `schema: "./shared/schema.ts"`.** Those 4 tables would silently vanish from
  `drizzle-kit push`; because migration `001_guest_invite_system.sql` is bootstrap-stamped (001–050) it never re-creates
  them, so a fresh push-canonical deploy would be missing them and `server/storage.ts` guest-invite code would throw
  `relation "event_invites" does not exist`. If you add a **new** schema file with its own `pgTable`s that `schema.ts`
  doesn't re-export, add it to this array too.

**CRITICAL: Lockfile purity (do not remove these guards)**
- `npm install` inside the Replit workspace resolves through Replit's package-firewall proxy and bakes
  unreachable `package-firewall.replit.local` URLs into `package-lock.json` — that breaks `npm ci` on every
  GitHub runner (this kept main red ~Jul 7–11). The main recurrence engine is `.replit [postMerge]` →
  `scripts/post-merge.sh` → `npm install` after every merge.
- Guards, in order: `scripts/post-merge.sh` scrubs right after its install; the pre-commit hook
  (`.githooks/pre-commit`, installed by the `prepare` script) scrubs staged lockfiles from manual installs;
  the CI `lockfile-purity` gate is the backstop. All use `scripts/scrub-lockfile.cjs` (URL-only rewrite).
- The project `.npmrc` (`registry=https://registry.npmjs.org/`) may prevent pollution from forming, but its
  precedence against Replit's proxy is UNVERIFIED (env-level `NPM_CONFIG_*` would override it). To verify
  from inside a Replit workspace: `npm install && grep -c "replit.local" package-lock.json` — 0 = it works.
- Do not remove the `.npmrc`, the hooks, or the CI gate; do not run bare `npm install` and commit without
  the scrub.

**Migration 059 (Jun 10, 2026; registered in the canonical `migration-files.ts` list):** index-only — `idx_pnc_neighborhood_category` on
`provider_neighborhood_coverage(neighborhood_id, category_key)`. The upsell engine's
candidate gather (Engine Inventory-Sourcing brief) reads coverage by
`(neighborhood_id, category_key)`; the existing unique constraint leads with
`provider_id` and cannot serve that path. No schema/data semantics change.

**Migration 060 (Jun 10, 2026; registered in `migration-files.ts`) — Paid Booking Concierge, Phase 3.1:**
seeds ONE flat fee-AMOUNT band `expert_concierge_booking` in `fee_bands` (`rate_type='flat'`,
`default_rate=9.99` PLACEHOLDER, admin-configurable), idempotent `ON CONFLICT (band_key) DO NOTHING`.
The resolver routes the `booking_concierge` concern to this band via `decideBandKey` (named mapping,
no fallthrough), and `resolveCommissionRates` now guards on `rate_type` so a FLAT band is never built
into a split. The band is the fee AMOUNT only; the 75/25 split rides `expert_standard` (Phase 3.4).
Rate-neutral for every existing category (nothing routes to it yet). Ratified by the Phase 3.1 GO.

**Migration 061 (Jun 11, 2026; registered in `migration-files.ts`) — Paid Booking Concierge, Phase 3.2:**
seeds ONE coordination-tier `expert_offering_types` row `booking_concierge` ("I'll book this off-site
item and add it to your trip"), idempotent `ON CONFLICT (offering_type_key) DO NOTHING`, mirroring the
039 seed. Distinct from `done_for_you_booking` (broader "book everything"): this is per-item off-site
facilitation. Experts opt in by creating an APPROVED `provider_services` row referencing it via
`expert_offering_type_id` (migration 057); market scoping rides `expert_neighborhoods` (no new column).
Catalog vocabulary only — no eligibility/fee wiring yet (3.3/3.4). Ratified by the Phase 3.2 GO (CREATE).

**Migration 109 (Jul 11, 2026; registered in `migration-files.ts`) — Structural Consolidation, Phase 1d (D3a row remap + CHECK):**
remaps `delivery_method` on BOTH `provider_services` and `service_templates`: `video-call→video` (NOT
`call` — video session vs voice call is a real distinction), `in-person→in_person`, `document→pdf`
(flatten — zero prod provider_services rows; the only real rows were the two CANONICAL_TEMPLATES seed
rows; `document` is NOT in the enum), and `digital→pdf` (flatten — zero prod rows; surfaced by the
refusal guard firing on one dev row in the Replit workspace DB, exactly the guard's purpose; also NOT
in the enum). Adds the DB CHECK atomically with the remap on both tables: valid
set = the D3a canonical `deliveryMethodEnum` (`pdf, video, call, in_person, voice_notes, async_messaging,
hybrid`; NULL allowed). `hybrid` stays valid because ServiceForm offers it as a live delivery option —
a CHECK without it would break every hybrid create. Guarded: REFUSES listing any unmapped value rather than
half-applying. Companion change in the same commit: `CANONICAL_TEMPLATES` seeder literals (server/routes.ts)
`document`→`pdf` so fresh environments seed CHECK-clean. Prod distribution at approval: pdf 67 /
in_person 35 / call 2 / async_messaging 1, no NULLs. Ratified by the decision-maker's remap-table approval
+ amended-CHECK confirm (Jul 11).

**Migrations 107–108 (Jul 11, 2026; registered in `migration-files.ts`) — Structural Consolidation, Phase 1 (decisions D3a/D4/D5a):**
107 adds nullable `offering_type_key` to `local_expert_forms` (FK → `expert_offering_types.offering_type_key`)
and `service_provider_forms` (FK → `service_offering_types.offering_type_key`), both `ON DELETE SET NULL` —
the canonical /earn selection the signup forms previously dropped (only the display name survived). Two
parallel catalogs, two FKs; experts remain NOT `service_categories` rows. 107 also repairs the missing
unique constraint on `service_offering_types.offering_type_key` (declared in schema.ts, absent from shipped
DDL), guarded to REFUSE on pre-existing duplicate keys rather than half-apply. 108 adds nullable
`has_insurance` boolean to `service_provider_forms` (applicant self-attestation, previously collected and
dropped; NULL = pre-108 "never asked"); table chosen because signup writes it and the FEE-2 brief homes the
admin-validated `insurance_tier` evidence there. D3a: `deliveryMethodEnum` (shared/schema.ts) is extended
with `hybrid` — canonical set is now `pdf, video, call, in_person, voice_notes, async_messaging, hybrid`;
the column is varchar with no DB CHECK, so this is TS-level; NO row remap has run — that requires the
Phase-1d approved remap table. Ratified by the Phase 1+ execution dispatch (D1a·D2a·D3a·D4·D5a locked).
**[SUPERSEDED by migration 109 (above):** the DB CHECK and the row remap are now applied on **both**
`provider_services` and `service_templates`; `deliveryMethodEnum` (`shared/schema.ts:523`) and the DB CHECK
both carry the same 7 canonical values. The "no DB CHECK / no remap" state described here was true only as of 108.**]**

**Migrations 159–160 (Jul 31, 2026; registered in `migration-files.ts`) — Trip-Canon Lane 1 (Reconcile) Phases 1a/1b, decision-maker ratified via PR #344:**
159 adds `itinerary_items.routing_status` (varchar 20, NOT NULL, DEFAULT `'in_planning'` by explicit ALTER;
**deliberately NO DB CHECK** — canonical set `ROUTING_STATUSES` = `in_planning|with_expert|ready_for_checkout|purchased`
lives in `shared/schema.ts`, the pre-109 posture, so no publish-push remap trap) and `itinerary_items.booking_id`
(nullable FK → `service_bookings`, **ON DELETE SET NULL** — a plan item survives its booking) + its index. 160 adds
`cart_items.itinerary_item_id` (nullable FK → `itinerary_items`, **ON DELETE CASCADE** — a projection row has no
independent existence; an orphan would be uncleanable yet chargeable) + its index. All columns AND indexes declared
in `shared/schema.ts` per the deploy-push durability rule. Existing rows take defaults only — NO inferred `purchased`
history (§13). Companion code (same PR): `POST /api/trips/:tripId/items/:itemId/route` (the four traveler/expert
routing edges; `purchased` refused — checkout-only per `docs/briefs/ROUTING_STATE_CONTRACT.md` §2; atomic conditional
flips; owner via `verifyTripOwnership`+collaborator row, expert-return via canonical `isTripAdvisor`, NEVER
`getTripRole`) and `server/services/cart-projection.service.ts` — **the SINGLE writer of `cart_items`** (every write
site funnelled through it, proven behavior-identical incl. a byte-identical optimizer read; `ready_for_checkout`
items materialize as cart rows keyed by `itinerary_item_id`, NULL-keyed rows never touched by sync). **Rule going
forward: never write `cart_items` outside the projection module**, and the routing-state contract's WRITES/READS/NEVER
matrix governs every new consumer — undeclared = NEVER, new writers amend the contract first. Phases 1c/1d
(leak fixes W3–W6, Trip Card routing UI) follow per `docs/briefs/RECONCILE_PHASE1_SCOPE.md`.

**Migration 123 (Jul 21, 2026; registered in `migration-files.ts`) — Traveler service-requests capture:**
new table `service_requests` (the "request a service that doesn't exist yet" surface). **Distinct from a
*service* table** (FAQ prohibition is on new `provider_services`-like tables) — this is a demand-capture
queue: a traveler describes what they want in a city, it lands in the admin triage queue. Columns: `traveler_id`
(FK → `users`, `ON DELETE SET NULL`, **set server-side from the session, §14 — never from body**), `city`,
`country`, `service_type` (free-text hint), `description`, `budget`, `status` (`open|fulfilled|closed`, DB CHECK),
`admin_notes`. **New table → the status CHECK is created with the table (no legacy rows to violate) → no
publish-time drizzle-push remap trap.** Endpoints in a **mounted** router (`server/routes/service-requests.routes.ts`,
`app.use` in `routes.ts` — unmounted-router guard §9): `POST /api/service-requests` + `GET …/mine` (session-scoped),
`GET/PATCH /api/admin/service-requests` (inherit the blanket `adminApiGuard` §2). Client: a "Request a service"
dialog on the discover-location empty/footer state + an admin triage page (`/admin/service-requests`, sidebar
"Service Requests"). No money path. **Filed:** notify-the-traveler when their request is marked fulfilled (ties to
the email cluster); feed accepted requests into the supply-gap recommender.

**Migration 129 (Jul 24, 2026; registered in `migration-files.ts`) — Content location normalization, Lane A Phase 1:**
adds four **ADDITIVE NULLABLE** columns to `provider_services` — `latitude`/`longitude` `DECIMAL(10,7)`, `city`
`VARCHAR`, `location_precision` `VARCHAR` (intended values `'neighborhood_centroid' | 'exact'`). **No DB CHECK, no
NOT NULL, no DEFAULT** → no publish-time drizzle-push CHECK-failure trap (matches the migration-124/125 additive
posture); the columns are also added to the `providerServices` pgTable in `shared/schema.ts` (nullable, matching).
**Backfill NEVER FABRICATES:** for rows whose `neighborhood` resolves against `city_neighborhoods` (all 109 rows have
`centroid_lat`/`centroid_lng` NOT NULL — a real coordinate source), it sets `latitude`/`longitude` = that
neighborhood's centroid, `location_precision = 'neighborhood_centroid'`, and `city` = the neighborhood's city; rows
without a resolvable neighborhood keep **all four columns NULL** (NULL is the honest state — the `location='Unknown'`
lesson; **no city-center fallback, no `'Unknown'`**). **Match key = slug, not name (deviation from the brief, recorded):**
`provider_services.neighborhood` stores a **slug** (documented "soft reference into `city_neighborhoods.slug`"), and
`city_neighborhoods.slug` is globally unique (0 duplicate slugs), so a slug match is unambiguous and hits **30/30**
neighborhood-bearing rows, vs a bare name (`LOWER(TRIM)`) match's 22/30 — matching by name would have silently dropped
8 valid rows (e.g. slug `kyoto-station` vs name "Kyoto Station Area"). The UPDATE matches slug-first then falls back to
name (the 011/012 `LOWER(TRIM)` pattern), `DISTINCT ON (id)` picking one neighborhood per row; guarded (`WHERE latitude
IS NULL`) so re-runs are a no-op. **Additive, not repurposed:** the coverage/upsell engine does NOT read these columns
for pricing/matching (Phase 0 finding — zero money/recommendation blast radius), and the ~14 free-text `ilike` location
readers are **left untouched** (migrating readers is a later lane). Verified post-apply via `information_schema` (all 4
present + nullable) and spot-checked (30 backfilled with 0 centroid mismatches, 9 NULL = the 9 rows with empty
neighborhood). Ratified by the decision-maker (Lane A Phase 1). **Filed (later lanes):** migrate the free-text location
readers onto these columns; add an `'exact'`-precision write path (geocoded addresses); optional CHECK on
`location_precision` once the write paths are locked.

**Migration 162 (Aug 1, 2026; registered in `migration-files.ts`) — provider_services coords re-backfill (post-129 rows):**
**DATA-ONLY**, no schema change (the four migration-129 columns already exist and are already declared nullable in
`shared/schema.ts` — verified, not touched). QA found every seeded `provider_services` row still NULL-coordinate
despite carrying a resolvable `neighborhood`: migration 129's centroid backfill ran **once**, at the time it applied,
so rows **inserted after 129** (the `phase-d-kyoto-vendors.seed.ts` / `phase-4-kyoto-fill.seed.ts` /
`popular-cities-content.seed.ts` seeders, which set `neighborhood` but never wrote coordinates) were never touched and
stayed born-NULL — so an expert dropping one of these onto a build via the Platform-services pill got no map pin.
162 **re-runs migration 129's exact backfill UPDATE verbatim** (slug-first, then `LOWER(TRIM(name))` fallback match
against `city_neighborhoods`, `DISTINCT ON` one neighborhood per row, guarded `WHERE latitude IS NULL`) against the
table's CURRENT contents, catching everything 129 missed. **Same NEVER-FABRICATES rule:** a row whose `neighborhood`
doesn't resolve to any `city_neighborhoods` row keeps all four columns NULL — no city-center fallback, no `'Unknown'`.
Idempotent (a re-run after a clean pass is a no-op — proven: `UPDATE 0`). No CHECK constraint anywhere in this
migration → nothing for the preflight `CONSTRAINT_MANIFEST`, no publish-time drizzle-push trap (a pure data UPDATE).
**Companion code (same change, not a migration):** the three provider_services seeders that set `neighborhood` now
resolve the same centroid **at INSERT time** via a shared helper (`server/seeds/lib/neighborhood-centroid.ts`, the
129/162 slug-first-then-name match factored out), so newly seeded rows are born with coordinates instead of relying
on a future re-backfill migration to catch them. Proven behaviorally against a local throwaway Postgres: synthetic
pre-fix rows (neighborhood set, coords NULL) → 162 fills every resolvable one with the correct centroid and leaves
unresolvable/neighborhood-less rows NULL → re-run is a no-op; the three seeders, run fresh with the fix, insert every
row already fully coordinated (162 finds nothing left to do against seeder output).

**Migration 136 (Jul 26, 2026; registered in `migration-files.ts`) — users.handle (backoffice Phase 1a):**
adds **additive nullable** `users.handle` VARCHAR(30) + UNIQUE constraint (no CHECK, no DEFAULT → no publish-time
drizzle-push trap; PG UNIQUE permits multiple NULLs so existing rows are untouched). Format + reserved-word rules are
**app-layer** (`server/routes/storefront.routes.ts`), deliberately NOT a DB CHECK. The idempotency guard catches
`duplicate_object OR duplicate_table` (a UNIQUE's backing index raises the latter on re-run — proven behaviorally).
Companion (same commit): mounted `storefront.routes.ts` (§9) — `PATCH /api/me/handle` (§14 session-only, earner
roles, reserved list, 409 on collision), public `GET /api/storefront/:handle` (approved-only offerings across the
three lanes — F2/§10/Ready-Made read-gates; 404 when zero approved items, so an unvetted earner has no public page),
and `GET /p/:handle` server-side OG injection (the `trips.routes.ts` `/itinerary-view/:token` route-interception
pattern). Client: `/p/:handle` storefront page, HandleClaimCard in expert+provider Settings, and the cross-lane
My Offerings table (pure client aggregation — no new backend). Mockup source of truth: `docs/backoffice/mockups/`
+ `docs/backoffice/MOCKUP_CODE_AUDIT.md`. **Filed (V.1, before marketing pushes):** additionally gate /p/ visibility
on identity/KYB verification once Phase 0.5 sequencing lands.

**Migration 130 (Jul 24, 2026; registered in `migration-files.ts`) — TripContext server persistence (P2/E2):**
new table `trip_contexts` (`user_id` varchar PK, FK → `users` `ON DELETE CASCADE`; `context` jsonb NOT NULL
DEFAULT `'{}'`; `updated_at`). **Additive new table, no CHECK** → no publish-time drizzle-push trap. Purpose:
the client-side TripContext (sessionStorage `experienceContext`, formalized by the P1 module PR #298) dies with
the browser session and never crosses devices — for signed-in users the context is now mirrored server-side so
planning survives restarts (the precedence rule's server tier below the `trips` row). Endpoints in a **mounted**
router (`server/routes/trip-context.routes.ts`, `app.use` in routes.ts — §9): `GET /api/trip-context` +
`PUT /api/trip-context`, both `isAuthenticated`, **self-scoped to the session user (§14 — user id never from
body)**; PUT is a **zod allow-list** of the TripContext fields with length caps (never raw `req.body` into the
jsonb), upsert `ON CONFLICT (user_id)`. Client (`client/src/lib/trip-context.ts`): `useTripContextSync()`
hydrates once per load (server → local **only when local is empty** — an active local session always wins) and
every `updateTripContext` debounce-pushes (fire-and-forget; 401 for guests silently ignored). No money path.
Part of the ratified Trip-Strip program (docs/ROADMAP.md, P2 row).
**Re-keyed by migration 161 (below) — Trip-Canon Lane 6.**

**Migration 161 (Jul 31, 2026; registered in `migration-files.ts`) — trip_contexts re-key (Trip-Canon Lane 6):**
closes the master-brief gap-registry row "`trip_contexts` keyed by userId, not tripId — re-key after L1 lands"
(`docs/planning/TRIP_CANON_MASTER_BRIEF.md` §3). Once Lane 1 made the Trip the canonical planning container, a
user planning two trips at once had their context smeared across both — migration 130's `user_id`-only PK could
hold exactly one row per user, full stop. **Shape decided by ground-truthing the real constraint, not the
mechanical "just add trip_id" option:** a `user_id`-only PRIMARY KEY cannot coexist with a second row for the
same user, so a nullable `trip_id` column alone cannot produce per-(user,trip) rows — the real re-key is a PK
swap. Executed as ONE migration: `trip_contexts` gains a surrogate `id` PRIMARY KEY (varchar,
`DEFAULT gen_random_uuid()::varchar` — DB-side, matching migration 151's `bundle_components` pattern, because
this table is written via raw `db.execute(sql\`…\`)`, not the Drizzle query builder) and a nullable `trip_id`
FK → `trips` `ON DELETE CASCADE` (mirrors the existing `user_id` CASCADE — a context row has no life
independent of the trip it's scoped to, same as it has none independent of the user). The "one row per scope"
invariant that the old PK used to give for free now lives in **two partial unique indexes** —
`trip_contexts_user_legacy_uidx (user_id) WHERE trip_id IS NULL` (at most one legacy/no-active-trip row per
user, migration 130's original invariant preserved) and `trip_contexts_user_trip_uidx (user_id, trip_id)
WHERE trip_id IS NOT NULL` (at most one row per user+trip) — a bare `UNIQUE(user_id, trip_id)` would NOT do
this, since Postgres treats NULL as distinct from NULL in a unique index and would let a user accumulate
unlimited `trip_id`-NULL rows. **Existing rows survive verbatim**: they simply gain a fresh surrogate `id`
(backfilled before the `NOT NULL` + PK swap) and `trip_id` stays NULL — exactly their pre-migration meaning
(proven behaviorally: pre/post row diff is `user_id`/`context`/`updated_at` byte-identical, `trip_id` NULL).
No CHECK constraint anywhere in this migration → nothing for the preflight `CONSTRAINT_MANIFEST`, no
publish-time push trap; `id`/`trip_id`/both partial unique indexes/the `trip_id` btree index are all declared
in `shared/schema.ts` in the same commit (deploy-push durability rule).
Companion code (`server/routes/trip-context.routes.ts`): `GET`/`PUT /api/trip-context` gain an optional
`?tripId=` query param. Present → **ownership-checked** (`verifyTripOwnership` from `server/utils/trip-ownership.ts`
— §14, the trip must exist AND belong to the session user; 404 if it doesn't exist, 403 if it isn't theirs) and
reads/writes the trip-scoped row (two INSERT branches, not one dynamic `ON CONFLICT` target, because Postgres
requires the conflict target to exactly match an existing partial unique index including its predicate).
Absent → the exact pre-Lane-6 behavior, byte-for-byte: the legacy per-user row, no client change required.
Client (`client/src/lib/trip-context.ts`): once the LOCAL context already carries a `tripId` (the trip-strip's
"Server-truth mode" signal, set once a trip actually exists), `schedulePush`/`hydrateTripContextFromServer`
append `?tripId=` so a second trip started elsewhere can't clobber the first trip's saved context; no local
`tripId` yet → falls back to the legacy per-user row exactly as before. Hydrate precedence is otherwise
unchanged (local wins when non-empty). No money path (unchanged from migration 130).

**Migration 116 (Jul 15, 2026; registered in `migration-files.ts`) — Feed measurement: content_impressions completion:**
analytics-only, no money semantics, fire-and-forget writes. The `content_impressions` table was created by
migration 082 but **never had a writer** — the client feed's impression tracker
(`client/src/hooks/use-impression-tracker.ts`) POSTed to `/api/tracking/impression`, an endpoint that did not exist,
so every card's `sourceImpressionId` was null (impression→click attribution severed). Companion code adds the
endpoint (`content.routes.ts`, public — the feed is public; `userId` opportunistic from session; zod-validated body;
single insert returning `{impressionId}`). 116 completes the table: `session_id` NOT NULL (guarded — skips, never
fails, if NULL rows exist), the UNIQUE dedup index `(session_id, content_type, content_id)` the client hook's
contract promises (duplicate POST returns the EXISTING impression id; falls back to a non-unique index + NOTICE if
dupes pre-exist), and a `created_at` index. `(content_type, content_id)` reads ride 082's `idx_ci_content` prefix —
no duplicate index. Same lane (no migration): `GET /api/services/demand` (real counts of unexpired
`service_demand_signals` per offering key for the wanted-slot cards — §13: empty = empty, never fabricated;
registered BEFORE `/api/services/:id` in `content.routes.ts` so the literal path wins), and the daily demand-signal
generator is un-starved (scheduler primes `travel_pulse_trending` via `getTrendingDestinations` before
`generateDemandSignals`, best-effort per city).

**Migration 067 (Jun 11, 2026; registered in `migration-files.ts`) — Discover Feed Composition admin rows:**
data-seed only, no schema change. Inserts the five `feed_*` `platform_settings` rows read by the public
`GET /api/feed-composition-config` (Discover Feed Composition Brief): `feed_rec_cadence` ('4'),
`feed_wanted_slot_max` ('2'), `feed_wanted_slot_spacing` ('6'), `feed_rec_label` ('Recommended'),
`feed_rec_affiliate_label` ('Paid partner'). The endpoint already falls back to these same code defaults
when rows are absent; seeding them makes the knobs DISCOVERABLE/editable in the admin platform-settings
list (which shows only existing rows). Idempotent `ON CONFLICT (setting_key) DO NOTHING` — never
overwrites an admin-tuned value, mirroring the 033 seed pattern.

**Migration 168 (Aug 1, 2026; registered in `migration-files.ts`) — archive-then-drop `activity_bookings`:**
closes the QA_PUNCH_LIST "activity_bookings [DM, re-framed]" item (W5-D PR #377 follow-on). The
`shared/schema.ts` `activityBookings` pgTable declaration existed only as a DROP-guard: the table has zero
code consumers (no route, no storage method, no client caller — re-verified by a whole-repo grep before this
change), but it holds ONE real production row (Segway Paris, user `79cdafd1`, a live Stripe PaymentIntent), so
deleting the declaration outright would let the next Replit publish-push drop the table and lose that row (the
"undeclared table is a drop target" trap documented above). Decision-maker ratified: ARCHIVE then DROP. 168
① creates a new generic, durable archive table `legacy_archives` (`id`/`source_table`/`archived_at`/`reason`/
`row_data` jsonb; no CHECK) for exactly this class of problem — a retired table that still holds real rows;
② guarded, idempotent copy: every `activity_bookings` row is inserted as `row_data = to_jsonb(t.*)` with
`source_table='activity_bookings'`, skipped on re-run if already archived; ③ `DROP TABLE activity_bookings`.
No-ops cleanly (just ensures `legacy_archives` exists) if the table is already absent, e.g. fresh/dev DBs.
`legacyArchives` is declared in `shared/schema.ts` in the SAME commit that removes the `activityBookings`
declaration (the deploy-push-durability rule — an undeclared archive table would itself become the next drop
target, defeating the point). The one real prod booking survives queryably as a `legacy_archives` jsonb row;
the publish prompt this declaration caused ends. No other code paths touched. **TWO-DEPLOY SEQUENCING (Fable review addition — the push-ordering trap):** the Replit publish push runs BEFORE migrations and drops UNDECLARED tables, so the `activity_bookings` schema.ts declaration is KEPT in the same PR as 168 (step 1); removing it alongside 168 would have destroyed the prod row before the archive ran. After the first post-168 publish (verify `SELECT count(*) FROM legacy_archives WHERE source_table='activity_bookings'` ≥ 1 on prod), the step-2 PR removes the declaration; in between, the push may recreate the dropped table EMPTY — harmless and expected. **INCIDENT (Aug 1, 2026) — the gate was violated and the row WAS lost.** The step-2 declaration-removal PR (#386) was merged 22 seconds after step 1 (#385), before any publish; a revert (#389) restored the declaration ~minutes later, but within that window the Replit workspace synced main and a drizzle push ran with the declaration absent — dropping `activity_bookings` WITH its one real prod row before migration 168 ever executed. Prod forensics (Aug 2): 168 stamped, table gone, `legacy_archives` count 0. **Severity re-graded down after a live-Stripe check (Aug 2, decision-maker verified LIVE mode):** the account's entire live payment history contains NO Segway charge and no succeeded booking-type payment at all — so the lost row was an UNPAID booking record (a checkout that never captured money): no customer funds, no refund exposure, nothing to reconstruct. The original "live Stripe PaymentIntent" claim came from reading `stripe_payment_intent_id` off the DB row without verifying it in Stripe — a PI id on a row proves a checkout STARTED, not that money moved; verify against Stripe before grading a money incident. Incident CLOSED, no recovery action. **LESSONS (durable):** ① a two-deploy retirement's step-2 merge gate is not advisory — the destructive window opens at MERGE time, not publish time, because ANY drizzle push (workspace `db:push`, an agent sync, a publish) executes the current schema against the shared DB; ② dev and prod are the SAME database here (`heliumdb` serves both the workspace and the deployment), so "it's only merged, not deployed" is no protection at all; ③ step-2 PRs of this pattern should stay DRAFT with the gate in the title and be merged only in the same sitting as the verified prod check. The final declaration removal shipped in the step-2-final PR once the table was empty everywhere (nothing left to lose).

**Previous Coordination Failure (Jun 3, 2026):**
- Commit bfc3db2 made ESO canonical without accounting for booking-FK fact
- This was uncoordinated and left the transaction path orphaned
- Fixed by this architecture document + provider_services canonicality

**Recorded migration — Expert-Assisted Booking, Phase 2 (Jun 10, 2026):**
- Migration `051_affiliate_booking_trip_link.sql` adds a **nullable** `trip_id` FK
  (→ `trips`, `ON DELETE SET NULL`) to `affiliate_booking_requests`. This closes the
  Trip-logging gap on the **existing** affiliate-booking rail — no new rail, no
  provider_services / ESO / approval / category change. Set at expert-confirmation
  (the create trigger is a no-trip discover surface); on confirm the facilitated
  booking is logged onto `itinerary_items` (the canonical Trip/PlanCard item model).
- Registered in `run-migrations.ts` (runtime) and `migration-files.ts` (chain test).
  Ratified by the decision-maker via the Phase 2 GO.
- Keeps its shipped filename `051_…` per the migration-chain repair below; it is
  registered after 057 in the canonical list (registry order is authoritative,
  numeric order is not).

**Recorded migration-chain repair (Jun 10, 2026):**
- `server/migrations/migration-files.ts` is the canonical migration registration
  list for both runtime and chain-integrity checks. `run-migrations.ts` must
  import that list rather than carrying its own inline copy.
- `052_phase5_expert_endorsements.sql` is a superseded duplicate schema attempt
  for `upsell_expert_endorsements`; do **not** register or execute it. The live
  endorsement schema remains `050_phase5_expert_endorsements.sql`.

**Recorded change — Coordination-fee budget wiring + interim credit (Jul 12, 2026):**
- **Bug (was live on `main`):** `GET /api/coordination-states/:id/fee` read the budget from
  `state.total_estimated_cost`, a column **no code path writes**, so every coordination fee priced against a
  **$0 budget** — the `max(floor, 8%×budget)` percent tier could never fire; every fee collapsed to the `$499`
  floor minus an optimize credit. Reconstructed exactly: `47901 = 49900 floor − 1999 wedding optimize credit`.
- **D-BUDGET (interim, ratified):** budget now persists to the **existing `budget` jsonb column** (no migration).
  Contract: `budget = { amount: <number, USD dollars>, currency: "USD" }`, written at create/patch from the
  request's `metadata.budget`; the fee reads `budget.amount × 100 → cents`; absent/`{}`/non-positive → `0` →
  **intentional** floor-only. The fee reads `budget`, **NOT** `total_estimated_cost` (that column means *cost*,
  not *budget* — no overloading). The first-class validated `budget` field is the **filed follow-up** (D-BUDGET(b)).
- **D-CREDIT (interim, ratified):** the optimize-fee credit is **no longer subtracted** in `resolveCoordinationFee`
  (`server/services/optimization-fee.service.ts`). It was applied unconditionally for all event types with **no
  paid-signal** — the payment `confirm` (`optimization.routes.ts`) records payment on
  `itinerary_comparisons`/`platform_revenue`, never linked to a coordination state (TODO there defers linkage to
  Phase 4). Crediting an unpaid fee is an unearned discount; the honest interim charges floor-or-percent with **no
  credit**. **Follow-up (filed):** record/lookup the paid optimize fee per coordination state, then credit only when paid.
- The `499_00` floor / `0.08` percent constants are **unchanged** (they were correct; only the budget input + credit gate were).
- **Known-issue (filed, NOT fixed here):** the coordination-state create/patch zod schemas accept `title` +
  `metadata` that map to **no columns** (Drizzle silently drops them) — the same "looks-stored-but-isn't" class that
  caused the $0-budget bug. And `server/__tests__/event-coordination.test.ts` is **dead** (imports uninstalled
  `vitest`; calls unimported `getFee`) — journey-7:91 is the only live test for this fee engine.
- Ratified by Leon's D-BUDGET(existing-`budget`-column) + D-CREDIT(interim) lock. Own money-fix lane.

---

## FAQ

**Q: Can I add a new service table?**
A: No. Consolidate into provider_services or escalate to decision-maker.

**Q: Can I make expert_service_offerings accept writes again?**
A: No. It's a read-only template source. Writes must target provider_services.

**Q: What about the ESO columns (status, submittedAt, etc.) that are still in the schema?**
A: They're deprecated — kept for backward-compat in Phase 5. Don't write to them. Don't read from them. Use provider_services columns instead.

**Q: Can I change the approval status enum?**
A: No without explicit user approval. Document the change in this file.

**Q: Why is `service_bookings.service_id` nullable if transactions must reference provider_services?**
A: Provider-service transactions still must — the FK and dependency hold for them. Transport-commerce bookings are the single documented exception: they reference `transport_booking_options`, not `provider_services`, so `service_id` is NULL for them (see "Transport-commerce exception" above; migration `050`). Any further loosening of this FK requires decision-maker approval.
