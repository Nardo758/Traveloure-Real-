# Replit backlog briefs — locked rulings (Nov 10, 2026)

Rulings locked by Leon Dixon, Nov 10, 2026, 12:21 AM ET. Each brief names the files to change, the tests that prove it, and what still needs a human read or an approval before merge. File lines are against `main` at `014baabd7`.

Source: the Replit draft backlog (596 drafts, Nov 10, 2026) and the Coding Bot triage of it. Ledger row: `2026-11-10-replit-backlog-briefs`.

Status of approvals:

| Item | Approval | State |
| --- | --- | --- |
| #1820 | Human read before merge | Pending |
| #1665 / #1658 | "Migration 444 SQL approved — Leon" | Pending |
| #1735 | None (no new string) | — |
| #1823 | Wording | **Approved as proposed — Leon, Nov 10, 2026** |
| #1823 | Human read before merge | Pending |
| #1677 | None | — |

---

## #1820 — A paid or confirmed booking never moves backward on a Stripe event

**Ruling (locked):** Stripe event handlers move a booking only from pending to failed or canceled. A later failure or cancel event against a paid or confirmed booking is logged and ignored, with a row an admin can see. Events are ordered by Stripe's `created`, not by arrival. No new column. A human reads the PR before merge.

**Where it breaks today:**

| Site | What it does | Guarded? |
| --- | --- | --- |
| `server/services/checkout-claim.service.ts` `markCheckoutPaymentFailed` (≈:1490) | Cart rail: `UPDATE service_bookings … WHERE status = 'payment_pending'` | Yes, already never demotes |
| `checkout-claim.service.ts` `releaseClaimsForCanceledIntent` | Cart rail release on `payment_intent.canceled` | Yes, keyed on `payment_pending` |
| `server/services/stripe-payment.service.ts` `handlePaymentFailed` (≈:1324) | Legacy `bookings`: `SET status='payment_failed', payment_status='failed' WHERE id = …` | **No** — moves a confirmed legacy booking backward |
| `stripe-payment.service.ts` `handlePaymentCanceled` (≈:1363) | Legacy `bookings`: `SET status='canceled', payment_status='canceled' WHERE id = …` | **No** |
| `checkout-claim.service.ts` (≈:1501) and `handlePaymentCanceled` (≈:1347) | `payment_intents` ledger `SET status='failed'` / `'canceled'` by PI id | **No** — can overwrite `succeeded` |

**Build:**

