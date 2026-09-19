# Concierge Booking — universal fulfilment design

**Target path:** `docs/design/CONCIERGE_BOOKING_UNIVERSAL_DESIGN.md`
**Status:** DESIGN — rulings recorded in §15 (2026-09-19); build gated on CB-8 numbers and the companion audit.
**Grounded at:** `main` @ `8627116`. Companion: `docs/audits/booking-process-e2e-audit.md` (BP-1, BP-3, BP-5, BP-6 are prerequisites and are referenced, not restated).
**Product position this serves (decision-maker, 2026-09-18):** the concierge MAKES the booking. The traveler is billed first, then the purchase is made, in the traveler's name. A traveler pressing buy on a partner page is not this product.

---

## 1. The design in one paragraph

Every partner — link-only affiliate, merchant API, or anything that arrives later — is fulfilled through **one partner-agnostic pipeline** with **one swappable step**. The pipeline is: *hand-off → prepare → firm quote → traveler funds it on-session → purchase → write the plan → confirm → settle*. The swappable step is *purchase*, behind an adapter chosen by a **partner fulfilment profile** that is data, not code. Onboarding a new affiliate partner is filling in a profile. Onboarding a new API is a profile plus one adapter. Nothing else in the pipeline, the money path, the plan write or any surface changes.

## 2. Alternatives rejected

| Alternative | Why not |
|---|---|
| Traveler presses buy on the partner page | Not the product (ruled). Survives only as the honest fallback for an unprofiled partner, never sold as concierge. |
| Autofill the traveler's saved method into partner checkouts | Impossible (Stripe never releases the credential; wallets are merchant-scoped) and the PAN-holding variant breaks SAQ-A (MONEY_MAP §0a). |
| Charge per stop off-session at purchase time, under a spending mandate | Off-session declines strand half-booked trips; mandate machinery is new surface area. One on-session charge guarantees funds with the traveler present. |
| Authorization holds captured per stop | ~7-day expiry; multi-capture is not generally available; N holds means N SCA prompts. |
| Per-partner bespoke flows | The §18 rule 1 drift class at the scale of the whole supply side. This document exists to refuse it. |
| Reuse `booking_component_states` for stops | Its key is `component_service_id → provider_services`; a partner stop is not a listing. D-51's **settlement semantics** are reused; its table is not. |

## 3. The partner fulfilment profile (what makes it universal)

Additive nullable columns on `affiliate_partners` — NO DEFAULT, NO CHECK, declared in `shared/schema.ts`, no backfill. Value sets stated ONCE in a new `shared/partner-fulfilment.ts`, app-enforced.

| Column | Values | Meaning |
|---|---|---|
| `fulfilment_method` | `concierge_custody` · `api_merchant` | How *purchase* happens. **NULL = unprofiled ⇒ not concierge-bookable** (§13: absence is an answer; default-deny). |
| `agency_commission` | `allowed` · `denied` · NULL | Whether the program pays commission on bookings we make on a traveler's behalf. Only `allowed` routes the purchase through the tracked link. NULL is treated as `denied` and said so. |
| `agency_commission_evidence` | text | Where permission came from (program page + date, email + date). Required to set `allowed`. |
| `confirmation_source` | `api_response` · `network_report` · `custody_evidence` | What partner-originated fact may write `confirmed` (D-10, extended by CB-7). |
| `cancellation_channel` | `api` · `manual` | Who can cancel after purchase. |
| `settlement_currency` | ISO 4217 | What the partner charges in. Drives the FX buffer (§6). |
| `profile_reviewed_at` / `_by` | — | A profile is an admin act with an actor (§14). |

**Future methods are one value plus one adapter.** A partner that accepts a forwarded card or a Stripe Shared Payment Token becomes `api_forwarded_credential`; nothing upstream or downstream of *purchase* learns about it. They are named here and **not built** — no adapter, no enum value in code, until a partner says yes.

