# Kyoto supply reality check (vertical slice, Part 5)

> **Target:** ten real Kyoto travelers using the Trips slice in November 2026.
> Brief: `docs/planning/briefs/vertical-slice.md` §C Part 5. Report only; no code, no data changes.

## Status: the instrument is built; the production numbers are not in yet

This session has no production database access. What exists:

- **`scripts/report-kyoto-supply.cjs`** is a read-only census. It sets `default_transaction_read_only = on` before any query. Run it against production:

  ```
  node scripts/report-kyoto-supply.cjs "<PROD_DATABASE_URL>"          # markdown
  node scripts/report-kyoto-supply.cjs "<PROD_DATABASE_URL>" --json   # the same rows as JSON
  ```

- **Local results** (see below) are from a development database that holds leftover e2e rows. They show the script runs and what each section reads. **They are NOT production supply**, and nothing in Part 1 or Part 3 may be sized on them.

Stated separately, as the brief asks: **production `service_bookings` has zero rows.** Every "booking" step of the golden path is therefore unexercised on production.

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
| Bookings | 0 total | As on production |

## What Part 1 (golden path) needs from the production run

Each of these is a **prerequisite question** for a Track A step (Part 3). The production numbers answer them, and none is assumed:

1. **Hotels for the anchor question.** Are there enough non-expired `hotel_cache` Kyoto rows with coordinates for a traveler to add 2–3 hotels? If not, the first Track A step is a hotel-inventory step: refresh the cache from the hotel provider, or let a traveler add a hotel as a custom venue (R147's single-venue anchor).
2. **Located items for plan-fit.** What share of live listings and affiliate rows carry coordinates, and at what `location_precision`? Plan-fit says "est." below `exact`.
3. **Bookable in November.** How many live listings have a future open slot, a price and a cancellation tier? The golden path's one booking and one cancellation need at least one that has all three.
4. **Experts.** How many approved Kyoto experts have a handle and a verified neighborhood? This sizes both "a local checks the plan" and Lane C's byline schedule. The Lane C byline count itself comes from the decision-maker's own read-only query.

HARD STOP: Part 5 ends here. Parts 1 and 4 start only when you say so.