1. The legacy `bookings` failed/canceled updates gain the from-state in the same statement: `WHERE id = $1 AND status IN (<pending set>) AND COALESCE(payment_status,'') NOT IN ('paid','succeeded')`, with `RETURNING id`. The pending set is named once beside the other from-state lists (`server/utils/booking-from-states.ts`).
2. The `payment_intents` ledger writes become `… WHERE stripe_payment_intent_id = $1 AND status NOT IN ('succeeded')`.
3. When a guarded update matches zero rows because the booking is already paid or confirmed, the handler logs one warn line, `stripe event ignored: booking already paid`, with `eventId`, `bookingId`, `rail`, `eventType` and `stripeCreated` (the event's `created`, ISO). No amount and no customer data.
4. The same case writes one admin-visible record through the existing §15c record, with no new column: a `lateFailureIgnored` entry merged into `service_bookings.booking_details` (cart) or `bookings.metadata` (legacy). It carries the event id, type and Stripe `created`, and is deduplicated on event id. It is listed on the existing `GET /api/admin/bookings/reconciliation-exceptions`.
5. Ordering: an event is compared by its `created` against the booking's confirmation time. A failure created before the confirmation is the stale one and is ignored; a redelivery never re-applies. The from-state guard in step 1 is the safety; `created` is what the log and the admin record carry.

**Tests:** new `server/__tests__/stripe-no-backward.db.test.ts`, wired in `suite-server-tests.yml`:
- a confirmed cart booking plus `payment_intent.payment_failed` → unchanged;
- a confirmed legacy booking plus failed → unchanged;
- the same two for `payment_intent.canceled`;
- a `payment_intents` row `succeeded` plus failed → stays `succeeded`;
- a pending booking plus failed → `failed` (still works);
- a redelivered ignored event writes one admin record, not two;
- a failure with `created` before confirmation is ignored and logged with `stripeCreated`.

**Not in scope:** refunds and disputes (their own rails), and the reconciliation job's detection kinds.

**Human read before merge** (money path, §15/§18b).

---

## #1665 / #1658 — Review rows are the truth; every rating is derived from them

**Ruling (locked):** `service_reviews` rows are the truth. Every rating and count is derived from them. `provider_services.average_rating` / `review_count` become a cache, recomputed on every review write. The expert payload reads the same derivation. Zero rows reads "No reviews yet" everywhere. A one-time backfill overwrites the stored aggregates from the rows.

**One rule, stated once:** the plain mean of the `approved` rows, rounded to 2 places, and the count of those rows. Zero rows: rating NULL, count 0. This is `summarizeApprovedRatings` (`shared/earner-rating.ts`), already used per earner by `loadEarnerRatings`.

**Where it diverges today:**

| Site | Today | Change |
| --- | --- | --- |
| `server/services/review-mutation.service.ts` `recalculateServiceRatingInTransaction` (≈:19) | Writes `coalesce(avg, 0)::numeric(3,1)`: zero reviews store `"0.0"`, rounded to 1 place | Write NULL at zero rows and round to 2 places, through the shared rule |
| `server/services/admin-query.service.ts` `updateProviderServiceRating` (≈:833) | A second writer taking any value; no callers | Delete (§18c) |
| `server/routes.ts` `/api/expert/analytics` (≈:8790) and the two siblings (≈:8865, ≈:9300) | Mean of each listing's cached average | Read `loadEarnerRatings([userId])` |
| `server/storage.ts` `getExpertsWithProfiles` → `/experts` (`routes.ts` ≈:5691) | Already the earner rule | Unchanged; pinned by a test |
| `client/src/components/expert-card.tsx:524`, `ready-made-card.tsx` | Null renders "New" | Renders "No reviews yet" |
| `service-detail.tsx:1928`, `provider/performance.tsx:671`, `expert/analytics.tsx:770` | Three different empty sentences | Each reads "No reviews yet" |

**Build:**

1. Recompute on write: every review write (create, moderate, remove) already runs under the per-service advisory lock and transaction. It recomputes through the one rule, so nothing else writes the cache.
2. Readers that show a rating to a person use the rule, never the cached column. The cached column stays only for SQL sort and filter (`storage.ts` ≈:4352, ≈:4375), where a stale value costs an order, not a claim.
3. "No reviews yet" is Leon's wording in this ruling. It is one constant in `shared/earner-rating.ts`, read by every empty state above.
4. Backfill: migration 444 (or the next free number when built), data only.

**Migration 444 — SQL for "Migration 444 SQL approved — Leon":**

```sql
-- 444_review_aggregates_from_rows.sql — data only. No ALTER, CHECK, index, DEFAULT or DELETE.
-- Overwrites each listing's stored rating and count with the value derived from its approved review rows.
-- Zero approved rows: average_rating NULL, review_count 0. Idempotent: a second run changes nothing.
UPDATE provider_services AS ps
SET average_rating = agg.avg_rating,
    review_count   = agg.review_count,
    updated_at     = NOW()
FROM (
  SELECT p.id,
         COUNT(r.id) FILTER (WHERE r.status = 'approved')::int                    AS review_count,
         ROUND(AVG(r.rating) FILTER (WHERE r.status = 'approved')::numeric, 2)  AS avg_rating
  FROM provider_services p
  LEFT JOIN service_reviews r ON r.service_id = p.id
  GROUP BY p.id
) AS agg
WHERE ps.id = agg.id
  AND (ps.average_rating IS DISTINCT FROM agg.avg_rating
       OR ps.review_count IS DISTINCT FROM agg.review_count);
```

Before approving, run its read-only twin on production (the same `FROM`, with `SELECT count(*)` over the mismatched rows) and record the count on the PR.

**Tests:** new `server/__tests__/review-aggregate-from-rows.db.test.ts`:
- create, approve, remove and re-approve a review; the cache equals the rule each time;
- zero approved rows store NULL / 0;
- the analytics routes and `/experts` agree with `loadEarnerRatings`;
- 444 run twice changes `[n, 0]` rows.

Client: the empty states render "No reviews yet" and never "New" or "0.0".

**Approvals needed:** "Migration 444 SQL approved — Leon" on the PR.

---

## #1735 — Unclassified partner items get More info only

**Ruling (locked):** a partner item with no booking classification gets More info only, never a booking rail. This is the CAP-2 rule, applied on the public resolver.

**Unclassified** means `affiliate_products.booking_type` IS NULL, or not one of `in_platform_bookable`, `affiliate_bookable`, `informational` (`shared/content-cta.ts` `BOOKING_TYPES`).

**Where it breaks today:**

| Site | Today |
| --- | --- |
| `shared/content-cta.ts` `resolveContentCTA` (≈:105) | "Default (affiliate_bookable / unclassified): the agent rail": NULL gets "Request booking" |
| `shared/schema.ts` (≈:7217) | The comment says the same: "NULL → resolver treats affiliate content as affiliate_bookable" |
| `shared/buy-action.ts` partner branch (≈:405–430) | Anything not informational falls to `agent_rail` |
| `server/services/affiliate-product-resolution.service.ts` `resolveAffiliateProductBookingReference` (≈:30) | Opens the agent rail for any approved product with a URL; never reads `booking_type` |
| Cards: `city-feed-card-recommendation.tsx:146`, `curated-content-section.tsx:421`, `spontaneous-discovery.tsx:427`, `unified-result-card.tsx:358` | Pick a partner Book variant from "is affiliate" alone |

Already right, and the model to follow: `trip-plan.service.ts` (≈:881) mints a booking token only for `affiliate_bookable`, and `affiliate-booking.ts` fails closed on anything else.

**Build:**

1. `resolveContentCTA`: an affiliate item whose `bookingType` is not a known value returns a new kind, `more_info` (no endpoint, no booking verb). `affiliate_bookable` keeps the agent rail, `informational` keeps the tracked view, and `in_platform_bookable` keeps add-to-cart.
2. `resolveBuyAction` partner branch: `more_info` maps to no primary booking action and to `moreInfo` on the PlanActions intent. `planActionFromBuyAction` returns null for it, so Book never draws.
3. The four cards read `resolveBuyAction` / `resolveContentCTA` for their book variant instead of deciding from "is affiliate". An unclassified item shows More info only.
4. Server, the rail itself: `resolveAffiliateProductBookingReference` returns null unless `booking_type = 'affiliate_bookable'`, so `POST /api/affiliate-booking-requests` answers its existing 400 for an unclassified product. A crafted request cannot open the rail the button no longer offers.
5. Fix the schema comment to say NULL is unclassified and gets More info only.
6. No migration and no backfill: classifying a row is an admin edit. Before merge, record on the PR how many rows are affected: `SELECT count(*) FROM affiliate_products WHERE is_active AND (booking_type IS NULL OR booking_type NOT IN ('in_platform_bookable','affiliate_bookable','informational'));`

**Wording:** "More info" is the existing PlanActions label (`PLAN_ACTIONS_COPY.moreInfo`). No new string.

**Tests:**
- `shared/__tests__/content-cta.test.ts`: NULL, empty and unknown `bookingType` → `more_info`; the three known values unchanged.
- `buy-action`: an unclassified partner row has no booking primary.
- Server `affiliate-booking-requests`: an unclassified product id gets 400 and writes no request row; an `affiliate_bookable` product still succeeds.
- Card render tests for the four sites: no Book, and More info present.

---

## #1823 — The reconcile message reads refund state from Stripe first

**Ruling (locked):** the reconciliation message reads the payment's refund state from Stripe before it says anything. It has two branches, "refunded automatically" and "needs a manual refund". The strings below were **approved as proposed by Leon, Nov 10, 2026**. A human reads the PR before merge.

**Today:** the message guesses. `recordReconciliationException` (`server/services/checkout-claim.service.ts` ≈:1394) logs "If the PaymentIntent really succeeded this is money that needs a manual refund or a manual booking". `GET /api/admin/bookings/reconciliation-exceptions` (`server/routes/admin.routes.ts` ≈:689) returns one fixed note: "Check each paymentIntentId in Stripe: succeeded ⇒ refund or re-book manually; not succeeded ⇒ dismiss." Neither reads Stripe, so a row the R162 late-success path already refunded still reads as needing a manual refund, and staff could refund twice.

**Build:**

1. One reader, `readPaymentRefundState(paymentIntentId)`, beside `refundLateSuccessOnFailedIntent` in `checkout-claim.service.ts`. It retrieves the PaymentIntent with its latest charge and answers:
    - `refunded`: the PaymentIntent succeeded and its charge's `amount_refunded` equals `amount`.
    - `needs_manual_refund`: it succeeded and is not fully refunded, or Stripe could not be read. An unreadable answer fails closed into this branch, because it sends a person to look.
    - `not_charged`: it never succeeded. Nothing moved; this row is not a refund case and keeps today's dismiss handling.
2. The admin route reads the state per row at request time, Stripe first, and returns it with that row's message. The fixed `note` goes. Nothing is stored, so the answer is never stale.
3. The log line in `recordReconciliationException` drops the guess and names the state it read.
4. No status change, no refund issued and no new column. The R162 automatic refund path is unchanged.

**Strings (approved as proposed — Leon, Nov 10, 2026; admin-facing):**

| State | Message |
| --- | --- |
| `refunded` | Refunded automatically. Stripe shows this payment fully refunded. No action needed. |
| `needs_manual_refund` | Needs a manual refund. Check this payment in Stripe and refund it. |

**Tests:** a Stripe stub returning:
- succeeded and fully refunded → the first message;
- succeeded and partly refunded → the second;
- succeeded with no refund → the second;
- a Stripe error → the second, never the first;
- not succeeded → neither refund message.

The route makes one Stripe read per row and writes nothing.

**Approvals needed:** human read before merge. The wording is approved.

---

## #1677 — Re-run the payment mutation-auth audit; prove or close the 0/31

**Ruling (locked):** re-run the payment mutation-auth manifest, then either prove the 0/31 or close it.

**What the 0/31 is:** a stale-evidence artifact, not a lost audit. `generated/security/mutation-auth-coverage.json` reports `tested 0 / 745` because its evidence is marked "evidence manifest SHA-256 is stale". The evidence (`mutation-auth-evidence.json`, run 2026-09-25, `passed: true`) was recorded against manifest `aead0ba5…`. The manifest has since been regenerated as `30e761bb…` (745 routes, payments 31). `scripts/generate-mutation-auth-coverage.ts` counts nothing as tested when the hashes differ, so every category reads 0, payments included. The last real payments figure on record is **19/31** (`docs/findings/DISPATCH_MUTATION_AUTH_FAMILY_B.md`, "after payments").

**Build (a run, then a small PR):**

1. On a fresh database with the CI fixtures (`ci-db-setup`), run the live audit: `tsx scripts/run-mutation-auth-live-audit.ts`. It writes `generated/security/mutation-auth-evidence.json` against the current manifest hash.
2. Regenerate: `npm run generate:mutation-auth`, then `npm run generate:mutation-auth-coverage`. Commit the three generated files.
3. Quote the generated payments number exactly, never a projection.
    - If it is 19/31 or higher, the 0/31 is closed as stale evidence. The PR says so and lists which payment rows are still untested in `server/__tests__/mutation-auth/payment-mutation-auth.manifest.ts` (`checkout`, `resume-payment`, `process-cart`, the three payment-method routes and the two optimization-payment routes, among others).
    - If it is lower than 19/31, each payment endpoint that lost evidence is a named finding in the PR, with the failing suite and its output. Nothing is marked tested by hand.
4. Stop it recurring: the coverage step in CI fails when the evidence hash does not match the manifest. A green job then means the number is real, not 0 for lack of a re-run.

**Tests:** `npm run test:mutation-auth-coverage`; the stale-hash check gets a fixture where the hashes differ, and the job must fail.

**Not in scope:** writing new fixtures for the untested payment rows. That is its own lane once the real number is known.

---

## #1686 and #143 — Leon's production checklist

No brief, per the ruling. Both items stay on Leon's production checklist:
- #1686: confirm migration 259 (provider fee bands) is applied on production.
- #143: confirm `STRIPE_CONNECT_WEBHOOK_SECRET` and the Stripe Connect endpoint on production.

---

## Also recorded

- **#1966 merged before its ledger note landed.** The row `2026-11-10-signup-no-autologin` (R886) was stamped from head `fe0a1e6`, so it does not carry the note that it supersedes N-1's auto-login (`2026-11-04-round2-exp-qa`, R832). Stamped rows are not edited. A new pending row, `2026-11-10-n1-autologin-superseded`, records it (accepted as its own row, Nov 10, 2026).
