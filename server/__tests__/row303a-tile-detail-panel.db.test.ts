/**
 * Row 303a — GET /api/discover/tiles/:tileId/panel on a real database.
 *
 *   P1  before the tables exist, the read says the store is absent and returns no fact
 *   P2  an unsourced fact is stored and is not returned
 *   P3  a photo without the rights tick is stored and is not returned; a ticked photo is
 *   P4  a partner fact older than the cache window is not returned; the same row is returned
 *       when the read clock equals its fetch time
 *   P5  a research fact with no review is not returned; a reviewed one is
 *
 * The tables come from the migration runner (422). P1 drops them so the absent read
 * is observable, clears that one ledger row, and the runner creates them again.
 * Fixture rows are removed afterwards. The tables stay.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/row303a-tile-detail-panel.db.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pool } from "../db";
import { MIGRATION_FILES } from "../migrations/migration-files";
import { runMigrations } from "../migrations/run-migrations";
import { readTileDetailPanel } from "../services/tile-detail-panel.service";

const MIGRATION_FILE = "422_discover_tile_panel.sql";

const BASE = process.env.BASE_URL ?? process.env.JOURNEY_BASE_URL ?? "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const TILE = `gem-${RUN}`;

function refuseRemote() {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
}

async function dropTables() {
  await pool.query("DROP TABLE IF EXISTS discover_tile_panel_photos");
  await pool.query("DROP TABLE IF EXISTS discover_tile_panel_facts");
}

async function applyFromRunner() {
  await pool.query("DELETE FROM schema_migrations WHERE migration_name = $1", [MIGRATION_FILE]);
  const result = await runMigrations();
  if (result.dryRun || result.bootstrapOnly) {
    throw new Error("migration runner did not apply");
  }
  assert.equal(result.applied.includes(MIGRATION_FILE), true);
}

async function getPanel(tileId = TILE) {
  const res = await fetch(`${BASE}/api/discover/tiles/${encodeURIComponent(tileId)}/panel`);
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, cache: res.headers.get("cache-control"), body };
}

after(async () => {
  await pool.query("DELETE FROM discover_tile_panel_photos WHERE tile_id = $1", [TILE]).catch(() => {});
  await pool.query("DELETE FROM discover_tile_panel_facts WHERE tile_id = $1", [TILE]).catch(() => {});
  const present = await pool.query(
    `SELECT to_regclass('public.discover_tile_panel_facts') AS facts,
            to_regclass('public.discover_tile_panel_photos') AS photos`,
  );
  if (!present.rows[0]?.facts || !present.rows[0]?.photos) {
    await applyFromRunner();
  }
});

test("P1–P5 the panel read drops an unsourced fact, an unticked photo, and a stale partner fact", async () => {
  refuseRemote();
  assert.equal(MIGRATION_FILES[MIGRATION_FILES.length - 1], MIGRATION_FILE);
  await dropTables();

  const absent = await getPanel();
  assert.equal(absent.status, 200);
  assert.equal(absent.cache, "private, no-store");
  assert.equal(absent.body.store, "absent");
  assert.deepEqual(absent.body.facts, {});
  assert.deepEqual(absent.body.photos, []);
  assert.equal(absent.body.headings.what_it_is, "What it is");

  const bad = await getPanel("_nope");
  assert.equal(bad.status, 400);
  assert.equal(bad.body.reason, "invalid_tile_id");

  await applyFromRunner();
  const indexes = await pool.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename IN ('discover_tile_panel_facts', 'discover_tile_panel_photos')`,
  );
  const indexNames = indexes.rows.map((row) => row.indexname);
  assert.equal(indexNames.includes("idx_discover_tile_panel_facts_tile_id"), true);
  assert.equal(indexNames.includes("uq_discover_tile_panel_photos_tile_position"), true);
  const empty = await getPanel();
  assert.equal(empty.body.store, "present");
  assert.deepEqual(empty.body.facts, {});

  const unsourced = `unsourced-${RUN}`;
  const unreviewed = `unreviewed-${RUN}`;
  const reviewed = `reviewed-${RUN}`;
  const unticked = `https://example.com/unticked-${RUN}.jpg`;
  const ticked = `https://example.com/ticked-${RUN}.jpg`;
  const staleValue = `stale-partner-${RUN}`;
  const freshValue = `fresh-partner-${RUN}`;
  const fetched = new Date("2026-10-31T12:00:00.000Z");

  await pool.query(
    `INSERT INTO discover_tile_panel_facts
      (id, tile_id, subject_kind, section, value, source, source_url, checked_on, reviewed_at, fetched_at, attribution)
     VALUES
      ($1, $2, 'place', 'what_it_is', $3, NULL, NULL, NULL, now(), NULL, NULL),
      ($4, $2, 'place', 'where', $5, 'Kyoto City Tourism', 'https://example.com/where', '2026-10-20', NULL, NULL, NULL),
      ($6, $2, 'place', 'what_it_is', $7, 'Kyoto City Tourism', 'https://example.com/what', '2026-10-20', now(), NULL, NULL),
      ($8, $2, 'viator', 'cost', $9, 'Viator', 'https://www.viator.com/tours/Kyoto/walk', '2026-10-29', NULL, now() - interval '2 days', 'Viator'),
      ($10, $2, 'viator', 'when', $11, 'Viator', 'https://www.viator.com/tours/Kyoto/walk', '2026-10-31', NULL, $12, 'Viator'),
      ($13, $2, 'klook', 'what_it_is', $14, 'Klook', 'https://www.klook.com/activity/1', '2026-10-31', NULL, $12, 'Klook')`,
    [
      `f-${RUN}-u`, TILE, unsourced,
      `f-${RUN}-r0`, unreviewed,
      `f-${RUN}-r1`, reviewed,
      `f-${RUN}-stale`, staleValue,
      `f-${RUN}-fresh`, freshValue, fetched,
      `f-${RUN}-klook`, `klook-${RUN}`,
    ],
  );
  await pool.query(
    `INSERT INTO discover_tile_panel_photos
      (id, tile_id, subject_kind, image_url, credit, source_url, license_url, photo_rights_ticked, position)
     VALUES
      ($1, $2, 'place', $3, 'Example Photographer', 'https://example.com/file', 'https://creativecommons.org/licenses/by/4.0/', false, 1),
      ($4, $2, 'place', $5, 'Example Photographer', 'https://example.com/file', 'https://creativecommons.org/licenses/by/4.0/', true, 2)`,
    [`p-${RUN}-0`, TILE, unticked, `p-${RUN}-1`, ticked],
  );

  const live = await getPanel();
  assert.equal(live.status, 200);
  assert.equal(live.body.store, "present");
  const encoded = JSON.stringify(live.body);
  assert.equal(encoded.includes(unsourced), false);
  assert.equal(encoded.includes(unreviewed), false);
  assert.equal(encoded.includes(staleValue), false);
  assert.equal(encoded.includes(`klook-${RUN}`), false);
  assert.equal(encoded.includes(unticked), false);
  assert.equal(encoded.includes(freshValue), false, "a stored Viator fact is outside the live window a moment later");
  assert.deepEqual(live.body.facts.what_it_is, [{
    value: reviewed,
    source: "Kyoto City Tourism",
    sourceUrl: "https://example.com/what",
    checkedOn: "2026-10-20",
  }]);
  assert.equal(live.body.facts.where, undefined);
  assert.deepEqual(live.body.photos, [{
    imageUrl: ticked,
    credit: "Example Photographer",
    sourceUrl: "https://example.com/file",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  }]);

  const atFetch = await readTileDetailPanel(TILE, fetched);
  assert.equal(atFetch.facts.when?.[0].value, freshValue);
  assert.equal(atFetch.facts.when?.[0].source, "Viator");
  assert.equal(atFetch.facts.when?.[0].checkedOn, "2026-10-31");
  assert.equal(JSON.stringify(atFetch).includes(staleValue), false);
  assert.equal(JSON.stringify(atFetch).includes(`klook-${RUN}`), false);
});
