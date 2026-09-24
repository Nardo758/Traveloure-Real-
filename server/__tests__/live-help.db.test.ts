/**
 * Live help (Locked Decision 54, ledger `2026-09-24-live-chat-qa-sessions`). DB-backed.
 *   Q1 a stranger, and a booking that is not a Q&A Session, are ONE 404 — read and start alike.
 *   Q2 an unpaid booking is refused (`not_paid`); a paid one not in a startable status is refused
 *      (`not_startable`); neither writes a stamp.
 *   Q3 concurrent Starts make ONE session: one caller is told `started`, every caller reads the
 *      same `startedAt`, and the other person is told once.
 *   Q4 the length is the one BOUGHT: the purchase snapshot wins over a later listing edit; a
 *      snapshot that recorded no length refuses rather than borrowing the listing's; a booking from
 *      before the snapshot field reads the listing and says so.
 *   Q5 `qaSession` is a server-authored booking_details key — no client birth body can plant it.
 *   A1 "Available now" needs a future window, vacation wins, and the loader never throws.
 *   A2 the reply time is MEASURED: five quick answers say "within an hour"; mostly-unanswered
 *      openings say nothing; too few conversations say nothing.
 * Needs a disposable Postgres with migrations applied and JOURNEY_DB_WRITES_OK=1.
 * Run: npx tsx --test --test-force-exit server/__tests__/live-help.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { readQaSession, startQaSession } from "../services/qa-session.service";
import { loadLiveStatus } from "../services/live-status.service";
import { SERVER_AUTHORED_BOOKING_DETAIL_KEYS } from "@shared/booking-details-admission";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  expert: `lh-exp-${RUN}`,
  traveler: `lh-trv-${RUN}`,
  stranger: `lh-str-${RUN}`,
  quiet: `lh-quiet-${RUN}`,
  qa: `lh-svc-qa-${RUN}`,
  plain: `lh-svc-plain-${RUN}`,
};
const bookingIds: string[] = [];
const askerIds: string[] = [];

async function booking(opts: {
  service: string;
  status: string;
  paid: boolean;
  snapshot?: unknown;
}): Promise<string> {
  const id = `lh-bk-${crypto.randomUUID().slice(0, 12)}`;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount,
                                  stripe_payment_intent_id, offering_contract_snapshot)
    VALUES (${id}, ${opts.service}, ${ids.traveler}, ${ids.expert}, ${opts.status}, '40.00',
            ${opts.paid ? `pi_lh_${id}` : null},
            ${opts.snapshot === undefined ? null : JSON.stringify(opts.snapshot)}::jsonb)
  `);
  bookingIds.push(id);
  return id;
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.expert}, ${`${ids.expert}@t.test`}, 'Kei', 'Local', 'local_expert'),
           (${ids.traveler}, ${`${ids.traveler}@t.test`}, 'Tia', 'Traveler', 'user'),
           (${ids.stranger}, ${`${ids.stranger}@t.test`}, 'Sam', 'Stranger', 'user'),
           (${ids.quiet}, ${`${ids.quiet}@t.test`}, 'Quinn', 'Quiet', 'local_expert')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status,
                                   delivery_method, expert_offering_type_key, duration_minutes)
    VALUES (${ids.qa}, ${ids.expert}, ${`Ask me about Kyoto ${RUN}`}, 'fixture', '40.00', 'active', 'approved',
            'async_messaging', 'ask_me_anything', 60),
           (${ids.plain}, ${ids.expert}, ${`Walking tour ${RUN}`}, 'fixture', '40.00', 'active', 'approved',
            'in_person', NULL, 120)
  `);
});

after(async () => {
  for (const b of bookingIds) await db.execute(sql`DELETE FROM service_bookings WHERE id = ${b}`).catch(() => {});
  const everyone = [ids.expert, ids.traveler, ids.stranger, ids.quiet, ...askerIds];
  const list = sql.join(everyone.map((u) => sql`${u}`), sql`, `);
  await db.execute(sql`DELETE FROM user_and_expert_chats WHERE sender_id IN (${list}) OR receiver_id IN (${list})`).catch(() => {});
  await db.execute(sql`DELETE FROM notifications WHERE user_id IN (${list})`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${ids.qa}, ${ids.plain})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${list})`).catch(() => {});
});

const snap30 = { terms: { sessionLengthMinutes: 30 } };

test("Q1: a stranger and a non-Q&A booking are one 404", async () => {
  const qa = await booking({ service: ids.qa, status: "confirmed", paid: true, snapshot: snap30 });
  const plain = await booking({ service: ids.plain, status: "confirmed", paid: true });
  for (const [bookingId, user] of [[qa, ids.stranger], [plain, ids.traveler], ["lh-bk-missing", ids.traveler]] as const) {
    assert.deepEqual(await readQaSession(bookingId, user), { ok: false, status: 404, reason: "not_found" });
    assert.deepEqual(await startQaSession(bookingId, user), { ok: false, status: 404, reason: "not_found" });
  }
  const stamp: any = await db.execute(sql`SELECT booking_details->'qaSession' AS s FROM service_bookings WHERE id = ${qa}`);
  assert.equal((stamp.rows ?? stamp)[0].s, null, "a refused start writes nothing");
});

test("Q2: unpaid and unstartable bookings are refused and unstamped", async () => {
  const unpaid = await booking({ service: ids.qa, status: "confirmed", paid: false, snapshot: snap30 });
  assert.deepEqual(await startQaSession(unpaid, ids.traveler), { ok: false, status: 409, reason: "not_paid" });
  const read = await readQaSession(unpaid, ids.traveler);
  assert.ok(read.ok && read.view.paid === false && read.view.canStart === false);

  const done = await booking({ service: ids.qa, status: "completed", paid: true, snapshot: snap30 });
  assert.deepEqual(await startQaSession(done, ids.expert), { ok: false, status: 409, reason: "not_startable" });
  const rows: any = await db.execute(sql`
    SELECT count(*)::int AS n FROM service_bookings WHERE id IN (${unpaid}, ${done}) AND booking_details ? 'qaSession'
  `);
  assert.equal((rows.rows ?? rows)[0].n, 0);
});

test("Q3: concurrent starts make one session and one notice", async () => {
  const b = await booking({ service: ids.qa, status: "confirmed", paid: true, snapshot: snap30 });
  const now = new Date("2026-09-24T12:00:00Z");
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) => startQaSession(b, i % 2 ? ids.expert : ids.traveler, now)),
  );
  assert.ok(results.every((r) => r.ok), "every press is answered with the session");
  const started = results.filter((r) => r.ok && r.started);
  assert.equal(started.length, 1, "exactly one press started it");
  const starts = new Set(results.map((r: any) => r.view.state?.startedAt));
  assert.equal(starts.size, 1, "everyone reads the same start");
  const first = results.find((r: any) => r.started) as any;
  assert.equal(first.view.state.endsAt, "2026-09-24T12:30:00.000Z", "30 minutes from the start");

  const other = first.view.viewer === "traveler" ? ids.expert : ids.traveler;
  const notes: any = await db.execute(sql`
    SELECT count(*)::int AS n FROM notifications WHERE user_id = ${other} AND type = 'qa_session_started' AND related_id = ${b}
  `);
  assert.equal((notes.rows ?? notes)[0].n, 1);
  const again = await startQaSession(b, ids.traveler, now);
  assert.ok(again.ok && again.started === false, "a later press reads the session back");
});

test("Q4: the length is the one bought", async () => {
  const bought = await booking({ service: ids.qa, status: "confirmed", paid: true, snapshot: snap30 });
  const r1 = await readQaSession(bought, ids.traveler);
  assert.ok(r1.ok);
  if (r1.ok) {
    assert.equal(r1.view.lengthMinutes, 30, "the snapshot beats the listing's current 60");
    assert.equal(r1.view.lengthSource, "purchase");
  }

  const noLength = await booking({ service: ids.qa, status: "confirmed", paid: true, snapshot: { terms: { sessionLengthMinutes: null } } });
  assert.deepEqual(await startQaSession(noLength, ids.traveler), { ok: false, status: 409, reason: "no_session_length" });

  const legacy = await booking({ service: ids.qa, status: "confirmed", paid: true });
  const r3 = await readQaSession(legacy, ids.expert);
  assert.ok(r3.ok);
  if (r3.ok) {
    assert.equal(r3.view.lengthMinutes, 60);
    assert.equal(r3.view.lengthSource, "listing", "an older booking says it read the listing");
    assert.equal(r3.view.viewer, "expert");
  }
});

test("Q5: qaSession is server-authored", () => {
  assert.ok((SERVER_AUTHORED_BOOKING_DETAIL_KEYS as readonly string[]).includes("qaSession"));
});

test("A1: available now needs a window; vacation wins", async () => {
  const soon = new Date(Date.now() + 60 * 60_000);
  await db.execute(sql`UPDATE users SET available_now_until = ${soon.toISOString()}::timestamp WHERE id = ${ids.expert}`);
  await db.execute(sql`UPDATE users SET available_now_until = ${new Date(Date.now() - 60_000).toISOString()}::timestamp WHERE id = ${ids.quiet}`);
  let live = await loadLiveStatus([ids.expert, ids.quiet, "lh-nobody"]);
  assert.equal(live.get(ids.expert)?.availableNow, true);
  assert.equal(live.get(ids.quiet)?.availableNow, false, "a lapsed window is not available");
  assert.deepEqual(live.get("lh-nobody"), { availableNow: false, replyTime: null }, "unknown ids answer nothing");

  await db.execute(sql`UPDATE users SET vacation_until = ${new Date(Date.now() + 86_400_000).toISOString()}::timestamp WHERE id = ${ids.expert}`);
  live = await loadLiveStatus([ids.expert]);
  assert.equal(live.get(ids.expert)?.availableNow, false, "vacation wins");
  await db.execute(sql`UPDATE users SET vacation_until = NULL, available_now_until = NULL WHERE id IN (${ids.expert}, ${ids.quiet})`);
});

async function chat(from: string, to: string, at: Date) {
  await db.execute(sql`
    INSERT INTO user_and_expert_chats (id, sender_id, receiver_id, message, created_at)
    VALUES (${crypto.randomUUID()}, ${from}, ${to}, 'fixture', ${at.toISOString()}::timestamp)
  `);
}

test("A2: the reply time is measured, never guessed", async () => {
  const day = 86_400_000;
  // Six askers opened a conversation with the expert ten days ago; five were answered in 20 min.
  for (let i = 0; i < 6; i++) {
    const asker = `lh-ask-${RUN}-${i}`;
    askerIds.push(asker);
    await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${asker}, ${`${asker}@t.test`}, 'user')`);
    const opened = new Date(Date.now() - 10 * day + i * 60_000);
    await chat(asker, ids.expert, opened);
    if (i < 5) await chat(ids.expert, asker, new Date(opened.getTime() + 20 * 60_000));
    // The quiet expert: the same openings, answered only once.
    await chat(asker, ids.quiet, opened);
    if (i === 0) await chat(ids.quiet, asker, new Date(opened.getTime() + 10 * 60_000));
  }
  const live = await loadLiveStatus([ids.expert, ids.quiet, ids.traveler]);
  assert.equal(live.get(ids.expert)?.replyTime, "within_an_hour");
  assert.equal(live.get(ids.quiet)?.replyTime, null, "mostly-unanswered openings advertise nothing");
  assert.equal(live.get(ids.traveler)?.replyTime, null, "no conversations, no claim");
});
