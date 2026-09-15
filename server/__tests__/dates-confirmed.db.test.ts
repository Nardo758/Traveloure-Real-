/**
 * dates-confirmed.db.test.ts — A PLAN SAYS WHETHER ITS DATES WERE CHOSEN, against a real database.
 *
 * Punchlist **D-22** (ruled yes, 2026-09-15) and **R-4** (the re-date rail); migration 302; ledger
 * `2026-09-15-d22-dates-confirmed`. CLAUDE.md §13, §14, §18 rule 1, §19, Locked Decisions 30, 34,
 * 42 D12/D16, 45 (6).
 *
 * WHY A DB SUITE. Every claim here is about a COLUMN and about what a writer puts in it — the
 * schema's own declaration, the value a mint leaves, the value the re-date rail stamps and the two
 * derivations that ride the same write. A unit suite over a fixture would be proving its own copy
 * of the writer (the failure `ready-made-clone-fields.db.test.ts` records verbatim), so the real
 * `storage.createTrip` / `storage.updateTrip` and the real trips router are driven against
 * Postgres and the rows are read back in the database's own column names.
 *
 *   K1  COLUMN PARITY: `trips.dates_confirmed_at` exists, is NULLABLE, has NO DEFAULT, and the
 *       drizzle declaration in `shared/schema.ts` agrees with it. (The deploy-push durability
 *       rule: an object `schema.ts` does not declare is dropped at publish and, the migration
 *       already being stamped, never recreated.)
 *   K2  `storage.createTrip` STAMPS when the mint site states that the traveler chose the dates,
 *       and leaves NULL when it says nothing — the opt-in default, which is the safe failure mode
 *       (§13: a mint that forgets under-claims, it does not certify a guess).
 *   K3  the READY-MADE CLONE mint leaves it NULL — the window is `new Date()` +
 *       `duration_days - 1`, the fulfilment job's own arithmetic, and this is the fact that finally
 *       tells it apart from a window the buyer picked.
 *   K4  the re-date rail STAMPS server-side when dates are in the body, and a client-supplied
 *       `datesConfirmedAt` is STRIPPED (§19) — in BOTH layers: the admission schema does not admit
 *       it, and the storage writer deletes it before the UPDATE so an `as any` caller is covered
 *       too.
 *   K5  the same write re-runs Locked Decision 30's `timezone` and Locked Decision 34 / 42 D12's
 *       `market_slug` derivations (it goes through `storage.updateTrip`, never a raw UPDATE) — and
 *       a destination-only edit does NOT stamp, because nobody answered a date question.
 *   K6  a NON-OWNER cannot re-date: a stranger and a PENDING advisor both get the route's 401,
 *       and the row is untouched.
 *   K7  §13 ON THE READERS — the `.ics` exporter emits NO pinned `…Z` DTSTART for an unconfirmed
 *       plan even when the zone is known (it keeps Locked Decision 30's floating output), and the
 *       plancard DTO carries `datesConfirmed: false`.
 *
 * THE NEGATIVE. K3 and K7 both FAIL on `origin/main`: there is no column, so the clone's
 * placeholder window is indistinguishable from a chosen one and the exporter pins a confident
 * instant to it. K4's strip is the §19 shape, whose whole point is that nothing reads the field
 * today — it is stripped BEFORE it has a consumer, exactly as the `revenueShareRate` lane found it
 * should have been.
 *
 * STATED NEGATIVE SPACE (§18d), and it is load-bearing for K4/K6. The LIVE `PATCH /api/trips/:id`
 * is the `server/routes.ts` MONOLITH copy, which registers first and SHADOWS the twin in
 * `server/routes/trips.routes.ts`; the monolith cannot be mounted without booting the whole app.
 * What is driven over HTTP here is therefore the mountable TWIN, which carries the same
 * owner/EA/share-token gate and the same `insertTripSchema.partial()` body. What that proves is
 * the SHARED half — the admission schema and `storage.updateTrip`, which both copies call — and
 * what it does NOT prove is the monolith's own status codes. Both copies are pinned to the same
 * one writer, which is the arrangement that keeps them from drifting (§18 rule 1); a second stamp
 * written at either route would be the drift this suite could not see.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   npx tsx --test --test-concurrency=1 server/__tests__/dates-confirmed.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { getTableColumns, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { trips, insertTripSchema } from "@shared/schema";
import { planDatesAreConfirmed } from "@shared/plan-dates";
import { generateIcsContent } from "../utils/ics-calendar";
import tripsRoutes from "../routes/trips.routes";
import { fulfillReadyMadePurchase } from "../services/ready-made-purchase.service";
import { assembleTripPlan } from "../services/trip-plan.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `dc-${RUN}-owner`,
  stranger: `dc-${RUN}-stranger`,
  advisor: `dc-${RUN}-advisor`,
  author: `dc-${RUN}-author`,
  buyer: `dc-${RUN}-buyer`,
  sourceTrip: `dc-${RUN}-src-trip`,
  listing: `dc-${RUN}-listing`,
  purchase: `dc-${RUN}-purchase`,
};

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(
      `[dates-confirmed] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/** Mounts the REAL trips router with a chosen session identity (the authored-item harness shape). */
