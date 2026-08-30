/**
 * T-REP — traveler representation sweep (docs/briefs/SERVICE_CREATION_EXECUTION_MAP.md, G5 #13;
 * execution-map Wave 3). CLAUDE.md §13/§14/§18/§19.
 *
 * `GET /api/services/:id` is `SELECT * FROM provider_services` spread almost verbatim onto the
 * public wire (`omitFields` stripped only `serviceFile` before this lane). Two things follow:
 *
 *   (a) fields the provider authored and the SERVER already enforces at checkout
 *       (`booking-eligibility.service.ts`'s party-size / start-window / lead-time gates) were
 *       riding the response completely unrendered on the traveler page — a traveler could be
 *       silently refused with no way to have known the constraint existed;
 *   (b) fields that must NEVER reach a public read — `revenueShareRate` (a §18 rate-bearing
 *       column) and the approval-workflow internals (`reviewedBy`, `rejectionReason`,
 *       `formStatus`, `submittedAt`, `reviewedAt`, `totalRevenue`) — were riding the SAME spread
 *       with no strip at all, unlike the owner-write echoes (routes.ts CC-8/NEW-2) which already
 *       omit `revenueShareRate`.
 *
 * This suite proves, against the ALREADY-RUNNING dev server (the `service-display-options.http`
 * posture — real routes, real DB, real HTTP), with the NEGATIVE proof (b) FIRST per this lane's
 * own instructions:
 *
 *   N1  the never-expose list is absent from the public read of an APPROVED+ACTIVE listing that
 *       has non-null values in every one of those columns (revenueShareRate/reviewedBy/
 *       rejectionReason/formStatus/submittedAt/reviewedAt/totalRevenue) — the strip is real, not
 *       "never populated so never observed".
 *   N2  `serviceFile` (the D3 pre-existing strip) stays absent — no regression.
 *   P1  the three booking-eligibility fields (partySizeMin/Max, earliestStartTime/latestStartTime
 *       + serviceTimezone, leadTimeHours) round-trip onto the public read with the stored values.
 *   P2  changeCutoffHours, bufferMinutes, durationMinutes, transportProvision, galleryImages,
 *       depositEnabled/Type/Percentage/FlatAmount, revisionsIncluded, includesExpertNotes all
 *       round-trip.
 *   P3  `neighborhoods` is joined onto the public read from `provider_neighborhood_coverage` ×
 *       `city_neighborhoods` for THIS listing's category — same derivation the owner's own
 *       `GET /api/provider/services/:id` already uses to pre-populate its multi-select.
 *   P4  a listing with NONE of these fields set (every pre-195 row) reads back with them absent/
 *       null/empty — never a fabricated default (§13).
 *   P5  the never-expose strip holds across EVERY product-shape branch (bundle/property/room),
 *       not just the default branch.
 *
 * Run solo: JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/service-detail-traveler-representation.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── DB-write safety guard (mirrors service-display-options.http.test.ts; never defaults open) ──
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function connStringHost(): string | null {
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;
  try {
    return new URL(cs).hostname.toLowerCase();
  } catch {
    return null;
  }
}
async function assertDisposableDb(): Promise<void> {
  const optIn = process.env.JOURNEY_DB_WRITES_OK === "1";
  const csHost = connStringHost();
  let serverAddr: string | null = null;
  try {
    const r = await pool.query("SELECT host(inet_server_addr()) AS addr");
    serverAddr = r.rows[0]?.addr ?? null;
  } catch {
    /* NULL inet_server_addr() (local socket) is itself a disposable-local signal. */
  }
  const serverIsLocal = serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr);
  const csIsLocal = csHost !== null && DISPOSABLE_HOSTS.has(csHost);
  const disposable = csIsLocal || (csHost === null && serverIsLocal);
  if (!disposable && !optIn) {
    throw new Error(
      `[service-detail-traveler-representation] REFUSING to write fixtures: DATABASE_URL host ` +
        `'${csHost ?? "<none>"}' / server addr '${serverAddr ?? "<local-socket>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];
const createdCoverageRows: string[] = [];

function emailTag(label: string): string {
  return `trep-${RUN}-${label}@t.test`;
}

interface Actor {
  id: string;
  email: string;
  cookie: string;
}

async function registerActor(label: string): Promise<Actor> {
  const email = emailTag(label);
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "Trep", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  await pool.query(`UPDATE users SET role = 'service_provider' WHERE id = $1`, [body.user.id]);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

/** A fully-populated APPROVED + ACTIVE listing: every T-REP field set to a real, distinct value,
 *  PLUS every never-expose column populated non-null — so N1 proves an actual strip, not silence
 *  from an empty column. */
async function seedFullListing(ownerId: string, categoryId: string | null): Promise<string> {
  const id = `trep-${RUN}-full-${crypto.randomUUID().slice(0, 6)}`;
  await pool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, price, status, approval_status, delivery_method, category_id,
        party_size_min, party_size_max, lead_time_hours, change_cutoff_hours,
        earliest_start_time, latest_start_time, service_timezone,
        buffer_minutes, duration_minutes, transport_provision,
        gallery_images, deposit_enabled, deposit_type, deposit_percentage, deposit_flat_amount,
        revisions_included, includes_expert_notes,
        service_file, revenue_share_rate, reviewed_by, rejection_reason, form_status,
        submitted_at, reviewed_at, total_revenue)
     VALUES ($1, $2, $3, '150.00', 'active', 'approved', 'in_person', $4,
        2, 8, 24, 48,
        '08:30', '17:00', 'Asia/Tokyo',
        30, 180, 'pickup_available',
        $5, true, 'percentage', 30, NULL,
        2, true,
        'https://example.com/should-never-leak.pdf', '0.60', $2, 'internal test reason', 'reviewed',
        now(), now(), '999.99')`,
    [id, ownerId, `T-REP full ${RUN}`, categoryId, JSON.stringify(["https://example.com/g1.jpg", "https://example.com/g2.jpg"])],
  );
  createdServiceIds.push(id);
  return id;
}

