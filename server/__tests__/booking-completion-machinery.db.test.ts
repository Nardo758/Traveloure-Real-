/**
 * D8 — PER-METHOD BOOKING COMPLETION MACHINERY (docs/DECISIONS.md ruling 63, executed by 66).
 *
 * Ruling 63's whole point is that there is ONE payout machinery and no per-method money forks:
 * six different completion CONDITIONS, one completion EVENT. So the properties worth proving are
 * the ones a per-method fork would break, and most of them are NEGATIVES:
 *
 *   A. The pdf timer fires on BOTH arms the ruling names — 7 days after the FIRST download, and
 *      7 days UNDOWNLOADED post-delivery — and on NEITHER of them early.
 *   B. §13: a booking that lacks the data to decide is SKIPPED WITH A STATED REASON, never
 *      guessed into a completion. A guessed completion mints real money.
 *   C. §15: the flip is an atomic conditional, so a double run of the timer, a double click on
 *      the owner rail, and a timer racing the owner all produce exactly ONE flip, ONE earning
 *      set and ONE diary row.
 *   D. The timer is METHOD-SCOPED: a call booking, a bundle and an in-person booking are all
 *      untouched by it, however old they are.
 *   E. §15b: a `payment_pending` provisional claim is NEVER completed by any of this.
 *   F. Owner-declared completion (session end / async SLA / bundle components) goes through the
 *      SAME shared function, mints the same held earnings, and — for async — those earnings stay
 *      HELD for the whole existing dispute window, so the release job does NOT release them.
 *   G. A PARTIALLY delivered bundle never completes and never pays out anything.
 *
 * SERVER REQUIRED. Most proofs drive the machinery directly against the DB, but the owner-rail
 * proofs are real HTTP against `POST /api/provider/bookings/:id/complete`, and the fixture users
 * are registered over HTTP so they hold genuine sessions (the same posture as
 * service-deliverable.http.test.ts). `before()` fails loudly if the dev server is not up.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run solo:
 *   DATABASE_URL=… OBJECT_STORAGE_DRIVER=memory RATE_LIMIT_LOOPBACK_SKIP=1 \
 *   npx tsx --test server/__tests__/booking-completion-machinery.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { runBookingAutoCompletion } from "../jobs/bookingAutoCompletion";
import {
  completeBooking,
  ownerActorFor,
  recordBundleComponentCompletion,
  resolveCompletionEligibility,
} from "../services/booking-completion.service";
import { completionRuleFor } from "@shared/service-fundamentals";
import { serviceDateCompletionDays } from "../config/completion-windows.config";
import { storage } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8);
const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const DAY = 24 * 60 * 60 * 1000;

const ids = {
  traveler: `d8-${RUN}-trav`,
  trip: `d8-${RUN}-trip`,
  pdfSvc: `d8-${RUN}-pdf`,
  callSvc: `d8-${RUN}-call`,
  asyncSvc: `d8-${RUN}-async`,
  inPersonSvc: `d8-${RUN}-inp`,
  voiceSvc: `d8-${RUN}-voice`,
  propSvc: `d8-${RUN}-prop`,
  bundleSvc: `d8-${RUN}-bundle`,
  compA: `d8-${RUN}-compa`,
  compB: `d8-${RUN}-compb`,
};
const createdBookingIds: string[] = [];
const createdSlotIds: string[] = [];
let owner: { id: string; cookie: string };
let stranger: { id: string; cookie: string };

// ── Disposable-DB guard (mirrors checkout-claim-sweep.db.test.ts; never defaults open) ─────────
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
      `[booking-completion] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function registerUser(tag: string): Promise<{ id: string; cookie: string }> {
  const email = `d8-${RUN}-${tag}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Sup3rSecret!23", firstName: "D8", lastName: tag }),
  });
  const raw = await res.text();
  assert.ok(res.ok, `register(${tag}) must succeed: ${res.status} ${raw}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body: any = JSON.parse(raw);
  return { id: body.user.id, cookie: setCookie.split(";")[0] };
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** A confirmed booking on `serviceId`, with the money columns a completion needs. */
async function makeBooking(opts: {
  serviceId: string;
  status?: string;
  confirmedDaysAgo?: number;
  details?: Record<string, unknown>;
  slotId?: string | null;
  withTrip?: boolean;
}): Promise<string> {
  const id = `d8-${RUN}-bk-${createdBookingIds.length}`;
  const confirmedAt =
    opts.confirmedDaysAgo === undefined ? null : new Date(Date.now() - opts.confirmedDaysAgo * DAY);
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, trip_id, booking_details, status,
       total_amount, platform_fee, provider_earnings, confirmed_at, slot_id, created_at)
    VALUES (
      ${id}, ${opts.serviceId}, ${ids.traveler}, ${owner.id},
      ${opts.withTrip === false ? null : ids.trip},
      ${JSON.stringify(opts.details ?? {})}::jsonb,
      ${opts.status ?? "confirmed"},
      '100.00', '20.00', '80.00',
      ${confirmedAt}, ${opts.slotId ?? null}, NOW()
    )
  `);
  createdBookingIds.push(id);
  return id;
}

async function makeSlot(opts: { serviceId: string; daysFromNow: number; endTime: string }): Promise<string> {
  const id = `d8-${RUN}-slot-${createdSlotIds.length}`;
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, booked_count, status)
    VALUES (${id}, ${opts.serviceId}, ${owner.id},
            (CURRENT_DATE + (${opts.daysFromNow})::int)::date, '09:00', ${opts.endTime}, 1, 1, 'fully_booked')
  `);
  createdSlotIds.push(id);
  return id;
}

