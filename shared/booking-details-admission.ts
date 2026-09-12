/**
 * BOOKING-DETAILS ADMISSION — the server-authored keys a request body may never write.
 *
 * Punchlist V-10; ledger `2026-09-12-booking-birth-holes`. §19's standing class, one layer INSIDE
 * the column: `createBookingRequestSchema` is a genuine pick-based allowlist (ruling 46), and two
 * of the five keys it admits — `bookingDetails` and `bookingMetadata` — are FREE-FORM jsonb. The
 * allowlist therefore stops at the column boundary, and everything the server later stores inside
 * that jsonb was reachable from `req.body` at BIRTH.
 *
 * WHY THAT IS A MONEY HOLE AND NOT UNTIDINESS. `booking_details.travelerCharge` is the ERA
 * DISCRIMINATOR: `travelerChargeBasis` reads that key's PRESENCE — nothing else — to decide
 * whether a row was priced under the A3 composition or the pre-A3 one, and `travelerChargeForRow`
 * then computes a DIFFERENT amount on each branch. Three live readers act on the answer: the
 * cancellation quote (`cancellation-policy.service.ts`), the REFUND CEILING clamp
 * (`stripe-payment.service.ts`) and the checkout re-drive's charged-amount reconstruction
 * (`checkout-claim.service.ts`). A body that plants the key moves a row's refund ceiling and
 * changes what a re-drive charges — without touching a single money COLUMN, which is why §14's
 * `req.body.amount` grep and §19's column-level strips both look straight past it.
 *
 * WHAT THIS MODULE IS, AND WHAT IT IS NOT.
 *   • It is a STRIP, applied where client data becomes a row. It removes the named keys; it never
 *     rejects the request, so the legitimate half of a body still lands (the PS15 posture — the
 *     strip is silent to the caller, and no real client is broken by it).
 *   • It is NOT a composition or a reading. `composeTravelerCharge` stays the ONE composition and
 *     `travelerChargeForRow` the ONE reading (§18 rule 1); this module only decides ADMISSION.
 *
 * ── STATED NEGATIVE SPACE (§18d), and it is the load-bearing half ────────────────────────────
 * THIS IS A DENYLIST, inside a column §19 would rather see behind an allowlist. That is a
 * deliberate limit, not an oversight: `booking_details` is documented as "trip dates, preferences,
 * requirements" — an open traveler-authored shape with no ratified key set — so an allowlist here
 * would have to invent one and would silently drop whatever a caller legitimately sends. The
 * allowlist is therefore filed as the follow-up (it needs a ratified `booking_details` shape,
 * which is a decision nobody has taken), and until it lands this list must be EXTENDED BY HAND
 * whenever a lane starts storing a new server-authored fact in this jsonb. A key absent from the
 * list is unguarded, not exonerated.
 *
 * THE SET IS PINNED BY A TEST, not by this comment: `booking-birth-provenance.db.test.ts` B7
 * asserts it verbatim and asserts that the two keys with their own declared constants
 * (`TRAVELER_CHARGE_SNAPSHOT_KEY` here, `BALANCE_PAYER_DETAIL_KEY` in `checkout-claim.service.ts`)
 * are members — so a rename of either spelling fails CI rather than quietly leaving a key
 * admissible under its new name.
 */

/**
 * The `booking_details` key a checkout claim stamps so a row SAYS which composition priced it.
 * Its PRESENCE is the discriminator (§13): a row without it was charged under the pre-A3
 * composition and must be read back that way, never re-derived as if it had been fixed. There is
 * no backfill — inventing a concierge portion for a historical row would manufacture a fact.
 *
 * DECLARED HERE rather than in `server/services/traveler-charge.ts` (which re-exports it, so every
 * existing importer is unchanged) for one reason: the admission layer lives in `shared/` and must
 * name the same key the composition does. Two spellings of one key is the drift class §18 rule 1
 * names — and here it would fail OPEN, leaving the key admissible under the spelling the strip
 * forgot.
 */