/** A bare listing — every T-REP-touched column left at its schema default/NULL, so P4 proves
 *  absence renders as absence rather than a fabricated value. */
async function seedBareListing(ownerId: string): Promise<string> {
  const id = `trep-${RUN}-bare-${crypto.randomUUID().slice(0, 6)}`;
  await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method)
     VALUES ($1, $2, $3, '80.00', 'active', 'approved', 'pdf')`,
    [id, ownerId, `T-REP bare ${RUN}`],
  );
  createdServiceIds.push(id);
  return id;
}

async function fetchServiceDetail(id: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}/api/services/${id}`);
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body };
}

let owner: Actor;
let categoryId: string;
let categoryKey: string;
let neighborhoodIds: string[];

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  owner = await registerActor("owner");

  // Reuse a real seeded category (with a non-null category_key) and two real Kyoto neighborhoods
  // rather than inserting fresh rows — service_categories.name/slug are UNIQUE and this suite has
  // no reason to fight the seed data for them.
  const catRes = await pool.query(
    `SELECT id, category_key FROM service_categories WHERE category_key IS NOT NULL LIMIT 1`,
  );
  assert.ok(catRes.rows.length > 0, "expected at least one seeded service_categories row with a category_key");
  categoryId = catRes.rows[0].id;
  categoryKey = catRes.rows[0].category_key;

  const nbhRes = await pool.query(`SELECT id, name FROM city_neighborhoods ORDER BY name LIMIT 2`);
  assert.ok(nbhRes.rows.length >= 2, "expected at least two seeded city_neighborhoods rows");
  neighborhoodIds = nbhRes.rows.map((r: any) => r.id);
});

after(async () => {
  try {
    await assertDisposableDb();
    if (createdCoverageRows.length) {
      await pool.query(`DELETE FROM provider_neighborhood_coverage WHERE id = ANY($1::uuid[])`, [createdCoverageRows]);
    }
    if (createdServiceIds.length) {
      await pool.query(`DELETE FROM provider_services WHERE id = ANY($1::text[])`, [createdServiceIds]);
    }
    if (createdEmails.length) {
      await pool.query(`DELETE FROM users WHERE email = ANY($1::text[])`, [createdEmails]);
    }
  } finally {
    await pool.end();
  }
});

test("N1 (negative, first): the never-expose list is absent from the public read even though every column is populated non-null", async () => {
  const id = await seedFullListing(owner.id, categoryId);
  const { status, body } = await fetchServiceDetail(id);
  assert.equal(status, 200);
  for (const key of ["revenueShareRate", "reviewedBy", "rejectionReason", "formStatus", "submittedAt", "reviewedAt", "totalRevenue"]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(body, key),
      false,
      `${key} must be stripped from the public service-detail read (§14/§18/§19) — it was populated non-null in the fixture`,
    );
  }
});

test("N2 (no regression): serviceFile (D3 pre-existing strip) stays absent", async () => {
  const id = await seedFullListing(owner.id, categoryId);
  const { body } = await fetchServiceDetail(id);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "serviceFile"), false);
});

