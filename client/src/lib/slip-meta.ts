/**
 * slip-meta — the slip header's two meta lines: WHERE this plan goes, and WHICH ZONE its times
 * are read in.
 *
 * Ledger `2026-09-06-slip-small-additions` (CLAUDE.md Locked Decision 42, build-order row 1.3,
 * S6 + S7); the ratified `slip-canvas/gen.py` `header()` artboard, which draws them as one line:
 * `Kyoto → Osaka  |  Times shown in Asia/Tokyo  ·  Edit ›`. CLAUDE.md §13, §18 rule 1, Locked
 * Decisions 30 and 34.
 *
 * WHY A MODULE. Both lines are §13 rules first and presentation second, and both have an ABSENT
 * state that is a finished answer rather than a loading state. Written inline in JSX they would be
 * two ternaries nobody could test without a DOM; written here they keep their proof in the pure
 * lane and cannot be restated by a second surface that wants the same line.
 *
 * NEGATIVE SPACE, stated as the guard registry habit requires of a client module too:
 *  - nothing here READS or WRITES stops. `client/src/lib/plan-stops-writer.ts` is the ONE client
 *    writer (Locked Decision 34) and this module never calls it; the header's Edit affordance
 *    opens the ONE plan modal, whose step 2 is the ordered-list editor — a second list editor
 *    beside it is exactly what that ruling forbids.
 *  - nothing here geocodes, orders or measures. `stopSequence` (`plan-stops.ts`) joins names with
 *    an arrow and computes no distance, duration or route (Locked Decision 22(c)); this module
 *    only decides WHETHER there is a sequence worth printing.
 *  - nothing here decides whether the viewer may edit. That is the caller's owner gate (D16).
 */
import { seedStops, stopSequence, type PlanStop } from "@/lib/plan-stops";

/** The `destinations` rows as the plancard payload ships them (Locked Decision 34, migration 281). */
export interface SlipDestinationRow {
  name?: string | null;
  city?: string | null;
  country?: string | null;
  lat?: string | number | null;
  lng?: string | number | null;
}

/**
 * THE STOPS LINE — "Kyoto → Osaka → Tokyo", or the plan's headline destination alone.
 *
 * §13 / Locked Decision 34 — ZERO ROWS MEANS NOT CAPTURED, NOT "no stops". There is no backfill of
 * `trip_destinations` (deliberately: manufacturing a position-0 row for every legacy plan would
 * turn "we never asked" into "the traveler said one stop"), so a plan with no child rows FALLS
 * BACK EXPLICITLY to `trips.destination` — the position-0 mirror — exactly as that ruling requires
 * of every reader. The fallback is done by `seedStops`, the SAME helper the plan modal's step 2
 * seeds its editor from, so the line and the editor can never disagree about what this plan
 * currently says (§18 rule 1).
 *
 * Returns `null` when the plan names nowhere at all. `trips.destination` is NOT NULL so that is
 * not a state a real plan can be in, but a DTO that has not loaded reaches this function too, and
 * an empty string must render NOTHING rather than an empty arrow-joined line.
 */
export function slipStopsLine(
  destination: string | null | undefined,
  destinations?: readonly SlipDestinationRow[] | null,
): string | null {
  const stops: PlanStop[] = seedStops(destination, destinations ? [...destinations] : null);
  const line = stopSequence(stops);
  return line.length > 0 ? line : null;
}

/**
 * Is this plan's stop list something the traveler actually stated, or only the mirror?
 *
 * Used by the caller to decide nothing about VISIBILITY — the line renders either way — but it is
 * the honest answer to "did they name more than one place", which is the only thing that makes the
 * arrow sequence meaningful. §13: one named stop is not a route and must not be presented as one.
 */
export function slipHasMultipleStops(
  destination: string | null | undefined,
  destinations?: readonly SlipDestinationRow[] | null,
): boolean {
  const stops = seedStops(destination, destinations ? [...destinations] : null);
  return stops.filter((s) => s.name.trim() !== "").length > 1;
}

/** The words the zone line uses. Stated once so the surface never spells it a second way. */
export const SLIP_ZONE_PREFIX = "Times shown in" as const;

/**
 * THE ZONE LINE — "Times shown in Asia/Tokyo", or NOTHING.
 *
 * Locked Decision 30: `trips.timezone` is ONE IANA zone per plan, server-derived at mint from the
 * destination through the launch-market lookup, and **NULL MEANS NOT CAPTURED**. That ruling is
 * explicit about what a reader does with a NULL — it keeps its zone-free behaviour and says the
 * reason out loud; it never substitutes UTC, the server's zone or a nearest guess, "because a
 * wrong zone is worse than an honest floating time: it looks authoritative".
 *
 * So this returns `null` for an absent, empty or non-string zone and the caller renders no line at
 * all. It deliberately does NOT validate the value against a zone database: the column's value set
 * is app-enforced by `resolveTripTimezone` on the write side (there is no DB CHECK, the publish-trap
 * posture), and a second opinion here about which zones are real would be a second authority.
 */
export function slipZoneLine(timezone: string | null | undefined): string | null {
  const zone = typeof timezone === "string" ? timezone.trim() : "";
  return zone.length > 0 ? `${SLIP_ZONE_PREFIX} ${zone}` : null;
}

/**
 * THE TWO LINES AS ONE ROW META — "Kyoto → Osaka · Times shown in Asia/Tokyo".
 *
 * Ledger `2026-09-06-slip-conformance`. The rail's Plan card carries a "Stops & timezone" row
 * whose meta says what this plan currently answers to both questions. It COMPOSES the two lines
 * the header already renders and restates NEITHER (§18 rule 1): a second phrasing of the zone here
 * is exactly how the row and the header would start disagreeing about the same column.
 *
 * §13 — the absences carry through unchanged. A plan with no captured zone shows the stops alone
 * (never "no timezone", never UTC); a DTO that has not loaded shows nothing at all and the caller
 * renders the row with no meta rather than an empty separator. Returns `null` when neither line
 * exists, which is the caller's signal to say nothing.
 */
export function slipPlanMetaLine(
  stopsLine: string | null,
  zoneLine: string | null,
): string | null {
  const parts = [stopsLine, zoneLine].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length > 0 ? parts.join(" · ") : null;
}