## 4. The adapter contract

```ts
// server/services/partner-fulfilment/adapter.ts
interface PartnerFulfilmentAdapter {
  /** Live price, availability and cancellation terms — or null WITH a reason. Never invents. */
  prepare(line: PurchaseLineInput): Promise<PreparedPacket | { unavailable: string } | { unreadable: string }>;
  /** Called only inside a won claim. Idempotent on line id. */
  purchase(line: FundedLine): Promise<
    | { kind: "purchased"; reference: string; evidence: PartnerEvidence }   // api
    | { kind: "awaiting_human"; cardRef: string; openPath: string }          // custody
    | { kind: "refused"; reason: "price_moved" | "sold_out" | "partner_error" }>;
  cancel(line: PurchasedLine): Promise<{ kind: "cancelled" | "manual_required"; refundExpectedCents?: number }>;
}
```

Exactly two implementations are in scope:

- **`concierge-custody.adapter.ts`** (needed now). `prepare` = the EXISTING verification leg (`booking-verification.service.ts` — extended, never forked, LD 44(a)). `purchase` issues a single-use virtual card and returns the gated `/open` path; the human completes it. `cancel` returns `manual_required`.
- **`musement.adapter.ts`** (lands with the Musement ruling). `prepare` = availability + price API. `purchase` = the no-payment merchant checkout. `cancel` = API.

**Adapter conformance suite:** one shared set of vectors every adapter must pass — null-with-reason on an unreadable product, second `purchase` on the same line is a no-op, a price above the funded amount is `refused` never purchased, currency is reported never assumed. A new adapter is mergeable when the suite is green; that is the universality guarantee, enforced in CI.

## 5. The pipeline (identical for every partner)

| # | Stage | What happens | Exists? |
|---|---|---|---|
| S0 | **Hand-off** | Checkout of a `booking_concierge` line creates one `affiliate_booking_requests` row per partner stop, linked by `itinerary_item_id`. | ✅ landed `2026-09-18-concierge-handoff` |
| S1 | **Prepare** | `adapter.prepare` per request → a packet snapshot (product, slot, party, price, currency, cancellation terms, captured-at, source). Request → `ready_to_buy`, `unavailable`, or stays `researching` with the reason. | verification leg exists; packet carrier is LD 44's open question → CB-3 |
| S2 | **Quote** | ONE `service_quotes` row on the concierge listing for the prepared stops, with one child **purchase line** per stop. Amount = Σ line amounts + FX buffer + fee (CB-2). Short expiry from config. Unavailable stops are excluded **and named**. | `service_quotes` ✅; lines new |
| S3 | **Fund** | Traveler accepts on-session (saved method / wallet, one tap). `acceptQuote` mints the `pending` booking; **checkout charges the pre-born booking (audit BP-1)**. Lines → `funded`. | blocked on BP-1 |
| S4 | **Purchase** | Per line: atomic claim `funded → purchasing` (TTL reclaim) → `adapter.purchase`. Custody: virtual card limited to the line's funded amount, concierge buys in the traveler's name through `/open` (tracked only if `agency_commission='allowed'`), records the reference → `purchased_by_human`. API: `purchased_by_api`. | new |
| S5 | **Plan write** | The **linked** itinerary item is updated in place (`status='booked'`, reference). Never a second item (audit P1-4 / BP-5). Never `routing_status='purchased'` (LD 44). | superseded@cde3145 — Lane P landed (linked requests) |
| S6 | **Confirm** | By `confirmation_source`: API response, the sub_id matcher, or custody evidence (CB-7). The same linked item upgrades. | matcher ✅ |
| S7 | **Settle** | Actual < funded ⇒ refund the difference. Refused/unavailable ⇒ refund the line + its proportional fee share. Through the ONE shared refund issuer, amount-specific keys (D-51 precedent). Dearer than funded ⇒ never bought: line → refund, request → `flagged`, a superseding quote is issued. | refund issuer ✅ |
| S8 | **Complete** | The concierge booking may be declared complete only when every line is terminal (audit BP-6). LD 51's expert share mints there, unchanged. | guard new |
| S9 | **Post-purchase cancel** | The **snapshotted partner terms** govern. Concierge (or API) cancels; the traveler is refunded **what the partner actually returned**, after it arrives on the card — never fronted. | new |