async function statusOf(bookingId: string): Promise<string | null> {
  const r = await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${bookingId}`);
  return ((r.rows[0] as any)?.status as string) ?? null;
}
async function completionStamp(bookingId: string): Promise<any> {
  const r = await db.execute(sql`SELECT booking_details -> 'completion' AS c FROM service_bookings WHERE id = ${bookingId}`);
  return (r.rows[0] as any)?.c ?? null;
}
async function earningCounts(bookingId: string): Promise<{ provider: number; expert: number; held: number }> {
  const p = await db.execute(sql`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE status = 'held')::int AS h FROM provider_earnings WHERE source_id = ${bookingId}`);
  const e = await db.execute(sql`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE status = 'held')::int AS h FROM expert_earnings WHERE reference_id = ${bookingId}`);
  return {
    provider: Number((p.rows[0] as any)?.n ?? 0),
    expert: Number((e.rows[0] as any)?.n ?? 0),
    held: Number((p.rows[0] as any)?.h ?? 0) + Number((e.rows[0] as any)?.h ?? 0),
  };
}
async function diaryCount(bookingId: string): Promise<number> {
  // The diary is trip-scoped; every fixture booking that carries a trip carries THIS trip, so the
  // count is scoped by event type + the run's trip and cross-checked against the flip count.
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM item_transition_log
    WHERE trip_id = ${ids.trip} AND event_type = 'booking_completed'
  `);
  void bookingId;
  return Number((r.rows[0] as any)?.n ?? 0);
}
async function logDownload(bookingId: string, serviceId: string, daysAgo: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO deliverable_downloads (id, booking_id, service_id, user_id, protected, downloaded_at)
    VALUES (${crypto.randomUUID()}, ${bookingId}, ${serviceId}, ${ids.traveler}, true,
            NOW() - (${daysAgo} || ' days')::interval)
  `);
}

before(async () => {
  await assertDisposableDb();
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} (see the bench recipe)`);

  owner = await registerUser("owner");
  stranger = await registerUser("stranger");

  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`d8-${RUN}-trav@t.test`}, 'D8', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.traveler}, 'D8 fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
  const svc = async (id: string, name: string, method: string | null, shape: string | null) => {
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, price, delivery_method, product_shape, approval_status, status)
      VALUES (${id}, ${owner.id}, ${name}, '100.00', ${method}, ${shape}, 'approved', 'active')
    `);
  };
  await svc(ids.pdfSvc, "D8 pdf guide", "pdf", null);
  await svc(ids.callSvc, "D8 call session", "call", null);
  await svc(ids.asyncSvc, "D8 async concierge", "async_messaging", null);
  await svc(ids.inPersonSvc, "D8 walking tour", "in_person", null);
  await svc(ids.voiceSvc, "D8 voice notes", "voice_notes", null);
  await svc(ids.propSvc, "D8 room", "in_person", "property_room");
  await svc(ids.bundleSvc, "D8 bundle", "in_person", "bundle");
  await svc(ids.compA, "D8 component A", "call", null);
  await svc(ids.compB, "D8 component B", "pdf", null);
  await db.execute(sql`
    INSERT INTO bundle_components (id, bundle_service_id, component_service_id, position)
    VALUES (${crypto.randomUUID()}, ${ids.bundleSvc}, ${ids.compA}, 0),
           (${crypto.randomUUID()}, ${ids.bundleSvc}, ${ids.compB}, 1)
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM deliverable_downloads WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  for (const id of createdSlotIds) {
    await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM bundle_components WHERE bundle_service_id = ${ids.bundleSvc}`).catch(() => {});
  for (const id of [ids.bundleSvc, ids.compA, ids.compB, ids.pdfSvc, ids.callSvc, ids.asyncSvc, ids.inPersonSvc, ids.voiceSvc, ids.propSvc]) {
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.traveler}`).catch(() => {});
  if (owner) await db.execute(sql`DELETE FROM users WHERE id = ${owner.id}`).catch(() => {});
  if (stranger) await db.execute(sql`DELETE FROM users WHERE id = ${stranger.id}`).catch(() => {});
});

// ══ A — the pdf timer, both arms ═════════════════════════════════════════════════════════════

