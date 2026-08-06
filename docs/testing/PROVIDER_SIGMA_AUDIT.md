# PROVIDER_SIGMA_AUDIT — Service Provider Console Sigma Test Lane · Phase 0

**Lane:** `provider-sigma-test` · **Branch:** `lane/provider-sigma-test`
**audited@d4f59bb7** (`d4f59bb7588e8b2c071c42825d6cf6b15967a28d`, main, 2026-08-06 — merge of PR #435, ruling 40)
**Brief:** `docs/planning/PROVIDER_SIGMA_BRIEF.md` (transcribed verbatim from the 2026-08-06 dispatch)
**Precedent mirrored:** `docs/testing/CONSOLE_SIGMA_AUDIT.md`
**Mode:** read-only. No code changes, no DB writes, no state-mutating requests, no live requests of any kind. Static
tracing plus repository-local guard/compiler runs only. **No IDOR probe was confirmed by a write** — every access claim
below rests on reading the gate, never on exercising it.
**Environment note (limits this audit — see Q8):** `DATABASE_URL` is **unset in this worktree**, so the DEV DB was
**not reachable**. Console-sigma's §0.7 fixture table was built from live DEV reads; the §E inventory below is therefore
derived from **seeder source code**, and every live-state claim is marked `UNVERIFIED (no DB)`.

**Headline.** Two findings are materially worse than the brief anticipated, and both are on real money:
**(1)** `provider_services.revenueShareRate` is a **client-settable commission split** that overrides the `fee_bands`
resolver at the actual `/api/checkout` charge (MI-1); **(2)** a provider's own "accept" button can flip a **provisional,
unauthorized checkout claim to `confirmed`**, which permanently strands the claimed slot because ruling 38's TTL sweep
can no longer match the row (SD-1). Separately, the brief's **dual-rate model does not exist in code at all** — not just
the repeat-pair rails rate: there is **no `rails` fee band**, and the checkout explicitly declares `acquisitionRef` an
analytics dimension "never read into any fee/amount/payout decision" (MI-4). Spec decay ran as predicted: **6 of 11**
checkable spec/doc claims are stale (§7).

---

## 0.1 Ground-truth re-pin

- `main` SHA at audit time: **`d4f59bb7`**. Every `file:line` below is against this SHA.
- Guard/compiler state at this SHA: **tsc = 197** (ratchet `TSC_BASELINE: '197'`, `.github/workflows/build.yml:51`) —
  **HOLDS exactly**. `scripts/check-money-endpoints.cjs` PASS · `scripts/check-claims-only-user-lookups.cjs` PASS ·
  `scripts/phase2-fee-gate.sh` PASS. **All three passes are true and two are misleading** — see MI-3 and AC-2.

## 0.2 Provider surface inventory (routes → gate → scoping)

Client routes are all `<ProtectedRoute requiredRole="provider">` (`client/src/App.tsx:783-880`), where `"provider"` is
the **client routing token** resolved by `userHasRequiredRole` → `isProviderRole` (`client/src/lib/role-utils.ts:18`) —
correct per `shared/roles.ts:16-17`.

| # | Endpoint | Handler | Auth gate | Ownership scoping | Gate shape |
|---|---|---|---|---|---|
| 1 | GET/PATCH `/api/provider/settings` | `provider.routes.ts:72,103` | `isAuthenticated` + `requireProviderRole` (DB role lookup, `:41-56`) | self (`userId` unique) | **canonical-ish** (local helper, DB lookup) |
| 2 | POST/GET/PATCH/DELETE `/api/provider/bundles` | `provider.routes.ts:203,248,292,384` | same | `existing.userId !== userId → 404` | bespoke, **404 idiom (no existence leak)** |
| 3 | POST/GET/PATCH/DELETE `/api/provider/properties` | `provider.routes.ts:500,576,608,646` | same | `existing.userId !== userId → 404` | bespoke, 404 idiom |
| 4 | POST/PATCH/DELETE `/api/provider/rooms`, `…/:id/rooms` | `provider.routes.ts:668,729,776` | same | `existing.userId !== userId → 404` | bespoke, 404 idiom |
| 5 | POST/GET/PATCH/DELETE `/api/provider/services` | `routes.ts:2068,2033,2214,2331` | `isAuthenticated` + `isEarner` prefix gate (`routes.ts:594-606`) | `getProviderServices(userId)` then `find(id)` → 404 | bespoke, 404 idiom |
| 6 | GET `/api/provider/bookings` | `routes.ts:4383` | `isAuthenticated` **only** — *not* in `PROVIDER_SELF_SERVICE_PREFIXES* (`routes.ts:580-586`) | `getServiceBookings({providerId: userId})` | scoping-only; **`claims.role` read (AC-2)** |
| 7 | PATCH `/api/provider/bookings/:id/status` | `routes.ts:4686` → `handleOwnerBookingStatus:4627` | `isAuthenticated` only | `booking.providerId !== userId → 404` | bespoke, 404 idiom; **no from-state guard (SD-1)** |
| 8 | GET `/api/provider/dashboard`, `/analytics/dashboard` | `routes.ts` | `isAuthenticated` + `isProvider` prefix gate | self | prefix middleware |
| 9 | GET/POST/PATCH/DELETE `/api/provider/availability` | `routes.ts:6617,6636,6664,6688` | `isAuthenticated` | `existingSlot.providerId !== userId → 403` | bespoke, **403 after 404 → existence leak (AC-3)** |
| 10 | **POST `/api/vendor-availability/:id/book`** | `routes.ts:6701` | `isAuthenticated` | **NONE** | **no gate at all (AC-1)** |
| 11 | GET `/api/me/calendar` | `calendar.routes.ts:79` | `isAuthenticated` | `providerId = userId` / `slot.providerId = userId` | canonical, session-scoped |
| 12 | GET `/api/me/customers` | `customers.routes.ts` | `isAuthenticated` | self-scoped over own bookings | canonical |
| 13 | POST/GET `/api/short-links` | `short-links.routes.ts:54,187` | `isAuthenticated` | `row.userId !== userId → 403`; list `eq(ownerUserId, userId)` | bespoke, 403 |
| 14 | POST `/api/payouts/request`, GET `/api/payouts` | `payments.routes.ts:1300,1373` | `isAuthenticated` + `isProviderRole \|\| isExpertRole` | session-derived only, **no id input at all** | canonical |
| 15 | GET `/api/provider/earnings/summary`, `/api/provider/booking-requests` | `experts.routes.ts` | `isAuthenticated` + inline role check | `storage.*(userId)` | bespoke; **router IS mounted — see SD-4** |
| 16 | GET/POST `/api/provider/verification-status`, `/request-verification-review` | `routes.ts` | `isAuthenticated` + `isProvider` prefix | self | prefix middleware |

**Bespoke-gate inventory (§A.1 — inventory, do not fix).** Provider-side has **no** canonical assignment helper
equivalent to the expert side's `getTripRole`. Every ownership decision is a hand-written `row.<ownerCol> !== userId`
comparison in the handler. Count: **13 distinct bespoke comparison sites** across rows 2-9 and 13. Two idioms coexist —
the **404 idiom** (rows 2-7, no existence leak, matches `provider.routes.ts:300-301`'s stated intent) and the **403
idiom** (rows 9, 13). `requireProviderRole` (`provider.routes.ts:41`) is the closest thing to a canonical helper and is
used only by `provider.routes.ts`. This is the same class console-sigma inventoried expert-side.

## 0.3 §A.2 — the ROUTING_STATE_CONTRACT **NEVER** row, both directions

`ROUTING_STATE_CONTRACT.md:38` declares **Provider back-office = NEVER** across all four routing states.
`routing_status` lives on `itinerary_items` (`shared/schema.ts:3325`). Static trace, both directions:

- **Read direction — HOLDS.** No provider-facing serializer references `routingStatus`/`routing_status`:
  `provider.routes.ts`, `calendar.routes.ts`, `customers.routes.ts`, `short-links.routes.ts` — **zero hits**. The
  provider payloads are built from `provider_services`, `service_bookings`, `vendor_availability_slots`,
  `provider_payouts`, `ready_made_purchases` — none of which carry the column.
- **Write direction — HOLDS.** The complete writer set is `trip-plan.service.ts`, `optimizer-baseline.service.ts`,
  `cart-projection.service.ts`, `item-routing.service.ts`, `storage.ts`, `booking-actions.ts`, `ready-made.routes.ts`,
  `plancard.routes.ts`, `routing.routes.ts`. **No provider endpoint appears in that set.** The one adjacency is
  `markItemPurchased`, reached from `promoteAuthorizedCheckout`/`promotePaidCheckout` — the **checkout** component,
  which the contract names as the sole forward writer (`ROUTING_STATE_CONTRACT.md:29`), not the provider.

**Verdict: expected-PASS, both directions.** This is the cleanest area of the audit.

## 0.4 §A.3 — the always-false `role === "provider"` class

`shared/roles.ts:19-22` records that seven always-false comparisons once existed, "including commission routing that
silently sent every provider-owned booking through the expert split". Re-verified at `d4f59bb7`:

- **Fix HOLDS on every live decision path.** `routes.ts:1396` (`ownerIsProvider = isProviderRole(ownerRole)`, the
  commission-routing site named in the module header) and `routes.ts:5472` both use the canonical helper.
  `provider.routes.ts:51` checks `"service_provider"` with an explicit ground-truth comment (`:48-50`).
  `middleware/role-rbac.ts:89` uses `isProviderRole`.
- **Two harmless residues** (defensive disjunctions — the always-false clause is ORed with the correct one, so
  behaviour is right): `experts.routes.ts:453,480,519,535` (`role !== "provider" && role !== "service_provider" &&
  role !== "admin"`) and `storefront.routes.ts:432` (`isProviderRole(me.role) || me.role === "provider"`).
- **One live-but-fail-closed instance** — see **AC-2** below (`routes.ts:4385`).

**Verdict: expected-PASS regression, with AC-2 recorded separately.** Fixing commit for the class:
`shared/roles.ts` (role-vocabulary audit, Jul 27 2026) — cited per ruling 20.

---

## 1. Findings — console-sigma taxonomy

### MONEY_INTEGRITY

**MI-1 — `revenueShareRate` is a client-settable commission split that overrides `fee_bands` at the real charge. (CRITICAL)**

The chain, entirely static:

1. `provider_services.revenueShareRate` is a real money column — `decimal(4,2) default "0.75"` (`shared/schema.ts:704`).
2. `insertProviderServiceSchema` omits `id, userId, formStatus, bookingsCount, totalRevenue, averageRating,
   reviewCount, createdAt, updatedAt` — **`revenueShareRate` is NOT omitted** (`shared/schema.ts:1539`).
3. `POST /api/provider/services` parses with that schema and spreads the result:
   `storage.createProviderService({ ...input, ...locationPatch, userId })` (`routes.ts:2078, 2126`).
4. `createProviderService` clamps **only** `approvalStatus` and `serviceOfferingTypeId`, then spreads the rest:
   `.values({ ...service, approvalStatus: bornApprovalStatus, serviceOfferingTypeId, trackingNumber })`
   (`storage.ts:1186-1201`). **`revenueShareRate` passes through.**
5. `PATCH /api/provider/services/:id` parses `insertProviderServiceSchema.partial()` and strips only `userId` at the
   route (`routes.ts:2229, 2278`); `updateProviderService` strips `approvalStatus, submittedAt, reviewedAt, reviewedBy,
   rejectionReason, userId` (`storage.ts:1230-1233`). **`revenueShareRate` is in neither strip list.**
6. The value is then the **final override** over the `fee_bands`-resolved split at three consumption sites — including
   the one that builds the Stripe charge:
   - `payments.routes.ts:826` — `POST /api/checkout`, per-item: *"Per-service revenueShareRate is the final override
     (takes priority over config)"* (`:825`); also `:877`, `:1090`.
   - `routes.ts:1408-1412` — booking-create commission split.
   - `routes.ts:5479` — cart-summary quote.
7. The clamp is range-only: `safeParseRate` accepts any finite value in **[0,1]** (`payments.routes.ts:747-750`);
   `safeRate` likewise (`routes.ts:5431`). **`1.00` is accepted** ⇒ provider share 100 %, platform fee `0.00`.
8. **No UI path sends it** — `revenueShareRate` appears in **zero** client files under `client/src/components/ServiceForm.tsx`
   or `client/src/pages/provider/*`. It is reachable only by a crafted request: the mass-assignment shape exactly.

**Why the guards miss it.** `scripts/check-money-endpoints.cjs` implements §14 by grepping for
`req.body.amount` / `price` / `userId` reaching a money decision. `revenueShareRate` is a **rate**, not an amount, price
or identity — outside the predicate. The guard passes truthfully and the hole is real.

**Classification.** This is a §14 violation in substance (a client-supplied value reaching a payment decision) and a §8
violation in spirit (a commission rate resolved from somewhere other than `fee_bands`) — arguably worse than a literal,
since a literal is at least fixed and reviewable. Filed as **`fee-literal-debt:#PENDING-PS1`** per ruling 32.
**Not fixed here** (brief §4: no MONEY_INTEGRITY fix in this lane).

**MI-2 — Unannotated fee-rate literals on the provider completion money path.**

`server/services/commission.ts` exports four rate constants, of which three carry **no** `fee-literal-ok` annotation and
none is backed by a `fee_bands` row:

| Constant | Line | Value | Annotated? | Provider-path use |
|---|---|---|---|---|
| `PROCESSING_FEE_RATE` | `commission.ts:42` | `0.03` | **no** | **yes** — `storage.ts:1659` computes `netAmount`/`processingFees` on the `platform_revenue` row minted by the provider **completion flip**; also `revenue-tracking.service.ts:85`, `ready-made-purchase.service.ts:150`, `booking.service.ts:745-746` |
| `AFFILIATE_PLATFORM_FEE` | `commission.ts:38` | `0.70` | **no** | affiliate split (console-sigma §0.4 already recorded this) |
| `AFFILIATE_EXPERT_SHARE` | `commission.ts:39` | `0.30` | **no** | as above |
| `AI_PLATFORM_FEE` | `commission.ts:36` | `1.00` | **no** | documented as a structural invariant (`:33-35`), arguably legitimately not a band |
| `EXPERT_SHARE_RATE` / `PLATFORM_FEE_RATE` | `commission.ts:52-53` | `0.75` / `0.25` | **yes** (`fee-literal-ok`, ruling 25) | — |

`PROCESSING_FEE_RATE` is the provider-relevant one: it is a **margin rate on the platform-fee receipt**, applied on the
completion path this lane audits, and it lives outside `fee_bands` with no annotation and no admin editability.
Filed **`fee-literal-debt:#PENDING-PS2`** per ruling 32. **Not fixed here.**

**MI-3 — The fee-literal CI guard is case-sensitive and therefore blind to every SCREAMING_SNAKE fee constant. (guard-coverage)**

`scripts/phase2-fee-gate.sh` Pass B anchors on
`(fee|serviceFee|platformFee|commission|optimizeFee|coordinationFee|charge|marginRate)[A-Za-z]*[[:space:]]*[:=][[:space:]]*[0-9]`
(`:49`), run through `grep -rnE` — **without `-i`** (`:50`). Every identifier alternative is lowercase, so
`PROCESSING_FEE_RATE`, `AFFILIATE_PLATFORM_FEE`, `AI_PLATFORM_FEE` cannot match. Proven read-only, side by side:

```
case-SENSITIVE (the gate as written), server/services/commission.ts:
  520:  platformFeeRate: 1 - expertShareRate,   // fee-literal-ok  → 1 hit, already exempt

same regex + -i, same file:
  36:  export const AI_PLATFORM_FEE = 1.00;
  38:  export const AFFILIATE_PLATFORM_FEE = 0.70;
  42:  export const PROCESSING_FEE_RATE = 0.03;
```

SCREAMING_SNAKE is the codebase's **dominant** convention for fee constants, so the guard is blind to the majority of
what it exists to catch. Per ruling 27 the guard *is* a guard (it runs in CI, `build.yml`) — the defect is its
**predicate**, not its wiring. This is the same lesson rider (c) records from PR #435. Filed **`#PENDING-PS3`**.

**MI-4 — The dual-rate model does not exist in code. The gravity audit understated this: it is not only the repeat-pair rails rate that is unbuilt.**

The brief §C.7 asks to trace platform-sourced → full band vs. attributed short-link → **rails band**, "BOTH resolved
from `fee_bands` rows". Ground truth:

- **There is no `rails` band.** The complete seeded `fee_bands.band_key` set across every migration is
  `beta_flat, dining, expert_concierge_booking, expert_standard, platform_deposit, ready_made_trip, tiered,
  tip_handling`, plus `coordination_floor`/`coordination_percent` (migration 122) and `experience_cart_checkout`
  (migration 174). No rails/attribution band of any name.
- **`decideBandKey` has no attribution input.** Its opts are `{source, category, categoryCommissionBand}`
  (`commission.ts:200-203`); `source` is the *provider-vs-expert* discriminator, not the acquisition channel. There is
  no code path by which `acquisitionRef` can select a band.
- **The checkout explicitly forbids it.** `payments.routes.ts:575-577`: *"S4 acquisition attribution — vocabulary
  direct | link | cross_sell, DERIVED SERVER-SIDE… **Analytics dimension only: never read into any fee/amount/payout
  decision.**"* The attribution is resolved (`:580-593`) and written to `service_bookings.acquisitionRef` (`:968`),
  and stops there.
- `short-links.routes.ts:213-228` joins `short_links` → `service_bookings.acquisitionRef` purely for **attribution
  reporting**, scoped to the caller's own bookings.

**So the correct record is:** the dual-rate model is **spec-ahead-of-code in its entirety**, and the code carries an
explicit, deliberate contrary posture. `TRIP_GRAVITY_AUDIT_FINDINGS.md:114` recorded only the repeat-pair rate as
spec-ahead; the *whole* mechanism is. **Journey J12** (`JOURNEY_TEST_SUITE_BRIEF.md:62`) asserts
"commission resolves to rails band via fee_bands" — that journey **cannot pass** as written and must be rewritten or
deferred. Recorded, **not built** (brief §C.7). Surfaced as **Q4**.

**MI-5 — The completion money flip is check-then-act, not idempotent (§15).**

`storage.updateServiceBookingStatus` reads `prior` (`storage.ts:1618`), applies an **unconditional**
`UPDATE … WHERE id = ?` (`:1630-1633`), then gates side-effects on `isFirstCompletion = status === "completed" &&
priorStatus !== "completed"` (`:1638`). That is precisely the TOCTOU shape §15 names as "the bug, not a guard". Two
concurrent completions can both observe `priorStatus !== 'completed'` and both mint the full side-effect set:
`provider_services.totalRevenue` increment (`:1645-1648`), a `platform_revenue` row (`:1652-1667`), a
`provider_earnings` row **and** an `expert_earnings` row (`:1673-1694`). No Stripe idempotency key, no atomic
conditional. The same shape applies to the cancel branch's `bookingsCount` decrement (`:1701-1707`).
Mitigating: completion is traveler-initiated (`completed` is **not** in `OWNER_SETTABLE_BOOKING_STATUSES`,
`routes.ts:4626`), so this needs a double-submit rather than a hostile provider. **Filed `#PENDING-PS4`.**

**MI-6 (§C.10, the D6 class) — completion DOES trigger money events.** Answering the brief's "whether completion
triggers any credit/fee event": **yes, four** — service `totalRevenue`, a `platform_revenue` row, a `provider_earnings`
row (born `status:'held'` with `availableAt` per the escrow window), and a **second, parallel `expert_earnings` row for
the same provider** (`storage.ts:1688-1694`, "provider may be an expert"). The double-ledger write on one economic
event is worth a journey-matrix cell in its own right. Flagged for the matrix per brief §C.10; **not** adjudicated here.

### STATE_DIVERGENCE

**SD-1 — A provider's "accept" can promote an unauthorized provisional claim to `confirmed`, permanently stranding the claimed slot. (CRITICAL — §15b)**

`PATCH /api/provider/bookings/:id/status` (`routes.ts:4686` → `handleOwnerBookingStatus:4627`) checks exactly two
things: ownership (`booking.providerId !== userId → 404`, `:4631`) and that the **target** status is in
`OWNER_SETTABLE_BOOKING_STATUSES = ["confirmed","cancelled"]` (`:4626, 4635`). **It never inspects the booking's current
status.** It then calls `storage.updateServiceBookingStatus`, whose write is an unconditional
`UPDATE … WHERE id = ?` (`storage.ts:1630-1633`) that also stamps `confirmedAt` (`:1623`).

Post-#433 (ruling 38), `status='payment_pending' AND stripe_payment_intent_id IS NULL` **is** an unauthorized claim by
construction (CLAUDE.md §15b). Such rows are created **before** the Stripe call (`payments.routes.ts:968`), and they are
**visible to the provider**: `GET /api/provider/bookings` applies no default status filter (`routes.ts:4386-4387`), and
the provider calendar surfaces them (SD-3). So the sequence — traveler starts checkout → claim row written → provider
opens Inbox and clicks Accept — is reachable without any hostile intent.

Consequences, each traced to the exact predicate it breaks:

1. **§15b inverted.** `confirmed` is the PROMOTED state; it is reached with **no PaymentIntent and no authorization**.
   The row now asserts a completed purchase that no money backs.
2. **The TTL sweep can never reclaim it — the slot is stranded permanently.** `voidClaim`'s atomic conditional is
   `WHERE id = … AND status = 'payment_pending' AND stripe_payment_intent_id IS NULL`
   (`checkout-claim.service.ts:414-419`). Once status is `confirmed`, that matches **0 rows**, and the function returns
   `{voided:false, slotsReleased:0}` on the explicit "someone else won the race" branch (`:421-425`). The
   `vendor_availability_slots.booked_count` increment taken at claim time (`storage.ts:2498-2514`) is **never given
   back** — capacity is destroyed for good, with no code path to recover it.
3. **The late-signal path is defeated too.** `promotePaidCheckout`'s conditional is
   `WHERE status='payment_pending' AND stripe_payment_intent_id = <pi>` (CLAUDE.md §15c) — also 0 rows. If the traveler's
   payment *does* later succeed, neither the webhook nor the client fallback can promote it, because it is already
   `confirmed` by the wrong actor.
4. **Detection catches it — this is ruling 40 paying for itself.** The drift job's `booking_confirmed_no_pi`
   classification (ruling 40 / CLAUDE.md §17) is exactly this shape, so the row surfaces at
   `GET /api/admin/reconciliation/exceptions`. **Detection is not repair** (§17), and it does not release the slot.

The redundancy argument cuts the right way here: this is a case where the money-path layers hold (nothing is charged)
but the **inventory** layer does not. **Not fixed here.** Filed **`#PENDING-PS5`**. Surfaced as **Q1**.

**SD-2 — Provider cancel of a paid booking performs no refund.** The same handler accepts `status:"cancelled"` on a
`confirmed`, fully-paid booking. `updateServiceBookingStatus` sets `cancelledAt` + `cancellationReason` and decrements
`bookingsCount` (`storage.ts:1625-1628, 1701-1707`) — **no refund is issued, no `refunds` row is written, and
`itinerary_items.routing_status` is not reversed**, despite `ROUTING_STATE_CONTRACT.md:30` naming the refund path the
sole writer of the `purchased → in_planning` reversal. The traveler is left charged with a cancelled booking.
Detection sees it as `refund_not_reversed`'s mirror rather than the case itself. Filed **`#PENDING-PS6`**. Surfaced as **Q2**.

**SD-3 — The provider calendar renders every booking row as "Booked", including provisional and voided claims. (§C.8 fresh trace, part ii)**

`GET /api/me/calendar`'s inbound lane selects `service_bookings` filtered **only** by `providerId` and date window —
**no status predicate** (`calendar.routes.ts:153-168`) — and builds every event with the hardcoded title
`` `Booked · ${b.serviceName}` `` (`:176`). The row's real `status` is passed through in the payload (`:179`) but the
provider client **never renders it**: `client/src/pages/provider/calendar.tsx` declares `status?: string` on the event
type (`:48`) and uses it nowhere; the cell renders `e.title` styled by `e.lane` only (`:259`).

So on the provider's calendar, all four of these are pixel-identical:
a confirmed paid booking · a `payment_pending` provisional claim inside the 30-minute TTL window · a swept
`expired` claim (`CLAIM_EXPIRED_STATUS = "expired"`, `checkout-claim.service.ts:107`) · a `pending` request-rail row.

**The sweep's slot release itself is correct and DOES render** — the *availability* lane filters
`bookedCount < capacity` (`calendar.routes.ts:132`), so a slot consumed by a claim disappears from availability and
**reappears** when `voidClaim` decrements `booked_count` (`checkout-claim.service.ts:427-440`). The defect is confined
to the inbound lane: reclaimed inventory returns, but the phantom "Booked" event stays. CX-classified severity, but it
is the surface on which a provider would double-book or mis-plan. Filed **`#PENDING-PS7`**.

**SD-4 — CLAUDE.md §9 is STALE: `experts.routes.ts` is mounted, not dark.**

CLAUDE.md §9 states the router is "**imported-but-unmounted (dark)** except the two ported endpoints; ~24 endpoint
families are dead in production". Ground truth at `d4f59bb7`: **`app.use(expertsRoutes)` at `server/routes.ts:953`**,
with a comment recording the change (`:948-952`: *"Imported at line 98 but previously unmounted; mounting restores all
/api/expert/* and /api/provider/blackout-dates endpoints for live consumers"*).

**Independently corroborated by CI.** `scripts/check-unmounted-routers.cjs` (a ruling-27 in-CI guard) reports at this
SHA: *"37 imported route module(s), **37 mounted, 0 allow-listed dark**; 37 route file(s) on disk, none never-imported."*
There is no dark router on `main` at all — so §9's "dark" framing is not merely stale for `experts.routes.ts`, it is
stale as a general statement about the codebase.

This matters concretely for this lane: the provider console **calls two endpoints that live in that router** —
`/api/provider/earnings/summary` and `/api/provider/booking-requests` (consumed by `client/src/pages/provider/*`). Under
the §9 claim they would be dead (200-HTML via the Vite catch-all); in reality they are live. Note the mount is at line
**953**, i.e. **after** most inline registrations, so Express first-registered-wins still gives inline copies priority on
duplicated paths — the mount order is load-bearing and is documented as such for `tripsRoutes` (`:936-946`).
**Consequence for Phase 1:** the brief's inherited assumption that provider earnings/booking-requests are dark is wrong;
they need real assertions. Surfaced as **Q6**.

**SD-5 — CLAUDE.md §14's parenthetical is STALE.** §14 closes with *"(First catch on landing: the two dark
`payouts/request` handlers in `experts.routes.ts`… reviewed as safe withdrawals, annotated.)"* At `d4f59bb7` there is
**no `payouts/request` handler in `experts.routes.ts`** — the only ones are `payments.routes.ts:1300` (`POST`) and
`:1373` (`GET`), both live and both correct (see AP-1). Documentation drift only; no behavioural consequence.

### ABSENCE

**AB-1 — No diary row on ANY `service_bookings` status transition. (the console-sigma D1 class, uncovered for this table)**

Rulings 12/16/18 require the flip and its log entry to be an atomic pair for status transitions including the money
path. `storage.updateServiceBookingStatus` (`storage.ts:1616-1710`) writes status, timestamps, revenue rows, and
earnings rows — and **no `item_transition_log` row**. Searched scope: the full function body, `handleOwnerBookingStatus`
(`routes.ts:4627-4681`), and a repo-wide `item_transition_log` writer sweep.

**This is not already covered by #1028.** #1028 (console-sigma §9 D1, commit `45000861`) fixed
`storage.updateExpertAssignmentWorkspaceStatus` — a **different table** (`trip_expert_advisors.workspaceStatus`). The
checkout spine *does* diary (`checkout_claim_expired` per `voidClaim`, `checkout-claim.service.ts:447+`;
`checkout_reconcile_exception` per §15c), so `service_bookings` transitions are diaried **when the checkout machinery
moves them and never when a provider does**. The accept / cancel / complete transitions — every provider-initiated one,
including the one that mints earnings — are silent. **Cite #1028's pattern, do not duplicate it** (brief §C.10):
the fix is the same shape applied to a second table. Filed **`#PENDING-PS8`**. Expected-fail ABSENCE row for Phase 1,
tag `deferred:#PENDING-PS8` per ruling 21.

**AB-2 — Ruling 35 Layer 2 is absent for `provider_services` (single-layer). Cite #1042, do not fix.**

Ruling 35 requires **both** a CI schema gate (Layer 1) and a **DB initial-status DEFAULT + constraint rejecting
born-approved inserts** (Layer 2). Ground truth:

- **Layer 1 — present, and stronger than expected, at the STORAGE layer.** `createProviderService` clamps:
  `bornApprovalStatus = (service as any).approvalStatus === 'draft' ? 'draft' : 'submitted'`
  (`storage.ts:1186`) — an explicit `draft` is honoured, **everything else including a smuggled `'approved'` is forced
  to `'submitted'`**. `updateProviderService` strips `approvalStatus, submittedAt, reviewedAt, reviewedBy,
  rejectionReason` (`storage.ts:1230-1233`), placed in storage "so every caller is covered" (`:1227`).
  `provider.routes.ts` hardcodes `approvalStatus: "submitted"` on bundles (`:223`), properties (`:529`), property
  rooms (`:556, 701`).
- **Layer 2 — DEFAULT only, NO constraint.** Migration `111_*.sql` performs
  `ALTER TABLE provider_services ALTER COLUMN approval_status SET DEFAULT 'submitted'` and explicitly nothing else
  ("This changes the column DEFAULT only… no UPDATE over existing rows"). `shared/schema.ts:683` mirrors the DEFAULT.
  **No CHECK rejects an explicit born-`approved` INSERT** — a direct insert supplying `approval_status='approved'`
  succeeds at the DB.

Per ruling 35, single-layer is **a finding, not a fix in this lane** — the enforcement work is task **#1042**
(ruling 36). Recorded; scope respected.

**AB-3 — `scripts/invariants.mjs` exists but is not scheduled and not in CI. (rider b)**

`scripts/invariants.mjs` is present in the repo and appears in **no** workflow under `.github/workflows/` and in no
`package.json` script. Per ruling 27's sharpened definition (*"a script not wired into CI is not a guard — it is
MISSING"*), it is MISSING. Rider (b) files: **give it scheduled daily execution alongside the reconciliation job, with
output on the same exception surface, and record every run so that silence ≠ not-running** — the latter being exactly
ruling 40's rule 2 (`reconciliation_runs` writes a row even for a clean or skipped pass). Task id: **`#PENDING-PS9`**
(see the note on placeholder ids at the head of §5).

### ACCESS

**AC-1 — `POST /api/vendor-availability/:id/book` consumes any provider's slot capacity with no ownership check, no booking row, and no release path. (HIGH)**

```
routes.ts:6701   app.post("/api/vendor-availability/:id/book", isAuthenticated, async (req, res) => {
routes.ts:6703     const slot = await storage.bookSlot(req.params.id);
routes.ts:6704     if (!slot) return res.status(404).json({ message: "Slot not found" });
routes.ts:6705     res.json(slot);
```

That is the entire handler. `isAuthenticated` is the only gate. There is **no** check that the caller owns the slot, is
the traveler on any booking, or has paid anything; `bookSlot` unconditionally increments `booked_count` and flips the
slot to `fully_booked` at capacity (`storage.ts:2498-2514`). **No booking row is created**, so:

- the slot is consumed with nothing linking it to a purchase;
- the TTL sweep cannot reclaim it — the sweep iterates **provisional `service_bookings` rows** and releases
  `row.slotId` (`checkout-claim.service.ts:426-440`); with no row, there is nothing to sweep;
- `releaseSlot` (`storage.ts:2518`) has **no caller reachable from this endpoint**.

Any authenticated account can therefore silently exhaust a competitor's bookable inventory, and **the effect is
irreversible without manual DB intervention.** The endpoint has **zero client consumers** (`vendor-availability` appears
nowhere under `client/src`) — it is dead to the UI and live to the network, which is why it has escaped notice.

**Read-only discipline observed:** this finding rests entirely on reading the handler and `bookSlot`. **The endpoint was
not called.** Per brief §4, an IDOR is proven by reading the gate, never by exercising it — and here exercising it would
have destroyed real dev inventory with no release path, which is precisely why the rule exists.

Filed **`#PENDING-PS10`**. Surfaced as **Q3**.

**AC-2 — `/api/provider/bookings` reads a session-cached `claims.role` and defaults to the always-false `'provider'` token; `ROLE_PERMISSIONS` is a divergent hand-written role list. (fail-closed)**

`routes.ts:4385`: `const userRole = (req.user as any).claims.role || 'provider';` — feeding
`sanitizeBookingForExpert(booking, userRole, userId)` and `sanitizeUserForRole(traveler, userRole, false)`
(`:4393, 4395`). Three distinct problems, none currently a leak:

1. **Session snapshot, not a DB read.** `claims.role` is stamped at login (`emailAuth.ts:141-147, 243-249`) and never
   refreshed, so a provider approved *after* their session began carries a stale role until re-login. Contrast the
   ratified admin posture (CLAUDE.md §2: "DB role lookup on the session") and `requireProviderRole`
   (`provider.routes.ts:47`), both of which read the DB.
2. **`|| 'provider'` is the always-false token** (`shared/roles.ts:8`) — but here it is used as a
   **`ROLE_PERMISSIONS` key**, where `provider` *is* a valid key (`data-sanitizer.ts:31`), so it coincidentally works.
3. **`ROLE_PERMISSIONS` is a fork.** Its keys are `admin, executive_assistant, expert, provider, user`
   (`data-sanitizer.ts:15-44`) — the **client routing tokens**, not the stored vocabulary. So for a real provider
   (`service_provider`) or any expert-family role (`local_expert`, `travel_expert`, `event_planner`), the lookup misses
   and falls to `ROLE_PERMISSIONS.user` (`:99, 152`). `shared/roles.ts:22` states plainly: *"a new hand-written role
   list is a defect."*

**Fail-closed, hence not a leak:** the `provider` and `user` entries have identical `allowedFields`, and the fallback is
the more restrictive of the two. **Not covered by the claims guard** —
`scripts/check-claims-only-user-lookups.cjs` is scoped to `claims.sub` *identity* reads (`:11-18`); a `claims.role`
read is outside its predicate (the same predicate-coverage lesson as MI-3 and rider (c)). Filed **`#PENDING-PS11`**.

**AC-3 — 403-after-404 existence leak on availability slots.** `routes.ts:6674-6675` and `:6691-6692` return `404`
when the slot is missing but `403` when it exists and belongs to someone else — so a caller can enumerate valid slot ids
across providers by response code. The provider/bundle/property/room endpoints use the non-leaking 404-for-both idiom
(`provider.routes.ts:300-303` documents it explicitly). Inconsistency, low severity. Filed **`#PENDING-PS12`**.

**AC-4 — `/api/provider/bookings` and `…/:id/status` carry no role gate.** Neither path is in
`PROVIDER_SELF_SERVICE_PREFIXES` (`routes.ts:580-586`), so `isProvider` never runs; the only protection is
`isAuthenticated` plus `providerId`/ownership scoping. **Booking-scoped visibility is nonetheless correct** — a
non-provider authenticated caller matches zero rows. Recorded as gate-shape inventory, not a defect.

### CX

**CX-1 — The six-station shell decision is STALE. The provider console has nine modules in three groups.**

Brief: "Today · Work · Catalog · Calendar · Money · Grow; Today = mandatory landing, no tile-launcher."
Ground truth (`client/src/components/provider/provider-sidebar.tsx:43-99`, ratified as **"Console IA C9 (§17 17→9
collapse)"** in `client/src/App.tsx:775-782`):

| Group | Stations |
|---|---|
| **Work** | Today (`/provider/dashboard`) · Calendar · Inbox · Workstation |
| **Business** | Catalog (`/provider/services`) · Customers · Performance · Money (`/provider/money`) |
| **Account** | Settings |

- **"Work" is a GROUP LABEL, not a station** (`:43`).
- **"Grow" does not exist** anywhere in the console.
- **Nine destinations, not six.** `Inbox`, `Workstation`, `Customers`, `Performance`, `Settings` are all stations the
  six-station decision does not name.
- The C9 IA is itself a *ratified* decision (`App.tsx:775`), and it post-dates the six-station text. **Code is ground
  truth**, so the six-station decision is the stale document. Surfaced as **Q5** — this needs a ruling on which
  document governs before any Phase 1 shell pin is written.

**CX-2 — Today IS the landing and there is NO tile-launcher: expected-PASS.** `Today` is the first station
(`provider-sidebar.tsx:47`), routed to `/provider/dashboard`, described as the ops home in
`client/src/lib/role-routes-config.ts:100`. `client/src/pages/provider/dashboard.tsx` is 345 lines with a **single**
navigational `Link` (`:188`) — a content page, not a launcher grid. Retired seats redirect into the nine
(`/provider/bookings`→Inbox, `/provider/earnings`→Money, `/provider/analytics`→Performance, `/provider/profile`→Settings,
`/provider/share-promote`→Catalog, `/provider/messages`→`/chat`), so there are no orphan destinations.
**Caveat (UNVERIFIED):** no explicit post-login redirect to `/provider/dashboard` was found in `client/src` — the
landing is *conventional* (first sidebar item) rather than *enforced*. Worth one Phase 1 pin.

### Expected-PASS confirmations (regressions worth locking, ruling 20)

| ID | Claim re-verified at `d4f59bb7` | Evidence | Fixing commit / authority |
|---|---|---|---|
| AP-1 | Payout posture: amount **server-derived** from the earner's own cleared balance, never from the body; provider **cannot self-trigger a transfer** — the request lands `status:'pending'` for admin processing; one open request at a time (409); Stripe-Connect precondition surfaced up front | `payments.routes.ts:1300-1365`, esp. `:1342-1345` (`money-derive-ok`), `:1327-1338`, `:1358-1361` | §14/§15; MONEY_MAP F-7 |
| AP-2 | Payout history returns only the caller's own rows — **no id/userId input exists at all** | `payments.routes.ts:1373-1394` | task #142 |
| AP-3 | Provider "New Booking Request" notification + email fire **only after authorization** | `payments.routes.ts:447-481`, inside `promoteAuthorizedCheckout`; comment `:447-449` names the pre-#433 defect | **#433 / ruling 38** (§15b) |
| AP-4 | Slot claim is an **atomic conditional**, not check-then-update | `storage.ts:2496-2514` (C3, §15) | C3 |
| AP-5 | Sweep's slot release is atomic **inside the void transaction** and diaried; a lost race releases **nothing** | `checkout-claim.service.ts:399-441`, `:421-425` | ruling 38 |
| AP-6 | Provider **self-approval is impossible** on the update path — the approval-lifecycle fields are stripped in **storage**, so every caller is covered | `storage.ts:1219-1233`; found by `scripts/journeys/adversarial-money-access.mjs` case **C16b** | C16b |
| AP-7 | Born-approved impossible on create (Layer 1); smuggled `approvalStatus:'approved'` clamped to `'submitted'` | `storage.ts:1186`; `provider.routes.ts:223,529,556,701` | migration 111 / D1a |
| AP-8 | Bundle components must be the caller's **own, approved, active, non-bundle** services; owned-or-absent answered identically (no existence probe) | `provider.routes.ts:168-201` | §17 / F2 |
| AP-9 | A3 material-change rule: price/component/room-set changes to an **approved** listing re-enter review | `provider.routes.ts:321-337, 683, 751-759, 788-805` | A3 |
| AP-10 | ROUTING_STATE_CONTRACT **NEVER** row holds in **both** directions | §0.3 above | contract `:38` |
| AP-11 | `role === "provider"` always-false class fixed on every live decision path | §0.4 above | `shared/roles.ts` (Jul 27 2026) |
| AP-12 | Cross-provider IDOR gates present on services, bundles, properties, rooms, availability slots, short links, bookings | §0.2 table | — |
| AP-13 | Settings PATCH is a 7-field zod allow-list; ownership/identity columns never mass-assignable | `provider.routes.ts:60-70, 108` | — |
| AP-14 | Booking-scoped visibility: a provider reads only bookings for their own services | `routes.ts:4387`; `calendar.routes.ts:164`; `customers.routes.ts`; `short-links.routes.ts:223, 308` | audit S8 posture |

---

## 2. Expected-PASS / expected-fail split proposal (Phase 1)

**Expected-PASS (14 rows).** AP-1 … AP-14 above, each citing its fixing commit or authority per ruling 20. These are
exactly the regressions the harness exists to catch, and every one lands on a DB fact or a rejected write proven by an
unchanged fact.

**Expected-fail, with `deferred:` expiries per ruling 21 (8 rows).**

| ID | Class | Assertion (fails today, must flip when its fixer merges) | Expiry tag |
|---|---|---|---|
| EF-1 | MONEY_INTEGRITY | `POST/PATCH /api/provider/services` with `revenueShareRate:"1.00"` must not change the resolved split; assert the charge-side rate still equals the `fee_bands` row read from the DB | ~~`deferred:#PENDING-PS1`~~ **EXPIRED — flipped to expected-PASS by ruling 42; built as P1/P2** |
| EF-2 | STATE_DIVERGENCE | provider accept on a `payment_pending`/unstamped claim must be **rejected**, and the row + its slot must be unchanged | ~~`deferred:#PENDING-PS5`~~ **EXPIRED — flipped to expected-PASS by ruling 42; built as P3, with P4 (still-reclaimable) and P5 (single winner)** |
| EF-3 | STATE_DIVERGENCE | provider cancel of a paid booking must produce a refund row or be rejected | `deferred:#PENDING-PS6` |
| EF-4 | ABSENCE | every `service_bookings` status transition writes exactly one `item_transition_log` row (itemId per ruling 16, actor recorded) | `deferred:#PENDING-PS8` |
| EF-5 | ACCESS | ~~`POST /api/vendor-availability/:id/book` by a non-owner, non-purchaser must be rejected~~ **REWRITTEN — the endpoint no longer exists (ruling 42), so a rejection probe is meaningless. Replaced by the route-inventory assertion P6: no route registers it, and `storage.bookSlot` is still checkout's** | ~~`deferred:#PENDING-PS10`~~ **EXPIRED** |
| EF-6 | MONEY_INTEGRITY | (still expected-fail; the literal is now annotated `fee-literal-debt:#PS2` and REPORTED by the gate on every run) `PROCESSING_FEE_RATE` resolves from a `fee_bands` row; an admin band edit changes the resolved value and a missing band fails loudly (ruling 32's two required proofs) | `deferred:#PENDING-PS2` |
| EF-7 | MONEY_INTEGRITY | concurrent completion produces exactly ONE `provider_earnings` row and ONE `platform_revenue` row | `deferred:#PENDING-PS4` |
| EF-8 | CX | the calendar's inbound lane distinguishes provisional / expired / confirmed rather than titling all three "Booked" | `deferred:#PENDING-PS7` |

**Divergence pins per the R22 pattern (green = the divergence is present; the test FAILS the day the fix lands and must
then be flipped) (2 rows).**

| ID | Pinned fact |
|---|---|
| DP-1 | (ruling 45: J12 rewritten against this pin — `J12.1` asserts the identical-rate reality, `J12.2` carries the dual-rate steps as `deferred:provider-backoffice-p1`) **MI-4** — no `rails`/attribution band exists in `fee_bands` and `decideBandKey` accepts no attribution input, so an attributed and an unattributed booking of the same service resolve to the **identical** rate. Pins the dual-rate model as unbuilt. **Blocks journey J12 as written.** |
| DP-2 | **AB-2** — a direct DB insert with `approval_status='approved'` succeeds (Layer 2 absent), while every application path clamps (Layer 1 present). Pins ruling 35's single-layer state; flips when **#1042** lands. |

**Explicitly NOT absorbed** (brief §4): bespoke-gate consolidation (§0.2, 13 sites — inventoried only) · ruling-35 DB
layer (#1042) · repeat-pair rails build · every MONEY_INTEGRITY **fix** (tasks + `fee-literal-debt` annotations filed
instead) · shell remediation (CX-1).

---

## 3. §7 — Spec/doc claims that turned out STALE

Console-sigma found 4 of 6 stale; this lane finds **6 of 11**.

| # | Claim | Source | Verdict |
|---|---|---|---|
| 1 | Provider console = six stations (Today · Work · Catalog · Calendar · Money · Grow) | six-station shell decision, via brief §D.11 | **STALE** — nine modules, three groups; "Work" is a group label, "Grow" does not exist (CX-1) |
| 2 | `experts.routes.ts` is imported-but-unmounted (dark); ~24 families dead | CLAUDE.md §9 | **STALE** — `app.use(expertsRoutes)` at `routes.ts:953` (SD-4) |
| 3 | Two dark `payouts/request` handlers live in `experts.routes.ts` | CLAUDE.md §14 | **STALE** — they live in `payments.routes.ts:1300,1373` and are live (SD-5) |
| 4 | Dual-rate: attributed booking → **rails band**, both from `fee_bands` | brief §C.7 / provider back-office spec | **STALE (spec-ahead-of-code)** — no rails band, no attribution input to band selection, and checkout explicitly excludes attribution from fee decisions (MI-4) |
| 5 | Only the **repeat-pair rails rate** is spec-ahead-of-code | `TRIP_GRAVITY_AUDIT_FINDINGS.md:114` | **STALE (understated)** — the entire dual-rate mechanism is unbuilt (MI-4) |
| 6 | Slot inventory is "claimed-at-pay" | gravity audit S8/S9, via brief §C.8 | **STALE (vocabulary)** — claimed at **CLAIM**, which post-#433 is *pre-authorization*; the pre-#433 phrase no longer describes the window (§C.8 trace, SD-3) |
| 7 | Provider row = NEVER across all routing states | ROUTING_STATE_CONTRACT.md:38 | **HOLDS** (§0.3) |
| 8 | The `role === "provider"` class was fixed | shared/roles.ts | **HOLDS** on every live decision path (§0.4) |
| 9 | Booking-scoped visibility (audit S8 posture) | gravity audit | **HOLDS** (AP-14) |
| 10 | Admin-initiated payout posture; provider can never self-trigger a transfer | brief §C.9 | **HOLDS** — with the nuance that a *self-service request* endpoint now exists (`payments.routes.ts:1300`); it creates a `pending` row for admin processing and moves no money (AP-1) |
| 11 | Post-#433 provider email fires only after authorization | brief §D.12 | **HOLDS** (AP-3) |

**Also recorded — the fixture gap the brief predicted is confirmed (§E).** `server/seeds/e2e-test-accounts.seed.ts:34`
seeds `kyoto-photography@traveloure.test` as a bare `service_provider` **user row only** — no `provider_services`, no
`vendor_availability_slots`, no Stripe-Connect account, no `short_links`. So there is **no booking-ready provider
fixture and no attributed short-link fixture**, exactly as the brief states. `test-admin@traveloure.test` and the Kyoto
bench (`kyoto-temples@traveloure.test`, console-sigma §12) exist and must be **consumed, not re-seeded**.
**UNVERIFIED (no DB):** live DEV state could not be read (`DATABASE_URL` unset) — this is a source-level inventory.

---

## 4. Riders (a)–(d) dispositions

- **(a) Ruling 40 ratification appended** to `docs/DECISIONS.md` with the **provenance framing** — the invariant is the
  **provenance of the PaymentIntent id** (server-obtained by a verified actor), **not the transport**. Cites the
  already-verified Tier-3 negative for the client half: **`N17c: a CLIENT may not stamp a PaymentIntent onto an
  unstamped claim`**, `server/__tests__/checkout-payment-promotion.db.test.ts:280`, asserting `promoted.length === 0`.
  **No new negative was built.**
- **(b) Task filed as a placeholder** — see AB-3 and §5. **No project task tool is available in this environment**
  (the tool surface offers GitHub/Drive only, and the dispatch forbids pushing or opening anything), so per the rider's
  own fallback this is recorded here with placeholder id **`#PENDING-PS9`** and this sentence says so explicitly.
- **(c) Protocol advisory line appended** to `docs/DECISIONS.md`: *"Extending a scan's reach requires revisiting its
  predicates in the same change"* — citing the PR #435 legacy-drift near-miss (below).
- **(d) Merge-actor question — CLOSED** (line in §6).

**Rider (c)'s citation, verified in code.** When PR #435 (`056f5f44`, ruling 40) extended the drift job to the cart
rail, the legacy loop's predicate had to be revisited in the same change. `stripeReconciliation.ts:609-613` now reads:

```
for (const charge of charges) {
  if (charge.status !== "succeeded") continue;
  const bookingId = charge.metadata?.bookingId;   // LEGACY convention: singular
  if (!bookingId) continue;                       // ← the line that prevents the near-miss
  if (dbBookingIds.has(bookingId)) continue;
```

with `dbBookingIds` built **only** from the legacy `bookings` table (`:602-603`). Cart PaymentIntents carry
`metadata.bookingIds` (**plural**), so without the `if (!bookingId) continue;` guard **every cart charge** would have
fallen through into the legacy `stripe_charge_no_booking` branch and been indicted as legacy drift. The source comment
records it (`:605-608`). Same lesson, independently instantiated twice in this audit: **MI-3** (fee gate blind to
SCREAMING_SNAKE) and **AC-2** (claims guard scoped to `.sub`, blind to `.role`).

---

## 5. Task placeholders filed by this audit

**No project task tool is available in this environment**, so these are placeholder ids. Each must be replaced with a
real task number at ledger-append time, and every `deferred:` tag in §2 must be re-pointed with it.

| Placeholder | Class | Title |
|---|---|---|
| `#PENDING-PS1` | MONEY_INTEGRITY | `revenueShareRate` is client-settable and overrides the `fee_bands` split at checkout (`fee-literal-debt`, ruling 32) |
| `#PENDING-PS2` | MONEY_INTEGRITY | Move `PROCESSING_FEE_RATE` (0.03) into `fee_bands` per ruling 32's two required proofs (`fee-literal-debt`) |
| `#PENDING-PS3` | guard-coverage | Make `scripts/phase2-fee-gate.sh` Pass B case-insensitive; it is blind to SCREAMING_SNAKE fee constants |
| `#PENDING-PS4` | MONEY_INTEGRITY | Make the completion flip + earnings mint an atomic conditional (§15); today it is check-then-act |
| `#PENDING-PS5` | STATE_DIVERGENCE | Provider accept must not promote an unauthorized provisional claim; today it strands the slot permanently |
| `#PENDING-PS6` | STATE_DIVERGENCE | Provider cancel of a paid booking issues no refund and no routing reversal |
| `#PENDING-PS7` | CX | Provider calendar titles provisional/expired/confirmed bookings identically as "Booked" |
| `#PENDING-PS8` | ABSENCE | Diary rows for `service_bookings` status transitions (the #1028 pattern, second table) |
| **`#PENDING-PS9`** | **ABSENCE (rider b)** | **Schedule `scripts/invariants.mjs` daily alongside the reconciliation job; output on the same exception surface; record every run so silence ≠ not-running (ruling 40 rule 2)** |
| `#PENDING-PS10` | ACCESS | `POST /api/vendor-availability/:id/book` — ungated, unowned, irreversible inventory consumption |
| `#PENDING-PS11` | ACCESS | `/api/provider/bookings` `claims.role` snapshot + `ROLE_PERMISSIONS` divergent role list |
| `#PENDING-PS12` | ACCESS | 403-after-404 existence leak on availability-slot endpoints |

---

## 6. Merge-actor question — CLOSED (rider d)

**Merges on this repository are convention-based pending `BRANCH_PROTECTION_PAT`.** There is no enforced
branch-protection reviewer, so "merged on green per dispatch authorization" is the operating rule rather than a gate.
**#434** (`ba168d0c`, *Legacy reconciliation: one payment promotion, two callers*) and **#435** (`d4f59bb7`,
*Reconciliation detection: one drift job, both rails*) were both merged on green per dispatch authorization, #434 with
`merged_by: Nardo758` — **the repo owner**. This closes the open question; no further ambiguity about who lands lane
work while the PAT is absent.

---

## 7. §8 — Numbered questions block for Leon (HARD STOP)

*Phase 0 ends here. No assertion code, no Phase 1, no Phase 2 until these are ruled.*

**Q1 — Provider accept on a provisional claim (SD-1). Highest-severity finding; needs a ruling before Phase 1 pins it.**
`PATCH /api/provider/bookings/:id/status` checks the *target* status but never the *current* one, so a provider can flip
an unauthorized `payment_pending` claim to `confirmed` — after which ruling 38's TTL sweep and §15c's `promotePaidCheckout`
both match zero rows and **the claimed slot is stranded with no recovery path in code**. Ruling 40's detection sees it
(`booking_confirmed_no_pi`) but §17 forbids the detector repairing it.
**(a)** Confirm the intended invariant: *a provider action may never move a booking out of a provisional state* — i.e.
`handleOwnerBookingStatus` requires a from-state guard, and the correct shape is the §15 atomic conditional
(`UPDATE … WHERE status = <expected>`), not a check-then-update.
**(b)** Should Phase 1 also pin the **inventory** consequence (slot stranded) as its own assertion, separate from the
status assertion? My recommendation: **yes** — the money layers held here and only the inventory layer failed, so an
assertion that only watches `status` would go green on a future partial fix.
**(c)** Does the fix belong to this lane's follow-up or to the checkout-atomicity lane that owns §15b? My
recommendation: **the checkout-atomicity lane** — the predicate being violated is theirs, and a second author editing
the claim state machine is how divergence starts.

**Q2 — Provider cancel of a paid booking (SD-2).** No refund row, no `purchased → in_planning` reversal, despite
`ROUTING_STATE_CONTRACT.md:30` naming the refund path as that edge's sole writer. Is the intended posture
**(a)** reject provider cancellation of a paid booking outright (admin-only), or **(b)** allow it and require it to
drive the refund path atomically? EF-3 is written against whichever you rule; today it fails under both readings.

**Q3 — `POST /api/vendor-availability/:id/book` (AC-1).** Ungated, unowned, creates no booking row, has no release path
and **no client consumer**. Options: **(1)** delete it (my recommendation — it is dead to the UI, and every legitimate
claim already goes through the checkout spine's `bookSlot`); **(2)** gate it to the slot owner; **(3)** keep and add a
release path. If (1), please confirm deletion is in scope for a *follow-up task* and not for this read-only lane. Note
the Phase 1 assertion (EF-5) is written as a **rejection** probe and will never call it successfully — consuming real
dev capacity through it is unrecoverable.

**Q4 — The dual-rate model does not exist (MI-4), and this blocks journey J12.** There is no `rails` band, no
attribution input to `decideBandKey`, and `payments.routes.ts:576-577` explicitly declares attribution
"never read into any fee/amount/payout decision". The gravity audit recorded only the *repeat-pair* rate as
spec-ahead-of-code; the whole mechanism is.
**(a)** Confirm the code's posture is the intended one and the dual-rate spec is retired-or-deferred, versus the spec
being intent and the code being the gap.
**(b)** **J12 (`JOURNEY_TEST_SUITE_BRIEF.md:62`) asserts "commission resolves to rails band via fee_bands" and cannot
pass as written** — should it be rewritten against the current single-rate reality, or marked expected-fail with an
expiry? My recommendation: **pin the current reality as divergence DP-1 now** (it fails loudly the day a rails band is
seeded) **and rewrite J12**, rather than leaving a Wave-4 journey encoding a mechanism that does not exist — the same
correction ruling 38 made to J1/J2's payment leg.

**Q5 — Which shell document governs (CX-1)?** The brief's six-station decision (Today · Work · Catalog · Calendar ·
Money · Grow) and the **Console IA C9** decision in code (nine modules in three groups, `App.tsx:775-782`,
`provider-sidebar.tsx:43-99`) are both ratified and they disagree: "Work" is a group label, "Grow" does not exist, and
five stations are unnamed by the six-station text. Code is ground truth, so C9 wins by protocol — but this is a
*decision* conflict, not a code defect, so I have not assumed it. Please rule which supersedes, so the Phase 1 shell pin
asserts the right shape. My recommendation: **C9 governs** (it is later and is what ships), and the six-station text is
marked superseded with a pointer.

**Q6 — `experts.routes.ts` is mounted, not dark (SD-4) — CLAUDE.md §9 correction.** The provider console consumes two
endpoints from that router (`/api/provider/earnings/summary`, `/api/provider/booking-requests`), which the §9 claim
would have had us treat as dead. **(a)** Confirm §9 should be corrected (it is a *durable* invariant statement in
CLAUDE.md, so per ruling 26 the correction is a code-vs-doc finding, and I have not edited CLAUDE.md in this read-only
lane). **(b)** Should Phase 1 assert these two endpoints live, given the mount sits at `routes.ts:953` **after** the
inline registrations and is therefore order-dependent? My recommendation: **yes, one assertion each** — an
order-dependent mount is exactly the thing that regresses silently.

**Q7 — FIXTURE OWNERSHIP (brief §E.13). The decision the HARD STOP exists for.**
**Recommendation on record: build the booking-ready provider fixture HERE, in this lane's Phase 2, and let Wave 4
consume it — reversing the Wave-4 disposition.** Rationale: (i) the §C money assertions (EF-1, EF-6, DP-1) and the §C.8
slot assertions cannot run without an approved service + availability slots + a Stripe-Connect test account, so the lane
either builds it or ships no money coverage — which is the exact gap the lane was chartered to close; (ii) console-sigma
already proved the reconciling-seeder pattern end to end (`console-sigma-kyoto-bench.http.test.ts`, K4 — consume-don't-reseed,
interrupted-run convergence, standard `{market}-{specialty}` convention), so this is application, not invention;
(iii) J11/J12 are post-beta, so a Wave-4-owned fixture leaves the provider money paths unarmoured for the whole
between-now-and-Wave-4 window. **Kyoto-market provider preferred** for gate coherence — and note `kyoto-photography@traveloure.test`
already exists as a bare `service_provider` row (`e2e-test-accounts.seed.ts:34`), so the fixture is an *extension* of an
existing bench account, not a new identity. **If approved this reverses a prior disposition and therefore needs a ledger
note** (brief §E.13). Please also confirm whether the **attributed short-link fixture** is still wanted given Q4 — if
the dual-rate model is retired, that fixture's only remaining consumer is attribution *reporting*
(`short-links.routes.ts:213-228`), which is a much smaller ask.

**Q8 — Dev-DB access for Phase 1 (blocking).** `DATABASE_URL` is **unset in this worktree**, so no DEV DB read was
possible and §E is source-derived rather than observed (console-sigma's §0.7 was built from live reads). **Phase 1 is
DB-fact assertions by standing rule and cannot run at all without it.** Please confirm how the lane gets dev DB access,
and whether any §E claim here must be re-verified against live state before Phase 2 seeds anything — my recommendation
is **yes, re-verify first**, since a reconciling seeder that mis-reads an absent bench would re-seed rather than consume,
against brief §4.

**Q9 — Guard-predicate gaps as a class (MI-3, AC-2, rider c).** Three independent instances surfaced in one audit: the
fee gate is case-blind to SCREAMING_SNAKE constants; the claims guard is scoped to `.sub` and misses `.role`; and the
drift job's legacy loop needed its predicate revisited when its reach was extended. Rider (c) records the advisory.
**Question: should the ledger's Guard registry additionally carry, per guard, a one-line statement of what its predicate
does NOT cover?** My recommendation: **yes** — every one of these guards passes truthfully while the hole is real, and a
green check with an unstated blind spot is worse than no check, because it is read as coverage.

---

*Phase 0 prepared read-only @ `d4f59bb7`. HARD STOP: findings return for rulings before any assertion code is written.*

---

## 8. RULED + EXECUTED — provider money-hardening lane @ `9382d500` (2026-08-06)

Rulings **42–45** (`docs/DECISIONS.md`) answer Q1/Q3/Q4/Q7/Q9 and execute MI-1, SD-1 and AC-1.
This section is the write-back; the findings above are preserved verbatim as the record of what was found.

### 8.1 Phase-0 re-verification (audit pinned at `d4f59bb7`; main had moved to `9382d500`)

Per ruling 31 the audit's provenance is re-checked rather than re-derived. Only two commits separate
the SHAs (`b96385f0` brief transcription, `96014d0a` the audit itself + ruling 41) — **both docs-only**,
which is itself the explanation for why nothing moved.

| Finding | Verdict at `9382d500` | Evidence |
|---|---|---|
| MI-1 `revenueShareRate` client-settable | **STILL HOLDS** (now FIXED) | Not omitted by `insertProviderServiceSchema`; `createProviderService` spread it; `updateProviderService` stripped 6 fields, not it; 3 consumption sites incl. the /api/checkout charge — all as filed |
| MI-2 `PROCESSING_FEE_RATE` unannotated | **STILL HOLDS** — now annotated `fee-literal-debt:#PS2`, still unbanded | `commission.ts` |
| MI-3 fee gate case-blind | **HOLDS, WITH A CORRECTION** — see 8.3 | `phase2-fee-gate.sh` |
| MI-4 dual-rate model absent | **STILL HOLDS** → ruled 45 | no `rails` band; `decideBandKey` opts unchanged |
| MI-5 completion flip is check-then-act | **STILL HOLDS** — untouched, `#PS4` | `storage.updateServiceBookingStatus` |
| SD-1 provider accept promotes a provisional claim | **STILL HOLDS** (now FIXED) | `handleOwnerBookingStatus` checked only the target status; `voidClaim`/`promotePaidCheckout` predicates unchanged |
| SD-2 provider cancel issues no refund | **STILL HOLDS** — deliberately untouched (Q2 unruled) | same handler |
| SD-3 calendar titles everything "Booked" | **STILL HOLDS** — `#PS7` | `calendar.routes.ts` |
| SD-4 / SD-5 CLAUDE.md §9/§14 stale | **STILL HOLDS** — doc drift, see 8.5 | `app.use(expertsRoutes)` present |
| AB-1 no diary row on `service_bookings` transitions | **STILL HOLDS** — `#PS8`; P3 asserts the *rejected* case writes none | — |
| AB-2 / AB-3 | **STILL HOLD** — `#1042`, `#PS9` | — |
| AC-1 slot-book endpoint ungated | **STILL HOLDS** (now DELETED) | consumer grep re-run at `9382d500`: zero under `client/src`; only non-code hits are this audit + `EXECUTION_MAP.md` |
| AC-2 / AC-3 / AC-4 | **STILL HOLD** — `#PS11`, `#PS12`, inventory | — |
| CX-1 / CX-2 | **STILL HOLD** — Q5 remains unruled | — |

**No finding was contradicted, and no consumer appeared for anything this lane touched.** No hard stop was triggered.

### 8.2 Class sweep beyond `revenueShareRate` (ruling 42)

Method: every `createInsertSchema` in `shared/schema.ts` crossed against every insert schema `.parse`d
from a request body anywhere in `server/`. **Exactly four schemas are client-parsed**, and that
intersection is now a CI guard rather than a one-time sweep.

| Schema | Rate/money-bearing fields EXPOSED | Consumer today | Disposition |
|---|---|---|---|
| `insertProviderServiceSchema` | `revenueShareRate` | **LIVE** — the /api/checkout charge | **STRIPPED + derived** (MI-1) |
| `insertLocalExpertFormSchema` | `bookingFeeType`, `bookingFeePercentage`, `bookingFeeFixed`, `bookingFeeHourly`, `minBookingFee`, `feeSettings`, `stripeAccountId`, `stripeAccountStatus`, `stripeConnectStatus`, `canReceivePayments`, `totalEarnings`, `pendingPayout`, `payoutSchedule` | **NONE** (dormant columns) | **STRIPPED** — the ruling is that a rate-bearing field is never client-settable, consumer or not. Mass-assignable at POST `/api/expert-application` + `/api/expert-forms`; `hourlyRate` adjudicated NOT-a-rate (a free-text display string) and annotated |
| `insertServiceCategorySchema` | `commissionBandKey` (a band SELECTOR) | admin fee taxonomy | **ANNOTATED, not stripped** — admin is the authorized setter. **New finding `#PS14`:** the two admin setters DIVERGE — `admin.routes.ts:2218-2245` validates the key against `fee_bands` and guards the inheritance fallback; `content.routes.ts:807` creates with **no band validation at all** |
| `insertServiceBookingSchema` | `platformFee`, `insuranceFee`, `providerEarnings`, **`stripePaymentIntentId`**, `status` | **NEW FINDING `#PS15`** | **NOT fixed here.** `POST /api/bookings` (`routes.ts:4588`, no client consumer) spreads the parsed body into `createServiceBooking`, so a client can propose its own platform fee, its own provider earnings, and **its own PaymentIntent id** — which is in direct tension with ruling 41's immovable clause. Amounts, not rates, so outside ruling 42's stated scope; the omit list is also load-bearing for the `InsertServiceBooking` TYPE that checkout writes, so a strip needs a route-level allow-list rather than a schema omit. **Filed, not silently changed** |

**Also filed, adjacent and out of the rate class:** the same `insertLocalExpertFormSchema` exposes the
PRIVILEGE-GRANT family `canBookOnBehalf`, `isPersonalAssistant`, `paAccessGrantedAt`,
`paAccessGrantedBy` — mass-assignable by any applicant (`#PS16`). Not touched: it is an authorization
question, not a money one, and it deserves its own review rather than a ride-along.

### 8.3 Correction to MI-3 (found by building the fix — ruling 43)

The audit's MI-3 snippet lists `commission.ts:42 PROCESSING_FEE_RATE = 0.03` as a hit of "same regex
+ `-i`". **It is not.** With the `[A-Za-z]*` identifier tail, `-i` alone still cannot match it: after
`FEE` the tail cannot cross the `_` to reach the `=`. Verified in isolation — `-i` alone yields lines
36 and 38 only. **The finding stands unchanged** (the gate was blind to it, and to SCREAMING_SNAKE
generally); only the stated remedy was incomplete. Both `-i` **and** `[A-Za-z_]*` are load-bearing,
and reverting either now fails the committed self-test fixtures.

### 8.4 Task ids — placeholders, and why

**No project task tool exists in this environment** (the tool surface is GitHub/Drive MCP only, and the
dispatch forbids pushing or opening anything), so §5's `#PENDING-PS*` placeholders are carried forward
as `#PS*` and the new ones below join them. **Every `#PS*` id in this document and in the source
annotations is a PLACEHOLDER and must be replaced with a real task number when one can be filed.**

| Placeholder | Class | Status |
|---|---|---|
| `#PS1` | MONEY_INTEGRITY | **CLOSED** by ruling 42 (MI-1) |
| `#PS5` | STATE_DIVERGENCE | **CLOSED** by ruling 42 (SD-1) |
| `#PS10` | ACCESS | **CLOSED** by ruling 42 (AC-1, deleted) |
| `#PS2, #PS4, #PS6, #PS7, #PS8, #PS9, #PS11, #PS12` | — | OPEN, unchanged |
| `#PS3` | guard-coverage | **CLOSED** by ruling 43 (predicate fixed + self-tested + in CI) |
| **`#PS13`** | STATE_DIVERGENCE (new) | **INVENTORY-RECOVERY LAYER** — SD-1's exposed gap. Bookings got three recovery layers (#433/#434 → rulings 38/39/40); **slots got none of their own.** Capacity is reclaimed only as a side-effect of a booking row being voided, so any path that consumes capacity without a booking row (or that orphans one) leaks it permanently — `releaseSlot` has no scheduled caller and no reconciliation. Detection exists for money drift; there is no equivalent for `vendor_availability_slots.booked_count` vs. its live claims |
| **`#PS14`** | MONEY_INTEGRITY (new) | The two `commissionBandKey` admin setters diverge; `content.routes.ts:807` validates nothing (see 8.2) |
| **`#PS15`** | MONEY_INTEGRITY (new) | `POST /api/bookings` mass-assigns `platformFee`/`providerEarnings`/**`stripePaymentIntentId`** (see 8.2) |
| **`#PS16`** | ACCESS (new) | Expert-application form mass-assigns the PA/booking-on-behalf privilege grants (see 8.2) |
| **`#PS17`** | infrastructure | **`DATABASE_URL` provisioning for provider-sigma Phase 1** — see 8.6 |

### 8.5 Q-block dispositions

- **Q1 (SD-1)** — RULED 42. (a) confirmed: a provider action may never move a booking out of a
  provisional state, enforced by the §15 atomic conditional, not a check-then-update. (b) **yes** —
  the audit's recommendation was taken: P3 asserts the **inventory** consequence (`booked_count`
  unchanged) separately from the status, and P4 asserts the row stays reclaimable by BOTH recovery
  layers, so a future partial fix that only guards `status` cannot go green. (c) the audit recommended
  the checkout-atomicity lane author it; ruling 42 records the resolution of that: the claim machine
  keeps its **sole author**, and the change here is on the OWNER rail refusing to touch it — no second
  claim-state-machine implementation exists.
- **Q2 (SD-2)** — **STILL UNRULED.** Deliberately unchanged; `cancelled` still accepts a `confirmed`
  booking exactly as before, and the code says so at the allow-list.
- **Q3 (AC-1)** — RULED 42, option (1) DELETE, with the general rule stated: no consumer + irreversible
  effect ⇒ delete, do not gate.
- **Q4 (MI-4/J12)** — RULED 45. Code's posture is intended; J12 rewritten (`J12.1` pin / `J12.2`
  deferred); headline requirement transfers to provider back-office Phase 1.
- **Q5 (CX-1 shell)** — **STILL UNRULED.** Untouched by this lane.
- **Q6 (§9 stale)** — see 8.5's note below; CLAUDE.md is not edited by this lane.
- **Q7 (fixture ownership)** — RULED 44: provider-sigma owns it, Wave 4 consumes; reverses the prior
  disposition, ledger-noted as required.
- **Q8 (dev DB)** — see 8.6.
- **Q9 (guard negative space)** — RULED 43: adopted, applied to all fourteen registry entries, plus
  runtime printing and committed predicate fixtures.

**CLAUDE.md §9 and §14 (SD-4/SD-5) remain uncorrected.** Both are *durable invariant statements* in
CLAUDE.md, and per ruling 26 plus the Coordination Prevention rule a correction there is the
decision-maker's to make; this lane recorded the finding rather than editing the document.
**§9's "dark" framing is wrong twice over** — `experts.routes.ts` is mounted at `routes.ts:953`, and
`check-unmounted-routers.cjs` reports **0 dark routers on main at all**.

### 8.6 `DATABASE_URL` — disposition (Q8)

**The DEV database is OWNER-SIDE and was NOT reachable.** `DATABASE_URL` is unset, appears in no file
(only `.env.example` / `.env.e2e.example`), and no credential source exists that an agent can reach.
Nothing in this lane read or wrote the dev DB.

**What WAS wired, in this lane:** a local disposable PostgreSQL 16 (present in the image), with the
**full 178-migration chain applied from `server/migrations/`** — which is what made every assertion in
this lane a real DB fact rather than a mock, and let the three existing suites be re-proven green. This
is exactly the host the suites' own `assertDisposableDb()` recognises (`localhost`), so it required no
weakening of any safety guard. It is **ephemeral**: it dies with the container and is not a substitute
for the dev bench.

**Still owner-side, and still blocking Phase 1 (`#PS17`):** the §E fixture inventory above is
source-derived and its `UNVERIFIED (no DB)` marks stand — a local schema-only DB cannot tell you what
the shared dev bench actually contains, which is precisely the question a reconciling seeder must
answer before it decides to consume rather than re-seed.

### 8.7 SD-1 stranded-row determination — REPORTED, not guessed

Whether any dev rows were already stranded by SD-1 **could not be determined**: the dev DB is
unreachable (8.6), and the local DB is freshly migrated and empty. **No quarantine was performed and
none was invented.** The detection query below was written and executed (0 rows locally, proving it
runs), and is the exact one to run against dev before Phase 1 seeds anything:

```sql
-- Rows SD-1 could have stranded: promoted to a paid-equivalent status with no PaymentIntent, while
-- holding checkout-claimed slot capacity. `slot_id` is the discriminator — it is stamped ONLY after
-- the checkout's atomic bookSlot claim (C3, migration 145), so a request-rail booking that a provider
-- legitimately accepted without payment carries NULL and is correctly excluded.
SELECT b.id, b.status, b.slot_id, b.created_at, b.confirmed_at, s.booked_count, s.capacity
FROM service_bookings b
LEFT JOIN vendor_availability_slots s ON s.id = b.slot_id
WHERE b.status = 'confirmed'
  AND b.stripe_payment_intent_id IS NULL
  AND b.slot_id IS NOT NULL;
```

**Recommended disposition if it returns rows:** do **not** auto-repair. Ruling 40's DETECT-DON'T-REPAIR
applies with full force — this is the same shape as its `booking_confirmed_no_pi` classification, the
drift job already records it, and a fourth unreviewed writer on the money path is exactly what that
rule forbids. Quarantine by hand, per row, with the slot released deliberately.
