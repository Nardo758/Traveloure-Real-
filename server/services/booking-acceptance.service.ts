/**
 * D-6 ACCEPTANCE AND REVISIONS — the accept, request-revision and deliver rails, in ONE place.
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-24 / D-25 / D-26 / D-40, all option A; ledger
 * `2026-09-15-d24-d26-acceptance-columns`). Content of record:
 * `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` Part I §3-§7 and Part II §10.
 *
 * THE RULES THIS MODULE IS BOUND BY, each of which the brief states as non-negotiable:
 *
 *  1. §14 — THE ACTOR COMES FROM THE SESSION. Every entry point takes an `actorUserId` the route
 *     read off the session; nothing here reads a request body for an identity, an amount or an
 *     allowance. The BOOKING comes from the path; the ALLOWANCE comes from the listing row.
 *  2. §15/§18b — EVERY TRANSITION IS AN ATOMIC CONDITIONAL. A pre-check is only the error message;
 *     the UPDATE's own predicate is the guard. A double-click, a retried request and two tabs
 *     produce ONE flip, ONE earning set and ONE revision row.
 *  3. §18 rule 1 — ONE COMPLETION IMPLEMENTATION. Acceptance is a new CALLER of `completeBooking`
 *     with its own actor tag (`traveler_accepted`). There is NO second minting path here, and this
 *     module never writes `platform_revenue`, `provider_earnings` or `expert_earnings`.
 *  4. §19 — the revision body is a pick-based `.strict()` allowlist of exactly one field (`note`).
 *  5. §8 — no fee, rate or amount is read, written or multiplied anywhere in this file. Acceptance
 *     GATES NO CHARGE: deposits and balances are untouched (§15d), and an unaccepted artifact does
 *     not block a balance payment.
 *
 * D-40, AND IT IS THE HALF MOST EASILY LOST. `acceptanceModeFor` (shared) returns
 * `records_only` for a `hybrid` listing that DECLARED an artifact. On that arm accepting or
 * revising the declared artifact records `accepted_at` and `booking_revision_requests` rows and
 * **GATES NOTHING ABOUT COMPLETION OR THE MINT** — the booking keeps D-7's `service_date_timer`,
 * no status moves, and no money timing changes. Withholding a provider's fee for a day they
 * actually worked behind acceptance of a document is exactly what D-7 ruled against.
 *
 * NEGATIVE SPACE — what this lane deliberately does NOT build, so nobody reads it as built:
 *  · THE ESCALATION JOB (D-27). `artifact_timer`, `TIMER_DRIVEN_COMPLETION_RULES` and
 *    `server/jobs/bookingAutoCompletion.ts` are UNTOUCHED, so an artifact booking still
 *    auto-completes under the old timer. Nothing here moves `confirmed` -> `awaiting_acceptance`
 *    (see `ARTIFACT_REDELIVERY_REOPEN_FROM_STATUSES` for why), so in production the acceptance
 *    cycle opens when D-27 ships and not before.
 *  · THE REFUND ON A REJECTED ARTIFACT (brief §5) is NOT RULED and is invented nowhere here.
 *  · ANY SURFACE. Lane 4 owns the traveler and seller UI; this lane exposes reads and rails only.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  acceptanceDeadline,
  acceptanceModeFor,
  mayRequestRevision,
  resolveDeliverable,
  resolveRevisionAllowance,
  type AcceptanceMode,
  type RevisionAllowance,
  type ResolvedDeliverable,
} from "@shared/acceptance-window";
import { bookingRevisionRequests, providerServices, serviceBookings } from "@shared/schema";

import { db } from "../db";
import { acceptanceWindowDays } from "../config/completion-windows.config";
import {
  ARTIFACT_DELIVERY_FROM_STATUSES,
  ARTIFACT_RECORD_ONLY_STATUSES,
  ARTIFACT_REDELIVERY_REOPEN_FROM_STATUSES,
  REVISION_REQUESTABLE_FROM_STATUSES,
} from "../utils/booking-from-states";
import { completeBooking } from "./booking-completion.service";

/** Machine-readable refusals. §13: a refusal is a sentence, and it says WHICH fact refused it. */
export type AcceptanceRefusalCode =
  | "not_found"
  | "no_acceptance_affordance"
  | "wrong_status"
  | "revisions_not_offered"
  | "revision_allowance_exhausted"
  | "nothing_delivered"
  | "lost_race";

