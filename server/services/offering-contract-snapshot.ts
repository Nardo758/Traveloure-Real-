/**
 * offering-contract-snapshot.ts — WHAT THE TRAVELER ACTUALLY BOUGHT UNDER, recorded at commitment.
 *
 * Lane OC-B1 of `docs/superpowers/specs/2026-09-11-offering-commerce-contract-implementation-plan.md`,
 * implementing §14.1 of the design. Ledger `2026-09-12-offering-contract-snapshot`; migration 291.
 *
 * WHY IT EXISTS. A listing is editable. Its delivery method, its booking mode, its price type and
 * its cancellation policy can all move after a booking is committed — and completion, settlement
 * and reversal (OC-D1/D2/D3) have to branch on the terms that were true THEN. Today the only rail
 * that needs one of those terms reads it LIVE: `cancellation-policy.service.ts` joins
 * `provider_services.cancellation_policy_type` at quote time, so a seller who tightens their policy
 * tightens it retroactively for every outstanding booking. This column is where that stops being
 * possible; it does not stop it in this lane, because B1 RECORDS and OC-B2/D3 DECIDE.
 *
 * WHAT THIS LANE CHANGES ABOUT CHECKOUT: NOTHING. No amount, no verb, no refusal, no idempotency
 * key, no claim predicate and no state transition moves. Nothing reads the snapshot to make a
 * decision. A booking that would have been created before this lane is created identically after
 * it, carrying one additional column.
 *
 * IT IS ONE MORE CALLER OF ONE RESOLVER (§18 rule 1). Every classification is
 * `resolveOfferingCommerceContract`'s — the same function the activation gate refuses on and the
 * audit counts with — and the listing→input assembly is the SHARED `loadOfferingListingInput`. A
 * second classification beside them is how a listing becomes activatable on terms its own sold
 * bookings never recorded.
 *
 * §13 — THE ABSENCES ARE ANSWERS, in three directions.
 *   · NO LISTING (a transport booking references `transport_booking_options`, not
 *     `provider_services`, so its `service_id` is NULL): NOTHING is stamped. There is no offering
 *     to describe and the resolver has no input kind that would honestly describe one.
 *   · UNRESOLVABLE LISTING: the REFUSAL is recorded verbatim — its machine-readable reason and the
 *     resolver's own sentence — never a nearest-looking archetype and never a default. This is the
 *     COMMON case in testing: production's 61 demo listings are KEPT by ruling
 *     (`2026-09-11-oc-a1-ratified`), they are bookable, and they resolve as unclassified. A booking
 *     of one says so.
 *   · A ROW COMMITTED BEFORE THIS LANE: the column is NULL, which means NEVER SNAPSHOTTED. There is
 *     no backfill. It keeps being read the way it WAS charged — through `travelerChargeForRow`'s
 *     own presence-discriminator, which this lane does not touch.
 *
 * §14/§19 — NOTHING HERE IS CLIENT-SUPPLIED. Every field is read from the server's own tables. The
 * column is omitted from `insertServiceBookingSchema` (layer 1) and stripped in
 * `createServiceBooking`/`createServiceBookingAtomic` before the stamp (layer 2, which also covers
 * the internal `as any` callers a type-level omit cannot reach), so no request body can plant one.
 *
 * §15 — ONE WRITE. The snapshot is composed BEFORE the insert and rides the SAME INSERT that
 * commits the booking; there is no second write that could disagree with the first, and no window
 * in which a row exists without the terms it was committed under. A composition failure is caught
 * and stamps NOTHING (§15b's rule that an ancillary effect may never break the operation that
 * authorizes it): a snapshot is worth less than a booking.
 *
 * WHY NO AMOUNTS ARE IN HERE, which is the half most likely to be "improved" later. §14.1's charge
 * snapshot is ALREADY ON THE ROW, term for term, and a second copy is precisely how a refund
 * ceiling and a cancellation quote start disagreeing (§18 rule 1):
 *   base price          → `total_amount` less `booking_details.travelSurcharge`
 *   travel surcharge    → `booking_details.travelSurcharge` (present only when one applied)
 *   traveler service fee + whether it was charged, and the waiver basis
 *                       → `booking_details.travelerServiceFee.{charged,wouldHaveBeen,waived,waiverBasis}`
 *                         and `booking_details.tripPassFeeWaiver`
 *   concierge fee       → `booking_details.travelerCharge.conciergeFee`
 *   commission / platform fee accounting → `platform_fee`, `provider_earnings`
 *   deposit, balance, due date → `deposit_amount`, `balance_amount`, `balance_due_at`
 *   insurance treatment → `insurance_fee`
 *   bundle component breakdown → `booking_details.bundleComponents`
 *   service window      → `booking_details.scheduledDate` / `checkIn` / `checkOut`
 * `composeTravelerCharge` stays the ONE composition and `travelerChargeForRow` the ONE reading of
 * which composition priced a row. This module recomputes neither and records neither.
 *
 * NEGATIVE SPACE, stated because green means green-within-stated-bounds (§18d):
 *   · The snapshot is taken at BIRTH — the moment the row is committed, which on the cart rail is
 *     the §15 atomic claim. It is not re-taken at authorization or promotion, and it deliberately
 *     does not describe the PAYMENT, which the claim machine already records.
 *   · `reschedulePolicyId` and `disputePolicyId` from §14's sketch are NOT recorded: no column
 *     holds either, and an id nobody stores is a claim (§13).
 *   · It says nothing about whether the archetype's required context was actually supplied. That is
 *     OC-B3, and a booking can carry a resolved contract and still be missing facts a fulfilment
 *     will need.
 */
