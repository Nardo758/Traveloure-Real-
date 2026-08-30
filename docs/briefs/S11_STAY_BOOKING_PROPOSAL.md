> **RATIFIED AS RECOMMENDED — decision-maker, in session, Aug 13, 2026 (ledger row 107).**
> Every recommendation below, including all six open questions, is now the ruling. Q-Hotfix
> (release-all-nights) already landed independently as ledger row 106.

# S11 — Traveler Stay Booking: Schema + Mechanics Proposal

For decision-maker ratification (CLAUDE.md: schema/routing changes require explicit approval).
Mirrors `docs/briefs/WAVE3_SCHEMA_PROPOSALS.md`'s structure. Source: DECISIONS.md ledger rows
102/103 (S7 ratification + landing); `docs/briefs/WAVE3_SCHEMA_PROPOSALS.md` S7-Q4.

**HEADLINE FINDING:** the §15 claim/promote/void mechanics for a multi-night stay **already exist
and are live in `POST /api/checkout`** — not a green-field design. Missing: (1) bulk inventory
publishing from `service_date_ranges` into claimable slot rows, (2)
`service_date_ranges.nightly_price` actually reaching the charge (today dead data — the charge
still reads flat `provider_services.price`), and (3) **a real §18b-class bug**: every release path
returns only the first claimed night, leaking the rest. This is a targeted repair + extension of
the proven mechanism, not a new one.

---

## Current state (verified)

**The claim mechanism for a stay is already candidate (a), in production, today.**
`server/routes/payments.routes.ts`:
- `getRoomNights`/`resolveItemBaseAmount` (:272–294): a cart item with `service.pricingUnit ===
  "per_night"` carries `{checkIn, checkOut}` in `cart_items.contentMeta` (jsonb — the documented
  smallest-existing-carrier choice, :260–264); nights = `(checkOut-checkIn)/86400000`, capped at 30.
  Charge = `parseFloat(service.price) * nights` — **flat rate, never touches `service_date_ranges`**.
- `nightDatesBetween` (:333–342): expands `[checkIn, checkOut)` into one calendar date per night
  (checkout day itself excluded — hotel semantics).
- The claim (:836–1027, `roomStays` map): for each `per_night` cart item, looks up an existing
  `vendor_availability_slots` row **for every night date** (:979–992) — a night with no row 409s
  `nights_unavailable` — then claims each atomically via the **existing** `storage.bookSlot`
  (:996, the same §15 atomic `UPDATE … WHERE booked_count < capacity`), **all-or-nothing**: any
  night failing releases every night already claimed for this stay AND every slot already claimed
  by earlier cart lines in this checkout (:1000–1007, `claimedThisStay`/`claimedSlotIds`/
  `releaseClaimed`).
- The booking row (:1363–1454) snapshots `{propertyId, propertyName, roomName, checkIn, checkOut,
  nights, nightlyRate}` into `bookingDetails` (the ready-made-snapshot posture) and stamps **only
  the first night's slot id** onto `service_bookings.slotId` (:1445–1452, "one representative id").
- This is the **ratified PROPERTY rung** (`docs/findings/CLAUDE_MD_ARCHIVE.md:908–931`, decision-maker
  Jul 29, 2026, predates S7 by two weeks): "availability = per-night slots on the EXISTING
  `vendor_availability_slots` rail … a multi-night stay claims all nights atomically, all-or-nothing
  … NO new availability table." **S7's `service_date_ranges` (migration 210) was layered on top as
  pure authoring data and was never wired to this mechanism** — confirmed by migration 210's own
  header ("S11's future checkout input … never charged from directly") and by grep: nothing in
  `server/` reads `service_date_ranges` outside its own CRUD route and the materializer.
- **The materializer does not touch date-ranges.** `server/services/availability-materializer.service.ts`
  (:82–146) expands only `service_availability_patterns` (weekly repeat) into
  `vendor_availability_slots`; `service_date_ranges` has **zero** materialization path. So today a
  property/room provider still creates every bookable night **one at a time** via the generic
  `POST /api/provider/availability` (`server/routes.ts:8577`, requires non-empty `startTime`,
  `z.string().min(1)` — confirmed no NULL-start_time write path exists anywhere in the repo today).
  `service_date_ranges` rows sit in the DB, authored, unread by anything that claims money.
