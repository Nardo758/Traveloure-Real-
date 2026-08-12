/**
 * Task: stop provider property/room/bundle deletes from wiping booking history.
 *
 * service_bookings.service_id → provider_services.id is ON DELETE CASCADE. Property
 * (product_shape='property'), room ('property_room') and bundle ('bundle') rows live in the
 * SAME provider_services table as plain services, so any delete surface that hard-deletes a
 * booked row silently destroys historical booking records and platform_fee revenue snapshots.
 *
 * All delete surfaces now route through guardedDeleteProviderService
 * (server/services/service-delete-guard.ts). This suite proves, per shape:
 *   G1 — property with a booking: guard suspends the row, booking row survives with its
 *        platform_fee snapshot intact.
 *   G2 — room (property_room child) with a booking: same.
 *   G3 — bundle with a booking: same.
 *   G4 — control: a row with NO bookings is hard-deleted (guard doesn't block real deletes).
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 *
 * Run solo: JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/service-delete-guard.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { guardedDeleteProviderService } from "../services/service-delete-guard";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `sdg-${RUN}-prov`,
  traveler: `sdg-${RUN}-trav`,
};
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];

// ── Disposable-DB guard (mirrors payout-parity.db.test.ts; never defaults open) ──────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[service-delete-guard] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

async function makeUser(id: string, role: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, role)
    VALUES (${id}, ${`${id}@traveloure.test`}, 'SDG Fixture', ${role})
    ON CONFLICT (id) DO NOTHING
  `);
}

async function makeServiceRow(opts: {
  shape: string | null;
  parentServiceId?: string;
  name: string;
}): Promise<string> {
  const id = `sdg-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, description, price, status, approval_status, product_shape, parent_service_id)
    VALUES
      (${id}, ${ids.provider}, ${opts.name}, 'fixture', '100.00', 'active', 'approved',
       ${opts.shape}, ${opts.parentServiceId ?? null})
  `);
  createdServiceIds.push(id);
  return id;
}

async function makeBooking(serviceId: string): Promise<string> {
  const id = `sdg-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, total_amount, platform_fee, provider_earnings, status)
    VALUES (${id}, ${serviceId}, ${ids.traveler}, ${ids.provider}, '100.00', '25.00', '75.00', 'completed')
  `);
  createdBookingIds.push(id);
  return id;
}

async function bookingRow(bookingId: string): Promise<any | null> {
  const r = await db.execute(sql`
    SELECT id, service_id, platform_fee FROM service_bookings WHERE id = ${bookingId}
  `);
  return (r.rows[0] as any) ?? null;
}

async function serviceRow(serviceId: string): Promise<any | null> {
  const r = await db.execute(sql`
    SELECT id, status FROM provider_services WHERE id = ${serviceId}
  `);
  return (r.rows[0] as any) ?? null;
}

before(async () => {
  await assertDisposableDb();
  await makeUser(ids.provider, "provider");
  await makeUser(ids.traveler, "traveler");
});

after(async () => {
  for (const b of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${b}`);
  }
  // Children (rooms) first — parent_service_id is ON DELETE RESTRICT.
  for (const s of [...createdServiceIds].reverse()) {
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${s}`);
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`);
});

async function assertGuardedShape(shape: string, serviceId: string) {
  const bookingId = await makeBooking(serviceId);
  const outcome = await guardedDeleteProviderService(serviceId);
  assert.equal(outcome.softDeleted, true, `${shape}: guard must soft-delete when booked`);
  assert.equal(outcome.bookingCount, 1, `${shape}: bookingCount must be 1`);
  const svc = await serviceRow(serviceId);
  assert.ok(svc, `${shape}: provider_services row must survive`);
  assert.equal(svc.status, "suspended", `${shape}: row must be suspended`);
  const booking = await bookingRow(bookingId);
  assert.ok(booking, `${shape}: booking row must remain intact`);
  assert.equal(booking.service_id, serviceId, `${shape}: booking keeps its FK reference`);
  assert.equal(booking.platform_fee, "25.00", `${shape}: platform_fee snapshot must survive`);
}

test("G1 — property with a booking is suspended, booking history intact", async () => {
  const propertyId = await makeServiceRow({ shape: "property", name: `SDG Property ${RUN}` });
  await assertGuardedShape("property", propertyId);
});

test("G2 — room with a booking is suspended, booking history intact", async () => {
  const propertyId = await makeServiceRow({ shape: "property", name: `SDG Room-Parent ${RUN}` });
  const roomId = await makeServiceRow({
    shape: "property_room",
    parentServiceId: propertyId,
    name: `SDG Room ${RUN}`,
  });
  await assertGuardedShape("property_room", roomId);
});

test("G3 — bundle with a booking is suspended, booking history intact", async () => {
  const bundleId = await makeServiceRow({ shape: "bundle", name: `SDG Bundle ${RUN}` });
  await assertGuardedShape("bundle", bundleId);
});

test("G4 — control: an unbooked row is hard-deleted", async () => {
  const serviceId = await makeServiceRow({ shape: null, name: `SDG Plain ${RUN}` });
  const outcome = await guardedDeleteProviderService(serviceId);
  assert.equal(outcome.softDeleted, false);
  assert.equal(outcome.bookingCount, 0);
  assert.equal(await serviceRow(serviceId), null, "unbooked row must be gone");
});
