/**
 * MIGRATION 289 — THE `service_categories.category_key` REPAIR.
 * Ledger `2026-09-06-category-key-repair`; CLAUDE.md Locked Decision 31.
 *
 * WHAT IS BEING PROVEN, AND WHY IT NEEDS A DATABASE
 * ────────────────────────────────────────────────
 * Migration 034's ORIGINAL form was `UPDATE … WHERE slug` for 15 legacy rows plus `INSERT` for 9
 * new ones; it assigned nothing where a slug did not match and nothing where the legacy row was
 * absent. It was later repaired to a single UPSERT — but a stamped migration NEVER RE-RUNS, so a
 * database that applied the pre-repair form still carries the pre-repair outcome. Production does:
 * 27 rows, exactly TWO with a `category_key` (`custom_other`, `venue`).
 *
 * That state cannot be reproduced by running the migration chain — the chain applies 034's REPAIRED
 * form and comes out clean, which is precisely why the bug survived every green CI run. So this
 * file BUILDS the production shape by hand in an isolated schema and runs 289 against it. The
 * fixture table is `CREATE TABLE … (LIKE public.service_categories INCLUDING ALL)`: its columns,
 * defaults and — critically — its three UNIQUE constraints (`name`, `slug`, and the partial
 * `idx_service_categories_category_key`) are COPIED from the real table rather than re-typed, so a
 * schema change cannot leave this proof testing a shape the platform no longer has.
 *
 * NEGATIVES FIRST, per house convention:
 *   N1  289 NEVER OVERWRITES AN EXISTING KEY. The two rows that already carry one (`venue`,
 *       `custom_other`) come out byte-identical — same id, name, slug, key, band, sort order and
 *       `updated_at`. A repair that re-stamped them would be a second author of migration 285's row.
 *   N2  289 CREATES NO DUPLICATE. No `category_key`, `name` or `slug` appears twice afterwards, and
 *       a category whose SLUG drifted is REPAIRED IN PLACE rather than shadowed by a second row.
 *   N3  A SECOND RUN IS A NO-OP, byte-for-byte over every column of every row. A migration that is
 *       idempotent only in its key column is not idempotent — `updated_at` moving on a re-run would
 *       mean a live database's audit trail churns on every replay.
 *
 * POSITIVES:
 *   P1  all 24 keys migration 034 owns are present exactly once after the repair, on the production
 *       shape — the 15 legacy rows keyed in place, the 9 absent ones created.
 *   P2  a legacy row whose SLUG drifted away from 034's expectation is still found, BY NAME, and
 *       keeps its own slug (the repair assigns the key; it does not rewrite the catalog's copy).
 *   P3  the taxonomy guards pass with 289 registered — `check-category-reachability.cjs` and
 *       `check-roles-needed-reachability.cjs`, each with its `--self-test` fixtures first (§18d).
 *       Run as real processes: a guard asserted by importing its internals is not the guard CI runs.
 *   P4  289 is registered in BOTH registries it must be in — `MIGRATION_FILES` (or `runMigrations`
 *       never applies it) and the taxonomy registry as a REPAIR of 034 (or the two reachability
 *       guards read it as a second claim on 034's keys and fail).
 *
 * STATED LIMIT (§18d negative space). This proves what 289 does to a database whose rows it CAN
 * identify — by slug, then by name. It says NOTHING about a row whose slug AND name have both
 * drifted: 289 cannot see such a row and will insert 034's canonical row beside it. That case is
 * undecidable from inside the migration and is deliberately left to a human, through
 * `scripts/preview-category-key-repair.cjs` run against the real database before publishing.
 *
 * DISPOSABLE DB ONLY. Every object this file creates lives in its own throwaway schema, dropped in
 * after(). It never reads or writes `public.service_categories`; it only copies its SHAPE.
 *
 *   npx tsx --test --test-concurrency=1 server/__tests__/category-key-repair.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { MIGRATION_FILES } from "../migrations/migration-files";

const require_ = createRequire(import.meta.url);
const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRATION_FILE = "289_reconcile_service_category_keys.sql";
const MIGRATION_SQL = readFileSync(join(REPO, "server", "migrations", MIGRATION_FILE), "utf8");

const RUN = crypto.randomUUID().replace(/-/g, "").slice(0, 10);

/** The 24 keys migration 034 owns — the exact set 289 may assign, and no other. */
const KEYS_034 = [
  "private_transportation", "tour_guide", "photography", "accommodation", "dining_venue",
  "activity_provider", "private_chef", "concierge_vip", "childcare_family", "event_coordinator",
  "florist", "entertainment", "hair_makeup", "av_tech", "rentals",
  "videographer", "caterer", "officiant", "accessibility_specialist", "printing_materials",
  "aff_activities", "aff_events", "aff_ground_transport", "aff_air_hotel",
];

