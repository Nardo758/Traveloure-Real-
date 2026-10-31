/**
 * Row 172a — `trips.timezone` is filled on read and persisted, and a client cannot set it.
 *
 *   Z1  `ensureTripTimezone`: a null zone on a Kyoto trip is filled and a SQL re-read shows it.
 *   Z2  a null zone on an off-market destination stays null and the row is not written.
 *   Z3  an already-set zone is never overwritten, even when the destination now resolves to a
 *       different zone.
 *   Z4  GET /api/trips/:id returns that zone and the row is persisted.
 *   Z5  GET /api/trips does the same for the list: Kyoto and Porto fill, an off-market row stays
 *       null, and an already-set zone is left alone.
 *   Z6  a client-supplied `timezone` on POST /api/trips and PATCH /api/trips/:id is ignored.
 *
 * The live POST, PATCH and list handlers are the `server/routes.ts` copies, which register
 * first. This suite drives the mountable trips router. That router parses the same
 * `api.trips.create.input` / `api.trips.update.input` and calls the same `storage.getTrip` /
 * `storage.getTrips` / `storage.createTrip` / `storage.updateTrip`. Z6 also pins that the
 * monolith still parses those schemas and that its list still reads `storage.getTrips`.
 *
 * DISPOSABLE DB ONLY.
 *   npx tsx --test --test-concurrency=1 server/__tests__/row172a-trip-timezone.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage, ensureTripTimezone } from "../storage";
import { trips } from "@shared/schema";
import { api } from "@shared/routes";
import tripsRoutes from "../routes/trips.routes";

const RUN = crypto.randomUUID().slice(0, 8);
const ownerId = `tz172a-${RUN}-owner`;
const createdTripIds: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(
      `[row172a] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function asOwner<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: ownerId, name: "Zone Owner" } };
    (req as any).isAuthenticated = () => true;
    (req as any).logout = (cb?: () => void) => cb?.();
    next();
  });
  app.use(tripsRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

type ZoneRow = { timezone: string | null; rev: string };

/** The column, plus the row's xmin, so a test can see that nothing was written. */
async function readZone(id: string): Promise<ZoneRow> {
  const r = await db.execute(sql`
    SELECT timezone, xmin::text AS rev FROM trips WHERE id = ${id}
  `);
  const row = r.rows[0] as { timezone: string | null; rev: string };
  return { timezone: row.timezone ?? null, rev: String(row.rev) };
}

async function insertTrip(destination: string, timezone: string | null): Promise<string> {
  const id = `tz172a-${RUN}-${crypto.randomUUID().slice(0, 8)}`;
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, timezone, status)
    VALUES (${id}, ${ownerId}, ${`${destination} ${RUN}`}, ${destination}, '2027-06-01', '2027-06-05', ${timezone}, 'draft')
  `);
  createdTripIds.push(id);
  return id;
}

async function loadTrip(id: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, id));
  if (!trip) throw new Error(`fixture trip ${id} missing`);
  return trip;
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ownerId}, ${`tz172a-${RUN}@t.test`}, 'Zone', 'Owner')
  `);
});

