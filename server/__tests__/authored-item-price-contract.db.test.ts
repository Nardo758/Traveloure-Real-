/**
 * authored-item-price-contract.db.test.ts — THE READY-MADE AUTHORING CONTRACT, against the REAL
 * router and a real database.
 *
 * (decision-maker ruling 2026-09-15, punchlist **D-4**, option A; ledger
 *  `2026-09-15-d4-item-kind-contract`; CLAUDE.md §13, §19b, §18 rule 1, Locked Decision 39)
 *
 * D-4's authoring half: **a ready-made author may not publish a priced item that names no bookable
 * thing.** Checkout skips an item with no service on BOTH loops (`if (!item.service) continue;`,
 * server/routes/payments.routes.ts), so a price on such a row is a number nobody can ever charge —
 * and it is a number a BUYER reads as part of what they were sold.
 *
 *   A1  an AUTHOR may not add a price to an unlinked item on their own build — 400, naming the
 *       rule, and the row is UNCHANGED (a refusal writes nothing).
 *   A2  an AUTHOR may price an item that names a real `provider_services` row.
 *   A3  removing the service link from an already-priced item is the SAME violation from the other
 *       direction, and is refused — the rule is judged on the MERGED row, not on the patch.
 *   A4  an OWNER on their own traveler plan is untouched: "dinner, about $60" is a note to
 *       themselves, not a published price, and their branch is byte-identical to before D-4.
 *   A5  NO BACKFILL AND NO REWRITE (§19b posture): a priced unlinked row that already exists keeps
 *       its `estimated_cost` exactly as its author left it; an unrelated edit to that row still
 *       succeeds only when it does not restate the violation, and the DERIVATION is what hides the
 *       price on screen — the column is never cleared behind the author's back.
 *
 * THE NEGATIVE: A1 and A3 both PASS on `origin/main`'s router (the price lands), which is the
 * defect D-4 closes.
 *
 * STATED NEGATIVE SPACE (§18d). This drives the PATCH rail (`server/routes/trips.routes.ts`),
 * which is a mountable router. The CREATE rail is the `server/routes.ts` monolith copy, which
 * cannot be mounted without the whole app, so its wiring is pinned statically instead
 * (`shared/__tests__/item-kind.test.ts` K6) over the SAME one predicate both rails call — a second
 * copy of the rule is what that arrangement exists to refuse. What is NOT proven here is the
 * create rail's HTTP status code.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   npx tsx --test --test-concurrency=1 server/__tests__/authored-item-price-contract.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { AUTHORED_PRICED_UNLINKED_REFUSAL } from "@shared/item-kind";
import tripsRoutes from "../routes/trips.routes";

const RUN = crypto.randomUUID().slice(0, 8);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  const cs = process.env.DATABASE_URL;
  let host: string | null = null;
  try {
    host = cs ? new URL(cs).hostname.toLowerCase() : null;
  } catch {
    host = null;
  }
  const local = host !== null && DISPOSABLE_HOSTS.has(host);
  if (!local && process.env.JOURNEY_DB_WRITES_OK !== "1") {
    throw new Error(
      `[authored-item-price-contract] REFUSING to write fixtures: DATABASE_URL host ` +
        `'${host ?? "<none>"}' is not a recognized disposable dev/CI database. ` +
        `Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

let authorId = "";
let ownerId = "";
let buildTripId = "";
let travelerTripId = "";
let serviceId = "";

/** Mounts the REAL trips router with a chosen session identity (the item-event-link harness shape). */
async function asUser<T>(userId: string, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, name: "Test Actor" } };
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

async function seedItem(tripId: string, fields: Record<string, unknown> = {}): Promise<string> {
  const id = `aip-${RUN}-${crypto.randomUUID().slice(0, 8)}`;
  const cols = {
    id,
    trip_id: tripId,
    title: `Item ${RUN}`,
    item_type: "activity",
    day_number: 1,
    origin: "traveler",
    ...fields,
  } as Record<string, unknown>;
  const names = Object.keys(cols);
  await db.execute(
    sql`INSERT INTO itinerary_items (${sql.raw(names.map((n) => `"${n}"`).join(", "))})
        VALUES (${sql.join(names.map((n) => sql`${cols[n] as any}`), sql`, `)})`,
  );
  return id;
}

async function readCost(itemId: string): Promise<string | null> {
  const r = await db.execute(
    sql`SELECT estimated_cost, provider_service_id FROM itinerary_items WHERE id = ${itemId}`,
  );
  const row = r.rows[0] as any;
  return row ? (row.estimated_cost as string | null) : null;
}

