/**
 * THE READ SCOPE FOR A TRAVELER'S OWN BOOKINGS LIST (`GET /api/my-bookings`).
 *
 * Ledger `2026-09-07-bookings-by-plan`; brief §11.2 finding F10 — "Bookings rows name no service,
 * provider or plan; the Trips tab never cross-links". The row shipped as the bare
 * `service_bookings` record, so the surface could only ever render an amount, a status and a date.
 *
 * WHY THIS IS AN ALLOWLIST AND NOT A HAND-COPIED OBJECT LITERAL
 * ────────────────────────────────────────────────────────────
 * Ledger `2026-09-05-experts-public-projection` (CLAUDE.md §14's read clause, §19's posture applied
 * to a RESPONSE): a user-row response is an allowlist that is MECHANICALLY TRUE, and a denylist is
 * not a projection. The sibling route `GET /api/service-bookings` composes its provider object by
 * hand — `{ id, firstName, lastName, profileImage }` — and `profileImage` is not a `users` column
 * at all (the column is `profileImageUrl`), so that key has been silently `undefined` for its whole
 * life. That is precisely what a hand-copied literal buys: nothing checks it.
 *
 * So each allowlist below is CHECKED AGAINST THE DRIZZLE TABLE at module load with
 * `getTableColumns` (§18 rule 1 — the schema is the authority, this file never restates it). A name
 * that is not a real column throws on boot instead of shipping an always-absent key, and a column
 * added to any of the three tables tomorrow is NOT published, because it is not named here.
 *
 * WHAT IS DELIBERATELY ABSENT
 * ───────────────────────────
 *   • The provider's `users.id`. Locked Decision 40: `users.id` is INTERNAL and an earner's public
 *     identity is the HANDLE. Contact from a booking is already addressed by `{ bookingId }`
 *     (LD 40 lane 3, `useAskExpert`), so nothing on this surface needs the id — and the handle,
 *     when the earner has claimed one, is what links to their storefront.
 *   • The provider's `email` / payout / Stripe family, and every `local_expert_forms` field. A
 *     booking row names WHO delivered the service; it is not a profile read.
 *   • Anything money-shaped that is not already on the booking row itself. This lane changes no
 *     amount, no fee and no status (§14/§15 untouched).
 *
 * §13 — ABSENCE IS AN ANSWER. A booking whose service or provider row is gone (both FKs are
 * `ON DELETE cascade`/`set null` shaped, and a row really can vanish) projects to `null`, never to
 * an empty object and never to an invented name; the client renders what it has and says the rest
 * is unavailable. The same holds for the trip: a booking with no `trip_id` is NOT on a plan, which
 * is a real and common state, not a missing lookup.
 */

import { getTableColumns } from "drizzle-orm";
import { providerServices, trips, users } from "@shared/schema";
import { getDisplayName, pickPublicFields } from "./data-sanitizer";

/**
 * The `provider_services` columns a booking row publishes: enough to NAME the thing that was
 * bought and how it is delivered. No price (the booking carries the amount actually charged), no
 * `revenueShareRate` (a §18 rate), no owner id, no operational blob.
 */
export const BOOKING_SERVICE_FIELDS = [
  "id",
  "serviceName",
  "serviceType",
  "deliveryMethod",
  "location",
] as const;

/**
 * The `users` columns a booking row publishes for the PROVIDER. `id` is absent by ruling (LD 40 —
 * see the header); `handle` is the public identity and is the only linkable one.
 */
export const BOOKING_PROVIDER_FIELDS = [
  "firstName",
  "lastName",
  "handle",
  "profileImageUrl",
] as const;

/**
 * The `trips` columns a booking row publishes for the PLAN it belongs to — the grouping header and
 * the link back to the slip. Not the plan's contents, not its party, not its notes.
 */
export const BOOKING_TRIP_FIELDS = ["id", "title", "destination", "startDate", "endDate"] as const;

/**
 * Boot-time proof that each allowlist names REAL columns. This is the mechanical half: without it
 * an allowlist is just another hand-copied literal that nobody re-reads (see the `profileImage`
 * note in the header).
 */
function assertColumns(label: string, table: any, names: readonly string[]): void {
  const columns = new Set(Object.keys(getTableColumns(table)));
  const unknown = names.filter((n) => !columns.has(n));
  if (unknown.length > 0) {
    throw new Error(`booking-read-scope: ${label} names non-columns: ${unknown.join(", ")}`);
  }
}
assertColumns("BOOKING_SERVICE_FIELDS", providerServices, BOOKING_SERVICE_FIELDS);
assertColumns("BOOKING_PROVIDER_FIELDS", users, BOOKING_PROVIDER_FIELDS);
assertColumns("BOOKING_TRIP_FIELDS", trips, BOOKING_TRIP_FIELDS);

/** The service a booking names, or `null` when the listing row is gone (§13). */
export function toBookingService(row: unknown): Record<string, any> | null {
  if (!row || typeof row !== "object") return null;
  return pickPublicFields(row as any, BOOKING_SERVICE_FIELDS as any) as Record<string, any>;
}

/**
 * The provider a booking names, or `null` when the account row is gone (§13).
 * `displayName` is composed by the SHARED `getDisplayName` (§18 rule 1) — the same spelling every
 * other surface uses — and is the only key here that is not a raw column.
 */
export function toBookingProvider(row: unknown): Record<string, any> | null {
  if (!row || typeof row !== "object") return null;
  const picked = pickPublicFields(row as any, BOOKING_PROVIDER_FIELDS as any) as Record<string, any>;
  return {
    ...picked,
    displayName: getDisplayName((row as any).firstName, (row as any).lastName),
  };
}

/** The plan a booking belongs to, or `null` when it belongs to none / to someone else's (§13). */
export function toBookingTrip(row: unknown): Record<string, any> | null {
  if (!row || typeof row !== "object") return null;
  return pickPublicFields(row as any, BOOKING_TRIP_FIELDS as any) as Record<string, any>;
}