async function asUser<T>(userId: string | null, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (userId) {
      (req as any).user = { claims: { sub: userId, name: "Test Actor" } };
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
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

async function readTripRow(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT dates_confirmed_at, start_date, end_date, destination, timezone, market_slug
    FROM trips WHERE id = ${id}
  `);
  return r.rows[0] as any;
}

const createdTripIds: string[] = [];
async function mint(
  overrides: Record<string, unknown> = {},
  options?: { datesChosenByTraveler?: boolean },
): Promise<string> {
  const trip = await storage.createTrip(
    {
      userId: ids.owner,
      title: `Dates fixture ${RUN}`,
      destination: "Kyoto",
      startDate: "2027-04-10",
      endDate: "2027-04-14",
      ...overrides,
    } as any,
    options,
  );
  createdTripIds.push(trip.id);
  return trip.id;
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.owner},    ${`dc-${RUN}-o@t.test`}, 'Dates', 'Owner'),
           (${ids.stranger}, ${`dc-${RUN}-s@t.test`}, 'Dates', 'Stranger'),
           (${ids.advisor},  ${`dc-${RUN}-x@t.test`}, 'Dates', 'Advisor'),
           (${ids.author},   ${`dc-${RUN}-a@t.test`}, 'Dates', 'Author'),
           (${ids.buyer},    ${`dc-${RUN}-b@t.test`}, 'Dates', 'Buyer')
  `);
});

