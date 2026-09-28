# Kyoto supply reality check (vertical slice, Part 5)

> **Target:** ten real Kyoto travelers using the Trips slice in November 2026.
> Brief: `docs/planning/briefs/vertical-slice.md` §C Part 5. Report only; no code, no data changes.

## Status: CLOSED by the production census (decision-maker, Sep 28, 2026; ledger `2026-09-28-kyoto-supply-closed`)

| | |
|---|---|
| Taken | **2026-09-28T01:22:57Z**, against production, read-only (Replit, `PROD_DATABASE_URL`; value not shown) |
| Script | `scripts/report-kyoto-supply.cjs` (sets `default_transaction_read_only = on` before any query) |
| Commit | the Replit checkout at **`a20f27ae2b9df09d65485a7e5b9edb78fed63ce5`** (detached HEAD, clean; `origin/main` was `b0462730d`) |
| Errors | none |

## Production results — the census, verbatim

```text
# Kyoto supply census — 2026-09-28T01:22:57.036Z

## Listings by category (city = Kyoto)

| category | all_rows | live | awaiting_review | rejected |
|---|---|---|---|---|
| (no category) | 1 | 0 | 0 | 0 |

## Live listings — the fields the Trips slice reads

| live | has_coordinates | precision_exact | precision_centroid | precision_null | has_price | custom_quote | has_cancellation_tier | free_text_policy_only | has_future_open_slot | has_availability_json | can_anchor | stays |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## NOT counted as Kyoto: city blank, location text mentions Kyoto

| rows | live |
|---|---|
| 0 | 0 |

## Expert applications (city = Kyoto)

| form_status | role | experts | with_handle |
|---|---|---|---|
| approved | expert | 2 | 0 |

## Neighborhood claims in Kyoto

| experts_with_verified_neighborhood | experts_with_any_neighborhood_row | kyoto_neighborhoods |
|---|---|---|
| 0 | 0 | 8 |

## Affiliate inventory rows (city = Kyoto)

_(no rows)_

## Hotel anchor candidates (hotel_cache, the anchor loader's source)

_(no rows)_

## Bookings and plans

| service_bookings_total | service_bookings_kyoto | kyoto_plans |
|---|---|---|
| 7 | 0 | 10 |
```

## The Lane C byline query, verbatim (same session)

```text
BEGIN
 handle | verified_kyoto_neighborhoods | live_listings 
--------+------------------------------+---------------
(0 rows)
ROLLBACK
```

**Byline count: 0.** Lane C ships with an empty schedule, as briefed: no padding and no platform-authored guides in
expert slots. TravelPulse weekly is the only content type that can publish before an expert qualifies (Locked
Decision 57).

## What the numbers say

- **Nothing on the platform can anchor or be booked in Kyoto today.** One Kyoto `provider_services` row exists, with no
  category, and it is not live; every live-field count is 0, including `can_anchor` and stays.
- **The anchor question has no hotel candidates.** `hotel_cache` holds no Kyoto rows, and no affiliate inventory is in
  the database.
- **Two approved Kyoto experts, neither with a handle, neither with any neighbourhood row.** Eight Kyoto neighbourhoods
  exist to claim.
- **Ten Kyoto plans exist** (`trips.market_slug = 'kyoto'`), with no Kyoto booking behind them.

## `service_bookings_total = 7` — reconciled: zero paid bookings in production

