/**
 * BOOKING-ELIGIBILITY GATES — behavioural proof of lane T2 (DECISIONS.md ruling 62/64 D7 capture,
 * ruling 83 wiring; CLAUDE.md §13/§14/§15/§18b).
 *
 * Migration 195 captured the D7 logistics fields on `provider_services`; T2 wires the THREE
 * booking-ELIGIBILITY consumers as SERVER-SIDE, PRE-CHARGE gates on `POST /api/checkout`, right where
 * B1's `pickup_out_of_range` gate sits — BEFORE the atomic slot claim and any Stripe call:
 *   1. PARTY SIZE   — party_size_min / party_size_max → refuse `party_size_out_of_range`.
 *   2. START WINDOW — earliest/latest_start_time in service_timezone → refuse `outside_start_window`.
 *   3. LEAD TIME    — lead_time_hours vs now → refuse `insufficient_lead_time`.
 *
 * THE HONEST RAILS, each proven:
 *   E*  the PURE resolver (`resolveBookingEligibility`) — server-derived, deterministic, no infra:
 *       each gate REFUSES a violating request with its specific reason and PASSES a satisfying one;
 *       §13 NULL field ⇒ NO gate (an unset listing field is never a fabricated bound); an ABSENT
 *       booking input skips the gate that needs it; the start-window is interpreted in the listing's
 *       IANA timezone; first-refusal ordering (party → window → lead).
 *   H*  the WIRING at POST /api/checkout — a violating request is REFUSED with its reason BEFORE the
 *       claim: the seeded slot's `booked_count` is UNCHANGED and no booking row is created (the §18b
 *       inventory proof — no capacity consumed, nothing charged, on an ineligible request). A listing
 *       with NULL constraints is NOT refused by the gate (§13 at the wire).
 *   CI  the mixed-catalog password account `ci-provider@traveloure.test` logs in and OWNS the seeded
 *       listings (kyoto-interpreter is OAuth-only, so it cannot).
 *
 * Pure assertions need no infra; the HTTP assertions run against the ALREADY-RUNNING dev server on
 * http://127.0.0.1:5000 (the travel-surcharge posture). DISPOSABLE DB ONLY — every row deleted in
 * after(). Serialize: npx tsx --test --test-concurrency=1 server/__tests__/booking-eligibility-gates.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { resolveBookingEligibility, timeOfDayMinutes } from "../services/booking-eligibility.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const CI_PROVIDER_EMAIL = "ci-provider@traveloure.test";
const CI_PROVIDER_PASSWORD = "CITestProvider!99";
const RUN = crypto.randomUUID().slice(0, 8);
const createdEmails: string[] = [];
const createdServiceIds: string[] = [];
const createdSlotIds: string[] = [];

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
  if (!ok) throw new Error(`[booking-eligibility] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

interface Actor { id: string; email: string; cookie: string; }
async function registerTraveler(label: string): Promise<Actor> {
  const email = `elig-${RUN}-${label}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "EL", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}
async function loginCookie(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login(${email}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "login must set a session cookie");
  return setCookie!.split(";")[0];
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

/** An APPROVED + ACTIVE in-person listing owned by ci-provider, with the given D7 eligibility config. */
async function seedService(
  label: string,
  cfg: {
    partySizeMin?: number | null;
    partySizeMax?: number | null;
    earliestStartTime?: string | null;
    latestStartTime?: string | null;
    serviceTimezone?: string | null;
    leadTimeHours?: number | null;
  },
): Promise<string> {
  const id = `elig-${RUN}-${label}-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, price, status, approval_status, delivery_method,
       party_size_min, party_size_max, earliest_start_time, latest_start_time, service_timezone,
       lead_time_hours)
    VALUES
      (${id}, ${CI_PROVIDER_ID}, ${`Elig ${label}`}, '100.00', 'active', 'approved', 'in_person',
       ${cfg.partySizeMin ?? null}, ${cfg.partySizeMax ?? null},
       ${cfg.earliestStartTime ?? null}, ${cfg.latestStartTime ?? null}, ${cfg.serviceTimezone ?? null},
       ${cfg.leadTimeHours ?? null})
  `);
  createdServiceIds.push(id);
  return id;
}

