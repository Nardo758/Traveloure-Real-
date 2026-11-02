/**
 * Concierge accept grants plan access until the end of the trip's last day.
 * Decline and the accept-window timeout end that access. The payment path is
 * the existing owner decline: a captured charge is refunded, not held.
 */
import { conciergeAccessUntil } from "@shared/concierge-access";
import { upsertTripAdvisorRow, type TripAdvisorRowExecutor } from "./booking-actions.service";
import { db } from "../db";
import { tripExpertAdvisors, trips } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

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

/**
 * The traveler's in-app notice when a concierge hire is CHARGED and now awaits the expert (Architect
 * ruling on #1852, Nov 2, 2026). WORDING HELD for owner approval; every word is here and nowhere else.
 * `{hours}` is CONCIERGE_ACCEPT_HOURS; when that is unset the first sentence of the message is omitted
 * (there is no window to state, and none is invented — §13). No email.
 */
export const CONCIERGE_HIRE_CHARGED_COPY = {
  /** HELD (pending Leon). */
  title: "You're charged — awaiting {name}'s answer",
  /** HELD (pending Leon). The first sentence is dropped when the window is unset. */
  windowSentence: "{name} has {hours} hours to accept.",
  /** HELD (pending Leon). */
  refundSentence: "If they can't take this trip, you get a full refund.",
} as const;

export const CONCIERGE_HIRE_CHARGED_TYPE = "concierge_hire_charged";

export function conciergeHireChargedNotice(
  name: string,
  hours: number | null,
): { title: string; message: string } {
  const title = CONCIERGE_HIRE_CHARGED_COPY.title.replace("{name}", name);
  const window = hours === null
    ? null
    : CONCIERGE_HIRE_CHARGED_COPY.windowSentence.replace("{name}", name).replace("{hours}", String(hours));
  return { title, message: window ? `${window} ${CONCIERGE_HIRE_CHARGED_COPY.refundSentence}` : CONCIERGE_HIRE_CHARGED_COPY.refundSentence };
}

/**
 * Sent once per booking (dedupe `booking:<id>:concierge_hire_charged`) after the promotion that landed a
 * paid concierge booking in `pending` has committed. Never throws into the promotion (§15b): a failed
 * notice is logged and the booking stands. A traveler or expert name that cannot be read sends nothing
 * rather than a sentence with a hole in it.
 */
export async function notifyConciergeHireCharged(bookingId: string): Promise<{ inserted: boolean }> {
  const { storage } = await import("../storage");
  const { conciergeAcceptHours } = await import("./concierge-accept-timeout.service");
  const r = await db.execute(sql`
    SELECT sb.traveler_id, u.first_name
    FROM service_bookings sb
    JOIN provider_services ps ON ps.id = sb.service_id
    JOIN users u ON u.id = ps.user_id
    WHERE sb.id = ${bookingId}
  `);
  const row = r.rows[0] as { traveler_id: string | null; first_name: string | null } | undefined;
  const name = row?.first_name?.trim();
  if (!row?.traveler_id || !name) return { inserted: false };
  const { title, message } = conciergeHireChargedNotice(name, conciergeAcceptHours());
  return storage.createNotificationOnce({
    userId: row.traveler_id,
    type: CONCIERGE_HIRE_CHARGED_TYPE,
    title,
    message,
    relatedId: bookingId,
    relatedType: "booking",
    data: { bookingId },
    dedupeKey: `booking:${bookingId}:${CONCIERGE_HIRE_CHARGED_TYPE}`,
  } as any);
}
