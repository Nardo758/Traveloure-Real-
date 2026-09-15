/**
 * plan-work-access.service.ts — RULING 11: PLAN WORK SOLD AS A LISTING GRANTS ACCESS AT CHECKOUT.
 *
 * Ledger `2026-09-08-rulings-11-12` (ratified), executed by lane L25
 * (`2026-09-15-plan-work-one-rail`). CLAUDE.md Locked Decision 32 (the ONE author of
 * `trip_expert_advisors` and its status ladder), Locked Decision 42 D5/D7, §12, §13, §15b,
 * §18 rule 1.
 *
 * THE RULING, IN ONE SENTENCE. A planning-tier listing bought at checkout writes the
 * `trip_expert_advisors` row ON AUTHORIZATION, inside the booking's own transaction, through the
 * EXISTING one author `upsertTripAdvisorRow` — one more CALLER, never a seventh insert site. The
 * traveler buys once; hiring is not a second step they can forget.
 *
 * AND ITS TWIN, RULING 12: a CONSULT is an ordinary service booking that writes NO advisor row.
 * Buying advice is not gaining write access to a plan, which is exactly why a consult does not
 * collide with LD 32's "no expert touchpoint exists without a slip". Nothing in this module fires
 * for a consult, and `plan-work-access` is deliberately named for the one class that grants.
 *
 * ─── WHAT "PLAN WORK" MEANS HERE, AND WHY IT IS READ OFF THE SNAPSHOT ────────────────────────
 *
 * The class is `impactClassFor`'s (`shared/impact-class.ts`) — the ONE impact-class lookup, which
 * is already the authority for the buy side, the sell side and the offering-commerce contract. A
 * second "is this plan work?" test beside it is the derivation-drift class §18 rule 1 names.
 *
 * At AUTHORIZATION the keys it reads come from `service_bookings.offering_contract_snapshot`
 * (migration 291, ledger `2026-09-12-offering-contract-snapshot`) — the listing facts AS THEY WERE
 * when the booking was committed — and NEVER from the live `provider_services` row. A seller who
 * relists between the claim and the authorization must not be able to change what the traveler
 * bought, in either direction: not into a grant they did not buy, and not out of one they did.
 *
 * The snapshot's `resolution` is deliberately NOT consulted. A listing can be unresolvable for a
 * reason that has nothing to do with what it does to a plan (§11's instant-with-custom-quote
 * contradiction, say), and the impact class is derivable from the listing facts either way. Where
 * the CLASS itself is underivable, `impactClassFor` answers `null` and nothing is granted (§13).
 *
 * §13 — EVERY ABSENCE IS AN ANSWER, AND NONE OF THEM GRANTS.
 *   · NULL snapshot = NEVER SNAPSHOTTED (a pre-migration-291 row, or a transport booking with no
 *     listing behind it). Nothing is granted, and the live listing is NOT re-resolved to fill the
 *     gap — that would turn "we never recorded it" into "this is what they bought".
 *   · NULL `trip_id` = the booking names no plan. Nothing is granted here; ruling 11's precondition
 *     is enforced at the CHECKOUT CLAIM, before any Stripe call (see `PLAN_WORK_NEEDS_PLAN_REFUSAL`
 *     and its use in `POST /api/checkout`) — never at authorization, after money has moved.
 *   · NULL `provider_id` = no seller to grant access TO. Nothing is granted and no id is invented.
 *
 * ─── WHY `accepted` AND NOT `assigned` ───────────────────────────────────────────────────────
 *
 * Both are §12 WRITE-access statuses and both sit at rank 2 of LD 32's ladder, so neither can
 * downgrade the other. They differ in WHAT THEY RECORD. `assigned` is the platform's own act of
 * routing a lead (`confirmLeadAssignmentTx`, the admin lead-confirm) — nobody routed this; the
 * traveler picked the listing off a shelf. `accepted` records that the expert agreed to this work,
 * which is precisely what publishing a bookable listing and having it bought IS.
 *
 * It is also the EXISTING precedent for the identical situation: `ready-made.routes.ts` grants the
 * selling expert `accepted` on the buyer's clone so they can perform the paid revision. Ruling 11
 * is that same shape one table over — a purchase granting the seller write access to the buyer's
 * plan — so it writes the same status rather than inventing a second vocabulary for it.
 *
 * ─── §15b — AN ANCILLARY EFFECT MAY NOT BREAK THE OPERATION THAT AUTHORIZES IT ───────────────
 *
 * The grant runs INSIDE the authorization transaction (the ruling's own words), so an authorization
 * that rolls back leaves no advisor row — access is never granted for a booking that was never
 * authorized. The converse must NOT hold: a failed grant may not roll back an authorization Stripe
 * has already acted on. Each upsert therefore runs in its own SAVEPOINT (drizzle's nested
 * `transaction`), so a failure rolls back only itself, is logged loudly, and leaves the stamp
 * standing. This function never throws.
 *
 * IDEMPOTENT BY CONSTRUCTION. `upsertTripAdvisorRow` is a single atomic
 * `INSERT … ON CONFLICT DO UPDATE` whose status arm only ever moves UP the ladder, so a replayed
 * authorization (the late-stamp path inside `promotePaidCheckout`) re-asserts exactly the same row
 * and an expert already `accepted`/`assigned` is left untouched.
 *
 * NEGATIVE SPACE (§18d — green means green-within-stated-bounds):
 *   · It grants only on the CART rail's authorization stamp. The transport rail
 *     (`stampTransportPaymentIntent`) sells no `provider_services` listing and carries no snapshot,
 *     so it is out of scope by construction rather than by omission.
 *   · It writes no notification and sends no email. Telling the expert is a separate lane; this one
 *     is about the access the traveler paid for existing at all.
 *   · It never UPDATES an advisor row's other columns (`workspace_status`, `expert_response`, the
 *     plan-approval handshake). Those are the one author's insert-only fields and stay so.
 */
