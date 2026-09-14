/**
 * THE VIEWER'S OWN TRANSPORT BOOKING, FOR A TRANSPORT OPTION.
 *
 * Ledger `2026-09-14-transport-card-cancel`; punchlist R-2. CLAUDE.md §13, §14 (reads), §18 rule 1.
 *
 * WHY THIS EXISTS. A platform transport option is bought through hosted Stripe Checkout, which
 * mints an ordinary `service_bookings` row — `service_id` NULL (the documented transport-commerce
 * exception), `booking_details.bookingType = 'transport'`, `booking_details.optionId` naming the
 * option. That jsonb key is the ONLY link back: `transport_booking_options.booking_id` is an
 * unrelated integer column platform options never populate, and
 * `transport_booking_options.booking_status` is the OPTION's own vocabulary
 * (`available|booked|confirmed|cancelled`), not the booking's.
 *
 * So the transport card had no way to ADDRESS its own booking, which is why it carried no cancel
 * control at all (R-2). This resolves the address server-side and nothing else: the id the
 * existing `POST /api/bookings/:id/cancel` takes, and the booking status that route's own
 * from-state list is read against. No amount, no fee, no rate, no policy — the money statement
 * stays entirely with `cancellation-policy.service.ts` and the cancel/preview routes (§14).
 *
 * §14 APPLIED TO A READ — THE VIEWER IS THE SESSION, NEVER A PARAM. The transport hub is
 * authorized for the owner, an assigned expert, an author or an audit-logged admin
 * (`authorizeTripLogistics`), which is the right set for READING a plan's transport. A BOOKING,
 * though, belongs to exactly one traveler, and `POST /api/bookings/:id/cancel` answers 404 to
 * anyone else. This reader is therefore scoped to the SESSION user's own rows, so a non-traveler
 * viewer of the same hub simply gets no booking back and the card renders no control — the same
 * answer the route would give, arrived at before the button is drawn rather than after.
 *
 * §13 — WHICH ROW, WHEN THERE ARE SEVERAL. A traveler who cancels and re-books the same option
 * has two rows. The MOST RECENTLY CREATED one is the live booking, and it is the one returned;
 * an older cancelled row is history, not the current state. Nothing here merges them, invents a
 * "latest status" across them, or hides a cancelled newest row behind an older confirmed one.
 *
 * NEGATIVE SPACE. This says nothing about whether a cancellation refunds anything, nothing about
 * the transport OPTION's own `booking_status` (cancelling a booking does not flip it, and this
 * lane does not start doing so), and nothing about affiliate/deep-link options, which are
 * fulfilled through the booking-agent rail (§16) and mint no `service_bookings` row here.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { pgTextArray } from "./upsell-query.service";

export interface ViewerTransportBooking {
  /** `service_bookings.id` — exactly the id `POST /api/bookings/:id/cancel` takes. */
  bookingId: string;
  /** `service_bookings.status`, verbatim. Read against the shared from-state list, never remapped. */
  status: string;
}

/**
 * Resolves, for each supplied transport option id, the SESSION user's own transport booking of
 * that option — or nothing, which is the common case and is not an error.
 */
export async function resolveViewerTransportBookings(
  optionIds: readonly string[],
  travelerId: string | null | undefined,
): Promise<Map<string, ViewerTransportBooking>> {
  const out = new Map<string, ViewerTransportBooking>();
  if (!travelerId) return out;
  const ids = Array.from(new Set(optionIds.filter((id): id is string => typeof id === "string" && id.length > 0)));
  if (ids.length === 0) return out;

  const rows = await db.execute(sql`
    SELECT id, status, booking_details->>'optionId' AS option_id, created_at
    FROM service_bookings
    WHERE traveler_id = ${travelerId}
      AND booking_details->>'bookingType' = 'transport'
      AND booking_details->>'optionId' = ANY(${pgTextArray(ids)}::text[])
    ORDER BY created_at DESC NULLS LAST
  `);

  for (const row of rows.rows as Array<{ id: string; status: string | null; option_id: string | null }>) {
    if (!row.option_id || out.has(row.option_id)) continue; // ORDER BY DESC ⇒ the first seen is the newest
    out.set(row.option_id, { bookingId: row.id, status: row.status ?? "" });
  }
  return out;
}