test("D8-P1: pdf auto-completes 7 days after the FIRST download, through the shared spine", async () => {
  const bk = await makeBooking({ serviceId: ids.pdfSvc, confirmedDaysAgo: 20 });
  await logDownload(bk, ids.pdfSvc, 8);
  await logDownload(bk, ids.pdfSvc, 2); // a later re-download must not restart the clock

  const before = await diaryCount(bk);
  const run = await runBookingAutoCompletion();

  assert.ok(run.completedBookingIds.includes(bk), `job must complete ${bk}; skipped=${JSON.stringify(run.skipped)}`);
  assert.equal(await statusOf(bk), "completed");
  const stamp = await completionStamp(bk);
  assert.equal(stamp?.rule, "artifact_timer");
  assert.equal(stamp?.actor, "auto_complete_pdf");
  assert.equal(stamp?.evidence?.arm, "downloaded", "the DOWNLOADED arm must be the one that fired");
  // ONE payout machinery: the SAME held earnings the in-person flip mints.
  const earnings = await earningCounts(bk);
  assert.equal(earnings.provider, 1, "exactly one provider earning");
  assert.equal(earnings.expert, 1, "exactly one expert earning");
  assert.equal(earnings.held, 2, "both born HELD — completion is not payout");
  assert.equal(await diaryCount(bk), before + 1, "exactly one booking_completed diary row");
});

test("D8-N1: pdf does NOT auto-complete before 7 days after the first download", async () => {
  const bk = await makeBooking({ serviceId: ids.pdfSvc, confirmedDaysAgo: 20 });
  await logDownload(bk, ids.pdfSvc, 3);

  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.rule, "artifact_timer");
  assert.equal(e.eligible, false);
  assert.equal(e.reason, "window_open");

  await runBookingAutoCompletion();
  assert.equal(await statusOf(bk), "confirmed", "an open window must leave the booking untouched");
  assert.deepEqual(await earningCounts(bk), { provider: 0, expert: 0, held: 0 }, "no money may move inside the window");
});

test("D8-P2: pdf auto-completes 7 days UNDOWNLOADED post-delivery", async () => {
  await db.execute(sql`UPDATE provider_services SET deliverable_uploaded_at = NOW() - INTERVAL '9 days' WHERE id = ${ids.pdfSvc}`);
  const bk = await makeBooking({ serviceId: ids.pdfSvc, confirmedDaysAgo: 10 });

  const run = await runBookingAutoCompletion();
  assert.ok(run.completedBookingIds.includes(bk), `job must complete ${bk}; skipped=${JSON.stringify(run.skipped)}`);
  const stamp = await completionStamp(bk);
  assert.equal(stamp?.evidence?.arm, "undownloaded");
  assert.equal(await statusOf(bk), "completed");
  const earnings = await earningCounts(bk);
  assert.equal(earnings.provider + earnings.expert, 2);
});

test("D8-N2 (§13): an UNDOWNLOADED pdf booking with NO delivery timestamp is skipped with a stated reason, never guessed", async () => {
  await db.execute(sql`UPDATE provider_services SET deliverable_uploaded_at = NULL WHERE id = ${ids.pdfSvc}`);
  const bk = await makeBooking({ serviceId: ids.pdfSvc, confirmedDaysAgo: 60 });

  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.eligible, false);
  assert.equal(e.reason, "no_delivery_timestamp", "the reason must be STATED, not inferred from confirmedAt alone");

  const run = await runBookingAutoCompletion();
  assert.ok((run.skipped["no_delivery_timestamp"] ?? 0) >= 1, "the pass must ACCOUNT for the skip");
  assert.equal(await statusOf(bk), "confirmed");
  assert.deepEqual(await earningCounts(bk), { provider: 0, expert: 0, held: 0 });
});

test("D8-N2b: delivered only 3 days ago, undownloaded — window still open", async () => {
  await db.execute(sql`UPDATE provider_services SET deliverable_uploaded_at = NOW() - INTERVAL '3 days' WHERE id = ${ids.pdfSvc}`);
  const bk = await makeBooking({ serviceId: ids.pdfSvc, confirmedDaysAgo: 30 });
  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.eligible, false);
  assert.equal(e.reason, "window_open");
  assert.equal(e.evidence.arm, "undownloaded");
  await db.execute(sql`UPDATE provider_services SET deliverable_uploaded_at = NULL WHERE id = ${ids.pdfSvc}`);
});

// ══ C — idempotency (§15) ════════════════════════════════════════════════════════════════════

test("D8-P3 (§15): a DOUBLE job run is exactly ONE flip, ONE earning set and ONE diary row", async () => {
  const bk = await makeBooking({ serviceId: ids.pdfSvc, confirmedDaysAgo: 20 });
  await logDownload(bk, ids.pdfSvc, 10);

  const diaryBefore = await diaryCount(bk);
  await runBookingAutoCompletion();
  const afterFirst = await earningCounts(bk);
  const diaryAfterFirst = await diaryCount(bk);
  assert.equal(await statusOf(bk), "completed");
  assert.equal(afterFirst.provider + afterFirst.expert, 2);
  assert.equal(diaryAfterFirst, diaryBefore + 1);

  const second = await runBookingAutoCompletion();
  assert.ok(!second.completedBookingIds.includes(bk), "a completed booking is not a candidate on the second pass");
  assert.deepEqual(await earningCounts(bk), afterFirst, "no second earning set");
  assert.equal(await diaryCount(bk), diaryAfterFirst, "no second diary row");

  // …and the direct caller loses the same way: the atomic conditional is the guard, not a check.
  const direct = await completeBooking({ bookingId: bk, actor: "auto_complete_pdf" });
  assert.equal(direct.completed, false);
  assert.equal(direct.reason, "wrong_status");
  assert.deepEqual(await earningCounts(bk), afterFirst);
});

