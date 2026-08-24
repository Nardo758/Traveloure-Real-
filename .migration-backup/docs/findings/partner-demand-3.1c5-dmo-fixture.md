# 3.1c.5 Item 0.1 — DMO-draft coords fixture (closes R26's last ⚠)

**Ledger:** R26 (`2026-08-18-partner-demand-coords-fix`) · **Lane:** `lane/partner-demand-surfaces` · **⚑ Replit** (dev DB).
**Goal:** the R26 DMO branch is currently code-proven only (the dev intake queue was empty at 3.1c.5). Seed ONE
`dmo_raw_content` row with real Kyoto coords, drive the **ready-made-draft** flow (the exact path the R26 fix touches —
`POST /api/expert-workspace/build-itinerary`, source `dmo_raw_content`, NOT the admin content-approve path), and observe
the created `itinerary_items` row carry lat/lng. Then it moves to **behaviorally proven**.

**Source-table correction (§13):** the R26 fix reads **`dmo_raw_content`** (the `/build-itinerary` handler's
`SELECT … FROM dmo_raw_content`, `expert-workspace.routes.ts:603`), which has `latitude`/`longitude`
(`shared/schema.ts`). The landed R26 ledger row said `dmo_extracted_places` — that is a wording error; the code, the
guard, and this doc use the correct table. (The trace doc `partner-demand-3.1b-T-…` already said `dmo_raw_content`.)

---

## Step 1 — seed the fixture (test-marked; the resulting authoring trip is R16-excluded by construction)

```sql
-- Reuses an existing dmo_sources row for the required FK. Kyoto coords (Kiyomizu-dera ≈ 34.9949, 135.7850).
-- status defaults 'pending_expert_review' (not 'rejected') and expert_workspace_visible=true → passes the
-- /build-itinerary intake gate. Name is FIXTURE-marked for identification + cleanup.
INSERT INTO dmo_raw_content
  (source_id, name, country, city, latitude, longitude, expert_workspace_visible, source_url)
VALUES
  ((SELECT id FROM dmo_sources ORDER BY created_at LIMIT 1),
   'FIXTURE-3.1c5 Kiyomizu-dera (coords test)', 'Japan', 'Kyoto',
   34.9948680, 135.7850000, true, 'https://fixture.local/3.1c5-dmo-coords')
RETURNING id, city, latitude, longitude, expert_workspace_visible, status;
```
Copy the returned `id` (call it `<CONTENT_ID>`). If `dmo_sources` is empty, seed one first (any row) — but the
verifier reported 40 `dmo_raw_content` rows, so a source already exists.

## Step 2 — drive the ready-made-draft flow (as a local_expert / travel_expert / admin session)

```bash
# Uses the authenticated cookie of a launch-market expert (the endpoint is DB-role-gated).
curl -sS -X POST "$APP_URL/api/expert-workspace/build-itinerary" \
  -H "Content-Type: application/json" -b "$EXPERT_COOKIE" \
  -d '{"contentIds":["<CONTENT_ID>"],"title":"FIXTURE-3.1c5 coords draft"}' | jq
# → { tripId, redirect, ... } ; copy tripId as <TRIP_ID>
```
This creates an **authoring trip** (`author_id` = the expert, `user_id` NULL) — R16 excludes it from every rollup by
the authoring-flag, so no cleanup is required for rollup hygiene (cleanup below is just tidiness).

## Step 3 — observe: the itinerary_item carries lat/lng (the R26 assertion)

```sql
SELECT ii.id, ii.title, ii.location_name, ii.latitude, ii.longitude, ii.origin
FROM itinerary_items ii
JOIN trips t ON t.id = ii.trip_id
WHERE t.id = '<TRIP_ID>'
ORDER BY ii.day_number, ii.id;
```
**PASS =** the row's `latitude = 34.9948680` and `longitude = 135.7850000` (copied from the seeded `dmo_raw_content`
row by the R26 fix). `title` = the fixture name, `origin = 'expert'`. Paste this output into the "DMO-draft coords"
line of the 3.1c.5 evidence — R26's DMO branch is then behaviorally proven.

**Negative control (optional):** seed a second row with `latitude`/`longitude` NULL and the same drive → the item's
lat/lng come back NULL, no invention (§13).

## Step 4 — cleanup (optional; the authoring trip is already rollup-excluded)

```sql
DELETE FROM itinerary_items WHERE trip_id = '<TRIP_ID>';
DELETE FROM trips WHERE id = '<TRIP_ID>';
DELETE FROM dmo_raw_content WHERE id = '<CONTENT_ID>';
-- (also delete any ready_made_trips / provider_services 'listing' row the /build-itinerary txn created for the draft,
--  if your tidiness needs it — they carry the FIXTURE title.)
```