export const TRAVELER_CHARGE_SNAPSHOT_KEY = "travelerCharge";

/**
 * Keys inside `service_bookings.booking_details` / `booking_metadata` that the SERVER authors and
 * that a later reader BRANCHES ON. Each one names its reader, because a key with no reader does
 * not belong here — this list is the money/provenance family, not a tidiness list.
 */
export const SERVER_AUTHORED_BOOKING_DETAIL_KEYS = [
  // The A3 era discriminator — V-10's subject. Readers: traveler-charge.ts (via the cancellation
  // quote, the refund ceiling clamp and the checkout re-drive).
  TRAVELER_CHARGE_SNAPSHOT_KEY,
  // The traveler service fee ACTUALLY charged. Readers: the fee ledger, the reconciliation job's
  // expected charge, the re-drive.
  "travelerServiceFee",
  // §15b's pre-flight marker and its sibling key. Readers: the TTL sweep (an unmarked row is
  // provably un-attempted and safe to void) and §19b's `payment_provenance_unverified` predicate —
  // so a planted marker would forge exactly the provenance that classification exists to test.
  "stripeAttemptAt",
  "stripeIdempotencyKey",
  // The complete inventory claim a checkout took. Reader: the slot-release path.
  "claimedSlotIds",
  // §15c's ops-visible late-signal record. Reader: GET /api/admin/bookings/reconciliation-exceptions.
  "reconciliationException",
  // Fee-lane provenance (which lane priced the line). Reader: fee-ledger.service.ts.
  "railsAttribution",
  // Rate provenance (§18 — a RATE is never client-settable, and neither is the record of one).
  "directRateResolution",
  // §15d's record of WHO paid a balance. Reader: the promotion's diary row. Spelled here to match
  // `BALANCE_PAYER_DETAIL_KEY`; B7 asserts the two agree.
  "balancePaidByUserId",
  // Completion evidence — the escrow release reads it. A body-authored completion would be a
  // fulfillment claim nobody made.
  "completion",
  // The plan item this booking flips to `purchased`. Written server-side from the cart line.
  "itineraryItemId",
] as const;

export type ServerAuthoredBookingDetailKey = (typeof SERVER_AUTHORED_BOOKING_DETAIL_KEYS)[number];

const KEY_SET: ReadonlySet<string> = new Set<string>(SERVER_AUTHORED_BOOKING_DETAIL_KEYS);

export interface BookingDetailStripResult {
  /** The value with every server-authored key removed. Non-objects pass through untouched. */
  value: unknown;
  /** The keys actually removed — EMPTY for an ordinary body, so a caller can be ops-visible about
   *  the one case that matters without logging on every booking (§13: a refused answer and an
   *  absent one are different facts). */
  stripped: string[];
}

/**
 * Remove every server-authored key from ONE jsonb value.
 *
 * TOP LEVEL ONLY, deliberately: every key above is stored at the top of the object by its own
 * writer, and a recursive scrub would start deleting a traveler's own nested note because it
 * happened to be called `completion`. A nested copy is inert — no reader looks below the top
 * level for any of these — so the strip matches the readers rather than exceeding them.
 *
 * PURE. No clock, no db, no logging: the caller decides what to do with `stripped`.
 */
export function stripServerAuthoredBookingDetails(value: unknown): BookingDetailStripResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { value, stripped: [] };
  }
  const source = value as Record<string, unknown>;
  const stripped: string[] = [];
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (KEY_SET.has(key)) {
      stripped.push(key);
      continue;
    }
    out[key] = source[key];
  }
  return stripped.length === 0 ? { value, stripped } : { value: out, stripped };
}

/** Convenience for the layers that only need the cleaned value. */
export function withoutServerAuthoredBookingDetails(value: unknown): unknown {
  return stripServerAuthoredBookingDetails(value).value;
}
