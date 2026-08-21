# Trailhead T3 — ⚑ FIRST-PASS HARD STOP dispatch (resolution waterfall, live)

**Lane:** `lane/trailhead-t3-waterfall` · **Rulings:** R-T3-a/-b/-c/-d/-e.

> **⚑ DO NOT RUN THIS YET.** R-T3-e front-loads a wrong-venue review: the FIRST resolution pass's
> provider + affiliate matches (every one, at launch volume) go to Leon as a **match-evidence table
> BEFORE the render consumes them**. This dispatch is **gated on two things landing first**:
> 1. the **T2.4 sitting's verdict** recorded on the batch-review pack (the published-stub set this
>    pass runs over must be the reviewed set), and
> 2. **T0's affiliate scope as actually filled** — i.e. which of the `AFFILIATE_PROGRAMS` in
>    `server/config/trailhead.config.ts` T0 has flipped `enabled: true` (with the shipped config
>    **every program is disabled**, so a first pass today would produce provider matches + an honest
>    external majority and **zero affiliate resolutions** — which is a legitimate first pass, but the
>    review is more useful once T0 has decided the affiliate rung).
>
> If the T2.4 verdict rules richer content classes in (the directory case), that lands as an
> **R28-stamped scope amendment to this lane**, never silently absorbed.

The INERT MECHANISM is already built and proven DB-free (build session, no DATABASE/network):
- schema + append-only log (T3.1, migration 247), provider matcher (T3.2), affiliate matcher
  all-disabled (T3.3), the pass runner service (T3.5), and the render CTA switch (T3.4).
- Tests green in-session: provider matcher 9/9, affiliate matcher 7/7, pass runner 9/9, render 9/9,
  migration chain 2/2.

This document is the runbook for the person (Leon or an operator on his say-so) who runs the first
LIVE pass over the Kyoto batch, assembles the evidence, and holds the render until the verdict.

> **Runner-audit caveat (stands):** migration `247_trailhead_t3_resolution_waterfall.sql` was
> **hand-verified only** — it was NOT applied by a live `runMigrations()` in the build session (there
> was no database). Step 0 confirms it applies cleanly and is idempotent before anything else runs.

---

## 0. Migration applies + columns/table present

1. Deploy/boot so `runMigrations()` runs (247 is registered in `server/migrations/migration-files.ts`).
2. In the DB console:
   ```sql
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name = 'dmo_raw_content'
     AND column_name IN ('resolution_class','resolution_subclass','resolution_ref','match_confidence','resolved_at')
   ORDER BY column_name;
   -- expect resolution_class default 'external'; the rest nullable, no default.

   SELECT resolution_class, count(*) FROM dmo_raw_content GROUP BY 1;
   -- expect: every existing row 'external' (behavior-neutral born state).

   SELECT to_regclass('public.resolution_events');  -- expect: resolution_events (table exists)
   ```
3. Re-run the migration (idempotency): all `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`
   / `CREATE INDEX IF NOT EXISTS`, so a second apply is a no-op. **No DB CHECK** (publish-trap
   avoidance) — the deploy push cannot fail on it.

## 1. Confirm the pass scope is the reviewed batch (gate A)

The pass only touches **published** stubs (`discover_page_visible = true`, not rejected/quarantined) —
the same predicate `passesDiscoverFilter` enforces. So the review scope IS whatever T2.4 published.

```sql
SELECT count(*) FROM dmo_raw_content
WHERE discover_page_visible = true AND status NOT IN ('rejected','quarantined')
  AND lower(city) = 'kyoto';
```
Confirm this equals the Kyoto set the T2.4 sitting signed off. If it does not, STOP — publish/withhold
per the verdict first (`POST /api/admin/dmo/publish[-batch]`), then return here.

## 2. Confirm the affiliate scope T0 filled (gate B)

```
# server/config/trailhead.config.ts — which programs did T0 enable?
grep -A2 "AFFILIATE_PROGRAMS" server/config/trailhead.config.ts
```
Record, for the evidence pack, exactly which programs are `enabled: true` and their `rung`
(`affiliate_direct` / `affiliate_ota`) and `hasCatalog`. If T0 left them all disabled, note that the
first pass produces **no affiliate resolutions by design** — that is honest, not a gap.

## 3. Run the FIRST pass (full mode)

Admin-only, §2-guarded. Body `{ "mode": "full", "city": "Kyoto" }`.

```
POST /api/admin/dmo/resolve
{ "mode": "full", "city": "Kyoto" }
```
The response is the `PassResult`: `{ passId, mode, scanned, changed, upgrades, downgrades, byClass }`.
Every class change also wrote an append-only `resolution_events` row stamped with this `passId`, and
an `access_audit_logs` row (`action = 'dmo_resolution_pass'`) records the run.

> The pass makes **NO external API call** — affiliate catalogs come from feeds/config, never a live
> scrape (R-T3-b/-e). Provider matching is pure name/geo/category. There is **no LLM** in the path.

## 4. Produce the R-T3-e MATCH-EVIDENCE TABLE (the HARD STOP artifact)

For **every** provider and affiliate match this pass produced — the whole point of the stop is that a
human eyes each one before a traveler can act on it (a wrong match books the wrong venue).

