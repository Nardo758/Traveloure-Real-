# Fee-Ledger Lane — Phase 0 Audit (read-only)

**Lane:** `lane/fee-ledger` · **Phase 0 of 2** · **audited@`e424978`** (main at Phase 0 start, Aug 6 2026).
**Re-diff vs the audit pin `9382d50`** (protocol ruling 26): performed — see §0, it changed a finding.
**Status:** Phase 0 complete. **HARD STOP.** Phase 1 remains **fully blocked** on the D1–D5 decision block; nothing in
this phase wrote schema, seeds, or product code.

**Provenance note:** the dispatch is marked "do not dispatch with any decision line unfilled" and the block returned
unfilled. Phase 0 was run because it consumes **none** of D1–D4 — its entire purpose is to produce the evidence those
lines need — and it is strictly read-only. **D5 (this lane owns the Q9 determination) is treated as provisional**: §2
below is offered as fact-finding, not as a ratified ownership claim. If D5 comes back ☐No, delete §2 and re-home it.

---

## §0 — Re-diff: the pin moved, and it moved under this lane's feet

`bc18f6f` — *"Provider money-hardening + booking-birth provenance (rulings 42-46)"* — landed between the audit pin and
this phase, touching `commission.ts`, `routes.ts`, `shared/schema.ts`. Consequences for this lane:

| | Finding |
|---|---|
| **C1 unchanged** | `payments.routes.ts:307` (`total = subtotal + platformFee + conciergeFee`), `:878-879` (`basePlatformFeeAmt = price − baseExpertEarningsAmt`), `:961-964` (row write) are **identical at head**. The lane's premise holds: same number added to the traveler total and deducted from the provider base, one side recorded. |
| **C2 partially hardened, not closed** | MI-1 removed `revenueShareRate` from `insertProviderServiceSchema` (`shared/schema.ts:1578` `.omit()`) and added storage-side derivation from `fee_bands` (`storage.ts:1245` `deriveServiceRevenueShareRate`). **But:** it shipped **no migration** — rows already on disk keep their old rate — and `payments.routes.ts:826/877/1090` still read the column as *"the final override (takes priority over config)"*. The column's schema default is a bare literal `"0.75"` (`shared/schema.ts:715`). |
| **New literal surfaced** | `PROCESSING_FEE_RATE = 0.03` is now annotated `fee-literal-debt:#PS2` (`commission.ts:57`) — flagged by that lane's fee-gate predicate fix, which had been blind to SCREAMING_SNAKE for its whole life. |

## §1 — Fee-write census

**Scale finding, stated first because it resets the lane's shape:** the census found **56 write points across 12 money
paths**, writing fee/commission/margin amounts into **26 tables**. C1's provider-checkout case is one of them. A ledger
that covers only the provider rail would leave 11 other paths minting unrecorded fees.

### Money paths and their write points