import { sql } from "drizzle-orm";

import { impactClassFor } from "@shared/impact-class";
import { logger } from "../infrastructure/logger";
import {
  upsertTripAdvisorRow,
  type TripAdvisorRowExecutor,
} from "./booking-actions.service";
import { loadOfferingListingInput } from "./offering-listing-input";
import type { TripAdvisorRowStatus } from "../utils/trip-advisor-status";

/** The ONE impact class this module acts on. Named once so no caller spells it (§18 rule 1). */
export const PLAN_WORK_IMPACT_CLASS = "plan_work" as const;

/** The §12 WRITE-access status a purchase grants. See the header for why not `assigned`. */
export const PLAN_WORK_GRANT_STATUS: TripAdvisorRowStatus = "accepted";

/** The note recorded on a row this rail creates, so the workspace says where the access came from. */
export const PLAN_WORK_GRANT_MESSAGE =
  "Plan work purchased at checkout — write access granted with the booking.";

/**
 * THE ONE SENTENCE THE CHECKOUT SAYS WHEN PLAN WORK IS BOUGHT WITH NO PLAN (§13 — a refusal is a
 * sentence, never a silent drop). Shaped like `PRICELESS_LISTING_REFUSAL` in
 * `buy-action-payload.ts`, and for the same reason: the rail that refuses and the surface that
 * explains must not be two different wordings of the same rule.
 */
export const PLAN_WORK_NEEDS_PLAN_REFUSAL = {
  reason: "plan_work_requires_a_plan" as const,
  message:
    "Plan work is done inside a plan, so this purchase needs one. Start or pick a plan and try again.",
};

/** The listing facts `impactClassFor` reads. Exactly its input, never a second shape. */
interface PlanWorkListingFacts {
  offeringTypeKey?: string | null;
  categoryKey?: string | null;
  deliveryMethod?: string | null;
}

/** The one predicate. `null`/unclassifiable ⇒ NOT plan work; nothing is guessed (§13). */
export function isPlanWorkFacts(facts: PlanWorkListingFacts | null | undefined): boolean {
  return impactClassFor(facts) === PLAN_WORK_IMPACT_CLASS;
}

/**
 * PURE. Reads the listing facts out of a stored `offering_contract_snapshot` and classifies them.
 *
 * A NULL, non-object or shape-less snapshot is NOT plan work: it says "never snapshotted", which is
 * a fact about our own record-keeping and not a statement about the listing (§13).
 */
export function isPlanWorkSnapshot(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const listing = (snapshot as { listing?: unknown }).listing;
  if (!listing || typeof listing !== "object") return false;
  const l = listing as Record<string, unknown>;
  return isPlanWorkFacts({
    offeringTypeKey: typeof l.offeringTypeKey === "string" ? l.offeringTypeKey : null,
    categoryKey: typeof l.categoryKey === "string" ? l.categoryKey : null,
    deliveryMethod: typeof l.deliveryMethod === "string" ? l.deliveryMethod : null,
  });
}

/**
 * DB-backed, for the CHECKOUT CLAIM's pre-flight only: is this LIVE listing plan work?
 *
 * The claim is the one moment at which "live" is the right thing to read — it is what the traveler
 * is buying right now, and no snapshot exists yet. It goes through the SHARED
 * `loadOfferingListingInput` (the ONE assembly of a `provider_services` row into the contract's
 * input shape), so this rail and the snapshot cannot disagree about what a listing's keys are.
 *
 * A listing that cannot be loaded is not plan work as far as this predicate is concerned — there is
 * nothing to classify, and refusing a checkout on an absent row would be a claim about it (§13).
 */