/** A future, available slot for a service (capacity 5, booked 0). Returns its id. */
async function seedSlot(serviceId: string, daysAhead: number, startTime: string): Promise<string> {
  const id = `elig-slot-${RUN}-${crypto.randomUUID().slice(0, 6)}`;
  const date = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
  await db.execute(sql`
    INSERT INTO vendor_availability_slots
      (id, service_id, provider_id, date, start_time, end_time, capacity, booked_count, status)
    VALUES
      (${id}, ${serviceId}, ${CI_PROVIDER_ID}, ${date}, ${startTime}, ${startTime}, 5, 0, 'available')
  `);
  createdSlotIds.push(id);
  return id;
}

async function bookedCount(slotId: string): Promise<number> {
  const r = await db.execute(sql`SELECT booked_count FROM vendor_availability_slots WHERE id = ${slotId}`);
  return Number((r.rows[0] as any)?.booked_count ?? -1);
}
async function bookingCount(serviceId: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM service_bookings WHERE service_id = ${serviceId}`);
  return Number((r.rows[0] as any)?.n ?? -1);
}

async function addToCart(traveler: Actor, serviceId: string, slotId?: string): Promise<string> {
  const add = await readOnce(await api("/api/cart", traveler.cookie, "POST", { serviceId, ...(slotId ? { slotId } : {}) }));
  assert.ok(add.status === 200 || add.status === 201, `add-to-cart failed (${add.status}): ${add.text}`);
  const cart = await readOnce(await api("/api/cart", traveler.cookie));
  const itemId = (cart.body.items as any[]).find((i) => i.serviceId === serviceId)?.id;
  assert.ok(itemId, "cart item present after add");
  return itemId;
}
async function clearCart(traveler: Actor) { await api("/api/cart", traveler.cookie, "DELETE"); }
async function checkout(traveler: Actor) {
  return readOnce(await api("/api/checkout", traveler.cookie, "POST", { idempotencyKey: crypto.randomUUID() }));
}

const MY_REASONS = new Set(["party_size_out_of_range", "outside_start_window", "insufficient_lead_time"]);
let CI_PROVIDER_ID = "";
let traveler: Actor;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();
  // CI: the mixed-catalog password account logs in (proves it, and owns the seeded listings).
  await loginCookie(CI_PROVIDER_EMAIL, CI_PROVIDER_PASSWORD);
  const r = await db.execute(sql`SELECT id FROM users WHERE email = ${CI_PROVIDER_EMAIL}`);
  CI_PROVIDER_ID = (r.rows[0] as any)?.id;
  assert.ok(CI_PROVIDER_ID, "ci-provider must be seeded");
  traveler = await registerTraveler("trav");
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdServiceIds) {
      await db.execute(sql`DELETE FROM cart_items WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM service_bookings WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM vendor_availability_slots WHERE service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM cart_items WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared pool — leave open */ }
});

// ═══ E — the PURE RESOLVER (server-derived; no infra) ═══════════════════════════════════════════

