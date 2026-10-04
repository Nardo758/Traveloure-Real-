# Step 6 brief — Trip Card, photos, ItemSheet, drafting consistency (R296)

**For Track A. Reference: surface spec v1.3.4 (docs PR, same lane, merges first or alongside). Base: main at 80df9a0 (R295).** One PR, one ledger row; migrations held for the founder's ruling with SQL in the PR body.

## Rulings resolved for this step

- **Trip Pass cap (R-ac):** option (a) — **5 full Optimize runs per trip**, re-times unlimited within the 24-hour / same-version rule; the card shows "N runs left"; the sixth run states the band fee and routes into a paid run. Config `TRIP_PASS_RUNS_PER_TRIP` (default 5), read by name. Removes the unlimited 24-hour re-run.
- **`facts-recheck` job:** Track A writes the job function (re-run lookups for stops on trips starting in 3 days; legs later under R-aw; writes findings per trip); the engineer registers it in the automation registry with the heartbeat stamp. The T-3 banner reads the job's output; nothing computes on page load.
- **Photos:** adapters are Track A's; the daily cap and cost are config by name.

## Scope (spec §10 step 6)

1. **Trip Card on the shared rows** (§2.5). `DayBlock` + `ItemRow` in read mode replace the card's own day grouping and rows: hero with the day photo, provenance line ("Finalized <date> · built from Version A, run 1 · planned with [expert] · hours re-checked <date> · K of N booked"), Reopen, day strip Today-first on trip dates, map thumbnail with **Navigate** (Google Maps directions deep link per row and per day, no API call — R-ay), today's rows with booking chips and notes, `LegRow`s where legs exist (airport legs on free plans), bookings list. No planning controls. `trip_finals` gains photo references and per-day `{source_run_id, source_variant_id}`.
2. **T-3 banner (R-ad).** Reads `facts-recheck` findings for the trip: one banner, "Swap" / "Ask [expert]" (Ask records interest when no expert is live). One push per trip at T-3.
3. **Photos (R-aq).** Migration 346 `place_photos` (nullable columns: place_id, source `ours|wikimedia|google_live`, url_or_asset, licence, attribution, checked_at, created_at; new table → NOT NULL on identity columns allowed). Resolution order: ours (listing/expert image) → Wikimedia Commons by place name + coordinates (cache the file URL, licence and attribution) → Google Place Photo fetched live per render, never persisted, under `PLACE_PHOTOS_DAILY_CAP` / `PLACE_PHOTOS_COST_CENTS` (verify current Place Photo pricing before setting) → none. Placement: one image per day on the slip (first located stop of the day), thumbnails on the card's today rows and on `AnchorPanel` option cards; none on item rows in general, versions or the map. Attribution rendered with every image.
4. **`ItemSheet` (R-ap).** Opened by photo tap, title tap, or ⋯ → Details: photo with attribution, all facts with sources and checked dates, expert notes, Ask a local, Book this for me (when a path exists). Edit and read modes; the one "more info" surface.
5. **Post-trip feedback.** `post_trip` moment on the card at T+1 (great · fine · rough + text), using `FeedbackTap`; registry codes only, no schema change.
6. **Free-finalize prompt (R-ay).** Finalize on a plan without a run shows the free findings line once more ("2 stops may not be reachable in time · Add travel times") before confirming; the card carries the same line under the day strip.
7. **Drafting consistency (R-aa, R-bc).** `withinFlightWindows` applied to Plus occasion drafts and the trip generate route; `anchorConflicts` flags stops starting after take-off; `city_events` and season facts for the trip dates go into every drafting prompt with "no festivals or events unless listed"; R-w stays as the backstop.
8. **Neighbourhood shading** whenever the stay has coordinates; emphasised while the `AnchorPanel` is open.
9. **Trip Pass cap** as ruled above; "N runs left" on the `OptimizerLead` card for pass holders.

## Out of scope
Handoff and Ready Made Trips (step 7, R-ax), stamps (R-ba, step 7 small lane), legs beyond airport (step 9), upsell (step 10).

## Gates
- Parity test on the smoke-6 fixture for the card's rows (R-ab).
- Fixture tests: buffer drop on all three drafting paths; after-take-off flagged by `anchorConflicts`; a festival title with no event fact never survives; photo resolution order with a stubbed Wikimedia hit and a stubbed Google miss; cap exhaustion returns the fee message with no run.
- **Finalize smoke** (first ever): finalize the fixture plan end-to-end in the e2e; "Your Trip Card is ready" and the card's own state agree; Reopen returns to the slip with the plan intact.
- tsc at or below baseline; guard batch clean; mutation-auth counts regenerated; migration 346 SQL in the PR body, applied twice.
- Success gate (§16, measured after deploy, not a merge gate): ≥ 30% of drafted plans finalized; zero ready-vs-not-final mismatches.

Ledger R296. Report back with the PR, migration 346 SQL, the registry hand-off note for the engineer, and anything in the card's current code that the shared rows can't express.
