# FOLLOWUPS

Work identified by a lane but deliberately **not absorbed** by it. The repo is the tracker (R4).
Each entry states what was found, why it was not fixed in place, and where the evidence lives.

---

## From the fee-ledger lane (2026-08-06, rulings 47–52)

### FU-1 — SD-2: a paid booking can be cancelled with no refund and no reversal
**Owner lane:** unified-refund system. **Inherits:** the reversal map in `docs/testing/FEE_LEDGER_AUDIT.md` §4
(16 backward paths, their rate behaviour, DB writes, diary posture and transaction boundaries).

A `confirmed` booking — payment captured, `provider_earnings` written — can be cancelled with **zero** refund,
zero earnings reversal and zero `platform_revenue` reversal. Traveler path `server/routes.ts:4837-4853`; provider
path `server/routes.ts:4662-4668`, whose own comment records it as *"a SEPARATE, still-unruled finding (audit
SD-2 / Q2) and is deliberately not changed here rather than silently altered under cover of this fix."*

Not absorbed: this is **money moving wrongly**, not a fee recorded wrongly. The ledger makes it visible; it does
not correct it. Fixing it inside a fee-recording lane would put an unreviewed fourth writer on the money path
(the §17 detect-don't-repair principle).

### FU-2 — Transport affiliate margins are computed and silently discarded
**Evidence:** `FEE_LEDGER_AUDIT.md` §1c.

`server/services/transport-booking-options.service.ts:100-101, 134-135, 483-540` sets `revenueType` and
`revenueRate` on every transport option, but `transport_booking_options` **has no such columns**
(`shared/schema.ts:5290-5366`) and the `...opt` spread at `:184` drops them. Every transport affiliate margin is
calculated and thrown away — silent revenue loss, invisible to every report.

Related, same file: `AFFILIATE_MARGIN_DEFAULTS` (`:275-282`, e.g. `discovercars: 0.10`, `kiwi: 0.06`) and a bare
`?? 0.08` at `:318` are live rate literals carrying **no** `fee-literal-ok` / `fee-literal-debt` annotation
(ruling 32).

### FU-3 — Reversal-diary absence (2 of 16 backward paths)
**Pattern to follow:** #1028's `item_transition_log` write. **Evidence:** `FEE_LEDGER_AUDIT.md` §4.

`item_transition_log` is written on exactly two backward paths — `item-routing.service.ts:137-144`
(`actorType:"refund"`) and `checkout-claim.service.ts:453` (`checkout_claim_expired`). **Every money-ledger
reversal** — earnings flips, revenue reversals, dispute holds, credit releases — writes no transition row at all
(rulings 12/16/18 ABSENCE). The `refund` actor type exists in the vocabulary and is used only for the routing flip.

Also recorded there and worth folding into the same lane: `reversePlatformRevenueForBooking`
(`server/storage.ts:3952-3978`) flips the original row to `status='reversed'` **and** inserts a compensating
negative row that also carries `status='reversed'`, so the admin summary's reversed bucket
(`storage.ts:4288-4327`) reads **~2× the true reversal**. Ruling 52's repoint retires this by construction, but
until the repoint lands the double-count is live.

### FU-4 — D3 copy follow-ups (ruling 50)
Filed explicitly as *not absorbed* by the ruling that created them:
- **`/earn` copy verification** against the final bands. The page computes its percentage live from a band
  (`client/src/pages/earn.tsx:76-80`) rather than hardcoding it, so it will move with the bands — but which band it
  reads must be re-verified against structure C.
- **Checkout line-item label audit** — the traveler service fee is now a first-class disclosed line and must be
  labeled as such, distinctly from the provider-side commission.
- **Business-plan revenue language** — the "4–12%" framing and the Year-1 provider-revenue line understate
  structure C (a disclosed traveler fee plus a category-resolved provider commission). Investor-facing documents
  must not lag the ruled model.

### FU-5 — Admin-assigned band at approval time for custom services (from R1 / ruling 51)
R1 set `Custom / Other` → `moderate` as an **explicit interim** so checkout cannot throw. The durable model is an
admin assigning the commission band explicitly when approving a custom service, rather than the category default
standing in. Not built in the fee-ledger lane by ruling.

**Carries the same need (delta recorded in ruling 51):** categories R1 did not name took `moderate` under the same
interim principle and want explicit assignment —
`Specialty Services`, `TaskRabbit Services`, `Travel Services`, `Trip Services`, `Visa Assistance`, and the four
`Affiliate: *` rows. The `Affiliate: *` bands are **inert** for commission (affiliate resolves `affiliate_standard`
via `source="affiliate"`); they exist only to satisfy R2's `NOT NULL` and should not be read as a statement about
affiliate economics.

### FU-6 — Ledger coverage debt (ruling 52's honest accounting)
The fee-ledger lane covers the cart/provider rail. The census found **56 fee write points across 12 money paths**
(`FEE_LEDGER_AUDIT.md` §1). Every uncovered path carries a `deferred:<path>` marker and the reconciliation output
states coverage on every run — **no silent partial ledger**. The uncovered paths, for planning: legacy `bookings`
rail · request rail (`routes.ts:1398-1442`, which bypasses `fee_bands` entirely for `commissionCalculator` tier
literals with `providerTier` pinned to `1`) · ready-made purchase · template purchase · tips · AI concierge /
coordination · expert review · affiliate margin · payouts.

---

### FU-12 — Crowd Calibration Lane

**Scope:** Fits `calibration_constant × proxy_composite` against external ground truth; constants fitted per season-calendar window.

**Coverage tiers:**
- Market-level, all 8 operating markets: official visitor statistics as ground truth — Kyoto City Tourism Survey/JNTO, VisitScotland/ALVA, INE/Turismo de Portugal, Migración Colombia/MinCIT + Cartagena cruise counts, India MoT state-level stats.
- Neighborhood-level, Kyoto only: NTT docomo Mobile Spatial Statistics (500m-mesh), `licensed_no_resale`, cost-ceilinged.
- Gem-level, ticketed venues only.

**Rendering contract:** Range display with "estimated" label; per-entity earned display (L9 extension); no-calibration fallback → band-only (L11 remains as floor).

**Supporting cross-checks:** Hotel occupancy × inventory; airport passenger stats.

**Blocked on:** ≥1 full season of `trend_signals` proxy history (Phases 2–3 output) + docomo MSS quote.

**Leon-side action (not agent work):** Request docomo MSS pricing for Kyoto 500m-mesh — long lead time expected, start early.

---

Related literal debt surfaced by the same census and not owned by any lane yet: `PROCESSING_FEE_RATE = 0.03`
(`server/services/commission.ts:57`, `fee-literal-debt:#PS2`) is the **only live rate with no `fee_bands` row**,
applied at six write points; `pricing.service.ts:23`'s deposit `0.25`; `commissionCalculator.ts:41-46, :72`;
`storage.ts:3742`'s referral `'50'`; and a client-side `subtotal * 0.12` in
`client/src/components/booking/BookingFlowModal.tsx:151, :258` that matches no resolved band.