export interface AcceptanceRefusal {
  ok: false;
  status: number;
  code: AcceptanceRefusalCode;
  message: string;
  /** Present only on the allowance refusals — the NUMBER, stated, never a bare "no" (§13). */
  allowance?: RevisionAllowance;
}

const refuse = (
  status: number,
  code: AcceptanceRefusalCode,
  message: string,
  allowance?: RevisionAllowance,
): AcceptanceRefusal => ({ ok: false, status, code, message, ...(allowance ? { allowance } : {}) });

/**
 * A booking joined to the facts its acceptance depends on. One read, so the allowance, the mode and
 * the status cannot be resolved against three different snapshots of the same row.
 */
interface AcceptanceContext {
  bookingId: string;
  travelerId: string | null;
  providerId: string | null;
  status: string | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  bookingFile: string | null;
  listingFile: string | null;
  deliveryMethod: string | null;
  productShape: string | null;
  declaredArtifactDeliverable: string | null;
  revisionsIncluded: number | null;
  mode: AcceptanceMode | null;
}

async function loadContext(bookingId: string): Promise<AcceptanceContext | null> {
  const [row] = await db
    .select({
      bookingId: serviceBookings.id,
      travelerId: serviceBookings.travelerId,
      providerId: serviceBookings.providerId,
      status: serviceBookings.status,
      acceptedAt: serviceBookings.acceptedAt,
      deliveredAt: serviceBookings.deliveredAt,
      bookingFile: serviceBookings.deliverableFile,
      listingFile: providerServices.serviceFile,
      deliveryMethod: providerServices.deliveryMethod,
      productShape: providerServices.productShape,
      declaredArtifactDeliverable: providerServices.declaredArtifactDeliverable,
      revisionsIncluded: providerServices.revisionsIncluded,
    })
    .from(serviceBookings)
    .leftJoin(providerServices, eq(providerServices.id, serviceBookings.serviceId))
    .where(eq(serviceBookings.id, bookingId));
  if (!row) return null;
  return {
    ...row,
    mode: acceptanceModeFor({
      deliveryMethod: row.deliveryMethod,
      productShape: row.productShape,
      declaredArtifactDeliverable: row.declaredArtifactDeliverable,
    }),
  };
}

