/**
 * E1 — the `trip_created` (T2) funnel row's door properties (ledger `2026-09-28-a0-slice-spec`;
 * docs/planning/slip-funnel-events.md §3.1). PURE: no db, no storage, no request object, so the
 * whole admission decision is provable by a node:test with no database.
 *
 * `POST /api/trips` hands its raw body to `splitTripMintBody` BEFORE the trip schema sees it:
 *   - `tripBody` is the body with `entry` REMOVED — the only thing the trip insert may parse. The
 *     trip schema (`tripClientBodySchema`) is a non-strict pick and would strip `entry` anyway;
 *     removing it here makes "the insert never receives `entry`" a property of this function
 *     rather than of a schema default somebody may later tighten or loosen (§19).
 *   - `entry` is `tripMintEntrySchema` (`.strict()`) applied to the raw `entry` value. A refusal —
 *     an unknown door, an extra key, a non-object — yields `null` and `entryRefused: true`, and the
 *     event then records NOTHING client-supplied. It never fails the mint.
 *
 * `tripCreatedEventData` builds the properties: `door` / `occasionSource` only when the client
 * named them (client-supplied, §13 — absent is omitted, never `none`), `datesConfirmed` from the
 * mint's OWN `datesChosenByTraveler` (server fact), and `market` from the created row, omitted
 * when NULL. The actor is not here at all: `trackFunnelEvent`'s `userId` is the session (§14).
 */
import { tripMintEntrySchema, type TripMintEntry } from "@shared/slip-funnel-events";

export interface SplitTripMintBody {
  tripBody: Record<string, unknown>;
  entry: TripMintEntry | null;
  /** An `entry` was sent and refused by the `.strict()` pick. */
  entryRefused: boolean;
}

export function splitTripMintBody(body: unknown): SplitTripMintBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { tripBody: (body ?? {}) as Record<string, unknown>, entry: null, entryRefused: false };
  }
  const { entry: rawEntry, ...tripBody } = body as Record<string, unknown>;
  if (rawEntry === undefined) return { tripBody, entry: null, entryRefused: false };
  const parsed = tripMintEntrySchema.safeParse(rawEntry);
  if (!parsed.success) return { tripBody, entry: null, entryRefused: true };
  return { tripBody, entry: parsed.data, entryRefused: false };
}

export function tripCreatedEventData(input: {
  entry: TripMintEntry | null;
  datesChosenByTraveler: boolean;
  marketSlug?: string | null;
}): Record<string, unknown> {
  const data: Record<string, unknown> = { datesConfirmed: input.datesChosenByTraveler };
  if (input.entry?.door) data.door = input.entry.door;
  if (input.entry?.occasionSource) data.occasionSource = input.entry.occasionSource;
  if (typeof input.marketSlug === "string" && input.marketSlug.length > 0) data.market = input.marketSlug;
  return data;
}