- **`vendor_availability_slots.pricing` jsonb (`shared/schema.ts:2400`) already exists, defaults
  `{}`, and is read by nothing** — the PROPERTY-rung ratification explicitly named it as the future
  home for "seasonal per-date overrides … riding the slot row's existing `pricing` jsonb." It is
  the natural, zero-migration carrier for a materialized night's rate.
- **The idempotency unique index is migration 210's `vendor_availability_slots_service_date_start_unique
  (service_id, date, start_time)` — deliberately NOT partial** (`shared/schema.ts:2412–2427`,
  `server/migrations/210_service_availability_model.sql:96–127`), because Drizzle's
  `onConflictDoNothing({target:[...]})` needs a non-partial arbiter and Postgres never treats two
  NULLs as colliding regardless. **This is a live landmine for any date-range materializer that
  would write NULL `start_time` for a "no time, just a date" night**: two such rows never conflict,
  so `ON CONFLICT DO NOTHING` silently inserts a duplicate on every re-materialize and two
  overlapping ranges would double inventory. The existing single-slot write path avoids this only
  because its zod requires a non-empty string — there is no established sentinel value today.
- **A real §18b-class bug exists in every release path, today, for multi-night stays.** All three
  release sites floor-and-reopen exactly **one** slot — `row.slotId`/`u.slotId` — never the full
  night range a stay actually claimed:
  - `voidClaim` (`server/services/checkout-claim.service.ts:502–517`) — the TTL sweep's void.
  - `refundServiceBooking` (`server/services/stripe-payment.service.ts:1007–1019`).
  - `updateServiceBookingStatus`'s first-cancellation release (`server/storage.ts:2256–2281`, the
    QA-2 Finding C fix, itself explicitly written to "mirror … the sweep's `voidClaim` and
    `refundServiceBooking`'s `releaseSlot`" — i.e. the single-slot shape was **copied three times**,
    not a coincidence).
  A 5-night stay that never gets promoted (abandoned cart) has its TTL sweep release night 1 only;
  nights 2–5 stay `booked_count+1` **forever** — permanently leaked inventory with no code path to
  recover it, the exact shape of the already-documented §18b defect (`vendor_availability_slots.booked_count`
  destroyed with "no code path in the repo to return it").
- **§15/§17 machinery that already works and needs zero change for a stay:** `stampAuthorization`,
  `promotePaidCheckout`, the TTL sweep's Layer-1/Layer-2 logic, the daily reconciliation job. All of
  them operate on `service_bookings` rows keyed by id/PaymentIntent/idempotency-key — a stay booking
  is an ordinary row in that same table with a `bookingDetails` payload, invisible as a special case
  to any of them.
- **Migration registry tail**: `server/migrations/migration-files.ts` ends at
  `"212_session_async_service_fields.sql"` — next free number is **213**.

---

## Candidate mechanisms

### (a) Materialize nights into `vendor_availability_slots` — ALREADY THE LIVE MECHANISM
Extend the proven claim path rather than build a new one.
- **TTL sweep**: unchanged mechanism, **fixed to release the full night set** (see Recommendation).
- **Void return**: same fix — one shared helper, not three copies of the same bug.
- **§17 drift job**: sees stay bookings automatically (ordinary `service_bookings` rows); no change.
- **Schema**: zero new tables. One optional provenance column (below).
- **Cart carriage**: already solved — `contentMeta.{checkIn, checkOut}`, live in production.
- **Client calendar**: `GET /api/vendor-availability/:serviceId` already exists, public, unauthenticated
  — but returns **raw** rows (`bookedCount`, `providerId`, internal `pricing`/`discounts`/
  `cancellationPolicy`) rather than a redacted per-night `{date, available, nightlyRate}` shape.

### (b) Booked-units counter on `service_date_ranges` + overlap-checking conditional
A second claim machine beside the proven one — the §18c "no second unaudited writer on inventory"
concern. Range-overlap arithmetic under concurrency is genuinely subtle: `WHERE booked_units +
<requested> <= capacity` is race-safe for one row, but a stay spanning **two adjacent ranges** has
no single row to condition against — a booking-time edge case (a) never has (each night is
independent). TTL sweep and drift job would both need a **second** reclaim/detection path. Rejected.

### (c) `stay_nights` child claim table (one row per night per booking)
Cleanest **modeling** of "a stay is N atomic night-claims," and its UNIQUE constraints could do the
concurrency work directly. But it duplicates what `vendor_availability_slots` already is (a
claimable, capacity-bearing, date-keyed row) under a different name, forks the sweep/drift logic a
second time, and discards the working, shipped, tested claim machine for no capability gain — (a)
already gives per-night atomicity via the existing slot rows. Rejected as strictly more schema and
code for guarantees (a) already has.

### Trade table

| | (a) materialize into slots | (b) range counter | (c) stay_nights table |
|---|---|---|---|
| Claim machine | **Reuses proven `bookSlot`** | New, second machine (§18c) | New, second machine |
| TTL sweep | Same table, needs the release-all-nights fix (owed regardless) | New sweep logic | New sweep logic |
| Drift job (§17) | Sees it for free | Needs new coverage | Needs new coverage |
| New schema | 0 tables, 1 optional column | 1 counter column + overlap logic | 1 new table |
| Range-spanning stay | Trivial — each night independent | Hard — no single row to condition on | Trivial |
| Risk | NULL-`start_time` collision landmine (must fix) | Overlap races (unproven) | Duplicate machinery |

**Recommendation: (a), extended and repaired — not re-designed.**

---

## Recommendation (migration 213)

### DDL
```sql
-- Migration 213: S11 stay-booking provenance marker (Wave 3, CLAUDE.md §14/§15/§18b).
-- Additive nullable, NO DB CHECK (app-enforced vocabulary — 'pattern' | 'date_range' | NULL=manual,
-- the migration-181/195 posture). Lets the date-range materializer distinguish an authored night
-- from a manually-created or already-booked one before ever touching it (the exact repair the S7
-- ledger row 103 FILED note asked for, extended here to cover date-ranges too), and lets a future
-- range price-edit re-price only the nights IT authored and that are still unbooked.
ALTER TABLE vendor_availability_slots
  ADD COLUMN IF NOT EXISTS materialized_from varchar(20);
