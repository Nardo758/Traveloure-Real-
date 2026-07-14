# Booking Payment-Custody Map (A2 earnings-reversal preflight)

**Status:** ✅ READ-ONLY audit complete. Verified on `origin/main` (post-`9d170e09`). No code changed.
**Purpose:** establish who holds the money per booking type, and what "refund" means for each, so A2's earnings-reversal fix branches on reality rather than assumption.

## Custody map

| Booking type | Table | Who captures payment | What Traveloure earns | Ledger credited (mint) | Reaches `/api/bookings/refund`? |
|---|---|---|---|---|---|
| On-platform **cart/instant** | `bookings` (legacy) | **Traveloure Stripe PI** (`booking.service.ts:393`) | — | **NONE** — `// TODO: Update provider earnings` (`booking.service.ts:584`); mints nothing | **YES** (the only rail it touches) |
| On-platform **service** (canonical) | `service_bookings` | **Traveloure Stripe PI** | platform fee + provider/expert cut | `platform_revenue` + `provider_earnings` + `expert_earnings`, gated on →`completed` (`storage.ts:1360-1410`) | **NO** |
| **Marketplace** template | `template_purchases` | **Traveloure 2-step PI** | platform commission + expert cut | `expert_earnings` (`routes.ts:4714`) + `platform_revenue` (`storage.ts:2871`) | NO |
| **Optimization fee** | `itinerary_comparisons` → | Traveloure PI (`optimization.routes.ts:260`) | 100% platform | `platform_revenue` (`revenue-tracking.service.ts:73`) | NO |
| **Concierge / expert advisory** | `expert_requests` | Traveloure PI (`metadata.type='expert_service'`) | fee | none minted at pay time | NO |
| **Coordination fee** | `coordination_states` | **nothing captured** — quote-only (`routes.ts:8241`), no PI wired | — | — | NO |
| **Affiliate** (OTA/Partnerize/Viator/12Go/…) | `affiliate_booking_requests`, `transport_booking_options` (`bookingType='affiliate'`) | **CLIENT-DIRECT — the OTA charges the traveler; Traveloure never touches the money** (`affiliate.service.ts:244-296` build URL only; `content.routes.ts:6296` price=null, no PI) | commission **projection** | `affiliate_conversions` / `affiliate_links.total_revenue` (`affiliate.service.ts:361`); `affiliate_earnings` only via reconciliation, no live booking caller | NO |

## Verdicts

### Q1 — Custody IS distinguishable (not conflated)
The discriminator is **table identity + presence of a `stripePaymentIntentId` column**, not one universal field. On-platform captures live only in `bookings`/`service_bookings` (both carry a Stripe PI). Affiliate lives in dedicated tables with **no** Stripe PI (they carry `partnerName`/`affiliateUrl`/`source`/`affiliateCode`). `transport_booking_options` is the one table mixing platform+affiliate, but labels each row explicitly (`bookingType`, `source`). **No table conflates a captured Traveloure charge with a client-pays-OTA affiliate row.** → No schema change is required for a refund path to branch on custody.

### Q2 — Affiliate is client-direct (the load-bearing fact, confirmed)
The traveler's card is charged **directly by the partner**; Traveloure only builds a redirect and logs the click (`affiliate.service.ts:326`, `content.routes.ts:7230/7263`). There is **no Traveloure PaymentIntent and no pass-through charge** anywhere in the affiliate path. Traveloure earns a commission recorded as a *projection* (`affiliate_conversions`), settled later against partner reports by `affiliate-reconciliation.service.ts`. → **A refund of affiliate content is the OTA's job, not Traveloure's;** Traveloure's only money action is reversing its commission projection.

### Q3 — `/api/bookings/refund` is on-platform-only; affiliate cannot reach it
The endpoint (`bookings.ts:341` → `createRefund` `stripe-payment.service.ts:357`) operates **exclusively on the legacy `bookings` table**. Affiliate `external` cart items write **no DB row at all** (`booking.service.ts:455-488`), and affiliate content persists in tables the endpoint never reads. **So "refund a charge you never captured" is not reachable** — the affiliate-guard A2 worried about is already satisfied by table structure.

### Q4 — No path reverses any earnings ledger on refund (confirmed)
`expert_earnings`, `provider_earnings`, `platform_revenue`, and the affiliate projection are **never reversed** on refund/cancel. `createRefund` and the `charge.refunded` webhook flip a status and insert a `refunds` row but touch no ledger (`stripe-payment.service.ts:388-398`, `:338-351`); disputes deliberately **do not** auto-claw-back (`webhooks.routes.ts:424`).

## Two defects the audit surfaced in the refund path itself
1. 🔴 **Wrong-PaymentIntent bug** — `createRefund` ignores `bookings.stripe_payment_intent_id` (which exists, `schema.ts:5366`) and resolves the PI by `JOIN payment_intents pi ON pi.user_id = b.user_id … LIMIT 1` (`stripe-payment.service.ts:363-366`). For any user with >1 PI it refunds an **arbitrary** charge of theirs — a different booking's, or a platform fee. Wrong-refund, independent of custody.
2. **Custody/rail asymmetry** — there are **two live parallel on-platform rails**: legacy `bookings` (cart / `process-cart`) and `service_bookings` (`/api/checkout`, the CLAUDE.md-canonical booking). `/api/bookings/refund` serves **only** the legacy `bookings` rail — and **that rail mints no earnings** (`booking.service.ts:584` TODO). Meanwhile `service_bookings`/`template_purchases` (which DO mint earnings) have **no refund route** through this endpoint.