/**
 * THE PRODUCTION SHAPE. 27 rows: 034's 15 legacy categories (present, unkeyed), twelve further
 * legacy rows outside 034's taxonomy (also unkeyed — 034's own "14 legacy rows UNTOUCHED" set), and
 * the two rows that DO carry a key today. There is no row behind `caterer` or `officiant` at all,
 * and none behind `florist` either — `Floral & Decoration` is present but its key is NULL, which is
 * exactly the state that made the slip's role chips resolve to nothing.
 *
 * `commission_band_key` is NOT NULL on this table (migration 180), so every seeded row carries a
 * band; that is the shape of a real row, not a fixture convenience.
 */
const LEGACY_15: Array<[string, string]> = [
  ["Transportation & Logistics", "transportation-logistics"],
  ["Tours & Experiences", "tours-experiences"],
  ["Photography & Videography", "photography-videography"],
  ["Lodging & Accommodation", "lodging-accommodation"],
  ["Restaurants & Dining", "restaurants-dining"],
  ["Arts & Crafts Instruction", "arts-crafts-instruction"],
  ["Food & Culinary", "food-culinary"],
  ["Personal Assistance", "personal-assistance"],
  ["Childcare & Family", "childcare-family"],
  ["Events & Celebrations", "events-celebrations"],
  ["Floral & Decoration", "floral-decoration"],
  ["Entertainment", "entertainment"],
  ["Beauty & Styling", "beauty-styling"],
  ["Technical Services", "technical-services"],
  ["Rental Services", "rental-services"],
];

/** Rows outside 034's map. They must come out of the repair UNTOUCHED and still key-less. */
const OUTSIDE_034: Array<[string, string]> = [
  ["Wedding Services", "wedding-services"],
  ["Health & Wellness", "health-wellness"],
  ["Pets & Animals", "pets-animals"],
  ["Technology & Connectivity", "technology-connectivity"],
  ["Language & Translation", "language-translation"],
  ["Specialty Services", "specialty-services"],
  ["TaskRabbit Services", "taskrabbit-services"],
  ["Music & Performance", "music-performance"],
  ["Cultural & Educational", "cultural-educational"],
  ["Business & Professional", "business-professional"],
];

/** The two rows production already has keys on. */
const ALREADY_KEYED: Array<[string, string, string]> = [
  ["Custom / Other", "custom-other", "custom_other"],
  ["Venues", "venues", "venue"],
];

let client: Client;

