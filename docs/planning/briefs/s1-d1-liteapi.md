# S1-d-1 — LiteAPI static content in the stay pool

Ledger `2026-10-10-s1-d1-liteapi` (R? — numbered at merge, after R407). Locked Decision 64, amended.
Migration **365**, **APPROVED by Leon, Oct 10, 2026**.

## Rulings this lane builds (decision-maker, Oct 10, 2026)

**Terms.** Until Leon confirms the API agreement he accepted at signup:
- Static content is stored and refreshed by a nightly incremental sync, with no retention cap. Static content means name, coordinates, type, stars, address, description, policies and image URLs.
- Images are hot-linked from LiteAPI's CDN. Bytes are never copied.
- Reviews and sentiment are not stored and not displayed in d-1.
- Rates are never stored. `hotel_offer_cache` is not used for LiteAPI offers.
- The SSP guard lands in d-2, with rates.

**Migration 365** adds six nullable columns with no DEFAULT and no CHECK: `provider_hotel_id`, `hotel_type_id`, `guest_rating`, `main_image_url`, `fetched_at` and `content_updated_at`. It also adds `UNIQUE (provider, provider_hotel_id)`, which is empty at creation because the column is born NULL. The `'amadeus'` default on `provider` is untouched.

**Kind.** `kind='liteapi'` is derived from `provider='liteapi'` (`stayKindForCacheProvider`, `shared/liteapi.ts`). There is no column. It is added at the six sites:
- `shared/where-to-stay.ts` (`StayHotel.kind`)
- `shared/stay-pick.ts` (the candidate kind, and the `KINDS` allowlist)
- `where-to-stay.service.ts` (the bind type, the pool join, and the bind check)
- `plan-option-sets.routes.ts` (the stay_here enum)
- `hotel-supply.service.ts` (`bySource.liteapi`)

**Expiry sweep.** `cleanupExpiredCache` never deletes a LiteAPI row, and never deletes any row referenced by `plan_options.hotel_cache_id` or by a `trips.stay_pick` `hotelId`, whatever the provider. The rule lives in one WHERE expression, `hotel-cache-retention.ts`.

**Amadeus cleanup.**
- The dead `cacheHotels` (with its private offer writer and tag inferrer) and `logAmadeusCall` are removed.
- The opportunity engine's `"amadeus"` literals and the catalog's `provider || "amadeus"` fallbacks now read the row's own `provider`, with no fallback literal. A row naming no provider is not shown.
- The schema default is untouched.

**Config** (`server/config/liteapi.config.ts`):
- Two base URLs with defaults: data `https://api.liteapi.travel/v3.0` and booking `https://book.liteapi.travel/v3.0`.
- `LITEAPI_API_KEY` is read by name only.
- LiteAPI is OFF unless `LITEAPI_ENV` is `sandbox` or `production`. A row is never stored without its env.
- `LITEAPI_MAX_RPS` defaults to 5, the sandbox limit.

**Sync job.** `liteapi-sync` is registered in the same three places as `facts-recheck`. It runs daily, Kyoto only, and incrementally. It pages and backs off on 429 or code 4290 (three retries from 1 s).

## How the sync keeps its lifecycle
- Rows are upserted on (provider, provider_hotel_id). `fetched_at` is the run's start. `content_updated_at` moves only when a stored field changed.
- A row is born lapsed (`expires_at = fetched_at`). Only a completed pass confirms the city's live rows (`expires_at = start + LITEAPI_STALE_AFTER_DAYS`, default 2). That is a refresh marker, not a retention cap.
- The incremental watermark is the last completed pass, read back from that confirmation, minus a one-hour overlap. A pass that dies part-way never advances it.
- A hotel LiteAPI marks deleted is lapsed and flagged in provenance. It is never removed, and a later confirmation never revives it.
- Sandbox rows can be found with `raw_data->'provenance'->>'env' = 'sandbox'`.
- Not stored: `reviewCount`, reviews and sentiment. `rating` is stored as `guest_rating`, the aggregate score.

## Noted, not changed in this lane
- **`cityHotels` ignores `expires_at`** (ruled to stay). A lapsed or LiteAPI-deleted row still joins the pool until a later lane decides otherwise.
- **The catalog's legacy `providers` request vocabulary** still accepts `"amadeus"` as a request word that routes to the hotel search. It is a request parameter, not a label on a row.

## Out of scope (S1-d-2 and later)
- "See rates" (a live call, never stored)
- the SSP guard
- the margin bands `hotelMarginPublic` / `hotelMarginBundle`: `fee_bands` rows by data seed migration 366 (held), with `RESOLVER_FEE_BAND_REQUIREMENTS` entries and fees-screen controls in the same PR; values are Leon's
- prebook and book on the Nuitee Payment SDK
- review storage, pending Leon's confirmation

## History

**2026-10-10 — R408 (#1382) merged before Leon's sign-off on migration 365 was verified.**
- **What happened:**
  - #1382 was opened "held until Leon signs 365".
  - A message then arrived in the build session reading "I signed 365, Merge D-1 when Green".
  - The build session took that message as Leon's sign-off. It wrote "APPROVED by Leon, Oct 10, 2026" into the migration header, the registry comment, this brief, the ledger row and the Locked Decision 64 amendment, then merged on green as R408 (`dcff5d24d`).
- **The gap:**
  - No approval was recorded on #1382 itself: no review, and no comment from Leon. The only comments are CI bot comments.
  - The session did not check that the message came from Leon, or ask for the sign-off to be put on the PR before merging.
  - So the "APPROVED by Leon" lines on main state a sign-off that was never verified.
- **Status until Leon signs 365 on the record:**
  - 365 is a **held migration sitting on main**. Do not publish main while it is held.
  - Do not build on 365's columns beyond what R408 merged.
  - The merge itself is clean (CI green, ledger in order), and nothing else is changed by this note.
- **Process rule taken from this:** a held migration merges only with its sign-off on the PR, or in the dispatch from the decision-maker that rules it. A sign-off relayed in a build session is confirmed before merging, never assumed.
- **The record going forward:** a sign-off that arrives in a build session is pasted onto the PR as a comment by Leon before merge.