| Path | Write points (file:line) | Amount origin | Transaction |
|---|---|---|---|
| **Cart checkout** (`service_bookings`) | totals `payments.routes.ts:820-838`; per-item `:871-889`; **row write `:926-978`** (`total_amount`, `platform_fee`, `insurance_fee`, `provider_earnings`) | `resolveCommissionRates` → `beta_flat`\|`expert_standard`\|category band, **overridden by `revenueShareRate` :826/:877** | **NONE** |
| **Authorization stamp** | `checkout-claim.service.ts:174-186` | — | **TX** ✅ + `paymentIntentId` ✅ |
| **Promotion flip** | `checkout-claim.service.ts:816-853` | — | **TX** ✅ + PI ✅ |
| **Completion flip** (mints revenue + both earnings ledgers) | `storage.ts:1768-1790` (`platform_revenue`), `:1796-1819` (`provider_earnings` + `expert_earnings`), `:1768-1772` (`total_revenue`) | `platform_fee` read back off the booking row; `PROCESSING_FEE_RATE` | **NONE** — 5 independent writes that can partially fail |
| **Legacy `bookings` rail** | `booking.service.ts:392-404` (row), `:723-734` (raw `INSERT provider_earnings`), `:745-760` (raw `INSERT platform_revenue`) | `pricingService.calculatePlatformFees` → `resolveCommissionRates`; deposit via band `platform_deposit`, fallback literal `0.25` (`pricing.service.ts:23`, **unannotated**) | **TX** ✅ (`:688`) + PI ✅ |
| **Request rail** (fee written at birth, no charge) | `routes.ts:1398-1442`, `:4604-4625` | **`calculateCommission()` — hardcoded, no `fee_bands`**: `0.85`/`0.75` (`commissionCalculator.ts:72`), `PROVIDER_TIER_RATES {1:0.12,…}` (`:41-46`), **tier pinned to `1`** at `routes.ts:1400`. Both **unannotated** | **NONE** |
| **Ready-made purchase** | `ready-made.routes.ts:1133-1145`; `ready-made-purchase.service.ts:128-140`, `:146-166` | band `ready_made_trip` → `expert_standard` → literals `0.75/0.25` (`fee-literal-ok`) | **NONE**; PI available, not snapshotted |
| **Template purchase** | `routes.ts:3550-3565`, `:3683-3693`, `:3703-3723`; `storage.ts:3509-3538` | `resolveCommissionRates(category)` | **NONE**; PI ✅ in scope, unstored |
| **Tips** | `storage.ts:3644-3657`, `:3671-3680`, `:3685-3698` | band `tip_handling` | **NONE** |
| **AI concierge / coordination** | `optimization.routes.ts:447-459`, `:474-483`; `routes.ts:7143-7160`, `:7330-7336` | `optimization_fees` table (**not a band**); coordination via bands `coordination_floor`/`coordination_percent` | **NONE**; PI ✅ (is the `sourceId`) |
| **Expert review / concierge fee** | `booking-actions.ts:209-215`; `booking-actions.service.ts:91-101`, `:111-120`; `stripe-payment.service.ts:1080-1090` | bands `expert_review_*`, `full_concierge_*`; fallback tier literals (`fee-literal-ok`) | **NONE** |
| **Affiliate margin** | `content.routes.ts:6934-6970`; `storage.ts:3760-3781`; `affiliate-reconciliation.service.ts:373-406`, `:425-427` | band `affiliate_standard`; partner rates from `affiliate_partners` | **NONE** |
| **Payouts** | `payments.routes.ts:1345-1360`; `admin.routes.ts:3963-3985`, `:4055-4075`; `storage.ts:4153-4212` | `summary.available` | **TX** ✅ (`storage.ts:4069`/`4115`/`4150`) + **`transferId` ✅** |
| **Shared recorder** | `revenue-tracking.service.ts:81-132` — used by optimization, coordination, expert-review, affiliate, tip, template | `resolveCommissionRates`; `AI_PLATFORM_FEE = 1.00`; `PROCESSING_FEE_RATE` | **NONE** — 3 separate awaits |

### §1a — Rate-source precedence (a correction to the dispatch's schema sketch)

The dispatch's `fee_ledger` sketch pairs `band_id` FK with a `rate_as_resolved` snapshot. **Three override layers sit
above the band, two of them denormalized per-entity snapshots** — so for many rows there is no band that explains the rate:

1. `provider_services.revenue_share_rate` — per-service snapshot, *"the final override"* (`payments.routes.ts:826/877/1090`), default literal `"0.75"`, **not backfilled** by MI-1.
2. `users.commission_override_expert_share_percent` — resolver Tier 3, comment reads *"Override always wins"* (`commission.ts:552-570`).
3. Band resolution proper (`decideBandKey` → `beta_flat`/`expert_standard`/category).
4. Documented code-constant fallbacks (§8 safe-failure posture).

**Design consequence:** `band_id` must be **nullable with a companion `rate_source` discriminator**
(`band` | `service_override` | `user_override` | `code_fallback`), or the ledger will attribute overridden rates to
bands that never produced them. → **§6 Q-L3**.

### §1b — Literals with no band and no annotation (ruling 32 candidates)

