# Lane report — D-32 / D-33 / D-34 / D-35: a bundle's components are rows, the snapshot carries the price, a partially completed bundle is its own state, and it mints once over reduced figures

**Ledger row:** `2026-09-16-d32-d35-bundle-components`
**Migration:** `306_booking_component_states.sql` — ONE table, `booking_component_states` (FK → `service_bookings`
ON DELETE CASCADE, UNIQUE (booking_id, component_service_id), index on the parent; NO DEFAULT on any
decision-bearing column, NO CHECK, declared in `shared/schema.ts`, NO backfill).
**Spec:** punchlist **D-32 / D-33 / D-34 / D-35** (all ruled **A**, 2026-09-15);
`docs/design/BUNDLE_PARTIAL_COMPLETION_BRIEF.md`; CLAUDE.md §14/§15/§18b/§19, LD 44(e);
`docs/lane-reports/2026-09-15-d36-d39-completion-declared.md` for the status ladder this lane sits beside.
**Predecessor:** `2026-09-15-d36-d39-completion-declared` (migration 304, merged 07:34 UTC) — its invariants
(`COMPLETION_ALLOWED_FROM_STATUSES = ['confirmed']`, the declared-window lists) are kept true and re-asserted in C6.

---

## 1 · The ruling, as built

```
checkout ──(claim composer, one tx)──> booking row + one `pending` component row each, WITH snapshot_price_cents
                                                  │
     owner rail /complete (componentServiceId) ───┤── pending → completed   (atomic: row pending AND parent confirmed)
     owner rail /component-failed (+ reason) ─────┤── pending → failed      (same guard shape)
                                                  ▼
                              deriveBundleOutcome (the ONE derivation)
        ┌───────────────────────┬──────────────────────────┬─────────────────────────┐
        │ any pending           │ all completed            │ ≥1 completed, ≥1 failed │ none completed
        ▼                       ▼                          ▼                         ▼
   stays confirmed         completed (existing flip,   partially_completed        stays confirmed —
   (incomplete)            existing FULL mint)         ONE mint, REDUCED figures   whole-row refund rail
```

| Clause | Built as |
|---|---|
| **D-32** table | `booking_component_states` — `status` app-enforced (`pending\|completed\|failed\|cancelled\|refunded`), the ruling's timestamp/refund columns declared; born by `storage.createServiceBooking` inside the birth transaction (`bornBundleComponentRows`); no `createInsertSchema` (no client writer) |
| **D-32** admission | V-10 denylist gains `bundleComponents` + `componentCompletions`; `createServiceBookingAtomic` strips both (C1b); `createServiceBooking` is the §19d named exemption |
| **D-32** reader | `readBundleComponentStates` — rows first, legacy jsonb second, `componentStateSource` NAMED on eligibility evidence and every rail response |
| **D-33** price | `payments.routes.ts` selects `providerServices.price` in the snapshot SELECT and writes `priceCents` (integer cents; unparseable ⇒ omitted, never 0) → `snapshot_price_cents` at birth |
| **D-34** status | `partially_completed` (code-only, `varchar(30)` no CHECK); from-state `PARTIAL_COMPLETION_FROM_STATUSES = ['confirmed']`; reached via `settleBundlePartialCompletion` from either owner rail; provenance names the failed component by its bought name; `completed_at` not stamped; `total_amount` never rewritten |
| **D-34** rail | NEW `POST /api/{provider,expert}/bookings/:id/component-failed` — `.strict()` pick `{componentServiceId, reason?}`; same ownership 404; mutation-auth manifest regenerated |
| **D-35** mint | `updateServiceBookingStatus` mints on `partially_completed` inside the flip's tx through the SAME `mintCompletionEarningsForBooking`, which scales the row's three figures by the delivered share of snapshot cents (`reducedBundleFigures`); migration 203's indexes untouched ⇒ one mint by construction |

## 2 · The lists that learned `partially_completed` — and the ones that deliberately did not