/** How many revision rows this booking already carries. The COUNT is DERIVED, never stored (D-25). */
export async function countRevisionRequests(bookingId: string): Promise<number> {
  const r = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM booking_revision_requests WHERE booking_id = ${bookingId}`,
  );
  return Number((r.rows[0] as { n: number } | undefined)?.n ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// READ EXPOSURE — what a traveler's booking read carries, and what it deliberately omits
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface AcceptanceReadout {
  /** Which arm this listing is on. `records_only` = D-40's hybrid declared artifact. */
  mode: AcceptanceMode;
  /** NULL-safe: omitted by the caller when absent, never rendered as "not accepted" (§13). */
  acceptedAt?: string;
  deliveredAt?: string;
  /**
   * PRESENCE ONLY, never the path. The pointer is an object-storage key or a private URL; publishing
   * it would hand every reader the artifact's location, which the whole D3 rail exists to withhold.
   */
  hasBookingDeliverable: boolean;
  /**
   * DERIVED from `deliveredAt` + `acceptanceWindowDays()` (D-24 — never stored). ABSENT when the
   * server holds no per-booking delivery instant: a booking the platform cannot date is not put on
   * an acceptance clock, and `deliveryTimestampMissing` says so rather than leaving a silent gap.
   */
  acceptanceDeadline?: string;
  deliveryTimestampMissing?: true;
  /**
   * The allowance, read LIVE from the listing (§18 rule 1) with `used` counted from the child rows.
   * ABSENT entirely when the listing offers no revisions — §13's rule that NULL or 0 shows no
   * affordance at all, never "0 remaining" beside a button that refuses.
   */
  revisionsIncluded?: number;
  revisionsUsed?: number;
  revisionsRemaining?: number;
}

/**
 * THE ONE READ-OUT, for the traveler's booking read.
 *
 * §13 in both directions: a booking whose listing takes NO acceptance returns `null` and the caller
 * emits NOTHING — not `accepted: false`, not "no artifact", not a zero. A field the server has no
 * answer for is OMITTED, not zero-filled.
 */
export async function describeAcceptance(bookingId: string): Promise<AcceptanceReadout | null> {
  const ctx = await loadContext(bookingId);
  if (!ctx || ctx.mode === null) return null;
  const allowance = resolveRevisionAllowance(ctx.revisionsIncluded, await countRevisionRequests(bookingId));
  const deadline = acceptanceDeadline(ctx.deliveredAt, acceptanceWindowDays());
  return {
    mode: ctx.mode,
    ...(ctx.acceptedAt ? { acceptedAt: new Date(ctx.acceptedAt).toISOString() } : {}),
    ...(ctx.deliveredAt ? { deliveredAt: new Date(ctx.deliveredAt).toISOString() } : {}),
    hasBookingDeliverable: !!(ctx.bookingFile ?? "").trim(),
    ...(deadline ? { acceptanceDeadline: deadline } : { deliveryTimestampMissing: true as const }),
    ...(allowance.offered
      ? {
          revisionsIncluded: allowance.included as number,
          revisionsUsed: allowance.used,
          revisionsRemaining: allowance.remaining as number,
        }
      : {}),
  };
}

/**
 * WHICH FILE THIS BOOKING IS SERVED, AND FROM WHERE (D-26). The per-booking artifact when set, the
 * listing's as the honest FALLBACK — and the caller is told which, because "the file your expert
 * made for you" and "the file this listing ships to everyone" are different facts that become
 * different documents the moment a revision lands.
 */
export async function resolveBookingDeliverable(bookingId: string): Promise<ResolvedDeliverable | null> {
  const ctx = await loadContext(bookingId);
  if (!ctx) return null;
  return resolveDeliverable(ctx.bookingFile, ctx.listingFile);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE ACCEPT RAIL — traveler-gated
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface AcceptResult {
  ok: true;
  mode: AcceptanceMode;
  /** TRUE only on the `gates_completion` arm. `false` on D-40's hybrid arm, which completes nothing. */
  completed: boolean;
  acceptedAt: string;
}

/**
 * THE TRAVELER ACCEPTS THE DELIVERED ARTIFACT.
 *
 * `gates_completion` (a `pdf` listing): ONE call into `completeBooking` with the `traveler_accepted`
 * actor. That is the ONE completion implementation gaining a CALLER — the flip is its atomic
 * conditional over `ACCEPTANCE_FROM_STATUSES`, the mint happens inside the writer's own
 * transaction, and `accepted_at` is stamped there after the caller provably won. A second call
 * returns `lost_race` and mints nothing.
 *
 * `records_only` (D-40's hybrid declared artifact): ONE atomic conditional of its own that stamps
 * `accepted_at` and MOVES NO STATUS. Nothing completes, nothing mints, and the booking's
 * `service_date_timer` is untouched. `COALESCE` makes the stamp idempotent, so the traveler's own
 * retry is a no-op rather than a moved instant.
 *
 * §14: `actorUserId` is the session's. An undifferentiated 404 covers "no such booking" and "not
 * yours" alike, so the rail cannot be used to probe which bookings exist (the
 * `POST /api/conversations/start` posture, LD 40).
 */
export async function acceptDeliverable(input: {
  bookingId: string;
  actorUserId: string;
  now?: Date;
}): Promise<AcceptResult | AcceptanceRefusal> {
  const now = input.now ?? new Date();
  const ctx = await loadContext(input.bookingId);
  if (!ctx || ctx.travelerId !== input.actorUserId) {
    return refuse(404, "not_found", "Booking not found");
  }
  if (ctx.mode === null) {
    return refuse(
      409,
      "no_acceptance_affordance",
      "This booking isn't one you accept — its completion follows its own rule.",
    );
  }

  if (ctx.mode === "gates_completion") {
    const result = await completeBooking({
      bookingId: input.bookingId,
      actor: "traveler_accepted",
      now,
      reason: "traveler_accepted_artifact",
    });
    if (!result.completed) {
      if (result.reason === "lost_race") {
        return refuse(409, "lost_race", "This booking changed before your acceptance was applied. Reload and try again.");
      }
      return refuse(
        409,
        "wrong_status",
        "This booking isn't waiting for your acceptance right now. Reload and try again.",
      );
    }
    const [row] = await db
      .select({ acceptedAt: serviceBookings.acceptedAt })
      .from(serviceBookings)
      .where(eq(serviceBookings.id, input.bookingId));
    return {
      ok: true,
      mode: ctx.mode,
      completed: true,
      acceptedAt: new Date(row?.acceptedAt ?? now).toISOString(),
    };
  }

  // D-40 `records_only`. The predicate IS the guard (§15): a concurrent cancel/refund moves the row
  // out of the paid-equivalent states and this writes nothing.
  const [stamped] = await db
    .update(serviceBookings)
    .set({ acceptedAt: sql`COALESCE(${serviceBookings.acceptedAt}, ${now})`, updatedAt: now })
    .where(
      and(
        eq(serviceBookings.id, input.bookingId),
        inArray(serviceBookings.status, ARTIFACT_RECORD_ONLY_STATUSES as string[]),
      ),
    )
    .returning({ acceptedAt: serviceBookings.acceptedAt });
  if (!stamped) {
    return refuse(409, "wrong_status", "This booking isn't in a state where the deliverable can be accepted.");
  }
  return {
    ok: true,
    mode: ctx.mode,
    completed: false,
    acceptedAt: new Date(stamped.acceptedAt ?? now).toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE REVISION RAIL — traveler-gated
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface RevisionResult {
  ok: true;
  mode: AcceptanceMode;
  position: number;
  allowance: RevisionAllowance;
  /** TRUE only on `gates_completion`; D-40's hybrid arm moves no status. */
  statusMoved: boolean;
}

/**
 * THE TRAVELER ASKS FOR A REVISION.
 *
 * THE ALLOWANCE IS THE LISTING'S OWN `provider_services.revisions_included`, READ HERE ON EVERY
 * DECISION and never copied onto the booking (§18 rule 1, §19). A request beyond it is refused with
 * the NUMBER STATED, and it NEVER becomes a dispute: a revision is an entitlement the listing sold,
 * a dispute is a claim that something went wrong, and conflating them would put an ordinary edit
 * request into the admin queue and mark the earner's `dispute_state='open'`.
 *
 * ONE TRANSACTION, UNDER A `FOR UPDATE` ON THE PARENT — the `replaceTripDestinations` / route-points
 * race posture. The lock is what makes the derived position safe: two concurrent requests cannot
 * both read the same count and both insert at it. The status flip inside it is still an ATOMIC
 * CONDITIONAL over `REVISION_REQUESTABLE_FROM_STATUSES`, so the lock is belt and the predicate is
 * braces.
 */
export async function requestRevision(input: {
  bookingId: string;
  actorUserId: string;
  note: string | null;
  now?: Date;
}): Promise<RevisionResult | AcceptanceRefusal> {
  const now = input.now ?? new Date();
  const ctx = await loadContext(input.bookingId);
  if (!ctx || ctx.travelerId !== input.actorUserId) {
    return refuse(404, "not_found", "Booking not found");
  }
  if (ctx.mode === null) {
    return refuse(409, "no_acceptance_affordance", "This booking has no deliverable to revise.");
  }

  const allowedFrom =
    ctx.mode === "gates_completion" ? REVISION_REQUESTABLE_FROM_STATUSES : ARTIFACT_RECORD_ONLY_STATUSES;

  try {
    return await db.transaction(async (tx) => {
      // The route-points race posture: lock the PARENT so the derived position and the allowance
      // check cannot interleave with a concurrent request's insert.
      const locked = await tx.execute(
        sql`SELECT status FROM service_bookings WHERE id = ${input.bookingId} FOR UPDATE`,
      );
      const lockedStatus = (locked.rows[0] as { status: string | null } | undefined)?.status ?? null;
      if (lockedStatus === null) return refuse(404, "not_found", "Booking not found");
      if (!allowedFrom.includes(lockedStatus)) {
        return refuse(
          409,
          "wrong_status",
          "This booking isn't in a state where a revision can be requested.",
        );
      }

      const counted = await tx.execute(
        sql`SELECT COUNT(*)::int AS n, COALESCE(MAX("position"), 0)::int AS top
            FROM booking_revision_requests WHERE booking_id = ${input.bookingId}`,
      );
      const used = Number((counted.rows[0] as { n: number } | undefined)?.n ?? 0);
      const top = Number((counted.rows[0] as { top: number } | undefined)?.top ?? 0);
      const allowance = resolveRevisionAllowance(ctx.revisionsIncluded, used);

      if (!allowance.offered) {
        // §13: NULL or 0 is not "0 remaining beside a button" — it is NO AFFORDANCE. The refusal
        // says the listing includes none rather than implying one was spent.
        return refuse(
          409,
          "revisions_not_offered",
          "This listing doesn't include revisions.",
          allowance,
        );
      }
      if (!mayRequestRevision(allowance)) {
        // The NUMBER is stated. It is still not a dispute — the message says so by what it offers.
        return refuse(
          409,
          "revision_allowance_exhausted",
          `This listing includes ${allowance.included} revision${allowance.included === 1 ? "" : "s"}, and you've used ${allowance.used}.`,
          allowance,
        );
      }

      const position = top + 1;
      await tx.insert(bookingRevisionRequests).values({
        bookingId: input.bookingId,
        position,
        note: input.note,
        requestedAt: now,
      });

      let statusMoved = false;
      if (ctx.mode === "gates_completion") {
        // §15/§18b — the transition IS the guard, inside the same transaction as the child row so a
        // revision row can never exist without the state that explains it, or vice versa.
        const flipped = await tx.execute(sql`
          UPDATE service_bookings
             SET status = 'revision_requested', updated_at = ${now}
           WHERE id = ${input.bookingId}
             AND status IN (${sql.join(REVISION_REQUESTABLE_FROM_STATUSES.map((v) => sql`${v}`), sql`, `)})
          RETURNING id
        `);
        if (flipped.rows.length === 0) {
          return refuse(409, "lost_race", "This booking changed before your request was applied. Reload and try again.");
        }
        statusMoved = true;
      }
      // D-40: on `records_only` NOTHING moves. The row is recorded and the booking keeps its own
      // completion rule — accepting or revising a hybrid's declared artifact gates no completion,
      // no mint and no payout timing.

      return {
        ok: true as const,
        mode: ctx.mode as AcceptanceMode,
        position,
        allowance: resolveRevisionAllowance(ctx.revisionsIncluded, used + 1),
        statusMoved,
      };
    });
  } catch (err) {
    // The UNIQUE (booking_id, position) index is the last guard if two writers ever get past the
    // lock. A loser writes nothing; it is a retry, never a silent second row.
    if ((err as { code?: string })?.code === "23505") {
      return refuse(409, "lost_race", "Another request landed first. Reload and try again.");
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE DELIVER / RE-DELIVER RAIL — provider-gated
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface DeliverResult {
  ok: true;
  mode: AcceptanceMode;
  deliveredAt: string;
  /** The open revision rows this delivery answered (D-25 `resolved_at`). */
  resolvedRevisions: number;
  /** TRUE only when this delivery re-opened the acceptance window (`revision_requested` -> `awaiting_acceptance`). */
  reopenedAcceptance: boolean;
  acceptanceDeadline: string | null;
}

/**
 * THE PROVIDER DELIVERS (OR RE-DELIVERS) THE ARTIFACT FOR THIS BOOKING.
 *
 * It sets the PER-BOOKING pointer (D-26 — never the listing's `service_file`, which every other
 * buyer of the listing downloads), stamps `delivered_at` (which MOVES on every re-delivery, because
 * the acceptance window restarts with the document it measures), resolves every OPEN revision row,
 * and — only from `revision_requested` — re-opens the acceptance window.
 *
 * IT REUSES THE EXISTING FILE STORE AND BUILDS NO SECOND ONE. The `fileValue` handed in is the same
 * value shape `provider_services.service_file` carries (an `objstore:`-prefixed managed key written
 * by the existing upload rail, or a legacy pasted URL), so the serve rail branches on it exactly as
 * it already does.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it never moves `confirmed` -> `awaiting_acceptance`. That is
 * D-27's lane (the `artifact_timer` amendment), and doing it here would take every artifact booking
 * off the only completion path that exists today — see
 * `ARTIFACT_REDELIVERY_REOPEN_FROM_STATUSES` for the full reasoning.
 *
 * §14: `actorUserId` is the session's and must be the booking's `provider_id`.
 */
export async function deliverArtifact(input: {
  bookingId: string;
  actorUserId: string;
  /** The stored pointer value. `null` = deliver nothing new (re-stamp the instant only). */
  fileValue: string | null;
  now?: Date;
}): Promise<DeliverResult | AcceptanceRefusal> {
  const now = input.now ?? new Date();
  const ctx = await loadContext(input.bookingId);
  if (!ctx || ctx.providerId !== input.actorUserId) {
    return refuse(404, "not_found", "Booking not found");
  }
  if (ctx.mode === null) {
    return refuse(409, "no_acceptance_affordance", "This booking has no artifact deliverable.");
  }
  const file = (input.fileValue ?? "").trim();
  if (!file && !(ctx.bookingFile ?? "").trim()) {
    // §13: an artifact never uploaded is "not delivered yet", never "delivered, nothing attached".
    return refuse(400, "nothing_delivered", "Attach the file for this booking before delivering it.");
  }
  if (!ARTIFACT_DELIVERY_FROM_STATUSES.includes(ctx.status ?? "")) {
    return refuse(409, "wrong_status", "This booking isn't in a state where a deliverable can be sent.");
  }

  return await db.transaction(async (tx) => {
    // §15/§18b: the delivery write is itself conditional on the paid-equivalent states, so a
    // concurrent cancel/refund wins and nothing is stamped on a dead row.
    const written = await tx.execute(sql`
      UPDATE service_bookings
         SET delivered_at = ${now},
             deliverable_file = COALESCE(${file || null}, deliverable_file),
             updated_at = ${now}
       WHERE id = ${input.bookingId}
         AND status IN (${sql.join(ARTIFACT_DELIVERY_FROM_STATUSES.map((v) => sql`${v}`), sql`, `)})
      RETURNING id
    `);
    if (written.rows.length === 0) {
      return refuse(409, "lost_race", "This booking changed before your delivery was applied. Reload and try again.");
    }

    // D-25: the open rows this delivery answers. `resolved_at` NULL = still open, so the predicate
    // is the guard here too — a row already resolved is never re-stamped.
    const resolved = await tx
      .update(bookingRevisionRequests)
      .set({ resolvedAt: now })
      .where(
        and(
          eq(bookingRevisionRequests.bookingId, input.bookingId),
          isNull(bookingRevisionRequests.resolvedAt),
        ),
      )
      .returning({ id: bookingRevisionRequests.id });

    let reopened = false;
    if (ctx.mode === "gates_completion") {
      const flipped = await tx.execute(sql`
        UPDATE service_bookings
           SET status = 'awaiting_acceptance', updated_at = ${now}
         WHERE id = ${input.bookingId}
           AND status IN (${sql.join(ARTIFACT_REDELIVERY_REOPEN_FROM_STATUSES.map((v) => sql`${v}`), sql`, `)})
        RETURNING id
      `);
      reopened = flipped.rows.length > 0;
    }

    return {
      ok: true as const,
      mode: ctx.mode as AcceptanceMode,
      deliveredAt: now.toISOString(),
      resolvedRevisions: resolved.length,
      reopenedAcceptance: reopened,
      acceptanceDeadline: acceptanceDeadline(now, acceptanceWindowDays()),
    };
  });
}