| Literal | file:line | Status |
|---|---|---|
| `PROCESSING_FEE_RATE = 0.03` | `commission.ts:57` — applied at **6** write points | `fee-literal-debt:#PS2`; **the only live rate with no `fee_bands` row** |
| `PROVIDER_TIER_RATES {1:0.12, 2:0.08, 3:0.06, 4:0.04}`, `0.85`/`0.75` | `commissionCalculator.ts:41-46, :72` | **unannotated**, live on the request rail, tier pinned to `1` |
| deposit `0.25` | `pricing.service.ts:23` | **unannotated** |
| transport affiliate margins (`discovercars: 0.10`, `kiwi: 0.06`, bare `?? 0.08`) | `transport-booking-options.service.ts:275-282, :318` | **unannotated** |
| referral bonus `'50'` | `storage.ts:3742` | **unannotated**, written into `expert_earnings` |
| client-side `subtotal * 0.12` | `client/src/components/booking/BookingFlowModal.tsx:151, :258` | **unannotated**; matches no resolved band |

### §1c — Fees computed and then discarded (ledger blind spots)

`transport-booking-options.service.ts:100-101, 134-135, 483-540` computes `revenueType` + `revenueRate` on every
transport option — but `transport_booking_options` **has no such columns** (`shared/schema.ts:5290-5366`) and the
`...opt` spread at `:184` silently drops them. **Every transport affiliate margin is computed and thrown away.**
Also: `content.routes.ts:6949-6953` writes `"0.00"` into every affiliate commission column at confirm (the honest-zero
posture), so the real amount event is the reconciliation adoption (`affiliate-reconciliation.service.ts:373-406`), not
the booking.

## §2 — Q9 determination *(provisional pending D5)*

**Determined: neither hypothesised branch. A third mechanism decided the rate.**

The booked service row carried `revenue_share_rate = 0.75` (DB read, `traveloure_ux.provider_services`). At
`payments.routes.ts:877` the charge does:

```ts
const expertShareRate = safeParseRate(item.service.revenueShareRate, itemCategoryRates2.expertShareRate);
```

The per-service column is the **first** operand — `resolveCommissionRates`' output is only the fallback. So whichever
band the resolver selected was irrelevant: the snapshot decided 75/25. The comment at `:825` states it outright:
*"Per-service revenueShareRate is the final override (takes priority over config)."*