after(async () => {
  for (const id of createdTripIds) {
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${id}`);
    await db.execute(sql`DELETE FROM user_experiences WHERE trip_id = ${id}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${id}`);
  }
  await db.execute(sql`DELETE FROM content_registry WHERE owner_id = ${ownerId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ownerId}`);
});

test("Z1 null zone on a Kyoto trip is filled and persisted", async () => {
  const id = await insertTrip("Kyoto", null);
  const before = await readZone(id);
  assert.equal(before.timezone, null);

  const filled = await ensureTripTimezone(await loadTrip(id));
  assert.equal(filled.timezone, "Asia/Tokyo");

  const after = await readZone(id);
  assert.equal(after.timezone, "Asia/Tokyo", "the re-read must show the zone the helper persisted");
  assert.notEqual(after.rev, before.rev, "the fill must write the row");
});

test("Z2 null zone on an off-market destination stays null and nothing is written", async () => {
  const id = await insertTrip("Ulaanbaatar", null);
  const before = await readZone(id);

  const filled = await ensureTripTimezone(await loadTrip(id));
  assert.equal(filled.timezone, null);

  const after = await readZone(id);
  assert.equal(after.timezone, null);
  assert.equal(after.rev, before.rev, "an unresolvable destination must not be written");
});

test("Z3 an already-set zone is never overwritten when the destination resolves differently", async () => {
  // Porto resolves to Europe/Lisbon. The stored zone is Kyoto's, as if the destination moved
  // without a re-derivation. The fill must leave the stored answer alone.
  const id = await insertTrip("Porto", "Asia/Tokyo");
  const before = await readZone(id);
  assert.equal(before.timezone, "Asia/Tokyo");

  const filled = await ensureTripTimezone(await loadTrip(id));
  assert.equal(filled.timezone, "Asia/Tokyo");

  const after = await readZone(id);
  assert.equal(after.timezone, "Asia/Tokyo");
  assert.equal(after.rev, before.rev, "an already-set zone must not be written");
});

test("Z4 GET /api/trips/:id returns the filled zone and the row stays persisted", async () => {
  const id = await insertTrip("Kyoto", null);
  const res = await asOwner((base) => fetch(`${base}/api/trips/${id}`));
  assert.equal(res.status, 200);
  const body = await res.json() as { id: string; timezone: string | null };
  assert.equal(body.id, id);
  assert.equal(body.timezone, "Asia/Tokyo");
  assert.equal((await readZone(id)).timezone, "Asia/Tokyo");
});

test("Z5 GET /api/trips fills null zones on the list and persists them", async () => {
  const kyoto = await insertTrip("Kyoto", null);
  const porto = await insertTrip("Porto", null);
  const off = await insertTrip("Ulaanbaatar", null);
  const kept = await insertTrip("Kyoto", "Europe/Lisbon");
  const offBefore = await readZone(off);
  const keptBefore = await readZone(kept);

  const res = await asOwner((base) => fetch(`${base}/api/trips`));
  assert.equal(res.status, 200);
  const body = await res.json() as Array<{ id: string; timezone: string | null }>;
  const byId = new Map(body.map((row) => [row.id, row.timezone]));

  assert.equal(byId.get(kyoto), "Asia/Tokyo");
  assert.equal(byId.get(porto), "Europe/Lisbon");
  assert.equal(byId.get(off), null);
  assert.equal(byId.get(kept), "Europe/Lisbon");

  assert.equal((await readZone(kyoto)).timezone, "Asia/Tokyo");
  assert.equal((await readZone(porto)).timezone, "Europe/Lisbon");
  assert.equal((await readZone(off)).timezone, null);
  assert.equal((await readZone(off)).rev, offBefore.rev, "the off-market list row must not be written");
  assert.equal((await readZone(kept)).timezone, "Europe/Lisbon");
  assert.equal((await readZone(kept)).rev, keptBefore.rev, "the list fill must not overwrite a stored zone");
});

test("Z6 a client-supplied timezone on POST and PATCH is ignored", async () => {
  const minted = api.trips.create.input.parse({
    title: "Planted zone",
    destination: "Kyoto",
    startDate: "2027-06-01",
    endDate: "2027-06-05",
    timezone: "America/New_York",
  });
  assert.equal("timezone" in minted, false, "the mint schema admitted a client timezone");

  const patched = api.trips.update.input.parse({
    title: "Renamed",
    timezone: "Europe/London",
  });
  assert.equal("timezone" in patched, false, "the patch schema admitted a client timezone");

  const monolith = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
  assert.match(monolith, /api\.trips\.create\.input\.parse\(tripBody\)/);
  assert.match(monolith, /api\.trips\.update\.input\.parse\(req\.body\)/);
  assert.match(monolith, /storage\.getTrips\(userId, status\)/);

  const created = await asOwner(async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Planted ${RUN}`,
        destination: "Kyoto",
        startDate: "2027-06-01",
        endDate: "2027-06-05",
        timezone: "America/New_York",
      }),
    });
    assert.equal(res.status, 201);
    return await res.json() as { id: string; timezone: string | null };
  });
  createdTripIds.push(created.id);
  assert.equal(created.timezone, "Asia/Tokyo");
  assert.notEqual(created.timezone, "America/New_York");
  assert.equal((await readZone(created.id)).timezone, "Asia/Tokyo");

  const offMarket = await asOwner(async (base) => {
    const res = await fetch(`${base}/api/trips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Off market ${RUN}`,
        destination: "Ulaanbaatar",
        startDate: "2027-07-01",
        endDate: "2027-07-04",
        timezone: "Asia/Ulaanbaatar",
      }),
    });
    assert.equal(res.status, 201);
    return await res.json() as { id: string; timezone: string | null };
  });
  createdTripIds.push(offMarket.id);
  assert.equal(offMarket.timezone, null, "a client zone must not fill a destination the resolver cannot place");
  assert.equal((await readZone(offMarket.id)).timezone, null);

  const renamed = await asOwner(async (base) => {
    const res = await fetch(`${base}/api/trips/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Renamed ${RUN}`, timezone: "Europe/London" }),
    });
    assert.equal(res.status, 200);
    return await res.json() as { title: string; timezone: string | null };
  });
  assert.equal(renamed.timezone, "Asia/Tokyo");
  assert.match(renamed.title, /Renamed/);
  assert.equal((await readZone(created.id)).timezone, "Asia/Tokyo");
});
