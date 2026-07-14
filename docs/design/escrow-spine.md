# Escrow / Hold / Release Spine — Design Brief

**Status:** Design ratified (decisions 1–5 locked Jul 14, 2026). **Not yet implemented.** This is the design of record
for how earnings are held and released; payout is its downstream half. Filed follow-ups that belong here (do NOT build
standalone): provider/expert self-service payout requests (retired to this design — see CLAUDE.md §"Payout rail"),
refund earnings-reversal (§14 A2), the stuck `pending` revenue-tracking earnings.

**Decision-maker:** User. Sub-decisions I made under delegated authority (dispute model, window defaults) are flagged
**[my call]** and can be overridden.

---

## TL;DR

The Stripe rail already gives us **custody** and the ledger already has a **partial timer-hold** — this is a
**formalize-and-unify**, not a build-from-scratch. We keep the money architecture (separate charges & transfers; funds
sit on the platform balance) and replace the inconsistent, timer-only proto-hold with **one earning state machine**
across expert + provider earnings: `held → releasable → paid_out`, plus `reversed` for refunds/disputes. Release is
gated on a **delivery signal + a per-surface clearance window**, with a **traveler confirm** (release early) and a
**traveler dispute** (block release, admin resolves) as the two symmetric signals.

---

## As-is (grounded in the code)

### The Stripe rail already holds the money
- Checkout is a **plain platform PaymentIntent** — `stripe.paymentIntents.create` with no `transfer_data` /
  `application_fee` / `on_behalf_of` (`server/services/stripe-payment.service.ts:85`, `:457`). The customer pays the
  **platform**; funds land on the **platform Stripe balance**.
- Release to a provider/expert is a **separate `stripe.transfers.create`** to their Connect account
  (`server/services/stripe-connect.service.ts:104`), invoked by the admin payout path (`PATCH /api/admin/payouts/:id`,
  idempotency-safe — CLAUDE.md §15 FIX 1).
- **Implication:** this is the *separate charges and transfers* model. The platform balance **is** the escrow account —
  custody exists by construction. We do **not** need destination charges or `on_behalf_of`; do not change the charge model.

### The ledger already has a partial timer-hold
- Earnings are rows in `expert_earnings` / `provider_earnings` with a `status` and (on the booking path) an `availableAt`.
- **Booking earnings** are created at **completion** — `updateServiceBookingStatus`, `isFirstCompletion =
  status === "completed" && priorStatus !== "completed"` (`server/storage.ts` ~1408) — as `status:'available'` with
  `availableAt = now + EARNINGS_HOLD_DAYS` (env, **default 7 days**, `storage.ts:1413`).
- `getProviderEarningsSummary` (`storage.ts:3176`) treats `status='available' && availableAt > now` as **held**
  (shown as *pending*), `availableAt <= now` as **releasable** (shown as *available*), `paid_out` as paid. Admin payout
  only transfers the releasable slice.

### The gaps (this is what "credits early, no hold" really means)
1. **Two divergent ledger conventions.** Booking path → `available` + `availableAt`. Revenue-tracking path
   (coordination/optimize, `server/services/revenue-tracking.service.ts:92,104`) → `status:'pending'` with **no
   `availableAt` and no transition** → those earnings never clear (stuck *pending* forever).
2. **Expert vs provider vocab divergence.** Expert summary keys on `pending`/`confirmed` (`storage.ts:3164`); provider
   on `available`/`paid_out`. Two state machines for one concept.
3. **Release is timer-only, not delivery/dispute-gated.** Past booking-completion the only gate is the clock. There is
   no traveler confirmation and no dispute hold — if `completed` is provider self-attested, the timer is the sole guard.
4. **Refund does not reverse the earning.** `createRefund` (`stripe-payment.service.ts:357`) flips the booking to
   `refunded` + records the Stripe refund, but never reverses `expert_earnings`/`provider_earnings`/`platform_revenue`
   (CLAUDE.md §14 A2). A refunded booking's earning stays payable.

---

## Ratified decisions

| # | Decision | Ratified |
|---|----------|----------|
| 1 | **Release signal = BOTH** — auto-confirm N days after the provider marks the booking completed, **and** a traveler "Confirm completion" action that releases early (auto unless the traveler acts sooner). | ✔ |
| 2 | **Per-surface clearance windows** — the hold window is configurable per surface (bookings / coordination / template sales), not one global constant. | ✔ |
| 3 | **Dispute model [my call]** — during the clearance window a traveler may **raise a dispute**, which **blocks** `held → releasable`. **Admin resolves**: uphold → `reversed` (refund + earning reversal); reject → `releasable`. Symmetric to traveler-confirm; resolution stays admin-only to bound scope. | ✔ |
| 4 | **Reversal only while `held`/`releasable`** — no automated post-`paid_out` claw-back. A refund/dispute after payout is a manual/admin concern (documented limitation), not part of the automated spine. | ✔ |
| 5 | **Unify to one `earning_status` enum** across both earning tables, with a backfill mapping the current values. | ✔ |

---

## The spine — one earning state machine (expert + provider, identical)

```
                       ┌─────────────────────── traveler raises dispute ──────────────┐
                       ▼                                                               │
   [charge captured]  held ──(delivery confirmed AND window elapsed, no dispute)──▶ releasable ──(admin transfer)──▶ paid_out
        │              │                                                               ▲
        │              │   traveler "Confirm completion" (early release, no dispute) ──┘
        │              │
        │              └──(refund OR dispute upheld)──▶ reversed
        │                                                   ▲
        └── (refund/dispute upheld while releasable) ───────┘        paid_out ──✗──▶ (no automated claw-back — manual)
```