## THE SCOPING ANSWER FOR A2
- `/api/bookings/refund` is **on-platform-only** → no affiliate branch needed (table structure already excludes affiliate).
- **But the naive A2 ("add earnings-reversal to `/api/bookings/refund`") reverses nothing** — the `bookings` rail it serves mints no earnings. The real earnings-reversal need lives on **other rails** the endpoint doesn't touch: `service_bookings` completion, `template_purchases`, and the `platform_revenue`/`optimization_fee` sources.
- Therefore A2 is really **three separable pieces**, not one endpoint edit:
  1. **Fix `createRefund`'s wrong-PI resolution** (use the booking's own `stripe_payment_intent_id`) — a correctness bug worth closing regardless.
  2. **Earnings reversal is a cross-rail, ledger-level concern** — a reversal keyed by `referenceId`/`sourceId`, triggered by whichever refund/cancel path fires (`service_bookings` refund, template refund, the `charge.refunded` webhook), **not** bolted onto `/api/bookings/refund` alone.
  3. **Decide the rail question:** does the primary `service_bookings` checkout even have a refund path? Today it doesn't go through this endpoint. A2 shouldn't build earnings-reversal onto the wrong (earning-less) rail.

## Modeling gap
No schema *custody* gap (types are distinguishable). The real architectural finding is the **two-parallel-on-platform-rails** split (`bookings` vs `service_bookings`) with divergent earning behavior, and a refund endpoint pointed at the rail that accrues no earnings. That's the fact A2's scoping must confront before writing a reversal.

---

# Addendum — Refund/reversal check on the REAL money paths (read-only)

**Verified on `origin/main`.** This answers "does refunding real money leave a ledger stale?" — relocated from the `/api/bookings/refund`/`bookings` question to where earnings actually accrue.

## Q1 — Is the legacy `bookings` table dead? **NO — it is LIVE. Not removable.**
The premise that `bookings` is dead is **incorrect**. Evidence (standalone `bookings`, not `service_/booking_requests/*`):
- **Write (INSERT):** `booking.service.ts:352` via `POST /api/bookings/process-cart` (mounted).
- **Confirm/UPDATE:** webhook `handlePaymentSucceeded` (`stripe-payment.service.ts:212/222/275/300`), `confirmBookingPayment` (`booking.service.ts:573`), expiry scheduler (`booking-expiry-scheduler.service.ts:128`), webhook dispute/refund (`webhooks.routes.ts:406/464`).
- **Reads for real decisions:** availability checks (`availability.service.ts:48/89/217`), admin queries (`admin.routes.ts:342/466`), reconciliation (`stripeReconciliation.ts:69`), traveler booking lookups (`storage.ts:4303/4316`).
- It **captures real money** (Traveloure PI, `booking.service.ts:393`) but **mints no earnings** (`// TODO` `booking.service.ts:584`).
→ **Do NOT remove `bookings` or `/api/bookings/refund`** — it's the active cart/`process-cart` rail. A2 was not "gating fictional money." The earnings-reversal aspect of A2 is moot *for this rail only* (it credits no ledger); the wrong-PI bug in `createRefund` remains real.

## Q2/Q3 — Per real earning path: refund path? ledger reversal?

| Purchase path | Refund/cancel path exists? | Ledger credited (mint) | Reverses on refund? | You-merchant? |
|---|---|---|---|---|
| **template_purchases** (marketplace) | **NONE** — no code writes `status='refunded'`; no refund endpoint (`'refunded'` is in the migration-110 CHECK but unwritten) | `expert_earnings` (`routes.ts:4714`) + `platform_revenue` (`storage.ts:2871`) | **N/A — no refund path** | Yes (Traveloure 2-step PI) |
| **expert_requests** (concierge/advisory) | **NONE** — no cancel/refund status write, no refund endpoint | none minted at pay (`expert_service` PI; earning not booked) | **N/A — no refund path** | Yes (Traveloure PI) |
| **coordination-states** | **NONE** | **fee never captured** — `GET /…/fee` is quote-only, no PI wired | N/A — nothing to refund | fee would be yours, but uncharged |
| `bookings` (cart rail, for completeness) | `/api/bookings/refund` + `charge.refunded` webhook | **none** (TODO) | N/A — no earning minted | Yes |
| `service_bookings` (service checkout) | no route through `/api/bookings/refund`; `status='refunded'` settable but earning mint gated on →`completed` only | `platform_revenue`+`provider_earnings`+`expert_earnings` | **would NOT reverse** *if* a refund fired — but no refund path routes here | Yes |

**No earnings-reversal is implemented anywhere** (grep for `reverseEarning`/`clawback`/`deleteEarning`/negative-earning: none). Disputes deliberately don't auto-claw-back (`webhooks.routes.ts:424`).

## BOTTOM LINE: "No refund system exists for live money" — no live integrity gap today
None of the three real earning paths (`template_purchases`, `expert_requests`, coordination) has a refund/cancel path that fires. **Nothing reverses because nothing refunds.** No provider/expert is left credited after a customer refund, because customers can't get refunded on the earning-bearing paths at all. → The unified refund model is a **deliberate pre-launch feature**, not an urgent live fix. Build it once, deliberately, covering: Stripe refund (where Traveloure is merchant) + ledger reversal keyed by `referenceId`/`sourceId` + affiliate-commission reversal (client-direct, so no Stripe refund) + the dispute clawback decision.

**The two real live bugs in this area (separate from the refund-system feature):**
1. 🔴 `createRefund` wrong-PI resolution (`stripe-payment.service.ts:363-366`) — refunds an arbitrary PI of the user, not the booking's. Live on the `bookings` rail.
2. `/api/bookings/refund` was ungated (**already fixed** on `claude/money-cluster-client-trusted-fix`: owner-or-admin + server-derived amount).
