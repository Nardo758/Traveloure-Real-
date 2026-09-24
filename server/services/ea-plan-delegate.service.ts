/**
 * EXECUTIVE-ASSISTANT PLANS — the ONE grant and the ONE mint (Locked Decision 52 (C), ledger
 * `2026-09-24-ea-plans-for-executive`).
 *
 * An executive assistant builds a plan the EXECUTIVE owns. The plan is an ordinary `trips` row
 * whose `user_id` is the executive; the assistant is recorded on the two columns that have existed
 * on `trips` since migration 0006 and had no writer until now:
 *   `managed_by_ea_id`          — the assistant's user id
 *   `ea_client_relationship_id` — the `ea_client_relationships` row that authorises it
 *
 * THE GRANT IS THE LINK, NOT THE COLUMN. `isManagingEaForTrip` passes only while the relationship
 * still exists, belongs to that assistant, and is ACCEPTED by the plan's own owner
 * (`client_user_id = trips.user_id`). An executive who revokes the link (the relationship row is
 * deleted) removes the assistant's access to every plan it built at once, and a column set without
 * a matching accepted link grants nothing. Both columns are server-written only: the client trip
 * rails admit neither (`tripClientBodySchema`, ledger `2026-09-24-trip-body-allowlist`).
 *
 * WHAT THE ASSISTANT MAY DO is decided where it is wired, not here: it edits like a WRITE-status
 * advisor (`authorizeTripLogistics` read + write, the inline item-create rail with origin
 * `assistant`), and it never reaches the owner tier (money between people, participant PII) or
 * any payment rail — those stay the executive's (LD 42 D19: a helper never pays).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
import { getEaClientRelationshipById } from "./experts-query.service";
import type { InsertTrip, Trip } from "@shared/schema";

/** The one grant predicate. Never throws: a failed read grants nothing. */
export async function isManagingEaForTrip(tripId: string, userId: string | null | undefined): Promise<boolean> {
  if (!tripId || !userId) return false;
  try {
    const r = await db.execute(sql`
      SELECT 1
      FROM trips t
      JOIN ea_client_relationships r ON r.id = t.ea_client_relationship_id
      WHERE t.id = ${tripId}
        AND t.managed_by_ea_id = ${userId}
        AND t.user_id IS NOT NULL
        AND r.ea_user_id = ${userId}
        AND r.client_user_id = t.user_id
      LIMIT 1
    `);
    return (r.rows?.length ?? 0) > 0;
  } catch (err) {
    logger.warn({ err, tripId }, "[ea-plan] grant read failed; denying");
    return false;
  }
}

export type EaMintRefusal =
  | { ok: false; status: 404; reason: "not_found" }
  | { ok: false; status: 409; reason: "not_accepted" };

export type EaPlanBasics = Pick<InsertTrip, "title" | "destination" | "startDate" | "endDate"> &
  Partial<Pick<InsertTrip, "numberOfTravelers" | "specialRequests">>;

/**
 * Mint a plan for an accepted client. The owner is the executive (from the relationship row, never
 * the body — §14); the two EA columns are written here and nowhere else.
 */
export async function mintPlanForEaClient(
  eaUserId: string,
  relationshipId: string,
  basics: EaPlanBasics,
): Promise<{ ok: true; trip: Trip } | EaMintRefusal> {
  const rel = await getEaClientRelationshipById(relationshipId, eaUserId);
  if (!rel) return { ok: false, status: 404, reason: "not_found" };
  if (!rel.clientUserId) return { ok: false, status: 409, reason: "not_accepted" };

  const trip = await storage.createTrip(
    {
      ...basics,
      userId: rel.clientUserId,
      managedByEaId: eaUserId,
      eaClientRelationshipId: rel.id,
    } as InsertTrip & { userId: string },
    // The assistant typed these dates for the executive; they are a person's choice, not a
    // placeholder the platform filled in (LD 30 amendment — the mint site states it).
    { datesChosenByTraveler: true },
  );

  // Ancillary: tell the executive a plan was started for them (§15b — never fails the mint).
  try {
    const assistant = await storage.getUser(eaUserId);
    const name = [assistant?.firstName, assistant?.lastName].filter(Boolean).join(" ") || "Your assistant";
    await storage.createNotification({
      userId: rel.clientUserId,
      type: "assistant_plan_created",
      title: "A plan was started for you",
      message: `${name} started a plan for you: ${trip.title}.`,
      relatedId: trip.id,
      relatedType: "trip",
      data: { tripId: trip.id, workspacePath: `/trip/${trip.id}` },
    } as any);
  } catch (err) {
    logger.warn({ err, tripId: trip.id }, "[ea-plan] owner notice failed (non-fatal)");
  }

  return { ok: true, trip };
}

export interface EaManagedPlanRow {
  id: string;
  title: string | null;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  finalizedAt: string | null;
  relationshipId: string;
  clientName: string | null;
}

/**
 * The plans this assistant manages under a LIVE accepted link (optionally one relationship).
 * A plan whose link was revoked drops out of the list, because the grant is gone too.
 */
export async function listEaManagedPlans(eaUserId: string, relationshipId?: string): Promise<EaManagedPlanRow[]> {
  const r = await db.execute(sql`
    SELECT t.id, t.title, t.destination,
           to_char(t.start_date, 'YYYY-MM-DD') AS "startDate", to_char(t.end_date, 'YYYY-MM-DD') AS "endDate",
           t.status, t.finalized_at AS "finalizedAt", r.id AS "relationshipId",
           COALESCE(NULLIF(r.display_name, ''), NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '')) AS "clientName"
    FROM trips t
    JOIN ea_client_relationships r ON r.id = t.ea_client_relationship_id
    LEFT JOIN users u ON u.id = r.client_user_id
    WHERE t.managed_by_ea_id = ${eaUserId}
      AND r.ea_user_id = ${eaUserId}
      AND r.client_user_id = t.user_id
      ${relationshipId ? sql`AND r.id = ${relationshipId}` : sql``}
    ORDER BY t.start_date NULLS LAST, t.created_at DESC
  `);
  return (r.rows ?? []) as unknown as EaManagedPlanRow[];
}
