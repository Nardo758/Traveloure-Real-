/**
 * S7 AVAILABILITY MODEL — behavioural proof (DECISIONS.md ledger row 102, Wave 3 schema ballot
 * ratified as recommended, decision-maker Aug 13, 2026; docs/briefs/WAVE3_SCHEMA_PROPOSALS.md).
 *
 * Three additive child tables (migration 210): service_availability_patterns (weekly repeat
 * rule), service_date_ranges (property/room date-range authoring), service_availability_blackouts
 * (applies to either shape) — AUTHORING data. server/services/availability-materializer.service.ts
 * expands patterns minus blackouts into ordinary vendor_availability_slots rows, ADD-ONLY
 * (ON CONFLICT DO NOTHING against the migration-210 unique index), so storage.bookSlot/
 * releaseSlot/the checkout spine/the sweep need zero changes and are proven UNCHANGED here (P-CLAIM).
 *
 * NEGATIVES FIRST, per house convention:
 *   N-OWNER-*    non-owner writes are refused 404 (route-points/surcharge-tiers precedent —
 *                "a non-owner can't distinguish 'not yours' from 'doesn't exist'"; travel-surcharge's
 *                own T1 proof asserts the identical 404, not 403).
 *   N-SHAPE      date-ranges 400s on a non-property/property_room service.
 * POSITIVES:
 *   P-EXPECTED-ROWS   a saved weekly pattern materializes exactly the expected slot count across
 *                     the rolling window.
 *   P-IDEMPOTENT      materializing twice (two PUTs with the same pattern) creates zero duplicate
 *                     slot rows.
 *   P-BLACKOUT        a blackout date is excluded from materialization (S7-Q3).
 *   P-SURVIVE-BOOKED  a pre-existing BOOKED slot on a newly-blacked-out date survives untouched —
 *                     a blackout blocks FUTURE materialization only, it never cancels (S7-Q3).
 *   P-MANUAL-SURVIVES a manually-edited slot's capacity survives re-materialization (ADD-ONLY).
 *   P-CLAIM           storage.bookSlot/releaseSlot still work on a materialized row — the §15
 *                     claim machine is untouched.
 *
 * Runs against the ALREADY-RUNNING dev server (JOURNEY_BASE_URL, default http://127.0.0.1:5000).
 * DISPOSABLE DB ONLY — every row created here is cleaned up in after().
 * Serialize: npx tsx --test --test-concurrency=1 server/__tests__/availability-model.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[availability-model] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

function api(pathname: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function readOnce(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}

interface Actor { id: string; email: string; cookie: string; }
async function registerProvider(label: string): Promise<Actor> {
  const email = `s7-${RUN}-${label}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "S7", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${body.user.id}`);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}

/** A minimal provider_services fixture row, inserted directly (the travel-surcharge.db.test.ts
 *  precedent) — owner-gated write rails only check userId + productShape, not approval/status. */
async function seedService(
  ownerId: string,
  label: string,
  opts: { deliveryMethod?: string | null; productShape?: string | null } = {},
): Promise<string> {
  const id = `s7-${RUN}-${label}-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method, product_shape)
    VALUES (${id}, ${ownerId}, ${`S7 ${label}`}, '100.00', 'active', 'approved',
            ${opts.deliveryMethod ?? "call"}, ${opts.productShape ?? null})
  `);
  createdServiceIds.push(id);
  return id;
}

/** Mirrors the materializer's own day-loop (server/services/availability-materializer.service.ts)
 *  so the expected-count assertion is derived, not a magic number that drifts with "today". */