// ══ D/E — the timer is method-scoped, and never touches a provisional claim ══════════════════

test("D8-N3: a CALL booking is untouched by the pdf/property timer however old it is", async () => {
  const slot = await makeSlot({ serviceId: ids.callSvc, daysFromNow: -5, endTime: "10:00" });
  const bk = await makeBooking({ serviceId: ids.callSvc, confirmedDaysAgo: 40, slotId: slot });

  const run = await runBookingAutoCompletion();
  assert.ok(!run.completedBookingIds.includes(bk), "the timer must never fire an owner-declared rule");
  assert.equal(await statusOf(bk), "confirmed");
  assert.deepEqual(await earningCounts(bk), { provider: 0, expert: 0, held: 0 });
  // …even though its OWN rule says it is ready — that is the owner's declaration to make.
  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.rule, "session_end");
  assert.equal(e.eligible, true);
});

test("D8-N4 (§15b): a payment_pending provisional claim is NEVER completed by the timer", async () => {
  await db.execute(sql`UPDATE provider_services SET deliverable_uploaded_at = NOW() - INTERVAL '40 days' WHERE id = ${ids.pdfSvc}`);
  const bk = await makeBooking({ serviceId: ids.pdfSvc, status: "payment_pending", confirmedDaysAgo: 40 });
  await logDownload(bk, ids.pdfSvc, 30);

  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.eligible, false);
  assert.equal(e.reason, "wrong_status", "the claim machine owns this row (§15b/§18b)");
  const run = await runBookingAutoCompletion();
  assert.ok(!run.completedBookingIds.includes(bk));
  assert.equal(await statusOf(bk), "payment_pending");
  assert.deepEqual(await earningCounts(bk), { provider: 0, expert: 0, held: 0 });
  await db.execute(sql`UPDATE provider_services SET deliverable_uploaded_at = NULL WHERE id = ${ids.pdfSvc}`);
});

/**
 * D8-N5 — SUPERSEDED IN PLACE by ruling 69 disposition 1 (which AMENDS ruling 63's
 * "in_person/hybrid untouched" clause). What it used to assert — that in-person had no D8 writer —
 * was the very defect ruling 66 filed: the "traveler-driven" path was a closed loop, so an
 * in-person booking could reach `completed` by NO path at all. The rule is now
 * `service_date_timer`; what survives from the old assertion, and is asserted here, is that the
 * OWNER still may not declare it out of turn (see D8-N15 for the dated case).
 */
test("D8-N5: in_person/hybrid is a TIMER rule now, and the owner may not simply declare it", async () => {
  const rule = completionRuleFor({ deliveryMethod: "in_person", productShape: null });
  assert.equal(rule, "service_date_timer", "ruling 69 disposition 1 amends ruling 63's first row");
  assert.equal(completionRuleFor({ deliveryMethod: "hybrid", productShape: null }), "service_date_timer");
  assert.equal(ownerActorFor(rule!), null, "it is not in the owner-declared set — only the narrow no-date arm opens it");

  // A DATED in-person booking whose window is still open cannot be completed by anyone.
  const soon = new Date(Date.now() - 1 * DAY).toISOString();
  const bk = await makeBooking({ serviceId: ids.inPersonSvc, confirmedDaysAgo: 40, details: { scheduledDate: soon } });
  const attempt = await completeBooking({ bookingId: bk, actor: "provider_declared", allowOwnerDeclaredFallback: true });
  assert.equal(attempt.completed, false, "the no-date arm must NOT rescue a booking that HAS a date");
  assert.equal(attempt.reason, "window_open");
  assert.equal(await statusOf(bk), "confirmed");
  assert.deepEqual(await earningCounts(bk), { provider: 0, expert: 0, held: 0 });
});

// ══ ruling 69 disposition 1 — the in_person/hybrid booked-service-date timer ══════════════════
//
// Ruling 66 filed the gap in its own words: "nothing can put an in-person booking into
// `completed`, and `confirm-completion` refuses anything that is not already there". These proofs
// are that the door is now open, that it opens on the DATE and not on purchase time, and that it
// stays shut for every case §13 says the platform cannot decide.