/** Disposable-DB guard (house shape; never defaults open). */
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host !== null && DISPOSABLE.has(host)) return;
  let serverAddr: string | null = null;
  try {
    serverAddr = (await client.query("SELECT host(inet_server_addr()) AS addr")).rows[0]?.addr ?? null;
  } catch { /* local socket ⇒ disposable */ }
  if (host === null && (serverAddr === null || DISPOSABLE.has(serverAddr))) return;
  throw new Error(
    `[category-key-repair] REFUSING to create fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
      "not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.",
  );
}

const schemas: string[] = [];

/**
 * A throwaway schema holding ONE table whose shape is copied from the live `service_categories` —
 * columns, defaults, and the three UNIQUE constraints the migration's `ON CONFLICT` arbitrates on.
 */
async function freshSchema(label: string): Promise<string> {
  const name = `catrepair_${RUN}_${label}`;
  schemas.push(name);
  await client.query(`CREATE SCHEMA "${name}"`);
  await client.query(
    `CREATE TABLE "${name}".service_categories (LIKE public.service_categories INCLUDING ALL)`,
  );
  await client.query(`SET search_path TO "${name}", public`);
  return name;
}

async function seed(rows: Array<{ name: string; slug: string; key?: string | null }>): Promise<void> {
  for (const r of rows) {
    await client.query(
      `INSERT INTO service_categories (name, slug, description, category_type, is_active, sort_order,
                                       commission_band_key, category_key)
       VALUES ($1, $2, $3, 'service_provider', true, 0, 'moderate', $4)`,
      [r.name, r.slug, `${r.name} (fixture)`, r.key ?? null],
    );
  }
}

async function snapshot(): Promise<string> {
  const res = await client.query(
    `SELECT to_jsonb(t) AS row FROM service_categories t ORDER BY t.name`,
  );
  return JSON.stringify(res.rows.map((r) => r.row));
}

async function applyMigration(): Promise<void> {
  await client.query(MIGRATION_SQL);
}

before(async () => {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "DATABASE_URL must be set to a disposable database for this test");
  client = new Client({ connectionString: url });
  await client.connect();
  await assertDisposableDb();
  // The fixture copies the live table's shape; without it there is nothing to copy from.
  const exists = await client.query(
    `SELECT to_regclass('public.service_categories') IS NOT NULL AS ok`,
  );
  assert.equal(
    exists.rows[0].ok,
    true,
    "public.service_categories is missing — run the migration chain against this database first " +
      "(npx tsx server/migrations/migrate-entry.ts). This test copies the real table's SHAPE.",
  );
});

after(async () => {
  if (!client) return;
  for (const s of schemas) {
    await client.query(`DROP SCHEMA IF EXISTS "${s}" CASCADE`).catch(() => {});
  }
  await client.end().catch(() => {});
});

// ── P1 / N1 / N2 / N3 — the production shape ───────────────────────────────────────────────────

test("P1 — on the production shape, all 24 of migration 034's keys end up present exactly once", async () => {
  await freshSchema("prod");
  await seed([
    ...LEGACY_15.map(([name, slug]) => ({ name, slug })),
    ...OUTSIDE_034.map(([name, slug]) => ({ name, slug })),
    ...ALREADY_KEYED.map(([name, slug, key]) => ({ name, slug, key })),
  ]);

  // The state the bug leaves behind, asserted before the fix so a fixture drift cannot make the
  // repair look effective against an already-healthy table.
  const before = await client.query(
    `SELECT count(*)::int AS total,
            count(category_key)::int AS keyed
       FROM service_categories`,
  );
  assert.equal(before.rows[0].total, 27, "the fixture is the 27-row production shape");
  assert.equal(before.rows[0].keyed, 2, "exactly two rows carry a key before the repair");
  const missing = await client.query(
    `SELECT count(*)::int AS n FROM service_categories
      WHERE category_key IN ('florist','caterer','officiant')`,
  );
  assert.equal(missing.rows[0].n, 0, "no florist / caterer / officiant row exists before the repair");

  await applyMigration();

  const keys = await client.query(
    `SELECT category_key, count(*)::int AS n FROM service_categories
      WHERE category_key IS NOT NULL GROUP BY 1 ORDER BY 1`,
  );
  const byKey = new Map<string, number>(keys.rows.map((r) => [r.category_key, r.n]));
  for (const k of KEYS_034) {
    assert.equal(byKey.get(k), 1, `category_key "${k}" must be present exactly once after the repair`);
  }
  // The repair assigns 034's 24 and nothing else; `venue` and `custom_other` were already there.
  assert.deepEqual(
    [...byKey.keys()].sort(),
    [...KEYS_034, "custom_other", "venue"].sort(),
    "289 assigns exactly 034's 24 keys — never `venue`, never a key of its own",
  );

  // The 15 legacy rows were repaired IN PLACE (not shadowed): 27 seeded + the 9 rows 034 owns that
  // this database never had.
  const total = await client.query(`SELECT count(*)::int AS n FROM service_categories`);
  assert.equal(total.rows[0].n, 36, "15 legacy rows keyed in place; only the 9 absent ones inserted");

  // Rows outside 034's map are untouched and still honestly key-less (§13).
  const outside = await client.query(
    `SELECT count(*)::int AS n FROM service_categories
      WHERE name = ANY($1) AND category_key IS NOT NULL`,
    [OUTSIDE_034.map(([n]) => n)],
  );
  assert.equal(outside.rows[0].n, 0, "a category outside 034's taxonomy is never given a key");
});

test("N2 — the repair creates no duplicate key, name or slug", async () => {
  await freshSchema("dupes");
  await seed([
    ...LEGACY_15.map(([name, slug]) => ({ name, slug })),
    ...OUTSIDE_034.map(([name, slug]) => ({ name, slug })),
    ...ALREADY_KEYED.map(([name, slug, key]) => ({ name, slug, key })),
  ]);
  await applyMigration();

  for (const col of ["category_key", "name", "slug"]) {
    const dup = await client.query(
      `SELECT ${col} AS v, count(*)::int AS n FROM service_categories
        WHERE ${col} IS NOT NULL GROUP BY 1 HAVING count(*) > 1`,
    );
    assert.deepEqual(dup.rows, [], `no duplicate ${col} after the repair`);
  }
});

test("N1 — `venue` and `custom_other` come out byte-identical; the repair never re-stamps a keyed row", async () => {
  await freshSchema("keyed");
  await seed([
    ...LEGACY_15.map(([name, slug]) => ({ name, slug })),
    ...ALREADY_KEYED.map(([name, slug, key]) => ({ name, slug, key })),
  ]);
  const beforeRows = await client.query(
    `SELECT to_jsonb(t) AS row FROM service_categories t
      WHERE t.category_key IN ('venue','custom_other') ORDER BY t.category_key`,
  );
  await applyMigration();
  const afterRows = await client.query(
    `SELECT to_jsonb(t) AS row FROM service_categories t
      WHERE t.category_key IN ('venue','custom_other') ORDER BY t.category_key`,
  );
  assert.deepEqual(
    afterRows.rows.map((r) => r.row),
    beforeRows.rows.map((r) => r.row),
    "an already-keyed row is not touched — not its key, band, sort order or updated_at",
  );
});

test("N3 — a second run is a no-op, byte-for-byte over every column of every row", async () => {
  await freshSchema("idem");
  await seed([
    ...LEGACY_15.map(([name, slug]) => ({ name, slug })),
    ...OUTSIDE_034.map(([name, slug]) => ({ name, slug })),
    ...ALREADY_KEYED.map(([name, slug, key]) => ({ name, slug, key })),
  ]);
  await applyMigration();
  const first = await snapshot();
  await applyMigration();
  const second = await snapshot();
  assert.equal(second, first, "running 289 twice changes nothing, including updated_at");
});

// ── P2 — the drifted-slug case, which is the whole reason the name pass exists ─────────────────

test("P2 — a legacy row whose SLUG drifted is repaired BY NAME, in place, keeping its own slug", async () => {
  await freshSchema("drift");
  await seed([
    // Two rows carrying 034's NAMES under slugs 034 would not recognise.
    { name: "Photography & Videography", slug: "photo-video" },
    { name: "Floral & Decoration", slug: "flowers-and-decor" },
    // One row matching 034 on slug, to prove both passes coexist.
    { name: "Rental Services", slug: "rental-services" },
    ...ALREADY_KEYED.map(([name, slug, key]) => ({ name, slug, key })),
  ]);
  const idsBefore = await client.query(
    `SELECT name, id, slug FROM service_categories WHERE name = ANY($1) ORDER BY name`,
    [["Photography & Videography", "Floral & Decoration"]],
  );
  await applyMigration();

  for (const [name, key, keptSlug] of [
    ["Photography & Videography", "photography", "photo-video"],
    ["Floral & Decoration", "florist", "flowers-and-decor"],
  ]) {
    const rows = await client.query(
      `SELECT id, slug, category_key FROM service_categories WHERE name = $1`,
      [name],
    );
    assert.equal(rows.rowCount, 1, `"${name}" is repaired in place, never shadowed by a second row`);
    assert.equal(rows.rows[0].category_key, key, `"${name}" is keyed by the NAME pass`);
    assert.equal(rows.rows[0].slug, keptSlug, "the repair assigns the key; it does not rewrite the slug");
    const was = idsBefore.rows.find((r) => r.name === name);
    assert.equal(rows.rows[0].id, was.id, "the SAME row was repaired — not a replacement");
  }

  // 034's canonical slugs must NOT have been inserted alongside the drifted rows.
  const shadow = await client.query(
    `SELECT count(*)::int AS n FROM service_categories
      WHERE slug IN ('photography-videography','floral-decoration')`,
  );
  assert.equal(shadow.rows[0].n, 0, "no canonical-slug row was inserted beside the drifted one");

  // The slug pass still works in the same run.
  const bySlug = await client.query(
    `SELECT category_key FROM service_categories WHERE slug = 'rental-services'`,
  );
  assert.equal(bySlug.rows[0].category_key, "rentals");
});

// ── P3 / P4 — the registries and the guards ────────────────────────────────────────────────────

test("P4 — 289 is registered in MIGRATION_FILES and as a REPAIR of 034 in the taxonomy registry", async () => {
  assert.ok(
    (MIGRATION_FILES as readonly string[]).includes(MIGRATION_FILE),
    "289 must be in MIGRATION_FILES or runMigrations never applies it on boot",
  );
  const registry = require_(join(REPO, "scripts", "lib", "taxonomy-registry.cjs"));
  const rel = `server/migrations/${MIGRATION_FILE}`;
  assert.ok(
    registry.TAXONOMY_MIGRATIONS.includes(rel),
    "289 must be in TAXONOMY_MIGRATIONS — an unregistered key assigner is invisible to both guards",
  );
  assert.equal(
    registry.TAXONOMY_REPAIRS[rel],
    "server/migrations/034_phase1_reconcile_service_categories.sql",
    "289 must be declared a REPAIR of 034, or the registry reads it as a second claim on 034's keys",
  );
});

test("P3 — both taxonomy reachability guards pass with 289 registered (self-test fixtures first)", () => {
  for (const script of [
    "scripts/check-category-reachability.cjs",
    "scripts/check-roles-needed-reachability.cjs",
  ]) {
    for (const args of [[script, "--self-test"], [script]]) {
      // Run as a real process: a guard asserted by importing its internals is not the guard CI runs.
      execFileSync(process.execPath, args, { cwd: REPO, stdio: "pipe" });
    }
  }
});