function countWeekdayOccurrences(dayOfWeek: number, windowDays = 60): number {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let n = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    if (d.getUTCDay() === dayOfWeek) n++;
  }
  return n;
}
function dateAtOffset(days: number): string {
  const today = new Date();
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function dayOfWeekAtOffset(days: number): number {
  return new Date(`${dateAtOffset(days)}T00:00:00Z`).getUTCDay();
}

let provider: Actor;
let stranger: Actor;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();
  provider = await registerProvider("owner");
  stranger = await registerProvider("stranger");
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdServiceIds) {
      await db.execute(sql`DELETE FROM vendor_availability_slots WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM service_availability_patterns WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM service_date_ranges WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM service_availability_blackouts WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared pool — leave open */ }
});

// ═══════════════════════════════ NEGATIVES FIRST ═══════════════════════════════════════════════

test("N-OWNER-PATTERNS: a non-owner cannot write availability-patterns (404, route-points precedent)", async () => {
  const svc = await seedService(provider.id, "n1", { deliveryMethod: "call" });
  const res = await readOnce(await api(`/api/provider/services/${svc}/availability-patterns`, stranger.cookie, "PUT", {
    patterns: [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00", capacity: 1 }],
  }));
  assert.equal(res.status, 404, `non-owner must get 404, got ${res.status}: ${res.text}`);
  const stored = await storage.getServiceAvailabilityPatterns(svc);
  assert.equal(stored.length, 0, "no pattern was written by the non-owner request");
});

test("N-OWNER-DATERANGES: a non-owner cannot write date-ranges (404)", async () => {
  const svc = await seedService(provider.id, "n2", { productShape: "property" });
  const res = await readOnce(await api(`/api/provider/services/${svc}/date-ranges`, stranger.cookie, "PUT", {
    ranges: [{ startDate: dateAtOffset(1), endDate: dateAtOffset(3), nightlyPrice: 150, capacity: 1 }],
  }));
  assert.equal(res.status, 404, `non-owner must get 404, got ${res.status}: ${res.text}`);
});

test("N-OWNER-BLACKOUTS: a non-owner cannot write blackouts (404)", async () => {
  const svc = await seedService(provider.id, "n3", { deliveryMethod: "call" });
  const res = await readOnce(await api(`/api/provider/services/${svc}/blackouts`, stranger.cookie, "PUT", {
    blackouts: [{ startDate: dateAtOffset(1), endDate: dateAtOffset(2), reason: "test" }],
  }));
  assert.equal(res.status, 404, `non-owner must get 404, got ${res.status}: ${res.text}`);
});

test("N-SHAPE: date-ranges 400s on a non-property/property_room service", async () => {
  const svc = await seedService(provider.id, "n4", { deliveryMethod: "call", productShape: null });
  const res = await readOnce(await api(`/api/provider/services/${svc}/date-ranges`, provider.cookie, "PUT", {
    ranges: [{ startDate: dateAtOffset(1), endDate: dateAtOffset(3), nightlyPrice: 150, capacity: 1 }],
  }));
  assert.equal(res.status, 400, `expected 400 on a non-property shape, got ${res.status}: ${res.text}`);
});

test("N-DOW: an out-of-range dayOfWeek is rejected by the allowlist schema (400)", async () => {
  const svc = await seedService(provider.id, "n5", { deliveryMethod: "call" });
  const res = await readOnce(await api(`/api/provider/services/${svc}/availability-patterns`, provider.cookie, "PUT", {
    patterns: [{ dayOfWeek: 7, startTime: "09:00", endTime: "11:00" }],
  }));
  assert.equal(res.status, 400, `expected 400 for dayOfWeek=7, got ${res.status}: ${res.text}`);
});

// ═══════════════════════════════ POSITIVES ══════════════════════════════════════════════════════

test("P-EXPECTED-ROWS: a saved weekly pattern materializes the expected slot count across the window", async () => {
  const svc = await seedService(provider.id, "p1", { deliveryMethod: "call" });
  const dow = dayOfWeekAtOffset(0); // today's weekday — deterministic, no hardcoded magic number
  const expected = countWeekdayOccurrences(dow);

  const res = await readOnce(await api(`/api/provider/services/${svc}/availability-patterns`, provider.cookie, "PUT", {
    patterns: [{ dayOfWeek: dow, startTime: "09:00", endTime: "10:00", capacity: 2 }],
  }));
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.materialized.created, expected, `expected ${expected} materialized slots for weekday ${dow} in the 60-day window`);

  const slots = await db.execute(sql`SELECT * FROM vendor_availability_slots WHERE service_id = ${svc} ORDER BY date`);
  assert.equal((slots.rows as any[]).length, expected);
  for (const row of slots.rows as any[]) {
    assert.equal(row.start_time, "09:00");
    assert.equal(row.capacity, 2);
    assert.equal(new Date(`${row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date}T00:00:00Z`).getUTCDay(), dow);
  }

  // Public read stays unchanged and reflects the materialized rows.
  const publicRead = await readOnce(await api(`/api/vendor-availability/${svc}`, undefined));
  assert.equal(publicRead.status, 200, publicRead.text);
  assert.equal((publicRead.body as any[]).length, expected, "GET /api/vendor-availability/:serviceId reflects materialized rows unchanged");
});

test("P-IDEMPOTENT: materializing twice creates zero duplicate slots", async () => {
  const svc = await seedService(provider.id, "p2", { deliveryMethod: "video" });
  const dow = dayOfWeekAtOffset(1);
  const pattern = { dayOfWeek: dow, startTime: "13:00", endTime: "14:00", capacity: 1 };

  const first = await readOnce(await api(`/api/provider/services/${svc}/availability-patterns`, provider.cookie, "PUT", { patterns: [pattern] }));
  assert.equal(first.status, 200, first.text);
  const afterFirst = await db.execute(sql`SELECT count(*)::int AS n FROM vendor_availability_slots WHERE service_id = ${svc}`);
  const countAfterFirst = (afterFirst.rows[0] as any).n;
  assert.ok(countAfterFirst > 0, "first save must materialize at least one slot");

  // Re-save the SAME pattern — the replace-list delete+insert on service_availability_patterns
  // runs again, and the materializer runs again against the already-materialized rows.
  const second = await readOnce(await api(`/api/provider/services/${svc}/availability-patterns`, provider.cookie, "PUT", { patterns: [pattern] }));
  assert.equal(second.status, 200, second.text);
  assert.equal(second.body.materialized.created, 0, "the second materialization run creates zero NEW rows (ON CONFLICT DO NOTHING)");

  const afterSecond = await db.execute(sql`SELECT count(*)::int AS n FROM vendor_availability_slots WHERE service_id = ${svc}`);
  assert.equal((afterSecond.rows[0] as any).n, countAfterFirst, "no duplicate slot rows after materializing twice");

  // No duplicate (service_id, date, start_time) groups — the actual unique-index invariant.
  const dupes = await db.execute(sql`
    SELECT date, start_time, count(*)::int AS n FROM vendor_availability_slots
    WHERE service_id = ${svc} GROUP BY date, start_time HAVING count(*) > 1
  `);
  assert.equal((dupes.rows as any[]).length, 0, "zero duplicate (service_id, date, start_time) groups");
});

test("P-BLACKOUT: a blackout date is excluded from materialization", async () => {
  const svc = await seedService(provider.id, "p3", { deliveryMethod: "in_person" });
  const dow = dayOfWeekAtOffset(2);
  // Find the FIRST future occurrence of this weekday to black out.
  let blackoutDate = "";
  for (let i = 0; i < 14; i++) {
    if (dayOfWeekAtOffset(i) === dow) { blackoutDate = dateAtOffset(i); break; }
  }
  assert.ok(blackoutDate, "must find a near-term occurrence to black out");

  // Blackout FIRST, before any pattern-triggered materialization for this service.
  const blackoutRes = await readOnce(await api(`/api/provider/services/${svc}/blackouts`, provider.cookie, "PUT", {
    blackouts: [{ startDate: blackoutDate, endDate: blackoutDate, reason: "S7 proof" }],
  }));
  assert.equal(blackoutRes.status, 200, blackoutRes.text);

  const dow2 = dow;
  const expectedTotal = countWeekdayOccurrences(dow2);
  const patternRes = await readOnce(await api(`/api/provider/services/${svc}/availability-patterns`, provider.cookie, "PUT", {
    patterns: [{ dayOfWeek: dow2, startTime: "10:00", endTime: "11:00", capacity: 1 }],
  }));
  assert.equal(patternRes.status, 200, patternRes.text);
  assert.equal(patternRes.body.materialized.created, expectedTotal - 1, "exactly one fewer slot than the un-blacked-out count");

  const onBlackoutDate = await db.execute(sql`SELECT count(*)::int AS n FROM vendor_availability_slots WHERE service_id = ${svc} AND date = ${blackoutDate}`);
  assert.equal((onBlackoutDate.rows[0] as any).n, 0, "no slot was materialized on the blacked-out date");
});

test("P-SURVIVE-BOOKED: a pre-existing BOOKED slot on a newly-blacked-out date survives untouched", async () => {
  const svc = await seedService(provider.id, "p4", { deliveryMethod: "call" });
  const bookedDate = dateAtOffset(5);
  const [manualSlot] = await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, booked_count, status)
    VALUES (${crypto.randomUUID()}, ${svc}, ${provider.id}, ${bookedDate}, '09:00', '10:00', 3, 2, 'available')
    RETURNING *
  `).then((r) => r.rows as any[]);
  assert.ok(manualSlot, "fixture slot must be inserted");

  const res = await readOnce(await api(`/api/provider/services/${svc}/blackouts`, provider.cookie, "PUT", {
    blackouts: [{ startDate: bookedDate, endDate: bookedDate, reason: "retroactive blackout" }],
  }));
  assert.equal(res.status, 200, res.text);

  const after = await db.execute(sql`SELECT * FROM vendor_availability_slots WHERE service_id = ${svc} AND date = ${bookedDate}`);
  const rows = after.rows as any[];
  assert.equal(rows.length, 1, "the pre-existing slot row still exists — a blackout never deletes");
  assert.equal(rows[0].capacity, 3, "capacity untouched");
  assert.equal(rows[0].booked_count, 2, "booked_count untouched — no auto-cancellation (§15 safety)");
  assert.equal(rows[0].status, "available", "status untouched");
});

