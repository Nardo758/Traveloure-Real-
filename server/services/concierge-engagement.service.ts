/**
 * Concierge accept grants plan access until the end of the trip's last day.
 * Decline and the accept-window timeout end that access. The payment path is
 * the existing owner decline: a captured charge is refunded, not held.
 */
import { conciergeAccessUntil } from "@shared/concierge-access";
import { upsertTripAdvisorRow, type TripAdvisorRowExecutor } from "./booking-actions.service";
import { db } from "../db";
import { tripExpertAdvisors, trips } from "@shared/schema";
import { and, eq } from "drizzle-orm";

/**
 * Part of the concierge accept, not a side effect of it: the accept route runs this on the status
 * flip's own transaction (`tx`), so a failure here (an unroutable expert, the trip gone) rolls the
 * accept back and the error reaches the caller. It throws; it never swallows.
 */
export async function grantConciergeAdvisorOnAccept(input: {
  tripId: string;
  localExpertId: string;
  tx?: TripAdvisorRowExecutor;
}): Promise<void> {
  const exec = (input.tx ?? db) as typeof db;
  const [trip] = await exec
    .select({ endDate: trips.endDate, timezone: trips.timezone })
    .from(trips)
    .where(eq(trips.id, input.tripId))
    .limit(1);
  if (!trip) throw new Error(`concierge accept: trip ${input.tripId} not found`);
  await upsertTripAdvisorRow({
    tripId: input.tripId,
    localExpertId: input.localExpertId,
    status: "accepted",
    source: "concierge",
    accessUntil: conciergeAccessUntil(trip.endDate, trip.timezone),
    tx: input.tx,
  });
}

/** Ends a concierge engagement's access. A handoff row is left alone. */
export async function endConciergeAdvisorAccess(
  tripId: string | null | undefined,
  expertId: string | null | undefined,
  now: Date = new Date(),
): Promise<void> {
  if (!tripId || !expertId) return;
  await db
    .update(tripExpertAdvisors)
    .set({ accessUntil: now })
    .where(
      and(
        eq(tripExpertAdvisors.tripId, tripId),
        eq(tripExpertAdvisors.localExpertId, expertId),
        eq(tripExpertAdvisors.source, "concierge"),
      ),
    );
}