test("D8-P7: an IN-PERSON booking auto-completes once its service date + the dispute window has fully passed", async () => {
  const windowDays = serviceDateCompletionDays();
  // Comfortably past: the service day, plus the whole window, plus a day.
  const past = new Date(Date.now() - (windowDays + 2) * DAY).toISOString();
  const done = await makeBooking({ serviceId: ids.inPersonSvc, confirmedDaysAgo: windowDays + 5, details: { scheduledDate: past } });

  const e = await resolveCompletionEligibility(done);
  assert.equal(e.rule, "service_date_timer");
  assert.equal(e.eligible, true, `expected eligible, got ${e.reason} ${JSON.stringify(e.evidence)}`);
  assert.equal((e.evidence as any).dateSource, "scheduled_date");
  assert.equal((e.evidence as any).windowDays, windowDays, "N is the REUSED dispute window, not a new constant");

  const run = await runBookingAutoCompletion();
  assert.ok(run.completedBookingIds.includes(done), `must complete; skipped=${JSON.stringify(run.skipped)}`);
  assert.equal(await statusOf(done), "completed");
  const stamp = await completionStamp(done);
  assert.equal(stamp?.actor, "auto_complete_service_date");
  assert.equal(stamp?.rule, "service_date_timer");
  // The SAME payout machinery as every other rule — held earnings, no per-method fork.
  const earned = await earningCounts(done);
  assert.equal(earned.provider, 1);
  assert.equal(earned.expert, 1);
  assert.equal(earned.held, 2, "born HELD — completion is not payout");
});

test("D8-N11: it does NOT fire before the service date + window has passed", async () => {
  const windowDays = serviceDateCompletionDays();
  // Yesterday's service: the day has passed, the WINDOW has not.
  const yesterday = new Date(Date.now() - 1 * DAY).toISOString();
  const early = await makeBooking({ serviceId: ids.inPersonSvc, confirmedDaysAgo: 10, details: { scheduledDate: yesterday } });
  const e = await resolveCompletionEligibility(early);
  assert.equal(e.eligible, false);
  assert.equal(e.reason, "window_open");
  assert.ok(e.eligibleAt, "a knowable eligibility moment must be stated");

  // A FUTURE service date is even more obviously not complete.
  const future = new Date(Date.now() + 5 * DAY).toISOString();
  const notYet = await makeBooking({ serviceId: ids.inPersonSvc, confirmedDaysAgo: 1, details: { scheduledDate: future } });

  await runBookingAutoCompletion();
  assert.equal(await statusOf(early), "confirmed", "the window must be honoured, not just the day");
  assert.equal(await statusOf(notYet), "confirmed");
  assert.deepEqual(await earningCounts(early), { provider: 0, expert: 0, held: 0 });
  void windowDays;
});

test("D8-P8: the BOOKED SLOT dates the booking when there is no scheduledDate snapshot", async () => {
  const windowDays = serviceDateCompletionDays();
  const slot = await makeSlot({ serviceId: ids.inPersonSvc, daysFromNow: -(windowDays + 2), endTime: "17:00" });
  const bk = await makeBooking({ serviceId: ids.inPersonSvc, confirmedDaysAgo: windowDays + 5, slotId: slot, details: {} });
  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.eligible, true, `expected eligible, got ${e.reason}`);
  assert.equal((e.evidence as any).dateSource, "booked_slot", "the provider's published slot is the stronger source");
});

test("D8-N12: a DISPUTED in-person booking is never completed by the timer", async () => {
  const windowDays = serviceDateCompletionDays();
  const past = new Date(Date.now() - (windowDays + 3) * DAY).toISOString();
  const bk = await makeBooking({
    serviceId: ids.inPersonSvc,
    status: "disputed",
    confirmedDaysAgo: windowDays + 6,
    details: { scheduledDate: past },
  });
  // The dispute check is the EXISTING from-state guard — `POST /api/bookings/:id/dispute` writes
  // `status='disputed'`, and `confirmed` is the only from-state any D8 rule may claim. No new
  // check was needed and none was added; this proves the existing one covers the new rule.
  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.eligible, false);
  assert.equal(e.reason, "wrong_status");
  const run = await runBookingAutoCompletion();
  assert.ok(!run.completedBookingIds.includes(bk));
  assert.equal(await statusOf(bk), "disputed");
  assert.deepEqual(await earningCounts(bk), { provider: 0, expert: 0, held: 0 });
});

test("D8-N13 (§13): NO service date ⇒ skipped with the reason, and ONLY then may the owner declare it", async () => {
  const bk = await makeBooking({ serviceId: ids.inPersonSvc, confirmedDaysAgo: 60, details: {}, slotId: null });
  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.rule, "service_date_timer");
  assert.equal(e.eligible, false);
  assert.equal(e.reason, "no_service_date", "a date the platform never held is never guessed");
  assert.equal(e.ownerDeclarableFallback, true, "and THIS is the one case that opens the owner rail");

  const run = await runBookingAutoCompletion();
  assert.ok(!run.completedBookingIds.includes(bk), "the timer must skip it, not guess a date");
  assert.equal(run.skipped["no_service_date"] >= 1, true, `the reason must be counted: ${JSON.stringify(run.skipped)}`);
  assert.equal(await statusOf(bk), "confirmed");

  // The narrow provider-declared fallback, over real HTTP on the owner rail.
  const res = await api(`/api/provider/bookings/${bk}/complete`, owner.cookie, "POST", {});
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  assert.equal(JSON.parse(raw).completed, true);
  assert.equal(await statusOf(bk), "completed");
  const stamp = await completionStamp(bk);
  assert.equal(stamp?.actor, "provider_declared");
  assert.equal(stamp?.fallback, "owner_declared_no_service_date", "the row must SAY it took the fallback");
  assert.equal((await earningCounts(bk)).held, 2, "still HELD — disputable for the whole window");
});

