/**
 * PAY-1 §4 (ledger `2026-10-15-pay1-payment-checks`) — the transport option of a booking the admin
 * resolves as confirmed. Its own file so the webhook handler in `stripe.service.ts` stays the only
 * option promotion that file holds; it reads the SAME from-state list, declared there once.
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { transportBookingOptions } from "@shared/schema";
import { TRANSPORT_OPTION_PROMOTABLE_FROM } from "./stripe.service";

/**
 * PAY-1 §4 — the admin Resolve confirms a held transport booking's option inside the SAME transaction
 * as the booking's flip. Same from-state list and same statement shape as the webhook's option
 * promotion in `stripe.service.ts` (§18 rule 1): NULL or `available`/`booked` only, so a cancelled option is never
 * resurrected and a confirmed one is a no-op.
 */
export async function promoteTransportOptionForResolvedBooking(
  tx: Pick<typeof db, "update" | "select">,
  optionId: string,
): Promise<{ promoted: boolean; bookingStatus: string | null }> {
  const [promoted] = await tx
    .update(transportBookingOptions)
    // Status only. `transport_booking_options.booking_id` is an INTEGER and a transport booking id is
    // `booking-<epoch ms>-<rand>`, so the webhook's `parseInt(bookingId.split("-")[1])` is out of int4
    // range for every real id — recorded as a finding, not repeated here.
    .set({ bookingStatus: "confirmed" })
    .where(
      and(
        eq(transportBookingOptions.id, optionId),
        or(
          isNull(transportBookingOptions.bookingStatus),
          inArray(transportBookingOptions.bookingStatus, [...TRANSPORT_OPTION_PROMOTABLE_FROM]),
        ),
      ),
    )
    .returning({ id: transportBookingOptions.id });
  if (promoted) return { promoted: true, bookingStatus: "confirmed" };
  const [current] = await tx
    .select({ bookingStatus: transportBookingOptions.bookingStatus })
    .from(transportBookingOptions)
    .where(eq(transportBookingOptions.id, optionId))
    .limit(1);
  return { promoted: false, bookingStatus: current?.bookingStatus ?? null };
}

