# Phase 1 dispatch — traveler-fee-collection (BUILD)

**Ruling:** `2026-09-02-traveler-fee-applies-everywhere` (`docs/DECISIONS.md`). **Lane:** `claude/traveler-fee-collection`.
**Phase 0:** `TRAVELER_FEE_COLLECTION_PHASE0.md` (classification + A/E evidence). **Gates A & E: resolved.** Cleared to build.
**Constraints (verbatim from the ruling & dispatch):** no fee literals (resolver + `fee_bands` only); no second calculator; no
commission changes; fee only on the (a) paths; every path lands with its preview aligned; **no merge — the decision-maker
merges after reading the money-path diff; prod-neutrality gate applies.**

## Scope — the (a) paths that get the fee (from Phase 0)

1. **Cart / direct checkout** — `payments.routes.ts:478` (`fullTotal`) + `authorizeAndPromote`; **ships in the SAME commit as fee-preview** (`payments.routes.ts:2024`).
2. **Deposit balance** — `pay-balance` (`payments.routes.ts:1748`): no new fee; assert the deposit leg already carried it (ruling D).
3. **Legacy `bookings` rail** — `booking.service.ts:456` (`totalAmount`); needs a fresh `coversAction` gate wired in (it has none today).
4. **Platform transport** — `stripe.service.ts:110` (`totalAmount = priceCents * travelers`): add the fee as its own line/amount.
5. **Expert review service** — `booking-actions.ts:128` (`resolveExpertReviewAmount`) → `createExpertServicePaymentIntent`.

**NOT touched:** provider payout (b); coordination/optimizer/ready-made/template/Trip-Pass (c).

## The suppression mechanism (BLOCKER 1, ratified)

- New fee_type **`fee_waiver`** by migration: add to `FEE_LEDGER_TYPES` (`shared/schema.ts:7004`) **and** the migration-179
  CHECK list, via a new registered migration (register in `server/migrations/migration-files.ts`; declare nothing that
  drops the table — additive enum value only). The `amount <> 0` CHECK **stays**.
- On a covered booking write **two** rows through the existing `appendFeeLedgerRows`: `traveler_service_fee (+X, borneBy:"traveler")`
  and `fee_waiver (−X)` with `metadata.covered_by = "trip_pass" | "rails"` and the band that would have priced it. They net to
  $0; both are non-zero so the CHECK is satisfied. **Do not** emit a literal $0 row (impossible) and **do not** reuse `credit_applied`.
- A non-covered booking writes **one** `traveler_service_fee (+X)` row only.
- Amount from `resolveTravelerServiceFee(subtotal)` / `{waived:true}` — the sole calculator. Rates via `fee_bands`. No literals.

## Build order (one path per commit, highest-traffic first)

**Commit 1 — path 1 (cart) + fee-preview, together.**
- Add a `travelerFee` term to `fullTotal` (`payments.routes.ts:478`), server-derived via `resolveTravelerServiceFee(subtotal)`; the
  existing Trip-Pass pre-pass (`:1269-1284`) resolves `{waived:true}` for a covered cart. The charged `total` and the row snapshot
  both carry it.
- Write the ledger rows at the authorization stamp beside `recordRailsFeeLedger` (`:560`) — a new `recordTravelerServiceFeeLedger`
  in `fee-ledger.service.ts` (reads the booking snapshot, never re-resolves; idempotent per booking id; two rows when covered).
- **fee-preview** (`:2024`): add the same `travelerFee` term to `total`; when covered, subtract it AND surface the waiver line
  (`"$X service fee — covered by Trip Pass"`); flip `billedOnDirectPathToday → true`.
- **Test flips:** `fee-preview-entitlement.http.test.ts` assertion C (`total unchanged`) becomes `total reduced by the fee`;
  `billedOnDirectPathToday:false → true`. New per-path tests: fee present & correct at band rate; cap applied above threshold;
  covered → the two-row net-zero event + **no charge delta** for a non-covered vs. the correct delta; preview == charge.

**Commit 2 — path 2 (deposit balance):** assert (test) the deposit leg carried the full-subtotal fee once and the balance leg is
fee-free; cap per booking. Likely no production code change beyond confirming the deposit-leg composition includes the fee.

**Commit 3 — path 3 (legacy rail):** wire a `coversAction` gate into `processCart`; add the fee to `totalAmount` (`booking.service.ts:456`);
ledger rows with `sourceType:"booking"`. Tests mirror commit 1.

**Commit 4 — path 4 (transport):** add the fee to the transport charge (`stripe.service.ts`), transport category band; ledger row
`sourceType:"service_booking"` (transport rows are `service_bookings` w/ NULL `service_id`). Tests.

**Commit 5 — path 5 (expert review service):** add the fee to `resolveExpertReviewAmount`'s charged total; ledger row. Tests.

**Commit 6 — invariant + close-out:**
- CI-gated invariant: **every (a) path produces either a `traveler_service_fee` row OR a `covered_by` net-zero pair** (D-1 rebuild-guard
  shape). Add the workflow, then **upgrade the ledger row's tag** from `[advisory]` to `[guarded: <workflow-name>]` (edit in this same lane;
  the guard is now live so `check-decision-guards.cjs` accepts it).
- Retire the finding: strike `docs/findings/FEE_NOT_BILLED_ON_DIRECT_PATH.md` with a FOLLOWUPS line; leave
  `FEE_LEDGER_AGGREGATIONS_MUST_NET_WAIVERS.md` open (forward contract for the first ledger reader).
- Update `docs/MONEY_MAP.md` in the same PR (a money-site change must move the map).

## Gate checklist before requesting the decision-maker's merge read

- [ ] Every (a) path bills; every (b)/(c) path unchanged (prod-neutrality on the resolver's callers).
- [ ] Preview == charge on path 1 (and waiver line shown when covered).
- [ ] No fee literals (grep-gated); one calculator; no commission deltas.
- [ ] `fee_waiver` migration additive + registered + declared in `shared/schema.ts` (publish-trap rule).
- [ ] Invariant CI guard green; ledger tag upgraded to `[guarded: …]`.
- [ ] MONEY_MAP.md updated. **Do not merge — hand the money-path diff to the decision-maker.**