import { eq } from "drizzle-orm";

import { db } from "../db";
import { logger } from "../infrastructure/logger";
import { providerServices } from "@shared/schema";
import {
  resolveOfferingCommerceContract,
  type OfferingCommerceResolution,
  type OfferingListingInput,
} from "./offering-commerce-contract";
import { loadOfferingListingInput } from "./offering-listing-input";

/**
 * The SNAPSHOT's own version, separate from `CONTRACT_VERSION`. The contract version says which
 * vocabulary the axes are drawn from; this says which shape the stored blob has. They move for
 * different reasons and collapsing them would make one of the two unreadable.
 */
export const OFFERING_CONTRACT_SNAPSHOT_VERSION = 1 as const;

/**
 * The listing facts the resolution was computed from — `OfferingListingInput` without its
 * discriminator. Stored so a later reader can see WHY the contract came out as it did, and so a
 * drift between the snapshot and today's listing is VISIBLE rather than inferred.
 */
export type SnapshotListingFacts = Omit<OfferingListingInput, "kind">;

export interface OfferingContractSnapshot {
  snapshotVersion: typeof OFFERING_CONTRACT_SNAPSHOT_VERSION;
  /** ISO-8601 UTC. When the terms were read — not when the booking was paid. */
  snapshotAt: string;
  listing: SnapshotListingFacts;
  /**
   * §14.1's "cancellation/reschedule policy", as far as this repository has one. The listing's
   * `cancellation_policy_type` AT COMMITMENT. NULL = the listing stated none, which is what
   * `computeCancellationRefund` already treats as its own case — never a default policy.
   */
  policy: { cancellationPolicyType: string | null };
  /**
   * The resolver's answer, VERBATIM — either the contract and its findings, or the refusal and its
   * machine-readable reason. Stored whole so the snapshot round-trips and so a refusal is a
   * recorded fact rather than an absence someone later fills in (§13).
   */
  resolution: OfferingCommerceResolution;
}

/**
 * PURE. Given the listing facts and the policy, produce the snapshot. Every decision inside is the
 * resolver's; this only stamps the time and the shape, which is why it can be proven without a
 * database.
 */
export function composeOfferingContractSnapshot(args: {
  listing: OfferingListingInput;
  cancellationPolicyType: string | null;
  at?: Date;
}): OfferingContractSnapshot {
  const { kind: _kind, ...facts } = args.listing;
  return {
    snapshotVersion: OFFERING_CONTRACT_SNAPSHOT_VERSION,
    snapshotAt: (args.at ?? new Date()).toISOString(),
    listing: facts,
    policy: { cancellationPolicyType: args.cancellationPolicyType },
    // Never narrowed, never edited: a refusal is stored with the same weight as a contract.
    resolution: resolveOfferingCommerceContract(args.listing),
  };
}

/**
 * DB-backed. Returns the snapshot for one listing, or `null` when there is no listing to describe
 * (no `serviceId`, or the row is gone) — in which case the column stays NULL and says "never
 * snapshotted", which is true.
 */
export async function buildOfferingContractSnapshot(opts: {
  serviceId?: string | null;
  ownerUserId?: string | null;
  at?: Date;
}): Promise<OfferingContractSnapshot | null> {
  if (!opts.serviceId) return null;

  const listing = await loadOfferingListingInput({
    serviceId: opts.serviceId,
    ownerUserId: opts.ownerUserId ?? null,
  });
  if (!listing) return null;

  // Read separately from the contract input because it is NOT a contract input: the cancellation
  // policy changes no axis, it is a term the traveler bought under. Keeping it out of
  // `loadOfferingListingInput` keeps that function exactly the resolver's argument shape.
  const [row] = await db
    .select({ cancellationPolicyType: providerServices.cancellationPolicyType })
    .from(providerServices)
    .where(eq(providerServices.id, opts.serviceId));

  return composeOfferingContractSnapshot({
    listing,
    cancellationPolicyType: row?.cancellationPolicyType ?? null,
    at: opts.at,
  });
}

/**
 * THE CALLER-FACING FORM, and the reason it exists: a snapshot may NEVER fail a booking.
 *
 * §15b's rule — an ancillary effect may not break the operation that authorizes it — applied here
 * because this runs inside the checkout claim path. A thrown read leaves the column NULL, which is
 * the same honest "never snapshotted" a pre-lane row carries, and logs loudly so the gap is
 * ops-visible rather than silent.
 */
export async function safeOfferingContractSnapshot(opts: {
  serviceId?: string | null;
  ownerUserId?: string | null;
}): Promise<OfferingContractSnapshot | null> {
  try {
    return await buildOfferingContractSnapshot(opts);
  } catch (err) {
    logger.error(
      { serviceId: opts.serviceId ?? null, err },
      "[offering-contract] snapshot composition failed — booking committed WITHOUT a contract snapshot",
    );
    return null;
  }
}