### Two state axes, never merged

- **Request status** (`affiliate_booking_requests.status`) — the WORK: LD 44(e)'s vocabulary, unchanged.
- **Line money state** (new) — the MONEY: `quoted → funded → purchasing → purchased → settled`, with `refund_due → refunded` and `expired`. Every transition an atomic conditional with a named from-state list in `booking-from-states.ts`.

## 6. The money rules

1. **Bill first.** No partner purchase without a `funded` line. The virtual card cannot be minted from any other state.
2. **Amounts are server-derived (§14).** Funded amount = the line snapshot. **Actual spend = the Stripe Issuing authorization/transaction webhook, never a number a human types.** The existing human-typed `price` on the PATCH rail stops being a money input for custody lines.
3. **The card is the price guard.** Spending limit = the line's funded amount (incl. FX buffer), single-use, merchant-locked where the partner's descriptor is known. A drifted price is *declined by the card*, not caught by a person.
4. **Idempotency (§15).** Claim per line; card create keyed `cc-line-<lineId>`; refunds keyed `cc-refund-<lineId>-<cents>`.
5. **A paid-but-unbooked state cannot stand (blueprint rule 3).** A `funded` line not `purchasing` within the config SLA, or a quote-born booking whose lines all expire, refunds automatically.
6. **Principal is pass-through, not revenue.** `platform_revenue` records the fee only. The line row is the custody record: `funded_cents`, `spent_cents`, `partner_refund_cents`, `traveler_refund_cents`. Terminal invariant per booking: `charged = Σspent + Σtraveler_refund + fee`.
7. **FX.** All eight markets settle in non-USD. The quote is USD with a config FX buffer per `settlement_currency`; the unused buffer is refunded at settle. Cross-border card cost belongs in the fee ruling (CB-2), not hidden in the buffer.
8. **Funding.** Issuing balance is fed from the payments balance; a standing float covers the capture-to-available gap. Float size is an operator decision, recorded in the ledger.
9. **Reconciliation (§17, detect-never-repair).** New kinds: `custody_spend_without_line`, `line_purchased_without_spend`, `partner_refund_not_passed_on`, `funded_line_past_sla`, `custody_invariant_broken`.

## 7. Schema (all additive; each needs ratification — CB-3)