after(async () => {
  const all = [...createdTripIds, ids.sourceTrip];
  const r = await db.execute(sql`SELECT clone_trip_id FROM ready_made_purchases WHERE id = ${ids.purchase}`);
  const cloneId = (r.rows[0] as any)?.clone_trip_id as string | null;
  if (cloneId) all.push(cloneId);
  await db.execute(sql`DELETE FROM ready_made_purchases WHERE id = ${ids.purchase}`);
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`);
  for (const t of all) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${t}`);
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${t}`);
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${t}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${t}`);
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.stranger}, ${ids.advisor}, ${ids.author}, ${ids.buyer})`);
});

// ── K1 ────────────────────────────────────────────────────────────────────────────────────────
test("K1 · dates_confirmed_at is a nullable, default-free column and shared/schema.ts declares it", async () => {
  const r = await db.execute(sql`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'dates_confirmed_at'
  `);
  assert.equal(r.rows.length, 1, "migration 302 did not create trips.dates_confirmed_at");
  const col = r.rows[0] as any;
  assert.match(String(col.data_type), /timestamp/i);
  assert.equal(String(col.is_nullable).toUpperCase(), "YES", "the column must be NULLABLE — NULL is the answer");
  assert.equal(col.column_default, null, "NO DEFAULT: a default would certify every legacy row");

  // The deploy-push durability rule: the ORM must declare it, or the publish-time push drops it
  // and the stamped migration never recreates it.
  const declared = getTableColumns(trips) as Record<string, { name: string }>;
  assert.ok(
    Object.values(declared).some((c) => c.name === "dates_confirmed_at"),
    "shared/schema.ts does not declare dates_confirmed_at — the deploy push would drop it",
  );

  // NO CHECK was added (publish-trap posture), so the preflight manifest needs no new entry.
  const checks = await db.execute(sql`
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
    WHERE rel.relname = 'trips' AND con.contype = 'c' AND att.attname = 'dates_confirmed_at'
  `);
  assert.equal(checks.rows.length, 0, "a CHECK on this column is the publish-time push failure the rules warn about");
});

// ── K2 ────────────────────────────────────────────────────────────────────────────────────────
test("K2 · createTrip stamps only when the mint site says the traveler chose the dates", async () => {
  const chosen = await mint({}, { datesChosenByTraveler: true });
  const chosenRow = await readTripRow(chosen);
  assert.notEqual(chosenRow.dates_confirmed_at, null, "a traveler-stated window must be stamped");
  assert.ok(planDatesAreConfirmed(chosenRow.dates_confirmed_at));

  // Omitting the option makes NO claim — the opt-in default, and the safe failure mode: a mint
  // written tomorrow by someone who never read the ruling under-claims rather than certifying a
  // guess as the traveler's answer (§13).
  const silent = await mint();
  assert.equal((await readTripRow(silent)).dates_confirmed_at, null);

  // An explicit false is the same answer as silence — one no-claim shape, never two.
  const denied = await mint({}, { datesChosenByTraveler: false });
  assert.equal((await readTripRow(denied)).dates_confirmed_at, null);
});

// ── K3 ────────────────────────────────────────────────────────────────────────────────────────
test("K3 · the ready-made clone mint leaves dates_confirmed_at NULL — its window is a placeholder", async () => {
  await db.execute(sql`
    INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date)
    VALUES (${ids.sourceTrip}, NULL, ${ids.author}, 'Source build', 'Kyoto',
            CURRENT_DATE + 30, CURRENT_DATE + 33)
  `);
  await db.execute(sql`
    INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, price_cents, status)
    VALUES (${ids.listing}, ${ids.author}, ${ids.sourceTrip}, 'Kyoto', ${`Kyoto ready-made ${RUN}`}, 4, 12500, 'approved')
  `);
  await db.execute(sql`
    INSERT INTO ready_made_purchases (id, buyer_id, ready_made_trip_id, price_paid_cents, stripe_payment_intent_id, status)
    VALUES (${ids.purchase}, ${ids.buyer}, ${ids.listing}, 12500, ${`pi_${RUN}_dc`}, 'paid')
  `);

  const result = await fulfillReadyMadePurchase(ids.purchase);
  assert.ok(result.cloneTripId, "the fulfilment produced no clone");
  const clone = await readTripRow(result.cloneTripId!);

  // The window EXISTS — `start_date`/`end_date` are NOT NULL — and that is exactly why the marker
  // is needed: on `origin/main` this row was indistinguishable from one the buyer picked.
  assert.ok(clone.start_date, "the clone still carries a window");
  assert.equal(clone.dates_confirmed_at, null, "the clone's placeholder window must claim nothing");
  assert.equal(planDatesAreConfirmed(clone.dates_confirmed_at), false);
});

// ── K4 ────────────────────────────────────────────────────────────────────────────────────────
test("K4 · the re-date rail stamps server-side, and a client-supplied datesConfirmedAt is stripped", async () => {
  // LAYER 1 (§19): the admission schema does not admit the field at all. `insertTripSchema`
  // `.omit()`s it, so the PATCH body — `insertTripSchema.partial()` — cannot carry it.
  const parsed = insertTripSchema.partial().parse({
    startDate: "2028-01-02",
    endDate: "2028-01-09",
    datesConfirmedAt: new Date("2001-03-04T00:00:00Z"),
  } as any);
  assert.equal(
    "datesConfirmedAt" in (parsed as Record<string, unknown>),
    false,
    "the body schema admitted a client-claimed confirmation stamp (§19)",
  );

  const tripId = await mint();
  assert.equal((await readTripRow(tripId)).dates_confirmed_at, null, "precondition: unconfirmed");

  const before = Date.now();
  const res = await asUser(ids.owner, (base) =>
    fetch(`${base}/api/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2028-01-02",
        endDate: "2028-01-09",
        // The planted claim. A client may change its dates; it may never certify them.
        datesConfirmedAt: "2001-03-04T00:00:00.000Z",
      }),
    }),
  );
  assert.equal(res.status, 200);

  const row = await readTripRow(tripId);
  assert.notEqual(row.dates_confirmed_at, null, "the re-date rail did not stamp");
  const stampedMs = new Date(row.dates_confirmed_at).getTime();
  assert.ok(stampedMs >= before - 5_000, "the stamp is the SERVER's clock, not the planted 2001 value");
  assert.equal(String(row.start_date).slice(0, 10), "2028-01-02");

  // LAYER 2: the storage writer strips it too, so an internal `as any` caller a type-level omit
  // cannot reach is covered — the two-layer placement §18 uses for a rate.
  const direct = await mint();
  await storage.updateTrip(direct, {
    startDate: "2029-02-03",
    endDate: "2029-02-05",
    datesConfirmedAt: new Date("2001-03-04T00:00:00Z"),
  } as any);
  const directRow = await readTripRow(direct);
  assert.ok(
    new Date(directRow.dates_confirmed_at).getTime() >= before - 5_000,
    "storage.updateTrip honoured a caller-supplied stamp instead of deriving its own",
  );
});

