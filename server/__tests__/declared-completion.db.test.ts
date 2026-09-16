/**
 * D-7 DECLARED COMPLETION — the declare, window-close, dispute and coordination rails against a real
 * database (punchlist D-36 / D-37 / D-38 / D-39, all option A; ledger
 * `2026-09-15-d36-d39-completion-declared`). Content of record:
 * `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` Part II §8-§15.
 *
 * WHAT THESE PROOFS ARE. Every rail is exercised through the SAME service functions the routes and
 * the nightly job call — `declareBookingCompletion`, `completeBooking` (via `runBookingAutoCompletion`),
 * `storage.updateServiceBookingStatus` with the routes' own from-state lists,
 * `runCoordinationWindowPass` — never a reconstruction of a handler. The PURE derivations beneath
 * them are proven with no database in `shared/__tests__/declared-completion-window.test.ts`.
 *
 * NEGATIVE SPACE (§18d): these say nothing about the traveler or seller SURFACES (brief §17 lane 4),
 * nothing about the HTTP gates (`providerId` / `traveler_id` / admin — the routes' own, unchanged),
 * and nothing about bundles, which still complete directly (D-32..D-35's lane). A booking is put
 * into `completion_declared` with a back-dated instant by fixtures where a window must already have
 * closed, because a real one takes `declaredCompletionWindowDays()` of wall-clock time.
 *
 * NO FEE LITERALS (§8): fixture amounts are arbitrary fixture money, asserted only for the PRESENCE
 * or ABSENCE of a mint and the ANCHOR of its `available_at`, never against a rate.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * No Stripe key and no network — the payment gate is a constant verifier.
 *
 * Run solo: npx tsx --test server/__tests__/declared-completion.db.test.ts
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
  COMPLETION_ALLOWED_FROM_STATUSES,
  completeBooking,
  declareBookingCompletion,
  findDeclaredWindowCandidates,
  resolveCompletionEligibility,
  timerOpensDeclaredWindow,
} from "../services/booking-completion.service";
import { runBookingAutoCompletion } from "../jobs/bookingAutoCompletion";
import { runCoordinationWindowPass } from "../services/coordination-completion.service";
import { declaredCompletionWindowDays, serviceDateCompletionDays } from "../config/completion-windows.config";
import { holdWindowDays } from "../config/earnings-hold.config";
import {
  COMPLETION_DECLARABLE_FROM_STATUSES,
  DECLARED_WINDOW_CLOSE_FROM_STATUSES,
  DISPUTABLE_FROM_STATUSES,
  DISPUTE_REJECT_FROM_STATUSES,
  TRAVELER_CONFIRMABLE_FROM_STATUSES,
} from "../utils/booking-from-states";
import {
  COORDINATION_FORWARD_ORDER,
  COORDINATION_WINDOW_CLOSE_FROM_STATUSES,
  coordinationRefundWindowGate,
  coordinatorMayAdvance,
  travelerMaySet,
} from "../utils/coordination-from-states";
import { COMPLETION_DECLARED_STATUS, COORDINATION_DISPUTED_STATUS, DAY_MS } from "@shared/declared-completion-window";
import { insertServiceBookingSchema } from "@shared/schema";

const verifyPaid = async () => true;

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `dcl-${RUN}-prov`,
  traveler: `dcl-${RUN}-trav`,
  asyncSvc: `dcl-${RUN}-async`,
  inPersonSvc: `dcl-${RUN}-ip`,
};
const createdBookingIds: string[] = [];
const createdCoordinationIds: string[] = [];

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
/** Source with COMMENTS STRIPPED (docs/OPERATING_PROCEDURE.md §3) — a pin over prose proves nothing. */
const code = (rel: string) =>
  src(rel).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