| List | Decision |
|---|---|
| `PAID_EQUIVALENT_STATUSES` (`stripeReconciliation.ts`) | **JOINED** — a paid state §17 must see |
| `paid-service-bookings-have-payment-intent` SQL (`scripts/invariants.mjs`) | **JOINED** |
| `TRANSACTED_BOOKING_STATUSES` (`booking-visibility.ts`) | **JOINED** — money history, listing never deletable |
| `readPurchaseStatus` (`purchase-status.ts`) | **JOINED** — "Booked · partially completed" |
| `TERMINAL_STATUSES` | **NOT** — still owes a component refund |
| `DISPUTABLE_FROM_STATUSES` | **NOT** — unruled; `DISPUTE_REJECT` restores to `completed` (would misstate a partial); dispute route anchors on a `completed_at` a partial never stamps |
| `EARNING_BOOKING_STATUSES` | **NOT** — console sums the FULL `total_amount`; the minted figures are reduced |
| `COMPLETION_ALLOWED_FROM_STATUSES` | **NOT — a DEVIATION from D-34's row text, stated.** The state is entered only when no component is `pending`, and a failed component never returns (`WHERE status='pending'` claim), so there is no late component to complete; widening the timer's candidate predicate would hand the nightly job a state it can never complete (the D-24 invariant one state over). The lane brief also said not to widen it casually. |

## 3 · The one money question (D-35) and the one stated choice

Reduced gross/fee/earnings = the row's own `total_amount` / `platform_fee` / `provider_earnings` × `keptFraction`,
`keptFraction = 1 − Σ(undelivered snapshot cents) / Σ(all snapshot cents)`. With 100/25/75 and a 20-of-100 component
failed: 80.00 / 20.00 / 60.00, `deductedAmount` 20.00 (C4). A discounted bundle (components 60+40 sold for 90, the 40
fails) deducts 36.00 — the SHARE of what was charged, never the raw component price (B-P4; D-33's sub-question).

**Stated choice:** the lane brief said "platform fee recomputed through the EXISTING fee resolver". The row's
`platform_fee` IS the resolver's output at purchase, snapshotted; this lane SCALES it rather than re-resolving a band
at completion, because a band edited after the sale must not move the payout on a sale already made — the same
reason the refund reads the snapshot price and never the listing's price today (brief §2 rule 4). No rate literal;
no amount from anywhere but the row and the snapshot. If the decision-maker wants a re-resolved band instead, it is
a one-function change in `reducedBundleFigures`' caller.

A non-derivable reduction (a NULL snapshot price) is refused BEFORE the flip (`component_prices_unknown`; parent stays
`confirmed` for a human) and THROWS inside the flip's transaction if reached, so the flip rolls back (C4b). Nothing
else about money moved: no fee band, no rate, no idempotency key, no hold window; `reverseEarningsForBooking` stays
100%-only.

## 4 · Proofs

`server/__tests__/bundle-component-states.db.test.ts` (wired into the `acceptance-rails` job, 10/10):

| | proves |
|---|---|
| C1 | the composer births one `pending` row per component with the catalog price in cents (same tx); the checkout SELECT reads `providerServices.price` and no `req.body` (comments-stripped pin); the reader says `rows` |
| C1b | the client-facing birth rail strips the snapshot + completion map and births NO rows; the denylist names both keys |
| C2 | a CONCURRENT double component completion is ONE row flip; second caller `alreadyRecorded`; `completed_at` stamped once; legacy map not written; a failure over a delivery is refused naming the state; unknown component refused |
| C3 / C3b | `partially_completed` reached via failure-last AND via delivery-last; failed component NAMED; `completed_at` NULL; `total_amount` unchanged; further writes refused `wrong_status`; every-component-delivered still `completed` with the full mint |
| C3c | all failed ⇒ nothing flips, `bundle_components_undelivered`, no mint, settle refused |
| C4 | ONE mint set (3 ledger rows) with 80.00/20.00/60.00; reduction recorded on the row; second settle refused; second mint returns false; amounts unchanged |
| C4b | unpriced component ⇒ failure recorded, flip refused `component_prices_unknown`, parent `confirmed`, no mint; a direct flip THROWS and rolls back |
| C5 | legacy jsonb read with `componentStateSource: "legacy_jsonb"`; failure refused `bundle_component_states_unavailable`; last delivery completes in full through the jsonb path |
| C6 | the lists above, each way; `readPurchaseStatus` label; the `.strict()` body admits no status/price/amount; two owner mounts |

`shared/__tests__/bundle-component-states.test.ts` (same job, 6/6): B-P1 derivation table; B-P2 unknown status is
unresolved; B-P3 pro-rata figures; B-P4 discounted bundle; B-P5 refusals; B-P6 snapshot price is integer cents or not
captured.

**Re-pinned, never deleted:** `booking-birth-provenance.db.test.ts` B7 (the denylist set, 12/12 green).

## 5 · Deliberately left, named

- **THE COMPONENT REFUND (brief lane 4) — STOPPED ON, as the lane brief instructed.** `refundServiceBooking` claims
  `UPDATE … SET status='refunded' WHERE status <> 'refunded'` on the WHOLE row — terminal, unpromotable, and a lie about
  the delivered components. It cannot express a partial refund, and building a second refund rail was not this lane's
  licence. What IS recorded: the owed amount (`completion.reduced.deductedAmount`) and the failed rows' own
  `snapshot_price_cents`; the `refunded_at` / `refund_amount_cents` / `stripe_refund_id` columns wait. Until that lane
  lands, a `partially_completed` traveler has been charged in full and is owed the deducted share — an ops-visible
  fact on the row, not a silent one.
- **Per-component acceptance/dispute** (D-6/D-7 inherited per component): `delivered_at` / `accepted_at` have no writer.
- **Whether a bundle DECLARES under D-7**: it still mints at its last component's answer (the D-36..D-39 report's own open item).
- **`cancelled` component status**: declared so the derivation reads it, no writer.
- **Every surface**: the seller's per-component controls, the traveler's per-component read-out (LD 42 D9 audience).
- **`bundle_components` ON DELETE RESTRICT, the checkout F2 re-check, substitution, re-pricing, nested bundles**: unchanged / not decided (brief §6 negative space).

