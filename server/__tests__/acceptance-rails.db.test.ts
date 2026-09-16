/**
 * D-6 ACCEPTANCE RAILS — the accept, revision and deliver rails against a real database.
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-24 / D-25 / D-26 / D-40, all option A; ledger
 * `2026-09-15-d24-d26-acceptance-columns`). Content of record:
 * `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` Part I §3-§7 and Part II §10.
 *
 * WHAT THESE PROOFS ARE. Every rail is exercised through the SAME service functions the routes
 * call — never a reconstruction of a handler's logic — so a proof that passes says something about
 * production. The PURE derivations beneath them (the mode, the derived deadline, the allowance
 * arithmetic, the file fallback) are proven with no database in
 * `shared/__tests__/acceptance-window.test.ts`; neither suite stands in for the other.
 *
 * NEGATIVE SPACE, stated because green means green-within-stated-bounds (§18d):
 *  · These prove the RAILS. They say nothing about the ESCALATION of an unanswered window to admin
 *    review, which is D-27's lane and which this lane writes none of — `artifact_timer`,
 *    `TIMER_DRIVEN_COMPLETION_RULES` and `server/jobs/bookingAutoCompletion.ts` are untouched, so
 *    an artifact booking still auto-completes under the old timer until D-27 ships. That is the
 *    known, sequenced gap, and `R9` pins that this lane did not close it by accident.
 *  · They say nothing about the traveler or seller SURFACES (lane 4), and nothing about the refund
 *    on a rejected artifact, which brief §5 leaves explicitly unruled.
 *  · A booking is put into `awaiting_acceptance` by these fixtures directly, because in production
 *    nothing does yet — that is the same sequenced gap, stated rather than papered over.
 *
 * NO FEE LITERALS (§8): the fixture amounts are arbitrary fixture money, asserted only for the
 * PRESENCE or ABSENCE of a mint, never against a rate.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * No Stripe key and no network.
 *
 * Run solo: npx tsx --test server/__tests__/acceptance-rails.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

import { db } from "../db";
import {
  acceptDeliverable,
  countRevisionRequests,
  deliverArtifact,
  describeAcceptance,
  requestRevision,
  resolveBookingDeliverable,
} from "../services/booking-acceptance.service";
import { acceptanceWindowDays } from "../config/completion-windows.config";
import {
  ACCEPTANCE_ESCALATION_FROM_STATUSES,
  ACCEPTANCE_PROMPT_FROM_STATUSES,
  ARTIFACT_REDELIVERY_REOPEN_FROM_STATUSES,
  DISPUTABLE_FROM_STATUSES,
} from "../utils/booking-from-states";
import { completionRuleFor, TIMER_DRIVEN_COMPLETION_RULES } from "@shared/service-fundamentals";
// D-27 (ledger `2026-09-15-d27-artifact-timer-acceptance-prompt`): the acceptance-prompt arm and
// the whole nightly job, both driven here so a proof says something about production.
import {
  ACCEPTANCE_WINDOW_ELAPSED_REASON,
  runArtifactAcceptancePass,
  type PaymentVerifier,
} from "../services/artifact-acceptance-timer.service";
import { runBookingAutoCompletion } from "../jobs/bookingAutoCompletion";
import { COMPLETION_ALLOWED_FROM_STATUSES, timerActorFor } from "../services/booking-completion.service";

/** Every fixture here models a PAID booking; the gate is proven separately, never via Stripe. */
const verifyPaid: PaymentVerifier = async () => true;

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `acc-${RUN}-prov`,
  traveler: `acc-${RUN}-trav`,
  stranger: `acc-${RUN}-str`,
  pdfSvc: `acc-${RUN}-pdf`,
  pdfNoRev: `acc-${RUN}-pdf0`,
  hybridSvc: `acc-${RUN}-hyb`,
  hybridBare: `acc-${RUN}-hyb0`,
  inPersonSvc: `acc-${RUN}-ip`,
};
const createdBookingIds: string[] = [];

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const src = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
/**
 * Source with COMMENTS STRIPPED — the `docs/OPERATING_PROCEDURE.md` §3 convention. A pin over raw
 * text would be satisfied (or broken) by prose, and every one of these files documents the very
 * names the pin is checking for.
 */
const code = (rel: string) =>
  src(rel).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