test("P-MANUAL-SURVIVES: a manually-edited slot's capacity survives re-materialization", async () => {
  const svc = await seedService(provider.id, "p5", { deliveryMethod: "call" });
  const dow = dayOfWeekAtOffset(3);
  const targetDate = dateAtOffset(3); // dayOfWeekAtOffset(3) IS this date's weekday, by construction

  // Manually create a slot at the same (service, date, start_time) the pattern will target,
  // with a capacity the pattern does NOT declare (5 vs the pattern's 1).
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, booked_count, status)
    VALUES (${crypto.randomUUID()}, ${svc}, ${provider.id}, ${targetDate}, '08:00', '09:00', 5, 0, 'available')
  `);

  const res = await readOnce(await api(`/api/provider/services/${svc}/availability-patterns`, provider.cookie, "PUT", {
    patterns: [{ dayOfWeek: dow, startTime: "08:00", endTime: "09:00", capacity: 1 }],
  }));
  assert.equal(res.status, 200, res.text);

  const stored = await db.execute(sql`SELECT * FROM vendor_availability_slots WHERE service_id = ${svc} AND date = ${targetDate} AND start_time = '08:00'`);
  const rows = stored.rows as any[];
  assert.equal(rows.length, 1, "still exactly one row — ON CONFLICT DO NOTHING, no duplicate");
  assert.equal(rows[0].capacity, 5, "the manually-set capacity (5) survives — the pattern's capacity (1) never overwrote it");
});

test("P-CLAIM: storage.bookSlot/releaseSlot still work on a materialized row (§15 claim machine untouched)", async () => {
  const svc = await seedService(provider.id, "p6", { deliveryMethod: "call" });
  const dow = dayOfWeekAtOffset(4);
  const res = await readOnce(await api(`/api/provider/services/${svc}/availability-patterns`, provider.cookie, "PUT", {
    patterns: [{ dayOfWeek: dow, startTime: "15:00", endTime: "16:00", capacity: 1 }],
  }));
  assert.equal(res.status, 200, res.text);
  const slots = await storage.getVendorAvailabilitySlots(svc);
  assert.ok(slots.length > 0, "at least one materialized slot exists");
  const slotId = slots[0].id;

  // bookSlot/releaseSlot are raw db.execute(...) calls (server/storage.ts) — the returned row is
  // the RAW Postgres shape (snake_case columns), not passed through Drizzle's camelCase mapping,
  // so this asserts booked_count/status as the function actually returns them.
  const claimed = await storage.bookSlot(slotId) as any;
  assert.ok(claimed, "bookSlot claims the materialized slot");
  assert.equal(claimed.booked_count, 1);
  assert.equal(claimed.status, "fully_booked", "capacity 1 ⇒ fully_booked after one claim");

  // A second claim on a fully-booked slot must fail (the atomic conditional holds).
  const secondClaim = await storage.bookSlot(slotId);
  assert.equal(secondClaim, undefined, "a second claim on a full slot is refused");

  await storage.releaseSlot(slotId);
  const released = await storage.getVendorAvailabilitySlot(slotId);
  assert.equal(released?.bookedCount, 0);
  assert.equal(released?.status, "available", "release re-opens the slot");
});

test("P-DATERANGES: owner can save + read date-ranges on a property listing", async () => {
  const svc = await seedService(provider.id, "p7", { productShape: "property" });
  const start = dateAtOffset(10);
  const end = dateAtOffset(15);
  const res = await readOnce(await api(`/api/provider/services/${svc}/date-ranges`, provider.cookie, "PUT", {
    ranges: [{ startDate: start, endDate: end, nightlyPrice: 220.5, capacity: 2 }],
  }));
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.dateRanges.length, 1);
  assert.equal(Number(res.body.dateRanges[0].nightlyPrice), 220.5);

  const read = await readOnce(await api(`/api/provider/services/${svc}/date-ranges`, provider.cookie));
  assert.equal(read.status, 200, read.text);
  assert.equal(read.body.dateRanges.length, 1);
  assert.equal(read.body.dateRanges[0].startDate.slice(0, 10), start);

  // SUPERSEDED BY S11 (DECISIONS.md ledger row 107, migration 213): this used to assert that a
  // date-range save materializes ZERO vendor_availability_slots rows — true under S7's ratified
  // scope ("date-ranges are property/room authoring only THIS WAVE — S11 owns the range-claim
  // machinery"), false now that S11 has landed the date-range materializer the S7 ballot itself
  // named as its own future consumer. A 6-night range now materializes exactly 6 nights (one row
  // per night, sentinel start_time='00:00', materialized_from='date_range') — see
  // s11-stay-booking.db.test.ts for the full S11 proof (provenance, sentinel, mixed-rate pricing,
  // redacted calendar, price-edit propagation). This assertion is updated in place, not deleted,
  // so the route's OTHER S7-ratified behavior (ownership, shape gate, replace-list read) stays
  // covered by this suite exactly as before.
  const slots = await db.execute(sql`SELECT count(*)::int AS n FROM vendor_availability_slots WHERE service_id = ${svc}`);
  assert.equal((slots.rows[0] as any).n, 6, "S11: a 6-night date-range now materializes exactly 6 claimable slots");

  // property_room is accepted too (S8's shape).
  const room = await seedService(provider.id, "p7room", { productShape: "property_room" });
  const roomRes = await readOnce(await api(`/api/provider/services/${room}/date-ranges`, provider.cookie, "PUT", {
    ranges: [{ startDate: start, endDate: end, nightlyPrice: null, capacity: 1 }],
  }));
  assert.equal(roomRes.status, 200, roomRes.text);
});

test("P-REPLACE: PUT is replace-list, not append, for patterns/blackouts/date-ranges", async () => {
  const svc = await seedService(provider.id, "p8", { deliveryMethod: "call" });
  await api(`/api/provider/services/${svc}/availability-patterns`, provider.cookie, "PUT", {
    patterns: [{ dayOfWeek: 0, startTime: "09:00", endTime: "10:00" }, { dayOfWeek: 1, startTime: "09:00", endTime: "10:00" }],
  });
  let stored = await storage.getServiceAvailabilityPatterns(svc);
  assert.equal(stored.length, 2);

  await api(`/api/provider/services/${svc}/availability-patterns`, provider.cookie, "PUT", {
    patterns: [{ dayOfWeek: 2, startTime: "11:00", endTime: "12:00" }],
  });
  stored = await storage.getServiceAvailabilityPatterns(svc);
  assert.equal(stored.length, 1, "replace-list — the old rows are gone, not appended");
  assert.equal(stored[0].dayOfWeek, 2);
});