test("E1: party size — refuse over max / under min; pass inside; §13 unset bound or absent count ⇒ no gate", () => {
  const svc = { partySizeMin: 2, partySizeMax: 4 };
  // Refuse over max, under min — each carries the specific reason.
  assert.equal(resolveBookingEligibility(svc, { partySize: 6 }).reason, "party_size_out_of_range");
  assert.equal(resolveBookingEligibility(svc, { partySize: 1 }).reason, "party_size_out_of_range");
  // Pass at the boundaries and inside.
  assert.equal(resolveBookingEligibility(svc, { partySize: 2 }).eligible, true);
  assert.equal(resolveBookingEligibility(svc, { partySize: 4 }).eligible, true);
  assert.equal(resolveBookingEligibility(svc, { partySize: 3 }).eligible, true);
  // §13: an ABSENT party count skips the gate (never fabricate a count).
  assert.equal(resolveBookingEligibility(svc, { partySize: null }).eligible, true);
  assert.equal(resolveBookingEligibility(svc, {}).eligible, true);
  // §13: only the bound the provider SET applies — max only, then min only.
  assert.equal(resolveBookingEligibility({ partySizeMax: 4 }, { partySize: 1 }).eligible, true, "no min set ⇒ small party ok");
  assert.equal(resolveBookingEligibility({ partySizeMin: 2 }, { partySize: 50 }).eligible, true, "no max set ⇒ large party ok");
  // §13: NO bound set at all ⇒ any party (an unset field is never an invented default).
  assert.equal(resolveBookingEligibility({}, { partySize: 999 }).eligible, true);
});

test("E2: start window — refuse before earliest / after latest; pass inside; interpreted in service_timezone", () => {
  // Window 09:00–17:00 in Asia/Tokyo (UTC+9).
  const svc = { earliestStartTime: "09:00", latestStartTime: "17:00", serviceTimezone: "Asia/Tokyo" };
  const within = new Date("2026-09-01T02:00:00Z"); // 11:00 Tokyo
  const early = new Date("2026-09-01T20:00:00Z");  // 05:00 Tokyo (next day)
  const late = new Date("2026-09-01T09:00:00Z");   // 18:00 Tokyo
  assert.equal(resolveBookingEligibility(svc, { scheduledDate: within }).eligible, true, "11:00 Tokyo is inside 09–17");
  assert.equal(resolveBookingEligibility(svc, { scheduledDate: early }).reason, "outside_start_window");
  assert.equal(resolveBookingEligibility(svc, { scheduledDate: late }).reason, "outside_start_window");
  // Boundaries are inclusive: exactly 09:00 and 17:00 Tokyo pass.
  assert.equal(resolveBookingEligibility(svc, { scheduledDate: new Date("2026-09-01T00:00:00Z") }).eligible, true, "09:00 Tokyo boundary");
  assert.equal(resolveBookingEligibility(svc, { scheduledDate: new Date("2026-09-01T08:00:00Z") }).eligible, true, "17:00 Tokyo boundary");
});

test("E2b: start window — §13 unset window or absent start ⇒ no gate; only the bound set applies", () => {
  const late = new Date("2026-09-01T09:00:00Z"); // 18:00 Tokyo
  // No window set ⇒ any time.
  assert.equal(resolveBookingEligibility({ serviceTimezone: "Asia/Tokyo" }, { scheduledDate: late }).eligible, true);
  // Window set but NO requested start ⇒ gate skipped (never fabricate a start).
  assert.equal(resolveBookingEligibility({ earliestStartTime: "09:00", latestStartTime: "17:00", serviceTimezone: "Asia/Tokyo" }, {}).eligible, true);
  // Only earliest set — a late start is fine; only latest set — an early start is fine.
  assert.equal(resolveBookingEligibility({ earliestStartTime: "09:00", serviceTimezone: "Asia/Tokyo" }, { scheduledDate: late }).eligible, true);
  assert.equal(resolveBookingEligibility({ latestStartTime: "23:00", serviceTimezone: "Asia/Tokyo" }, { scheduledDate: new Date("2026-08-31T20:00:00Z") }).eligible, true);
});

