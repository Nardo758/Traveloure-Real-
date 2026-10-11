# S1-d-3 — booking the chosen LiteAPI stay (rulings Oct 10, 2026)

Ledger `2026-10-10-s1-d3a-liteapi-booking` (R?). Split: **d-3a** server (this brief's build) and **d-3b** the
item-sheet UI + smoke. Phase 0 map: the S1-d-3 Phase 0 report (Oct 10, 2026).

## Rulings (decision-maker, Oct 10, 2026)
1. **Migration 371**, a new `liteapi_bookings` table: UNIQUE on `prebook_id`, partial UNIQUE of one live booking
   per item (allowed on a new empty table), plus `commission_cents` (from `clientCommission`) and
   `processing_fee_cents` (if returned) for later payout reconciliation. Held for "Migration 371 SQL approved — Leon".
   368–370 are held by the TC-3 lane.
2. **Nuitée is merchant of record.** No PaymentIntent, no `platform_revenue` row at booking; our take is the
   `hotel_margin_public` band inside the rate, paid out weekly by Nuitée. LD 43(c) / 44(b)(c) amendment drafted
   for founder wording review (PR body); LiteAPI is LD 44's Phase 2 first partner.
3. **"Book" lives in the item sheet** beside "Book this for me" (d-3b). V6/R-l untouched. The row shows
   "Booked · <code>" through the existing booking line once confirmed.
4. **Stay identity by item id, server-side:** item → its chosen accommodation option set → the chosen option's
   `hotel_cache` row → a LiteAPI row in the plan's city. No plan-card payload change.
5. **Voucher dedupe** rests on the single confirmed flip; the voucher is inserted in that transaction. The
   `email_outbox` unique event-key index belongs to #1360.
- Also: `offerId` never from the browser; the price is re-quoted at prebook and shown before the SDK opens;
  `routing_status='purchased'` on confirm; cancellation by claim `confirmed → cancelling`, no refund rows; the
  sync detects and never books; `liteapiBookingEnabled` is true only for `sandbox`; the check script is wired.

## Built in d-3a
| Piece | Where |
|---|---|
| Table | `server/migrations/371_liteapi_bookings.sql`; `shared/schema.ts` `liteapiBookings` (table + 3 indexes) |
| Pure rules | `shared/liteapi-booking.ts` — `LITEAPI_PAYMENT_METHOD`, statuses, `offerIdFromRates`, `parsePrebook` (SSP floor), `parseBook`, `bookingStatusOf`, `liteapiBookedLine` |
| Gate | `server/config/liteapi.config.ts` `liteapiBookingEnabled` (sandbox only) |
| Client | `server/services/liteapi-client.ts` — `prebook`, `book` via the ONE `bookRequestBody`, `getBooking`, `cancelBooking` (PUT) |
| Service | `server/services/liteapi-booking.service.ts` — `prebookStay`, `bookStay`, `cancelStay`, `stayBookingView`, `resolveChosenLiteapiStay` |
| Routes | `GET /api/trips/:tripId/items/:itemId/stay-booking`; `POST …/stay-booking/{prebook,book,cancel}` (empty `.strict()` bodies) |
| Sync | `server/jobs/liteapiBookingSync.ts` → `POST /internal/jobs/liteapi-booking-sync` (daily bucket, health roster) |
| Guard | `scripts/check-liteapi-payment-method.cjs` (`--self-test`), wired into `build.yml` |

## How it behaves
- **Owner only** for every step (booking pays — LD 52); anything else is one 404.
- **Prebook:** re-quotes the plan's confirmed dates and stated adults on the d-2 rates rail (same gate and cap),
  takes that answer's `offerId`, prebooks with `usePaymentSdk: true`, refuses a price below the SSP — read from
  that same re-quote's `suggestedSellingPrice`, since the prebook answer carries none — and writes
  the row (`prebooked`) with the prebookId/transactionId pair **before** answering. The SDK's secret key is
  returned to the owner's page and never stored.
- **Book:** the latest `prebooked` row for the item; the holder is the session user (first name, last name and
  email all required — a missing one is `holder_incomplete`, never invented). Claim `prebooked → booking`
  (the partial UNIQUE refuses a second live booking), then the book call with
  `payment.method = TRANSACTION_ID`. CONFIRMED ⇒ one transaction: row `confirmed` with LiteAPI's id,
  `hotelConfirmationCode`, `commission_cents`, `processing_fee_cents`; the item `purchased`; the voucher in the
  outbox (`liteapi_voucher:<id>`). A 4xx refusal ⇒ `failed`. No readable answer ⇒ the claim stays `booking`.
- **Cancel:** claim `confirmed → cancelling`, then `PUT /bookings/{id}`. CANCELLED ⇒ `cancelled` and the item
  back to `in_planning`; any other answer or a 4xx puts the claim back to `confirmed`; no readable answer leaves
  `cancelling`. No refund row: any refund is Nuitée's.
- **Sync (daily):** reads live rows that carry LiteAPI's id, records `last_synced_at` / `last_sync_status`,
  reports disagreement, stranded `booking` claims and day-old `prebooked` rows. It never writes `status`.

## Stated limits
- **The LiteAPI field names are verified against sandbox 2026-10-09 (founder run, `test_kyoto.py`):** rates
  `offerId`/`offerRetailRate`/`suggestedSellingPrice`/`commission[]`; prebook (`usePaymentSdk: true`)
  `prebookId`/`transactionId`/`secretKey`/`price`/`commission`/`priceDifferencePercent`; book
  `status` (CONFIRMED)/`bookingId`/`hotelConfirmationCode`/`clientCommission`/`processingFee`/`sandbox`; cancel
  `PUT /bookings/{id}` ⇒ `CANCELLED` with refund amount and fee. The prebook carries no SSP, so the floor is the
  re-quote's. An unstated field is NULL; a missing id is refused. d-3b's sandbox book-and-cancel test re-proves
  them in CI.
- **A `booking` claim with no LiteAPI id** (payment taken, book answer lost) is reported by the sync for a person
  to resolve; nothing books it again. Held, by ruling.
- **Children** are not booked as guests yet (no ages recorded); the party booked is the stated adults. Held, by ruling.
- **The voucher** is plain text/HTML from the row's own facts; its wording is d-3b's to review.

## Tests
- `shared/__tests__/liteapi-booking.test.ts` LB1–LB5 (whole-directory job).
- `server/__tests__/liteapi-booking.db.test.ts` B1–B9 (wired into `suite-server-tests.yml`).
- `scripts/check-liteapi-payment-method.cjs --self-test` (8 cases).
