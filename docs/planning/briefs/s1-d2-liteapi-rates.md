# S1-d-2 — live LiteAPI rates on the stay card

Ledger `2026-10-10-s1-d2-liteapi-rates` (numbered R416 at merge). Locked Decision 64, amended.
Migration **366** (data only — two `fee_bands` rows). **Held:** merges at R416 only with BOTH comments on
record — "365 approved" on #1382 and "Migration 366 SQL approved — Leon" on this lane's PR. Either missing at
its turn ⇒ skipped and re-queued, not waited for.

## Rulings this lane builds (decision-maker, Oct 10, 2026)

1. **Margin bands.** `hotel_margin_public` and `hotel_margin_bundle`, snake_case, percent. Both OPTIONAL with
   a declared fallback of 0 — "sell at SSP", a safe no-margin state, not a fee literal. Migration 366 seeds them
   if missing, band key first column (D8). Leon's values: public 12, bundle 6. The bundle band is read by
   nothing yet (the bundle lane reads it).
2. **Pins — hybrid.** SC3 unchanged: the default card never shows `$`, `¥` or "per night"; rates render only
   after a tap. SC7 amended (sanctioned): it still forbids `$`, `¥` and "per night" on the default card, and now
   asserts the "See rates" control is present with no price text until tapped. New test ids use `stay-rates-`
   so SC5/SC6/CL4 counts hold.
3. **Deadline with no plan timezone:** relative to the check-in date — "Free cancellation until 2 days before
   check-in"; never a bare UTC timestamp. With a timezone: local date-time plus the zone abbreviation.
4. **Card only.** Rates after a stay is chosen (the item row) come in d-3 with the booking control.
5. **Spend cap.** `LITEAPI_RATES_DAILY_CAP` (count per UTC day, config), checked before the call and logged in
   `api_usage_logs`; over the cap the control says "Rates unavailable right now", never an error. R299 shape.

## What is built

- **Route:** `GET /api/trips/:tripId/stays/:stayId/rates` (`plan-option-sets.routes.ts`) →
  `server/services/liteapi-rates.service.ts`. Sign-in only, behind `planRole(read)`; a stranger, a non-LiteAPI
  row or a row in another city is ONE 404 (LD 40). `stayId` is `hotel_cache.id`; the server maps it to
  `provider_hotel_id` (migration 365) and asks LiteAPI with that id.
- **No guessed input (§13):** unconfirmed dates ⇒ `dates_needed`; no stated adults ⇒ `party_needed`. Children
  are not priced (no ages are recorded) and the card says so.
- **The call:** `POST /hotels/rates` with `maxRatesPerHotel: 1`, the plan's dates, the adults, and `margin` = the
  public band as a percent. A live call, NEVER stored — no rate reaches any table, `hotel_offer_cache` included.
- **The floor:** the public price is `max(retail total, SSP)` in the same currency (`shared/liteapi-rates.ts`);
  an SSP in another currency refuses the offer rather than show it unfloored.
- **CUG:** none requested. The plan page and this route are sign-in only, so a guest never requests a rate, and
  every price shown is the PUBLIC rate.
- **The gate:** `server/services/liteapi-rates-gate.ts` — the counter and the usage row are the same
  `api_usage_logs` rows (provider `liteapi`, endpoint `hotels_rates`); a cap of 0, an unreadable counter or a
  spent cap refuses before the call; a failed call is recorded and counts.
- **The card:** LiteAPI stays get "See rates" (`stay-rates-open-<id>`); the panel (`stay-rates-panel-<id>`)
  shows the server's price and party, the board name, the cancellation line, any tax payable at the property,
  and the plain messages for the other states.
- **Config:** `LITEAPI_RATES_DAILY_CAP` (default 200), `LITEAPI_CURRENCY` (USD), `LITEAPI_GUEST_NATIONALITY`
  (US), `LITEAPI_RATES_TIMEOUT_MS` (8000).

## Sandbox behaviour — verified against sandbox 2026-10-09 (founder run)
- The retail rate is the guest-pays figure with our `margin` applied: margin 0 / 10 / 15 produced
  $383.63 / $421.99 / $441.13, with matching `commission`. So the `hotel_margin_public` band, sent as the
  request's `margin`, is what the traveler pays, and the SSP floor applies on top.
- `cancelPolicyInfos[].cancelTime` deadlines arrive in GMT with no zone marker — so the parse-time UTC
  normalisation (`gmtInstant`, `shared/liteapi-rates.ts`) is correct.

## Out of scope
- Rates on the item row and the booking control (d-3), prebook/book and the Payment SDK.
