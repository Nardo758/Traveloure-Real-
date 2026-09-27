/**
 * THE TRIP PASS SERVICE-FEE WAIVER IS DECIDED PER CART LINE, FROM THE LINE'S OWN PLAN, OWNER-VERIFIED
 * (ledger `2026-09-27-trip-pass-waiver-per-line`, R148; decision-maker ruled Sep 27, 2026).
 *
 * Before this module, `POST /api/checkout` waived the traveler service fee on EVERY line of the cart
 * when the REQUEST BODY named a `tripId` holding an active Trip Pass — and that body `tripId` was
 * never ownership-checked. Two defects in one line:
 *
 *   - SECURITY (§14): a crafted request naming SOMEONE ELSE'S Trip-Pass trip had its fee waived. The
 *     identity that grants a money suppression was client-chosen.
 *   - LD 41 NOT MET: the one cart checkout caller (`cart.tsx`) sends no `tripId`, so a Trip Pass holder
 *     was charged the fee the pass sells them out of at the primary checkout.
 *
 * The ruling, and what this module enforces:
 *   1. A line is covered ONLY when (a) its own server-side `cart_items.trip_id` is set, (b) the SESSION
 *      user owns that trip (`verifyTripOwnership`), and (c) `coversAction(tripId, "traveler_service_fee")`
 *      is true. Each distinct trip is resolved ONCE.
 *   2. The body `tripId` grants NOTHING — this module never sees it. Its callers pass cart ROWS.
 *   3. A standalone line (no `trip_id`) is NEVER covered, by construction: it has no plan to hold a pass.
 *   4. ONE implementation (§18 rule 1): the checkout charge AND the `GET /api/cart` fee preview decide
 *      coverage here, so the preview and the charge cannot disagree about which line is waived.
 *   5. RAILS FIRST, ONE WAIVER PER LINE: `lineFeeWaiverBasis` is the ONE precedence rule — a line the
 *      provider's referral link already waived keeps its rails waiver, and a Trip Pass never stacks.
 *
 * FAIL CLOSED: an ownership or entitlement lookup that throws leaves THAT trip uncovered (the fee is
 * charged in full, exactly the pre-existing "best-effort, never a guess" posture) and is logged. No
 * amount, rate or literal lives here (§8/§14): the waiver's shape is still `resolveTripPassFeeWaiver`
 * and the fee is still `resolveTravelerServiceFeeSnapshot`, called by the caller.
 *
 * The real dependencies are loaded lazily so the decision is provable by a pure test with no database.
 */

/** A cart row as the caller holds it — only its own plan id is read, never a price. */
export interface TripPassCoverageLine {
  tripId?: string | null;
}

export interface TripPassCoverageDeps {
  ownsTrip: (tripId: string, userId: string) => Promise<boolean>;
  coversTravelerFee: (tripId: string) => Promise<boolean>;
}

async function defaultDeps(): Promise<TripPassCoverageDeps> {
  const [{ verifyTripOwnership }, { coversAction }] = await Promise.all([
    import("../utils/trip-ownership"),
    import("./trip-entitlement.service"),
  ]);
  return {
    ownsTrip: verifyTripOwnership,
    coversTravelerFee: (tripId) => coversAction(tripId, "traveler_service_fee"),
  };
}

function lineTripId(line: TripPassCoverageLine | null | undefined): string | null {
  const t = line?.tripId;
  return typeof t === "string" && t.length > 0 ? t : null;
}

/**
 * The set of the caller's OWN plan ids, among those the lines name, whose active Trip Pass covers the
 * traveler service fee. Distinct trips are resolved once; ownership is checked BEFORE the entitlement
 * is read, so a foreign trip's pass is never even consulted.
 */
export async function resolveTripPassCoveredTripIds(
  userId: string,
  lines: readonly (TripPassCoverageLine | null | undefined)[],
  deps?: TripPassCoverageDeps,
): Promise<Set<string>> {
  const covered = new Set<string>();
  if (!userId) return covered;
  const distinct = Array.from(new Set(lines.map(lineTripId).filter((t): t is string => t !== null)));
  if (distinct.length === 0) return covered;
  const d = deps ?? (await defaultDeps());
  for (const tripId of distinct) {
    try {
      if (!(await d.ownsTrip(tripId, userId))) continue;
      if (await d.coversTravelerFee(tripId)) covered.add(tripId);
    } catch (err: any) {
      // Fail closed for THIS trip only: its lines are charged in full, never guessed covered.
      console.error(
        `[trip-pass-line-coverage] coverage lookup failed for trip ${tripId} — its lines are not waived:`,
        err?.message ?? err,
      );
    }
  }
  return covered;
}

/** True only for a line ON a plan whose id is in the resolved covered set. A standalone line: never. */
export function tripPassCoversLine(
  line: TripPassCoverageLine | null | undefined,
  covered: ReadonlySet<string>,
): boolean {
  const t = lineTripId(line);
  return t !== null && covered.has(t);
}

/**
 * The ONE precedence rule for a line's traveler-fee waiver: rails first, else Trip Pass, else none.
 * Exactly the basis `resolveTravelerServiceFeeSnapshot` takes.
 */
export function lineFeeWaiverBasis(opts: {
  railsWaived: boolean;
  tripPassCovered: boolean;
}): "rails" | "trip_pass" | null {
  if (opts.railsWaived) return "rails";
  if (opts.tripPassCovered) return "trip_pass";
  return null;
}
