<!-- SLIMMED per Execution Protocol (DECISIONS.md ruling 26 §5, ruling 29) — 2026-08-04, as-of 5941a4ff.
     This file is an INDEX: invariants + pointers + boot-time operational notes ONLY.
     - Decisions/rulings:     docs/DECISIONS.md (append-only ledger — OUTRANKS every brief; cite by number, never paraphrase)
     - Historical findings:   docs/findings/CLAUDE_MD_ARCHIVE.md (the 1,100+ lines moved out of this file, with as-of SHAs)
     - Guard registry:        docs/DECISIONS.md §Guard registry (guard = runs in CI; script-only = MISSING)
     - Merge write-back:      .github/PULL_REQUEST_TEMPLATE.md (every merge writes its own deltas back)
     - Defect state:          lives in findings docs with as-of SHAs — NEVER here ("fix in flight" class is banned).
     Volatile current-state claims do not belong in this file. Re-verify anything stateful at Phase 0. -->

# Traveloure Codebase Architecture

This document captures architectural decisions to maintain consistency across code changes. Updates require approval from the designated decision-maker.

**Architectural Decision-Maker:** User (explicit confirmation required for schema/routing changes).

---

## Locked Decisions & Current Intent (updated Jul 12, 2026)

> This section carries **intent** — how the platform is *supposed* to work — from the decision-maker's sessions, which the
> repo alone can't convey. Where a "⚠️ current code" note appears, the code **diverges from intent**; that is a tracked
> **bug**, not the design. Do not "fix" the doc to match a divergence — fix the code (or leave it flagged).

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
8. **No fee/commission/margin literals** anywhere outside `fee_bands`/config — grep-gated every phase. A hardcoded rate in
   touched code is a defect (see §13). **Phase 4.1 LANDED (migration 122):** the `499`/`8%` coordination constants —
   formerly the pre-existing §8 exception — are now admin-editable `fee_bands` rows (`coordination_floor` flat-dollars
   `499.00`; `coordination_percent` fraction `0.08`). `resolveCoordinationFee` reads them via the two bands and **falls
   back to the same code constants when a row is absent/non-positive** (a fee floor's safe failure mode), so the seed is
   behavior-neutral on apply and the constants survive only as the documented fallback default (`fee-literal-ok`,
   matching the `getFee` DEFAULT_FEE_CENTS fallback posture). Idempotent `ON CONFLICT DO NOTHING`; no schema/CHECK change
   → no publish-time push trap.
9. **Routing realities (corrected Aug 7, 2026 — decision-maker ratified).** `server/routes/experts.routes.ts` is now
   **MOUNTED and live** (`app.use` in `server/routes.ts`; the dark-endpoint repairs landed it — the earlier
   "imported-but-unmounted" note was stale). The **unmounted-router guard** (`scripts/check-unmounted-routers.cjs`,
   CI) is the arbiter of dark-route claims going forward — do not trust prose here over its output. Unchanged and
   still load-bearing: **dead endpoints return 200-HTML (the Vite catch-all), NOT 404** — never use a 404 as a
   "route is dead" signal.
11. **Auth/env.** Passport serializers register in **all** environments, not just Replit (fix #133) — email/password login
    works off-Replit. The `package-lock.json` `replit.local` pollution is scrubbed durably (#134; see Lockfile purity).
12. **A PENDING advisor may not write.** Trip-item mutation paths (create/edit/delete/reorder) gate the advisor branch
    on WRITE-access statuses (`accepted`/`assigned`, not `pending` — `TRIP_ADVISOR_WRITE_ACCESS_STATUSES`); read
    surfaces (assigned-trips, trip GET, plancard) keep granting `pending`. `itinerary_items.origin`
    (`'ai'|'traveler'|'expert'`, app-enforced, no CHECK — publish-trap avoidance, migration 181) is stamped
    server-side at create; both ratified Aug 7 2026. Regenerate preserves `origin='traveler'` and `suggestedBy='expert'`.

20. **Market-launch assets are DB-backed; extracted places are child rows (decision-maker ratified Aug 9, 2026).**
    Two additive tables (migrations 185/186, both declared in `shared/schema.ts` — publish-trap rule):
    **(a) `dmo_extracted_places`** — places extracted from a DMO guide are first-class child rows of
    `dmo_raw_content` (ON DELETE CASCADE; UNIQUE (dmo_content_id, "position")), replacing the
    `extracted_data.places` JSON blob as the source of truth (blob backfilled by 185, thereafter historical —
    written never read). Re-extract is replace-by-position but **must preserve expert-added `ticketing_url`**
    by `normalized_name` match — an expert's curation is never clobbered by a refresh. API response shapes are
    unchanged (server maps rows → the same `places` array), so clients are untouched.
    **(b) `market_geography`** — a market's water/parks/roads layer lives in the DB, written by the admin
    "Add market" flow (`/api/admin/markets`, under the §2 blanket guard), which runs the Overpass extract
    **server-side** (same UA/mirror/length-cap rules as `scripts/generate-market-geography.ts`) and can also
    seed `city_neighborhoods` from OSM `place=suburb|neighbourhood|quarter` nodes. Lookup is **DB-first with
    the committed `KYOTO_GEOGRAPHY` literal as server-side fallback** (absent row ≠ error; no-layer markets
    render honestly without geography, never another city's shapes — §13 posture). The client no longer
    bundles geometry — it fetches the public read endpoint. ODbL attribution ("© OpenStreetMap contributors")
    remains REQUIRED wherever any of this renders. The **vector-tile interactive map is PARKED** by the same
    ruling — do not start it as a side effect of geography work.

21. **Expert Notes are two-level and traveler-facing; `trips.expert_notes` stays PRIVATE (decision-maker
    ratified Aug 9, 2026).** UI label for both new fields is **"Expert Notes"**: per-item
    `itinerary_items.expert_note` and trip-level `trips.expert_traveler_note` (migration 187, additive
    nullable, declared in `shared/schema.ts`) are **delivered to the traveler** (PlanCard + delivered-plan
    surfaces, "from your expert" treatment). **`trips.expert_notes` is a DIFFERENT field** — the Workstation's
    private "Build notes" (`PATCH /api/trips/:id/expert-notes`) — and must never leak to traveler surfaces;
    do not rename or merge the three. Writes to the new fields gate on the same §12 advisor WRITE statuses as
    other item/trip mutations. Same ruling: **traveler-facing distance on map surfaces is ALLOWED** (store
    teaser day-km legend ratified — "users should be able to see the difference"); the Delta-framework
    brief's L3 ("distance never traveler-facing") is amended to headline *delta claims* only, not map
    annotation. The Advisor **fundamentals** checklist (ratified list in `server/routes/advisor.routes.ts`)
    is deterministic, §13-honest (a check with insufficient data is omitted with a reason, never guessed).

22. **Service map & route stops; Catalog is the map's home (decision-maker ratified Aug 10, 2026).**
    **(a) `service_route_points`** (migration 192, declared in `shared/schema.ts` — publish-trap rule) is the
    child-row home for a provider service's **ordered route stops**, on the `dmo_extracted_places` pattern:
    `ON DELETE CASCADE` FK → `provider_services`, `UNIQUE (service_id, "position")`, **nullable lat/lng — an
    unlocated stop stays visibly flagged, never guessed onto the map** (§13). Writes are owner-gated
    **replace-list** (`PUT /api/provider/services/:id/route-points`): positions derived server-side from array
    order, allowlist body (§19 posture — no `createInsertSchema` denylist parsed off the body). Coordinates for
    a stop come only from an explicit user placement (same L27-P3 confirm posture as the meeting pin).
    **(b) Placement:** the map authoring surface lives on **Catalog** (`/provider/services`, list↔map toggle) —
    per the C9 precedent that put availability-slot editing there (per-listing curation belongs to the "what I
    sell" module). Workstation ladder cards may deep-link in; Workstation never owns the surface. The meeting
    pin keeps its ONE write path (`extractServiceLocation` on POST/PATCH `/api/provider/services`, confirm-gated
    `LocationPointPicker`) — the map view mounts the same picker, no second pin-write rail.
    **(c) Rendering honesty:** route connectors are **straight dashed lines labeled as sequence, not travel
    routing**; no invented distances/durations (§13). `serviceRadius` may render as a ring around the confirmed
    pin (display only). Traveler surface (`GET /api/services/:id` now carries `routePoints`;
    `/services/:id` page): map renders **located stops only**, shows "X of Y stops located", and renders **no
    map at all when the service has no coordinates** — never a city-center fallback. Traveler map is
    Leaflet/OSM; ODbL attribution ("© OpenStreetMap contributors") REQUIRED wherever it renders.
    **(d) Distribute:** the "Route" share frame is a third format of the EXISTING share-image rail
    (`/api/share-image/service/:id.png?format=route`, satori template beside feed/story) — layout data resolved
    server-side from the row like the other two; measurement stays on Performance (`LinkAnalyticsPanel`), the
    share rail never grows its own analytics.

### §13 — Known Defects (these are BUGS, not intended behavior — do not describe them as how the platform works)

Defect state is VOLATILE and no longer lives in this file (ruling 26 §5): open defects live in findings/audit docs
with `as-of` SHAs (see `docs/findings/CLAUDE_MD_ARCHIVE.md` for the §13 history archived 2026-08-04). Governing
invariants that grew out of §13 defects remain here as §14–§16 below.


### §14 — Money-endpoint server-derivation rule (client-trusted amount/identity cluster)

**GOVERNING RULE (convention — enforce on every money/ownership endpoint):** a money endpoint derives the
charge/refund **amount from the server-side catalog/record**, and the **acting user from the session** — **NEVER**
from `req.body`. `req.body.amount` / `req.body.price` / `req.body.userId` must never reach a payment or ownership
decision. This class appeared **seven times** (coordination-fee $0-budget, template mass-assignment $0.01 price,
world-writable fee-config, then the four below); the rule closes the class so the eighth can't be written.
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
**EXTENDED ONE DERIVATIVE UP BY §18 (ruling 42):** the same prohibition now covers the **RATE** that
multiplies the amount — a commission split / fee percentage / band selector is never client-settable,
and the guard predicate and its schema-mediated blind spot are described there. Read §14 and §18 together.
**GENERALIZED BY §19 (ruling 46):** amount, identity and rate are three instances of one class —
**privileged-field mass-assignment through a denylist (`.omit()`) schema** — whose structural fix is a
pick-based **allowlist** body schema. §19 also binds ruling 41's `stripePaymentIntentId` clause on the
booking-BIRTH side. Read §14, §18 and §19 together.
**NOT in this cluster (named, separate lanes):** F2 born-approved wizard (D1a/Phase-3, root cause = the
`provider_services.approvalStatus` default); the idempotency cluster (payout double-transfer, `/confirm` TOCTOU,
`/checkout` dup-bookings — see §15); marketplace Phase B surfacing.

### §15 — Money-safety idempotency invariant (double-spend on retry/race)

**GOVERNING INVARIANT:** any endpoint that moves money or creates a purchase/booking must be **idempotent** — a
retry / double-click / replay produces the **same single effect**, enforced by BOTH (a) a Stripe `idempotencyKey` on
the external call and (b) an **atomic conditional DB update** (`UPDATE … WHERE status = <expected>`) so the state
transition itself is the concurrency guard. A check-then-update (`if status==X { update }`) is the TOCTOU bug, **not**
a guard. Claim the row atomically **first**, then make the external call — so a concurrent caller can't also pass.

**§15b — the CLAIM is not the COMMITMENT (ruling 38, checkout atomicity).** "Claim first, then call" says what must
be written *before* the external call; it does **not** license writing everything else there too. Irreversible state —
cart clears, `purchased` flips and their diary rows, counters, notifications, **emails** — must follow the operation
that authorizes it, never precede it. The canonical shape is **CLAIM (provisional) → AUTHORIZE → PROMOTE**, with a
**TTL reclaim** rather than a compensating rollback (rollback code runs in exactly the conditions that broke the
operation; expiry survives a process death). On `/api/checkout` the provisional marker needs no new state:
`status='payment_pending' AND stripe_payment_intent_id IS NULL` **is** an unauthorized claim by construction. Two
rules that fall out and must not be weakened: (1) the void and the authorization stamp are BOTH atomic conditionals on
that same predicate, so a promote and a void can never both win; (2) **a sweep must never void a row whose
PaymentIntent may exist** — a pre-flight `bookingDetails.stripeAttemptAt` marker is written before the Stripe call, an
unmarked row is provably un-attempted and safe to void with no network call, and a marked row is only ever reconciled
against Stripe (found ⇒ promote, definitively-absent ⇒ void, unreachable ⇒ quarantine, never guess). See
`server/services/checkout-claim.service.ts`; proven by `server/__tests__/checkout-claim-sweep.db.test.ts` and
journey negative **N16**.

**§15c — ONE payment promotion, TWO callers (ruling 39; tasks #212/#213 CLOSED).** Ruling 38 recorded that both
documented reconciliation paths were **inert for cart checkout** — `handlePaymentSucceeded` and
`POST /api/bookings/confirm-payment` queried the legacy **`bookings`** table with `service_bookings` ids and matched
nothing — which left the TTL sweep as the **only** recovery mechanism on the money path. Both now drive
`promotePaidCheckout` (`server/services/checkout-claim.service.ts`, step 5 of the same spine): **one promotion
implementation, two callers**, so the webhook and the client fallback can never diverge on what "confirmed" means.
Rules that must not be weakened: (1) the promotion is an **atomic conditional** —
`UPDATE … SET status='confirmed' WHERE status='payment_pending' AND stripe_payment_intent_id=<pi>` — so a double
signal is exactly **one** flip and one diary row, the loser a no-op; (2) **only the webhook** may resolve a booking
from the PaymentIntent's `bookingIds` metadata and stamp a PI onto an unstamped claim (a signature-verified Stripe
delivery is Stripe's word; a client-supplied PI is not) — this is what rescues the server-died-mid-authorization
window, where nothing keyed on `stripe_payment_intent_id` can find the row; (3) a **late signal never resurrects a
voided row** — void wins after TTL, and the signal lands in a **reconciliation-exception** state
(`bookingDetails.reconciliationException` + a `checkout_reconcile_exception` diary row + `logger.error`, surfaced by
`GET /api/admin/bookings/reconciliation-exceptions`) — ops-visible, never silent; (4) the promotion is the **money
leg only** — it must never re-run `promoteAuthorizedCheckout`'s non-idempotent effects (counter increments, provider
emails); the one effect it does retry is `markItemPurchased`, an atomic conditional flip and therefore safe.
The legacy `bookings` rail is **still live** (`/booking-demo`, `/itinerary-comparison/:id` →
`POST /api/bookings/process-cart`) — do **not** delete it while making the cart rail work; both rails run, each
no-ops on ids it does not own. Proven by `server/__tests__/checkout-payment-promotion.db.test.ts` (negatives
**N17/N18/N19**); the sweep's 9/9 suite is untouched and still green — redundancy means every layer stands alone.

### §17 — Drift DETECTION rule (one job, both rails; detect, don't repair — ruling 40)

**GOVERNING RULE:** the daily Stripe-vs-DB reconciliation job (`server/jobs/stripeReconciliation.ts`) scans
**BOTH booking rails** — cart checkout (`service_bookings`) and the still-live legacy `bookings` — and its
findings are **persisted rows**, never only log lines. Until this landed the scan read the legacy table only,
so **cart-checkout charges (the primary checkout) were invisible to it**: `service_bookings` ids never appear
in the legacy table, so the queries matched zero rows and errored on nothing — the same disjoint-id-space
failure §15c fixed on the promotion side, one layer up. Recovery was three-layered while **detection was
one-eyed**.

**DETECT, DON'T REPAIR.** The job writes exception rows; it never promotes at will, voids, refunds, cancels or
invents a booking. Repair belongs to the three recovery layers (§15b/§15c) plus a human — a detector that also
repairs is a fourth, unreviewed writer on the money path. **ONE narrow exception:** a PaymentIntent Stripe says
succeeded whose booking is still an unpromoted claim is handed to the **EXISTING shared** `promotePaidCheckout`
with `actor="reconciliation"`, diary-logged — that is recovery layer 2's own logic arriving late, not new
repair code. Nothing else.

**Rules that must not be weakened:**
1. **Exceptions are APPEND-ONLY** (`reconciliation_exceptions`, migration 177). No UPDATE, no DELETE path.
   Re-detection is absorbed by the UNIQUE `dedupe_key` + `ON CONFLICT DO NOTHING`, so a drift that persists a
   month is ONE row stamped with the run that FIRST saw it — while the run row records `exceptions_detected`
   separately from `exceptions_new`, so "still drifting" stays visible without mutating a recorded fact.
2. **Every pass writes a `reconciliation_runs` row — including a clean one and a skipped one.** Silence must
   be distinguishable from the job not having run; the previous version logged "Clean" to stdout and left no
   durable trace, so a healthy quiet day and a scheduler dead since the last deploy rendered identically.
3. **The expected charge is SERVER-DERIVED** — `SUM(total_amount + platform_fee)` over the PaymentIntent's own
   booking rows (§14), with a tolerance that is the checkout's accumulated `.toFixed(2)` rounding, **not** a
   rate (§8). Never taken from Stripe, never from a client.
4. **No new writes were required on the checkout path.** The scan keys on linkage that already exists:
   `service_bookings.stripe_payment_intent_id`, `pi.metadata.bookingIds`, the `idempotency_key` sibling
   convention (`key`, `key#1`, …), `refunds.stripe_refund_id`, and the legacy `charge.metadata.bookingId`.
   Adding a write to make detection easier would put the detector inside the thing it audits.
5. **`GET /api/admin/reconciliation/exceptions` is a SIBLING of `GET /api/admin/bookings/reconciliation-exceptions`
   (§15c), not a replacement.** That one shows exceptions a payment SIGNAL recorded on a booking row it could
   not promote — it can only ever describe a row that exists. This one is the SCAN's output and can describe
   money with no row behind it at all. Both are listed on `/admin/reconciliation`.

**§17b — amends §15c's "webhook only" clause.** Ordering-1 capability (resolve bookings from
`pi.metadata.bookingIds` and stamp a PI onto an unstamped claim) is gated on the PaymentIntent being **Stripe's
own word**, and is now open to `SERVER_VERIFIED_ACTORS` = `{webhook, reconciliation}`: a signature-verified
delivery, **or** the drift job's authenticated read of the PaymentIntent from the Stripe API with the platform's
own secret key. Ruling 39 wrote "webhook only" because the signed delivery was then the only server-verified
source that existed. **The clause that does NOT move: a CLIENT-supplied PaymentIntent may never resolve or stamp
anything** (proven by N17c). See ruling 40.

Proven by `server/__tests__/reconciliation-detection.db.test.ts` (negatives **N20/N21/N22**, 15 proofs); the
sweep's 9/9 and the promotion suite's 11/11 are untouched and green.

### §18 — Rate-bearing fields are never client-settable (ruling 42; extends §14 one derivative up)

**GOVERNING RULE:** §14 forbids a client-supplied **amount / price / identity** from reaching a money
decision. §18 extends the same rule to the **RATE** that multiplies the amount: a commission split, a
fee percentage, a revenue share or a band selector is resolved from **`fee_bands` only** (§8) and is
**never settable on any schema a client can reach** — regardless of whether anything reads it today.
The required shape for a privileged field is **STRIP-AND-CLAMP, in two layers**: the zod insert schema
`.omit()`s it (layer 1) **and** the storage writer strips-and-derives it (layer 2), *"so every caller is
covered"* — the same placement the approval-lifecycle strip already uses in `updateProviderService`.

**The instance this closes:** `provider_services.revenueShareRate` was exposed by
`insertProviderServiceSchema`, parsed off `req.body` by **both** POST and PATCH
`/api/provider/services`, spread into the row, and read at `payments.routes.ts` as *"the final override
(takes priority over config)"* over the `fee_bands`-resolved split **at the real Stripe charge**. The
clamp was range-only, so `1.00` was accepted ⇒ provider share 100 %, platform fee `0.00`. No UI ever
sent the field; it was reachable only by a crafted request.

**Rules that must not be weakened:**
1. **Derivation delegates — never re-implements.** The server-side value comes from ONE call into the
   existing `resolveCommissionRates` (via `resolveServiceOwnerShareRate`), using the same option shape
   `/api/checkout` uses. Two authors resolving rates two ways is how this class returns.
2. **Update paths are checked as hard as inserts.** The PATCH path was the easier of the two to reach —
   `insertProviderServiceSchema.partial()` let a single-field request set nothing but the split on an
   already-approved listing — and it was the one the audit found stripped on neither side.
3. **A field with no consumer is still stripped.** The dormant fee/payout family on
   `insertLocalExpertFormSchema` is exactly why: nothing read it, which is why nobody noticed it was
   mass-assignable.
4. **Guard:** `scripts/check-money-endpoints.cjs`. Its `req.body` predicate now also covers
   `rate|share|commission|split`, and — because the actual hole was **schema-mediated** and therefore
   invisible to any line-level `req.body` grep — it carries a second pass intersecting *insert schemas
   that expose a rate-bearing column* with *insert schemas parsed from a request body*. A
   privileged-by-design setter (an admin band editor) carries `money-derive-ok` on the COLUMN line in
   `shared/schema.ts`. Do not remove either pass.

**§18b — the owner rail may not move a booking out of a provisional state (ruling 42, SD-1).**
`status='payment_pending' AND stripe_payment_intent_id IS NULL` is an unauthorized claim by
construction (§15b) and belongs to the claim machine (`checkout-claim.service.ts`), which stays its
**sole author**. `PATCH /api/provider|expert/bookings/:id/status` checked the *target* status and never
the *current* one, so a provider's Accept promoted an unpaid claim to `confirmed` — after which
`voidClaim` **and** `promotePaidCheckout` both matched **zero** rows and the claimed
`vendor_availability_slots.booked_count` was destroyed with **no code path in the repo to return it**.
The owner rail now carries a from-state allow-list AND the §15 **atomic conditional**
(`updateServiceBookingStatus`'s `expectedFromStatuses`: `UPDATE … WHERE id = ? AND status IN (…)`); the
pre-check is only the error message, **the transition itself is the guard**. Callers that omit the
parameter keep the previous unconditional behaviour verbatim. Note the money layers held here and only
the **inventory** layer failed — so an assertion that watches only `status` is not sufficient
(P3 asserts the slot; P4 asserts the row stays reclaimable by both recovery layers).

**§18c — no consumer + irreversible effect ⇒ DELETE, don't gate (ruling 42, AC-1).**
`POST /api/vendor-availability/:id/book` was `storage.bookSlot(req.params.id)` behind `isAuthenticated`
and nothing else: any account could exhaust any provider's inventory, and because it created no booking
row the TTL sweep had nothing to reclaim and `releaseSlot` had no reachable caller. It had zero
consumers. Gating it would have preserved a second, unaudited way to consume inventory beside the
checkout spine. `storage.bookSlot` itself is untouched — it is checkout's atomic claim (§15/C3).

**§18d — a guard states its NEGATIVE SPACE, and a predicate change ships with fixtures (ruling 43).**
Every entry in the `docs/DECISIONS.md` Guard registry carries a one-line statement of what its predicate
does **not** cover; green means **green-within-stated-bounds**. `phase2-fee-gate.sh` was case-sensitive
with an `[A-Za-z]*` identifier tail and therefore blind to **every SCREAMING_SNAKE fee constant** — this
codebase's dominant convention — while reporting PASS for its whole life. Both `-i` and `[A-Za-z_]*` are
load-bearing. Because a wrong predicate is invisible by construction, both guards now carry committed
`--self-test` fixtures that run in CI **immediately before** the guard itself (the ledger-lint
precedent). The gate also honours ruling 32's second disposition: `fee-literal-debt:#<task>` exempts a
line from failing but is **reported on every run**, so filed debt never becomes a silent baseline.

### §19 — Privileged-field mass-assignment is a STANDING CLASS; the fix shape is an ALLOWLIST (ruling 46)

**GOVERNING RULE:** §14 forbids a client-supplied amount/price/identity from reaching a money
decision; §18 extended it to the RATE. §19 states the **shape** all three share and fixes it
structurally: **a privileged column is client-settable BY DEFAULT under a denylist (`.omit()`)
schema, and nobody edits an omit list for a column that did not exist when it was written.** The
required fix shape for a client-reachable body is an **ALLOWLIST — a pick-based schema** — so a new
privileged column is unreachable until someone deliberately names it.

**Three instances, one class:** `provider_services.revenueShareRate` (§18/ruling 42); the dormant
fee/payout/Stripe-linkage family on `insertLocalExpertFormSchema` (same sweep); and
`service_bookings.stripePaymentIntentId` at `POST /api/bookings` (ruling 46). **Posture as of
ruling 46:** all **186** `createInsertSchema(...)` calls in `shared/schema.ts` are `.omit()`-based and
**ZERO** are `.pick()`-based. Converting the layer is filed as **`#PS18`** with a committed negative
fixture (`booking-birth-provenance.db.test.ts` **B6**); until it lands, every one of those schemas is
a denylist and must be read as one.

**§19a — `stripePaymentIntentId` is written ONLY by the shared promotion path.** Ruling 41's clause
stands with **no carve-out**, and it binds on the **BIRTH** side as well as the promotion side. A
booking-create endpoint accepting the field from `req.body` **is the violation, not a tension**:
`POST /api/bookings` `.parse`d the `.omit()`-based `insertServiceBookingSchema` off the body and
SPREAD it into `createServiceBooking`, so a crafted request birthed a booking already carrying its
own PaymentIntent. That is **not a promotion**, so **N17c can never catch it** — and the row then
looks authorized to every consumer keyed on that column (the sweep skips it, `promotePaidCheckout`
matches it, the drift job trusts it as linkage). Stripped in **three** layers: the schema `.omit()`,
the storage strip in `createServiceBooking` (which covers the internal `as any` callers a type-level
omit cannot reach), and the route allowlist. `stampAuthorization`/`resolveAndStamp`
(`checkout-claim.service.ts`) remain the column's **sole** writers.

**§19b — the rows already on disk get DETECTION, never silent trust or silent repair.** A fix stops
new rows and says nothing about old ones (§17). Drift kind **`payment_provenance_unverified`**
(`warning`, cart rail; `GET /api/admin/reconciliation/exceptions`). **Its predicate follows ruling
41's invariant as STATED — the PROVENANCE of the id, not one implementation of it — so TWO
independent forms each clear a row:** the §15b pre-flight `bookingDetails.stripeAttemptAt` marker
(the spine wrote it), **or** Stripe's own `metadata.bookingIds` naming the booking when the job reads
the PaymentIntent with the platform's own secret key (§17b). Corroboration is not a forger's
loophole — `metadata.bookingIds` is written server-side by `createPaymentIntent`, so a lifted
PaymentIntent names the bookings it actually paid for and never the row it was planted on, and a
PaymentIntent absent from Stripe is never seen at all. **Do not narrow this to the marker alone:**
that would indict every legitimate booking whose PI predates ruling 38 but which Stripe can still
vouch for. Once a row fails both, the PS15 mass-assignment, a seeded fixture, and a pre-ruling-38 row
are **indistinguishable** — which is why the kind is *unverified*, not *forged*, and why the job does
nothing about it.

**§19c — guard.** `scripts/check-money-endpoints.cjs`'s schema-mediated pass carries a
PAYMENT-IDENTITY column predicate (`stripe<Thing>Id` / `paymentIntentId`) beside the rate one, with
committed `--self-test` fixtures (§18d). It knows those **two** classes and nothing else — an amount,
a `status`, an authorization grant (`#PS16`) is still invisible to it. That stated blind spot is the
reason the answer is `#PS18`, not a wider grep.

Proven by `server/__tests__/booking-birth-provenance.db.test.ts` (**B1–B6**, 7 proofs); sweep 9/9,
promotion 11/11 incl. **N17c**, detection 15/15 and ruling 42's P1–P6 untouched and green.

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
  **Do not conflate with expert *itinerary* templates:** those are a separate product living in the `expert_templates` table (marketplace), **not** `provider_services` — sunset decision archived in `docs/findings/CLAUDE_MD_ARCHIVE.md` (§10 block; canonical in `docs/DECISIONS.md`).
- The approval workflow (draft → submitted → approved) is stored as `approval_status` on `provider_services`, not elsewhere.
  **F2-CLOSED (migration 111):** offerings are now born `submitted` — `provider_services.approval_status` defaults `"submitted"`
  at both the ORM (`shared/schema.ts:578`) and the DB column; existing rows grandfathered `approved` (no backfill). Approval-lifecycle history (§1/D1a) archived in `docs/findings/CLAUDE_MD_ARCHIVE.md`.
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
  Admin reads (the review queue) are likewise ungated. Only public/non-owner reads gate on `approved`. Approval-lifecycle history (§1/D1a) archived in `docs/findings/CLAUDE_MD_ARCHIVE.md`.
- No separate tables; no separate approval workflows

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
- **Source-level prevention — VERIFIED WORKING Aug 11, 2026:** `.replit [env]` pins
  `npm_config_registry = "https://registry.npmjs.org/"` (LOWERCASE key, deliberately — Replit injects the
  lowercase spelling and npm resolves a case-collision in its favor; the same-key pin overwrites it at
  shell spawn). With the pin in force `npm config get registry` reports the real registry and pollution
  never forms. The layers below are defense-in-depth for the day a platform change outflanks it.
- Guards, in order: the `postinstall` script scrubs immediately after EVERY install — at the formation
  event itself, regardless of who invoked the install (added Aug 11, 2026; this also covers commits made
  through hook-bypassing interfaces, e.g. Replit's Git pane); `scripts/post-merge.sh` scrubs right after
  its install; the git hooks scrub staged lockfiles — BOTH `.githooks/pre-commit` (normal commits) AND
  `.githooks/pre-merge-commit` (merge commits; added Aug 11, 2026 — **git does not run pre-commit for a
  merge**, and that gap is exactly how 55 polluted URLs reached CI on merge `3f5b40f`, failing 13 checks
  on PR #453); the CI `lockfile-purity` gate is the backstop and the only guard that cannot be bypassed.
  All use `scripts/scrub-lockfile.cjs` (URL-only rewrite; integrity hashes untouched).
- **The `.npmrc` does NOT reliably prevent pollution from forming — VERIFIED by incident, Aug 11, 2026.**
  55 `replit.local` URLs formed in this repo with the `.npmrc` present, so treat the hooks/scrubs as
  load-bearing, never as belt-and-braces. Keep the `.npmrc` anyway (harmless, may help in some contexts).
  NOTE the old verification one-liner (`npm install && grep -c ...`) is INVALID as a probe: an
  up-to-date install short-circuits ("up to date ... in 2s") without resolving anything, so its clean
  grep proves nothing. A real probe must force resolution (delete `package-lock.json` first) — but the
  incident already answered the question; do not burn time re-proving it.
- Do not remove the `.npmrc`, the `postinstall` scrub, either hook, or the CI gate; do not run bare
  `npm install` and commit without the scrub.

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