Where the 0.75 came from: the column default is the literal `"0.75"` (`shared/schema.ts:715`). Pre-MI-1 it was also
client-settable (that was MI-1's whole finding). Post-MI-1 it is server-derived — **for new writes only; no backfill
migration shipped**, so every pre-existing service, including every bench fixture, still carries whatever it had.

**C2 restated with the mechanism known:** the configured provider band (`beta_flat`, 0.10, active) never reached the
charge, and cannot reach it while a stale snapshot outranks it. **An admin editing `fee_bands` today does not change
what an existing service charges** — which defeats one of ruling 32's two required proofs.

## §3 — Transaction-boundary map (the blocking structural finding)

Phase 1 requires *"ledger row(s) written in the same transaction as the money mutation."* **At the highest-volume fee
sites there is no transaction to join.**

- `server/routes/payments.routes.ts` contains **zero** `db.transaction(...)` calls (verified by count).
- `storage.createServiceBooking` takes no tx handle (`storage.ts:1656`) — the checkout row write (#3) cannot enlist.
- The completion flip (`storage.ts:1762-1821`) — the highest-volume fee-minting site — is **five independent writes with
  no transaction and zero Stripe identifiers in scope**.
- `revenue-tracking.service.ts:81-132`, the shared recorder behind six paths, is three separate awaits, no tx.

**Only four existing transactions both touch money and carry a Stripe id** — these are the only "free" landing spots:

| Site | Transaction | Stripe id available |
|---|---|---|
| `checkout-claim.service.ts:174` (authorization stamp) | ✅ | `paymentIntentId` |
| `checkout-claim.service.ts:816` (promotion flip) | ✅ | `paymentIntentId` |
| `booking.service.ts:688` (legacy confirm) | ✅ | `paymentIntentId` |
| `routes.ts:7410` (coordination refund) | ✅ | `refundId` **and** PI — best-instrumented refund site |
| `storage.ts:4069`/`4115`/`4150` (payout completion) | ✅ | `transferId` |

**Everywhere else, "same transaction" means introducing the transaction.** On the cart rail that is not a local change:
§15b's claim→authorize→promote spine was deliberately built on atomic conditional UPDATEs rather than transactions
(rulings 38/39/40), and the fee amount is minted at `:961-964` **before a PaymentIntent exists at all** (PS15/ruling 46 —
a booking is never born with a PI). So the fee event and its Stripe reference are, by current design, separated in time.
→ **§6 Q-L1**.

## §4 — Refund / reversal paths

16 backward paths found. Governing facts:

- **No reversal re-resolves a band.** `service_bookings` stores no `commission_rate` or `band_key` column, so every
  reversal negates stored dollars. Only two paths re-resolve anything: `affiliate-reconciliation.service.ts:373` and
  `booking-actions.service.ts:88`.
- **Diary discipline is near-absent (rulings 12/16/18 ABSENCE).** `item_transition_log` is written on exactly **two**
  backward paths — `item-routing.service.ts:137-144` (`actorType:"refund"`, the #1028 pattern) and
  `checkout-claim.service.ts:453` (`checkout_claim_expired`). **Every money-ledger reversal — earnings flips, revenue
  reversals, dispute holds, credit releases — writes no transition row at all.**
- **Two paths mutate recorded fee rows in place**, which an append-only ledger supersedes rather than complements:
  `booking-actions.service.ts:91-101` rewrites an existing `platform_revenue` row's `platform_fee`/`net_amount` at a
  rate resolved at completion time; `affiliate-reconciliation.service.ts:425-427` overwrites `expert_earnings.amount`.
- **An existing double-count.** `reversePlatformRevenueForBooking` (`storage.ts:3952-3978`) flips the original row to
  `status='reversed'` **and** inserts a compensating negative row that also carries `status='reversed'`. The admin
  summary buckets by that status (`storage.ts:4288-4327`), so **reversed totals read ~2× the true reversal.** Pre-existing;
  recorded here because the ledger's reversal linkage (`reverses_ledger_id`) is the structural fix.
- **Money hole, verified firsthand, already filed and unruled:** a **paid, confirmed booking can be cancelled with no
  refund, no earnings reversal, no revenue reversal** — traveler path `routes.ts:4837-4853`, provider path
  `routes.ts:4662-4668`, whose own comment records it as *"a SEPARATE, still-unruled finding (audit SD-2 / Q2)."*
  **Not this lane's fix**; the ledger would make it visible, not correct it. → **§6 Q-L5**.
- `stripe-payment.service.ts:759-773` (`charge.refunded` webhook) writes a `refunds` row **and nothing else** — explicit
  `// TODO: Update booking status` / `// TODO: Return inventory`. A dashboard-issued refund reverses no earnings.

## §5 — Read-surface inventory (the repoint list)

**~34 read surfaces.** The load-bearing structural fact: **there is no `SELECT SUM(platform_fee)` anywhere in the repo** —
every total is an independent JS `.reduce()` over rows pulled whole, each with its own status filter, and two with **no
filter at all** (`provider/earnings.tsx:164-176`, `revenue-tracking.service.ts:307-332` — both count refunded bookings).

**The Q7 four panels, which the dispatch closes by construction:**

| Panel | file:line | Formula today | Post-repoint |
|---|---|---|---|
| Top stat cards | `provider/earnings.tsx:89-117` | buckets `providerEarnings` by booking `status`; `refunded`/`cancelled` fall through silently | ledger sums net of reversal events |
| Payout / Available Balance | `:262-299` (gate `:274`) | re-renders the same booking-derived number — comment `:62-65` calls it *"a display hint"* | same source as panel 4, so the button gate matches the server |
| Revenue Share Breakdown | `:164-176`, render `:305-380` | `share/gross` over **all** bookings, no status filter; `0.30` fallback at `:165`/`:173` | events grouped by kind; the % becomes a real weighted rate |
| Earnings Ledger | `:436-472` | passthrough of `summarizeEscrowEarnings` (`storage.ts:3595-3600`) | already ledger-shaped — **the only panel that survives as-is** |

**One function is the choke point:** `summarizeEscrowEarnings` (`storage.ts:3595-3600`) backs panel 4, both payout
endpoints (`payments.routes.ts:1342-1345`, `admin.routes.ts:3944-3962`) and the expert equivalents. Repoint it and the
balance surfaces follow.

**The reconciliation job reads `platform_fee` directly** (`jobs/stripeReconciliation.ts:210, 486-489, 528, 619`):
expected charge = `Σ(total_amount + platform_fee)`. Post-ledger this becomes a sum of that PI's fee events — which
also makes *"was this charged at the band we think?"* auditable instead of inferred from one collapsed column.

Also flagged: `experts.routes.ts:217` returns a field named `commissionRate` that is actually `paidOut/total` — a
payout-completion ratio wearing a rate's name.

## §6 — Questions for ruling

- **Q-L1 (blocks Phase 1C).** The same-transaction requirement has no transaction at the two highest-volume sites, and on the cart rail the fee is minted **before a PI exists** (ruling 46). Choose: (a) introduce transactions at those sites — a change to the §15b claim spine that rulings 38/39/40 built transaction-free; (b) write the fee event at the existing authorization-stamp tx (`checkout-claim.service.ts:174`), accepting that the event is recorded at authorization rather than at computation; or (c) allow a two-phase event (minted-at-claim, bound-to-PI-at-stamp). **My reading: (b)** — it is the only option that gets a PI and a transaction without touching the claim spine.
- **Q-L2 (scope).** The census is 56 write points / 12 paths / 26 tables. Does this lane cover **all** fee-moving paths, or land the provider+cart rail first with the rest as follow-on? The invariant only proves what it covers.
- **Q-L3 (schema correction).** Per §1a, `band_id` cannot explain rates produced by the two per-entity overrides. Ratify `band_id` nullable + a `rate_source` discriminator (`band`|`service_override`|`user_override`|`code_fallback`)?
- **Q-L4 (the override architecture itself).** Should `provider_services.revenue_share_rate` remain authoritative over live band resolution at charge time? While it does, an admin band edit cannot change an existing service's rate — defeating one of ruling 32's two proofs — and C2 recurs for every un-backfilled row. Retiring it (or backfilling + demoting it to a cache) may be a precondition for D1 meaning anything.
- **Q-L5 (out of scope, needs a home).** The confirmed-booking-cancelled-without-refund hole (§4, filed as SD-2/Q2) is money that moves wrongly, not a fee that records wrongly. Confirm it is **not** absorbed here and assign it.
- **Q-L6 (reversal diary).** Should this lane's reversal rows also write `item_transition_log` entries (rulings 12/16/18), closing the ABSENCE in §4 — or is the ledger's own append-only reversal row the diary?
- **Q-L7 (`PROCESSING_FEE_RATE`).** It is the only live rate with no band, applied at 6 write points, currently `fee-literal-debt:#PS2`. Does D1's seeding migration also seed it as a band, or does #PS2 stay separate?
- **Q-L8 (in-place mutators).** `booking-actions.service.ts:91-101` and `affiliate-reconciliation.service.ts:425-427` rewrite recorded amounts in place. Under an append-only ledger these must become reversal + new row. Confirm that conversion is in scope.

## §7 — What Phase 1 needs before it can start

D1–D5 unfilled, plus Q-L1 (transaction strategy), Q-L2 (path scope) and Q-L3 (schema shape) — these three change what
gets built, not merely its parameters. D1's band values are also partly informed by Q-L4: seeding `provider_standard`
and `provider_rails` while the per-service snapshot still outranks them would seed bands that nothing reads.

**Confirmed for D1/D2 from the DB:** of 52 rows in `fee_bands`, `provider_standard` and `provider_rails` are both
**ABSENT**; `beta_flat` is present, `percent`, `0.1000`, `is_active=true`.

---

*Phase 0 read-only: no schema, no seeds, no product code. Every code claim carries file:line; every band and column
claim carries a DB read. **HARD STOP** — findings return for review and rulings.*
