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
 * R149 (ledger `2026-09-27-checkout-stamp-from-line-trip`): THE ONE OWNERSHIP READ over a cart's
 * lines. Each DISTINCT plan id the lines name is checked ONCE against the SESSION user
 * (`verifyTripOwnership`). Both callers read it: the checkout's booking STAMP (a line is stamped to its
 * own plan, and a line on a plan the user does not own is REFUSED before any booking is written) and
 * the Trip Pass waiver below (ownership is checked BEFORE the entitlement is read). A second
 * ownership loop beside this one is the drift §18 rule 1 names.
 *
 * `failed` is kept apart from `notOwned` on purpose: a lookup that threw proves nothing either way,
 * so the waiver treats it as uncovered (fail closed) and the stamp treats it as unverifiable.
 */
export interface OwnedLineTrips {
  owned: Set<string>;
  notOwned: Set<string>;
  failed: Set<string>;
}

export async function resolveOwnedLineTripIds(
  userId: string,
  lines: readonly (TripPassCoverageLine | null | undefined)[],
  deps?: Pick<TripPassCoverageDeps, "ownsTrip">,
): Promise<OwnedLineTrips> {
  const out: OwnedLineTrips = { owned: new Set(), notOwned: new Set(), failed: new Set() };
  const distinct = Array.from(new Set(lines.map(lineTripId).filter((t): t is string => t !== null)));
  if (distinct.length === 0) return out;
  if (!userId) {
    for (const t of distinct) out.notOwned.add(t);
    return out;
  }
  const ownsTrip = deps?.ownsTrip ?? (await defaultDeps()).ownsTrip;
  for (const tripId of distinct) {
    try {
      if (await ownsTrip(tripId, userId)) out.owned.add(tripId);
      else out.notOwned.add(tripId);
    } catch (err: any) {
      out.failed.add(tripId);
      console.error(`[trip-pass-line-coverage] ownership lookup failed for trip ${tripId}:`, err?.message ?? err);
    }
  }
  return out;
}

/**
 * The set of the caller's OWN plan ids, among those the lines name, whose active Trip Pass covers the
 * traveler service fee. Ownership comes from `resolveOwnedLineTripIds` (ONE read), and only an OWNED
 * trip's entitlement is ever consulted, so a foreign trip's pass is never even read.
 */
export async function resolveTripPassCoveredTripIds(
  userId: string,
  lines: readonly (TripPassCoverageLine | null | undefined)[],
  deps?: TripPassCoverageDeps,
  ownedLineTrips?: OwnedLineTrips,
): Promise<Set<string>> {
  const covered = new Set<string>();
  if (!userId) return covered;
  const d = deps ?? (await defaultDeps());
  const { owned } = ownedLineTrips ?? (await resolveOwnedLineTripIds(userId, lines, d));
  for (const tripId of Array.from(owned)) {
    try {
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

/**
 * The cart-ADD twin of the checkout pre-flight (ledger `2026-09-28-cart-add-trip-ownership`,
 * follows R209). `POST /api/cart` and `POST /api/cart/items` accepted a body `tripId` onto the
 * line with no ownership check. Checkout already refuses a foreign plan, so it could grant nothing,
 * but a line should never be BORN on someone else's plan. Same ONE ownership read (§18 rule 1).
 *
 *   - absent / null / "" ⇒ no plan: `null` (the add proceeds, a standalone line).
 *   - any other non-string ⇒ 400: a plan id is a string, and a malformed one is not guessed at.
 *   - a plan the SESSION user does not own ⇒ 403 `trip_not_owned`.
 *   - an ownership lookup that threw ⇒ 503 `trip_unverified`: never written on a guess.
 */
export async function cartAddTripRefusal(
  userId: string,
  tripId: unknown,
  deps?: Pick<TripPassCoverageDeps, "ownsTrip">,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  if (tripId === undefined || tripId === null || tripId === "") return null;
  if (typeof tripId !== "string") {
    return { status: 400, body: { message: "tripId must be a string", reason: "trip_id_invalid" } };
  }
  const r = await resolveOwnedLineTripIds(userId, [{ tripId }], deps);
  if (r.owned.has(tripId)) return null;
  if (r.failed.has(tripId)) {
    return {
      status: 503,
      body: { message: "We couldn't confirm that plan. Please try again.", reason: "trip_unverified" },
    };
  }
  return { status: 403, body: { message: "That plan is not yours.", reason: "trip_not_owned" } };
}
