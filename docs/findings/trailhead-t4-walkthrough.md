# Trailhead T4 — Replit walkthrough (scraped stub → publish → traveler render → click-out tracked)

**Lane:** `lane/trailhead-t4-readpath` · **Ruling:** R-T1-e (storefront for scraped content; born-hidden is the safety).

This proves the DB-touching behavior T4 could not exercise in the build session (no `DATABASE_URL`).
Run it on Replit (or any environment with the real DB + `runMigrations()` applied). The DB-free logic
is already proven by `server/__tests__/trailhead-t4-publish-gate.test.ts` (15/15).

> **Runner-audit caveat (stands):** migration `246_dmo_raw_content_inventory_class.sql` was
> hand-verified only — it was NOT applied by a live `runMigrations()` in the build session. Step 0
> confirms it applies cleanly and is idempotent.

> **⏱ BASELINE CAPTURE — do this ONCE, before ignition (Leon's directive).** Before the flag is
> flipped and before any bulk-flip, screenshot the **empty Kyoto discover feed** — the day-before
> state, no external stubs visible. This is the campaign's own before/after baseline artifact
> ("here's the feed the day before Trailhead lit it"), for the ledger / an eventual deck. Save it
> as `docs/findings/assets/kyoto-discover-baseline-preignition.png`. Capture the **after** shot at
> the bulk-flip (§ review), same viewport, for the pair. This is a keep-forever artifact, not a
> throwaway — the empty state never comes back once Kyoto is lit.

---

## 0. Migration applies + column present

1. Deploy/boot the app so `runMigrations()` runs (migration 246 is registered in
   `server/migrations/migration-files.ts`).
2. In the DB console:
   ```sql
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name = 'dmo_raw_content' AND column_name = 'inventory_class';
   -- expect: inventory_class | character varying | 'external'::character varying
   SELECT inventory_class, count(*) FROM dmo_raw_content GROUP BY 1;
   -- expect: every existing row backfilled to 'external'
   ```
3. Re-run the migration (idempotency): it is `ADD COLUMN IF NOT EXISTS` + an idempotent `UPDATE`,
   so a second apply is a no-op. There is **no DB CHECK** (publish-trap avoidance), so the deploy
   push cannot fail on it.

## 1. A scraped stub is born HIDDEN

1. Trigger an ingest (admin DMO tools / the Tavily gap-fill, or seed a row). A new
   `dmo_raw_content` row is created with `expert_workspace_visible = false`,
   `discover_page_visible = false`, `inventory_class = 'external'`,
   `status = 'pending_expert_review'`.
2. Confirm it is invisible to travelers:
   ```sql
   SELECT id, name, city, expert_workspace_visible, discover_page_visible, inventory_class, status
   FROM dmo_raw_content ORDER BY created_at DESC LIMIT 1;
   ```
3. Open `GET /api/discover/location/<City>` (e.g. Kyoto). The `externalStubs.data.stubs` array
   must **NOT** contain the new row (born-hidden). This is the safety.

## 2. Admin review ladder: intake → publish

1. **Intake** (existing): `POST /api/admin/dmo/intake/:id/approve` as an admin. This flips
   `expert_workspace_visible = true` (the stub is now in the Expert DMO Library) but leaves
   `discover_page_visible = false`. Re-check `GET /api/discover/location/<City>` — still absent.
2. **Publish** (NEW, T4.2): `POST /api/admin/dmo/publish/:id` as an admin. Expect `200` and
   `item.discover_page_visible = true`, `item.published_at` set, `item.published_by = <adminId>`.
   - Verify the audit row:
     ```sql
     SELECT action, resource_type, resource_id, actor_id, metadata
     FROM access_audit_logs WHERE action = 'dmo_discover_publish'
     ORDER BY created_at DESC LIMIT 1;
     ```
   - **Idempotency / race:** call `POST /api/admin/dmo/publish/:id` again → expect `409` (the
     atomic conditional's `WHERE discover_page_visible = false` no longer matches). Try a rejected
     row → `409`. Bulk: `POST /api/admin/dmo/publish-batch` with `{ "ids": [id1, id2, alreadyPublishedId] }`
     → `publishedIds` contains only the eligible ones, `skippedIds` the rest.

## 3. Traveler discover render (DISTINCT, non-bookable card)

1. `GET /api/discover/location/<City>` → `externalStubs.data.stubs` now includes the published
   stub, carrying `inventoryClass: 'external'`, `sourceUrl`, `places[]`, `placeCount`, `license`.
   `externalStubs.data.trendContext` is a string or null (T4.4 — computed at render, never stored).
   > Cache note: the payload is cached 5 min under key `v5|<city>:<country>`. If you just published,
   > wait out the TTL or restart to bypass the cache.
2. Open the city page in the browser (`/discover/<City>` / the discover-location route). Find the
   external-stub card (`data-testid="external-stub-<id>"`): it is a **dashed, muted** card labeled
   **"From the web · not bookable here"**, showing facts only (name, area, "X of Y places located"),
   with a **"View source"** action and attribution (**"© OpenStreetMap contributors"** for
   OSM-licensed stubs). It must look clearly different from a bookable platform card — a traveler
   must never mistake it for a Traveloure service. There is **no booking CTA**.
3. If the market cleared the trend floor / has an imminent event, the headline
   (`data-testid="external-trend-context"`) reads e.g. **"Kyoto is trending · Gion Matsuri approaching"**.

## 4. Click-out is TRACKED (rides the existing affiliate_clicks rail)

1. Click **"View source"** on the external-stub card.
2. Confirm the network tab shows `POST /api/affiliates/track` firing **before** the new tab opens
   to the source URL.
3. Verify the click landed on the existing rail:
   ```sql
   SELECT session_id, initiated_by, created_at FROM affiliate_clicks
   ORDER BY created_at DESC LIMIT 1;
   -- session_id like 'dmo:<title>:<City>'; initiated_by 'user'
   ```
   No new tracking table was created — this is the same rail Discover's tracked informational
   outbound uses (§16-compliant). T3's resolution-waterfall replaces this click-out later.

## 5. Console taps

- **Expert DMO Library (T4.5a — automatic):** after step 2.1 (intake approve), the stub appears in
  the expert library read (`GET` behind `server/routes/expert-workspace.routes.ts`, gated on
  `expert_workspace_visible = true`). No T4 change was needed — the library selects all columns.
- **Provider Market Research (T4.5b):** as a provider whose market has published external stubs in a
  category no active+approved provider covers, open Market Research. Under the hero, one line reads
  **"Travelers can now find `<category>` content in `<Market>` — no platform provider offers it yet"**
  (`data-testid="external-content-gap-line"`). `GET /api/me/market-external-content?market=<slug>`
  returns `{ lines: [...] }`; it shows **no count** (R16). If a provider already covers the category,
  the line is suppressed (§13 — omit, never guess).

---

## Things a human MUST verify on the running app

1. **contentType → category matching (T4.5b) is COARSE.** The "no platform provider offers it yet"
   suppression compares the external stub's `content_type` token against provider `service_categories`
   slug/name by substring. A missing synonym could surface a gap line for a category a provider
   actually covers (false-positive opportunity), or vice-versa. Eyeball the line against the real
   Kyoto catalog before trusting it as an outreach signal.
2. **Trend headline inputs.** `marketTrending` reads `getTrendingCities()` (resolver floor-cleared)
   and the imminent event reads `travel_pulse_calendar_events` directly. Confirm both resolve for
   the live market; if either source is empty the headline degrades honestly (event-only,
   trending-only, or hidden) — verify that is what renders.
3. **City scoping of stubs.** `externalStubs` scopes by `ilike(dmo_raw_content.city, <cityName>)`.
   Confirm published stubs are tagged with the same city string the discover route is called with.
4. **Cache visibility lag.** The 5-minute LocationView cache (now `v5`) can delay a just-published
   stub's appearance. Confirm the TTL behavior is acceptable for the launch demo.
