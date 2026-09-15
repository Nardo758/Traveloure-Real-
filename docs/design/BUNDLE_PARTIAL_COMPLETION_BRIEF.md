# Partial bundle completion — the parent says which component failed, and refunds that one

**Status:** DESIGN BRIEF. The ruling is made (decision-maker, 2026-09-15, punchlist **D-9**,
option A); the columns are **not**. No migration is written by this lane. Ledger row:
`2026-09-15-d9-partial-bundle-completion`. Facts verified against `4d1c0c4`.

**The ruling.** When **one bundle component fails after others are delivered**, the parent booking
moves to a **PARTIALLY COMPLETED** state **naming the failed component**. The failed component is
**refunded at its own SNAPSHOTTED price** (the bundle snapshot in `booking_details`, §14), as an
**atomic claim with a Stripe idempotency key** (§15). The **fee ledger reverses only that
component's share**, through the existing proportional partial-refund logic. **Earnings release
per component.** Acceptance and dispute **per component** inherit from **D-6** (artifacts are
accepted) and **D-7** (sessions are seller-declared) — this lane changes neither.

---

## 1 · Facts on the ground today

**A bundle is a `provider_services` row; its contents are a join table.**
`product_shape = 'bundle'`, with `bundle_components` linking bundle → component services
(`shared/schema.ts:1316-1323`, migration 151): `bundle_service_id` FK ON DELETE **CASCADE**,
`component_service_id` FK ON DELETE **RESTRICT** (*"a service inside a bundle cannot be deleted
until removed from the bundle"*), and a `position`. The bundle IS a listing, so the F2 queue, the
storefront read-gates and checkout work on it unchanged.

**Checkout re-verifies every component and snapshots the list — WITHOUT PRICES.**
`server/routes/payments.routes.ts:1054-1075` selects each component's `id`, `serviceName`,
`approvalStatus` and `status`, answers `409 bundle_component_unavailable` if the list is empty or
any component is not approved+active, and stores
`bundleSnapshots.set(id, components.map(c => ({ id: c.id, serviceName: c.serviceName })))` — which
lands on the booking at `:1708-1710` as `booking_details.bundleComponents`. **The snapshot carries
a NAME and an ID and no money at all.** The ruling's "refunded at its own SNAPSHOTTED price" has
nothing to read today; that is **D-33**, and it is the load-bearing gap in this lane.

**ONE parent booking row, one `total_amount`.** A bundle is a single cart line priced off the
bundle listing's own `price`; components are not separate lines and mint no separate bookings.
Everything downstream — the PaymentIntent, the ledger legs, the earnings — hangs off that one row.

**Per-component COMPLETION state already exists; per-component FAILURE does not.**
`booking_details.componentCompletions` is live: `recordBundleComponentCompletion`
(`server/services/booking-completion.service.ts:571-624`) merges `{componentId: ISO timestamp}`
into that jsonb with `jsonb_set` under
`inArray(status, COMPLETION_ALLOWED_FROM_STATUSES)` (`:80` — `["confirmed"]`), refuses any
component id outside the purchase-time snapshot (*"Never invent a component"*, `:592-602`), and
then calls the shared `completeBooking`. The `bundle_components` completion rule
(`shared/service-fundamentals.ts:136,160`; `booking-completion.service.ts:421-449`) completes the
parent **only when every component id has an entry**, and otherwise answers
`bundle_components_incomplete` with the missing ids as evidence. Its comment states today's
disposition plainly: *"PARTIAL COMPLETION NEVER PAYS OUT. There is no partial release path here by
design — a bundle the provider only half-delivered goes to the EXISTING refund lane."* **The
ruling replaces that disposition.** A bundle whose contents cannot be enumerated answers
`bundle_components_unknown` and is never "all complete" by default (`:433`) — §13, and it stays.

**The refund rail is all-or-nothing on the ROW.** `refundServiceBooking`
(`server/services/stripe-payment.service.ts:969`) derives the ceiling from `travelerChargeForRow`,
accepts a server-derived `amountOverride`, and claims with
`UPDATE service_bookings SET status='refunded' WHERE id = ? AND status <> 'refunded'`
(`:1041-1047`), with an **amount-scoped** Stripe idempotency key so a partial and a full attempt
are retry-distinct. **A component refund cannot use it as-is:** it would flip the whole parent to
`refunded` — terminal, unpromotable (`stripeReconciliation.ts:158`), and a lie about the
components that WERE delivered.

**Proportional ledger reversal already exists, and it is booking-scoped.** The cancel path
(`server/routes.ts:7371-7380`) computes `refundFraction = quote.refundPercent / 100`, runs
`reverseEarningsForBooking` **only at 100%**, and calls
`reversePlatformRevenueForBooking(bookingId, now, refundFraction)`. That writer
(`server/storage.ts:5892-5920`) flips every non-reversed `platform_revenue` row for the booking to
`reversed` and inserts a negative compensation row scaled by the fraction. On `fee_ledger` the
shape is `feeType: "reversal"` with `reverses_ledger_id` and its own idempotency key
(`server/services/fee-ledger.service.ts:167-190`), under a `amount <> 0` CHECK
(`server/migrations/179_fee_ledger.sql:77`) and a UNIQUE `idempotency_key`
(`shared/schema.ts:8274`). **A per-component fraction is representable.** What is not
representable is a per-component ORIGINAL: the ledger legs name the booking, not a component.

**Earnings are ONE set per booking, enforced by a unique index.**
`mintCompletionEarningsForBooking` (`server/storage.ts:3354`) inserts `platform_revenue`,
`provider_earnings` and `expert_earnings` with `onConflictDoNothing` targeting
`platformRevenue.sourceId` / `providerEarnings.sourceId` / `expertEarnings.referenceId` (migration
203's partial unique indexes), all born `held` with `availableAt = availableAtFor('service_booking')`.
**"Earnings release per component" cannot be built by minting N rows** — the index refuses the
second. That is **D-35**.

**`service_bookings.status` is `varchar(30)` with NO DB CHECK** (`shared/schema.ts:1426`), so a new
value is a **code change, not a publish trap** (the LD 44(e) posture). But three lists read it and
none would know a new one: `PAID_EQUIVALENT_STATUSES` and `TERMINAL_STATUSES`
(`server/jobs/stripeReconciliation.ts:152-158`), `COMPLETION_ALLOWED_FROM_STATUSES`
(`booking-completion.service.ts:80`), and the SQL of
`paid-service-bookings-have-payment-intent` (`scripts/invariants.mjs:139-151`, which hard-codes
`('confirmed','completed','disputed')`). That is **D-34**.

---

## 2 · The state machine

**Per component:**

```
pending ──> delivered ──> accepted        (artifact: D-6's acceptance; session: D-7's declaration)
   │             │
   │             └──> disputed ──> (admin) ──> refunded
   └──> failed ──> refunded (at its snapshotted price)
```

**The parent is DERIVED from its components, never stated independently:**

| Every component | Parent |
|---|---|
| accepted / completed | `completed` — the existing flip, the existing mint |
| some completed, ≥1 `refunded` or `failed`, none pending | **`partially_completed`**, naming the failed ones |
| any still pending | `confirmed` — unchanged, no flip, the existing `bundle_components_incomplete` |
| all failed / refunded | `refunded` — the existing whole-row rail, unchanged |

**Rules that are not negotiable in the build.**

1. **The parent state is DERIVED, never stored twice (§18 rule 1).** One predicate over the
   component rows decides it, and `resolveCompletionEligibility`'s `bundle_components` arm calls
   that predicate rather than growing a second reading. A stored summary is free to disagree with
   the rows it summarises.
2. **`completed` still means EVERY component.** The existing all-or-nothing test at
   `booking-completion.service.ts:441-448` is **not weakened** — `partially_completed` is a new
   answer beside it, never a looser version of the old one.
3. **Every transition is an atomic conditional (§15).** The component's own flip is a
   `WHERE … AND state = <expected>` claim; the parent's flip goes through
   `storage.updateServiceBookingStatus`'s `expectedFromStatuses` guard (§18b — *"the transition
   itself is the guard"*).
4. **The refund amount is server-derived from the snapshot (§14),** never from `req.body` and
   never from the component listing's CURRENT price — a seller repricing afterwards must not move
   a refund. The Stripe call carries a deterministic **component-scoped** idempotency key
   (`refund-sb-<bookingId>-<componentId>-<amountCents>`), following the amount-scoped shape
   `refundServiceBooking` already uses.
5. **`total_amount` on the parent is NEVER rewritten by a component refund.** §17 derives the
   expected charge by summing `expectedChargeForRow` over the PI's booking rows
   (`stripeReconciliation.ts:276,604`); reducing `total_amount` would raise a false
   `amount_mismatch` on every subsequent pass. The refund is recorded in `refunds` and in the
   ledger, not by editing the charge.
6. **A component refund WRITES a `refunds` row.** §17's kind C skips any Stripe refund whose id is
   already known (`:769-772`) and otherwise raises **critical** `refund_not_reversed` for any
   linked booking whose status is not `refunded` (`:777-796`). A `partially_completed` parent is
   by definition not `refunded`, so a component refund with no `refunds` row would fire a critical
   exception **every single day**. Writing the row is not bookkeeping; it is what keeps the
   detector truthful.
7. **Acceptance and dispute per component inherit D-6 and D-7 and are not re-decided here.** An
   artifact component is accepted; a session component is seller-declared with the existing
   dispute window (`holdWindowDays('service_booking')`). This lane adds no third policy.

---

## 3 · Money posture

**The component price is the snapshot's, and today there isn't one.** Everything in this section
presumes **D-33** rules that the snapshot carries a price. Until it does, a component refund can
only be a fraction someone types — which is the §14 violation this brief exists to avoid.

**The refund.** Server-derived from the snapshotted component amount, clamped to the parent's
remaining refundable balance (`travelerChargeForRow` minus refunds already issued), claimed
atomically on the component row **before** the Stripe call (§15b), with a component-scoped
idempotency key. A retry and two concurrent admins produce **one** Stripe refund.

**The ledger.** `reversePlatformRevenueForBooking(bookingId, now, componentFraction)` already does
exactly the right arithmetic — it is the cancel path's own proportional reversal
(`server/routes.ts:7371-7380`) with a different fraction. The fraction is
`componentAmount / travelerCharge`, computed server-side. **`reverseEarningsForBooking` is NOT
called** for a partial: the cancel path already restricts it to 100% precisely because a partial
reversal would wrongly zero the retained share, and that restriction binds here for the same
reason. On `fee_ledger`, one `reversal` row per component refund, `reverses_ledger_id` naming the
original leg, its own idempotency key carrying the component id.

**Earnings.** The parent's earnings are minted **once, at parent completion**, from the row's
`total_amount` / `platform_fee` / `provider_earnings`. Under the ruling, a `partially_completed`
parent must mint for the delivered components and not for the refunded one. **Two shapes are
possible and the choice is D-35:** (a) mint once at `partially_completed` over the reduced
figures, keeping the one-row-per-booking index intact; or (b) mint per component, which requires
new unique indexes and is a schema change. *Recommend (a)* — it is the smaller change, it keeps
every existing reader correct, and per-component RELEASE is still achievable because release is
driven by `available_at` and `dispute_state` on the earning row, not by how many rows there are.

**What §17 scans, and the one thing it must learn.** A `partially_completed` parent is an
ordinary cart-rail row with a real PaymentIntent, so kinds A and C already cover it — provided
rule 5 (never rewrite `total_amount`) and rule 6 (always write the `refunds` row) hold. The one
addition: `partially_completed` must join `PAID_EQUIVALENT_STATUSES`
(`stripeReconciliation.ts:152`) and the `paid-service-bookings-have-payment-intent` invariant's
SQL (`scripts/invariants.mjs:149`), or it becomes a paid state **no money-integrity check can
see**. It must **not** join `TERMINAL_STATUSES` — a partially completed bundle can still complete.

---

## 4 · Honesty rules (§13)

- **"Partially completed" names the component** — its own `serviceName` from the snapshot, not a
  count or a percentage. "1 of 3 unavailable" says nothing about which day just evaporated.
- **`failed` and `unavailable` are different facts,** exactly as LD 44(e) separates them for
  partner requests: a component the provider could not deliver and a component the provider never
  attempted are not the same sentence, and neither is a component under dispute.
- **The parent is never shown as `completed` while a component is outstanding,** and never as
  `refunded` while delivered components stand. Both are the claims this state exists to stop.
- **Nothing is zero-filled.** A component with no delivery timestamp reads "not delivered yet",
  never "delivered, 0 items". A refund with no snapshotted price is **not issued** — it says the
  price was not recorded and goes to a human, rather than refunding a guessed fraction.
- **No backfill.** A bundle completed or refunded under the old all-or-nothing rule **was**
  completed or refunded under it; rewriting those rows would invent facts about work nobody did
  (the LD 44(e) posture).
- **A bundle whose contents cannot be enumerated stays `bundle_components_unknown`** and is never
  partially completed by default — the existing `:433` behaviour, unchanged.

---

## 5 · Columns proposed — decision rows, not a migration

Filed in `docs/PUNCHLIST.md` §1 as **D-32 … D-35**. Every proposal is additive, **NO DEFAULT and
NO DB CHECK** (publish-trap posture — migrations 181/195/273/275/277/279/281/282/284/287),
**declared in `shared/schema.ts`** (deploy-push durability rule), **no backfill**, and written only
through a pick-based allowlist or a targeted server-side UPDATE (§19).

- **D-32 — a CHILD TABLE or the existing jsonb?**
  *Recommend:* a child table, **`booking_component_states`** — FK → `service_bookings` ON DELETE
  CASCADE, `component_service_id`, `UNIQUE (booking_id, component_service_id)`, `state`
  varchar(20) app-enforced, `delivered_at`, `accepted_at`, `failed_at`, `failure_reason`,
  `refunded_at`, `refund_amount`, `stripe_refund_id`. The existing jsonb works for a timestamp map
  and cannot do the rest: **a jsonb key cannot be the target of an atomic conditional** the way a
  row can, so every §15 claim in §2 rule 3 would become a read-modify-write on the whole document.
  The old map stays readable for historical rows and is written no more.
- **D-33 — does the bundle snapshot carry a PRICE?**
  *Recommend:* **yes** — extend the checkout snapshot at `payments.routes.ts:1074` to carry each
  component's price **as it was at purchase**, alongside `id` and `serviceName`. **Without this the
  ruling cannot be built truthfully**, and the only alternatives are both §13 lies: refund an equal
  share of an unequally-priced bundle, or refund the component's price as it stands today. Old
  rows keep no price, and their refund goes to a human with the reason stated. *Sub-question:*
  whether the component prices must sum to the bundle price. *Recommend:* **no** — a bundle is
  routinely discounted, so the refund is the component's **pro-rata share of what was actually
  charged**, derived server-side, never the raw component price.
- **D-34 — is `partially_completed` a `service_bookings.status` value, and which lists learn it?**
  *Recommend:* **yes**, app-enforced with no CHECK. It joins `PAID_EQUIVALENT_STATUSES` and the
  `paid-service-bookings-have-payment-intent` invariant's SQL; it does **not** join
  `TERMINAL_STATUSES`; and `COMPLETION_ALLOWED_FROM_STATUSES` gains it so a late-delivered
  component can still complete the parent. Every one of those is a one-line change **and a
  deliberate decision** — a status nobody's list knows is a paid state with no oversight.
- **D-35 — how do earnings release per component?**
  *Recommend:* **one mint at `partially_completed` over the reduced figures**, keeping migration
  203's one-row-per-booking unique indexes (`storage.ts:3354`) intact. Per-component earning rows
  are the alternative and are a schema change; per-component *release* does not require them,
  because release is driven by `available_at` and `dispute_state`, not by row count.

---

## 6 · Build sequence, and the negative space

**Schema first, and only after D-32 – D-35 are ruled.**

1. **Lane 1 — the snapshot price (D-33).** Checkout-only, no behaviour change: new bookings carry
   component prices, old ones do not, and every reader states which it is looking at.
2. **Lane 2 — the child table (D-32).** One migration, declared in `shared/schema.ts`, registered
   in `server/migrations/migration-files.ts`. Rows are born at checkout beside the snapshot.
3. **Lane 3 — the derived parent state (D-34)** and the three list changes. The existing
   all-or-nothing completion is untouched; `partially_completed` is a new answer beside it.
4. **Lane 4 — the component refund.** The atomic claim, the component-scoped idempotency key, the
   `refunds` row, the proportional `platform_revenue` and `fee_ledger` reversal. **This is the
   lane that makes the ruling true**, and it must not ship before lane 3 or a refunded component
   has no state to sit in.
5. **Lane 5 — earnings (D-35)**, then surfaces: the traveler's per-component read-out on the
   slip's bookings section (LD 42 **D9** — owner and `payer`-role audience, gated by the same
   `canPayBalance` predicate the route runs), the provider's per-component declaration, the admin
   queue's new reason.

**Negative space — what this brief does not decide, and nobody may take as decided.**

- **Component substitution.** Swapping a failed component for another changes what the traveler
  bought, and needs its own consent and its own price question. Not here.
- **Partial re-pricing.** The parent's `total_amount` is never rewritten (§2 rule 5); a refund
  records money returned and does not restate the sale.
- **Bundles inside bundles.** `bundle_components.component_service_id` has no shape constraint, so
  a bundle could name another — nothing here supports it, and the derived parent state is
  deliberately one level deep.
- **The `bundle_components` ON DELETE RESTRICT posture** and the checkout F2 re-check, unchanged.
- **D-6's acceptance and D-7's declaration.** Inherited per component, re-decided nowhere.
- **Any change to an amount, a rate, a fee band, a payout or the hold window.** None is proposed
  and none may be introduced as a side effect.