**States (the unified `earning_status`):**
- **`held`** — earning exists but is not payable. Entered at earning creation (booking completion, or coordination/
  template revenue event). Carries `availableAt` (clearance deadline) + a `dispute_state`.
- **`releasable`** — delivery confirmed + window elapsed + no open dispute. Payable; counts toward `available` balance.
- **`paid_out`** — an admin payout transfer for this earning has settled.
- **`reversed`** — refund or upheld dispute clawed it back **while held/releasable** (+ matching `platform_revenue`
  reversal). Terminal.

**The missing transition (the core of the build):** a scheduled job flips `held → releasable` when
`delivery-confirmed AND now >= availableAt AND no open dispute`. Today nothing performs `held → releasable` for the
`pending` path — this job is what makes the hold actually clear consistently.

### Release semantics (decisions 1–3)
- **Delivery confirmed** = provider marks the booking `completed` **and** (traveler taps "Confirm completion" **OR**
  the auto-confirm grace period elapses with no dispute). Auto-confirm grace + clearance window may be the same clock or
  two stages — see sub-decision A.
- **Clearance window** = per-surface config (decision 2). Resolve via config/`fee_bands`-style settings, **not literals**
  (the existing `EARNINGS_HOLD_DAYS` env becomes the *bookings* default within a per-surface config map).
- **Dispute** (decision 3) = a traveler action during the window sets `dispute_state='open'`, which the release job
  treats as a hard block. Admin resolves via the existing admin surface: uphold → `reversed` + refund; reject →
  clears `dispute_state`, allowing normal release.

### Refund / dispute reversal (decisions 3–4, closes §14 A2)
- Reverse is allowed only from `held`/`releasable`: set the earning `reversed`, write the compensating
  `platform_revenue` reversal, and (for a refund) the Stripe refund already exists — wire the ledger side that A2 left open.
- From `paid_out`: **no automated reversal.** Surface it to admin (the funds already left the platform balance); a
  negative-balance/next-payout-offset model is explicitly out of scope (decision 4).

### Payout (unchanged)
- Admin-initiated transfer of the **`releasable`** balance stays the payout model of record (self-service deferred to
  this design). `getProviderEarningsSummary.available` becomes "sum of `releasable`"; the payout amount stays
  server-derived + capped + idempotent (§14/§15 hold).

---

## Stripe mapping (what changes vs stays)
- **Custody: unchanged.** Funds stay on the platform balance between charge and transfer. No destination charges, no
  `on_behalf_of`, no Stripe-held escrow product. The state machine is a **ledger overlay** on money Stripe already holds.
- **Release: unchanged mechanism.** `held → releasable` is a DB transition; the actual money move is still the existing
  admin `transfers.create` (idempotent). We are gating *which* earnings that transfer may include, not how it transfers.
- **Refund: unchanged Stripe call.** `createRefund` stays; we add the ledger reversal it currently omits.

---

## Migration (decision 5)
- Add one `earning_status` value set to **both** `expert_earnings` and `provider_earnings` (DB CHECK per the
  migration-109/110 lesson): `held, releasable, paid_out, reversed`. Add `dispute_state` + ensure `availableAt` exists
  on both.
- **Backfill mapping** (future-inserts get the new default `held`; existing rows grandfathered by value):
  - provider `available` + `availableAt > now` → `held`; `available` + `availableAt <= now` → `releasable`;
    `paid_out` → `paid_out`.
  - expert `pending` → `held` (+ set `availableAt` = created + default window so they can finally clear); `confirmed`
    → `releasable`; any paid marker → `paid_out`.
  - the stuck revenue-tracking `pending` rows are swept into `held` with a computed `availableAt` — fixing gap 1.
- Guard/idempotent; grandfather existing rows (no outage), same posture as migration 111.

---

## Phased build (behind this design; each phase its own money-path PR, real read before merge)
1. **Ledger unification** — migration (enum + `dispute_state` + `availableAt` on both) + backfill; collapse the two
   summary functions onto the one vocabulary. No behavior change yet beyond consistency. (Closes gaps 1–2.)
2. **Release job** — the scheduled `held → releasable` transition (delivery-confirmed + window + no dispute). Per-surface
   window config. (Closes gap 3's timer-consistency half.)
3. **Traveler confirm + dispute** — the two signals (decision 1 early-release + decision 3 dispute-block) + admin
   dispute resolution wired to the existing admin surface.
4. **Refund/dispute reversal** — the `held/releasable → reversed` + `platform_revenue` reversal (closes §14 A2);
   post-payout stays manual (decision 4).
5. **(Deferred, only if wanted later)** self-service payout request UI — built here, once, on top of a real release model.

---

## Open sub-decisions (defaults I'll take unless you say otherwise)
- **A. Auto-confirm grace vs clearance window** — one stage or two? **[my default]** two: auto-confirm grace (e.g. 3 days
  after provider-completed, traveler silence = confirmed) *then* the clearance window (e.g. bookings 7 days) runs. Simpler
  is one combined window; two stages separates "did it happen" from "dispute settling time." I lean two.
- **B. Per-surface window defaults** **[my default]** bookings 7d (keep `EARNINGS_HOLD_DAYS`), coordination 7d,
  template sales 14d (digital, higher chargeback tail) — all config, tune freely.
- **C. Dispute resolution surface** — reuse the admin console (like the `/api/admin/provider-services` review queue) vs a
  dedicated disputes view. **[my default]** reuse admin, add a disputes filter; dedicated view later if volume warrants.

---

## What this does NOT change
- The Stripe charge model (platform PaymentIntent + separate transfer).
- Admin-initiated payout as the payout model of record; self-service stays deferred (this is its home when built).
- The §14 server-derived-amount and §15 idempotency invariants — every money move here still obeys them.