```sql
-- Every resolved (non-external) stub with its evidence, this pass:
SELECT r.stub_id,
       d.name              AS stub_name,
       d.city, d.content_type,
       r.to_class          AS resolved_rung,     -- provider | affiliate_direct | affiliate_ota
       r.ref               AS resolution_ref,    -- provider_services.id | program:product
       r.confidence        AS match_confidence,
       r.event_type,                              -- initial | upgrade | downgrade | relink
       r.created_at
FROM resolution_events r
JOIN dmo_raw_content d ON d.id = r.stub_id
WHERE r.pass_id = '<passId from step 3>'
  AND r.to_class <> 'external'
ORDER BY r.to_class, r.confidence DESC;
```
For each PROVIDER row, add the matched listing's own facts for the reviewer to eyeball name/geo/
category agreement:
```sql
SELECT ps.id, ps.service_name, ps.city, ps.latitude, ps.longitude, sc.category_key, ps.approval_status
FROM provider_services ps
LEFT JOIN service_categories sc ON sc.id = ps.category_id
WHERE ps.id = '<resolution_ref>';
```
Render this as a table Leon reads row by row: **stub name · resolved rung · matched target · name
similarity · distance km · category agreement · confidence**. (The matcher already stores the
evidence it matched on in `match_confidence`; the name-similarity and distance legs are recomputable
from the two rows, or logged into the pass output if you extend the runner to persist per-leg evidence
into `resolution_events.ref`'s sibling — not required for the first pass, the two-row join suffices.)

**Every provider match on this table is a claim that scraped content = a live listing.** Leon accepts
or rejects each. A rejected match means the thresholds in `trailhead.config.ts`
(`PROVIDER_MATCH_MIN_NAME_SIMILARITY`, `PROVIDER_MATCH_MAX_KM`) are too loose — tighten and re-run
(step 3 is idempotent; a re-run only writes events for rows whose class actually changes).

## 5. Class distribution (expect external-heavy — be honest)

```sql
SELECT resolution_class, count(*) FROM dmo_raw_content
WHERE discover_page_visible = true AND lower(city) = 'kyoto'
GROUP BY 1 ORDER BY 2 DESC;
```
A healthy first pass is **external-majority**: most scraped content has no platform provider and (with
T0's scope) no enabled affiliate, so it stays a reference stub. A pass that resolves most stubs to
provider is a RED FLAG that the name gate is too loose — investigate before render.

## 6. Upgrade-log sample (R-T3-c audit is answerable)

```sql
SELECT stub_id, event_type, from_class, to_class, ref, confidence, created_at
FROM resolution_events
WHERE pass_id = '<passId>'
ORDER BY created_at
LIMIT 25;
```
Confirm: no `downgrade` rows on a first pass (nothing was resolved before); `initial` rows carry
`from_class = NULL`. Re-run the pass a second time with no data change — it must produce **zero** new
events (determinism / idempotency; the pure core is proven, this confirms it on live rows).

## 7. Per-class render (hold until the verdict is recorded)

Only AFTER Leon signs the step-4 table:
1. `GET /api/discover/location/Kyoto` → the `externalStubs.data.stubs` array now carries
   `resolutionClass` / `resolutionSubclass` / `resolutionRef` on each stub.
2. Screenshot ONE card of each resolved class on the discover page:
   - **provider** — label "Available on Traveloure", CTA "View on Traveloure" links to
     `/services/:ref`, **no outbound, no source URL in the DOM** (proven by the render test).
   - **affiliate** (only if T0 enabled a program) — label "Bookable through a partner", CTA
     "Book via partner", **no raw partner URL** (§16).
   - **external** — label "From the web · not bookable here", CTA "View source" (the T4.3 behavior).

## 8. Click-out-per-class proof

- **provider**: click "View on Traveloure" → lands on the internal `/services/:ref` listing page. No
  `affiliate_clicks` row, no window.open.
- **affiliate**: click "Book via partner" → a tracked `affiliate_clicks` row is written
  (`POST /api/affiliates/track`, `partner = 'resolve:<ref>'`); the booking rides the in-platform
  agent rail (the live agent-booking wiring is the T0 follow-on — see §16). No off-site redirect.
- **external**: click "View source" → a tracked `affiliate_clicks` row, then the source opens in a new
  tab (tracked informational outbound, allowed).

## 9. Discover before/after pair

Capture the Kyoto discover feed screenshot BEFORE the pass (every scraped stub a "From the web" card)
and AFTER (the resolved ones now carry a provider/partner CTA). This pair is the wedge demo: scraped
content that quietly became bookable-on-platform without a single traveler being sent off to a wrong
venue.

---

## What must be true before you run this
- [ ] Migration 247 applied + idempotent (step 0).
- [ ] The published Kyoto set == the T2.4-signed batch (gate A, step 1).
- [ ] T0's affiliate scope recorded — which programs, if any, are enabled (gate B, step 2).
- [ ] Leon is available to review the step-4 evidence table BEFORE step 7 render.

## What this dispatch must NOT do
- Do **not** let render consume resolutions before the step-4 review (R-T3-e).
- Do **not** loosen a threshold to "get more matches" — a wrong match books a wrong venue (R-T3-b).
- Do **not** enable an affiliate program here — that is T0's call, recorded in config, not this run's.
- Do **not** promote a scraped tout/reseller URL to a CTA — official-channel only (R-T3-d).