// ── Disposable-DB guard (mirrors from-state-guards.db.test.ts; never defaults open) ──────────────
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
      `[acceptance-rails] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

async function seedBooking(opts: {
  serviceId: string;
  status: string;
  deliveredAt?: Date | null;
  deliverableFile?: string | null;
  /** D-27: the acceptance PROMPT carries the payment gate, so an arm fixture needs a PI. */
  paymentIntentId?: string | null;
  confirmedDaysAgo?: number;
}): Promise<string> {
  const id = `acc-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  const confirmedDaysAgo = opts.confirmedDaysAgo ?? 2;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status,
                                  total_amount, platform_fee, provider_earnings,
                                  confirmed_at, delivered_at, deliverable_file,
                                  stripe_payment_intent_id)
    VALUES (${id}, ${opts.serviceId}, ${ids.traveler}, ${ids.provider}, ${opts.status},
            '100.00', '25.00', '75.00',
            NOW() - (${confirmedDaysAgo} || ' days')::interval,
            ${opts.deliveredAt ?? null}, ${opts.deliverableFile ?? null},
            ${opts.paymentIntentId === undefined ? `pi_${RUN}_${id}` : opts.paymentIntentId})
  `);
  createdBookingIds.push(id);
  return id;
}

async function readBooking(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, accepted_at, completed_at, delivered_at, deliverable_file,
           booking_details, booking_metadata
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

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`acc-${RUN}-prov@t.test`}, 'Acc', 'Provider', 'service_provider')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`acc-${RUN}-trav@t.test`}, 'Acc', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.stranger}, ${`acc-${RUN}-str@t.test`}, 'Acc', 'Stranger')
  `);
  // A pdf listing that INCLUDES two revisions — the D-6 `gates_completion` case.
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method, revisions_included, service_file)
    VALUES (${ids.pdfSvc}, ${ids.provider}, ${`Acc pdf ${RUN}`}, 'fixture', '100.00', 'active',
            'approved', 'pdf', 2, 'objstore:listing/acc-listing.pdf')
  `);
  // The same shape with NO revision allowance — §13's "no affordance at all".
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method, revisions_included)
    VALUES (${ids.pdfNoRev}, ${ids.provider}, ${`Acc pdf0 ${RUN}`}, 'fixture', '100.00', 'active',
            'approved', 'pdf', 0)
  `);
  // D-40: a hybrid that DECLARED an artifact — `records_only`.
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method, revisions_included,
                                   declared_artifact_deliverable)
    VALUES (${ids.hybridSvc}, ${ids.provider}, ${`Acc hybrid ${RUN}`}, 'fixture', '100.00', 'active',
            'approved', 'hybrid', 1, 'Edited photo set')
  `);
  // A hybrid that declared NOTHING — pure D-7, no affordance.
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method, revisions_included)
    VALUES (${ids.hybridBare}, ${ids.provider}, ${`Acc hybrid0 ${RUN}`}, 'fixture', '100.00', 'active',
            'approved', 'hybrid', 1)
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status,
                                   approval_status, delivery_method, revisions_included)
    VALUES (${ids.inPersonSvc}, ${ids.provider}, ${`Acc ip ${RUN}`}, 'fixture', '100.00', 'active',
            'approved', 'in_person', 3)
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM booking_revision_requests WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM notifications WHERE data->>'bookingId' = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const svc of [ids.pdfSvc, ids.pdfNoRev, ids.hybridSvc, ids.hybridBare, ids.inPersonSvc]) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${svc}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${svc}`).catch(() => {});
  }
  await db
    .execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler}, ${ids.stranger})`)
    .catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R1 — ACCEPT IS ONE FLIP UNDER A DOUBLE CALL, AND IT MINTS EXACTLY ONE EARNING SET
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R1: two concurrent acceptances produce ONE completion, ONE accepted_at and ONE mint", async () => {
  const bk = await seedBooking({ serviceId: ids.pdfSvc, status: "awaiting_acceptance", deliveredAt: new Date() });

  // §15: the transition IS the guard. A double-click is the canonical case, so it is raced rather
  // than sequenced — a check-then-update would let both through here.
  const [a, b] = await Promise.all([
    acceptDeliverable({ bookingId: bk, actorUserId: ids.traveler }),
    acceptDeliverable({ bookingId: bk, actorUserId: ids.traveler }),
  ]);
  const winners = [a, b].filter((r) => "ok" in r && r.ok);
  assert.equal(winners.length, 1, "exactly one caller may win the acceptance");

  const row = await readBooking(bk);
  assert.equal(row.status, "completed", "acceptance is what completes an artifact booking");
  assert.ok(row.accepted_at, "D-24: the answer that caused the completion is recorded");
  assert.ok(row.completed_at, "and the money event keeps its own column");
  assert.equal(
    await mintedRowCount(bk),
    2,
    "ONE platform_revenue + ONE provider_earnings — the loser mints nothing (§18 rule 1: one path)",
  );

  // A third, later attempt is refused and changes nothing — idempotent by construction.
  const again = await acceptDeliverable({ bookingId: bk, actorUserId: ids.traveler });
  assert.equal("ok" in again && again.ok, false);
  assert.equal(await mintedRowCount(bk), 2, "a late re-accept never mints a second set");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R2 — THE ACTOR COMES FROM THE SESSION (§14), AND A REFUSAL DOES NOT SAY WHICH FACT REFUSED IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R2: a non-traveler cannot accept or request a revision, and gets the SAME 404 as a missing booking", async () => {
  const bk = await seedBooking({ serviceId: ids.pdfSvc, status: "awaiting_acceptance", deliveredAt: new Date() });

  const byStranger = await acceptDeliverable({ bookingId: bk, actorUserId: ids.stranger });
  assert.equal("ok" in byStranger && byStranger.ok, false);
  assert.equal((byStranger as any).status, 404, "not-yours and no-such-booking are ONE answer (LD 40 posture)");
  const byProvider = await acceptDeliverable({ bookingId: bk, actorUserId: ids.provider });
  assert.equal((byProvider as any).status, 404, "the earner may never accept on the traveler's behalf");

  const revByStranger = await requestRevision({ bookingId: bk, actorUserId: ids.stranger, note: "x" });
  assert.equal((revByStranger as any).status, 404);

  assert.equal((await readBooking(bk)).status, "awaiting_acceptance", "the row is untouched");
  assert.equal(await countRevisionRequests(bk), 0);
  assert.equal(await mintedRowCount(bk), 0, "and nothing minted");

  // The provider's own rail is gated the other way round.
  const deliverByTraveler = await deliverArtifact({
    bookingId: bk,
    actorUserId: ids.traveler,
    fileValue: "objstore:x.pdf",
  });
  assert.equal((deliverByTraveler as any).status, 404, "a traveler may not deliver to themselves");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R3 — A REVISION BEYOND THE LISTING'S ALLOWANCE IS REFUSED WITH THE NUMBER, AND IS NEVER A DISPUTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R3: revisions count down from the LISTING's revisions_included, and the refusal states it", async () => {
  const bk = await seedBooking({ serviceId: ids.pdfSvc, status: "awaiting_acceptance", deliveredAt: new Date() });

  const first = await requestRevision({ bookingId: bk, actorUserId: ids.traveler, note: "Please add day 3" });
  assert.equal("ok" in first && first.ok, true);
  assert.equal((first as any).position, 1, "positions are derived server-side from the existing rows");
  assert.equal((first as any).allowance.remaining, 1);
  assert.equal((await readBooking(bk)).status, "revision_requested");

  // The seller re-delivers, which re-opens the window; then the second (and last) revision.
  await deliverArtifact({ bookingId: bk, actorUserId: ids.provider, fileValue: "objstore:bk/v2.pdf" });
  const second = await requestRevision({ bookingId: bk, actorUserId: ids.traveler, note: "One more thing" });
  assert.equal("ok" in second && second.ok, true);
  assert.equal((second as any).position, 2);
  assert.equal((second as any).allowance.remaining, 0);

  await deliverArtifact({ bookingId: bk, actorUserId: ids.provider, fileValue: "objstore:bk/v3.pdf" });
  const third = await requestRevision({ bookingId: bk, actorUserId: ids.traveler, note: "And another" });
  assert.equal("ok" in third && third.ok, false);
  assert.equal((third as any).code, "revision_allowance_exhausted");
  assert.match(
    (third as any).message,
    /2 revisions/,
    "§13: the refusal STATES the number rather than a bare no",
  );
  assert.equal((third as any).allowance.included, 2);
  assert.equal((third as any).allowance.used, 2);

  assert.equal(await countRevisionRequests(bk), 2, "the refused request writes NO row");
  // A revision is an entitlement, never a claim that something went wrong: nothing about this
  // booking has become a dispute, and no earning was flagged.
  assert.equal((await readBooking(bk)).status, "awaiting_acceptance");
  const disputed = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM service_bookings WHERE id = ${bk} AND status = 'disputed'`,
  );
  assert.equal(Number((disputed.rows[0] as any).n), 0, "a revision request is NEVER rendered as a dispute");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R4 — A LISTING THAT INCLUDES NO REVISIONS OFFERS NONE, AND SAYS SO (not "0 remaining")
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R4: revisions_included 0 refuses with `revisions_not_offered` and exposes NO allowance data", async () => {
  const bk = await seedBooking({ serviceId: ids.pdfNoRev, status: "awaiting_acceptance", deliveredAt: new Date() });

  const refused = await requestRevision({ bookingId: bk, actorUserId: ids.traveler, note: "please" });
  assert.equal("ok" in refused && refused.ok, false);
  assert.equal((refused as any).code, "revisions_not_offered");
  assert.equal((refused as any).allowance.offered, false);
  assert.equal(await countRevisionRequests(bk), 0);

  // §13 in the read-out: no revision fields at all, rather than a zero beside a button that refuses.
  const readout = await describeAcceptance(bk);
  assert.ok(readout, "the booking still takes acceptance — that is a different question");
  assert.equal(readout!.mode, "gates_completion");
  assert.equal("revisionsIncluded" in readout!, false, "no allowance data is emitted at all");
  assert.equal("revisionsRemaining" in readout!, false);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R5 — RE-DELIVERY RESOLVES THE OPEN ROW AND RE-OPENS THE WINDOW
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R5: re-delivery stamps delivered_at, resolves the open revision and flips back to awaiting_acceptance", async () => {
  const bk = await seedBooking({ serviceId: ids.pdfSvc, status: "awaiting_acceptance", deliveredAt: new Date("2026-01-01T00:00:00Z") });
  await requestRevision({ bookingId: bk, actorUserId: ids.traveler, note: "fix the map" });
  assert.equal((await readBooking(bk)).status, "revision_requested");

  const delivered = await deliverArtifact({
    bookingId: bk,
    actorUserId: ids.provider,
    fileValue: "objstore:bk/revised.pdf",
  });
  assert.equal("ok" in delivered && delivered.ok, true);
  assert.equal((delivered as any).resolvedRevisions, 1, "D-25: the open row is ANSWERED, never deleted");
  assert.equal((delivered as any).reopenedAcceptance, true);

  const row = await readBooking(bk);
  assert.equal(row.status, "awaiting_acceptance");
  assert.equal(row.deliverable_file, "objstore:bk/revised.pdf", "D-26: the PER-BOOKING pointer, not the listing's");
  assert.ok(
    new Date(row.delivered_at).getTime() > Date.parse("2026-01-01T00:00:00Z"),
    "a re-delivery MOVES the delivery instant, because the acceptance window restarts with the document it measures",
  );

  const rows = await db.execute(
    sql`SELECT "position", note, resolved_at FROM booking_revision_requests WHERE booking_id = ${bk} ORDER BY "position"`,
  );
  assert.equal(rows.rows.length, 1);
  assert.equal((rows.rows[0] as any).note, "fix the map", "the traveler's WORDS are the evidence a counter could not carry");
  assert.ok((rows.rows[0] as any).resolved_at, "resolved_at NULL = still open; this one is answered");

  // The LISTING's own file is untouched — the whole reason D-26 exists.
  const listing = await db.execute(sql`SELECT service_file FROM provider_services WHERE id = ${ids.pdfSvc}`);
  assert.equal(
    (listing.rows[0] as any).service_file,
    "objstore:listing/acc-listing.pdf",
    "a revision for ONE traveler must never rewrite the file every other buyer downloads",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R6 — THE PER-BOOKING POINTER WITH THE LISTING FILE AS THE HONEST FALLBACK, AND IT SAYS WHICH
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R6: the deliverable resolves per-booking first, falls back to the listing, and NAMES its source", async () => {
  const bare = await seedBooking({ serviceId: ids.pdfSvc, status: "awaiting_acceptance", deliveredAt: new Date() });
  assert.deepEqual(await resolveBookingDeliverable(bare), {
    value: "objstore:listing/acc-listing.pdf",
    source: "listing",
  });

  const own = await seedBooking({
    serviceId: ids.pdfSvc,
    status: "awaiting_acceptance",
    deliveredAt: new Date(),
    deliverableFile: "objstore:bk/mine.pdf",
  });
  assert.deepEqual(await resolveBookingDeliverable(own), {
    value: "objstore:bk/mine.pdf",
    source: "booking",
  });

  // And a listing with NO file at all is honestly nothing — never an empty string standing in.
  const nothing = await seedBooking({ serviceId: ids.pdfNoRev, status: "awaiting_acceptance" });
  assert.equal(await resolveBookingDeliverable(nothing), null);

  // The rail that serves it reads the SAME helper, and the response names the source. Pinned
  // statically because a helper that merely AGREES with a route keeps passing after the route
  // stops calling it.
  const routes = code("server/routes.ts");
  assert.match(routes, /resolveDeliverable\(\(booking as any\)\.deliverableFile, service\.serviceFile\)/);
  assert.match(routes, /deliverableSource/);
  assert.match(
    routes,
    /DELIVERABLE_READABLE_STATUSES\.includes\(booking\.status \?\? ""\)/,
    "the download gate reads the shared list rather than a restated status check",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R7 — D-40: A HYBRID'S DECLARED ARTIFACT IS ACCEPTED, AND COMPLETION/THE MINT DO NOT MOVE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R7: accepting a hybrid's declared artifact records accepted_at and gates NOTHING", async () => {
  const bk = await seedBooking({ serviceId: ids.hybridSvc, status: "confirmed", deliveredAt: new Date() });

  const accepted = await acceptDeliverable({ bookingId: bk, actorUserId: ids.traveler });
  assert.equal("ok" in accepted && accepted.ok, true);
  assert.equal((accepted as any).mode, "records_only");
  assert.equal((accepted as any).completed, false, "the ruling's load-bearing half: acceptance completes NOTHING here");

  const row = await readBooking(bk);
  assert.ok(row.accepted_at, "the traveler's answer IS recorded");
  assert.equal(row.status, "confirmed", "the booking keeps D-7's completion rule — no status moved");
  assert.equal(row.completed_at, null);
  assert.equal(await mintedRowCount(bk), 0, "and no money timing changed: nothing minted");

  // A revision on the same arm writes the row and still moves no status.
  const rev = await requestRevision({ bookingId: bk, actorUserId: ids.traveler, note: "reshoot the sunset" });
  assert.equal("ok" in rev && rev.ok, true);
  assert.equal((rev as any).statusMoved, false);
  assert.equal((await readBooking(bk)).status, "confirmed");
  assert.equal(await countRevisionRequests(bk), 1);

  // A hybrid that DECLARED NOTHING has no affordance at all — §13: never "no artifact".
  const bare = await seedBooking({ serviceId: ids.hybridBare, status: "confirmed", deliveredAt: new Date() });
  const refused = await acceptDeliverable({ bookingId: bare, actorUserId: ids.traveler });
  assert.equal((refused as any).code, "no_acceptance_affordance");
  assert.equal(await describeAcceptance(bare), null, "and the read-out emits NOTHING for it");
  assert.equal(
    await describeAcceptance(await seedBooking({ serviceId: ids.inPersonSvc, status: "confirmed" })),
    null,
    "an in_person booking likewise carries no acceptance read-out",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R8 — THE READ-OUT: A DERIVED DEADLINE WHEN DATED, AND AN OMISSION WITH A REASON WHEN NOT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R8: the acceptance deadline is DERIVED from delivered_at, and an undated booking is on no clock", async () => {
  const deliveredAt = new Date("2026-05-01T09:00:00.000Z");
  const dated = await seedBooking({ serviceId: ids.pdfSvc, status: "awaiting_acceptance", deliveredAt });
  const readout = await describeAcceptance(dated);
  assert.ok(readout);
  const expected = new Date(deliveredAt.getTime() + acceptanceWindowDays() * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(readout!.acceptanceDeadline, expected, "delivery instant + the CONFIG window, never a stored column");
  assert.equal(readout!.deliveredAt, deliveredAt.toISOString());
  assert.equal("acceptedAt" in readout!, false, "§13: NULL is OMITTED, never rendered as 'not accepted'");
  assert.equal(readout!.hasBookingDeliverable, false, "presence only — the pointer's PATH is never published");

  // §13: a booking whose delivery instant the server does not hold is NOT put on a clock.
  const undated = await seedBooking({ serviceId: ids.pdfSvc, status: "awaiting_acceptance", deliveredAt: null });
  const bare = await describeAcceptance(undated);
  assert.ok(bare);
  assert.equal("acceptanceDeadline" in bare!, false, "no deadline is invented from confirmed_at or from now");
  assert.equal(bare!.deliveryTimestampMissing, true, "and the reason is STATED rather than left silent");

  // The window's number lives in config, not in a route (§8 posture).
  assert.ok(acceptanceWindowDays() > 0);
  const routeSrc = code("server/routes/bookings.ts");
  assert.ok(
    !/acceptanceWindowDays\s*\(\s*\)\s*\*|\b7\s*\*\s*24\s*\*\s*60/.test(routeSrc),
    "no route computes a window of its own",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R9 — THE SEQUENCED GAP, PINNED: THIS LANE DID NOT TOUCH THE TIMER, AND THE RAILS ARE THE ONLY
//      NEW STATUS WRITERS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R9 (RE-PINNED by D-27): artifact_timer has LEFT the completion rules, and the from-states live in ONE home", async () => {
  // ══ WHAT THIS ASSERTION USED TO SAY, AND WHY IT CHANGED ═══════════════════════════════════════
  // Before D-27 this pinned the SEQUENCED GAP: the D-24 lane must not retire the timer early,
  // because an artifact booking would have had nowhere to go. D-27 (ledger
  // `2026-09-15-d27-artifact-timer-acceptance-prompt`) closes exactly that gap, so the pin is
  // INVERTED onto the post-D-27 invariant rather than deleted — a deleted pin would leave the
  // retirement unguarded, and a re-added `artifact_timer` would silently restore the silent
  // timeout D-6 forbids.
  assert.ok(
    !TIMER_DRIVEN_COMPLETION_RULES.has("artifact_timer"),
    "D-6 forbids a clock completing an artifact — membership of this set is what made it possible",
  );
  // The RULE itself survives: it is still the true answer to "which rule governs this booking".
  // What it no longer does is complete anything.
  assert.equal(completionRuleFor({ deliveryMethod: "pdf", productShape: null }), "artifact_timer");

  // `awaiting_acceptance` is STILL NOT a completion from-state (the D-24 invariant, unmoved): that
  // list is also the completion timer's candidate predicate, and widening it would hand the nightly
  // job the very bookings D-6 forbids it to complete.
  assert.deepEqual([...COMPLETION_ALLOWED_FROM_STATUSES], ["confirmed"]);

  // The job now READS the acceptance arm — the half of the retirement that gives artifacts a place
  // to go. (Comments stripped, so this is the code saying it, not the prose.)
  const job = code("server/jobs/bookingAutoCompletion.ts");
  assert.match(job, /runArtifactAcceptancePass/, "the job must drive the acceptance arm");

  // The delivery rail now re-opens the window from `confirmed` TOO — a provider's first per-booking
  // delivery asks the traveler, exactly as the scheduler's listing-clock arm does.
  assert.deepEqual([...ARTIFACT_REDELIVERY_REOPEN_FROM_STATUSES], ["confirmed", "revision_requested"]);
  assert.deepEqual([...ACCEPTANCE_PROMPT_FROM_STATUSES], ["confirmed"]);
  assert.deepEqual([...ACCEPTANCE_ESCALATION_FROM_STATUSES], ["awaiting_acceptance"]);

  // The new statuses ARE disputable — the money is in escrow and nothing has minted — and the
  // dispute rail still reads its list from the one home (§18 rule 1).
  assert.ok(DISPUTABLE_FROM_STATUSES.includes("awaiting_acceptance"));
  assert.ok(DISPUTABLE_FROM_STATUSES.includes("revision_requested"));
  assert.ok(!DISPUTABLE_FROM_STATUSES.includes("payment_pending"), "a provisional claim is still never disputable");

  // The acceptance completion is a CALLER of the one implementation, not a second mint path.
  const svc = code("server/services/booking-acceptance.service.ts");
  assert.match(svc, /completeBooking\(\{[\s\S]*actor: "traveler_accepted"/);
  assert.ok(
    !/platform_revenue|provider_earnings|expert_earnings|mintCompletion/.test(svc),
    "the acceptance service writes NO earnings ledger of its own",
  );
  // §19: the new columns are stripped on both booking-birth writers.
  const storageSrc = code("server/storage.ts");
  assert.match(storageSrc, /acceptedAt: _clientSuppliedAcceptedAt/);
  assert.match(storageSrc, /acceptedAt: _acceptedAt/);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R10 — A BOOKING THAT IS NOT WAITING FOR AN ANSWER CANNOT BE ACCEPTED INTO COMPLETION
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("R10: acceptance cannot consume `confirmed` on a pdf booking — that state belongs to the timer", async () => {
  const bk = await seedBooking({ serviceId: ids.pdfSvc, status: "confirmed", deliveredAt: new Date() });
  const refused = await acceptDeliverable({ bookingId: bk, actorUserId: ids.traveler });
  assert.equal("ok" in refused && refused.ok, false);
  assert.equal((refused as any).code, "wrong_status");
  const row = await readBooking(bk);
  assert.equal(row.status, "confirmed");
  assert.equal(row.accepted_at, null, "a refused acceptance records no answer");
  assert.equal(await mintedRowCount(bk), 0);

  // And a terminal row is not revived by a delivery.
  const cancelled = await seedBooking({ serviceId: ids.pdfSvc, status: "cancelled" });
  const deliverDead = await deliverArtifact({
    bookingId: cancelled,
    actorUserId: ids.provider,
    fileValue: "objstore:bk/late.pdf",
  });
  assert.equal("ok" in deliverDead && deliverDead.ok, false);
  assert.equal((await readBooking(cancelled)).delivered_at, null);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D-27 — `artifact_timer` RETIRES AS A COMPLETION RULE AND BECOMES THE ACCEPTANCE-PROMPT RULE
// (ledger `2026-09-15-d27-artifact-timer-acceptance-prompt`; punchlist D-27 ruled A, 7 days).
//
// NEGATIVE SPACE for this block, stated because green means green-within-stated-bounds (§18d):
//  · These prove the SCHEDULER ARM and the deliver rail's newly-opened `confirmed` entry. They say
//    nothing about any SURFACE (brief §7 lane 4 — no traveler, seller or admin UI ships here), and
//    nothing about the refund on a rejected artifact, which brief §5 leaves explicitly unruled.
//  · The escalation's TARGET is asserted as `status = 'disputed'` plus the system reason — the
//    EXISTING admin queue's own predicate. That the admin READER selects the field is pinned
//    statically; no HTTP is driven here.
//  · The payment gate is proven by injecting a verifier, never by reaching Stripe.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// ── R11 — THE ASK, from the PER-BOOKING delivery instant ────────────────────────────────────────

test("R11: a delivered `confirmed` artifact is PROMPTED to awaiting_acceptance, source `per_booking`", async () => {
  const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const bk = await seedBooking({ serviceId: ids.pdfSvc, status: "confirmed", deliveredAt });

  const run = await runArtifactAcceptancePass(new Date(), verifyPaid);
  assert.ok(run.promptedBookingIds.includes(bk), `must prompt ${bk}; skipped=${JSON.stringify(run.skipped)}`);

  const row = await readBooking(bk);
  assert.equal(row.status, "awaiting_acceptance");
  assert.equal(row.completed_at, null, "the prompt completes NOTHING");
  assert.equal(row.accepted_at, null, "and it records no answer — nobody answered");
  assert.equal(await mintedRowCount(bk), 0, "D-6's whole point: a clock mints nothing");

  // The SOURCE is recorded, not just the instant (§13 — "the file your expert made for you" and
  // "the clock we derived" are different facts).
  const stamp = (row.booking_details as any)?.acceptancePrompt;
  assert.equal(stamp?.deliveryInstantSource, "per_booking");
  assert.equal(new Date(stamp?.deliveredAt).toISOString(), deliveredAt.toISOString());
  assert.ok(stamp?.acceptanceDeadline, "the derived deadline is recorded with the instant it came from");
});

// ── R12 — THE ASK, from the LISTING CLOCK, and `delivered_at` is NOT written back ───────────────

test("R12: an artifact delivered through the LISTING is prompted with source `listing_clock`, and `delivered_at` stays NULL", async () => {
  await db.execute(sql`
    UPDATE provider_services SET deliverable_uploaded_at = NOW() - INTERVAL '3 days' WHERE id = ${ids.pdfSvc}
  `);
  const bk = await seedBooking({ serviceId: ids.pdfSvc, status: "confirmed", deliveredAt: null, confirmedDaysAgo: 5 });

  const run = await runArtifactAcceptancePass(new Date(), verifyPaid);
  assert.ok(run.promptedBookingIds.includes(bk), `must prompt ${bk}; skipped=${JSON.stringify(run.skipped)}`);

  const row = await readBooking(bk);
  assert.equal(row.status, "awaiting_acceptance");
  const stamp = (row.booking_details as any)?.acceptancePrompt;
  assert.equal(stamp?.deliveryInstantSource, "listing_clock");
  assert.equal(stamp?.arm, "undownloaded");
  // D-26'S RULE, and it is the load-bearing half of this proof: a DERIVED instant is never stamped
  // onto the row. Writing it would turn "we inferred this" into "the seller delivered on this
  // date", and would move every other buyer's window the moment the listing's file changed.
  assert.equal(row.delivered_at, null, "a listing-clock instant is NEVER written back to delivered_at");
  assert.equal(await mintedRowCount(bk), 0);

  await db.execute(sql`UPDATE provider_services SET deliverable_uploaded_at = NULL WHERE id = ${ids.pdfSvc}`);
});

// ── R13 — THE NEGATIVE THAT FAILS ON THE PRE-D-27 HEAD ─────────────────────────────────────────

test("R13: the nightly job NEVER completes an artifact, however old — and mints nothing", async () => {
  await db.execute(sql`
    UPDATE provider_services SET deliverable_uploaded_at = NOW() - INTERVAL '90 days' WHERE id = ${ids.pdfSvc}
  `);
  const bk = await seedBooking({
    serviceId: ids.pdfSvc,
    status: "confirmed",
    deliveredAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    confirmedDaysAgo: 120,
  });

  // The WHOLE job, not just the arm — this is the assertion that fails on the pre-D-27 head, where
  // `auto_complete_pdf` flipped exactly this row to `completed` and minted the seller's earning.
  const run = await runBookingAutoCompletion(new Date(), async () => true);
  assert.ok(!run.completedBookingIds.includes(bk), "D-6: a silent timeout may never complete in the seller's favour");
  assert.notEqual((await readBooking(bk)).status, "completed");
  assert.equal(await mintedRowCount(bk), 0, "no held earning is born on any clock-driven artifact transition");

  await db.execute(sql`UPDATE provider_services SET deliverable_uploaded_at = NULL WHERE id = ${ids.pdfSvc}`);
});

// ── R14 — THE ESCALATION, into the EXISTING dispute queue ───────────────────────────────────────

test("R14: an unanswered window escalates to `disputed` with `acceptance_window_elapsed`, and mints nothing", async () => {
  // Delivered far enough in the past that the window (config, `acceptanceWindowDays()`) has closed.
  const longAgo = new Date(Date.now() - (acceptanceWindowDays() + 3) * 24 * 60 * 60 * 1000);
  const bk = await seedBooking({
    serviceId: ids.pdfSvc,
    status: "awaiting_acceptance",
    deliveredAt: longAgo,
    confirmedDaysAgo: acceptanceWindowDays() + 5,
  });

  const run = await runArtifactAcceptancePass(new Date(), verifyPaid);
  assert.ok(run.escalatedBookingIds.includes(bk), `must escalate ${bk}; skipped=${JSON.stringify(run.skipped)}`);

  const row = await readBooking(bk);
  // THE EXISTING QUEUE'S OWN PREDICATE — `GET /api/admin/disputes` is `WHERE status = 'disputed'`.
  // Never a second queue, and never a new `admin_review` status.
  assert.equal(row.status, "disputed");
  assert.equal(row.completed_at, null, "escalation completes nothing");
  assert.equal(row.accepted_at, null, "and records no acceptance — nobody accepted");
  assert.equal(await mintedRowCount(bk), 0, "nothing had minted, and nothing mints now");

  // §13: the SYSTEM reason lives in its own field. `disputeReason` holds a TRAVELER'S OWN WORDS,
  // and nobody typed this sentence.
  const meta = row.booking_metadata as any;
  assert.equal(meta?.systemDisputeReason, ACCEPTANCE_WINDOW_ELAPSED_REASON);
  assert.equal(meta?.disputeReason ?? null, null, "a system escalation never fabricates a traveler's reason");
  const stamp = (row.booking_details as any)?.acceptanceEscalation;
  assert.equal(stamp?.reason, ACCEPTANCE_WINDOW_ELAPSED_REASON);
  assert.equal(stamp?.windowDays, acceptanceWindowDays(), "the period is CONFIG, read once, never a literal");
});

test("R14b: a window that is still OPEN is not escalated", async () => {
  const bk = await seedBooking({
    serviceId: ids.pdfSvc,
    status: "awaiting_acceptance",
    deliveredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  });
  const run = await runArtifactAcceptancePass(new Date(), verifyPaid);
  assert.ok(!run.escalatedBookingIds.includes(bk));
  assert.ok((run.skipped["window_open"] ?? 0) >= 1, "the pass ACCOUNTS for it rather than falling silent");
  assert.equal((await readBooking(bk)).status, "awaiting_acceptance");
});

// ── R15 — §13: NO DELIVERY INSTANT ⇒ NO CLOCK ──────────────────────────────────────────────────

test("R15 (§13): a booking with no delivery instant from EITHER source is skipped, never put on a clock", async () => {
  // No per-booking `delivered_at`, no listing `deliverable_uploaded_at`, no download.
  await db.execute(sql`UPDATE provider_services SET deliverable_uploaded_at = NULL WHERE id = ${ids.pdfSvc}`);
  const bk = await seedBooking({ serviceId: ids.pdfSvc, status: "confirmed", deliveredAt: null, confirmedDaysAgo: 400 });

  const run = await runArtifactAcceptancePass(new Date(), verifyPaid);
  assert.ok(!run.promptedBookingIds.includes(bk));
  assert.ok(
    (run.skipped["no_delivery_timestamp"] ?? 0) >= 1,
    "the reason must be STATED — never anchored on confirmed_at alone, on the listing's upload instant alone, or on now",
  );
  const row = await readBooking(bk);
  assert.equal(row.status, "confirmed", "not prompted, not escalated, not completed");
  assert.equal(row.delivered_at, null, "and nothing was invented to make a clock possible");
  assert.equal(await mintedRowCount(bk), 0);
});

// ── R16 — THE RETIRED ACTOR IS GONE, NOT RENAMED ───────────────────────────────────────────────

test("R16: `auto_complete_pdf` no longer exists as an actor anywhere in the completion machinery", () => {
  const svc = code("server/services/booking-completion.service.ts");
  assert.ok(
    !/"auto_complete_pdf"/.test(svc),
    "the actor is GONE — one FEWER caller of completeBooking, never a renamed one",
  );
  // And it is gone through the SET, not through a deleted special case: `timerActorFor` asks
  // `TIMER_DRIVEN_COMPLETION_RULES` and gets `null` for an artifact.
  assert.equal(timerActorFor("artifact_timer"), null);
  assert.equal(timerActorFor("checkout_date"), "auto_complete_property");

  // The escalation reuses THE ONE dispute writer with a narrower named list — never a second
  // `UPDATE … SET status = 'disputed'` (§18 rule 1).
  const arm = code("server/services/artifact-acceptance-timer.service.ts");
  assert.match(arm, /updateServiceBookingStatus\([\s\S]{0,200}ACCEPTANCE_ESCALATION_FROM_STATUSES/);
  assert.ok(
    !/SET\s+status\s*=\s*'disputed'/i.test(arm),
    "no second raw UPDATE may set `disputed` beside the one writer the traveler rail uses",
  );
  // And it declares no from-state list of its own.
  assert.ok(!/const\s+ACCEPTANCE_(PROMPT|ESCALATION)_FROM_STATUSES\s*[:=]/.test(arm));

  // The admin queue surfaces the system reason as its OWN field (reader-side exposure, no UI).
  const admin = src("server/routes/admin.routes.ts");
  assert.match(admin, /booking_metadata->>'systemDisputeReason' AS system_dispute_reason/);
  assert.match(admin, /booking_metadata->>'disputeReason' AS dispute_reason/);
});

// ── R17 — §15: A DOUBLE RUN IS ONE FLIP, ON BOTH TRANSITIONS ───────────────────────────────────

test("R17 (§15): a double pass produces exactly one prompt and exactly one escalation", async () => {
  const prompt = await seedBooking({
    serviceId: ids.pdfSvc,
    status: "confirmed",
    deliveredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
  const escalate = await seedBooking({
    serviceId: ids.pdfSvc,
    status: "awaiting_acceptance",
    deliveredAt: new Date(Date.now() - (acceptanceWindowDays() + 3) * 24 * 60 * 60 * 1000),
  });

  // Raced rather than sequenced: a check-then-update would let both through (§15's own words).
  const [a, b] = await Promise.all([
    runArtifactAcceptancePass(new Date(), verifyPaid),
    runArtifactAcceptancePass(new Date(), verifyPaid),
  ]);
  const prompts = [a, b].filter((r) => r.promptedBookingIds.includes(prompt)).length;
  const escalations = [a, b].filter((r) => r.escalatedBookingIds.includes(escalate)).length;
  assert.equal(prompts, 1, "the transition IS the guard — exactly one pass may win the prompt");
  assert.equal(escalations, 1, "…and exactly one may win the escalation");

  // A THIRD pass finds the prompted booking again (it is now `awaiting_acceptance`) but its window
  // is open, so it does nothing — and the escalated one has left the candidate set entirely.
  const third = await runArtifactAcceptancePass(new Date(), verifyPaid);
  assert.ok(!third.promptedBookingIds.includes(prompt));
  assert.ok(!third.escalatedBookingIds.includes(escalate));
  assert.equal((await readBooking(prompt)).status, "awaiting_acceptance");
  assert.equal((await readBooking(escalate)).status, "disputed");
  assert.equal(await mintedRowCount(prompt), 0);
  assert.equal(await mintedRowCount(escalate), 0);
});

// ── R18 — THE PAYMENT GATE MOVED TO THE ASK, AND IT IS LOAD-BEARING ────────────────────────────

test("R18: an UNPAID confirmed artifact is never prompted — the prompt opens the rail that mints", async () => {
  const unpaid = await seedBooking({
    serviceId: ids.pdfSvc,
    status: "confirmed",
    deliveredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
  const noPi = await seedBooking({
    serviceId: ids.pdfSvc,
    status: "confirmed",
    deliveredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    paymentIntentId: null,
  });

  const run = await runArtifactAcceptancePass(new Date(), async () => false);
  assert.ok(!run.promptedBookingIds.includes(unpaid), "a PI that has not succeeded is not a payment");
  assert.ok(!run.promptedBookingIds.includes(noPi), "and no PI at all is not a payment either");
  assert.ok((run.skipped["unpaid"] ?? 0) >= 1);
  assert.ok((run.skipped["no_payment_on_record"] ?? 0) >= 1);
  assert.equal((await readBooking(unpaid)).status, "confirmed");
  assert.equal((await readBooking(noPi)).status, "confirmed");

  // The ESCALATION carries no such gate: it takes money nowhere, and a booking nobody answered must
  // reach a human whether or not Stripe is reachable tonight.
  const stale = await seedBooking({
    serviceId: ids.pdfSvc,
    status: "awaiting_acceptance",
    deliveredAt: new Date(Date.now() - (acceptanceWindowDays() + 3) * 24 * 60 * 60 * 1000),
    paymentIntentId: null,
  });
  const run2 = await runArtifactAcceptancePass(new Date(), async () => {
    throw new Error("Stripe must not be consulted on the escalation arm");
  });
  assert.ok(run2.escalatedBookingIds.includes(stale));
  assert.equal((await readBooking(stale)).status, "disputed");
});

// ── R19 — THE DELIVER RAIL NOW OPENS THE WINDOW FROM `confirmed` ───────────────────────────────

test("R19: a provider's FIRST per-booking delivery moves `confirmed` -> awaiting_acceptance and stamps delivered_at", async () => {
  const bk = await seedBooking({ serviceId: ids.pdfSvc, status: "confirmed", deliveredAt: null });

  const result = await deliverArtifact({
    bookingId: bk,
    actorUserId: ids.provider,
    fileValue: "objstore:bk/first-delivery.pdf",
  });
  assert.ok("ok" in result && result.ok);
  assert.equal((result as any).reopenedAcceptance, true, "the first delivery ASKS — that is D-27's other half");

  const row = await readBooking(bk);
  assert.equal(row.status, "awaiting_acceptance");
  assert.equal(row.deliverable_file, "objstore:bk/first-delivery.pdf");
  assert.ok(row.delivered_at, "the PROVIDER'S own delivery does stamp the instant (unlike the derived listing clock)");
  assert.equal(await mintedRowCount(bk), 0, "delivering is not completing");

  // A D-40 `records_only` hybrid is untouched by this: it moves no status at all.
  const hyb = await seedBooking({ serviceId: ids.hybridSvc, status: "confirmed", deliveredAt: null });
  const hybResult = await deliverArtifact({
    bookingId: hyb,
    actorUserId: ids.provider,
    fileValue: "objstore:bk/hybrid.pdf",
  });
  assert.ok("ok" in hybResult && hybResult.ok);
  assert.equal((hybResult as any).reopenedAcceptance, false);
  assert.equal((await readBooking(hyb)).status, "confirmed", "D-7's timing is untouched by an artifact declaration");
});
