/**
 * SH-1 item 1 (ledger `2026-10-19-sh1-banned-copy`): migration 398 carries the never-say seed-copy edits onto rows
 * the insert-only seeders already wrote.
 *
 *   SC1 a representative sample of seeded rows carrying the OLD text (by the seeder's real id / slug / key) take the
 *       new text; a second application changes nothing; a row whose text was edited by hand is untouched
 *   SC2 the migration is data only: no ALTER / CREATE / DROP / CHECK / DEFAULT outside its comments
 *   SC3 the never-say checker finds nothing left in the seed paths (server/data, server/seeds, server/seed-*.ts)
 *
 * DISPOSABLE DB ONLY. SC1 runs inside ONE transaction that is rolled back, so the real-keyed fixture rows (and any
 * seeded dev rows they overwrite) never persist.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs, { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db";
import { scopeFiles, scanFile } from "../../scripts/check-never-say-copy";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const MIGRATION = readFileSync(path.join(here, "../migrations/398_sh1_seed_copy.sql"), "utf8");
const RUN = crypto.randomUUID().slice(0, 8);
const fx = (k: string) => `sc-${RUN}-${k}`;

const PONTOCHO_ID = "ee7a738d-a6e1-4637-a164-8ffe9997b58d";
const PONTOCHO_OLD = "Narrow street with traditional tea houses and geisha sightings";
const GION_CORNER_OLD = "Traditional geisha performance venue showcasing traditional arts";
const GION_CORNER_NEW = "Evening show of traditional Kyoto performing arts at Gion Corner";
const GION_NBHD_OLD = "Historic geisha district east of the Kamo River — teahouses, Hanamikoji street, evening ochaya.";
const GION_NBHD_NEW = "Historic district east of the Kamo River — teahouses, Hanamikoji street, evening ochaya.";
const CITY_TOUR_OLD = "Discover hidden gems and iconic landmarks with a passionate local guide who customizes the tour based on your interests.";
const CITY_TOUR_NEW = "Discover local picks and iconic landmarks with a passionate local guide who customizes the tour based on your interests.";
const DDD_DESC_OLD = "In-depth guide to a specific destination with local insights and hidden gems";
const DDD_DESC_NEW = "In-depth guide to a specific destination with local insights and local picks";
const DDD_INC_OLD = JSON.stringify(["PDF guide", "Local recommendations", "Maps", "Insider tips", "Safety advice"]);
const DDD_INC_NEW = ["PDF guide", "Local recommendations", "Maps", "Local tips", "Safety advice"];
const HAND_EDIT = `Hand-edited copy ${RUN}`;

function refuseNonDisposable() {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
}

after(async () => {
  await pool.end();
});

test("SC1 sample rows take the new copy, a second run is a no-op, a hand-edited row is untouched", async () => {
  refuseNonDisposable();
  const c = await pool.connect();
  const one = async (q: string, p: unknown[] = []) => (await c.query(q, p)).rows[0];
  try {
    await c.query("BEGIN");
    const user = fx("u");
    await c.query(`INSERT INTO users (id, email, first_name, last_name, role) VALUES ($1, $2, 'SC', 'Fixture', 'service_provider')`, [user, `${user}@t.test`]);

    // Pontocho gem (hidden-gems.json, by id).
    await c.query(
      `INSERT INTO travel_pulse_hidden_gems (id, city, country, place_name, description, why_locals_love_it)
       VALUES ($1, 'Kyoto', 'Japan', 'Pontocho Alley', $2, $2)
       ON CONFLICT (id) DO UPDATE SET place_name = 'Pontocho Alley', description = $2, why_locals_love_it = $2`,
      [PONTOCHO_ID, PONTOCHO_OLD],
    );
    // Gion Corner gem (phase-4 seeder key: city + place_name + neighborhood), plus a hand-edited twin.
    await c.query(`UPDATE travel_pulse_hidden_gems SET description = $1 WHERE city = 'Kyoto' AND place_name = 'Gion Corner (Gion-Kaburenjo)' AND neighborhood = 'gion'`, [GION_CORNER_OLD]);
    await c.query(
      `INSERT INTO travel_pulse_hidden_gems (id, city, place_name, neighborhood, description) VALUES
         ($1, 'Kyoto', 'Gion Corner (Gion-Kaburenjo)', 'gion', $2), ($3, 'Kyoto', 'Gion Corner (Gion-Kaburenjo)', 'gion', $4)`,
      [fx("gc"), GION_CORNER_OLD, fx("gc-hand"), HAND_EDIT],
    );
    // The fake bridal vendor (phase-d seeder key: email).
    await c.query(`UPDATE service_provider_forms SET business_name = 'Maiko Bridal Studio' WHERE email = 'kyoto-bridal@traveloure.test'`);
    await c.query(
      `INSERT INTO service_provider_forms (id, user_id, business_name, name, email, mobile, country, address, business_type, status)
       VALUES ($1, $2, 'Maiko Bridal Studio', 'Hana Yoshida', 'kyoto-bridal@traveloure.test', '+81', 'Japan', 'Gion', 'Bridal Services', 'approved')`,
      [fx("spf"), user],
    );
    // city_neighborhoods gion (city + country + slug), and a hand-edited washington-heights.
    await c.query(
      `INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng, description)
       VALUES ($1, 'Kyoto', 'Japan', 'Gion', 'gion', 35.0036, 135.7752, $2)
       ON CONFLICT (city, country, slug) DO UPDATE SET description = $2`,
      [fx("cn-gion"), GION_NBHD_OLD],
    );
    await c.query(
      `INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng, description)
       VALUES ($1, 'New York', 'USA', 'Washington Heights', 'washington-heights', 40.8448, -73.9396, $2)
       ON CONFLICT (city, country, slug) DO UPDATE SET description = $2`,
      [fx("cn-wh"), HAND_EDIT],
    );
    // A provider_services description (seeder key: service_name).
    await c.query(`UPDATE provider_services SET description = $1 WHERE service_name = 'Private City Tour with Local Guide'`, [CITY_TOUR_OLD]);
    await c.query(
      `INSERT INTO provider_services (id, user_id, service_name, description) VALUES ($1, $2, 'Private City Tour with Local Guide', $3)`,
      [fx("ps"), user, CITY_TOUR_OLD],
    );
    // A canonical service template (seeder key: title), with what_included in the JSON.stringify'd string form.
    await c.query(`UPDATE service_templates SET description = $1, what_included = to_jsonb($2::text) WHERE title = 'Destination Deep Dive'`, [DDD_DESC_OLD, DDD_INC_OLD]);
    await c.query(
      `INSERT INTO service_templates (id, title, description, what_included) VALUES ($1, 'Destination Deep Dive', $2, to_jsonb($3::text))`,
      [fx("st"), DDD_DESC_OLD, DDD_INC_OLD],
    );

    await c.query(MIGRATION);

    const g = await one(`SELECT place_name, description, why_locals_love_it FROM travel_pulse_hidden_gems WHERE id = $1`, [PONTOCHO_ID]);
    assert.deepEqual(g, {
      place_name: "Pontocho evening walk",
      description: "Narrow street with traditional tea houses",
      why_locals_love_it: "Narrow street with traditional tea houses",
    });
    assert.equal((await one(`SELECT description FROM travel_pulse_hidden_gems WHERE id = $1`, [fx("gc")])).description, GION_CORNER_NEW);
    assert.equal((await one(`SELECT business_name FROM service_provider_forms WHERE id = $1`, [fx("spf")])).business_name, "QA Bridal Studio");
    assert.equal((await one(`SELECT description FROM city_neighborhoods WHERE city = 'Kyoto' AND country = 'Japan' AND slug = 'gion'`)).description, GION_NBHD_NEW);
    assert.equal((await one(`SELECT description FROM provider_services WHERE id = $1`, [fx("ps")])).description, CITY_TOUR_NEW);
    const st = await one(`SELECT description, what_included #>> '{}' AS inc FROM service_templates WHERE id = $1`, [fx("st")]);
    assert.equal(st.description, DDD_DESC_NEW);
    assert.deepEqual(JSON.parse(st.inc), DDD_INC_NEW, "the string-form jsonb keeps its form and takes the new list");

    // Hand-edited rows are never touched.
    assert.equal((await one(`SELECT description FROM travel_pulse_hidden_gems WHERE id = $1`, [fx("gc-hand")])).description, HAND_EDIT);
    assert.equal(
      (await one(`SELECT description FROM city_neighborhoods WHERE city = 'New York' AND country = 'USA' AND slug = 'washington-heights'`)).description,
      HAND_EDIT,
    );

    // A second application changes nothing.
    const second = await c.query(MIGRATION);
    const results = Array.isArray(second) ? second : [second];
    assert.equal(results.reduce((n, r: any) => n + (r.rowCount ?? 0), 0), 0, "second run updates no row");
    assert.equal((await one(`SELECT place_name FROM travel_pulse_hidden_gems WHERE id = $1`, [PONTOCHO_ID])).place_name, "Pontocho evening walk");
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    c.release();
  }
});

test("SC2 the migration is data only", () => {
  const body = MIGRATION.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  // Strip the quoted copy so a word inside seed text cannot trip (or hide) the check.
  const code = body.replace(/\$(new|old|t)\$[\s\S]*?\$\1\$/g, "''");
  assert.doesNotMatch(code, /\b(ALTER|CREATE|DROP|CHECK|DEFAULT|INSERT|DELETE|TRUNCATE)\b/i);
  for (const stmt of code.split(";").map((s) => s.trim()).filter(Boolean)) assert.match(stmt, /^UPDATE\s/i);
});

test("SC3 the never-say checker finds nothing left in the seed paths", () => {
  const seedFiles = scopeFiles().filter((f) => /^server\/(data\/|seeds\/|seed-[^/]+\.ts$)/.test(f));
  assert.ok(seedFiles.length > 10, "the seed paths are in scope");
  const hits = seedFiles.flatMap((f) => scanFile(f, fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line} ${h.words}`), []);
});