test("E2c: start window — timezone STATED fallback (unset tz ⇒ UTC wall-clock); unknown IANA id ⇒ no gate", () => {
  // No timezone ⇒ the instant's UTC time-of-day is compared (the stated fallback).
  const svc = { earliestStartTime: "09:00", latestStartTime: "17:00", serviceTimezone: null };
  assert.equal(resolveBookingEligibility(svc, { scheduledDate: new Date("2026-09-01T11:00:00Z") }).eligible, true, "11:00 UTC inside");
  assert.equal(resolveBookingEligibility(svc, { scheduledDate: new Date("2026-09-01T20:00:00Z") }).reason, "outside_start_window", "20:00 UTC after latest");
  assert.equal(timeOfDayMinutes(new Date("2026-09-01T11:00:00Z"), null), 11 * 60);
  assert.equal(timeOfDayMinutes(new Date("2026-09-01T02:00:00Z"), "Asia/Tokyo"), 11 * 60);
  // An unusable IANA id must NOT misgate — the window is omitted rather than guessed.
  assert.equal(resolveBookingEligibility({ earliestStartTime: "09:00", latestStartTime: "17:00", serviceTimezone: "Not/AZone" }, { scheduledDate: new Date("2026-09-01T20:00:00Z") }).eligible, true);
});

test("E3: lead time — refuse a too-soon start; pass a start beyond the notice; §13 unset/absent ⇒ no gate", () => {
  const now = new Date("2026-09-01T00:00:00Z");
  const svc = { leadTimeHours: 24 };
  assert.equal(resolveBookingEligibility(svc, { scheduledDate: new Date("2026-09-01T10:00:00Z") }, now).reason, "insufficient_lead_time", "10h < 24h");
  assert.equal(resolveBookingEligibility(svc, { scheduledDate: new Date("2026-09-02T01:00:00Z") }, now).eligible, true, "25h ≥ 24h");
  // Exactly the notice passes.
  assert.equal(resolveBookingEligibility(svc, { scheduledDate: new Date("2026-09-02T00:00:00Z") }, now).eligible, true, "exactly 24h");
  // §13: no requested start ⇒ skip; non-positive/NULL lead ⇒ no constraint.
  assert.equal(resolveBookingEligibility(svc, {}, now).eligible, true);
  assert.equal(resolveBookingEligibility({ leadTimeHours: null }, { scheduledDate: new Date("2026-09-01T00:30:00Z") }, now).eligible, true);
  assert.equal(resolveBookingEligibility({ leadTimeHours: 0 }, { scheduledDate: new Date("2026-09-01T00:30:00Z") }, now).eligible, true);
});

test("E4: first-refusal ordering — party is checked before window before lead", () => {
  const now = new Date("2026-09-01T00:00:00Z");
  const svc = {
    partySizeMax: 4,
    earliestStartTime: "09:00", latestStartTime: "17:00", serviceTimezone: null,
    leadTimeHours: 48,
  };
  // A request that violates ALL THREE returns the PARTY reason (checked first).
  assert.equal(resolveBookingEligibility(svc, { partySize: 6, scheduledDate: new Date("2026-09-01T20:00:00Z") }, now).reason, "party_size_out_of_range");
  // Party ok but window+lead violated ⇒ window reason (checked before lead).
  assert.equal(resolveBookingEligibility(svc, { partySize: 2, scheduledDate: new Date("2026-09-01T20:00:00Z") }, now).reason, "outside_start_window");
  // Party+window ok but too soon ⇒ lead reason.
  assert.equal(resolveBookingEligibility(svc, { partySize: 2, scheduledDate: new Date("2026-09-01T11:00:00Z") }, now).reason, "insufficient_lead_time");
  // All satisfied ⇒ eligible.
  assert.equal(resolveBookingEligibility(svc, { partySize: 2, scheduledDate: new Date("2026-09-05T11:00:00Z") }, now).eligible, true);
});

// ═══ H — the WIRING at POST /api/checkout: refuse BEFORE the claim (no capacity, no charge) ═══════