// ── Disposable-DB guard (mirrors acceptance-rails.db.test.ts; never defaults open) ───────────────
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
      `[declared-completion] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

async function seedBooking(opts: {
  serviceId: string;
  status: string;
  /** Days ago the seller declared; NULL = never declared. */
  declaredDaysAgo?: number | null;
  paymentIntentId?: string | null;
  details?: Record<string, unknown>;
}): Promise<string> {
  const id = `dcl-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  const declared =
    opts.declaredDaysAgo === undefined || opts.declaredDaysAgo === null
      ? null
      : new Date(Date.now() - opts.declaredDaysAgo * DAY_MS).toISOString();
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status,
                                  total_amount, platform_fee, provider_earnings,
                                  confirmed_at, completion_declared_at, booking_details,
                                  stripe_payment_intent_id)
    VALUES (${id}, ${opts.serviceId}, ${ids.traveler}, ${ids.provider}, ${opts.status},
            '100.00', '25.00', '75.00',
            NOW() - interval '30 days', ${declared}::timestamp, ${JSON.stringify(opts.details ?? {})}::jsonb,
            ${opts.paymentIntentId === undefined ? `pi_${RUN}_${id}` : opts.paymentIntentId})
  `);
  createdBookingIds.push(id);
  return id;
}

async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, completion_declared_at, completed_at, booking_details, booking_metadata
      FROM service_bookings WHERE id = ${id}
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

async function providerAvailableAt(bookingId: string): Promise<Date | null> {
  const r = await db.execute(sql`SELECT available_at FROM provider_earnings WHERE source_id = ${bookingId}`);
  const v = (r.rows[0] as any)?.available_at;
  return v ? new Date(v) : null;
}

async function seedCoordination(opts: { status: string; declaredDaysAgo?: number | null }): Promise<string> {
  const id = `dcl-${RUN}-co-${crypto.randomUUID().slice(0, 6)}`;
  const history: unknown[] = [{ status: "in_progress", timestamp: new Date(Date.now() - 40 * DAY_MS).toISOString() }];
  if (opts.declaredDaysAgo !== undefined && opts.declaredDaysAgo !== null) {
    history.push({
      status: COMPLETION_DECLARED_STATUS,
      timestamp: new Date(Date.now() - opts.declaredDaysAgo * DAY_MS).toISOString(),
      actor: "coordinator",
    });
  }
  await db.execute(sql`
    INSERT INTO coordination_states (id, user_id, experience_type, status, assigned_expert_id,
                                     state_history, fee_payment_status)
    VALUES (${id}, ${ids.traveler}, 'wedding', ${opts.status}, ${ids.provider},
            ${JSON.stringify(history)}::jsonb, 'paid')
  `);
  createdCoordinationIds.push(id);
  return id;
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`dcl-${RUN}-prov@t.test`}, 'Dcl', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`dcl-${RUN}-trav@t.test`}, 'Dcl', 'Traveler')
  `);
  // async_messaging ⇒ `provider_declared` — the declaration IS the condition.
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method)
    VALUES (${ids.asyncSvc}, ${ids.provider}, ${`Dcl async ${RUN}`}, 'fixture', '100.00', 'active',
            'approved', 'async_messaging')
  `);
  // in_person ⇒ `service_date_timer` — the place-anchored timer that now OPENS the window.
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method)
    VALUES (${ids.inPersonSvc}, ${ids.provider}, ${`Dcl ip ${RUN}`}, 'fixture', '100.00', 'active',
            'approved', 'in_person')
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM notifications WHERE related_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdCoordinationIds) {
    await db.execute(sql`DELETE FROM coordination_states WHERE id = ${id}`).catch(() => {});
  }
  for (const svc of [ids.asyncSvc, ids.inPersonSvc]) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${svc}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${svc}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// W1 — A DECLARATION FLIPS ONE ROW, STAMPS ITS INSTANT, AND MINTS NOTHING
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("W1: declare flips confirmed → completion_declared, stamps the instant, records provenance, mints NOTHING", async () => {
  const bk = await seedBooking({ serviceId: ids.asyncSvc, status: "confirmed" });

  const out = await declareBookingCompletion({ bookingId: bk, actor: "provider_declared", reason: "d8_owner:provider_declared" });
  assert.equal(out.declared, true, `expected a declaration, got ${out.reason}`);
  assert.equal(out.rule, "provider_declared");
  assert.equal(out.windowDays, declaredCompletionWindowDays(), "the window the traveler is told is the config's, from the server");

  const row = await readBooking(bk);
  assert.equal(row.status, COMPLETION_DECLARED_STATUS, "the WORD the row carries is 'declared', never 'completed' (brief §14)");
  assert.ok(row.completion_declared_at, "D-36: the declaration instant is stamped in the same guarded UPDATE");
  assert.equal(row.completed_at, null, "the money event has NOT happened");
  assert.equal(await mintedRowCount(bk), 0, "D-37: a declaration mints nothing — the window's close does");
  assert.equal(row.booking_details?.completionDeclaration?.actor, "provider_declared", "provenance under its OWN key");
  assert.equal(row.booking_details?.completion, undefined, "`completion` stays the COMPLETION's record — untouched by a declaration");
  // The deadline is DERIVED from the stamped instant, never stored on the row.
  const expected = new Date(new Date(row.completion_declared_at).getTime() + declaredCompletionWindowDays() * DAY_MS).toISOString();
  assert.equal(out.disputeBy, expected);
  assert.ok(!("dispute_deadline" in row) && !("completion_deadline" in row), "no stored deadline column");
});

test("W2 (§15): a DOUBLE declaration is exactly ONE flip — the loser sees lost_race, and nothing mints", async () => {
  const bk = await seedBooking({ serviceId: ids.asyncSvc, status: "confirmed" });
  const [a, b] = await Promise.all([
    declareBookingCompletion({ bookingId: bk, actor: "provider_declared" }),
    declareBookingCompletion({ bookingId: bk, actor: "provider_declared" }),
  ]);
  const winners = [a, b].filter((r) => r.declared);
  assert.equal(winners.length, 1, "exactly one caller may win the guarded flip");
  const loser = [a, b].find((r) => !r.declared)!;
  assert.ok(loser.reason === "lost_race" || loser.reason === "wrong_status", `loser reason: ${loser.reason}`);
  assert.equal((await readBooking(bk)).status, COMPLETION_DECLARED_STATUS);
  assert.equal(await mintedRowCount(bk), 0);

  // A THIRD, sequential attempt on the already-declared row is refused by the eligibility read
  // (wrong_status), never a second stamp: the first instant is the one the traveler was told.
  const before = (await readBooking(bk)).completion_declared_at;
  const again = await declareBookingCompletion({ bookingId: bk, actor: "provider_declared" });
  assert.equal(again.declared, false);
  assert.equal(again.reason, "wrong_status");
  assert.equal(String((await readBooking(bk)).completion_declared_at), String(before), "the instant is never re-stamped");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// W3 — THE WINDOW'S CLOSE MINTS ONCE, ANCHORED TO THE DECLARATION, AND IS IDEMPOTENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("W3 (D-37): the window's close completes ONCE, mints ONCE, anchors available_at to the DECLARATION, and a second pass is a no-op", async () => {
  const windowDays = declaredCompletionWindowDays();
  const declaredDaysAgo = windowDays + 1;
  const bk = await seedBooking({ serviceId: ids.asyncSvc, status: COMPLETION_DECLARED_STATUS, declaredDaysAgo });
  const declaredAt = new Date((await readBooking(bk)).completion_declared_at);

  assert.ok((await findDeclaredWindowCandidates()).includes(bk), "the detector must surface a window past its deadline");
  const e = await resolveCompletionEligibility(bk, new Date(), { declaredWindow: true });
  assert.equal(e.eligible, true, `expected eligible, got ${e.reason} ${JSON.stringify(e.evidence)}`);
  assert.equal((e.evidence as any).windowDays, windowDays, "N is the REUSED hold window, not a new constant");

  const first = await runBookingAutoCompletion(undefined, verifyPaid);
  assert.ok(first.windowClosedBookingIds.includes(bk), `must close; skipped=${JSON.stringify(first.declaredWindowSkipped)}`);
  assert.ok(first.completedBookingIds.includes(bk), "a window close IS a completion and is counted as one");

  const row = await readBooking(bk);
  assert.equal(row.status, "completed", "'completed' is said ONLY now — at the window's close");
  assert.ok(row.completed_at, "the money event keeps its own column");
  assert.equal(row.booking_details?.completion?.actor, "window_elapsed");
  assert.equal(row.booking_details?.completion?.evidence?.basis, "declared_window_elapsed");
  assert.equal(await mintedRowCount(bk), 2, "ONE platform_revenue + ONE provider_earnings — the mint lives at the close");

  // D-37, THE MONEY ROW: available_at = DECLARATION + hold, never `now` + hold (which would serve the
  // window twice). With the fixture's back-dated declaration, that anchor is already in the past.
  const availableAt = await providerAvailableAt(bk);
  assert.ok(availableAt, "the held earning exists");
  const expectedMs = declaredAt.getTime() + holdWindowDays("service_booking") * DAY_MS;
  assert.ok(
    Math.abs(availableAt!.getTime() - expectedMs) < 5_000,
    `available_at must be the declaration + hold (${new Date(expectedMs).toISOString()}), got ${availableAt!.toISOString()}`,
  );
  assert.ok(availableAt!.getTime() < Date.now(), "anchored to a past declaration ⇒ releasable now, not a doubled wait");

  // §15: the second pass finds nothing to do — one flip, one earning set, no compensation.
  const second = await runBookingAutoCompletion(undefined, verifyPaid);
  assert.ok(!second.windowClosedBookingIds.includes(bk), "the second pass must not re-complete it");
  assert.ok(!second.completedBookingIds.includes(bk));
  assert.equal(await mintedRowCount(bk), 2, "no second earning set");
});

test("W3b: an UNDECLARED completion keeps today's `now` anchor — the D-37 anchor applies only where a declaration exists", async () => {
  // A traveler-shaped completion out of `confirmed` (the confirm-completion rail's own storage call).
  const bk = await seedBooking({ serviceId: ids.asyncSvc, status: "confirmed" });
  const before = Date.now();
  const done = await storage.updateServiceBookingStatus(bk, "completed", undefined, TRAVELER_CONFIRMABLE_FROM_STATUSES);
  assert.ok(done, "confirmed is still confirmable");
  const availableAt = await providerAvailableAt(bk);
  assert.ok(availableAt);
  const expectedMs = before + holdWindowDays("service_booking") * DAY_MS;
  assert.ok(Math.abs(availableAt!.getTime() - expectedMs) < 10_000, "no declaration ⇒ availableAt = now + hold, verbatim");
});

test("W4 (§13): a window still OPEN is skipped with the reason and not completed — and it says when", async () => {
  const bk = await seedBooking({ serviceId: ids.asyncSvc, status: COMPLETION_DECLARED_STATUS, declaredDaysAgo: 0 });
  assert.ok(!(await findDeclaredWindowCandidates()).includes(bk), "the SQL floor already excludes a fresh declaration");
  const e = await resolveCompletionEligibility(bk, new Date(), { declaredWindow: true });
  assert.equal(e.eligible, false);
  assert.equal(e.reason, "window_open");
  assert.ok(e.eligibleAt, "the derived deadline is stated, so 'why not yet?' is answerable");
  const run = await runBookingAutoCompletion(undefined, verifyPaid);
  assert.ok(!run.completedBookingIds.includes(bk));
  assert.equal((await readBooking(bk)).status, COMPLETION_DECLARED_STATUS);
  assert.equal(await mintedRowCount(bk), 0);
});

test("W4b (§13): a declared row with NO declaration instant is refused, never guessed onto a clock", async () => {
  // The guarded writer cannot produce this shape (it stamps both in one UPDATE); a fixture can.
  const bk = await seedBooking({ serviceId: ids.asyncSvc, status: COMPLETION_DECLARED_STATUS, declaredDaysAgo: null });
  assert.ok(!(await findDeclaredWindowCandidates()).includes(bk));
  const e = await resolveCompletionEligibility(bk, new Date(), { declaredWindow: true });
  assert.equal(e.eligible, false);
  assert.equal(e.reason, "no_declaration_timestamp");
  const direct = await completeBooking({ bookingId: bk, actor: "window_elapsed" });
  assert.equal(direct.completed, false);
  assert.equal(await mintedRowCount(bk), 0);
});

test("W4c (§11 rule 6): the payment gate sits at the flip that MINTS — an unpaid declared window never completes", async () => {
  const bk = await seedBooking({
    serviceId: ids.asyncSvc,
    status: COMPLETION_DECLARED_STATUS,
    declaredDaysAgo: declaredCompletionWindowDays() + 2,
    paymentIntentId: null,
  });
  const run = await runBookingAutoCompletion(undefined, verifyPaid);
  assert.ok(!run.completedBookingIds.includes(bk));
  assert.ok((run.declaredWindowSkipped["no_payment_on_record"] ?? 0) >= 1, JSON.stringify(run.declaredWindowSkipped));
  assert.equal((await readBooking(bk)).status, COMPLETION_DECLARED_STATUS);
  assert.equal(await mintedRowCount(bk), 0);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// W5 — A DISPUTE INSIDE THE WINDOW STOPS THE TIMER, AND ZERO HELD ROWS IS NOT "CLEARED"
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("W5 (D-38): a dispute during the window is the SAME `disputed` row, flags ZERO earnings, and the timer never completes it", async () => {
  const bk = await seedBooking({
    serviceId: ids.asyncSvc,
    status: COMPLETION_DECLARED_STATUS,
    declaredDaysAgo: declaredCompletionWindowDays() - 1,
  });
  assert.ok(DISPUTABLE_FROM_STATUSES.includes(COMPLETION_DECLARED_STATUS), "the declared state joins the ONE disputable list");

  // Exactly what `POST /api/bookings/:id/dispute` does, in order: the earnings flag, then the guarded flip.
  const flagged = await storage.setBookingEarningsDispute(bk, true);
  assert.equal(flagged, 0, "NOTHING has minted, so zero rows are held — and zero must never be read as 'cleared'");
  const disputed = await storage.updateServiceBookingStatus(bk, "disputed", "not what was sold", DISPUTABLE_FROM_STATUSES);
  assert.ok(disputed, "the declared row is disputable");
  assert.equal((await readBooking(bk)).status, "disputed");

  // Push the declaration past the deadline and let the timer try: THE BLOCK IS THE STATUS ITSELF.
  await db.execute(sql`
    UPDATE service_bookings SET completion_declared_at = NOW() - ((${declaredCompletionWindowDays() + 3}) || ' days')::interval
    WHERE id = ${bk}
  `);
  assert.ok(!(await findDeclaredWindowCandidates()).includes(bk), "a disputed row is not a candidate");
  const run = await runBookingAutoCompletion(undefined, verifyPaid);
  assert.ok(!run.completedBookingIds.includes(bk));
  const direct = await completeBooking({ bookingId: bk, actor: "window_elapsed" });
  assert.equal(direct.completed, false, "and the guarded flip matches zero rows even when called directly");
  assert.equal((await readBooking(bk)).status, "disputed");
  assert.equal(await mintedRowCount(bk), 0, "nothing mints on a disputed row — the booking never reaches `completed`");

  // The EXISTING admin reject is the resolution: disputed → completed (mints, anchored to the declaration).
  assert.deepEqual([...DISPUTE_REJECT_FROM_STATUSES], ["disputed"]);
  const restored = await storage.updateServiceBookingStatus(bk, "completed", undefined, DISPUTE_REJECT_FROM_STATUSES);
  assert.ok(restored);
  assert.equal(await mintedRowCount(bk), 2, "the reject's completion is the ONE mint, as today");
});

test("W6: the window-close arm never completes a `disputed` or an `awaiting_acceptance` row — even one wearing a declaration instant", async () => {
  const past = declaredCompletionWindowDays() + 4;
  const disputed = await seedBooking({ serviceId: ids.asyncSvc, status: "disputed", declaredDaysAgo: past });
  const awaiting = await seedBooking({ serviceId: ids.asyncSvc, status: "awaiting_acceptance", declaredDaysAgo: past });
  const confirmed = await seedBooking({ serviceId: ids.asyncSvc, status: "confirmed", declaredDaysAgo: past });
  const candidates = await findDeclaredWindowCandidates();
  for (const id of [disputed, awaiting, confirmed]) {
    assert.ok(!candidates.includes(id), `${id} must not be a window-close candidate`);
  }
  const run = await runBookingAutoCompletion(undefined, verifyPaid);
  for (const id of [disputed, awaiting, confirmed]) {
    assert.ok(!run.completedBookingIds.includes(id));
    assert.equal(await mintedRowCount(id), 0);
  }
  assert.equal((await readBooking(disputed)).status, "disputed");
  assert.equal((await readBooking(awaiting)).status, "awaiting_acceptance");
  // The D-24 invariant, unchanged, and the new lists beside it — each ONE entry wide.
  assert.deepEqual([...COMPLETION_ALLOWED_FROM_STATUSES], ["confirmed"]);
  assert.deepEqual([...COMPLETION_DECLARABLE_FROM_STATUSES], ["confirmed"]);
  assert.deepEqual([...DECLARED_WINDOW_CLOSE_FROM_STATUSES], [COMPLETION_DECLARED_STATUS]);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// W7 — THE PLACE-ANCHORED TIMER OPENS THE WINDOW; IT DOES NOT END IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("W7: an in-person booking past its service date is DECLARED by the timer (no mint), and closes N days later", async () => {
  assert.equal(timerOpensDeclaredWindow("service_date_timer"), true);
  assert.equal(timerOpensDeclaredWindow("checkout_date"), false, "a property stay still completes directly");
  const windowDays = serviceDateCompletionDays();
  const past = new Date(Date.now() - (windowDays + 2) * DAY_MS).toISOString();
  const bk = await seedBooking({ serviceId: ids.inPersonSvc, status: "confirmed", details: { scheduledDate: past } });

  const first = await runBookingAutoCompletion(undefined, verifyPaid);
  assert.ok(first.declaredBookingIds.includes(bk), `the timer must DECLARE; skipped=${JSON.stringify(first.skipped)}`);
  assert.ok(!first.completedBookingIds.includes(bk), "…and must NOT complete");
  let row = await readBooking(bk);
  assert.equal(row.status, COMPLETION_DECLARED_STATUS);
  assert.equal(row.booking_details?.completionDeclaration?.actor, "auto_complete_service_date");
  assert.equal(row.booking_details?.completionDeclaration?.rule, "service_date_timer");
  assert.equal(await mintedRowCount(bk), 0, "opening the window mints nothing");

  // Same pass again: the declared row is not re-declared and its window is still open.
  const again = await runBookingAutoCompletion(undefined, verifyPaid);
  assert.ok(!again.declaredBookingIds.includes(bk));
  assert.ok(!again.completedBookingIds.includes(bk));

  // Let the window elapse (back-date the declaration) and the SAME job closes it, minting once.
  await db.execute(sql`
    UPDATE service_bookings SET completion_declared_at = NOW() - ((${declaredCompletionWindowDays() + 1}) || ' days')::interval
    WHERE id = ${bk}
  `);
  const close = await runBookingAutoCompletion(undefined, verifyPaid);
  assert.ok(close.windowClosedBookingIds.includes(bk), JSON.stringify(close.declaredWindowSkipped));
  row = await readBooking(bk);
  assert.equal(row.status, "completed");
  assert.equal(row.booking_details?.completion?.actor, "window_elapsed");
  assert.equal(row.booking_details?.completion?.evidence?.declaration?.rule, "service_date_timer", "the close records WHICH declaration it answered");
  assert.equal(await mintedRowCount(bk), 2);
});

test("W8: the traveler's own confirm short-circuits the window — completion_declared is traveler-confirmable", async () => {
  assert.deepEqual([...TRAVELER_CONFIRMABLE_FROM_STATUSES], ["confirmed", COMPLETION_DECLARED_STATUS]);
  const bk = await seedBooking({ serviceId: ids.asyncSvc, status: COMPLETION_DECLARED_STATUS, declaredDaysAgo: 1 });
  const declaredAt = new Date((await readBooking(bk)).completion_declared_at);
  const done = await storage.updateServiceBookingStatus(bk, "completed", undefined, TRAVELER_CONFIRMABLE_FROM_STATUSES);
  assert.ok(done, "the payer may confirm a declared booking");
  assert.equal(await mintedRowCount(bk), 2);
  // Anchored to the declaration here too — one anchor rule, whoever completes.
  const availableAt = await providerAvailableAt(bk);
  const expectedMs = declaredAt.getTime() + holdWindowDays("service_booking") * DAY_MS;
  assert.ok(Math.abs(availableAt!.getTime() - expectedMs) < 5_000);
  // …and the traveler's early release still clears it, exactly as before.
  const released = await storage.releaseEarningsForBooking(bk);
  assert.ok(released >= 1, "the traveler's confirm is still the early release");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// W9 — COORDINATION: THE COORDINATOR DECLARES, THE WINDOW CLOSES, THE REFUND IS WHAT IT GATES
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("W9 (D-39): the coordinator may declare but may not say 'completed'; the traveler may only object during the window", () => {
  assert.ok(COORDINATION_FORWARD_ORDER.indexOf(COMPLETION_DECLARED_STATUS) < COORDINATION_FORWARD_ORDER.indexOf("completed"));
  assert.deepEqual(coordinatorMayAdvance("in_progress", COMPLETION_DECLARED_STATUS), { ok: true });
  assert.deepEqual(coordinatorMayAdvance("in_progress", "completed"), { ok: false, reason: "window_closes_engagement" });
  assert.deepEqual(coordinatorMayAdvance(COMPLETION_DECLARED_STATUS, "completed"), { ok: false, reason: "window_closes_engagement" });
  assert.deepEqual(coordinatorMayAdvance("in_progress", "intake"), { ok: false, reason: "not_forward" });
  assert.deepEqual(coordinatorMayAdvance("in_progress", "in_progress"), { ok: false, reason: "not_forward" });
  assert.deepEqual(coordinatorMayAdvance("in_progress", "nonsense"), { ok: false, reason: "not_forward" });
  // F3, answered: the traveler's ONE move.
  assert.equal(travelerMaySet(COMPLETION_DECLARED_STATUS, COORDINATION_DISPUTED_STATUS), true);
  assert.equal(travelerMaySet("intake", "completed"), false, "a traveler may no longer complete a fresh intake");
  assert.equal(travelerMaySet("in_progress", "intake"), false, "nor walk an engagement backwards");
  assert.equal(travelerMaySet("in_progress", COORDINATION_DISPUTED_STATUS), false, "nor dispute what nobody declared");
  assert.deepEqual([...COORDINATION_WINDOW_CLOSE_FROM_STATUSES], [COMPLETION_DECLARED_STATUS]);
});

test("W9b (D-39): the window gates the admin REFUND only — no window for the undeclared, open until the deadline, disputed stays open, closed after", () => {
  const now = new Date("2026-09-20T00:00:00.000Z");
  const w = declaredCompletionWindowDays();
  assert.equal(coordinationRefundWindowGate({ status: "completed", declaredAt: null, windowDays: w, now }), "no_window", "legacy direct completion: refundable as before");
  assert.equal(coordinationRefundWindowGate({ status: "in_progress", declaredAt: null, windowDays: w, now }), "no_window");
  const fresh = new Date(now.getTime() - 1);
  assert.equal(coordinationRefundWindowGate({ status: COMPLETION_DECLARED_STATUS, declaredAt: fresh, windowDays: w, now }), "open");
  const stale = new Date(now.getTime() - (w + 1) * DAY_MS);
  assert.equal(coordinationRefundWindowGate({ status: "completed", declaredAt: stale, windowDays: w, now }), "closed");
  assert.equal(coordinationRefundWindowGate({ status: COORDINATION_DISPUTED_STATUS, declaredAt: stale, windowDays: w, now }), "disputed", "an objection keeps the refund open regardless of the clock");
});

test("W9c (D-39): the nightly pass closes a declared coordination window once, skips a disputed or open one, and MINTS NOTHING", async () => {
  const w = declaredCompletionWindowDays();
  const elapsed = await seedCoordination({ status: COMPLETION_DECLARED_STATUS, declaredDaysAgo: w + 1 });
  const open = await seedCoordination({ status: COMPLETION_DECLARED_STATUS, declaredDaysAgo: 0 });
  const disputed = await seedCoordination({ status: COORDINATION_DISPUTED_STATUS, declaredDaysAgo: w + 1 });
  const undated = await seedCoordination({ status: COMPLETION_DECLARED_STATUS, declaredDaysAgo: null });

  const first = await runCoordinationWindowPass();
  assert.ok(first.completedIds.includes(elapsed), JSON.stringify(first.skipped));
  assert.ok(!first.completedIds.includes(open));
  assert.ok(!first.completedIds.includes(disputed), "a disputed engagement is not even scanned");
  assert.ok(!first.completedIds.includes(undated));
  assert.ok((first.skipped["window_open"] ?? 0) >= 1);
  assert.ok((first.skipped["no_declaration_timestamp"] ?? 0) >= 1, "§13: an undatable window is skipped with its reason");

  const rows = await db.execute(sql`
    SELECT id, status, completed_at, state_history FROM coordination_states WHERE id IN (${elapsed}, ${open}, ${disputed}, ${undated})
  `);
  const byId = new Map((rows.rows as any[]).map((r) => [r.id, r]));
  assert.equal(byId.get(elapsed).status, "completed");
  assert.ok(byId.get(elapsed).completed_at, "completed_at stamped by the ONE writer, on the transition into completed");
  const last = (byId.get(elapsed).state_history as any[]).at(-1);
  assert.equal(last.status, "completed");
  assert.equal(last.actor, "window_elapsed", "the history says WHO said completed — the window, not a person");
  assert.equal(byId.get(open).status, COMPLETION_DECLARED_STATUS);
  assert.equal(byId.get(disputed).status, COORDINATION_DISPUTED_STATUS);
  assert.equal(byId.get(undated).status, COMPLETION_DECLARED_STATUS);

  // Idempotent: a second pass finds nothing on the closed one and appends nothing.
  const second = await runCoordinationWindowPass();
  assert.ok(!second.completedIds.includes(elapsed));
  const after = await db.execute(sql`SELECT state_history FROM coordination_states WHERE id = ${elapsed}`);
  assert.equal((after.rows[0] as any).state_history.length, (byId.get(elapsed).state_history as any[]).length, "no second history entry");

  // NO COORDINATOR EARNING, EVER: not one ledger row references any of these engagements.
  const earn = await db.execute(sql`
    SELECT (SELECT COUNT(*) FROM expert_earnings WHERE reference_id IN (${elapsed}, ${open}, ${disputed}, ${undated}))
         + (SELECT COUNT(*) FROM provider_earnings WHERE source_id IN (${elapsed}, ${open}, ${disputed}, ${undated})) AS n
  `);
  assert.equal(Number((earn.rows[0] as any).n), 0, "completing an engagement moves no money (D-39, brief §9)");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// W10 — STATIC PINS: one author per decision, and the privileged column is not client-settable
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("W10 (§19): completion_declared_at is stripped at every birth rail — schema omit and both storage writers", () => {
  const parsed = insertServiceBookingSchema.safeParse({
    serviceId: "svc",
    travelerId: "t",
    providerId: "p",
    totalAmount: "100.00",
    completionDeclaredAt: new Date(),
  });
  assert.ok(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.flatten()));
  assert.ok(!("completionDeclaredAt" in (parsed.data as Record<string, unknown>)), "layer 1: the .omit() strips it");
  const storageCode = code("server/storage.ts");
  assert.equal(
    (storageCode.match(/completionDeclaredAt:\s*_(clientSupplied)?[cC]ompletionDeclaredAt/g) ?? []).length,
    2,
    "layer 2: BOTH createServiceBooking and createServiceBookingAtomic destructure it away",
  );
  assert.match(storageCode, /availableAtFor\('service_booking',\s*declaredAnchor\)/, "D-37: the mint anchors on the declaration");
});

test("W10b (§18 rule 1): the owner rail DECLARES and no longer completes; the coordination order has ONE home; routes.ts declares none", () => {
  const routes = code("server/routes.ts");
  assert.match(routes, /declareBookingCompletion\(\{/, "the owner rail calls the declaration");
  assert.ok(!/\bcompleteBooking\(\{/.test(routes), "…and calls completeBooking nowhere — the window's close is the only completer of a declared booking");
  assert.ok(!/const FORWARD_ORDER = \[/.test(routes), "the inline ordering list is gone from the monolith");
  assert.match(routes, /coordinatorMayAdvance\(fromStatus, String\(status\)\)/);
  assert.match(routes, /travelerMaySet\(fromStatus, status\)/, "F3: the traveler arm has its rule");
  assert.match(routes, /coordinationRefundWindowGate\(\{/, "the refund route reads the ONE gate");
  const order = code("server/utils/coordination-from-states.ts");
  assert.equal((order.match(/COORDINATION_FORWARD_ORDER: readonly string\[\] = \[/g) ?? []).length, 1);
  // The job's two minting passes share ONE payment gate.
  const job = code("server/jobs/bookingAutoCompletion.ts");
  assert.equal((job.match(/await passesPaymentGate\(\{/g) ?? []).length, 2, "one gate, two callers — never a second copy");
  assert.equal((job.match(/actor: "window_elapsed"/g) ?? []).length, 1);
});