```
Declared in `shared/schema.ts` beside `vendorAvailabilitySlots` in the same commit (publish-trap
rule). No CHECK, no preflight script required (only CHECK/UNIQUE additions need one).

No change to `service_date_ranges` (S7, migration 210) — its shape is already correct for this use
(`nightlyPrice` nullable-inherits, `capacity` = units). No new table; no cart-schema change
(`contentMeta.{checkIn,checkOut}` already carries the stay).

### Materializer extension (code, not schema)
`materializeDateRangeAvailability(serviceId)`, a sibling of `materializeServiceAvailability`, same
file:
- Reads `service_date_ranges` for the service; **no rolling window** — a range is already bounded
  by its own `start_date`/`end_date` (unlike a weekly pattern, which is unbounded and needs one).
  Cap total nights per call at 730 (2 years) to bound a mistaken/malicious multi-decade range —
  reject at the write rail (400), not silently truncate (§13).
- For each night in each range: `INSERT … ON CONFLICT (service_id, date, start_time) DO NOTHING`
  against the **same migration-210 index**, with **`start_time` set to a fixed sentinel `'00:00'`**
  — never NULL. This closes the NULL-collision landmine directly: a non-null sentinel makes the
  existing unique index behave exactly as the ADD-ONLY contract requires (re-materialize is a true
  no-op; two overlapping ranges collide honestly instead of silently doubling inventory).
- `capacity = range.capacity`; `pricing = {nightlyRate: range.nightlyPrice}` when `nightlyPrice` is
  non-null, else `{}` (the S7-Q4 inherit-from-`provider_services.price` case — leave the fallback to
  read time, never bake a possibly-stale flat price into the snapshot for the inherit case).
  `materialized_from = 'date_range'`.
- **Never overwrites** an existing row regardless of source (manual, pattern, booked) — identical
  ADD-ONLY discipline to the pattern materializer, same file, same header comment inherited.
- Triggered at the existing `PUT /api/provider/services/:id/date-ranges` save (mirrors the
  pattern/blackout trigger already wired in S7) — no new endpoint needed for authoring.
- **Price-edit propagation** (open question below): recommend a companion `WHERE booked_count = 0
  AND materialized_from = 'date_range'` re-price pass scoped to the touched date span on every
  `date-ranges` save, so a provider's price correction is honestly reflected pre-booking and never
  touches a slot that is already claimed.

### §14 charge derivation — the actual fix that makes `nightly_price` real
`resolveItemBaseAmount` (payments.routes.ts:289–294) currently prices a stay as `service.price ×
nights`, ignoring any materialized per-night rate. Replace with a **new shared preload+resolve
function** on the **B1 travel-surcharge precedent** (`resolveCartSurcharges`, :302–323 — "ONE
preload+resolve pass … so the amount quoted and the amount charged can never disagree"):
`resolveStayNightlyRates(cartData)` — one query per cart batch, `SELECT date, pricing FROM
vendor_availability_slots WHERE service_id IN (...) AND date IN (...)`, returns a Map keyed by cart
item id to `{perNight: number[], total: number}`, summing each night's own
`pricing.nightlyRate ?? provider_services.price` (never a client-supplied number, §14). Called
**once**, by every quoting surface (`GET /api/cart`, `GET /api/cart/fee-preview`) and by checkout's
charge computation — the same function, so a quote and a charge can never diverge, exactly the B1
discipline. A night with no materialized row (a manually-created slot with no range/no snapshot)
falls back to `provider_services.price`, byte-identical to today's behavior — no regression for
existing property listings that never adopt `service_date_ranges`.

### §15b/§18b — the release-all-nights fix (must ship with S11, not optional)
One shared helper, e.g. `storage.releaseBookingSlots(bookingId | row)`, called by all three sites
instead of each re-deriving a single `slotId` release:
- At claim time, checkout already holds `claimedThisStay` (:993) — snapshot the **full** array as
  `bookingDetails.stayNightSlotIds` (jsonb, no migration) alongside the existing single `slotId`
  stamp (kept for backward-compat / non-stay bookings, byte-identical for every non-stay row).
- The shared helper: if `bookingDetails.stayNightSlotIds` is present, release **every** id in it
  (each release still the existing floor-at-0/reopen-if-under-capacity `UPDATE`, just looped); else
  fall back to the single `slotId` — the exact behavior every non-stay booking has today.
- `voidClaim`, `refundServiceBooking`, and `updateServiceBookingStatus`'s first-cancellation branch
  all call this ONE helper instead of their own inline single-slot `UPDATE` — closing the
  "copied three times" duplication named in Current State and honoring §15c rule 1 ("derivation
  delegates — never re-implements").
- This is a genuine bug fix with no dependency on `service_date_ranges` at all — it applies to the
  PROPERTY rung's existing multi-night claims today, before any date-range materializer exists, and
  should land regardless of the rest of this proposal's disposition.

### Traveler-facing calendar (public read)
New: `GET /api/services/:id/stay-availability?checkIn=&checkOut=` (or a `?nights=N` window scan),
returning **only** `[{date, available: boolean, nightlyRate: number | null}]` — never
`bookedCount`/`capacity`/`providerId`/internal `pricing` keys, mirroring the T-REP-lane read-strip
precedent (ledger row 101). The existing `GET /api/vendor-availability/:serviceId` stays as-is for
provider/internal callers (it is already public and unauthenticated, but that is out of S11's scope
to re-gate — flagged, not fixed, see Negative Space).

---

## §14/§15/§17/§18 obligations, clause by clause

- **§14 (server-derived amount)**: `resolveStayNightlyRates` reads only persisted
  `vendor_availability_slots.pricing`/`provider_services.price`; `req.body` never supplies a
  per-night or total amount (unchanged — the cart already only carries dates).
- **§15 (atomic claim, no TOCTOU)**: unchanged — still `storage.bookSlot`'s conditional `UPDATE …
  WHERE booked_count < capacity`, still all-or-nothing via the existing
  `claimedThisStay`/`releaseClaimed` compensation loop.
- **§15b (claim ≠ commitment, TTL reclaim)**: unchanged spine; the release-all-nights fix is a
  **completeness** fix to the existing void/refund/cancel release, not a new state machine —
  `status='payment_pending' AND stripe_payment_intent_id IS NULL` remains the unauthorized-claim
  predicate, unmodified.
- **§15c (one promotion, two callers)**: no change — `promotePaidCheckout` promotes a stay booking
  exactly as any other `service_bookings` row; it never inspects `pricingUnit` or `bookingDetails`
  stay fields.
- **§17 (drift detection)**: no change required — the daily job's `SUM(total_amount +
  platform_fee)` check already covers a stay row, since the charge is written into the same
  columns as every other booking, before Stripe is ever called.
- **§18 (rate never client-settable)**: `service_date_ranges.nightly_price` is provider-authored
  config exactly like `price` (S7-Q4's own framing), not a client-settable checkout rate.
  `check-money-endpoints.cjs`'s existing rate predicate needs no extension.
- **§18b (owner rail may not move a provisional claim)**: unaffected — the from-state allow-list
  and atomic conditional on `PATCH /api/provider|expert/bookings/:id/status` govern a stay booking
  identically to any other; the release-all-nights fix sits downstream of that guard.

---

## Open questions for the decision-maker (each carries a recommendation)

1. **Materialization scope: whole range, or a window?** Recommend **whole range** (bounded by its
   own `start_date`/`end_date`, no rolling-window concept needed) with a 730-night per-range cap
   enforced at the write rail. A range is finite by construction — unlike a weekly pattern, there is
   no "how far ahead" question.
2. **Sentinel `start_time` value for date-range nights.** Recommend `'00:00'` — matches the "date,
   not time" semantics of a night stay, is non-null (closes the collision landmine), and needs no
   new index (the migration-210 index already covers it once the value is non-null).
3. **Provenance column (`materialized_from`) — build now, or defer?** Recommend build now
   (migration 213) — it is what makes a future range price-edit and a future stale-slot cleanup
   pass (the ledger-103 filed item, now generalized to cover date-ranges too) possible without
   guessing whether a night was manually authored or materializer-authored.
4. **Price-edit propagation to already-materialized, unbooked nights.** Recommend yes — a
   `date-ranges` save re-prices `WHERE booked_count = 0 AND materialized_from = 'date_range'` rows
   in the touched span, never touching a claimed/booked one (§18b posture: booked inventory is never
   silently altered).
5. **Release-all-nights fix: land inside S11, or as its own independent hotfix first?** Recommend
   independent hotfix first (it is a real bug against the ALREADY-SHIPPED PROPERTY rung, with no
   dependency on anything in this proposal) — but it must land no later than S11, since S11 would
   otherwise multiply the leaked-inventory blast radius by making stays easier to publish at scale.
6. **Public calendar endpoint: new redacted route, or accept the existing raw
   `/api/vendor-availability/:serviceId` as the traveler-facing surface?** Recommend the new
   redacted route — the existing one is provider/internal-shaped (exposes `bookedCount`,
   `providerId`) and was never a traveler-facing contract; building a second consumer on top of it
   would bake that leak in as a de facto public API.

---

## Negative space (S11 does NOT touch)

- **The slot claim machine's semantics** — `storage.bookSlot`/`releaseSlot`'s atomic conditional
  `UPDATE`, the TTL sweep's Layer-1/Layer-2 decision logic, `stampAuthorization`, and
  `promotePaidCheckout` are all reused byte-for-byte. This proposal adds a caller (the release-all-
  nights helper) and a data source (materialized date-range nights); it adds no new state and no
  new promotion/void code path.
- **The legacy `bookings` rail** — untouched; stays are a cart-checkout-only feature, same as every
  other S7–S10 lane.
- **Fee/commission resolution (§8)** — no rate literal, no new fee band; a stay's `platformFee` is
  computed by the same existing resolver every other line item uses, over the same
  `resolveStayNightlyRates`-derived base amount.
- **`service_availability_patterns`/blackouts and their materializer** — unmodified; this proposal
  adds a sibling function for date-ranges beside it, not a change to it.
- **The existing single-slot manual CRUD** (`POST/PATCH/DELETE /api/provider/availability`) —
  unmodified; a provider may still hand-create one night at a time exactly as today, and existing
  manually-created rows (whatever `start_time` value they carry) are never touched or migrated.
- **`GET /api/vendor-availability/:serviceId`'s existing (public, unauthenticated, raw-row) shape**
  — flagged in Open Question 6, not fixed here; re-gating or redacting it is a separate decision.
- **Deposits/partial payment (Lane 7)** — a stay booking rides the same deposit/balance columns and
  promotion path as any other `service_bookings` row with zero special-casing needed.
- **Cancellation policy, refund percentage math** — unaffected; only the slot-release *count* (all
  nights vs. one) changes inside `refundServiceBooking`, never the refund amount logic.