test("D8-N15: the owner rail REFUSES an in-person booking that HAS a service date — the timer is the normal path", async () => {
  const past = new Date(Date.now() - 2 * DAY).toISOString();
  const dated = await makeBooking({ serviceId: ids.inPersonSvc, confirmedDaysAgo: 10, details: { scheduledDate: past } });
  const res = await api(`/api/provider/bookings/${dated}/complete`, owner.cookie, "POST", {});
  assert.equal(res.status, 409);
  const body: any = await res.json();
  assert.equal(body.reason, "rule_not_owner_declared");
  assert.equal(body.rule, "service_date_timer");
  assert.equal(await statusOf(dated), "confirmed");
  assert.deepEqual(await earningCounts(dated), { provider: 0, expert: 0, held: 0 });
});

test("D8-P9 (§15): a DOUBLE run of the in-person timer is exactly ONE flip and ONE earning set", async () => {
  const windowDays = serviceDateCompletionDays();
  const past = new Date(Date.now() - (windowDays + 4) * DAY).toISOString();
  const bk = await makeBooking({ serviceId: ids.inPersonSvc, confirmedDaysAgo: windowDays + 8, details: { scheduledDate: past } });

  const diaryBefore = await diaryCount(bk);
  const first = await runBookingAutoCompletion();
  assert.ok(first.completedBookingIds.includes(bk));
  const afterFirst = await earningCounts(bk);
  assert.equal(afterFirst.provider, 1);
  assert.equal(afterFirst.expert, 1);

  const second = await runBookingAutoCompletion();
  assert.ok(!second.completedBookingIds.includes(bk), "the second pass must not re-complete it");
  assert.deepEqual(await earningCounts(bk), afterFirst, "no second earning set");
  assert.equal(await diaryCount(bk), diaryBefore + 1, "exactly one diary row");
});

test("D8-P10: the traveler's EARLY confirm-completion still releases, unchanged by the timer", async () => {
  const windowDays = serviceDateCompletionDays();
  const past = new Date(Date.now() - (windowDays + 4) * DAY).toISOString();
  const bk = await makeBooking({ serviceId: ids.inPersonSvc, confirmedDaysAgo: windowDays + 8, details: { scheduledDate: past } });
  const run = await runBookingAutoCompletion();
  assert.ok(run.completedBookingIds.includes(bk));
  assert.equal((await earningCounts(bk)).held, 2, "the timer mints HELD earnings");

  // `POST /api/bookings/:id/confirm-completion` is the traveler's EARLY release and requires the
  // booking to already be `completed` — which, before this ruling, nothing could make it. Driven
  // through the same storage call that endpoint uses (the fixture traveler holds no session).
  const released = await storage.releaseEarningsForBooking(bk);
  assert.ok(released >= 1, "the traveler's early confirm must still release the held earning");
  assert.equal((await earningCounts(bk)).held, 0, "nothing left held after an early confirm");
});

// ══ ruling 69 disposition 8 — voice_notes moves from session_end to provider_declared ═════════

test("D8-P11: voice_notes is PROVIDER-DECLARED — the ruling-66 no_booked_slot refusal is now a success", async () => {
  assert.equal(
    completionRuleFor({ deliveryMethod: "voice_notes", productShape: null }),
    "provider_declared",
    "ruling 69 disposition 8 amends ruling 66's table",
  );
  // A voice_notes booking carries no slot — D2 does not classify it as scheduled. Under ruling 66
  // that was a permanent `no_booked_slot` refusal; the reclassification is what makes it completable.
  const bk = await makeBooking({ serviceId: ids.voiceSvc, confirmedDaysAgo: 3, slotId: null });
  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.rule, "provider_declared");
  assert.equal(e.eligible, true, `expected eligible, got ${e.reason}`);

  const res = await api(`/api/provider/bookings/${bk}/complete`, owner.cookie, "POST", {});
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  assert.equal(JSON.parse(raw).rule, "provider_declared");
  assert.equal(await statusOf(bk), "completed");
  assert.equal((await earningCounts(bk)).held, 2, "the same held-earning machinery, no per-method fork");

  // …and no timer may fire it — provider_declared is the owner's to declare.
  const run = await runBookingAutoCompletion();
  assert.ok(!run.completedBookingIds.includes(bk));
});

// ══ property ════════════════════════════════════════════════════════════════════════════════