test("P1: the three booking-eligibility fields round-trip with their stored values", async () => {
  const id = await seedFullListing(owner.id, categoryId);
  const { body } = await fetchServiceDetail(id);
  assert.equal(body.partySizeMin, 2);
  assert.equal(body.partySizeMax, 8);
  assert.equal(body.earliestStartTime, "08:30");
  assert.equal(body.latestStartTime, "17:00");
  assert.equal(body.serviceTimezone, "Asia/Tokyo");
  assert.equal(body.leadTimeHours, 24);
});

test("P2: the remaining T-REP fields round-trip with their stored values", async () => {
  const id = await seedFullListing(owner.id, categoryId);
  const { body } = await fetchServiceDetail(id);
  assert.equal(body.changeCutoffHours, 48);
  assert.equal(body.bufferMinutes, 30);
  assert.equal(body.durationMinutes, 180);
  assert.equal(body.transportProvision, "pickup_available");
  assert.deepEqual(body.galleryImages, ["https://example.com/g1.jpg", "https://example.com/g2.jpg"]);
  assert.equal(body.depositEnabled, true);
  assert.equal(body.depositType, "percentage");
  assert.equal(body.depositPercentage, 30);
  assert.equal(body.revisionsIncluded, 2);
  assert.equal(body.includesExpertNotes, true);
});

test("P3: neighborhoods is joined from provider_neighborhood_coverage x city_neighborhoods for this listing's category", async () => {
  const id = await seedFullListing(owner.id, categoryId);
  for (const [i, neighborhoodId] of neighborhoodIds.entries()) {
    const rowId = crypto.randomUUID();
    createdCoverageRows.push(rowId);
    await pool.query(
      `INSERT INTO provider_neighborhood_coverage (id, provider_id, neighborhood_id, category_key, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [rowId, owner.id, neighborhoodId, categoryKey, i],
    );
  }
  const { body } = await fetchServiceDetail(id);
  assert.ok(Array.isArray(body.neighborhoods), "neighborhoods must be an array");
  assert.equal(body.neighborhoods.length, 2);
  assert.ok(body.neighborhoods.every((n: any) => typeof n.slug === "string" && typeof n.name === "string"));
});

test("P4 (§13): a bare listing (no T-REP fields ever set) reads back absent/null/empty, never a fabricated default", async () => {
  const id = await seedBareListing(owner.id);
  const { body } = await fetchServiceDetail(id);
  assert.equal(body.partySizeMin, null);
  assert.equal(body.partySizeMax, null);
  assert.equal(body.earliestStartTime, null);
  assert.equal(body.latestStartTime, null);
  assert.equal(body.serviceTimezone, null);
  assert.equal(body.changeCutoffHours, null);
  assert.equal(body.bufferMinutes, null);
  assert.equal(body.durationMinutes, null);
  assert.equal(body.transportProvision, null);
  assert.equal(body.depositEnabled, false);
  assert.equal(body.revisionsIncluded, 0);
  assert.equal(body.includesExpertNotes, false);
  assert.ok(Array.isArray(body.neighborhoods) && body.neighborhoods.length === 0, "no category ⇒ an honest empty neighborhoods list");
  // leadTimeHours carries a real non-null schema DEFAULT of 24 (not this endpoint's invention —
  // see booking-eligibility.service.ts's own comment on the ONE non-NULL default in the D7 set).
  assert.equal(body.leadTimeHours, 24);
});

test("P5: the never-expose strip holds on the BUNDLE branch too", async () => {
  const bundleId = `trep-${RUN}-bundle-${crypto.randomUUID().slice(0, 6)}`;
  await pool.query(
    `INSERT INTO provider_services
       (id, user_id, service_name, price, status, approval_status, delivery_method, product_shape,
        revenue_share_rate, reviewed_by, rejection_reason, form_status, submitted_at, reviewed_at, total_revenue)
     VALUES ($1, $2, $3, '0', 'active', 'approved', 'pdf', 'bundle',
        '0.60', $2, 'internal test reason', 'reviewed', now(), now(), '999.99')`,
    [bundleId, owner.id, `T-REP bundle ${RUN}`],
  );
  createdServiceIds.push(bundleId);
  const { body } = await fetchServiceDetail(bundleId);
  assert.ok(Array.isArray(body.bundleComponents), "bundle branch must be the one that responded");
  for (const key of ["revenueShareRate", "reviewedBy", "rejectionReason", "formStatus", "submittedAt", "reviewedAt", "totalRevenue"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(body, key), false, `${key} must be stripped on the bundle branch too`);
  }
});
