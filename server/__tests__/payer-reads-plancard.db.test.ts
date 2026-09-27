/**
 * A PAYER PARTICIPANT READS THE PLANCARD (Locked Decision 42 D9; ledger
 * `2026-09-27-payer-reads-plancard`, R143 — map step 4's prerequisite).
 *
 * LD 42 D9 makes the slip's bookings section visible to the OWNER and a `payer`-role
 * `trip_participants` row (the `canPayBalance` audience, §15d). The plancard read
 * (`GET /api/trips/:tripId/plancard`) admitted a collaborator row, an advisor, the author and the
 * EA delegate — and answered a payer 403, so the payer could not read the plan whose balance they
 * may settle. The gate now admits a payer on THAT trip, READ-ONLY, surfaced as `tripRole: "payer"`,
 * through the ONE role test in `balance-payer.service.ts` (§18 rule 1).
 *
 *   P1 a `payer` participant on the trip → 200, `tripRole: "payer"`, with the plan's bookings list.
 *   P2 a participant on the SAME trip with any other role (`guest`, and `Payer` — no case-folding)
 *      → 403, as before.
 *   P3 a `payer` participant on a DIFFERENT trip → 403 on this one.
 *   P4 a stranger → 403; the owner → 200 `tripRole: "owner"` (unchanged).
 *   P5 READ-ONLY: the payer is still refused by the write predicate (`authorizeTripLogistics`
 *      with `requireWriteAccess`) and by the owner tier (guest roster / participant PII).
 *
 * TRANSPORT. The gate is INLINE in the handler, so the proofs mount the REAL `plancard.routes.ts`
 * router in a bare express app with a chosen session identity and make REAL requests (the
 * `leads-door-and-trip-read-gate.db.test.ts` shape). A proof calling `isTripPayer` directly would
 * pass against an unfixed handler.
 *
 * NEGATIVE SPACE (§18d): these prove the plancard READ gate and the two named write/owner-tier
 * predicates. They do not enumerate every other trip rail; those keep their own gates and their
 * own suites, and nothing in this lane touched them.
 *
 * DISPOSABLE DB ONLY. Every row is created here and deleted in after().
 * Run: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit server/__tests__/payer-reads-plancard.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import plancardRoutes from "../routes/plancard.routes";
import { authorizeTripLogistics, authorizeTripOwnerTier } from "../utils/trip-logistics-auth";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `prp-${RUN}-owner`,
  payer: `prp-${RUN}-payer`,
  guest: `prp-${RUN}-guest`,
  casePayer: `prp-${RUN}-casepayer`,
  otherPayer: `prp-${RUN}-otherpayer`,
  stranger: `prp-${RUN}-stranger`,
  trip: `prp-${RUN}-trip`,
  otherTrip: `prp-${RUN}-trip2`,
};

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(
      `[payer-reads-plancard] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function getPlancardAs(userId: string, tripId: string): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(plancardRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/trips/${tripId}/plancard`);
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

before(async () => {
  assertDisposableDb();
  for (const id of Object.values(ids).filter((v) => !v.includes("-trip"))) {
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${id}, ${`${id}@t.test`}, 'PRP', 'Fixture', 'user')
    `);
  }
  for (const [tripId, owner] of [
    [ids.trip, ids.owner],
    [ids.otherTrip, ids.owner],
  ] as const) {
    await db.execute(sql`
      INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
      VALUES (${tripId}, ${owner}, ${`PRP plan ${RUN}`}, 'Kyoto, Japan', '2027-05-01', '2027-05-04', 'draft')
    `);
    // The plancard READ resolves the owner through `trip_collaborators` (the read-side twin
    // CLAUDE.md LD 42 D17 records as open), so the owner fixture carries the row a real mint writes.
    await db.execute(sql`
      INSERT INTO trip_collaborators (id, trip_id, user_id, role)
      VALUES (${crypto.randomUUID()}, ${tripId}, ${owner}, 'owner')
    `);
  }
  // Participant rows: the payer on THIS trip; a guest and a mis-cased "Payer" on THIS trip; a payer
  // on the OTHER trip only.
  for (const [tripId, userId, role] of [
    [ids.trip, ids.payer, "payer"],
    [ids.trip, ids.guest, "guest"],
    [ids.trip, ids.casePayer, "Payer"],
    [ids.otherTrip, ids.otherPayer, "payer"],
  ] as const) {
    await db.execute(sql`
      INSERT INTO trip_participants (id, trip_id, user_id, name, role)
      VALUES (${crypto.randomUUID()}, ${tripId}, ${userId}, ${`PRP ${role}`}, ${role})
    `);
  }
});

after(async () => {
  for (const t of [ids.trip, ids.otherTrip]) {
    await db.execute(sql`DELETE FROM trip_participants WHERE trip_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${t}`).catch(() => {});
  }
  for (const id of Object.values(ids).filter((v) => !v.includes("-trip"))) {
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`).catch(() => {});
  }
});

test("P1: a payer participant on the trip reads the plancard as `payer`", async () => {
  const r = await getPlancardAs(ids.payer, ids.trip);
  assert.equal(r.status, 200, `expected 200, got ${r.status} ${JSON.stringify(r.body)}`);
  assert.equal(r.body.tripRole, "payer");
  assert.ok(Array.isArray(r.body.bookings), "the bookings list rides the payload (D9's section)");
  assert.equal(r.body.trip?.id ?? ids.trip, ids.trip);
});

test("P2: another role on the same trip is still refused — exactly `payer`, no case-folding", async () => {
  assert.equal((await getPlancardAs(ids.guest, ids.trip)).status, 403);
  assert.equal((await getPlancardAs(ids.casePayer, ids.trip)).status, 403);
});

test("P3: a payer on a DIFFERENT trip is refused on this one", async () => {
  assert.equal((await getPlancardAs(ids.otherPayer, ids.trip)).status, 403);
  // …and reads their own.
  const own = await getPlancardAs(ids.otherPayer, ids.otherTrip);
  assert.equal(own.status, 200);
  assert.equal(own.body.tripRole, "payer");
});

test("P4: the stranger is refused and the owner is unchanged", async () => {
  assert.equal((await getPlancardAs(ids.stranger, ids.trip)).status, 403);
  const owner = await getPlancardAs(ids.owner, ids.trip);
  assert.equal(owner.status, 200);
  assert.equal(owner.body.tripRole, "owner");
});

test("P5: READ-ONLY — no write predicate and no owner tier admits the payer", async () => {
  const write = await authorizeTripLogistics(ids.trip, ids.payer, "test", { requireWriteAccess: true });
  assert.ok(write && write.status >= 400, "write predicate refuses the payer");
  const ownerTier = await authorizeTripOwnerTier(ids.trip, ids.payer, "test");
  assert.ok(ownerTier && ownerTier.status >= 400, "owner tier (guest roster / PII) refuses the payer");
});