- `affiliate_partners`: the seven profile columns of §3.
- **`concierge_purchase_lines`** — child of `service_quotes` (CASCADE), FK → `affiliate_booking_requests` (SET NULL), `UNIQUE (quote_id, request_id)`. Packet snapshot (jsonb, server-authored, §19-stripped), `currency`, the four money columns of §6.6, `money_state` (varchar, no CHECK), `issuing_card_ref`, `partner_reference`, the usual timestamps. No `createInsertSchema`; admission by `.strict()` picks.
- `service_bookings`: nothing. The quote-born booking IS the money record (canonical rail, D-12), so refunds, disputes, the fee ledger and reconciliation apply unchanged.
- No fourth booking store (LD 44's negative space holds): the request holds the work, the booking holds the money, the lines join them.

## 8. Who may do what

| Actor | May | May not |
|---|---|---|
| Traveler | accept/decline the quote; cancel a line under the snapshotted terms | be charged off-session; be charged more than the accepted quote |
| Expert (owns a concierge listing) | prepare lines to `ready_to_buy`; earn the LD 51 share | issue a quote amount by hand; hold a card; press buy (CB-5) |
| Platform concierge | claim a funded line, receive its card, purchase, record the reference | purchase an unfunded line; type the spent amount |
| Copilot | run `prepare`, draft the packet and the traveler message | spend money in any form (LD 44(f), unchanged) |
| API adapter | purchase a funded line | run outside a won claim |
| Admin | review partner profiles; work reconciliation exceptions | write `confirmed` |

Audit P2-6 closes here: `/open` and the purchase rail admit the owner, the line's claimer and admin — not "any expert".

## 9. Surfaces

- **Traveler:** the quote card (stops, amounts, partner terms per stop, what was excluded and why, expiry) on the slip and My Bookings → Quotes; per-stop outcome on the slip's bookings section and the Trip Card rail. Visible **pre-final** (audit P2-7).
- **Chooser:** "Have it booked" adds the market's concierge listing to checkout (audit BP-3). The free agent lane is retired.
- **Concierge console:** pooled/assigned queue → packet → *Issue card & open* → record reference. One screen, method-agnostic; an API line shows its result instead of the button.
- **Admin:** partner profile editor with evidence field; custody reconciliation view.

## 10. What this amends

| Ruling | Amendment |
|---|---|
| LD 43(c) "affiliate purchases never see wallets / no PaymentIntent" | Stands for traveler-direct purchases. A **concierge-custody** purchase is funded by a platform PaymentIntent. |
| LD 44(c) one-click human purchase "with their own payment method" | The platform concierge purchases with a platform-issued single-use card funded by the traveler's accepted quote. "No card typed by automation" stands. |
| LD 44 negative space ("touches no §14/§15/§17 invariant") | No longer true; §6 above is the replacement and is stricter. |
| D-7 expenses = "not yet" | Built, **for the platform concierge only**, in exactly D-7's recorded target shape: quoted and approved before incurred, charged on platform rails, refunded by the same route. |
| D-10 `confirmed` needs partner evidence | Extended by CB-7 for partners with no report. |
| MONEY_MAP §0a | Gains a fourth archetype: **A-custody** — we collect, a human fulfils with an issued card. Blueprint rules 1–5 apply verbatim. |

## 11. Rulings needed

| ID | Question | Recommendation |
|---|---|---|
| CB-1 | Adopt custody purchasing for the platform concierge (the §10 amendments). | Yes. |
| CB-2 | Fee under custody. | Base = partner principal; rate/cap as `fee_bands` rows; cross-border card cost priced in; the 7% traveler fee does **not** stack on pass-through principal. |
| CB-3 | Schema of §3 and §7; packet carried as a server-authored jsonb snapshot on the line. | Yes — this also answers LD 44's open "packet carrier" question. |
| CB-4 | Firm quote, on-session accept, true-up by refund only, config expiry. | Yes. |
| CB-5 | Who presses buy. | Platform concierge and API adapters only. |
| CB-6 | Tracked link on custody purchases only where `agency_commission='allowed'` with evidence. | Yes; NULL reads as denied. |
| CB-7 | For a partner with no API response and no network report, what writes `confirmed`? | A settled Issuing transaction at that merchant **plus** an attached partner voucher. Both partner-originated; neither typed. |
| CB-8 | SLA and buffers (purchase SLA, quote expiry, FX buffer per currency, price tolerance = 0). | Config, never literals; you set the numbers. |
| CB-9 | Accounting presentation of principal (net vs gross). | Net — but confirm with your accountant; the line columns support either. |

## 12. Build sequence — HARD STOP until §11 is ruled

Serial, one lane per branch, every lane Phase 0 read-only first, money lanes human-read before merge.

0. **Outside code, start now:** Stripe Issuing application + balance-transfer access; Travelpayouts project declaration and per-brand agency-booking confirmations (feeds `agency_commission`); seller-of-travel read.
1. **Audit Lane P** — purchase updates the linked item (BP-5). Prerequisite for anything traveler-visible.
2. **Audit Lane C** — checkout charges a pre-born booking (BP-1). Prerequisite for S3.
3. **Lane 1 — profile + vocabulary.** §3 columns, `shared/partner-fulfilment.ts`, admin editor, default-deny proven.
4. **Lane 2 — lines + quote.** `concierge_purchase_lines`, S1–S2, traveler quote card. No money moves.
5. **Lane 3 — fund + custody purchase.** S3–S5, Issuing, the adapter interface with its ONE implementation, the conformance suite. **Test-mode Issuing only until the Lane-0 items are done.**
6. **Lane 4 — settle, cancel, complete.** S7–S9, reconciliation kinds.
7. **Lane 5 — chooser + visibility** (BP-3, P2-7).
8. **Musement adapter** — when its brief is ruled. The proof of universality: it must land without touching Lanes 2–5's code.

## 13. What not to do

- No adapter, enum value or column for a method no partner has agreed to.
- No second charge rail beside `/api/checkout`; no "pay this quote" endpoint.
- No human-typed amount reaches a money decision on a custody line.
- No card minted for an unfunded line; no card without a spending limit.
- No `routing_status='purchased'` from any partner rail; no second plan item for a linked request.
- No refund to the traveler of partner money that has not come back.
- No backfill of existing requests into lines; pre-existing rows stay on the old rail and say so.
- Do not touch the cart rail's claim/authorize/promote spine except where BP-1 rules.

## 14. Not verified

- Stripe Issuing approval for this use case, and the balance-transfer gating, are Stripe's to grant.
- `acceptQuote`'s internals and the checkout claim composer were read at outline depth only; Lane C's Phase 0 owns the detail.
- Whether any current program page actually grants `agency_commission` — the allowlist is empty until Lane 0 returns.
- Merchant-lock feasibility per partner (descriptor stability) — unknown until first purchases.
- Nothing here has been executed.

## 15. Rulings recorded (decision-maker, 2026-09-19)

- **CB-1 adopted:** custody purchasing for the platform concierge, with the §10 amendments.
- **CB-2 RULED DIFFERENTLY FROM THE RECOMMENDATION:** the fee is the ALREADY-RATIFIED Booking Concierge fee (Locked Decision 51): rate × the concierge LISTING's price, capped by the band's `max_amount`, split expert/platform from the share band. It is NOT re-based on partner principal; custody principal is pure pass-through with NO second fee; the 7% traveler service fee rides the concierge listing line as it does every cart line and does NOT apply to pass-through principal. Cross-border card cost is NOT priced into the fee by this ruling; if it needs a home, that is a later band ruling.
- **CB-3 adopted** (schema of §3 and §7; packet as server-authored jsonb on the line) — ratification of the SHAPE; each migration still lands under the standing additive/no-CHECK/declared-in-schema rules.
- **CB-4 adopted. CB-5 adopted. CB-6 adopted (NULL reads denied). CB-7 adopted.**
- **CB-8:** config, never literals; NUMBERS NOT YET SET — Lane 3 may not start until the decision-maker sets them.
- **CB-9:** NOT RULED — awaiting the accountant.
- **Prerequisites status:** BP-1 (checkout charges a pre-born booking) LANDED via PR #988 (merge `ac8be15`, with the traveler fee per ledger `2026-09-19-quote-born-traveler-fee`); the companion audit `docs/audits/booking-process-e2e-audit.md` is NOT in the repo — BP-3/BP-5/BP-6 are therefore unverified references until it is committed; Lane P (purchase updates the linked plan item) is NOT started; Lane 0 operator items (Stripe Issuing application, Travelpayouts agency-booking confirmations, seller-of-travel read) are the decision-maker's. superseded@cde3145 — Lane P landed (linked requests).
- **Build sequence status:** HARD STOP stands until CB-8 numbers exist and the audit is committed; Lanes 1–2 may be briefed.
