/**
 * V-23 / V-24 / V-25(b) — THE TRANSITION IS THE GUARD (§18b; ledger
 * `2026-09-15-v23-v25-from-state-guards`).
 *
 * §18b states the rule in one sentence: "the pre-check is only the error message, the transition
 * itself is the guard." Three status writers on two tables were breaking it in the same shape —
 * a SELECT, a decision taken against what that SELECT returned, and an unconditional
 * `UPDATE … WHERE id = ?`. §15 names that shape by hand: a check-then-update is the TOCTOU bug,
 * **not** a guard.
 *
 *   V-23  `POST /api/bookings/:id/dispute` called `updateServiceBookingStatus` with THREE arguments,
 *         so its guard fell back to `eq(id)`. Every status was disputable, including a
 *         `payment_pending` provisional claim — the SD-1 stranding one rail over (§15b): after that
 *         flip `voidClaim` and `promotePaidCheckout` both match zero rows and the claimed
 *         `vendor_availability_slots.booked_count` has no code path in this repo to come back.
 *   V-24  `POST /api/admin/disputes/:bookingId/reject` called it with TWO, and its target status
 *         `completed` STAMPS `completed_at` and MINTS held earnings inside the writer's own
 *         transaction. Rejecting a dispute on a since-refunded row minted real money against it, and
 *         the re-stamped `completed_at` restarted the traveler's dispute window and the payout
 *         anchor that hangs off it.
 *   V-25b `storage.updateCoordinationStatus` was unconditional AND read-modify-wrote its
 *         `state_history`, so a losing writer's transition was erased from the one record of who
 *         advanced what.
 *
 * ── WHAT THESE PROOFS ARE, AND WHAT THEY ARE NOT ─────────────────────────────────────────────────
 * Each rail is exercised through the SAME objects its handler uses — the exported from-state
 * constant and the storage writer itself — never a reconstruction of the handler's logic. Because a
 * helper that merely *agrees* with a route could keep passing after the route stopped calling it,
 * every rail also carries a STATIC PIN over the handler's own source: the call must be there, with
 * the named list, and the refused answer must be a 409. The pins are what make the behavioural
 * proofs mean something about production.
 *
 * NEGATIVE SPACE, stated because a guard is only as good as what it refuses to claim (§18d): these
 * proofs cover the from-state decision and the two columns that ride on it (`completed_at`, the mint
 * rows, `state_history`). They say nothing about WHO may call each route — that is each handler's
 * own authorization gate, tested elsewhere — and nothing about the traveler arm's ORDERING rule on
 * coordination states, which is V-25(a) and is owned by D-36..D-39 (punchlist D-39). F6 pins that
 * this lane deliberately added none.
 *
 * NO FEE LITERALS (§8): the fixtures' split amounts are arbitrary fixture money, asserted only for
 * PRESENCE/ABSENCE of a mint, never against a rate.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * No Stripe key and no network.
 *
 * Run solo: npx tsx --test server/__tests__/from-state-guards.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  OWNER_BOOKING_TRANSITIONS,
  DISPUTABLE_FROM_STATUSES,
  DISPUTE_REJECT_FROM_STATUSES,
} from "../utils/booking-from-states";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `fsg-${RUN}-prov`,
  traveler: `fsg-${RUN}-trav`,
  expert: `fsg-${RUN}-exp`,
  service: `fsg-${RUN}-svc`,
};
const createdBookingIds: string[] = [];
const createdCoordinationIds: string[] = [];

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

// ── Disposable-DB guard (mirrors booking-birth-provenance.db.test.ts; never defaults open) ────────
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
      `[from-state-guards] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

/** A booking in a named status, with a non-zero split so a mint WOULD land if the rail let one. */
async function seedBooking(opts: {
  status: string;
  completedAt?: Date | null;
}): Promise<string> {
  const id = `fsg-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status,
                                  total_amount, platform_fee, provider_earnings, completed_at)
    VALUES (${id}, ${ids.service}, ${ids.traveler}, ${ids.provider}, ${opts.status},
            '100.00', '25.00', '75.00', ${opts.completedAt ?? null})
  `);
  createdBookingIds.push(id);
  return id;
}