The brief (and this doc's earlier status) said production `service_bookings` had zero rows. The census reports **7**,
none of them Kyoto. The follow-up read (Replit, read-only, `BEGIN … ROLLBACK`) grouped them:

```text
  status   | rows | with_payment_intent | no_service |       first_created        |        last_created
-----------+------+---------------------+------------+----------------------------+----------------------------
 pending   |    5 |                   0 |          0 | 2026-01-08 17:53:31.105171 | 2026-04-04 16:33:23.722981
 confirmed |    2 |                   0 |          0 | 2026-04-03 16:33:23.722981 | 2026-04-03 16:33:23.722981
```

**Facts:** 7 rows — 5 `pending`, 2 `confirmed`; **0 with a payment intent**; each names a service; created
2026-01-08 to 2026-04-04; none Kyoto. The timestamps are consistent with scripted inserts (the two `confirmed` rows
share one timestamp to the microsecond, and one `pending` row sits exactly 24 hours after them).

**Finding: zero paid bookings in production.** Ruled (decision-maker, Sep 28, 2026; ledger
`2026-09-28-legacy-unpaid-bookings`): these are pre-vocabulary legacy rows with no payment. **No data change** — the
rows stay as they are (append-only holds).

## What A0 must provide

Named prerequisites for Track A step A0 (`docs/planning/track-a-rollout.md`). **The census is the acceptance check
(ledger `2026-09-28-a1-census-gate`): A1 starts when a re-run of `scripts/report-kyoto-supply.cjs` against
production shows ALL THREE of:**

| # | Census row | A1 needs |
|---|---|---|
| 1 | `hotel_anchor_candidates` (Kyoto `hotel_cache` rows with coordinates, by nearest Kyoto neighbourhood) | **≥ 3 in each of at least 4 Kyoto neighbourhoods (≥ 12 total, coordinates present)** |
| 2 | `experts_with_verified_neighborhood` | **≥ 2** |
| 3 | slice-ready live listings (coordinates, price, cancellation tier, future open slot) | **≥ 3, across ≥ 2 of the categories Part 1's golden path books** |

The script prints each row and a final "A1 may start: YES/NO". `can_anchor` stays in the census as the **listing**
anchor count; it is not the Trips gate.

**(a) Hotels to anchor on.** `hotel_cache` rows the anchor loader reads (`city ILIKE '%kyoto%'`) **with their own
latitude and longitude**. **Ruling (Sep 28, 2026): for the slice such a row counts as exact; a row without coordinates
is not an anchor candidate. No migration.** The "est." label on plan-fit is driven by whether the travel-time matrix
has the pair, not by a hotel's precision. `hotel_cache` has no neighbourhood field, so the census assigns each row to
the nearest of the Kyoto `city_neighborhoods` centroids (8 on production).
*Source check (as ruled — report, don't build):* the only live writer is the Booking.com refresh
(`booking-com.service.ts`, `bookings.getHotels`), which stores each property's own latitude/longitude; the Amadeus
writer (`cache.service.ts cacheHotels`) has no caller (ledger row 34). **No hotel source found returns
centroid-level coordinates**, so `location_precision` is not added to `hotel_cache`.

**(b) Two experts who can sign and check plans.** The two approved Kyoto experts each given a **handle** and **one
verified neighbourhood**, through the existing flow — the handle claim prompt, and a neighbourhood claim ratified by
admin (`expert_neighborhood_claims` → `ratifyClaim`, Locked Decision 27) — **never by SQL**; LD 27's trigger refuses a
direct insert.

**(c) Bookable supply for a five-day Trips plan.** Live listings (`status = 'active'`, `approval_status = 'approved'`)
carrying every field the slice reads: coordinates, a price, a cancellation **tier**, and a future open slot — in the
categories the golden path books. The golden path names these as day-plan supply (tours, dining, activities — Part 1
P-1d) rather than as category keys, so the census reports slice-ready listings **by category** and counts distinct
categories; which of them the golden path books is read from that table.

---

## What the census counts, and how "Kyoto" is decided

"Kyoto" uses the app's own rule, never a looser one: the first comma-segment of `city` equals `kyoto`, the same test as `resolveMarketSlug`. A listing whose `city` is blank but whose free-text `location` mentions Kyoto is reported **separately and not counted**, because no reader in the app treats it as Kyoto either.

A listing is "live" when it passes the public read gate: `status = 'active' AND approval_status = 'approved'`.

| Section | Source | Answers |
|---|---|---|
| Listings by category | `provider_services` × `service_categories` | Rows per category: all, live, awaiting review, rejected |
| Live field coverage | live `provider_services` | Coordinates; `location_precision` (exact / neighbourhood centroid / none); price; custom quote; cancellation **tier** vs free text only; a future open availability slot; `availability` json; `can_anchor`; stays |
| Location text only | `provider_services` | Rows the Kyoto rule does NOT count (a data-quality signal) |
| Expert applications | `local_expert_forms` × `users` | Count by form status and role; how many have a claimed handle (the Lane C byline gate needs one) |
| Neighborhood claims | `expert_neighborhoods` × `city_neighborhoods` | Experts with a VERIFIED Kyoto neighborhood (LD 27), and the Kyoto neighborhood count |
| Affiliate inventory | `affiliate_products` × `affiliate_partners` | Rows by partner and category; active; active with coordinates / price |
| Hotel anchor candidates | `hotel_cache` | The **only** hotel source the anchor loader reads (`anchor-candidates.ts`: `city ILIKE '%kyoto%'`, limit 60). Rows by provider, with coordinates, not expired, newest |
| Hotel anchor candidates by neighbourhood (A1 row 1) | `hotel_cache` × `city_neighborhoods` | Rows with coordinates, each assigned to the nearest Kyoto centroid |
| Slice-ready listings by category (A1 row 3) | live `provider_services` | Coordinates + price + cancellation tier + future open slot, per category |
| A1 gate | the rows above | The three conditions and "A1 may start: YES/NO" |
| Bookings and plans | `service_bookings`, `trips` | Total and Kyoto bookings; Kyoto plans (`market_slug`) |

**Negative space:** live partner APIs (Viator availability, the Travelpayouts catalog feeds) are not in the database and are not measured. The census says whether the fields the slice reads are **present**, never whether a listing is **good**.

## Local results (development database, NOT production)

| Measure | Local value | What it would mean if production looked the same |
|---|---|---|
| Live Kyoto listings | 28 (11 event coordinator, 4 tour guide, 4 photography, …) | Mostly celebration vendors; little day-plan content for a Trips traveler |
| With coordinates | 27 of 28, all `neighborhood_centroid` | Plan-fit would be "est." at neighbourhood grain; no `exact` pins |
| Cancellation **tier** set | 0 of 28 | Every booking refunds as the flexible default (§13 names that) |
| Future open slot | 0 of 28 | Nothing could be booked for a November date |
| `can_anchor` / stays | 0 / 0 | No platform-listed hotel to anchor on |
| `hotel_cache` Kyoto rows | 0 | **The anchor question has no hotel candidates** |
| Affiliate Kyoto rows | 0 | No partner inventory in the database |
| Kyoto expert applications | 4 approved, 2 with a handle | |
| Verified Kyoto neighborhood | 1 expert (10 Kyoto neighborhoods seeded) | Lane C's byline gate would admit at most one expert |
| Bookings | 0 total | Production has 7 legacy unpaid rows (none Kyoto) and zero paid bookings — see above |

HARD STOP: Part 5 is closed. Track A starts at A0 as ruled.
