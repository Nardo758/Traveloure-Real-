/**
 * contact-rails.pure.ts — the decisions the contact start rail makes that need no database.
 *
 * Ledger `2026-09-05-user-id-is-internal`, CLAUDE.md Locked Decision 40.
 *
 * Split out from `contact-rails.service.ts` on the `trip-destinations.pure.ts` /
 * `pending-events.pure.ts` precedent, precisely so the ownership rule below keeps its proof in an
 * environment where `DATABASE_URL` is unset. The rules here are the ones worth proving — who counts
 * as a party to a booking, and what a context row is called on screen — and both are pure functions
 * of rows the caller has already fetched.
 */
import type { ConversationContextKind } from "@shared/schema";

/** The subset of a `service_bookings` row the counterpart rule reads. */
export interface BookingParties {
  travelerId: string | null;
  providerId: string | null;
  /** `provider_services.user_id` for the booking's service, when it has one. */
  serviceOwnerId?: string | null;
}

/**
 * Who the OTHER party of a booking is, from the point of view of `sessionUserId`.
 *
 * Returns null when the caller is not a party to this booking AT ALL — which the route answers as a
 * 404, the same answer it gives for a booking id that does not exist (§13: "no such booking" and
 * "not your booking" are one sentence, so the rail cannot be used to probe which ids are real).
 *
 * The earner side is checked against BOTH `service_bookings.provider_id` and the service's own
 * `provider_services.user_id`. They are normally the same person; `provider_id` is denormalized and
 * `service_id` is nullable (the documented transport-commerce exception), so neither alone covers
 * every real booking, and accepting either is strictly more correct than picking one.
 *
 * The traveler check comes FIRST and returns the earner: a person who is somehow both (an earner
 * booking their own listing) has nobody to message, and falls out as null below rather than being
 * handed a thread with themself.
 */
export function resolveBookingCounterpart(
  booking: BookingParties,
  sessionUserId: string,
): string | null {
  const earnerId = booking.serviceOwnerId ?? booking.providerId ?? null;
  const travelerId = booking.travelerId ?? null;

  const callerIsTraveler = !!travelerId && travelerId === sessionUserId;
  const callerIsEarner =
    (!!earnerId && earnerId === sessionUserId) ||
    (!!booking.providerId && booking.providerId === sessionUserId);

  if (callerIsTraveler && callerIsEarner) return null; // nobody to message
  if (callerIsTraveler) return earnerId;
  if (callerIsEarner) return travelerId;
  return null;
}

/** A context row as a client reads it. `label` is resolved server-side, never restated by a client. */
export interface ConversationContextView {
  kind: ConversationContextKind;
  id: string;
  label: string;
}

/**
 * The on-screen name of one context row.
 *
 * §13: `name` is what the server could actually resolve — a service that has since been deleted, or
 * a booking whose short reference is missing, has NO name, and the label then says what KIND of
 * thing the thread is about without inventing a title for it. It never renders "Unknown service",
 * which claims the platform looked and found a service called nothing.
 */
export function contextLabel(
  kind: ConversationContextKind,
  contextId: string,
  name?: string | null,
): string {
  if (kind === "storefront") return `@${name ?? contextId}`;
  if (kind === "service") return name ? name : "A service listing";
  return name ? `Booking ${name}` : "A booking";
}
