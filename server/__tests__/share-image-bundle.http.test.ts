/**
 * CP-1 PR 3 (ledger `2026-10-15-cp1-share-image-bundle`) — every share-image format renders from the
 * BUILT bundle.
 *
 * On the production build every share image answered 500 (`(0, d$e.default) is not a function`):
 * `satori` is external and ESM-only, and the CommonJS bundle's interop made the default import the
 * module namespace. Every existing test ran the TypeScript source, where the import resolves, so it
 * stayed green for as long as it was broken. This suite runs over HTTP against the server the CI job
 * starts — `node dist/index.cjs` in `suite-server-tests` — so it renders through the bundle.
 *
 *   S1  service: feed, story and route each answer 200 image/png with a PNG signature
 *   S2  review: an approved review renders
 *   S3  Ready Made: cover, map, story and og each render
 *   S4  no source file imports satori's default export directly — only `server/utils/satori.ts` loads it
 *
 * Run against a disposable dev database only, with the BUILT app started:
 *   npm run build && node dist/index.cjs &
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/share-image-bundle.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: crypto.randomUUID(),
  traveler: crypto.randomUUID(),
  service: crypto.randomUUID(),
  booking: crypto.randomUUID(),
  review: crypto.randomUUID(),
  build: crypto.randomUUID(),
  listing: crypto.randomUUID(),
};
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function assertPng(url: string, label: string) {
  const r = await fetch(`${BASE_URL}${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(r.status, 200, `${label}: ${buf.toString("utf8").slice(0, 200)}`);
  assert.equal(r.headers.get("content-type"), "image/png", label);
  assert.ok(buf.subarray(0, 8).equals(PNG_SIGNATURE), `${label}: a PNG`);
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `the built server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await pool.query(
    `INSERT INTO users (id, email, first_name, role, handle) VALUES ($1, $2, 'Share', 'service_provider', $3), ($4, $5, 'Rina', 'user', NULL)`,
    [ids.owner, `share-owner-${RUN}@traveloure.test`, `share${RUN}`, ids.traveler, `share-trav-${RUN}@traveloure.test`],
  );
  await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method, city)
     VALUES ($1, $2, 'Share card walk', '30.00', 'active', 'approved', 'in_person', 'Kyoto')`,
    [ids.service, ids.owner],
  );
  await pool.query(
    `INSERT INTO service_route_points (id, service_id, position, name, latitude, longitude) VALUES
       ($1, $3, 1, 'First stop', 35.0036, 135.7785), ($2, $3, 2, 'Second stop', 35.0000, 135.7810)`,
    [crypto.randomUUID(), crypto.randomUUID(), ids.service],
  );
  await pool.query(
    `INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount) VALUES ($1, $2, $3, $4, 'completed', 30.00)`,
    [ids.booking, ids.service, ids.traveler, ids.owner],
  );
  await pool.query(
    `INSERT INTO service_reviews (id, booking_id, service_id, provider_id, traveler_id, rating, review_text, status)
     VALUES ($1, $2, $3, $4, $5, 5, 'A lovely morning.', 'approved')`,
    [ids.review, ids.booking, ids.service, ids.owner, ids.traveler],
  );
  await pool.query(
    `INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status) VALUES ($1, NULL, $2, 'build', 'Kyoto, Japan', '2027-03-10', '2027-03-11', 'draft')`,
    [ids.build, ids.owner],
  );
  await pool.query(
    `INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude) VALUES
       ($1, $3, 'Stop A', 'activity', 1, 0, 35.0036, 135.7785), ($2, $3, 'Stop B', 'activity', 2, 0, 35.0094, 135.6680)`,
    [crypto.randomUUID(), crypto.randomUUID(), ids.build],
  );
  await pool.query(
    `INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, price_cents, status, active)
     VALUES ($1, $2, $3, 'Kyoto', $4, 2, 4900, 'approved', true)`,
    [ids.listing, ids.owner, ids.build, `Share bundle ${RUN}`],
  );
});

after(async () => {
  try {
    await pool.query(`DELETE FROM ready_made_trips WHERE id = $1`, [ids.listing]);
    await pool.query(`DELETE FROM itinerary_items WHERE trip_id = $1`, [ids.build]);
    await pool.query(`DELETE FROM trips WHERE id = $1`, [ids.build]);
    await pool.query(`DELETE FROM service_reviews WHERE id = $1`, [ids.review]);
    await pool.query(`DELETE FROM service_bookings WHERE id = $1`, [ids.booking]);
    await pool.query(`DELETE FROM service_route_points WHERE service_id = $1`, [ids.service]);
    await pool.query(`DELETE FROM provider_services WHERE id = $1`, [ids.service]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [[ids.owner, ids.traveler]]);
  } finally {
    await pool.end();
  }
});

test("S1: every service share format renders", async () => {
  for (const format of ["feed", "story", "route"]) {
    await assertPng(`/api/share-image/service/${ids.service}.png?format=${format}`, `service ${format}`);
  }
});

test("S2: an approved review renders", async () => {
  await assertPng(`/api/share-image/review/${ids.review}.png`, "review");
});

test("S3: every served Ready Made share format renders; the map format is not served (GC-1)", async () => {
  for (const format of ["cover", "story", "og"]) {
    await assertPng(`/api/share-image/ready-made/${ids.listing}.png?format=${format}`, `ready-made ${format}`);
  }
  // GC-1 (ledger `2026-10-17-gc1-google-coords`): not served while no located stop has a non-Google point.
  const map = await fetch(`${BASE_URL}/api/share-image/ready-made/${ids.listing}.png?format=map`);
  assert.equal(map.status, 404, "the map format is not served");
});

test("S4: satori is loaded in ONE place, never by a bare default import", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !p.endsWith(path.join("utils", "satori.ts"))) {
        if (/from\s+["']satori["']/.test(fs.readFileSync(p, "utf8"))) offenders.push(path.relative(root, p));
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], "import `satori` from server/utils/satori.ts");
});