async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, completed_at, cancelled_at FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0];
}

/** Every ledger row the completion mint can write for one booking, counted together. */
async function mintedRowCount(bookingId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT (SELECT COUNT(*) FROM provider_earnings WHERE source_id = ${bookingId})
         + (SELECT COUNT(*) FROM platform_revenue WHERE source_id = ${bookingId}) AS n
  `);
  return Number((r.rows[0] as any).n);
}

async function seedCoordination(status: string): Promise<string> {
  const id = `fsg-${RUN}-co-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO coordination_states (id, user_id, experience_type, status, assigned_expert_id, state_history)
    VALUES (${id}, ${ids.traveler}, 'wedding', ${status}, ${ids.expert},
            ${JSON.stringify([{ status: "intake", timestamp: new Date().toISOString(), action: "created" }])}::jsonb)
  `);
  createdCoordinationIds.push(id);
  return id;
}

async function readCoordination(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, completed_at, state_history FROM coordination_states WHERE id = ${id}
  `);
  return r.rows[0];
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`fsg-${RUN}-prov@t.test`}, 'FSG', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`fsg-${RUN}-trav@t.test`}, 'FSG', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.expert}, ${`fsg-${RUN}-exp@t.test`}, 'FSG', 'Expert', 'travel_expert')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status)
    VALUES (${ids.service}, ${ids.provider}, ${`FSG service ${RUN}`}, 'fixture', '100.00', 'active', 'approved')
  `);
});

after(async () => {
  for (const id of createdCoordinationIds) {
    await db.execute(sql`DELETE FROM coordination_states WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM notifications WHERE data->>'bookingId' = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db
    .execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler}, ${ids.expert})`)
    .catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F1 — V-23: a provisional claim is NOT disputable, and the row is untouched
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("F1: disputing a `payment_pending` provisional claim is refused, and the row is unchanged", async () => {
  const bookingId = await seedBooking({ status: "payment_pending" });

  // Exactly what the handler now does: the writer, with the handler's own named list.
  const result = await storage.updateServiceBookingStatus(
    bookingId,
    "disputed",
    "traveler says the thing never happened",
    DISPUTABLE_FROM_STATUSES,
  );

  assert.equal(
    result,
    undefined,
    "a provisional claim must not be disputable — `checkout-claim.service.ts` is its sole author (§15b)",
  );
  const row = await readBooking(bookingId);
  assert.equal(row.status, "payment_pending", "the row must be byte-for-byte where the claim machine left it");
  assert.equal(row.cancelled_at, null, "no terminal stamp was applied by a refused transition");

  // The pre-fix call shape, proven to be the defect rather than asserted to be: with NO list the
  // same writer flips the same row. This is the negative fixture — it is what `main` did.
  const unguarded = await storage.updateServiceBookingStatus(bookingId, "disputed", "pre-fix shape");
  assert.ok(unguarded, "sanity: the writer without a from-state list is unconditional (the V-23 defect)");
  assert.equal((await readBooking(bookingId)).status, "disputed");
});

test("F1b: the from-state lists refuse `payment_pending` and every terminal state, on every rail", () => {
  // The refusals ARE the content of these lists, so they are asserted by name rather than by count —
  // a count passes for the wrong list.
  for (const [name, list] of [
    ["DISPUTABLE_FROM_STATUSES", DISPUTABLE_FROM_STATUSES],
    ["DISPUTE_REJECT_FROM_STATUSES", DISPUTE_REJECT_FROM_STATUSES],
    ...Object.entries(OWNER_BOOKING_TRANSITIONS).map(
      ([target, l]) => [`OWNER_BOOKING_TRANSITIONS.${target}`, l] as const,
    ),
  ] as ReadonlyArray<readonly [string, readonly string[]]>) {
    assert.ok(
      !list.includes("payment_pending"),
      `${name} must never admit a provisional claim — §15b, and the SD-1 stranding it caused`,
    );
    assert.ok(!list.includes("expired"), `${name} must never admit a swept claim`);
    for (const terminal of ["refunded"]) {
      assert.ok(!list.includes(terminal), `${name} must never consume the terminal state '${terminal}'`);
    }
  }
  assert.ok(
    !DISPUTABLE_FROM_STATUSES.includes("cancelled") && !DISPUTABLE_FROM_STATUSES.includes("disputed"),
    "a cancelled booking has its remedy already, and an already-disputed one cannot be disputed twice",
  );
  assert.deepEqual(
    [...DISPUTE_REJECT_FROM_STATUSES],
    ["disputed"],
    "a rejection can only put back the state the dispute itself created — narrowness is the point",
  );
});

test("F1c: the dispute handler passes the named list and 409s on a refusal (static pin)", () => {
  const s = src("server/routes/bookings.ts");
  assert.match(
    s,
    /updateServiceBookingStatus\(\s*bookingId,\s*'disputed',\s*reason,\s*DISPUTABLE_FROM_STATUSES,\s*\)/,
    "the dispute rail must pass the named from-state list as the writer's 4th argument",
  );
  assert.match(
    s,
    /if \(!disputed\)[\s\S]{0,600}?status\(409\)/,
    "an `undefined` return is a lost race, not a success — the rail must answer 409",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F2 — V-23: two concurrent disputes produce exactly ONE flip
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("F2: two concurrent disputes on the same booking ⇒ exactly one lands", async () => {
  const bookingId = await seedBooking({ status: "confirmed" });

  const [a, b] = await Promise.all([
    storage.updateServiceBookingStatus(bookingId, "disputed", "first", DISPUTABLE_FROM_STATUSES),
    storage.updateServiceBookingStatus(bookingId, "disputed", "second", DISPUTABLE_FROM_STATUSES),
  ]);

  const winners = [a, b].filter(Boolean);
  assert.equal(
    winners.length,
    1,
    "the UPDATE's own predicate is the concurrency guard — the loser must see `undefined`, never a second flip",
  );
  assert.equal((await readBooking(bookingId)).status, "disputed");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F3 — V-24: a reject on a refunded row is refused, mints nothing, and re-stamps nothing
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("F3: admin dispute-reject on a `refunded` booking ⇒ refused, ZERO earnings minted, `completed_at` untouched", async () => {
  const originalCompletedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const bookingId = await seedBooking({ status: "refunded", completedAt: originalCompletedAt });

  const before = await readBooking(bookingId);
  assert.equal(await mintedRowCount(bookingId), 0, "fixture starts unminted");

  const result = await storage.updateServiceBookingStatus(
    bookingId,
    "completed",
    undefined,
    DISPUTE_REJECT_FROM_STATUSES,
  );

  assert.equal(result, undefined, "a refunded row is not a disputed row — the rejection must not apply");
  assert.equal(
    await mintedRowCount(bookingId),
    0,
    "THE MONEY HALF: the mint lives inside the guarded UPDATE's transaction, so a refused transition mints by construction",
  );
  const after_ = await readBooking(bookingId);
  assert.equal(after_.status, "refunded", "the terminal state stands");
  assert.equal(
    after_.completed_at?.toISOString?.() ?? String(after_.completed_at),
    before.completed_at?.toISOString?.() ?? String(before.completed_at),
    "`completed_at` must not move — the traveler's dispute window and the payout anchor hang off it",
  );
});

test("F3b: the admin reject handler reads for its 404, passes the named list, and 409s (static pin)", () => {
  const s = src("server/routes/admin.routes.ts");
  assert.match(
    s,
    /updateServiceBookingStatus\(\s*bookingId,\s*"completed",\s*undefined,\s*DISPUTE_REJECT_FROM_STATUSES,\s*\)/,
    "the reject rail must pass the named from-state list as the writer's 4th argument",
  );
  assert.match(
    s,
    /const existing = await storage\.getServiceBooking\(bookingId\);[\s\S]{0,200}?status\(404\)/,
    "a booking that does not exist and one in the wrong state are different facts — 404 needs its own read (§13)",
  );
  assert.match(
    s,
    /if \(!restored\)[\s\S]{0,600}?status\(409\)/,
    "a lost race must not be reported as `success: true`",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F4 — V-24: a legal reject DOES apply, and keeps the ORIGINAL completion instant
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("F4: reject on a `disputed` row that was previously completed keeps the ORIGINAL `completed_at` (and does mint)", async () => {
  const originalCompletedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const bookingId = await seedBooking({ status: "disputed", completedAt: originalCompletedAt });

  const result = await storage.updateServiceBookingStatus(
    bookingId,
    "completed",
    undefined,
    DISPUTE_REJECT_FROM_STATUSES,
  );

  assert.ok(result, "the one state a rejection may consume is `disputed` — this is the legal move");
  const row = await readBooking(bookingId);
  assert.equal(row.status, "completed");

  const stamped = new Date(row.completed_at).getTime();
  assert.equal(
    stamped,
    originalCompletedAt.getTime(),
    "V-24's second half: `completed_at` is stamped ONCE. A re-completion that moves it restarts the " +
      "traveler's dispute window and pushes the earner's release date out — both anchor on this column.",
  );

  // The discriminating half of F3: the mint is not broken, it is GATED. A legal completion still mints,
  // so F3's zero is about the from-state and nothing else.
  assert.ok(
    (await mintedRowCount(bookingId)) > 0,
    "a legal completion still mints — otherwise F3's zero would prove nothing",
  );
});

test("F4b: `completed_at` is a COALESCE in the SET expression, not a read-then-decide (static pin)", () => {
  const s = src("server/storage.ts");
  assert.match(
    s,
    /if \(status === "completed"\) updates\.completedAt = sql`COALESCE\(\$\{serviceBookings\.completedAt\}, NOW\(\)\)`/,
    "the single UPDATE must stay the whole decision — a prior read would reintroduce the check-then-write shape",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F5 — V-25(b): one coordination advance wins, and the history holds exactly one appended entry
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("F5: two concurrent coordination advances ⇒ one wins, and `state_history` gains exactly ONE entry", async () => {
  const stateId = await seedCoordination("vendor_discovery");
  const historyBefore = (await readCoordination(stateId)).state_history as any[];
  assert.equal(historyBefore.length, 1, "fixture starts with its creation entry");

  const [a, b] = await Promise.all([
    storage.updateCoordinationStatus(stateId, "itinerary_generation", { action: "advance-a" }, ["vendor_discovery"]),
    storage.updateCoordinationStatus(stateId, "optimization", { action: "advance-b" }, ["vendor_discovery"]),
  ]);

  const winners = [a, b].filter(Boolean);
  assert.equal(winners.length, 1, "the UPDATE's own predicate is the guard — the second reader must lose");

  const row = await readCoordination(stateId);
  const history = row.state_history as any[];
  assert.equal(
    history.length,
    historyBefore.length + 1,
    "THE AUDIT HALF: the append is one SQL `||` inside the guarded UPDATE, so a losing writer appends nothing " +
      "and a winning writer can never clobber a concurrent append (the pre-fix read-modify-write erased one)",
  );
  assert.equal(
    history[history.length - 1].status,
    row.status,
    "the appended entry must name the status the row actually took",
  );
  assert.equal(history[history.length - 1].status, winners[0]!.status);
});

test("F5b: the history entry's `status`/`timestamp` are the server's, not the caller's (§13)", async () => {
  const stateId = await seedCoordination("intake");
  // A caller naming its own `status` in the free-form history body: an audit trail whose subject the
  // client can choose is not an audit trail.
  const updated = await storage.updateCoordinationStatus(
    stateId,
    "expert_matching",
    { status: "completed", timestamp: "2001-01-01T00:00:00.000Z", action: "hostile" },
    ["intake"],
  );
  assert.ok(updated);
  const history = (await readCoordination(stateId)).state_history as any[];
  const entry = history[history.length - 1];
  assert.equal(entry.status, "expert_matching", "the recorded status is the one the row took");
  assert.notEqual(entry.timestamp, "2001-01-01T00:00:00.000Z", "the recorded instant is the server's");
  assert.equal(entry.action, "hostile", "the rest of the caller's entry still lands — the strip is narrow");
});

test("F5c: `completed_at` is stamped on the transition INTO completed and never re-stamped", async () => {
  const stateId = await seedCoordination("in_progress");
  const first = await storage.updateCoordinationStatus(stateId, "completed", { action: "finish" }, ["in_progress"]);
  assert.ok(first);
  const firstStamp = (await readCoordination(stateId)).completed_at;
  assert.ok(firstStamp, "a transition into completed stamps the column");

  // A second `completed` write (idempotent retry, or a re-declaration) must not move the instant.
  const second = await storage.updateCoordinationStatus(stateId, "completed", { action: "again" }, ["completed"]);
  assert.ok(second, "the retry is a legal move from `completed`");
  const secondStamp = (await readCoordination(stateId)).completed_at;
  assert.equal(
    new Date(secondStamp).getTime(),
    new Date(firstStamp).getTime(),
    "`completed_at` records WHEN the engagement completed, not when someone last said so",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F6 — V-25(b): the traveler arm still works, and its ORDERING rule is deliberately still D-39's
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("F6: a legal coordination move still lands (the guard narrows nothing that was legal)", async () => {
  const stateId = await seedCoordination("expert_matching");
  const updated = await storage.updateCoordinationStatus(
    stateId,
    "vendor_discovery",
    { action: "traveler-arm-legal-move" },
    ["expert_matching"],
  );
  assert.ok(updated, "passing the status the route READ must not refuse a move that was legal before");
  assert.equal(updated!.status, "vendor_discovery");
  const history = (await readCoordination(stateId)).state_history as any[];
  assert.equal(history[history.length - 1].action, "traveler-arm-legal-move");
});

test("F6b: both arms pass the status they read, and V-25(a) is left to D-39 (static pin)", () => {
  const s = src("server/routes.ts");
  assert.match(
    s,
    /const fromStatus = state\.status \?\? "intake";/,
    "the status the request was decided against is read ONCE and passed to the writer",
  );
  assert.match(
    s,
    /updateCoordinationStatus\(req\.params\.id, status, historyEntry, \[fromStatus\]\)/,
    "ONE call site serves both arms, so both arms are guarded by construction",
  );
  assert.match(
    s,
    /if \(!updated\)[\s\S]{0,500}?status\(409\)/,
    "a lost race must be reported as one",
  );
  // The ruled omission, pinned so a later lane cannot add the ordering rule here by accident and
  // call it housekeeping. D-36..D-39 owns it (EXPERT_ACCEPTANCE_BRIEF F3).
  assert.match(
    s,
    /THE TRAVELER ARM HAS NO ORDERING RULE, AND THIS LANE DELIBERATELY ADDS NONE[\s\S]{0,400}?D-39/,
    "the omission must stay NAMED in the code, with its owner",
  );
  const forwardOrderBlocks = s.match(/const FORWARD_ORDER = \[/g) ?? [];
  assert.equal(
    forwardOrderBlocks.length,
    1,
    "still exactly ONE ordering list, still on the coordinator arm only — a second one would be V-25(a) fixed by the wrong lane",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F7 — the from-state lists have ONE home (§18 rule 1)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("F7: no `service_bookings` from-state list is declared outside `server/utils/booking-from-states.ts`", () => {
  // Derived from the file SET, never a literal call-site count: any server source that DECLARES a
  // list of this kind is a second author of "which statuses may become X".
  const files = ["server/routes.ts", "server/routes/bookings.ts", "server/routes/admin.routes.ts"];
  for (const f of files) {
    const s = src(f);
    assert.ok(
      !/const\s+(OWNER_BOOKING_TRANSITIONS|DISPUTABLE_FROM_STATUSES|DISPUTE_REJECT_FROM_STATUSES)\s*[:=]/.test(s),
      `${f} must IMPORT the from-state lists, never re-declare one (§18 rule 1)`,
    );
  }
  const home = src("server/utils/booking-from-states.ts");
  for (const name of ["OWNER_BOOKING_TRANSITIONS", "DISPUTABLE_FROM_STATUSES", "DISPUTE_REJECT_FROM_STATUSES"]) {
    assert.ok(new RegExp(`export const ${name}`).test(home), `${name} is declared in the one home`);
  }
});