test("H1: party over max ⇒ 400 party_size_out_of_range BEFORE the slot claim (booked_count unchanged, no booking)", async () => {
  const svc = await seedService("party", { partySizeMin: 2, partySizeMax: 4 });
  const slot = await seedSlot(svc, 30, "10:00");
  const itemId = await addToCart(traveler, svc, slot);
  const patch = await api(`/api/cart/${itemId}`, traveler.cookie, "PATCH", { partySize: 6 });
  assert.equal(patch.status, 200, `partySize PATCH failed: ${await patch.text()}`);

  const res = await checkout(traveler);
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${res.text}`);
  assert.equal(res.body.error, "party_size_out_of_range");
  assert.equal(await bookedCount(slot), 0, "§18b: no capacity claimed on an ineligible request");
  assert.equal(await bookingCount(svc), 0, "no booking created on refusal");
  await clearCart(traveler);
});

test("H2: start outside the window ⇒ 400 outside_start_window BEFORE the claim (booked_count unchanged)", async () => {
  // Window 09:00–17:00, tz unset ⇒ UTC fallback; push the start to 20:00 UTC via PATCH.
  const svc = await seedService("window", { earliestStartTime: "09:00", latestStartTime: "17:00", serviceTimezone: null });
  const slot = await seedSlot(svc, 30, "10:00");
  const itemId = await addToCart(traveler, svc, slot);
  const day = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const patch = await api(`/api/cart/${itemId}`, traveler.cookie, "PATCH", { scheduledDate: `${day}T20:00:00Z` });
  assert.equal(patch.status, 200, await patch.text());

  const res = await checkout(traveler);
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${res.text}`);
  assert.equal(res.body.error, "outside_start_window");
  assert.equal(await bookedCount(slot), 0, "§18b: no capacity claimed");
  assert.equal(await bookingCount(svc), 0, "no booking created");
  await clearCart(traveler);
});

test("H3: start too soon ⇒ 400 insufficient_lead_time BEFORE the claim (booked_count unchanged)", async () => {
  const svc = await seedService("lead", { leadTimeHours: 48 });
  const slot = await seedSlot(svc, 30, "10:00");
  const itemId = await addToCart(traveler, svc, slot);
  // Requested start 1h from now ≪ 48h notice.
  const soon = new Date(Date.now() + 3600000).toISOString();
  const patch = await api(`/api/cart/${itemId}`, traveler.cookie, "PATCH", { scheduledDate: soon });
  assert.equal(patch.status, 200, await patch.text());

  const res = await checkout(traveler);
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${res.text}`);
  assert.equal(res.body.error, "insufficient_lead_time");
  assert.equal(await bookedCount(slot), 0, "§18b: no capacity claimed");
  assert.equal(await bookingCount(svc), 0, "no booking created");
  await clearCart(traveler);
});

test("H4: §13 at the wire — a NULL-constraint listing is NOT refused by the eligibility gate", async () => {
  // All three D7 eligibility fields unset ⇒ any party / any time is eligible. Non-slot item so the
  // pass path claims no capacity; it proceeds past the gate (and only then fails on the dummy Stripe),
  // so the assertion is simply: the refusal is NOT one of the eligibility reasons.
  const svc = await seedService("open", {});
  const itemId = await addToCart(traveler, svc);
  const patch = await api(`/api/cart/${itemId}`, traveler.cookie, "PATCH", { partySize: 999, scheduledDate: new Date(Date.now() + 3600000).toISOString() });
  assert.equal(patch.status, 200, await patch.text());

  const res = await checkout(traveler);
  assert.ok(!MY_REASONS.has(res.body?.error), `NULL-constraint listing must not be refused by the eligibility gate (got ${res.status} ${res.body?.error})`);
  await clearCart(traveler);
});

test("H5: an ELIGIBLE request (party in range, no time constraints) passes the gate — not refused", async () => {
  const svc = await seedService("eligible", { partySizeMin: 1, partySizeMax: 10 });
  const itemId = await addToCart(traveler, svc);
  const patch = await api(`/api/cart/${itemId}`, traveler.cookie, "PATCH", { partySize: 4 });
  assert.equal(patch.status, 200, await patch.text());

  const res = await checkout(traveler);
  assert.ok(!MY_REASONS.has(res.body?.error), `an in-range party must pass the gate (got ${res.status} ${res.body?.error})`);
  await clearCart(traveler);
});