async function patch(base: string, tripId: string, itemId: string, body: unknown) {
  const res = await fetch(`${base}/api/trips/${tripId}/itinerary-items/${itemId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
}

before(async () => {
  await assertDisposableDb();

  authorId = `aip-${RUN}-author`;
  ownerId = `aip-${RUN}-owner`;
  await db.execute(sql`
    INSERT INTO users (id, email, role)
    VALUES (${authorId}, ${`aip-${RUN}-author@t.test`}, 'local_expert'),
           (${ownerId}, ${`aip-${RUN}-owner@t.test`}, 'user')`);

  // The AUTHORING build: userId NULL by design (excluded from every traveler surface), authorId set.
  buildTripId = `aip-${RUN}-build`;
  await db.execute(sql`
    INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status)
    VALUES (${buildTripId}, NULL, ${authorId}, ${`Build ${RUN}`}, 'Kyoto, Japan',
            '2027-04-10', '2027-04-13', 'draft')`);

  // A traveler's OWN plan, for A4.
  travelerTripId = `aip-${RUN}-trip`;
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${travelerTripId}, ${ownerId}, ${`Plan ${RUN}`}, 'Kyoto, Japan',
            '2027-04-10', '2027-04-13', 'draft')`);
  // The owner row is written explicitly: the READ resolver `getTripRole` still resolves "owner"
  // from `trip_collaborators` (the WRITE arm moved onto `trips.user_id` with V-29), so the traveler
  // branch under test is the one production takes on both rails.
  await db.execute(sql`
    INSERT INTO trip_collaborators (trip_id, user_id, role)
    VALUES (${travelerTripId}, ${ownerId}, 'owner')`);

  serviceId = `aip-${RUN}-svc`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, approval_status)
    VALUES (${serviceId}, ${authorId}, ${`Tea ceremony ${RUN}`}, '120.00', 'approved')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${buildTripId}, ${travelerTripId})`);
  await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id IN (${buildTripId}, ${travelerTripId})`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${buildTripId}, ${travelerTripId})`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${serviceId}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${authorId}, ${ownerId})`);
});

test("A1 — an author may not price an item that names no bookable thing", async () => {
  const itemId = await seedItem(buildTripId);
  await asUser(authorId, async (base) => {
    const { status, json } = await patch(base, buildTripId, itemId, { estimatedCost: "120.00" });
    assert.equal(status, 400, "the write is refused, and the refusal names the rule");
    assert.equal(json.message, AUTHORED_PRICED_UNLINKED_REFUSAL);
  });
  assert.equal(await readCost(itemId), null, "a refusal writes NOTHING");
});

test("A2 — an author MAY price an item that names a real provider_services row", async () => {
  const itemId = await seedItem(buildTripId, { provider_service_id: serviceId });
  await asUser(authorId, async (base) => {
    const { status } = await patch(base, buildTripId, itemId, { estimatedCost: "120.00" });
    assert.equal(status, 200);
  });
  assert.equal(await readCost(itemId), "120.00");
});

test("A3 — removing the link from a priced item is the same violation, refused", async () => {
  const itemId = await seedItem(buildTripId, {
    provider_service_id: serviceId,
    estimated_cost: "120.00",
  });
  await asUser(authorId, async (base) => {
    const { status, json } = await patch(base, buildTripId, itemId, { providerServiceId: null });
    assert.equal(status, 400, "judged on the MERGED row, not on the patch");
    assert.equal(json.message, AUTHORED_PRICED_UNLINKED_REFUSAL);
  });
  const r = await db.execute(
    sql`SELECT provider_service_id FROM itinerary_items WHERE id = ${itemId}`,
  );
  assert.equal((r.rows[0] as any).provider_service_id, serviceId, "the link survives the refusal");
});

test("A4 — a TRAVELER pricing an item on their OWN plan is untouched by the contract", async () => {
  const itemId = await seedItem(travelerTripId);
  await asUser(ownerId, async (base) => {
    const { status } = await patch(base, travelerTripId, itemId, { estimatedCost: "60.00" });
    assert.equal(status, 200, "a cost estimate on your own plan is a note, not a published price");
  });
  assert.equal(await readCost(itemId), "60.00");
});

test("A5 — NO BACKFILL: a legacy priced-unlinked row is neither rewritten nor frozen", async () => {
  // §19b's posture — a fix stops NEW writes and says nothing about rows already on disk. Two halves
  // matter and they pull in opposite directions: the price is never cleared behind the author (the
  // READER hides it, `platformPriced: false` on the derived kind), AND an edit that does not touch
  // the contract's three fields is not refused — refusing a title fix would force a rewrite of
  // exactly the legacy rows the ruling said not to touch, which is a backfill by another name.
  const itemId = await seedItem(buildTripId, { estimated_cost: "75.00" });
  await asUser(authorId, async (base) => {
    const { status } = await patch(base, buildTripId, itemId, { title: `Renamed ${RUN}` });
    assert.equal(status, 200, "an edit that cannot introduce the violation is not judged");
  });
  assert.equal(await readCost(itemId), "75.00", "the legacy price is never deleted behind the author");
  // But restating the price on that same row IS a new write of the violation, and is refused.
  await asUser(authorId, async (base) => {
    const { status, json } = await patch(base, buildTripId, itemId, { estimatedCost: "95.00" });
    assert.equal(status, 400);
    assert.equal(json.message, AUTHORED_PRICED_UNLINKED_REFUSAL);
  });
  assert.equal(await readCost(itemId), "75.00");
});
