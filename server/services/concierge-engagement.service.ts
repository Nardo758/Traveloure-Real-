/**
 * Concierge accept grants plan access until the end of the trip's last day.
 * Decline and the accept-window timeout end that access. The payment path is
 * the existing owner decline: a captured charge is refunded, not held.
 */
import { conciergeAccessUntil } from "@shared/concierge-access";
import { upsertTripAdvisorRow } from "./booking-actions.service";
import { db } from "../db";
import { tripExpertAdvisors } from "@shared/schema";
import { and, eq } from "drizzle-orm";

export async function grantConciergeAdvisorOnAccept(input: {
  tripId: string;
  localExpertId: string;
  endDate: string | Date | null | undefined;
  timezone: string | null | undefined;
}): Promise<void> {
  await upsertTripAdvisorRow({
    tripId: input.tripId,
    localExpertId: input.localExpertId,
    status: "accepted",
    source: "concierge",
    accessUntil: conciergeAccessUntil(input.endDate, input.timezone),
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