test("D8-P4: a PROPERTY booking completes once its checkout date has passed, and not before", async () => {
  const future = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10);
  const notYet = await makeBooking({ serviceId: ids.propSvc, confirmedDaysAgo: 1, details: { checkOut: future } });
  const eNotYet = await resolveCompletionEligibility(notYet);
  assert.equal(eNotYet.rule, "checkout_date");
  assert.equal(eNotYet.eligible, false);
  assert.equal(eNotYet.reason, "window_open");

  const past = new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10);
  const done = await makeBooking({ serviceId: ids.propSvc, confirmedDaysAgo: 4, details: { checkOut: past } });
  const run = await runBookingAutoCompletion();
  assert.ok(run.completedBookingIds.includes(done), `checked-out stay must complete; skipped=${JSON.stringify(run.skipped)}`);
  assert.equal(await statusOf(notYet), "confirmed", "a stay still in progress must NOT complete");
  assert.equal((await completionStamp(done))?.actor, "auto_complete_property");
});

test("D8-N6 (§13): a property booking with NO checkout date is skipped with a stated reason", async () => {
  const bk = await makeBooking({ serviceId: ids.propSvc, confirmedDaysAgo: 30, details: {} });
  const e = await resolveCompletionEligibility(bk);
  assert.equal(e.eligible, false);
  assert.equal(e.reason, "no_checkout_date");
  await runBookingAutoCompletion();
  assert.equal(await statusOf(bk), "confirmed");
});

// ══ F — owner-declared: session end, and the async dispute window ════════════════════════════

test("D8-P5: provider-confirmed CALL completion routes through the shared spine — one earning set, exactly once", async () => {
  const slot = await makeSlot({ serviceId: ids.callSvc, daysFromNow: -1, endTime: "10:00" });
  const bk = await makeBooking({ serviceId: ids.callSvc, confirmedDaysAgo: 3, slotId: slot });

  const res = await api(`/api/provider/bookings/${bk}/complete`, owner.cookie, "POST", {});
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body: any = JSON.parse(raw);
  assert.equal(body.completed, true);
  assert.equal(body.rule, "session_end");
  assert.equal(await statusOf(bk), "completed");
  const after = await earningCounts(bk);
  assert.equal(after.provider, 1);
  assert.equal(after.expert, 1);
  assert.equal(after.held, 2, "the SAME held-earning machinery as the in-person flip");
  assert.equal((await completionStamp(bk))?.actor, "provider_session_end");

  // A second click is a no-op, not a second earning set.
  const again = await api(`/api/provider/bookings/${bk}/complete`, owner.cookie, "POST", {});
  assert.equal(again.status, 409);
  assert.deepEqual(await earningCounts(bk), after);
});

test("D8-N7 (§13): a call whose session has NOT ended is refused, and one with no slot is refused too", async () => {
  const futureSlot = await makeSlot({ serviceId: ids.callSvc, daysFromNow: 3, endTime: "10:00" });
  const early = await makeBooking({ serviceId: ids.callSvc, confirmedDaysAgo: 1, slotId: futureSlot });
  const res = await api(`/api/provider/bookings/${early}/complete`, owner.cookie, "POST", {});
  assert.equal(res.status, 409);
  assert.equal((await res.json()).reason, "session_not_ended");
  assert.equal(await statusOf(early), "confirmed");
  assert.deepEqual(await earningCounts(early), { provider: 0, expert: 0, held: 0 });

  const noSlot = await makeBooking({ serviceId: ids.callSvc, confirmedDaysAgo: 30, slotId: null });
  const e = await resolveCompletionEligibility(noSlot);
  assert.equal(e.reason, "no_booked_slot", "no booked slot ⇒ no session end the server can know");
  const res2 = await api(`/api/provider/bookings/${noSlot}/complete`, owner.cookie, "POST", {});
  assert.equal(res2.status, 409);
  assert.equal(await statusOf(noSlot), "confirmed");
});

test("D8-P6: ASYNC is provider-declared, and the reused dispute window BLOCKS release inside it", async () => {
  const bk = await makeBooking({ serviceId: ids.asyncSvc, confirmedDaysAgo: 2 });
  const res = await api(`/api/provider/bookings/${bk}/complete`, owner.cookie, "POST", {});
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  assert.equal(JSON.parse(raw).rule, "provider_declared");
  assert.equal(await statusOf(bk), "completed");

  const held = await earningCounts(bk);
  assert.equal(held.held, 2, "earnings are born HELD — a declaration is not a payout");
  const avail = await db.execute(sql`SELECT available_at FROM provider_earnings WHERE source_id = ${bk}`);
  const availableAt = new Date((avail.rows[0] as any).available_at).getTime();
  assert.ok(availableAt > Date.now(), "availableAt must sit at the END of the existing dispute window");

  // The EXISTING release job must not release inside that window — no second constant, no fork.
  await storage.releaseMaturedEarnings();
  const stillHeld = await earningCounts(bk);
  assert.equal(stillHeld.held, 2, "the release job must NOT release inside the dispute window");
});