## 6 · Validation

| Check | Result |
|---|---|
| tsc `error TS` count | 129 (baseline) |
| `npm run build` | green |
| `check-decision-guards.cjs` | OK |
| `check-money-endpoints.cjs --self-test` + run | 37 fixtures OK / exit 0 |
| `phase2-fee-gate.sh` | exit 0 |
| `check-test-files-wired.cjs --self-test` + run | 12/12; `test-orphan-ratchet: OK` |
| `check-duplicate-migration-prefixes.cjs` | OK (306 registry entries) |
| `check-undeclared-tables.cjs` (local DB) | 304/304 declared |
| chain-integrity | 2/2 |
| migrations from EMPTY (local Postgres 55520) | 306 applied; second run 0 applied / 306 recorded |
| mutation-auth manifest | regenerated, +2 rails (594) |
| new suites | 10/10 DB, 6/6 pure |
| neighbours | declared-completion 16/16, acceptance-rails 20/20, from-state-guards 14/14, booking-birth-provenance 12/12, declared-completion-window 6/6, acceptance-window 5/5, trip-card-status 22/22, booking-visibility 17/17 |
| `grep -c replit.local package-lock.json` | 0 |

## 7 · Proposed CLAUDE.md sentence (not applied — PROPOSED)

> **48. A BUNDLE'S COMPONENTS ARE ROWS, AND A PARTIALLY COMPLETED BUNDLE IS ITS OWN STATE THAT MINTS ONCE OVER
> REDUCED FIGURES (decision-maker ratified Sep 15, 2026 — ledger `2026-09-16-d32-d35-bundle-components`;
> migration 306).** `booking_component_states` is the child-row home for a purchased bundle's components (FK →
> `service_bookings` ON DELETE CASCADE, UNIQUE (booking_id, component_service_id), `status` app-enforced with NO
> CHECK, declared in `shared/schema.ts`), BORN by the checkout claim's composer (`storage.createServiceBooking`,
> the §19d named exemption) from a snapshot that — **D-33** — carries each component's catalog price at purchase in
> cents, SERVER-DERIVED (§14) and never re-read from the listing; the client-facing birth rail strips
> `bundleComponents`/`componentCompletions`. Every component transition is ONE atomic conditional (`pending →
> completed|failed`, parent `confirmed` in the same WHERE); the parent's outcome is the ONE derivation
> `deriveBundleOutcome` (`shared/bundle-component-states.ts`), never stored. **`completed` still means EVERY
> component.** **D-34:** `partially_completed` (code-only, LD 44(e)) is reached exactly when every component has an
> answer, ≥1 delivered and ≥1 failed, from `confirmed` only, NAMING the failed component; it joins the PAID lists
> and the money-integrity invariant, not the terminal, disputable or timer-candidate lists. **D-35:** that flip
> mints ONCE, inside its transaction, through the SAME `mintCompletionEarningsForBooking`, over the row's own
> figures scaled by the delivered share of the snapshot (pro-rata — bundles are discounted), never per component
> and never a rate literal; a NULL snapshot price refuses the flip. **NO BACKFILL:** a legacy bundle is read from
> its jsonb with the source NAMED (`componentStateSource`) and can never be partially completed. **The component
> REFUND is not built:** the whole-row refund rail cannot express it; the owed share is recorded on the row.