// ── K5 ────────────────────────────────────────────────────────────────────────────────────────
test("K5 · the same write re-runs the LD 30 / LD 34 derivations, and a destination-only edit does not stamp", async () => {
  const tripId = await mint({}, { datesChosenByTraveler: true });
  const seeded = await readTripRow(tripId);
  assert.equal(seeded.market_slug, "kyoto", "precondition: Kyoto resolves to an operating market");
  assert.ok(seeded.timezone, "precondition: Kyoto carries a zone");

  // A destination edit re-derives BOTH — this is why the rail must write through
  // `storage.updateTrip` and never a raw UPDATE (Locked Decision 30; LD 34's position-0 mirror
  // is written through the same one writer for the same reason).
  const res = await asUser(ids.owner, (base) =>
    fetch(`${base}/api/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: "Lisbon" }),
    }),
  );
  assert.equal(res.status, 200);
  const moved = await readTripRow(tripId);
  assert.notEqual(moved.market_slug, seeded.market_slug, "market_slug was not re-derived");
  assert.notEqual(moved.timezone, seeded.timezone, "timezone was not re-derived");
  // And the stamp did NOT move: nobody answered a date question by moving a destination.
  assert.equal(
    new Date(moved.dates_confirmed_at).getTime(),
    new Date(seeded.dates_confirmed_at).getTime(),
    "a destination-only edit re-stamped the confirmation",
  );

  // A destination edit outside the eight markets clears both back to NULL — "not one of our
  // markets" is the honest answer, and it still must not touch the stamp.
  const unconfirmed = await mint();
  await storage.updateTrip(unconfirmed, { destination: "Ulaanbaatar" });
  const off = await readTripRow(unconfirmed);
  assert.equal(off.market_slug, null);
  assert.equal(off.timezone, null);
  assert.equal(off.dates_confirmed_at, null, "a destination edit invented a date confirmation");
});

// ── K6 ────────────────────────────────────────────────────────────────────────────────────────
test("K6 · a stranger and a PENDING advisor cannot re-date the plan", async () => {
  const tripId = await mint();
  await db.execute(sql`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status)
    VALUES (${`dc-${RUN}-adv`}, ${tripId}, ${ids.advisor}, 'pending')
  `);

  for (const actor of [ids.stranger, ids.advisor]) {
    const res = await asUser(actor, (base) =>
      fetch(`${base}/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2030-05-05", endDate: "2030-05-09" }),
      }),
    );
    assert.equal(res.status, 401, `actor ${actor} was allowed to re-date someone else's plan`);
  }

  const row = await readTripRow(tripId);
  assert.equal(String(row.start_date).slice(0, 10), "2027-04-10", "the window moved anyway");
  assert.equal(row.dates_confirmed_at, null, "an unauthorized attempt stamped the confirmation");
});

// ── K7 ────────────────────────────────────────────────────────────────────────────────────────
test("K7 · §13 on the readers — no pinned .ics instant and an explicit datesConfirmed:false", async () => {
  const item = [{ id: "k7-item", dayNumber: 1, startTime: "16:00", durationMinutes: 60, name: "Ceremony" }];
  const base = { startDate: "2027-04-10", title: "Kyoto", destination: "Kyoto", timezone: "Asia/Tokyo" };

  // CONFIRMED + a usable zone ⇒ a real instant, pinned with the RFC 5545 `Z` suffix.
  const pinned = generateIcsContent({ ...base, datesConfirmed: true }, item as any);
  assert.match(pinned, /DTSTART:\d{8}T\d{6}Z/, "a confirmed, zoned plan should pin an instant");

  // UNCONFIRMED ⇒ the SAME zone, and still no pinned instant: the day is the guess now. The
  // export still goes out with the honest floating times Locked Decision 30 rules for a plan whose
  // instant cannot be vouched for — never UTC dressed up as the plan's own answer (§13).
  const floating = generateIcsContent({ ...base, datesConfirmed: false }, item as any);
  assert.ok(!/DTSTART:\d{8}T\d{6}Z/.test(floating), "an unconfirmed plan must not pin a DTSTART instant");
  assert.match(floating, /DTSTART:\d{8}T\d{6}\r\n/, "the floating DTSTART is still emitted");

  // The plancard DTO carries the boolean — present and FALSE, never omitted: a reader must be able
  // to tell "placeholder" from "this payload predates the field".
  const tripId = await mint();
  const payload: any = await assembleTripPlan(tripId, "full");
  assert.equal(payload.plancard.trip.datesConfirmed, false);

  const confirmedTripId = await mint({}, { datesChosenByTraveler: true });
  const confirmedPayload: any = await assembleTripPlan(confirmedTripId, "full");
  assert.equal(confirmedPayload.plancard.trip.datesConfirmed, true);
});