export async function isPlanWorkListing(serviceId: string | null | undefined): Promise<boolean> {
  if (!serviceId) return false;
  const listing = await loadOfferingListingInput({ serviceId });
  return isPlanWorkFacts(listing);
}

/** One row's worth of what the grant needs. Read back inside the authorization transaction. */
interface PlanWorkBookingRow {
  id: string;
  tripId: string | null;
  providerId: string | null;
  snapshot: unknown;
}

export interface PlanWorkGrantResult {
  /** Bookings whose snapshot says plan work AND which carried both a trip and a seller. */
  granted: string[];
  /** Plan-work bookings that could not be granted, with the fact that stopped it (§13). */
  skipped: Array<{ bookingId: string; reason: "no_trip" | "no_seller" | "grant_failed" }>;
}

/**
 * RULING 11's WRITE. Called from inside the authorization transaction with that transaction's own
 * handle, so the grant and the PaymentIntent stamp commit or roll back together.
 *
 * ONE MORE CALLER of `upsertTripAdvisorRow`, never a second insert site — LD 32's correction and
 * `scripts/check-advisor-row-author.cjs` both say so, and the status ladder there is what makes a
 * replay safe and what stops this rail ever downgrading an expert who already holds the trip.
 *
 * NEVER THROWS (§15b): every upsert is savepointed, so a failed grant costs the traveler nothing
 * they already paid for and is loud in the log instead.
 */
export async function grantPlanWorkAdvisorAccess(
  exec: TripAdvisorRowExecutor,
  bookingIds: string[],
): Promise<PlanWorkGrantResult> {
  const result: PlanWorkGrantResult = { granted: [], skipped: [] };
  if (bookingIds.length === 0) return result;

  let rows: PlanWorkBookingRow[];
  try {
    const read = await (exec as any).execute(sql`
      SELECT id, trip_id, provider_id, offering_contract_snapshot
      FROM service_bookings
      WHERE id IN (${sql.join(bookingIds.map((id) => sql`${id}`), sql`, `)})
    `);
    rows = (read.rows ?? []).map((r: any) => ({
      id: String(r.id),
      tripId: r.trip_id == null ? null : String(r.trip_id),
      providerId: r.provider_id == null ? null : String(r.provider_id),
      snapshot: r.offering_contract_snapshot ?? null,
    }));
  } catch (err) {
    // The read is INSIDE the authorization transaction, so a failure here would otherwise poison
    // it. Nothing is granted and the stamp stands (§15b).
    logger.error(
      { err, bookingIds },
      "[plan-work-access] could not read the authorized rows — no advisor access granted (bookings stand)",
    );
    return result;
  }

  for (const row of rows) {
    if (!isPlanWorkSnapshot(row.snapshot)) continue;
    if (!row.tripId) {
      // The claim step refuses this before Stripe is called; reaching it here means a row was born
      // on some other rail. Recorded, never invented into a plan (§13).
      result.skipped.push({ bookingId: row.id, reason: "no_trip" });
      logger.error(
        { bookingId: row.id },
        "[plan-work-access] plan-work booking carries no trip — no advisor row (ruling 11's precondition; LD 32)",
      );
      continue;
    }
    if (!row.providerId) {
      result.skipped.push({ bookingId: row.id, reason: "no_seller" });
      logger.error(
        { bookingId: row.id, tripId: row.tripId },
        "[plan-work-access] plan-work booking names no seller — no advisor row",
      );
      continue;
    }
    try {
      // SAVEPOINT: a failed grant rolls back only itself, never the authorization stamp above it.
      await (exec as any).transaction(async (sp: TripAdvisorRowExecutor) => {
        await upsertTripAdvisorRow({
          tripId: row.tripId as string,
          localExpertId: row.providerId as string,
          status: PLAN_WORK_GRANT_STATUS,
          message: PLAN_WORK_GRANT_MESSAGE,
          tx: sp,
        });
      });
      result.granted.push(row.id);
    } catch (err) {
      result.skipped.push({ bookingId: row.id, reason: "grant_failed" });
      logger.error(
        { err, bookingId: row.id, tripId: row.tripId, expertUserId: row.providerId },
        "[plan-work-access] advisor grant failed — the booking's authorization STANDS and the traveler " +
          "is owed write access that was not written (§15b: an ancillary effect may not break the " +
          "operation that authorizes it)",
      );
    }
  }

  if (result.granted.length > 0 || result.skipped.length > 0) {
    logger.info(
      { granted: result.granted.length, skipped: result.skipped },
      "[plan-work-access] ruling 11 grant pass complete",
    );
  }
  return result;
}