// ══ G — bundles: partial completion never pays out ═══════════════════════════════════════════

test("D8-N8: a PARTIALLY completed bundle does NOT complete and pays out NOTHING", async () => {
  const bk = await makeBooking({
    serviceId: ids.bundleSvc,
    confirmedDaysAgo: 2,
    details: { bundleComponents: [{ id: ids.compA, serviceName: "A" }, { id: ids.compB, serviceName: "B" }] },
  });

  const res = await api(`/api/provider/bookings/${bk}/complete`, owner.cookie, "POST", { componentServiceId: ids.compA });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body: any = JSON.parse(raw);
  assert.equal(body.recorded, true, "the component IS recorded");
  assert.equal(body.completed, false, "…but the booking is NOT complete");
  assert.equal(body.reason, "bundle_components_incomplete");
  assert.equal(await statusOf(bk), "confirmed");
  assert.deepEqual(await earningCounts(bk), { provider: 0, expert: 0, held: 0 }, "NO partial payout exists");

  // A component that is not in the purchase-time snapshot is rejected, never merged.
  const bogus = await api(`/api/provider/bookings/${bk}/complete`, owner.cookie, "POST", { componentServiceId: ids.pdfSvc });
  assert.equal(bogus.status, 400);
  assert.equal(await statusOf(bk), "confirmed");

  // The LAST component completes it — one flip, one earning set, through the same shared function.
  const finish = await recordBundleComponentCompletion({
    bookingId: bk,
    componentServiceId: ids.compB,
    actor: "provider_bundle_components",
  });
  assert.equal(finish.completed, true);
  assert.equal(await statusOf(bk), "completed");
  const earnings = await earningCounts(bk);
  assert.equal(earnings.provider, 1);
  assert.equal(earnings.expert, 1);
});

// ══ owner-rail access control ═══════════════════════════════════════════════════════════════

test("D8-N9: the owner rail is ownership-gated and refuses rules that are not the owner's to declare", async () => {
  const bk = await makeBooking({ serviceId: ids.asyncSvc, confirmedDaysAgo: 2 });

  const byStranger = await api(`/api/provider/bookings/${bk}/complete`, stranger.cookie, "POST", {});
  assert.equal(byStranger.status, 404, "a non-owner learns nothing — undifferentiated 404");
  assert.equal(await statusOf(bk), "confirmed");

  const anon = await api(`/api/provider/bookings/${bk}/complete`, undefined, "POST", {});
  assert.ok(anon.status === 401 || anon.status === 403, `unauthenticated must be rejected, got ${anon.status}`);
  assert.equal(await statusOf(bk), "confirmed");

  // Ruling 69 disposition 1: in-person is a TIMER rule, refused on the owner rail — as long as the
  // booking HAS a service date. (The undated case is the narrow fallback, proven by D8-N13; giving
  // this fixture a date is what keeps it a test of the REFUSAL rather than of the fallback.)
  const inPerson = await makeBooking({
    serviceId: ids.inPersonSvc,
    confirmedDaysAgo: 5,
    details: { scheduledDate: new Date(Date.now() - 2 * DAY).toISOString() },
  });
  const refused = await api(`/api/provider/bookings/${inPerson}/complete`, owner.cookie, "POST", {});
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).reason, "rule_not_owner_declared");
  assert.equal(await statusOf(inPerson), "confirmed");
});

test("D8-N10 (§18/§19): the deliverable delivery clock is NOT client-settable", async () => {
  // `deliverableUploadedAt` is the clock the undownloaded arm measures from — a backdatable value
  // would fire a completion, and mint a held earning, on a booking where nothing was delivered.
  // Layer 1 is the schema omit; layer 2 is the storage strip, proven here through the writer.
  await db.execute(sql`UPDATE provider_services SET deliverable_uploaded_at = NULL WHERE id = ${ids.pdfSvc}`);
  await storage.updateProviderService(ids.pdfSvc, {
    deliverableUploadedAt: new Date(Date.now() - 400 * DAY),
    description: "strip probe",
  } as any);
  const r = await db.execute(sql`SELECT deliverable_uploaded_at FROM provider_services WHERE id = ${ids.pdfSvc}`);
  assert.equal((r.rows[0] as any).deliverable_uploaded_at, null, "a client-supplied delivery clock must be stripped");

  // …and it IS derived when the deliverable value genuinely changes.
  await storage.updateProviderService(ids.pdfSvc, { serviceFile: `objstore:deliverables/${RUN}/x.pdf` } as any);
  const r2 = await db.execute(sql`SELECT deliverable_uploaded_at FROM provider_services WHERE id = ${ids.pdfSvc}`);
  assert.ok((r2.rows[0] as any).deliverable_uploaded_at, "a real deliverable write stamps the clock server-side");
  await db.execute(sql`UPDATE provider_services SET service_file = NULL, deliverable_uploaded_at = NULL WHERE id = ${ids.pdfSvc}`);
});
