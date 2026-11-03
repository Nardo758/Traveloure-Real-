/**
 * CAP-1 (ledger `2026-11-03-cap1-trip-capabilities`): the plancard GET's viewer gate, EXTRACTED UNCHANGED so the
 * capabilities read (`GET /api/trips/:tripId/capabilities`) decides who may read a plan with the SAME code and the
 * SAME codes (404 / 403). Widening it is out of scope; the "known pre-launch bypass" note below is kept verbatim.
 */
import { storage } from "../storage";
import { getTripRole } from "../utils/trip-role";
import { isTripAuthor } from "../utils/trip-authorship";
import { isManagingEaForTrip } from "./ea-plan-delegate.service";
import { isTripPayer } from "./balance-payer.service";

export type PlancardTrip = NonNullable<Awaited<ReturnType<typeof storage.getTrip>>>;

export type PlancardViewer =
  | {
      ok: true;
      trip: PlancardTrip;
      /** Exactly the value the plancard GET passes to the assembler: owner/expert/friend from getTripRole, else delegate/payer, else null. */
      tripRole: string | null;
      /** True when the legacy fallback admitted this viewer as an assigned expert. */
      isAssignedExpert: boolean;
      /** True when the legacy fallback admitted this viewer as the trip's author. */
      isAuthor: boolean;
    }
  | { ok: false; deny: 404 | 403 };

export async function resolvePlancardViewer(tripId: string, userId: string): Promise<PlancardViewer> {
  const trip = await storage.getTrip(tripId);
  if (!trip) {
    return { ok: false, deny: 404 };
  }

  let tripRole: string | null = await getTripRole(tripId, userId);
  let isAssignedExpertOut = false;
  let isAuthorOut = false;

  if (!tripRole) {
    // Legacy fallback: check trip_expert_advisors for assigned experts
    const assignment = await storage.getTripExpertAdvisoryAssignment(tripId, userId);
    const isAssignedExpert = assignment && ['pending', 'accepted'].includes(assignment.status);
    // Authoring mode (ready-made brief §2/§4): the trip's AUTHOR may render their own build.
    // A PARALLEL named branch beside getTripRole — the helper itself is deliberately untouched
    // (known pre-launch bypass, separate fix). getTripRole returns null for an author (no
    // collaborator/advisor row), so without this branch authoring mode 403s its own itinerary.
    const isAuthor = isAssignedExpert ? false : await isTripAuthor(tripId, userId);
    // LD 52 (C): the executive assistant managing this plan under a LIVE accepted link. Rendered
    // as "delegate" — it edits for the owner but is never shown as "your expert" and never gets
    // the owner's pay/finalize controls (the slip decides that from this role).
    const isManagingEa = isAssignedExpert || isAuthor ? false : await isManagingEaForTrip(tripId, userId);
    // LD 42 D9 (ledger `2026-09-27-payer-reads-plancard`): a `payer`-role `trip_participants` row
    // on THIS trip is half of the bookings section's audience (owner + payer), so it READS the
    // plan the balance belongs to. The role test is the ONE `balance-payer.service.ts` comparison
    // `canPayBalance` also uses (§18 rule 1). READ-ONLY: this arm lives on this read gate alone —
    // no write rail, owner-tier read (guest roster / PII), trip pass or proposal rail admits it,
    // and `authorizeTripLogistics` is untouched. Rendered as "payer" so the slip draws no tools.
    const isPayer =
      isAssignedExpert || isAuthor || isManagingEa ? false : await isTripPayer(tripId, userId);
    if (!isAssignedExpert && !isAuthor && !isManagingEa && !isPayer) {
      return { ok: false, deny: 403 };
    }
    if (isManagingEa) tripRole = "delegate";
    else if (isPayer) tripRole = "payer";
    isAssignedExpertOut = !!isAssignedExpert;
    isAuthorOut = !!isAuthor;
  }

  return { ok: true, trip, tripRole, isAssignedExpert: isAssignedExpertOut, isAuthor: isAuthorOut };
}
