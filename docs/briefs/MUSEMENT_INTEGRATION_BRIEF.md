# Musement Partner API integration — Phase 0 brief (decision-maker read)

> Status: **DRAFT — awaiting decision-maker ratification of the three decisions below.**
> Directive (Aug 2, 2026): of the four partner-program candidates (GetYourGuide direct, 12Go,
> Klook Kreator, Musement), **only Musement is pursued**. Source docs:
> https://partner-api.musement.com/api/getting-started (proxy-blocked from the sandbox; facts
> below verified via search against the official partner docs — re-verify endpoint specifics
> against the OpenAPI/Postman collection from the Replit side at build time).

## 1. What the Musement Partner API is (and why it's different from Travelpayouts)

- **Full B2B booking API**, not an affiliate-link program: catalog (activities by
  country/city/venue), real-time availability & pricing, cart, customer, checkout, order +
  voucher retrieval.
- **Auth:** OAuth 2.0 client-credentials (`client_id` + `client_secret` → bearer token) plus an
  `X-Musement-Application` header on EVERY request. Sandbox first; production credentials are
  granted only after a partnership-team review (requirements checklist + a demo of the
  integration).
- **Merchant-of-record model (the load-bearing fact):** merchant partners sell the catalog
  natively on their own platform, collect the traveler's money themselves (our Stripe rail),
  and complete Musement's checkout with the special-authorization **no-payment flow** — then
  settle with Musement commercially. As MoR, the partner owns: country-based taxes, the
  monetary transaction, customer support, cancellations/refunds, and supplier↔customer
  communication.
- Onboarding contact: `business-support@musement.com` (sandbox credentials + the production
  checklist).

**Why this fits Traveloure better than any affiliate program:** §16 exists because off-site
booking CTAs leak the funnel and disintermediate experts. Musement removes the problem at the
root — the traveler never leaves; there is no affiliate URL to hide. Activities become real
in-platform inventory riding the existing checkout, escrow-adjacent ledger, and Trip Card
rails (the pattern the Amadeus hotel add-to-cart pointed at, completed with real order
creation at the supplier).

## 2. The three decisions to ratify (in order)

**D1 — Accept the merchant-of-record obligations?** This is a business commitment, not a code
choice: we charge the traveler, we owe Musement, we own refunds/taxes/support for these
bookings. If NO → stop here; there is no affiliate fallback worth building (that's what the
Travelpayouts lane already covers for other partners). If YES → D2/D3.

**D2 — Which booking rail carries a Musement order?** Recommendation: **the
transport-commerce pattern** — a `service_bookings` row with NULL `service_id` and
`bookingDetails.bookingType = 'musement'`, holding the opaque Musement references
(activity uuid, date/slot, order uuid once created) in `bookingDetails`. Rationale: the
transport exception (migration 050) already ratified exactly this shape for
partner-fulfilled inventory; reusing it keeps checkout (§15 idempotency, slot-claim
posture), refunds (`refundServiceBooking`), the ledger, My Bookings, and the Trip Card
`booking_id` linkage working unchanged. **Per the Service-Model rules, extending the
documented NULL-`service_id` exception to a second bookingType requires explicit
decision-maker approval — that approval is this D2.** (Alternative rejected: a new
`musement_bookings` table — a parallel money rail duplicating checkout/refund/ledger plumbing,
the exact "third content home" / new-service-table trap.)

**D3 — Scope: Kyoto-first (§12).** Surface only the Musement catalog for Kyoto (plus, at
most, the cities a trip being built actually targets) — not the worldwide catalog. The
integration is an inventory deepening for the wedge, not a breadth play.

## 3. Money-path design (§14/§15/MONEY_MAP obligations — binding on the build)

> **This section is the FIRST INSTANCE of the ratified money-flow blueprint** (decision-maker,
> Aug 2, 2026) — the canonical lifecycle every new charge rail follows, now codified as
> `docs/MONEY_MAP.md` §0. Future integrations copy the blueprint, not this brief; this brief adds
> only the Musement-specific bindings.

- **Charge:** traveler pays via the EXISTING `/api/checkout` Stripe rail — amount
  server-derived from a server-side re-quote of the Musement price at checkout time (never
  client-sent, never a stale cached price; Musement prices/availability are live). Price is
  re-verified against Musement immediately before the PaymentIntent is created; drift → 409
  re-quote, never a silent charge at the old price.
- **Fulfillment ordering (the crux):** claim → charge → create order. ① atomic DB claim on the
  booking row (§15); ② Stripe charge (deterministic idempotencyKey `musement-<bookingId>`);
  ③ Musement cart→checkout→order via the no-payment flow, idempotent on our booking id.
  **If ③ fails after ② succeeded:** automatic void/refund of the PaymentIntent + booking →
  `failed` with an honest traveler message — a paid-but-unfulfilled state must be impossible
  to leave standing (this is the F-1 lesson as a design rule).
- **Refunds/cancellations:** MoR means OUR refund is the traveler's refund. Map Musement's
  per-activity cancellation policy into the booking's `bookingDetails` at purchase (snapshot
  posture); the refund path calls Musement's cancellation first, then the existing
  `refundServiceBooking` Stripe refund — both idempotent, ledger reversal via the existing
  escrow spine.
- **Ledger:** platform margin (our sell price − Musement net rate) recorded via
  `recordRevenueEvent`; **no rate literals** — the margin/markup lives in a `fee_bands` row
  (e.g. `musement_margin`), §8. No expert/provider earning is created by a pure catalog sale;
  if an expert's build/plan drove the sale, attribution rides the existing
  `booking_acquisition_ref`, and any expert share is a SEPARATE ratification (do not invent
  a split).
- **MONEY_MAP discipline:** every new Stripe/ledger/endpoint site this build adds is entered
  into `docs/MONEY_MAP.md` in the same PR — the map's "add new money surfaces BEFORE the
  money brief is executed" rule applies to this brief's build.
- **Secrets:** `MUSEMENT_CLIENT_ID`, `MUSEMENT_CLIENT_SECRET`, `MUSEMENT_APPLICATION`
  (+ `MUSEMENT_ENV=sandbox|production`) — `.env.example` + `validate-env.ts` warnings from day
  one (the F-2 lesson). Key-gated §13: no credentials ⇒ the Musement source is absent/honest
  empty, never fabricated inventory.

## 4. Build phases (each its own PR, behind the credentials gate)

- **P0 (user-side, now):** email `business-support@musement.com` for sandbox credentials;
  obtain the production checklist so its requirements shape P1–P3 (they will ask for a demo).
- **P1 — client + catalog (read-only):** `server/services/musement/` OAuth client
  (token cache/refresh, `X-Musement-Application`), Kyoto catalog + availability surfaced as a
  Workstation Add-panel source + Discover/catalog feed entries (teaser posture; **no booking
  yet**). Live calls are deploy/Replit-side only (sandbox proxy blocks the domain) — build
  with recorded-fixture tests, verify live from Replit.
- **P2 — booking rail (FABLE-REVIEW, the money PR):** checkout wiring per §3, order/voucher
  storage, refund path, MONEY_MAP entries, behavioral proofs against the Musement sandbox.
- **P3 — production application:** complete Musement's checklist, demo, receive production
  credentials; flip `MUSEMENT_ENV`.

## 5. Explicitly NOT in scope

- Other partner applications (GYG/12Go/Klook) — dropped per the Aug 2 directive.
- Expert commission on Musement sales (separate ratification, see §3).
- Non-Kyoto catalog breadth (§12).
- Replacing the Travelpayouts/WeGoTrip affiliate lane — it stays for partners without a B2B
  booking API.
